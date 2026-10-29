import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { REPOSITORY, planRetention, renderReport, validateArtifacts, validateRepository } from './actions-artifact-policy.mjs';

// Deliberately no arbitrary API URL/repository option and no release/code/cache write endpoint.
export function githubClient(token, fetchImpl = fetch) {
  if (!token) throw new Error('GH_TOKEN is required for the GitHub API');
  return async function request(method, path) {
    if (!['GET', 'DELETE'].includes(method) || !path.startsWith(`/repos/${REPOSITORY}/`)
      || path.includes('..') || (method === 'DELETE' && !new RegExp(`^/repos/${REPOSITORY}/actions/artifacts/[1-9][0-9]*$`).test(path))) {
      throw new Error('Disallowed GitHub API operation');
    }
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'RolVixa-artifact-retention' },
      });
    } catch { throw new Error(`GitHub ${method} failed (network/timeout); no further mutations`); }
    // Never echo API bodies, tokens or signed download URLs.
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}; stopped`);
    return response.status === 204 ? null : response.json();
  };
}

export async function paginate(api, path, key) {
  const output = [], ids = new Set();
  let expected;
  for (let page = 1; page <= 10_000; page++) {
    const result = await api('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const items = key ? result?.[key] : result;
    if (!Array.isArray(items) || items.length > 100) throw new Error('Invalid paginated response');
    if (key) {
      if (!Number.isSafeInteger(result.total_count) || result.total_count < 0) throw new Error('Missing total_count');
      expected ??= result.total_count;
      if (expected !== result.total_count) throw new Error('Inventory changed during pagination; rerun dry-run');
    }
    for (const item of items) {
      const id = item.id ?? item.name; // Tags expose a name rather than numeric ID.
      if (id == null || ids.has(id)) throw new Error('Repeated item/page; refusing incomplete inventory');
      ids.add(id); output.push(item);
    }
    if (items.length < 100 || (key && output.length === expected)) {
      if (key && output.length !== expected) throw new Error('Truncated inventory');
      return output;
    }
  }
  throw new Error('Pagination limit exceeded');
}

async function releaseCommits(api) {
  const releases = await paginate(api, `/repos/${REPOSITORY}/releases`);
  if (!releases.length) return [];
  const tags = await paginate(api, `/repos/${REPOSITORY}/tags`);
  const result = [];
  for (const release of releases) {
    const sha = tags.find(t => t.name === release.tag_name)?.commit?.sha;
    // GitHub tags list resolves annotated tags to their commit. Missing tag => no deletions.
    if (!/^[a-f0-9]{40}$/i.test(sha ?? '')) throw new Error('Cannot verify release source commit');
    result.push(sha);
  }
  return result;
}

export async function collectSnapshot(api, repository = REPOSITORY, onlyRunId = null) {
  validateRepository(repository);
  const artifacts = await paginate(api, `/repos/${repository}/actions/artifacts`, 'artifacts');
  validateArtifacts(artifacts);
  const releaseCommitShas = await releaseCommits(api);
  const runs = [];
  const ids = new Set(artifacts.map(a => a.workflow_run?.id).filter(Number.isSafeInteger));
  for (const id of ids) {
    if (onlyRunId !== null && onlyRunId !== id) continue;
    const run = await api('GET', `/repos/${repository}/actions/runs/${id}`);
    if (run?.id !== id || run.repository?.full_name !== repository) throw new Error('Run repository/ID mismatch');
    runs.push({ id: run.id, status: run.status, head_sha: run.head_sha });
  }
  return { repository, artifacts, runs, releaseCommitShas };
}

export function parseArgs(args, env) {
  const options = { execute: false, snapshot: null, output: 'artifact-retention' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--execute') options.execute = true;
    else if (['--snapshot', '--output'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const name = args[i].slice(2);
      options[name] = args[++i];
    }
    else throw new Error('Usage: node scripts/actions-artifact-cleanup.mjs [--snapshot file.json] [--output prefix] [--execute]');
  }
  validateRepository(env.GITHUB_REPOSITORY ?? REPOSITORY);
  if (options.execute && (options.snapshot || env.ROLVIXA_ARTIFACT_CLEANUP_ENABLED !== 'true'
    || env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main'
    || !['workflow_dispatch', 'schedule'].includes(env.GITHUB_EVENT_NAME))) {
    throw new Error('Execution disabled: explicit approval gate, main, live inventory and trusted event required');
  }
  return options;
}

function unchanged(a, b) {
  return a.id === b.id && a.name === b.name && a.created_at === b.created_at
    && a.size_in_bytes === b.size_in_bytes && a.workflow_run?.id === b.workflow_run?.id;
}

// Called only after the CLI/workflow approval gates. Recheck live policy before EACH deletion.
export async function executePlan(api, initialReport, onDeleted = () => {}, env = process.env) {
  parseArgs(['--execute'], env);
  validateRepository(initialReport.repository);
  const deleted = [], skipped = [];
  for (const candidate of initialReport.entries.filter(a => a.action === 'would-delete')) {
    // All artifacts still determine the global latest-three rule. Only the candidate's
    // run needs refreshing; all other runs are conservatively unverified in this plan.
    const snapshot = await collectSnapshot(api, REPOSITORY, candidate.runId);
    const current = planRetention(snapshot).entries.find(a => a.id === candidate.id);
    if (!current || current.action !== 'would-delete' || current.name !== candidate.name
      || current.createdAt !== candidate.createdAt || current.bytes !== candidate.bytes || current.runId !== candidate.runId) {
      skipped.push(candidate.id); continue;
    }
    const latest = await api('GET', `/repos/${REPOSITORY}/actions/artifacts/${candidate.id}`);
    validateArtifacts([latest]);
    const original = snapshot.artifacts.find(a => a.id === candidate.id);
    if (!unchanged(original, latest) || latest.expired) { skipped.push(candidate.id); continue; }
    const run = await api('GET', `/repos/${REPOSITORY}/actions/runs/${current.runId}`);
    if (run.id !== current.runId || run.repository?.full_name !== REPOSITORY
      || run.status !== 'completed' || run.head_sha !== snapshot.runs.find(r => r.id === run.id)?.head_sha) {
      skipped.push(candidate.id); continue;
    }
    await api('DELETE', `/repos/${REPOSITORY}/actions/artifacts/${candidate.id}`);
    deleted.push(candidate.id);
    await onDeleted(candidate); // Durable log after every successful deletion, including partial failures.
  }
  return { deleted, skipped };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const options = parseArgs(args, env);
  const api = options.snapshot ? null : githubClient(env.GH_TOKEN);
  const snapshot = options.snapshot ? JSON.parse(await readFile(options.snapshot, 'utf8')) : await collectSnapshot(api);
  const report = planRetention(snapshot);
  const markdown = renderReport(report);
  await writeFile(`${options.output}.json`, JSON.stringify(report, null, 2) + '\n');
  await writeFile(`${options.output}.md`, markdown);
  // Full inventory is in the downloadable report; a bounded summary fits GitHub's step-summary limit.
  const summary = markdown.split('\n').slice(0, 15).join('\n') + '\n\nPełna lista: artefakt Actions-retention-report.\n';
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary);
  console.log(JSON.stringify({ ...report.totals, mode: report.mode, report: `${options.output}.md` }));
  if (options.execute) {
    await writeFile(`${options.output}-deleted.jsonl`, '');
    const result = await executePlan(api, report, a => appendFile(`${options.output}-deleted.jsonl`, JSON.stringify(a) + '\n'), env);
    await writeFile(`${options.output}-execution.json`, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ mode: 'execute', ...result }));
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

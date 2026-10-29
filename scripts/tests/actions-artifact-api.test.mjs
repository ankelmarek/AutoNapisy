import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPOSITORY, DAY, planRetention } from '../actions-artifact-policy.mjs';
import { collectSnapshot, executePlan, githubClient, main, paginate, parseArgs } from '../actions-artifact-cleanup.mjs';

const prefix = `/repos/${REPOSITORY}`;
const sha = 'a'.repeat(40);
const approval = { GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch', ROLVIXA_ARTIFACT_CLEANUP_ENABLED: 'true' };
const a = (id, name = 'UI-captures') => ({ id, name, expired: false, size_in_bytes: 100,
  created_at: new Date(Date.now() - 10 * DAY - id).toISOString(), workflow_run: { id } });
const r = id => ({ id, status: 'completed', head_sha: sha, repository: { full_name: REPOSITORY } });
function fake(items, change = () => {}) {
  const calls = [];
  const api = async (method, path) => {
    calls.push([method, path]);
    const replacement = await change(method, path, calls);
    if (replacement !== undefined) return replacement;
    if (path.includes('/actions/artifacts?')) return { artifacts: items, total_count: items.length };
    if (path.startsWith(prefix + '/releases?')) return [];
    if (path.startsWith(prefix + '/tags?')) return [];
    const run = path.match(/\/actions\/runs\/(\d+)$/);
    if (run) return r(Number(run[1]));
    const artifact = path.match(/\/actions\/artifacts\/(\d+)$/);
    if (artifact && method === 'GET') return items.find(a => a.id === Number(artifact[1]));
    if (artifact && method === 'DELETE') return null;
    throw new Error(`Unexpected fake operation: ${method} ${path}`);
  };
  return { api, calls };
}
const report = items => planRetention({ repository: REPOSITORY, artifacts: items,
  runs: items.map(a => r(a.id)), releaseCommitShas: [] });

test('paginates over 100 artifacts and preserves all pages', async () => {
  const all = Array.from({ length: 205 }, (_, i) => a(i + 1));
  const calls = [];
  const result = await paginate(async (_, path) => {
    const page = Number(new URL('https://example.test' + path).searchParams.get('page')); calls.push(page);
    return { total_count: all.length, artifacts: all.slice((page - 1) * 100, page * 100) };
  }, prefix + '/actions/artifacts', 'artifacts');
  assert.equal(result.length, 205); assert.deepEqual(calls, [1, 2, 3]);
});
test('zero artifacts returns a valid empty inventory', async () => {
  assert.deepEqual(await paginate(async () => ({ total_count: 0, artifacts: [] }), prefix + '/actions/artifacts', 'artifacts'), []);
});
test('exact 100-element uncounted pages fetch the next page', async () => {
  let n = 0;
  const result = await paginate(async () => ++n === 1 ? Array.from({ length: 100 }, (_, id) => ({ id })) : [], prefix + '/releases');
  assert.equal(n, 2); assert.equal(result.length, 100);
});
test('truncated, duplicate, repeated, changing or malformed pages abort', async () => {
  await assert.rejects(paginate(async () => ({ total_count: 2, artifacts: [a(1)] }), '/x', 'artifacts'), /Truncated/);
  await assert.rejects(paginate(async () => ({ total_count: 1, artifacts: null }), '/x', 'artifacts'));
  await assert.rejects(paginate(async () => ({ artifacts: [] }), '/x', 'artifacts'), /total_count/);
  const full = Array.from({ length: 100 }, (_, i) => a(i + 1));
  await assert.rejects(paginate(async () => ({ total_count: 201, artifacts: full }), '/x', 'artifacts'), /Repeated/);
  let n = 0;
  await assert.rejects(paginate(async () => ++n === 1 ? { total_count: 101, artifacts: full }
    : { total_count: 100, artifacts: [] }, '/x', 'artifacts'), /changed/);
});
for (const status of [401, 403, 404, 429, 500]) {
  test(`HTTP ${status} stops without fallback or secret leakage`, async () => {
    const client = githubClient('secret-for-test', async () => ({ ok: false, status, json: () => { throw new Error('must not parse'); } }));
    await assert.rejects(client('GET', prefix + '/actions/artifacts'), error => {
      assert.match(error.message, new RegExp('HTTP ' + status)); assert.ok(!error.message.includes('secret-for-test')); return true;
    });
  });
}
test('network errors are sanitized and redirects cannot forward credentials', async () => {
  const client = githubClient('secret-for-test', async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(url, 'https://api.github.com' + prefix + '/releases');
    throw new Error('secret-for-test');
  });
  await assert.rejects(client('GET', prefix + '/releases'), /network\/timeout/);
});
test('API client cannot delete releases, caches, workflows or another repository', async () => {
  let n = 0; const client = githubClient('test', async () => { n++; return { ok: true, status: 204 }; });
  for (const path of [prefix + '/releases/1', prefix + '/actions/caches/1', prefix + '/actions/runs/1',
    '/repos/other/repo/actions/artifacts/1', prefix + '/actions/artifacts/../1']) {
    await assert.rejects(client('DELETE', path), /Disallowed/);
  }
  await assert.rejects(client('POST', prefix + '/actions/artifacts/1'), /Disallowed/);
  assert.equal(n, 0); assert.throws(() => githubClient(''), /GH_TOKEN/);
});
test('collectSnapshot is entirely read-only and verifies the repository of every run', async () => {
  const { api, calls } = fake([a(1)]);
  const s = await collectSnapshot(api); assert.equal(s.runs.length, 1);
  assert.ok(calls.every(c => c[0] === 'GET'));
  const bad = fake([a(1)], (_, path) => path.endsWith('/runs/1') ? { ...r(1), repository: { full_name: 'other/repo' } } : undefined);
  await assert.rejects(collectSnapshot(bad.api), /mismatch/);
});
test('release tags protect their source commit, and unresolved tags stop inventory', async () => {
  const f = fake([a(1)], (_, path) => path.includes('/releases?') ? [{ id: 7, tag_name: 'v1' }]
    : path.includes('/tags?') ? [{ name: 'v1', commit: { sha } }] : undefined);
  const s = await collectSnapshot(f.api); assert.deepEqual(s.releaseCommitShas, [sha]);
  assert.equal(planRetention(s).totals.candidates, 0);
  const missing = fake([], (_, path) => path.includes('/releases?') ? [{ id: 7, tag_name: 'v1' }] : undefined);
  await assert.rejects(collectSnapshot(missing.api), /release source/);
});
test('dry-run is default, refuses foreign repositories and ignores an enabled variable without --execute', () => {
  assert.equal(parseArgs([], approval).execute, false);
  assert.equal(parseArgs([], {}).execute, false);
  assert.throws(() => parseArgs([], { GITHUB_REPOSITORY: 'other/repo' }));
  assert.throws(() => parseArgs(['--unknown'], {}));
  assert.throws(() => parseArgs(['--output'], {}));
});
test('execution requires all gates; snapshots, PRs and feature branches cannot execute', () => {
  for (const key of Object.keys(approval)) {
    const env = { ...approval }; delete env[key];
    assert.throws(() => parseArgs(['--execute'], env), /disabled/);
  }
  for (const env of [{ ...approval, GITHUB_EVENT_NAME: 'pull_request' }, { ...approval, GITHUB_REF: 'refs/heads/topic' }]) {
    assert.throws(() => parseArgs(['--execute'], env), /disabled/);
  }
  assert.throws(() => parseArgs(['--execute', '--snapshot', 'x'], approval), /disabled/);
  assert.equal(parseArgs(['--execute'], approval).execute, true);
  assert.equal(parseArgs(['--execute'], { ...approval, GITHUB_EVENT_NAME: 'schedule' }).execute, true);
});
test('offline dry-run creates a complete report without token or any mutation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'artifact-policy-'));
  try {
    const { writeFile } = await import('node:fs/promises');
    const file = join(dir, 'input.json'), out = join(dir, 'report');
    await writeFile(file, JSON.stringify({ repository: REPOSITORY, artifacts: [a(1)], runs: [r(1)], releaseCommitShas: [] }));
    await main(['--snapshot', file, '--output', out], {});
    assert.equal(JSON.parse(await readFile(out + '.json', 'utf8')).mode, 'dry-run');
    assert.match(await readFile(out + '.md', 'utf8'), /would-delete/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('execution rechecks live policy and records only acknowledged artifact deletions', async () => {
  const items = [a(1)]; const f = fake(items); const logged = [];
  const result = await executePlan(f.api, report(items), a => logged.push(a.id), approval);
  assert.deepEqual(result, { deleted: [1], skipped: [] }); assert.deepEqual(logged, [1]);
  assert.deepEqual(f.calls.filter(c => c[0] === 'DELETE'), [['DELETE', prefix + '/actions/artifacts/1']]);
});
test('direct execution helper also enforces approval', async () => {
  const f = fake([a(1)]);
  await assert.rejects(executePlan(f.api, report([a(1)]), () => {}, {}), /disabled/);
  assert.equal(f.calls.length, 0);
});
test('changed metadata or an active/restarted run skips removal', async () => {
  for (const mode of ['changed-size', 'active', 'head-changed']) {
    const items = [a(1)];
    let runCalls = 0;
    const f = fake(items, (_, path) => {
      if (mode === 'changed-size' && path.endsWith('/artifacts/1')) return { ...items[0], size_in_bytes: 999 };
      if (path.endsWith('/runs/1')) {
        runCalls++;
        if (mode === 'active') return { ...r(1), status: 'in_progress' };
        if (mode === 'head-changed' && runCalls > 1) return { ...r(1), head_sha: 'b'.repeat(40) };
      }
    });
    const result = await executePlan(f.api, report(items), () => {}, approval);
    assert.deepEqual(result.deleted, [], mode); assert.ok(f.calls.every(c => c[0] === 'GET'), mode);
  }
});
test('Windows installer promoted into latest three after initial plan is protected', async () => {
  const items = [1, 2, 3, 4].map(id => a(id, 'RolVixa-Windows-x64'));
  const p = report(items); assert.equal(p.entries.find(a => a.id === 4).action, 'would-delete');
  const f = fake(items.filter(a => a.id !== 1));
  const result = await executePlan(f.api, p, () => {}, approval);
  assert.deepEqual(result.deleted, []); assert.deepEqual(result.skipped, [4]);
});
test('a new Release published after the first report protects the candidate before DELETE', async () => {
  const items = [a(1)];
  const f = fake(items, (_, path) => path.includes('/releases?') ? [{ id: 7, tag_name: 'v1' }]
    : path.includes('/tags?') ? [{ name: 'v1', commit: { sha } }] : undefined);
  const result = await executePlan(f.api, report(items), () => {}, approval);
  assert.deepEqual(result.deleted, []); assert.deepEqual(result.skipped, [1]);
});
test('partial execution logs acknowledged deletion before a later failure and stops', async () => {
  const items = [a(1), a(2), a(3)]; const logged = [];
  const f = fake(items, (method, path) => {
    if (method === 'DELETE' && path.endsWith('/2')) throw new Error('HTTP 500');
  });
  await assert.rejects(executePlan(f.api, report(items), a => logged.push(a.id), approval), /500/);
  assert.deepEqual(logged, [1]);
  assert.equal(f.calls.filter(c => c[0] === 'DELETE').length, 2);
  assert.ok(!f.calls.some(([m, p]) => m === 'DELETE' && p.endsWith('/3')));
});
test('failed inventory, missing permissions or DELETE failure prevents further mutations', async () => {
  for (const failure of ['inventory', 'delete']) {
    const items = [a(1), a(2)];
    const f = fake(items, (method, path) => {
      if ((failure === 'inventory' && path.includes('/actions/artifacts?')) || method === 'DELETE') throw new Error('HTTP 403');
    });
    const logged = [];
    await assert.rejects(executePlan(f.api, report(items), a => logged.push(a.id), approval), /403/);
    assert.deepEqual(logged, []);
    assert.equal(f.calls.filter(c => c[0] === 'DELETE').length, failure === 'inventory' ? 0 : 1);
  }
});

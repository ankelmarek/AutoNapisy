// Repository-specific allowlist verified against GitHub Actions inventory (issue #32).
export const REPOSITORY = 'ankelmarek/AutoNapisy';
export const DAY = 86_400_000;
export const WINDOWS_NAMES = new Set(['RolVixa-Windows-x64', 'AutoNapisy-Windows-x64']);
export const TEST_NAMES = new Set([
  'RolVixa-UI-Preview', 'RolVixa-UI-Diagnostics', 'RolVixa-Animated-Captions-POC',
  'RolVixa-UI-Verification', 'polish-alignment-research', 'Thumbnail-diagnostics',
  'Audio-UI-captures', 'UI-captures', 'Actions-retention-report', 'Actions-retention-execution-report',
]);

export function validateRepository(repository) {
  if (repository !== REPOSITORY) throw new Error(`Repository must be ${REPOSITORY}`);
}

export function validateArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) throw new Error('Incomplete artifact inventory');
  const ids = new Set();
  for (const a of artifacts) {
    if (!Number.isSafeInteger(a.id) || a.id <= 0 || ids.has(a.id)
      || typeof a.name !== 'string' || !a.name.length
      || !Number.isSafeInteger(a.size_in_bytes) || a.size_in_bytes < 0
      || typeof a.expired !== 'boolean'
      || typeof a.created_at !== 'string' || !Number.isFinite(Date.parse(a.created_at))) {
      throw new Error('Invalid or duplicate artifact metadata; refusing partial inventory');
    }
    ids.add(a.id);
  }
}

export function category(name) {
  return WINDOWS_NAMES.has(name) ? 'windows' : TEST_NAMES.has(name) ? 'test' : 'unknown';
}

export function protectedWindows(artifacts) {
  validateArtifacts(artifacts);
  return new Set(artifacts.filter(a => WINDOWS_NAMES.has(a.name) && !a.expired)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
    .slice(0, 3).map(a => a.id));
}

export function planRetention(snapshot, now = Date.now()) {
  validateRepository(snapshot.repository);
  validateArtifacts(snapshot.artifacts);
  if (!Number.isFinite(now) || !Array.isArray(snapshot.runs)
    || !Array.isArray(snapshot.releaseCommitShas)) throw new Error('Invalid audit snapshot');
  const runs = new Map();
  for (const r of snapshot.runs) {
    if (!Number.isSafeInteger(r.id) || runs.has(r.id)) throw new Error('Invalid run inventory');
    runs.set(r.id, r);
  }
  const keep = protectedWindows(snapshot.artifacts);
  const released = new Set(snapshot.releaseCommitShas);
  const entries = snapshot.artifacts.map(a => {
    const kind = category(a.name), ageDays = (now - Date.parse(a.created_at)) / DAY;
    const run = runs.get(a.workflow_run?.id);
    let reason;
    if (a.expired) reason = 'already-expired';
    else if (ageDays < 0) reason = 'future-timestamp';
    else if (kind === 'unknown') reason = 'unknown-name';
    else if (keep.has(a.id)) reason = 'latest-three-windows';
    else if (!run || run.status !== 'completed' || !/^[a-f0-9]{40}$/i.test(run.head_sha ?? '')) reason = 'active-or-unverified-run';
    else if (released.has(run.head_sha)) reason = 'release-source-commit';
    else if (kind === 'windows' && ageDays <= 7) reason = 'windows-not-older-than-seven-days';
    else if (kind === 'test' && ageDays <= 2) reason = 'test-not-older-than-two-days';
    else reason = kind === 'windows' ? 'windows-older-than-seven-days' : 'test-older-than-two-days';
    const remove = reason === 'windows-older-than-seven-days' || reason === 'test-older-than-two-days';
    return { id: a.id, name: a.name, runId: a.workflow_run?.id ?? null,
      createdAt: a.created_at, bytes: a.size_in_bytes, ageDays, category: kind,
      action: remove ? 'would-delete' : 'keep', reason };
  }).sort((a, b) => a.id - b.id);
  return { repository: snapshot.repository, generatedAt: new Date(now).toISOString(), mode: 'dry-run',
    entries, totals: { artifacts: entries.length, bytes: entries.reduce((s, a) => s + a.bytes, 0),
      candidates: entries.filter(a => a.action === 'would-delete').length,
      potentialBytes: entries.filter(a => a.action === 'would-delete').reduce((s, a) => s + a.bytes, 0) } };
}

function cell(value) { return String(value).replaceAll('|', '\\|').replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('<', '&lt;'); }
export function renderReport(report) {
  return [
    '# GitHub Actions — raport retencji', '',
    `Repozytorium: ${report.repository}. Stan: ${report.generatedAt}. Tryb: **${report.mode}**.`, '',
    `Artefakty: ${report.totals.artifacts}; rozmiar API: ${report.totals.bytes} B.`,
    `Kandydaci: ${report.totals.candidates}; potencjalna oszczędność: **${report.totals.potentialBytes} B**.`, '',
    'Rozmiary artefaktów nie są rachunkiem billingowym ani pomiarem cache. Dry-run niczego nie usuwa.', '',
    '| ID | Nazwa | Run | Wiek (dni) | Bajty | Decyzja | Powód |',
    '| --- | --- | --- | ---: | ---: | --- | --- |',
    ...report.entries.map(a => `| ${a.id} | ${cell(a.name)} | ${a.runId ?? '—'} | ${a.ageDays.toFixed(3)} | ${a.bytes} | ${a.action} | ${a.reason} |`), '',
  ].join('\n');
}

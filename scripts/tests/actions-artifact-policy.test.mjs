import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DAY, REPOSITORY, planRetention, protectedWindows, renderReport } from '../actions-artifact-policy.mjs';

const now = Date.parse('2026-10-29T12:00:00Z');
const sha = 'a'.repeat(40);
const artifact = (id, age = 10, name = 'RolVixa-Windows-x64') => ({
  id, name, created_at: new Date(now - age * DAY).toISOString(), size_in_bytes: id * 100,
  expired: false, workflow_run: { id },
});
const snapshot = artifacts => ({ repository: REPOSITORY, artifacts,
  runs: artifacts.map(a => ({ id: a.workflow_run?.id ?? a.id, status: 'completed', head_sha: sha })), releaseCommitShas: [] });
const entry = (s, id) => planRetention(s, now).entries.find(a => a.id === id);

test('keeps exactly three newest Windows globally across names, workflows and shuffled pages', () => {
  const a = [artifact(1, 30), artifact(7, 8, 'AutoNapisy-Windows-x64'), artifact(3, 15), artifact(2, 20)];
  assert.deepEqual([...protectedWindows(a)], [7, 3, 2]);
  const p = planRetention(snapshot(a), now);
  assert.equal(p.entries.find(a => a.id === 1).action, 'would-delete');
  assert.equal(p.totals.potentialBytes, 100);
});
test('ties use numeric artifact ID deterministically; expired artifact does not occupy a protected slot', () => {
  const a = [artifact(1), artifact(2), artifact(3), artifact(4), { ...artifact(9, 1), expired: true }];
  assert.deepEqual([...protectedWindows(a)], [4, 3, 2]);
  assert.equal(entry(snapshot(a), 9).reason, 'already-expired');
});
test('fewer than three installers are all protected even if very old', () => {
  const s = snapshot([artifact(1, 200), artifact(2, 100)]);
  assert.equal(planRetention(s, now).totals.candidates, 0);
});
test('Windows boundary is strictly older than seven days, not >= seven', () => {
  const others = [artifact(10, 0), artifact(11, 1), artifact(12, 2)];
  assert.equal(entry(snapshot([...others, artifact(1, 7)]), 1).action, 'keep');
  assert.equal(entry(snapshot([...others, artifact(1, 7 + 1 / DAY)]), 1).action, 'would-delete');
  assert.equal(entry(snapshot([...others, artifact(1, 6.99)]), 1).action, 'keep');
});
test('test boundary is strictly older than two days', () => {
  assert.equal(entry(snapshot([artifact(1, 2, 'RolVixa-UI-Preview')]), 1).action, 'keep');
  assert.equal(entry(snapshot([artifact(1, 2 + 1 / DAY, 'RolVixa-UI-Preview')]), 1).action, 'would-delete');
});
test('unknown, similar and ZIP names remain protected', () => {
  for (const name of ['Custom-Windows-x64', 'RolVixa-Windows-x64.zip', 'RolVixa-UI-Preview-extra', 'project.zip']) {
    assert.equal(entry(snapshot([artifact(1, 999, name)]), 1).reason, 'unknown-name');
  }
});
test('known diagnostic history is classified explicitly', () => {
  for (const name of ['polish-alignment-research', 'RolVixa-UI-Verification', 'Thumbnail-diagnostics', 'Audio-UI-captures', 'UI-captures']) {
    assert.equal(entry(snapshot([artifact(1, 10, name)]), 1).action, 'would-delete');
  }
});
test('active, queued, missing and malformed run metadata never permit removal', () => {
  for (const status of ['in_progress', 'queued', 'waiting', 'requested', undefined]) {
    const s = snapshot([artifact(1, 10, 'RolVixa-UI-Diagnostics')]);
    s.runs[0].status = status;
    assert.equal(entry(s, 1).reason, 'active-or-unverified-run');
  }
  const s = snapshot([artifact(1, 10, 'RolVixa-UI-Diagnostics')]);
  s.runs = [];
  assert.equal(entry(s, 1).action, 'keep');
  s.runs = [{ id: 1, status: 'completed', head_sha: null }];
  assert.equal(entry(s, 1).action, 'keep');
});
test('release source commits preserve installer and test proof', () => {
  const s = snapshot([artifact(1, 30, 'RolVixa-UI-Preview')]);
  s.releaseCommitShas = [sha];
  assert.equal(entry(s, 1).reason, 'release-source-commit');
});
test('future dates are protected', () => assert.equal(entry(snapshot([artifact(1, -10, 'UI-captures')]), 1).reason, 'future-timestamp'));
test('invalid, duplicate or partial inventories fail closed', () => {
  for (const mutation of [a => { a.created_at = 'bad'; }, a => { a.size_in_bytes = -1; },
    a => { a.id = 0; }, a => { a.expired = null; }, a => { a.name = ''; }]) {
    const a = artifact(1); mutation(a);
    assert.throws(() => planRetention(snapshot([a]), now));
  }
  assert.throws(() => planRetention(snapshot([artifact(1), artifact(1)]), now));
  assert.throws(() => planRetention({ ...snapshot([]), repository: 'other/repo' }, now));
  assert.throws(() => planRetention({ ...snapshot([]), releaseCommitShas: null }, now));
});
test('report contains every decision, ID, age, size, reason and exact total without Markdown injection', () => {
  const p = planRetention(snapshot([artifact(1, 3, 'UI-captures'), artifact(2, 1, 'a|b\n<script>')]), now);
  const md = renderReport(p);
  assert.equal(p.totals.bytes, 300); assert.equal(p.totals.potentialBytes, 100);
  assert.match(md, /\| 1 \| UI-captures \| 1 \| 3\.000 \| 100 \| would-delete \| test-older-than-two-days/);
  assert.ok(md.includes('a\\|b &lt;script>')); assert.ok(!md.includes('<script>'));
});
test('Windows test/build commands and required integration coverage are unchanged', async () => {
  const current = await readFile('.github/workflows/windows.yml', 'utf8');
  for (const command of ['npm test', 'npm run build', 'cargo test --locked --manifest-path src-tauri/Cargo.toml',
    'caption_reanalysis', './scripts/test-webview.ps1']) assert.ok(current.includes(command), command);
  assert.match(current, /branches: \[main\]/);
  assert.match(current, /pull_request:/);
  assert.match(current, /cancel-in-progress: true/);
  assert.ok(!current.includes('actions: write'));
  assert.ok(!current.includes('Cancel older builds'));
  for (const name of ['RolVixa-UI-Preview', 'RolVixa-UI-Diagnostics', 'RolVixa-Animated-Captions-POC']) {
    assert.ok(current.includes(`name: ${name}\n          retention-days: 2`));
  }
  assert.ok(!current.includes('name: RolVixa-Windows-x64\n          retention-days: 2'));
});
test('cleanup workflow keeps deletion behind approval, trusted event, main and a separate write job', async () => {
  const w = await readFile('.github/workflows/artifact-retention.yml', 'utf8');
  const [audit, cleanup] = w.split('  cleanup:');
  assert.ok(audit.includes('actions: read')); assert.ok(!audit.includes('actions: write'));
  assert.ok(cleanup.includes('actions: write'));
  assert.ok(cleanup.includes("vars.ROLVIXA_ARTIFACT_CLEANUP_ENABLED == 'true'"));
  assert.ok(cleanup.includes("github.ref == 'refs/heads/main'"));
  assert.ok(cleanup.includes('inputs.execute')); assert.ok(w.includes('default: false'));
  assert.ok(!w.includes('pull_request_target'));
});

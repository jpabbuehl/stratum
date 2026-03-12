const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const toolPath = path.join(__dirname, '..', 'stratum', 'bin', 'stratum-tools.cjs');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stratum-test-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function run(args, cwd, env = {}) {
  const output = execFileSync(process.execPath, [toolPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
    encoding: 'utf8'
  });
  return JSON.parse(output);
}

function writeRoadmap(cwd) {
  fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), [
    '# Roadmap',
    '',
    '### Phase 01: Foundation Setup',
    '**Slug:** foundation-setup',
    '**Status:** done',
    '**Depends on:**',
    '**Success Criteria:** Foundation done',
    '',
    '### Phase 02: API Layer',
    '**Slug:** api-layer',
    '**Status:** planned',
    '**Depends on:** 01',
    '**Success Criteria:** PLAN, TASKS and task graph exist',
    '',
    '### Phase 03: UI Shell',
    '**Slug:** ui-shell',
    '**Status:** planned',
    '**Depends on:** 02',
    '**Success Criteria:** UI planning done',
    ''
  ].join('\n'));
}

function writeState(cwd, state = {}) {
  const defaults = {
    current_feature_ref: 'foundation-setup',
    next_feature_ref: 'api-layer',
    current_phase_dir: '.planning/phases/01-foundation-setup',
    solution_status: 'active',
    last_command: 'seed',
    last_updated: '2026-03-12T00:00:00.000Z',
    orchestration_mode: 'deep-dual',
    exports: { gsd: 'not-exported', beads: 'not-exported' },
    learning: { enabled: false }
  };
  const merged = { ...defaults, ...state, exports: { ...defaults.exports, ...(state.exports || {}) }, learning: { ...defaults.learning, ...(state.learning || {}) } };
  const lines = [];
  for (const [key, value] of Object.entries(merged)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        lines.push(`  ${nestedKey}: ${nestedValue}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  fs.writeFileSync(path.join(cwd, '.planning', 'STATE.md'), `---\n${lines.join('\n')}\n---\n\n# State\n`);
}

function makeFakeVendors(cwd, opts = {}) {
  const binDir = path.join(cwd, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const claudePath = path.join(binDir, 'claude');
  fs.writeFileSync(claudePath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "claude 0.0.0"
  exit 0
fi
if [ "$1" = "-p" ]; then
  shift
fi
printf '## Summary\\nClaude independent position.\\n\\n## Concerns\\n- Claude concern.\\n\\n## Validation\\n- Verify canonical artifacts.\\n\\n## Recommended Revisions\\n- None.\\n'
`);

  const codexPath = path.join(binDir, 'codex');
  fs.writeFileSync(codexPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "codex 0.0.0"
  exit 0
fi
cat <<'EOF'
session id: fake-session
codex
## Summary
Codex independent position.

## Concerns
- Codex concern.

## Validation
- Verify task graph.

## Recommended Revisions
- None.
tokens used
EOF
`);

  const geminiPath = path.join(binDir, 'gemini');
  fs.writeFileSync(geminiPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "gemini 0.0.0"
  exit 0
fi
if [ "$1" = "-p" ]; then
  shift
fi
printf '## Summary\\nGemini skeptical position.\\n\\n## Concerns\\n- Gemini concern.\\n\\n## Validation\\n- Check edge cases.\\n\\n## Recommended Revisions\\n- Add stress tests.\\n'
`);

  fs.chmodSync(claudePath, 0o755);
  fs.chmodSync(codexPath, 0o755);
  if (!opts.omitGemini) fs.chmodSync(geminiPath, 0o755);
  if (opts.omitGemini) fs.rmSync(geminiPath, { force: true });
  return { PATH: `${binDir}:${process.env.PATH || ''}` };
}

describe('stratum-tools', () => {
  let cwd;

  beforeEach(() => {
    cwd = tmpDir();
  });

  afterEach(() => {
    cleanup(cwd);
  });

  test('init-solution creates canonical planning files with default deep-dual mode', () => {
    const result = run(['init-solution'], cwd);
    assert.strictEqual(result.mode.depth, 'deep');
    assert.strictEqual(result.mode.strategy, 'dual');
    assert.strictEqual(result.topology, 'dual-argumentation');
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'BLUEPRINT.md')));
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'ROADMAP.md')));
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'STATE.md')));
  });

  test('plan-phase in dual deep mode persists independent and critique rounds', () => {
    writeRoadmap(cwd);
    writeState(cwd);
    const env = makeFakeVendors(cwd);

    const result = run(['plan-phase', '--next', '--deep', '--dual'], cwd, env);
    assert.strictEqual(result.topology, 'dual-argumentation');
    assert.deepStrictEqual(result.vendors, ['claude', 'codex']);
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'round-1', 'claude.md')));
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'round-1', 'codex.md')));
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'round-2', 'claude.md')));
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'round-2', 'codex.md')));
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'synthesis.json')));
  });

  test('plan-phase in council topology uses claude codex and gemini', () => {
    writeRoadmap(cwd);
    writeState(cwd);
    const env = makeFakeVendors(cwd);

    const result = run(['plan-phase', 'api-layer', '--deep', '--dual', '--topology', 'council'], cwd, env);
    assert.strictEqual(result.topology, 'council');
    assert.deepStrictEqual(result.vendors, ['claude', 'codex', 'gemini']);
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'round-1', 'gemini.md')));
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'round-2', 'gemini.md')));
  });

  test('plan-phase in round-robin topology persists serial rounds', () => {
    writeRoadmap(cwd);
    writeState(cwd);
    const env = makeFakeVendors(cwd);

    const result = run(['plan-phase', 'api-layer', '--deep', '--dual', '--topology', 'round-robin'], cwd, env);
    assert.strictEqual(result.topology, 'round-robin');
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'round-1', 'claude.md')));
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'round-2', 'gemini.md')));
  });

  test('single quick mode stays single-pass and skips vendor rounds', () => {
    writeRoadmap(cwd);
    writeState(cwd);
    const result = run(['plan-phase', 'api-layer', '--quick', '--single'], cwd);
    assert.strictEqual(result.topology, 'single-pass');
    assert.deepStrictEqual(result.vendors, ['claude']);
    assert.ok(!fs.existsSync(path.join(cwd, '.planning', 'phases', '02-api-layer', 'DELIBERATION', 'round-1')));
  });

  test('--next resolution recomputes correctly even when state cursor is stale', () => {
    writeRoadmap(cwd);
    writeState(cwd, { next_feature_ref: 'missing-slug' });
    const result = run(['phase-status', '--next'], cwd);
    assert.strictEqual(result.feature_ref, 'api-layer');
    assert.strictEqual(result.phase_dir, '.planning/phases/02-api-layer');
  });

  test('challenge-plan revises malformed plans and records review artifacts', () => {
    writeRoadmap(cwd);
    writeState(cwd);
    const env = makeFakeVendors(cwd);
    const phaseDir = path.join(cwd, '.planning', 'phases', '02-api-layer');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# Broken Plan\n');

    const result = run(['challenge-plan', 'api-layer', '--topology', 'critique'], cwd, env);
    assert.strictEqual(result.revised, true);
    assert.ok(fs.readFileSync(path.join(phaseDir, 'PLAN.md'), 'utf8').includes('## Validation'));
    assert.ok(fs.existsSync(path.join(phaseDir, 'DELIBERATION', 'challenge-review.md')));
  });

  test('export-gsd and export-beads generate adapter outputs from canonical artifacts', () => {
    writeRoadmap(cwd);
    writeState(cwd);
    const env = makeFakeVendors(cwd);
    run(['plan-phase', 'api-layer', '--deep', '--dual'], cwd, env);

    const gsd = run(['export-gsd', 'api-layer'], cwd);
    const beads = run(['export-beads', 'api-layer'], cwd);

    assert.strictEqual(gsd.export_dir, '.planning/adapters/gsd/02-api-layer');
    assert.strictEqual(beads.export_dir, '.planning/adapters/beads/02-api-layer');
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'adapters', 'gsd', '02-api-layer', 'phase.json')));
    assert.ok(fs.existsSync(path.join(cwd, '.planning', 'adapters', 'beads', '02-api-layer', 'tasks.json')));
    assert.ok(beads.task_count >= 2);
  });

  test('doctor reports wrapper assets and cli availability', () => {
    writeRoadmap(cwd);
    writeState(cwd);
    const env = makeFakeVendors(cwd);
    const result = run(['doctor'], cwd, env);
    assert.strictEqual(result.ok, true);
    assert.ok(result.checks.find(check => check.name === 'claude-cli').ok);
    assert.ok(result.checks.find(check => check.name === 'codex-cli').ok);
    assert.ok(result.checks.find(check => check.name === 'gemini-cli').ok);
  });
});

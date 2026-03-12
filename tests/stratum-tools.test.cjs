const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const toolPath = path.join(__dirname, '..', 'stratum', 'bin', 'stratum-tools.cjs');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stratum-test-'));
}

test('init-solution creates canonical planning files', () => {
  const cwd = tmpDir();
  execFileSync(process.execPath, [toolPath, 'init-solution'], { cwd, stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(cwd, '.planning', 'BLUEPRINT.md')));
  assert.ok(fs.existsSync(path.join(cwd, '.planning', 'ROADMAP.md')));
  assert.ok(fs.existsSync(path.join(cwd, '.planning', 'STATE.md')));
});

test('plan-phase creates a phase directory from roadmap entry', () => {
  const cwd = tmpDir();
  fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), '# Roadmap\n\n### Phase 01: API Layer\n**Slug:** api-layer\n**Status:** planned\n');
  execFileSync(process.execPath, [toolPath, 'plan-phase', 'api-layer'], { cwd, stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '01-api-layer', 'PLAN.md')));
  assert.ok(fs.existsSync(path.join(cwd, '.planning', 'phases', '01-api-layer', 'TASK-GRAPH.json')));
});

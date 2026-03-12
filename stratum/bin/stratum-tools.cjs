#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function read(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function write(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'phase';
}

function parseRoadmap(cwd) {
  const content = read(path.join(cwd, '.planning', 'ROADMAP.md'));
  if (!content) return [];
  return [...content.matchAll(/^###\s+Phase\s+([0-9]+(?:\.[0-9]+)?)\s*:\s*(.+)$/gm)].map(match => ({
    number: String(match[1]).padStart(2, '0'),
    title: match[2].trim(),
    slug: slugify(match[2].trim())
  }));
}

function resolveRef(cwd, ref) {
  const entries = parseRoadmap(cwd);
  if (!entries.length) throw new Error('No phases found in .planning/ROADMAP.md');
  if (!ref || ref === '--next') {
    return entries[0];
  }
  const normalized = /^\d+$/.test(ref) ? String(ref).padStart(2, '0') : ref;
  return entries.find(entry => entry.slug === slugify(ref) || entry.number === normalized) || null;
}

function initSolution(cwd) {
  ensureDir(path.join(cwd, '.planning', 'backlog'));
  ensureDir(path.join(cwd, '.planning', 'phases'));
  ensureDir(path.join(cwd, '.planning', 'adapters', 'gsd'));
  write(path.join(cwd, '.planning', 'BLUEPRINT.md'), '# Solution Blueprint\n\nCanonical planning store for Stratum.\n');
  write(path.join(cwd, '.planning', 'ROADMAP.md'), '# Roadmap\n\n### Phase 01: Foundation Setup\n**Slug:** foundation-setup\n**Status:** planned\n');
  write(path.join(cwd, '.planning', 'STATE.md'), '# State\n\nCurrent feature: foundation-setup\n');
  write(path.join(cwd, '.planning', 'backlog', 'ideas.md'), '# Backlog Ideas\n');
  console.log(JSON.stringify({ ok: true, created: ['.planning/BLUEPRINT.md', '.planning/ROADMAP.md', '.planning/STATE.md'] }, null, 2));
}

function planPhase(cwd, ref) {
  const entry = resolveRef(cwd, ref);
  if (!entry) throw new Error(`Phase not found: ${ref}`);
  const phaseDir = path.join(cwd, '.planning', 'phases', `${entry.number}-${entry.slug}`);
  ensureDir(phaseDir);
  write(path.join(phaseDir, 'CONTEXT.md'), `# Context\n\nFeature: ${entry.title}\n`);
  write(path.join(phaseDir, 'PLAN.md'), `# Plan\n\nFeature: ${entry.title}\n`);
  write(path.join(phaseDir, 'TASKS.md'), `# Tasks\n\n- [ ] Define implementation tasks for ${entry.title}\n`);
  write(path.join(phaseDir, 'TASK-GRAPH.json'), JSON.stringify([{ id: `${entry.number}-01`, title: `Plan ${entry.title}`, depends_on: [] }], null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, phase_dir: `.planning/phases/${entry.number}-${entry.slug}` }, null, 2));
}

function exportGsd(cwd, ref) {
  const entry = resolveRef(cwd, ref);
  if (!entry) throw new Error(`Phase not found: ${ref}`);
  const exportDir = path.join(cwd, '.planning', 'adapters', 'gsd', `${entry.number}-${entry.slug}`);
  ensureDir(exportDir);
  write(path.join(exportDir, 'README.md'), `# GSD Export\n\nSource phase: ${entry.number}-${entry.slug}\n`);
  console.log(JSON.stringify({ ok: true, export_dir: `.planning/adapters/gsd/${entry.number}-${entry.slug}` }, null, 2));
}

function help() {
  console.log(`stratum-tools

Commands:
  init-solution
  plan-phase <ref|--next>
  export-gsd <ref|--next>`);
}

function main() {
  const [command, arg] = process.argv.slice(2);
  const cwd = process.cwd();
  if (!command || command === 'help') {
    help();
    return;
  }
  if (command === 'init-solution') return initSolution(cwd);
  if (command === 'plan-phase') return planPhase(cwd, arg);
  if (command === 'export-gsd') return exportGsd(cwd, arg);
  throw new Error(`Unknown command: ${command}`);
}

main();

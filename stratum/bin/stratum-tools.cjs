#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) write(filePath, content);
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function output(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2));
}

function die(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'phase';
}

function normalizePhase(value) {
  const match = String(value || '').match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const major = match[1].padStart(2, '0');
  return match[2] ? `${major}.${match[2]}` : major;
}

function modeFromArgs(args) {
  const depth = args.includes('--quick') ? 'quick' : 'deep';
  const strategy = args.includes('--single') ? 'single' : 'dual';
  return { depth, strategy };
}

function detectProjectType(cwd, forceMode) {
  if (forceMode === 'greenfield') return { project_type: 'greenfield', has_code: false, has_manifest: false };
  if (forceMode === 'brownfield') return { project_type: 'brownfield', has_code: true, has_manifest: true };

  const codeExts = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.swift', '.rb']);
  const manifests = new Set(['package.json', 'pnpm-lock.yaml', 'yarn.lock', 'requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'Package.swift']);
  let hasCode = false;
  let hasManifest = false;

  function scan(dir, depth = 0) {
    if (depth > 2 || (hasCode && hasManifest)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', '.planning', 'node_modules'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full, depth + 1);
      } else {
        if (codeExts.has(path.extname(entry.name))) hasCode = true;
        if (manifests.has(entry.name)) hasManifest = true;
      }
    }
  }

  scan(cwd);
  return {
    project_type: hasCode || hasManifest ? 'brownfield' : 'greenfield',
    has_code: hasCode,
    has_manifest: hasManifest
  };
}

function extractFrontmatter(content) {
  const match = String(content || '').match(/^---\n([\s\S]+?)\n---/);
  if (!match) return {};
  const lines = match[1].split('\n');
  const result = {};
  let currentObject = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const nestedMatch = line.match(/^\s{2}([a-zA-Z0-9_.-]+):\s*(.*)$/);
    if (nestedMatch && currentObject && typeof result[currentObject] === 'object' && !Array.isArray(result[currentObject])) {
      result[currentObject][nestedMatch[1]] = parseScalar(nestedMatch[2]);
      continue;
    }
    const keyMatch = line.match(/^([a-zA-Z0-9_.-]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const [, key, rawValue] = keyMatch;
    if (!rawValue.trim()) {
      result[key] = {};
      currentObject = key;
    } else {
      result[key] = parseScalar(rawValue);
      currentObject = null;
    }
  }
  return result;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^\d+$/.test(value)) return Number(value);
  return value.replace(/^["']|["']$/g, '');
}

function renderFrontmatter(obj, indent = '') {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${indent}${key}:`);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        lines.push(`${indent}  ${nestedKey}: ${nestedValue}`);
      }
    } else {
      lines.push(`${indent}${key}: ${value}`);
    }
  }
  return lines.join('\n');
}

function readState(cwd) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const content = read(statePath);
  return content ? extractFrontmatter(content) : {};
}

function writeState(cwd, patch) {
  const existing = readState(cwd);
  const state = {
    current_feature_ref: null,
    next_feature_ref: null,
    current_phase_dir: null,
    solution_status: 'initialized',
    last_command: null,
    last_updated: nowIso(),
    exports: { gsd: 'not-exported', beads: 'not-exported' },
    learning: { enabled: false },
    orchestration_mode: 'deep-dual',
    ...existing,
    ...patch,
    exports: { ...(existing.exports || {}), ...((patch && patch.exports) || {}) },
    learning: { ...(existing.learning || {}), ...((patch && patch.learning) || {}) }
  };
  const digest = [
    '# Planning State',
    '',
    `Current feature: ${state.current_feature_ref || 'none'}`,
    `Next feature: ${state.next_feature_ref || 'none'}`,
    `Current phase dir: ${state.current_phase_dir || 'none'}`,
    `Solution status: ${state.solution_status || 'unknown'}`,
    `Last command: ${state.last_command || 'unknown'}`,
    `Last updated: ${state.last_updated}`
  ].join('\n');
  write(path.join(cwd, '.planning', 'STATE.md'), `---\n${renderFrontmatter(state)}\n---\n\n${digest}\n`);
}

function parseRoadmap(cwd) {
  const content = read(path.join(cwd, '.planning', 'ROADMAP.md'));
  if (!content) return [];
  const matches = [...content.matchAll(/^###\s+Phase\s+([0-9]+(?:\.[0-9]+)?)\s*:\s*(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : content.length;
    const section = content.slice(start, end).trim();
    const slugLine = section.match(/^\*\*Slug:\*\*\s*(.+)$/mi);
    const statusLine = section.match(/^\*\*Status:\*\*\s*(.+)$/mi);
    const dependsLine = section.match(/^\*\*Depends on:\*\*\s*(.+)$/mi);
    const successLine = section.match(/^\*\*Success Criteria:\*\*\s*(.+)$/mi);
    return {
      number: normalizePhase(match[1]),
      title: match[2].trim(),
      slug: slugLine ? slugify(slugLine[1].trim()) : slugify(match[2].trim()),
      status: statusLine ? statusLine[1].trim().toLowerCase() : 'planned',
      depends_on: dependsLine ? dependsLine[1].split(',').map(item => item.trim()).filter(Boolean) : [],
      success_criteria: successLine ? successLine[1].split(';').map(item => item.trim()).filter(Boolean) : [],
      section
    };
  });
}

function resolveFeature(cwd, ref) {
  const entries = parseRoadmap(cwd);
  if (!entries.length) die('No phases found in .planning/ROADMAP.md');
  const state = readState(cwd);
  let entry = null;

  if (!ref || ref === '--next') {
    const byState = entries.find(candidate => candidate.slug === state.next_feature_ref || candidate.number === normalizePhase(state.next_feature_ref));
    if (byState) entry = byState;
    if (!entry && state.current_feature_ref) {
      const currentIndex = entries.findIndex(candidate => candidate.slug === state.current_feature_ref || candidate.number === normalizePhase(state.current_feature_ref));
      if (currentIndex !== -1) {
        entry = entries.slice(currentIndex + 1).find(candidate => candidate.status !== 'done' && candidate.status !== 'complete') || null;
      }
    }
    if (!entry) entry = entries.find(candidate => candidate.status !== 'done' && candidate.status !== 'complete') || entries[0];
  } else if (/^\d+(?:\.\d+)?$/.test(ref)) {
    entry = entries.find(candidate => candidate.number === normalizePhase(ref));
  } else {
    entry = entries.find(candidate => candidate.slug === slugify(ref));
  }

  if (!entry) die(`Phase not found: ${ref}`);
  const phaseDirName = `${entry.number}-${entry.slug}`;
  const phaseDir = path.join(cwd, '.planning', 'phases', phaseDirName);
  return { entry, entries, phaseDir, phaseDirName };
}

function ensurePlanningDirs(cwd) {
  ensureDir(path.join(cwd, '.planning', 'backlog'));
  ensureDir(path.join(cwd, '.planning', 'phases'));
  ensureDir(path.join(cwd, '.planning', 'adapters', 'gsd'));
  ensureDir(path.join(cwd, '.planning', 'adapters', 'beads'));
}

function topologyForMode(mode) {
  if (mode.strategy === 'single' && mode.depth === 'quick') return 'single-pass';
  if (mode.strategy === 'single' && mode.depth === 'deep') return 'single-with-qa';
  if (mode.strategy === 'dual' && mode.depth === 'quick') return 'dual-light-merge';
  return 'dual-argumentation';
}

function createRoadmapTemplate() {
  return [
    '# Roadmap',
    '',
    '### Phase 01: Foundation Setup',
    '**Slug:** foundation-setup',
    '**Status:** planned',
    '**Depends on:**',
    '**Success Criteria:** Canonical planning store exists; first phase can be planned',
    '',
    '### Phase 02: First Feature Slice',
    '**Slug:** first-feature-slice',
    '**Status:** planned',
    '**Depends on:** 01',
    '**Success Criteria:** Context, plan, and task graph exist for first deliverable',
    ''
  ].join('\n');
}

function packetForPhase(cwd, resolved, mode) {
  return {
    generated_at: nowIso(),
    mode,
    topology: topologyForMode(mode),
    blueprint_path: '.planning/BLUEPRINT.md',
    roadmap_path: '.planning/ROADMAP.md',
    state_path: '.planning/STATE.md',
    feature_ref: resolved.entry.slug,
    phase_number: resolved.entry.number,
    phase_dir: toPosix(path.relative(cwd, resolved.phaseDir)),
    success_criteria: resolved.entry.success_criteria,
    dependencies: resolved.entry.depends_on
  };
}

function makeTaskGraph(entry, mode) {
  const baseId = entry.number.replace(/\./g, '-');
  const tasks = [
    {
      id: `${baseId}-discover`,
      title: `Confirm implementation boundaries for ${entry.title}`,
      depends_on: [],
      artifacts: ['CONTEXT.md'],
      validation: ['Decisions, assumptions, and deferred ideas recorded'],
      wave_hint: 1,
      delegate_hint: 'claude',
      status: 'pending'
    },
    {
      id: `${baseId}-plan`,
      title: `Author canonical execution plan for ${entry.title}`,
      depends_on: [`${baseId}-discover`],
      artifacts: ['PLAN.md', 'TASKS.md', 'TASK-GRAPH.json'],
      validation: ['Plan includes scope, sequencing, and validation coverage'],
      wave_hint: 1,
      delegate_hint: mode.strategy === 'dual' ? 'claude+codex' : 'claude',
      status: 'pending'
    }
  ];

  if (mode.depth === 'deep') {
    tasks.push({
      id: `${baseId}-stress`,
      title: `Stress test the plan against edge cases and validation coverage`,
      depends_on: [`${baseId}-plan`],
      artifacts: ['DELIBERATION/synthesis.json'],
      validation: ['Agreed, dismissed, and unresolved buckets captured'],
      wave_hint: 2,
      delegate_hint: mode.strategy === 'dual' ? 'codex' : 'claude',
      status: 'pending'
    });
  }

  return tasks;
}

function createContext(entry, mode) {
  return [
    '# Context',
    '',
    `Feature: ${entry.number} ${entry.title}`,
    `Mode: ${mode.depth}/${mode.strategy}`,
    '',
    '## Locked Decisions',
    '',
    '- None recorded yet.',
    '',
    '## Assumptions',
    '',
    '- Preserve roadmap-defined scope.',
    '',
    '## Deferred Ideas',
    '',
    '- Capture future ideas here instead of expanding phase scope.',
    '',
    '## Option Traceability',
    '',
    '- Add option comparison notes during discuss-phase and dual planning review.',
    ''
  ].join('\n');
}

function createPlan(entry, mode, topology) {
  return [
    '# Plan',
    '',
    `Feature: ${entry.number} ${entry.title}`,
    `Mode: ${mode.depth}/${mode.strategy}`,
    `Topology: ${topology}`,
    '',
    '## Objective',
    '',
    `Deliver ${entry.title} within the roadmap-defined phase boundary.`,
    '',
    '## Scope',
    '',
    '- Keep the roadmap feature boundary fixed.',
    '- Generate canonical artifacts under `.planning/phases/<nn>-<slug>/`.',
    '',
    '## Execution Strategy',
    '',
    mode.strategy === 'dual'
      ? '- Claude remains the canonical writer; Codex acts as independent planner/critic.'
      : '- Claude remains the sole planner and writer for this phase.',
    mode.depth === 'deep'
      ? '- Use evidence hierarchy, challenge/defense, and synthesis buckets before finalizing the plan.'
      : '- Use a lighter merge path focused on quick artifact generation and basic validation.',
    '',
    '## Tasks',
    '',
    '1. Confirm decisions and assumptions in `CONTEXT.md`.',
    '2. Sequence work into an executable task graph.',
    '3. Define validation coverage and export readiness.',
    '',
    '## Validation',
    '',
    '- Task graph schema is complete.',
    '- Required artifacts exist and remain canonical under `.planning/`.',
    '- Deliberation outputs, if present, are local planning evidence and not alternate sources of truth.',
    ''
  ].join('\n');
}

function createTasks(entry, taskGraph) {
  return [
    '# Tasks',
    '',
    `Feature: ${entry.number} ${entry.title}`,
    '',
    ...taskGraph.map(task => `- [ ] ${task.id}: ${task.title}`),
    ''
  ].join('\n');
}

function commandAvailable(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { ok: result.status === 0, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

function getPackageRoot() {
  return path.resolve(__dirname, '..');
}

function runCodexIndependentProposal(cwd, resolved, mode, packetPath) {
  const packageRoot = getPackageRoot();
  const wrapperPath = path.join(packageRoot, 'wrappers', 'codex-wrapper.sh');
  const packet = read(packetPath) || '{}';
  const prompt = [
    'You are the secondary planner/critic for a software planning workflow.',
    'Produce an independent plan proposal or critique grounded in the provided packet.',
    `Mode: ${mode.depth}/${mode.strategy}`,
    `Feature: ${resolved.entry.number} ${resolved.entry.title}`,
    'Return concise markdown with sections: Summary, Risks, Validation, Recommended Revisions.',
    '',
    packet
  ].join('\n');

  if (!fs.existsSync(wrapperPath)) {
    return { ok: false, reason: 'wrapper-missing', content: '# Codex proposal unavailable\n\nWrapper script missing.\n' };
  }

  const result = spawnSync(wrapperPath, ['new', prompt, mode.depth === 'deep' ? 'xhigh' : 'high'], {
    cwd,
    encoding: 'utf8',
    timeout: 180000
  });

  if (result.status !== 0) {
    return {
      ok: false,
      reason: 'codex-unavailable',
      content: `# Codex proposal unavailable\n\n${(result.stderr || result.stdout || 'Codex wrapper failed').trim()}\n`
    };
  }

  const lines = (result.stdout || '').split('\n');
  const sessionId = lines.shift();
  return {
    ok: true,
    session_id: sessionId,
    content: lines.join('\n').trim() + '\n'
  };
}

function createSynthesis(mode, codexResult) {
  const synthesis = {
    generated_at: nowIso(),
    mode,
    evidence_hierarchy: ['execution', 'file-citation', 'reasoning-only'],
    buckets: {
      agreed: [],
      dismissed: [],
      unresolved: []
    }
  };

  if (mode.strategy === 'dual') {
    if (codexResult.ok) {
      synthesis.buckets.unresolved.push('Review Codex independent proposal and decide which challenges must modify the canonical plan.');
    } else {
      synthesis.buckets.unresolved.push(`Secondary planner unavailable: ${codexResult.reason}`);
    }
  }

  if (mode.depth === 'deep') {
    synthesis.buckets.agreed.push('Persist deliberation state before finalizing canonical artifacts.');
  } else {
    synthesis.buckets.dismissed.push('Deep stress-test omitted in quick mode.');
  }

  return synthesis;
}

function nextEntry(entries, currentSlug) {
  const index = entries.findIndex(entry => entry.slug === currentSlug);
  if (index === -1) return null;
  return entries.slice(index + 1).find(entry => entry.status !== 'done' && entry.status !== 'complete') || null;
}

function initSolution(cwd, args) {
  const mode = modeFromArgs(args);
  const forceMode = args.includes('--force-greenfield') ? 'greenfield' : args.includes('--force-brownfield') ? 'brownfield' : null;
  const detected = detectProjectType(cwd, forceMode);

  ensurePlanningDirs(cwd);
  writeIfMissing(path.join(cwd, '.planning', 'BLUEPRINT.md'), [
    '# Solution Blueprint',
    '',
    `Project type: ${detected.project_type}`,
    `Default orchestration mode: ${mode.depth}/${mode.strategy}`,
    '',
    '## Intent',
    '',
    '- Keep `.planning/` canonical.',
    '- Use Claude as canonical writer.',
    '- Use Codex as a secondary planner/critic in dual mode.',
    '- Support adapter exports without transferring source-of-truth ownership.',
    ''
  ].join('\n'));
  writeIfMissing(path.join(cwd, '.planning', 'ROADMAP.md'), createRoadmapTemplate());
  writeIfMissing(path.join(cwd, '.planning', 'backlog', 'ideas.md'), '# Backlog Ideas\n');
  writeIfMissing(path.join(cwd, '.planning', 'backlog', 'deferred.md'), '# Deferred Ideas\n');

  const entries = parseRoadmap(cwd);
  writeState(cwd, {
    current_feature_ref: entries[0] ? entries[0].slug : null,
    next_feature_ref: entries[1] ? entries[1].slug : null,
    current_phase_dir: entries[0] ? `.planning/phases/${entries[0].number}-${entries[0].slug}` : null,
    solution_status: 'initialized',
    last_command: 'stratum init-solution',
    last_updated: nowIso(),
    orchestration_mode: `${mode.depth}-${mode.strategy}`
  });

  output({
    ok: true,
    command: 'init-solution',
    mode,
    ...detected,
    created: [
      '.planning/BLUEPRINT.md',
      '.planning/ROADMAP.md',
      '.planning/STATE.md',
      '.planning/backlog/ideas.md',
      '.planning/backlog/deferred.md'
    ]
  });
}

function discussPhase(cwd, ref, args) {
  const mode = modeFromArgs(args);
  const resolved = resolveFeature(cwd, ref);
  ensureDir(resolved.phaseDir);
  write(path.join(resolved.phaseDir, 'CONTEXT.md'), createContext(resolved.entry, mode));
  const next = nextEntry(resolved.entries, resolved.entry.slug);
  writeState(cwd, {
    current_feature_ref: resolved.entry.slug,
    next_feature_ref: next ? next.slug : null,
    current_phase_dir: `.planning/phases/${resolved.phaseDirName}`,
    solution_status: 'context-ready',
    last_command: 'stratum discuss-phase',
    last_updated: nowIso()
  });
  output({
    ok: true,
    command: 'discuss-phase',
    feature_ref: resolved.entry.slug,
    phase_dir: `.planning/phases/${resolved.phaseDirName}`,
    context_path: `.planning/phases/${resolved.phaseDirName}/CONTEXT.md`
  });
}

function planPhase(cwd, ref, args) {
  const mode = modeFromArgs(args);
  const resolved = resolveFeature(cwd, ref);
  ensureDir(resolved.phaseDir);
  ensureDir(path.join(resolved.phaseDir, 'DELIBERATION'));

  const packet = packetForPhase(cwd, resolved, mode);
  const packetPath = path.join(resolved.phaseDir, 'DELIBERATION', 'packet.json');
  write(packetPath, JSON.stringify(packet, null, 2) + '\n');
  write(path.join(resolved.phaseDir, 'DELIBERATION', 'topology.json'), JSON.stringify({
    topology: topologyForMode(mode),
    mode,
    independent_round: mode.strategy === 'dual',
    challenge_round: mode.strategy === 'dual' && mode.depth === 'deep',
    stress_test_round: mode.depth === 'deep'
  }, null, 2) + '\n');

  write(path.join(resolved.phaseDir, 'CONTEXT.md'), createContext(resolved.entry, mode));
  const taskGraph = makeTaskGraph(resolved.entry, mode);
  const codexResult = mode.strategy === 'dual'
    ? runCodexIndependentProposal(cwd, resolved, mode, packetPath)
    : { ok: false, reason: 'single-mode', content: '# No secondary proposal\n\nSingle mode does not run Codex.\n' };

  write(path.join(resolved.phaseDir, 'DELIBERATION', 'codex-independent.md'), codexResult.content);
  if (codexResult.session_id) {
    write(path.join(resolved.phaseDir, 'DELIBERATION', 'session.json'), JSON.stringify({
      codex_session_id: codexResult.session_id,
      generated_at: nowIso()
    }, null, 2) + '\n');
  }

  const synthesis = createSynthesis(mode, codexResult);
  write(path.join(resolved.phaseDir, 'DELIBERATION', 'synthesis.json'), JSON.stringify(synthesis, null, 2) + '\n');
  write(path.join(resolved.phaseDir, 'PLAN.md'), createPlan(resolved.entry, mode, topologyForMode(mode)));
  write(path.join(resolved.phaseDir, 'TASKS.md'), createTasks(resolved.entry, taskGraph));
  write(path.join(resolved.phaseDir, 'TASK-GRAPH.json'), JSON.stringify(taskGraph, null, 2) + '\n');

  const next = nextEntry(resolved.entries, resolved.entry.slug);
  writeState(cwd, {
    current_feature_ref: resolved.entry.slug,
    next_feature_ref: next ? next.slug : null,
    current_phase_dir: `.planning/phases/${resolved.phaseDirName}`,
    solution_status: 'planned',
    last_command: 'stratum plan-phase',
    last_updated: nowIso(),
    orchestration_mode: `${mode.depth}-${mode.strategy}`
  });

  output({
    ok: true,
    command: 'plan-phase',
    mode,
    topology: topologyForMode(mode),
    feature_ref: resolved.entry.slug,
    phase_dir: `.planning/phases/${resolved.phaseDirName}`,
    artifacts: [
      `.planning/phases/${resolved.phaseDirName}/CONTEXT.md`,
      `.planning/phases/${resolved.phaseDirName}/PLAN.md`,
      `.planning/phases/${resolved.phaseDirName}/TASKS.md`,
      `.planning/phases/${resolved.phaseDirName}/TASK-GRAPH.json`,
      `.planning/phases/${resolved.phaseDirName}/DELIBERATION/packet.json`,
      `.planning/phases/${resolved.phaseDirName}/DELIBERATION/synthesis.json`
    ],
    secondary_planner: {
      enabled: mode.strategy === 'dual',
      available: codexResult.ok,
      reason: codexResult.ok ? null : codexResult.reason
    }
  });
}

function challengePlan(cwd, ref, args) {
  const mode = modeFromArgs(args);
  const pathIndex = args.indexOf('--path');
  let planPath = null;
  let phaseDir = null;
  let entry = null;

  if (pathIndex !== -1) {
    const supplied = args[pathIndex + 1];
    if (!supplied) die('--path requires a plan path');
    planPath = path.isAbsolute(supplied) ? supplied : path.join(cwd, supplied);
    phaseDir = path.dirname(planPath);
  } else {
    const resolved = resolveFeature(cwd, ref);
    entry = resolved.entry;
    phaseDir = resolved.phaseDir;
    planPath = path.join(phaseDir, 'PLAN.md');
  }

  if (!fs.existsSync(planPath)) die(`Plan not found: ${toPosix(path.relative(cwd, planPath))}`);
  ensureDir(path.join(phaseDir, 'DELIBERATION'));

  const planContent = read(planPath) || '';
  const reviewPath = path.join(phaseDir, 'DELIBERATION', 'challenge-review.md');
  const codexResult = mode.strategy === 'dual'
    ? runCodexIndependentProposal(cwd, { entry: entry || { number: '00', title: path.basename(phaseDir) } }, mode, planPath)
    : { ok: false, reason: 'single-mode', content: '# No secondary challenge\n\nSingle mode does not run Codex.\n' };

  write(path.join(phaseDir, 'DELIBERATION', 'challenge-codex.md'), codexResult.content);
  let revised = false;
  if (!planContent.includes('## Validation') || !planContent.includes('## Objective')) {
    revised = true;
    const title = entry ? entry.title : 'Recovered Plan';
    const number = entry ? entry.number : '00';
    write(planPath, createPlan({ number, title }, mode, topologyForMode(mode)));
  }
  write(reviewPath, revised
    ? '# Challenge Review\n\nPlan revised because required sections were missing.\n'
    : '# Challenge Review\n\nPlan stands. Review artifacts recorded for traceability.\n');

  output({
    ok: true,
    command: 'challenge-plan',
    mode,
    reviewed_plan: toPosix(path.relative(cwd, planPath)),
    review_path: toPosix(path.relative(cwd, reviewPath)),
    revised,
    secondary_planner: {
      enabled: mode.strategy === 'dual',
      available: codexResult.ok,
      reason: codexResult.ok ? null : codexResult.reason
    }
  });
}

function phaseStatus(cwd, ref) {
  const resolved = resolveFeature(cwd, ref);
  const phaseDir = resolved.phaseDir;
  const files = {
    context: fs.existsSync(path.join(phaseDir, 'CONTEXT.md')),
    plan: fs.existsSync(path.join(phaseDir, 'PLAN.md')),
    tasks: fs.existsSync(path.join(phaseDir, 'TASKS.md')),
    task_graph: fs.existsSync(path.join(phaseDir, 'TASK-GRAPH.json')),
    deliberation_packet: fs.existsSync(path.join(phaseDir, 'DELIBERATION', 'packet.json')),
    deliberation_synthesis: fs.existsSync(path.join(phaseDir, 'DELIBERATION', 'synthesis.json'))
  };

  const unresolved = [];
  if (!files.context) unresolved.push('CONTEXT.md missing');
  if (!files.plan) unresolved.push('PLAN.md missing');
  if (!files.tasks) unresolved.push('TASKS.md missing');
  if (!files.task_graph) unresolved.push('TASK-GRAPH.json missing');
  if (!files.deliberation_packet) unresolved.push('deliberation packet missing');
  if (!files.deliberation_synthesis) unresolved.push('deliberation synthesis missing');

  let qaState = 'incomplete';
  let exportReady = false;
  const graphRaw = read(path.join(phaseDir, 'TASK-GRAPH.json'));
  if (graphRaw) {
    try {
      const graph = JSON.parse(graphRaw);
      qaState = graph.every(item => Array.isArray(item.validation) && item.validation.length > 0) ? 'ready' : 'incomplete';
      exportReady = files.plan && files.tasks && files.task_graph;
    } catch {
      unresolved.push('TASK-GRAPH.json invalid');
    }
  }

  output({
    ok: true,
    command: 'phase-status',
    feature_ref: resolved.entry.slug,
    phase_dir: `.planning/phases/${resolved.phaseDirName}`,
    artifacts: files,
    unresolved_items: unresolved,
    qa_state: qaState,
    export_ready: exportReady
  });
}

function exportGsd(cwd, ref) {
  const resolved = resolveFeature(cwd, ref);
  const exportDir = path.join(cwd, '.planning', 'adapters', 'gsd', resolved.phaseDirName);
  ensureDir(exportDir);
  write(path.join(exportDir, 'README.md'), [
    '# GSD Export',
    '',
    `Source phase: ${resolved.entry.number}-${resolved.entry.slug}`,
    '',
    'This export is adapter-only. Canonical planning artifacts remain under `.planning/phases/`.',
    ''
  ].join('\n'));
  write(path.join(exportDir, 'phase.json'), JSON.stringify({
    feature_ref: resolved.entry.slug,
    phase_number: resolved.entry.number,
    source_dir: `.planning/phases/${resolved.phaseDirName}`,
    generated_at: nowIso()
  }, null, 2) + '\n');
  writeState(cwd, {
    exports: { gsd: `.planning/adapters/gsd/${resolved.phaseDirName}` },
    last_command: 'stratum export-gsd',
    last_updated: nowIso()
  });
  output({
    ok: true,
    command: 'export-gsd',
    export_dir: `.planning/adapters/gsd/${resolved.phaseDirName}`
  });
}

function exportBeads(cwd, ref) {
  const resolved = resolveFeature(cwd, ref);
  const graphPath = path.join(resolved.phaseDir, 'TASK-GRAPH.json');
  const graphRaw = read(graphPath);
  if (!graphRaw) die(`TASK-GRAPH.json not found for ${resolved.entry.slug}`);
  const graph = JSON.parse(graphRaw);
  const exportDir = path.join(cwd, '.planning', 'adapters', 'beads', resolved.phaseDirName);
  ensureDir(exportDir);
  write(path.join(exportDir, 'tasks.json'), JSON.stringify({
    feature_ref: resolved.entry.slug,
    phase_number: resolved.entry.number,
    tasks: graph
  }, null, 2) + '\n');
  write(path.join(exportDir, 'README.md'), [
    '# Beads Export',
    '',
    `Feature: ${resolved.entry.slug}`,
    '',
    ...graph.map(task => `- ${task.id}: ${task.title}`),
    ''
  ].join('\n'));
  writeState(cwd, {
    exports: { beads: `.planning/adapters/beads/${resolved.phaseDirName}` },
    last_command: 'stratum export-beads',
    last_updated: nowIso()
  });
  output({
    ok: true,
    command: 'export-beads',
    export_dir: `.planning/adapters/beads/${resolved.phaseDirName}`,
    task_count: graph.length
  });
}

function doctor(cwd, args) {
  const state = readState(cwd);
  const hooksRequired = args.includes('--hooks') || Boolean(state.learning && state.learning.enabled);
  const packageRoot = getPackageRoot();
  const checks = [];
  const codex = commandAvailable('codex');
  checks.push({ name: 'codex-cli', ok: codex.ok, detail: codex.ok ? codex.stdout : codex.stderr || 'codex unavailable' });
  const wrapperPath = path.join(packageRoot, 'wrappers', 'codex-wrapper.sh');
  checks.push({ name: 'codex-wrapper', ok: fs.existsSync(wrapperPath), detail: wrapperPath });
  checks.push({ name: 'command-assets', ok: fs.existsSync(path.join(packageRoot, '..', 'commands', 'stratum')), detail: path.join(packageRoot, '..', 'commands', 'stratum') });
  checks.push({ name: 'adapter-gsd', ok: fs.existsSync(path.join(packageRoot, '..', 'adapters', 'gsd', 'README.md')), detail: path.join(packageRoot, '..', 'adapters', 'gsd', 'README.md') });
  checks.push({ name: 'adapter-beads', ok: fs.existsSync(path.join(packageRoot, '..', 'adapters', 'beads', 'README.md')), detail: path.join(packageRoot, '..', 'adapters', 'beads', 'README.md') });
  if (hooksRequired) {
    checks.push({ name: 'learning-enabled', ok: true, detail: 'Hooks requested; sidecar support remains opt-in.' });
  }
  output({
    ok: checks.every(check => check.ok),
    command: 'doctor',
    hooks_checked: hooksRequired,
    checks
  });
}

function help() {
  process.stdout.write(`stratum-tools

Commands:
  init-solution [--single|--dual] [--quick|--deep]
  discuss-phase <feature-ref|--next>
  plan-phase <feature-ref|--next> [--single|--dual] [--quick|--deep]
  challenge-plan <feature-ref|--path <plan-path>> [--single|--dual] [--quick|--deep]
  phase-status <feature-ref|--next>
  export-gsd <feature-ref|--next>
  export-beads <feature-ref|--next>
  doctor [--hooks]
`);
}

function main() {
  const [command, firstArg, ...rest] = process.argv.slice(2);
  const cwd = process.cwd();
  if (!command || command === 'help') return help();
  if (command === 'init-solution') return initSolution(cwd, [firstArg, ...rest].filter(Boolean));
  if (command === 'discuss-phase') return discussPhase(cwd, firstArg, rest);
  if (command === 'plan-phase') return planPhase(cwd, firstArg, rest);
  if (command === 'challenge-plan') return challengePlan(cwd, firstArg === '--path' ? null : firstArg, firstArg === '--path' ? [firstArg, ...rest] : rest);
  if (command === 'phase-status') return phaseStatus(cwd, firstArg);
  if (command === 'export-gsd') return exportGsd(cwd, firstArg);
  if (command === 'export-beads') return exportBeads(cwd, firstArg);
  if (command === 'doctor') return doctor(cwd, [firstArg, ...rest].filter(Boolean));
  die(`Unknown command: ${command}`);
}

main();

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

function die(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function output(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'phase';
}

function normalizePhase(value) {
  const match = String(value || '').match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return String(value || '');
  const major = match[1].padStart(2, '0');
  return match[2] ? `${major}.${match[2]}` : major;
}

function hashId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function parseScalar(value) {
  const trimmed = String(value).trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, '');
}

function extractFrontmatter(content) {
  const match = String(content || '').match(/^---\n([\s\S]+?)\n---/);
  if (!match) return {};
  const result = {};
  let currentObject = null;
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const nested = line.match(/^\s{2}([a-zA-Z0-9_.-]+):\s*(.*)$/);
    if (nested && currentObject && typeof result[currentObject] === 'object' && !Array.isArray(result[currentObject])) {
      result[currentObject][nested[1]] = parseScalar(nested[2]);
      continue;
    }
    const keyMatch = line.match(/^([a-zA-Z0-9_.-]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const [, key, raw] = keyMatch;
    if (!raw.trim()) {
      result[key] = {};
      currentObject = key;
    } else {
      result[key] = parseScalar(raw);
      currentObject = null;
    }
  }
  return result;
}

function renderFrontmatter(value) {
  const lines = [];
  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      lines.push(`${key}:`);
      for (const [nestedKey, nestedValue] of Object.entries(item)) {
        lines.push(`  ${nestedKey}: ${nestedValue}`);
      }
    } else {
      lines.push(`${key}: ${item}`);
    }
  }
  return lines.join('\n');
}

function readState(cwd) {
  const content = read(path.join(cwd, '.planning', 'STATE.md'));
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
    orchestration_mode: 'deep-dual',
    exports: { gsd: 'not-exported', beads: 'not-exported' },
    learning: { enabled: false },
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

function detectProjectType(cwd, forceMode) {
  if (forceMode === 'greenfield') return { project_type: 'greenfield', has_code: false, has_manifest: false };
  if (forceMode === 'brownfield') return { project_type: 'brownfield', has_code: true, has_manifest: true };

  const codeExts = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.rb', '.swift']);
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
  return { project_type: hasCode || hasManifest ? 'brownfield' : 'greenfield', has_code: hasCode, has_manifest: hasManifest };
}

function ensurePlanningDirs(cwd) {
  ensureDir(path.join(cwd, '.planning', 'backlog'));
  ensureDir(path.join(cwd, '.planning', 'phases'));
  ensureDir(path.join(cwd, '.planning', 'adapters', 'gsd'));
  ensureDir(path.join(cwd, '.planning', 'adapters', 'beads'));
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

function nextEntry(entries, currentSlug) {
  const index = entries.findIndex(entry => entry.slug === currentSlug);
  if (index === -1) return null;
  return entries.slice(index + 1).find(entry => !['done', 'complete'].includes(entry.status)) || null;
}

function resolveFeature(cwd, ref) {
  const entries = parseRoadmap(cwd);
  if (!entries.length) die('No phases found in .planning/ROADMAP.md');
  const state = readState(cwd);
  let entry = null;

  if (!ref || ref === '--next') {
    entry = entries.find(candidate => candidate.slug === state.next_feature_ref || candidate.number === normalizePhase(state.next_feature_ref));
    if (!entry && state.current_feature_ref) {
      entry = nextEntry(entries, state.current_feature_ref);
    }
    if (!entry) {
      entry = entries.find(candidate => !['done', 'complete'].includes(candidate.status)) || entries[0];
    }
  } else if (/^\d+(?:\.\d+)?$/.test(ref)) {
    entry = entries.find(candidate => candidate.number === normalizePhase(ref));
  } else {
    entry = entries.find(candidate => candidate.slug === slugify(ref));
  }

  if (!entry) die(`Phase not found: ${ref}`);
  const phaseDirName = `${entry.number}-${entry.slug}`;
  return {
    entry,
    entries,
    phaseDirName,
    phaseDir: path.join(cwd, '.planning', 'phases', phaseDirName)
  };
}

function parseOptions(args) {
  const depth = args.includes('--quick') ? 'quick' : 'deep';
  const strategy = args.includes('--single') ? 'single' : 'dual';

  let topology = null;
  const topologyIndex = args.indexOf('--topology');
  if (topologyIndex !== -1) topology = args[topologyIndex + 1] || null;
  if (!topology && args.includes('--council')) topology = 'council';
  if (!topology && args.includes('--round-robin')) topology = 'round-robin';
  if (!topology && args.includes('--critique')) topology = 'critique';
  if (!topology) {
    if (strategy === 'single' && depth === 'quick') topology = 'single-pass';
    else if (strategy === 'single') topology = 'single-with-qa';
    else if (depth === 'quick') topology = 'dual-light-merge';
    else topology = 'dual-argumentation';
  }

  let vendors = null;
  const vendorsIndex = args.indexOf('--vendors');
  if (vendorsIndex !== -1) {
    vendors = (args[vendorsIndex + 1] || '').split(',').map(item => item.trim()).filter(Boolean);
  }
  if (!vendors || !vendors.length) {
    if (strategy === 'single') vendors = ['claude'];
    else if (['council', 'round-robin'].includes(topology)) vendors = ['claude', 'codex', 'gemini'];
    else vendors = ['claude', 'codex'];
  }

  return { depth, strategy, topology, vendors };
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

function createBlueprint(projectType, options) {
  return [
    '# Solution Blueprint',
    '',
    `Project type: ${projectType}`,
    `Default mode: ${options.depth}/${options.strategy}`,
    `Default topology: ${options.topology}`,
    `Default vendors: ${options.vendors.join(', ')}`,
    '',
    '## Intent',
    '',
    '- Keep `.planning/` canonical.',
    '- Treat Claude as canonical writer.',
    '- Use external vendor delegates as independent planners and critics.',
    '- Persist deliberation state before canonical synthesis.',
    '- Export adapter views without transferring source-of-truth ownership.',
    ''
  ].join('\n');
}

function packetForPhase(cwd, resolved, options, commandName) {
  return {
    generated_at: nowIso(),
    command: commandName,
    mode: { depth: options.depth, strategy: options.strategy },
    topology: options.topology,
    vendors: options.vendors,
    blueprint_path: '.planning/BLUEPRINT.md',
    roadmap_path: '.planning/ROADMAP.md',
    state_path: '.planning/STATE.md',
    feature_ref: resolved.entry.slug,
    phase_number: resolved.entry.number,
    phase_dir: `.planning/phases/${resolved.phaseDirName}`,
    title: resolved.entry.title,
    dependencies: resolved.entry.depends_on,
    success_criteria: resolved.entry.success_criteria
  };
}

function getPackageRoot() {
  return path.resolve(__dirname, '..');
}

function wrapperPath(vendor) {
  return path.join(getPackageRoot(), 'wrappers', `${vendor}-wrapper.sh`);
}

function vendorRole(vendor, topology) {
  const byTopology = {
    'dual-argumentation': { claude: 'canonical-writer', codex: 'independent-critic' },
    'dual-light-merge': { claude: 'canonical-writer', codex: 'light-reviewer' },
    'council': { claude: 'maintainer', codex: 'architect', gemini: 'skeptic' },
    'round-robin': { claude: 'synthesizer', codex: 'structural-architect', gemini: 'red-team' },
    'critique': { claude: 'author', codex: 'critic', gemini: 'critic' }
  };
  return (byTopology[topology] && byTopology[topology][vendor]) || 'reviewer';
}

function effortForOptions(options) {
  return options.depth === 'deep' ? 'xhigh' : 'high';
}

function safeSummary(markdown) {
  return String(markdown || '')
    .replace(/^#+\s*/gm, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join('\n');
}

function invokeVendor(vendor, action, sessionId, prompt, options, cwd) {
  const wrapper = wrapperPath(vendor);
  if (!fs.existsSync(wrapper)) {
    return { ok: false, vendor, reason: 'wrapper-missing', content: `# ${vendor}\n\nWrapper missing.\n`, session_id: sessionId || null };
  }

  const args = action === 'new'
    ? ['new', prompt, effortForOptions(options)]
    : ['resume', sessionId || hashId(vendor), prompt, effortForOptions(options)];

  const result = spawnSync(wrapper, args, {
    cwd,
    encoding: 'utf8',
    timeout: 240000,
    env: process.env
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || '').trim() || `${vendor} invocation failed`;
    return { ok: false, vendor, reason: 'vendor-unavailable', content: `# ${vendor}\n\n${stderr}\n`, session_id: sessionId || null };
  }

  const lines = (result.stdout || '').split('\n');
  if (action === 'new') {
    const generatedSession = lines.shift() || hashId(vendor);
    return { ok: true, vendor, session_id: generatedSession.trim(), content: lines.join('\n').trim() + '\n' };
  }
  return { ok: true, vendor, session_id: sessionId || hashId(vendor), content: (result.stdout || '').trim() + '\n' };
}

function independentPrompt(packet, vendor, topology, commandName) {
  return [
    `You are participating in a ${topology} planning council for ${commandName}.`,
    `Vendor role: ${vendorRole(vendor, topology)}.`,
    'Provide an independent position before seeing peer responses.',
    'Ground the answer in scope, dependency order, validation completeness, and risks.',
    'Return markdown with sections: Summary, Concerns, Validation, Recommended Revisions.',
    '',
    JSON.stringify(packet, null, 2)
  ].join('\n');
}

function critiquePrompt(packet, vendor, topology, peerSummaries, actionLabel) {
  return [
    `You are in round 2 of a ${topology} planning council.`,
    `Vendor role: ${vendorRole(vendor, topology)}.`,
    `Review peer positions and ${actionLabel}.`,
    'Keep the answer in markdown with sections: Revised Position, Challenges, Evidence Needs, Final Recommendation.',
    '',
    'Peer summaries:',
    peerSummaries.map(item => `## ${item.vendor}\n${item.summary}`).join('\n\n'),
    '',
    'Canonical packet:',
    JSON.stringify(packet, null, 2)
  ].join('\n');
}

function roundRobinPrompt(packet, vendor, topology, priorNotes, roundLabel) {
  const priorText = priorNotes.length ? priorNotes.map(note => `## ${note.vendor}\n${note.summary}`).join('\n\n') : 'None yet.';
  return [
    `You are taking part in a ${topology} deliberation (${roundLabel}).`,
    `Vendor role: ${vendorRole(vendor, topology)}.`,
    'Respond to the accumulated notes so far and extend or challenge them.',
    'Return markdown with sections: Position, Additions, Challenges, Validation.',
    '',
    'Accumulated notes:',
    priorText,
    '',
    'Canonical packet:',
    JSON.stringify(packet, null, 2)
  ].join('\n');
}

function writeRoundArtifact(roundDir, artifact) {
  write(path.join(roundDir, `${artifact.vendor}.md`), artifact.content);
  write(path.join(roundDir, `${artifact.vendor}.json`), JSON.stringify({
    vendor: artifact.vendor,
    ok: artifact.ok,
    reason: artifact.reason || null,
    session_id: artifact.session_id || null,
    generated_at: nowIso()
  }, null, 2) + '\n');
}

function buildSynthesis(packet, roundRecords, options) {
  const availableVendors = roundRecords.flatMap(round => round.artifacts.filter(item => item.ok).map(item => item.vendor));
  const unavailable = roundRecords.flatMap(round => round.artifacts.filter(item => !item.ok).map(item => `${item.vendor}: ${item.reason}`));

  const agreed = [
    `Topology used: ${options.topology}`,
    `Vendors consulted: ${packet.vendors.join(', ')}`
  ];
  const dismissed = [];
  const unresolved = [];

  if (options.depth === 'quick') dismissed.push('Deep stress-test omitted in quick mode.');
  if (options.strategy === 'single') dismissed.push('Secondary vendor critique omitted in single mode.');
  if (unavailable.length) unresolved.push(...unavailable);
  if (options.topology === 'round-robin') {
    agreed.push('Serial accumulation was used to reduce convergence pressure between vendors.');
  }
  if (options.topology === 'council') {
    agreed.push('Independent round plus critique/revision round completed before synthesis.');
  }
  if (!availableVendors.length) {
    unresolved.push('No vendor delegates succeeded; canonical synthesis should not be trusted without manual review.');
  } else {
    unresolved.push('Review round artifacts before locking the final canonical plan.');
  }

  return {
    generated_at: nowIso(),
    packet,
    rounds: roundRecords.map(round => ({
      name: round.name,
      vendors: round.artifacts.map(item => ({ vendor: item.vendor, ok: item.ok, session_id: item.session_id || null, reason: item.reason || null }))
    })),
    evidence_hierarchy: ['execution', 'file-citation', 'reasoning-only'],
    buckets: { agreed, dismissed, unresolved }
  };
}

function runCouncil(cwd, resolved, options, commandName, anchorContent = null) {
  const deliberationDir = path.join(resolved.phaseDir, 'DELIBERATION');
  ensureDir(deliberationDir);

  const packet = packetForPhase(cwd, resolved, options, commandName);
  if (anchorContent) packet.anchor_plan = anchorContent;
  write(path.join(deliberationDir, 'packet.json'), JSON.stringify(packet, null, 2) + '\n');
  write(path.join(deliberationDir, 'topology.json'), JSON.stringify({
    topology: options.topology,
    mode: { depth: options.depth, strategy: options.strategy },
    vendors: options.vendors
  }, null, 2) + '\n');

  const roundRecords = [];
  const sessions = {};

  if (options.topology === 'round-robin') {
    const round1Dir = path.join(deliberationDir, 'round-1');
    ensureDir(round1Dir);
    const priorNotes = [];
    const round1Artifacts = [];
    for (const vendor of options.vendors) {
      const artifact = invokeVendor(vendor, 'new', null, roundRobinPrompt(packet, vendor, options.topology, priorNotes, 'round-1'), options, cwd);
      if (artifact.session_id) sessions[vendor] = artifact.session_id;
      writeRoundArtifact(round1Dir, artifact);
      round1Artifacts.push(artifact);
      priorNotes.push({ vendor, summary: safeSummary(artifact.content) });
    }
    roundRecords.push({ name: 'round-1', artifacts: round1Artifacts });

    const round2Dir = path.join(deliberationDir, 'round-2');
    ensureDir(round2Dir);
    const reversed = [...priorNotes].reverse();
    const round2Artifacts = [];
    for (const vendor of [...options.vendors].reverse()) {
      const peerNotes = reversed.filter(item => item.vendor !== vendor);
      const artifact = invokeVendor(vendor, 'resume', sessions[vendor], critiquePrompt(packet, vendor, options.topology, peerNotes, 'revise your position after serial cross-pollination'), options, cwd);
      writeRoundArtifact(round2Dir, artifact);
      round2Artifacts.push(artifact);
    }
    roundRecords.push({ name: 'round-2', artifacts: round2Artifacts });
  } else {
    const round1Dir = path.join(deliberationDir, 'round-1');
    ensureDir(round1Dir);
    const round1Artifacts = options.vendors.map(vendor => {
      const artifact = invokeVendor(vendor, 'new', null, independentPrompt(packet, vendor, options.topology, commandName), options, cwd);
      if (artifact.session_id) sessions[vendor] = artifact.session_id;
      writeRoundArtifact(round1Dir, artifact);
      return artifact;
    });
    roundRecords.push({ name: 'round-1', artifacts: round1Artifacts });

    if (options.strategy === 'dual' || ['council', 'critique'].includes(options.topology)) {
      const round2Dir = path.join(deliberationDir, 'round-2');
      ensureDir(round2Dir);
      const summaries = round1Artifacts.map(item => ({ vendor: item.vendor, summary: safeSummary(item.content) }));
      const actionLabel = options.topology === 'critique' ? 'attack weak assumptions in the peer positions' : 'revise your position after seeing peer responses';
      const round2Artifacts = options.vendors.map(vendor => {
        const peers = summaries.filter(item => item.vendor !== vendor);
        const artifact = invokeVendor(vendor, 'resume', sessions[vendor], critiquePrompt(packet, vendor, options.topology, peers, actionLabel), options, cwd);
        writeRoundArtifact(round2Dir, artifact);
        return artifact;
      });
      roundRecords.push({ name: 'round-2', artifacts: round2Artifacts });
    }
  }

  const synthesis = buildSynthesis(packet, roundRecords, options);
  write(path.join(deliberationDir, 'synthesis.json'), JSON.stringify(synthesis, null, 2) + '\n');
  write(path.join(deliberationDir, 'sessions.json'), JSON.stringify(sessions, null, 2) + '\n');

  return { packet, roundRecords, synthesis, sessions };
}

function taskGraphFor(entry, options) {
  const baseId = entry.number.replace(/\./g, '-');
  const graph = [
    {
      id: `${baseId}-context`,
      title: `Capture implementation context for ${entry.title}`,
      depends_on: [],
      artifacts: ['CONTEXT.md'],
      validation: ['Context exists and records decisions, assumptions, and deferred ideas'],
      wave_hint: 1,
      delegate_hint: 'claude',
      status: 'pending'
    },
    {
      id: `${baseId}-plan`,
      title: `Synthesize canonical plan for ${entry.title}`,
      depends_on: [`${baseId}-context`],
      artifacts: ['PLAN.md', 'TASKS.md', 'TASK-GRAPH.json'],
      validation: ['Canonical artifacts written after synthesis'],
      wave_hint: 1,
      delegate_hint: options.strategy === 'dual' ? options.vendors.join('+') : 'claude',
      status: 'pending'
    }
  ];

  if (options.strategy !== 'single' || ['council', 'round-robin', 'critique'].includes(options.topology)) {
    graph.push({
      id: `${baseId}-deliberate`,
      title: `Run ${options.topology} deliberation before locking the plan`,
      depends_on: [`${baseId}-context`],
      artifacts: ['DELIBERATION/packet.json', 'DELIBERATION/synthesis.json'],
      validation: ['Round artifacts persisted', 'Synthesis buckets recorded'],
      wave_hint: 1,
      delegate_hint: options.vendors.join('+'),
      status: 'pending'
    });
  }

  if (options.depth === 'deep') {
    graph.push({
      id: `${baseId}-stress`,
      title: 'Stress test dependency order, validation completeness, and risks',
      depends_on: graph.filter(task => task.id !== `${baseId}-stress`).map(task => task.id),
      artifacts: ['DELIBERATION/synthesis.json'],
      validation: ['Unresolved items explicitly recorded'],
      wave_hint: 2,
      delegate_hint: options.vendors.join('+'),
      status: 'pending'
    });
  }

  return graph;
}

function createContext(entry, options) {
  return [
    '# Context',
    '',
    `Feature: ${entry.number} ${entry.title}`,
    `Mode: ${options.depth}/${options.strategy}`,
    `Topology: ${options.topology}`,
    `Vendors: ${options.vendors.join(', ')}`,
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
    '- Record follow-on ideas here instead of expanding the phase boundary.',
    '',
    '## Option Traceability',
    '',
    '- Populate from `DELIBERATION/` after vendor rounds complete.',
    ''
  ].join('\n');
}

function createPlan(entry, options, synthesis) {
  const buckets = synthesis.buckets;
  return [
    '# Plan',
    '',
    `Feature: ${entry.number} ${entry.title}`,
    `Mode: ${options.depth}/${options.strategy}`,
    `Topology: ${options.topology}`,
    `Vendors: ${options.vendors.join(', ')}`,
    '',
    '## Objective',
    '',
    `Deliver ${entry.title} within the roadmap-defined phase boundary.`,
    '',
    '## Scope',
    '',
    '- Keep the roadmap boundary fixed.',
    '- Use `.planning/` as the only source of truth.',
    '- Treat exports as adapter outputs only.',
    '',
    '## Execution Strategy',
    '',
    options.strategy === 'single'
      ? '- Single-writer path: canonical artifacts synthesized without external vendor delegates.'
      : '- Multi-vendor path: run deliberation rounds first, then synthesize canonical artifacts.',
    `- Topology preset: ${options.topology}.`,
    '',
    '## Synthesis Buckets',
    '',
    ...buckets.agreed.map(item => `- Agreed: ${item}`),
    ...buckets.dismissed.map(item => `- Dismissed: ${item}`),
    ...buckets.unresolved.map(item => `- Unresolved: ${item}`),
    '',
    '## Validation',
    '',
    '- Task graph contains validation expectations for each task.',
    '- Deliberation artifacts remain local planning evidence under `DELIBERATION/`.',
    '- Export directories do not become alternate sources of truth.',
    ''
  ].join('\n');
}

function createTasks(entry, graph) {
  return [
    '# Tasks',
    '',
    `Feature: ${entry.number} ${entry.title}`,
    '',
    ...graph.map(task => `- [ ] ${task.id}: ${task.title}`),
    ''
  ].join('\n');
}

function initSolution(cwd, args) {
  const options = parseOptions(args);
  const forceMode = args.includes('--force-greenfield') ? 'greenfield' : args.includes('--force-brownfield') ? 'brownfield' : null;
  const detected = detectProjectType(cwd, forceMode);
  ensurePlanningDirs(cwd);
  writeIfMissing(path.join(cwd, '.planning', 'BLUEPRINT.md'), createBlueprint(detected.project_type, options));
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
    orchestration_mode: `${options.depth}-${options.strategy}`,
    learning: { enabled: false }
  });
  output({
    ok: true,
    command: 'init-solution',
    mode: { depth: options.depth, strategy: options.strategy },
    topology: options.topology,
    vendors: options.vendors,
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
  const options = parseOptions(args);
  const resolved = resolveFeature(cwd, ref);
  ensureDir(resolved.phaseDir);
  write(path.join(resolved.phaseDir, 'CONTEXT.md'), createContext(resolved.entry, options));
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
  const options = parseOptions(args);
  const resolved = resolveFeature(cwd, ref);
  ensureDir(resolved.phaseDir);
  write(path.join(resolved.phaseDir, 'CONTEXT.md'), createContext(resolved.entry, options));
  const council = options.strategy === 'single' && !['council', 'round-robin', 'critique'].includes(options.topology)
    ? { synthesis: buildSynthesis(packetForPhase(cwd, resolved, options, 'plan-phase'), [], options), roundRecords: [] }
    : runCouncil(cwd, resolved, options, 'plan-phase');
  const graph = taskGraphFor(resolved.entry, options);
  write(path.join(resolved.phaseDir, 'PLAN.md'), createPlan(resolved.entry, options, council.synthesis));
  write(path.join(resolved.phaseDir, 'TASKS.md'), createTasks(resolved.entry, graph));
  write(path.join(resolved.phaseDir, 'TASK-GRAPH.json'), JSON.stringify(graph, null, 2) + '\n');
  const next = nextEntry(resolved.entries, resolved.entry.slug);
  writeState(cwd, {
    current_feature_ref: resolved.entry.slug,
    next_feature_ref: next ? next.slug : null,
    current_phase_dir: `.planning/phases/${resolved.phaseDirName}`,
    solution_status: 'planned',
    last_command: 'stratum plan-phase',
    last_updated: nowIso(),
    orchestration_mode: `${options.depth}-${options.strategy}`
  });
  output({
    ok: true,
    command: 'plan-phase',
    mode: { depth: options.depth, strategy: options.strategy },
    topology: options.topology,
    vendors: options.vendors,
    feature_ref: resolved.entry.slug,
    phase_dir: `.planning/phases/${resolved.phaseDirName}`,
    rounds: council.roundRecords.map(item => ({ name: item.name, vendors: item.artifacts.map(artifact => ({ vendor: artifact.vendor, ok: artifact.ok })) })),
    artifacts: [
      `.planning/phases/${resolved.phaseDirName}/CONTEXT.md`,
      `.planning/phases/${resolved.phaseDirName}/PLAN.md`,
      `.planning/phases/${resolved.phaseDirName}/TASKS.md`,
      `.planning/phases/${resolved.phaseDirName}/TASK-GRAPH.json`,
      `.planning/phases/${resolved.phaseDirName}/DELIBERATION/synthesis.json`
    ]
  });
}

function challengePlan(cwd, ref, args) {
  const options = parseOptions(args);
  const pathIndex = args.indexOf('--path');
  let planPath;
  let resolved;

  if (pathIndex !== -1) {
    const supplied = args[pathIndex + 1];
    if (!supplied) die('--path requires a plan path');
    planPath = path.isAbsolute(supplied) ? supplied : path.join(cwd, supplied);
    const phaseDir = path.dirname(planPath);
    resolved = {
      entry: { number: path.basename(phaseDir).split('-')[0] || '00', title: path.basename(phaseDir), slug: slugify(path.basename(phaseDir)) },
      entries: [],
      phaseDirName: path.basename(phaseDir),
      phaseDir
    };
  } else {
    resolved = resolveFeature(cwd, ref);
    planPath = path.join(resolved.phaseDir, 'PLAN.md');
  }

  if (!fs.existsSync(planPath)) die(`Plan not found: ${toPosix(path.relative(cwd, planPath))}`);
  const planContent = read(planPath) || '';
  const council = runCouncil(cwd, resolved, options, 'challenge-plan', planContent);
  let revised = false;
  if (!planContent.includes('## Validation') || !planContent.includes('## Objective')) {
    revised = true;
    write(planPath, createPlan(resolved.entry, options, council.synthesis));
  }
  write(path.join(resolved.phaseDir, 'DELIBERATION', 'challenge-review.md'), revised
    ? '# Challenge Review\n\nPlan revised because required sections were missing.\n'
    : '# Challenge Review\n\nPlan stands. Review artifacts recorded for synthesis traceability.\n');
  output({
    ok: true,
    command: 'challenge-plan',
    mode: { depth: options.depth, strategy: options.strategy },
    topology: options.topology,
    vendors: options.vendors,
    revised,
    reviewed_plan: toPosix(path.relative(cwd, planPath)),
    review_path: `.planning/phases/${resolved.phaseDirName}/DELIBERATION/challenge-review.md`
  });
}

function phaseStatus(cwd, ref) {
  const resolved = resolveFeature(cwd, ref);
  const artifacts = {
    context: fs.existsSync(path.join(resolved.phaseDir, 'CONTEXT.md')),
    plan: fs.existsSync(path.join(resolved.phaseDir, 'PLAN.md')),
    tasks: fs.existsSync(path.join(resolved.phaseDir, 'TASKS.md')),
    task_graph: fs.existsSync(path.join(resolved.phaseDir, 'TASK-GRAPH.json')),
    deliberation_packet: fs.existsSync(path.join(resolved.phaseDir, 'DELIBERATION', 'packet.json')),
    deliberation_synthesis: fs.existsSync(path.join(resolved.phaseDir, 'DELIBERATION', 'synthesis.json')),
    round_one: fs.existsSync(path.join(resolved.phaseDir, 'DELIBERATION', 'round-1')),
    round_two: fs.existsSync(path.join(resolved.phaseDir, 'DELIBERATION', 'round-2'))
  };
  const unresolved = [];
  for (const [name, ok] of Object.entries(artifacts)) {
    if (!ok && !['round_two'].includes(name)) unresolved.push(`${name} missing`);
  }
  let qaState = 'incomplete';
  let exportReady = false;
  const graphRaw = read(path.join(resolved.phaseDir, 'TASK-GRAPH.json'));
  if (graphRaw) {
    try {
      const graph = JSON.parse(graphRaw);
      qaState = graph.every(item => Array.isArray(item.validation) && item.validation.length > 0) ? 'ready' : 'incomplete';
      exportReady = artifacts.plan && artifacts.tasks && artifacts.task_graph;
    } catch {
      unresolved.push('TASK-GRAPH.json invalid');
    }
  }
  output({
    ok: true,
    command: 'phase-status',
    feature_ref: resolved.entry.slug,
    phase_dir: `.planning/phases/${resolved.phaseDirName}`,
    artifacts,
    unresolved_items: unresolved,
    qa_state: qaState,
    export_ready: exportReady
  });
}

function exportGsd(cwd, ref) {
  const resolved = resolveFeature(cwd, ref);
  const exportDir = path.join(cwd, '.planning', 'adapters', 'gsd', resolved.phaseDirName);
  ensureDir(exportDir);
  write(path.join(exportDir, 'phase.json'), JSON.stringify({
    feature_ref: resolved.entry.slug,
    phase_number: resolved.entry.number,
    source_dir: `.planning/phases/${resolved.phaseDirName}`,
    generated_at: nowIso()
  }, null, 2) + '\n');
  write(path.join(exportDir, 'README.md'), [
    '# GSD Export',
    '',
    `Source phase: ${resolved.entry.number}-${resolved.entry.slug}`,
    '',
    'Adapter-only export. Canonical artifacts remain under `.planning/phases/`.',
    ''
  ].join('\n'));
  writeState(cwd, {
    exports: { gsd: `.planning/adapters/gsd/${resolved.phaseDirName}` },
    last_command: 'stratum export-gsd',
    last_updated: nowIso()
  });
  output({ ok: true, command: 'export-gsd', export_dir: `.planning/adapters/gsd/${resolved.phaseDirName}` });
}

function exportBeads(cwd, ref) {
  const resolved = resolveFeature(cwd, ref);
  const graphRaw = read(path.join(resolved.phaseDir, 'TASK-GRAPH.json'));
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
  output({ ok: true, command: 'export-beads', export_dir: `.planning/adapters/beads/${resolved.phaseDirName}`, task_count: graph.length });
}

function commandAvailable(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { ok: result.status === 0, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

function doctor(cwd, args) {
  const hooksRequired = args.includes('--hooks') || Boolean(readState(cwd).learning?.enabled);
  const checks = [];
  const vendors = ['claude', 'codex', 'gemini'];
  for (const vendor of vendors) {
    checks.push({ name: `${vendor}-wrapper`, ok: fs.existsSync(wrapperPath(vendor)), detail: wrapperPath(vendor) });
  }
  for (const command of vendors) {
    const availability = commandAvailable(command);
    checks.push({ name: `${command}-cli`, ok: availability.ok, detail: availability.ok ? availability.stdout : availability.stderr || `${command} unavailable` });
  }
  checks.push({ name: 'command-assets', ok: fs.existsSync(path.join(getPackageRoot(), '..', 'commands', 'stratum')), detail: path.join(getPackageRoot(), '..', 'commands', 'stratum') });
  checks.push({ name: 'adapter-gsd', ok: fs.existsSync(path.join(getPackageRoot(), '..', 'adapters', 'gsd', 'README.md')), detail: path.join(getPackageRoot(), '..', 'adapters', 'gsd', 'README.md') });
  checks.push({ name: 'adapter-beads', ok: fs.existsSync(path.join(getPackageRoot(), '..', 'adapters', 'beads', 'README.md')), detail: path.join(getPackageRoot(), '..', 'adapters', 'beads', 'README.md') });
  if (hooksRequired) {
    checks.push({ name: 'hook-sidecar', ok: true, detail: 'Hooks remain optional; no MCP dependency is required.' });
  }
  output({ ok: checks.filter(item => item.name.endsWith('-wrapper') || item.name === 'command-assets' || item.name.startsWith('adapter-')).every(item => item.ok), command: 'doctor', hooks_checked: hooksRequired, checks });
}

function help() {
  process.stdout.write(`stratum-tools

Commands:
  init-solution [--single|--dual] [--quick|--deep] [--topology name] [--vendors claude,codex,gemini]
  discuss-phase <feature-ref|--next>
  plan-phase <feature-ref|--next> [--single|--dual] [--quick|--deep] [--topology name] [--vendors ...]
  challenge-plan <feature-ref|--path <plan-path>> [--single|--dual] [--quick|--deep] [--topology name] [--vendors ...]
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

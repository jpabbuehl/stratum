#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const pkg = require('../package.json');

const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

const args = process.argv.slice(2);
const hasHelp = args.includes('--help') || args.includes('-h');
const isGlobal = args.includes('--global') || args.includes('-g') || !args.includes('--local');
const isLocal = args.includes('--local') || args.includes('-l');
const isUninstall = args.includes('--uninstall') || args.includes('-u');

function getRuntimeFlags() {
  const runtimes = [];
  if (args.includes('--claude')) runtimes.push('claude');
  if (args.includes('--codex')) runtimes.push('codex');
  if (args.includes('--all')) return ['claude', 'codex'];
  return runtimes;
}

function usage() {
  console.log(`${cyan}stratum${reset} v${pkg.version}

Usage:
  npx @jpabbuehl/stratum@latest [options]

Options:
  --global, -g      Install to runtime config directory (default)
  --local, -l       Install to current project
  --claude          Install for Claude Code
  --codex           Install for Codex
  --all             Install for Claude Code and Codex
  --uninstall, -u   Remove Stratum from selected runtimes
  --help, -h        Show help
`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.rmSync(destDir, { recursive: true, force: true });
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function replacePaths(content, runtimeRoot) {
  const normalized = runtimeRoot.replace(/\\/g, '/');
  return content
    .replace(/~\/\.claude\//g, `${normalized}/`)
    .replace(/\$HOME\/\.claude\//g, `${normalized}/`)
    .replace(/\.\/\.claude\//g, `${normalized}/`);
}

function installNestedCommands(srcDir, destDir, runtimeRoot) {
  if (!fs.existsSync(srcDir)) return;
  fs.rmSync(destDir, { recursive: true, force: true });
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      installNestedCommands(srcPath, destPath, runtimeRoot);
    } else {
      const content = replacePaths(fs.readFileSync(srcPath, 'utf8'), runtimeRoot);
      fs.writeFileSync(destPath, content);
    }
  }
}

function installFlattenedCommands(srcDir, destDir, prefix, runtimeRoot) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      installFlattenedCommands(srcPath, destDir, `${prefix}-${entry.name}`, runtimeRoot);
      continue;
    }
    const destPath = path.join(destDir, `${prefix}-${entry.name}`);
    const content = replacePaths(fs.readFileSync(srcPath, 'utf8'), runtimeRoot);
    fs.writeFileSync(destPath, content);
  }
}

function installCodexSkills(srcDir, destDir, prefix, runtimeRoot) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      installCodexSkills(srcPath, destDir, `${prefix}-${entry.name}`, runtimeRoot);
      continue;
    }
    const skillName = `${prefix}-${entry.name.replace(/\.md$/, '')}`;
    const skillDir = path.join(destDir, skillName);
    ensureDir(skillDir);
    const original = replacePaths(fs.readFileSync(srcPath, 'utf8'), runtimeRoot);
    const body = original.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${skillName}\n\n${body}\n`);
  }
}

function getTargetDir(runtime) {
  if (isLocal) {
    const dirMap = {
      claude: '.claude',
      codex: '.codex'
    };
    return path.join(process.cwd(), dirMap[runtime]);
  }
  if (runtime === 'codex') return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function uninstallRuntime(runtime) {
  const targetDir = getTargetDir(runtime);
  if (runtime === 'codex') {
    fs.rmSync(path.join(targetDir, 'skills', 'stratum-help'), { recursive: true, force: true });
    const skillsDir = path.join(targetDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.startsWith('stratum-'))) {
        fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true });
      }
    }
  } else {
    fs.rmSync(path.join(targetDir, 'commands', 'stratum'), { recursive: true, force: true });
  }
  fs.rmSync(path.join(targetDir, 'stratum'), { recursive: true, force: true });
  console.log(`  ${green}Removed${reset} Stratum from ${runtime}`);
}

function installRuntime(runtime, srcRoot) {
  const targetDir = getTargetDir(runtime);
  ensureDir(targetDir);

  const runtimeRoot = targetDir.replace(/\\/g, '/');
  const commandsSrc = path.join(srcRoot, 'commands', 'stratum');
  const stratumSrc = path.join(srcRoot, 'stratum');
  const adaptersSrc = path.join(srcRoot, 'adapters');
  const stratumDest = path.join(targetDir, 'stratum');

  copyDir(stratumSrc, stratumDest);
  copyDir(adaptersSrc, path.join(stratumDest, 'adapters'));
  for (const executablePath of [
    path.join(stratumDest, 'bin', 'stratum-tools.cjs'),
    path.join(stratumDest, 'wrappers', 'codex-wrapper.sh'),
    path.join(stratumDest, 'wrappers', 'claude-wrapper.sh'),
    path.join(stratumDest, 'wrappers', 'gemini-wrapper.sh')
  ]) {
    if (fs.existsSync(executablePath)) {
      fs.chmodSync(executablePath, 0o755);
    }
  }

  if (runtime === 'codex') {
    installCodexSkills(commandsSrc, path.join(targetDir, 'skills'), 'stratum', runtimeRoot);
  } else {
    installNestedCommands(commandsSrc, path.join(targetDir, 'commands', 'stratum'), runtimeRoot);
  }

  console.log(`  ${green}Installed${reset} Stratum for ${runtime} at ${targetDir}`);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

async function main() {
  if (hasHelp) {
    usage();
    return;
  }

  const srcRoot = path.join(__dirname, '..');
  let runtimes = getRuntimeFlags();
  if (runtimes.length === 0) {
    const answer = await ask('Install for which runtime layout? [claude/codex/all] ');
    runtimes = answer === 'all' ? ['claude', 'codex'] : [answer || 'claude'];
  }

  console.log(`${cyan}Stratum${reset} v${pkg.version}`);
  console.log(`Mode: ${isGlobal ? 'global' : 'local'}`);

  for (const runtime of runtimes) {
    if (!['claude', 'codex'].includes(runtime)) {
      console.log(`${yellow}Skipping unknown runtime:${reset} ${runtime}`);
      continue;
    }
    if (isUninstall) {
      uninstallRuntime(runtime);
    } else {
      installRuntime(runtime, srcRoot);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

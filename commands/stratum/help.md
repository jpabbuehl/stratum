---
name: stratum:help
description: Explain what Stratum installs and how to use it
allowed-tools:
  - Read
  - Bash
---
<objective>
Orient the user to Stratum as a planning/orchestration layer with canonical `.planning/` artifacts.
</objective>

<process>
1. Read `~/.claude/stratum/workflows/overview.md`.
2. Explain that Stratum is complementary to execution systems such as get-shit-done.
3. Show the main commands:
   - `/stratum:init-solution`
   - `/stratum:discuss-phase`
   - `/stratum:plan-phase`
   - `/stratum:challenge-plan`
   - `/stratum:phase-status`
   - `/stratum:export-gsd`
   - `/stratum:export-beads`
   - `/stratum:doctor`
4. Explain orchestration modes:
   - `--quick --single`
   - `--quick --dual`
   - `--deep --single`
   - `--deep --dual` (default)
5. Explain topology presets:
   - `dual-argumentation`
   - `council`
   - `round-robin`
   - `critique`
6. Explain vendor delegation:
   - wrapper scripts under `~/.claude/stratum/wrappers/`
   - typical delegates are `claude`, `codex`, and optional `gemini`
</process>

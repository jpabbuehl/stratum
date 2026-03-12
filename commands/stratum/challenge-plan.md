---
name: stratum:challenge-plan
description: Challenge an existing plan with wrapper-driven multi-round critique and revise it only when warranted
argument-hint: "<phase-ref|--path <plan-path>> [--single|--dual] [--quick|--deep] [--topology <preset>] [--vendors claude,codex,gemini]"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Run critique and review against an existing canonical `PLAN.md`, recording multi-round deliberation artifacts in `DELIBERATION/`.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs challenge-plan $ARGUMENTS
```

Then summarize whether the plan stands or was revised.
</process>

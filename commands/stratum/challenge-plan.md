---
name: stratum:challenge-plan
description: Challenge an existing plan and revise it only when the critique warrants a change
argument-hint: "<phase-ref|--path <plan-path>> [--single|--dual] [--quick|--deep]"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Run critique and review against an existing canonical `PLAN.md`, recording deliberation artifacts in `DELIBERATION/`.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs challenge-plan $ARGUMENTS
```

Then summarize whether the plan stands or was revised.
</process>

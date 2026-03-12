---
name: stratum:doctor
description: Verify command assets, Codex availability, wrappers, and optional hook-sidecar prerequisites
argument-hint: "[--hooks]"
allowed-tools:
  - Read
  - Bash
---
<objective>
Validate whether the local machine can support Stratum's planning/orchestration workflow.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs doctor $ARGUMENTS
```

Then summarize which checks passed, which failed, and what that means for single or dual planning.
</process>

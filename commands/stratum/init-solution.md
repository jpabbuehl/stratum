---
name: stratum:init-solution
description: Initialize canonical planning artifacts under .planning/
argument-hint: "[--single|--dual] [--quick|--deep]"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Initialize Stratum's canonical planning store in the current repository. Default orchestration mode is `--deep --dual`.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs init-solution $ARGUMENTS
```

Then summarize the created artifacts and explain that `.planning/` is now the source of truth.
</process>

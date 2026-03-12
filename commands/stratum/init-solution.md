---
name: stratum:init-solution
description: Initialize canonical planning artifacts under .planning/
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Initialize Stratum's canonical planning store in the current repository.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs init-solution
```

Then summarize the created artifacts and explain that `.planning/` is now the source of truth.
</process>

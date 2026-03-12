# GSD Adapter

This adapter exists so Stratum can stay the canonical planning/orchestration layer while get-shit-done remains an execution-oriented workflow system.

Rules:

- Canonical planning artifacts live in `.planning/`.
- Adapter outputs go under `.planning/adapters/gsd/`.
- Exported files are derived views, not the source of truth.

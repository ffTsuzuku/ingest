# Self-Documentation & Verification Guide

This guide describes how AI coding assistants and developers must maintain documentation integrity across the codebase.

## 1. Documentation Verification Rules

Whenever changes are made to `ingest`, the following documentation synchronization checks must be satisfied:

1. **CLI Flags & Arguments**:
   - Any new or modified CLI flag in `src/index.ts` must be documented in `README.md` and `skills/ingest/SKILL.md`.
2. **Configuration Schema**:
   - Any new or modified property in `src/config/types.ts` must be documented in `README.md`, `AGENTS.md`, and sample config files.
3. **Module Interfaces**:
   - Architectural additions in `src/` must be reflected in `docs/architecture.md`.
4. **AI Agent Skill**:
   - Workflows, tool descriptions, or default paths in `skills/ingest/SKILL.md` must match the active implementation.

---

## 2. Automated Verification Script

Run the verification tool before committing changes:

```bash
npm run verify-docs
```

This automated validator checks:
- All documentation links point to existing files and valid symbols.
- All exported interfaces in `src/config/types.ts` are documented in `README.md`.
- The global skill file `skills/ingest/SKILL.md` is valid YAML/Markdown.
- TypeScript compiler passes with `--noEmit`.

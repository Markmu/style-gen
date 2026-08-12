# CLAUDE.md

Read and follow `AGENTS.md`; it is the single project-level context and command owner for all coding agents.

Claude-specific local assets live under `.claude/`, but the versioned workflow contract is owned by `.agents/contracts/workflow-schema.json`. Run `pnpm workflow:check` after changing either surface so the compatibility mirror and any installed owner references cannot drift.

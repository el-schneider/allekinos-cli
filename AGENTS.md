# AGENTS.md

## Subagent chains

- Chains require `clarify: false` when dispatched from a non-interactive context (another agent, script). Default is `true` which opens a TUI preview that auto-cancels.
- To execute a pre-defined chain, spell out the steps in a `chain: [...]` array. `chainName` is management-only (get/update/delete).
- Available agents: `context-builder`, `planner`, `researcher`, `reviewer`, `scout`, `worker`. There is no `coder` agent.

## Tooling

- Linter: `oxlint` — run `bun run lint`
- Formatter: `oxfmt` — run `bun run fmt` before committing
- Runtime: Bun — use `bun run`, not `node` or `npx`

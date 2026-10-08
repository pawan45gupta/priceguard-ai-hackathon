# PriceGuard Codex Plugin

This plugin packages reusable Codex workflows for the PriceGuard pilot.

Current shape: skills only. This is enough for repeatable RCA, regression-test, and release-freeze work when the user supplies code, logs, and evidence bundles in the workspace.

Add an MCP server later when PriceGuard needs controlled live access to systems such as pricing reference data, application logs, Jira, GitHub, or deployment metadata.

## Included skills

- `priceguard-rca`: investigate a PriceGuard finding and turn evidence into a targeted engineering action.
- `priceguard-regression`: turn a confirmed finding into regression tests and run the suite.
- `priceguard-release-freeze`: prepare the final freeze pack and verify scope, tests, governance, and handoff artifacts.

## Subagents

`.codex/agents/` at the repository root defines three Codex subagents that run these workflows as separate roles: `priceguard_rca` (read-only), `priceguard_regression` (edits tests only), and `priceguard_freeze`. Ask for them by name. Repository-wide instructions are in `AGENTS.md`.

# PriceGuard Codex Plugin

This plugin packages reusable Codex workflows for the PriceGuard pilot.

Current shape: skills only. This is enough for repeatable RCA, regression-test, and release-freeze work when the user supplies code, logs, and evidence bundles in the workspace.

Add an MCP server later when PriceGuard needs controlled live access to systems such as pricing reference data, application logs, Jira, GitHub, or deployment metadata.

## Included skills

- `priceguard-rca`: investigate a PriceGuard finding and turn evidence into a targeted engineering action.
- `priceguard-release-freeze`: prepare the final freeze pack and verify scope, tests, governance, and handoff artifacts.

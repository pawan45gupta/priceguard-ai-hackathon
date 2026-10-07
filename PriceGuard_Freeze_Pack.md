# PriceGuard AI Freeze Pack

## Source Summary

The supplied deck defines PriceGuard as an AI-assisted pricing quality layer for SKU pricing. The key principle is simple: deterministic rules decide hard violations, AI explains evidence and helps investigation, and humans approve production changes.

## MVP Scope

The hackathon prototype should prove one narrow slice:

- Upload or load pricing rows.
- Run deterministic data, relationship, date, discount, and currency checks.
- Add anomaly evidence for historical price movement and new high-discount relationships.
- Classify rows as PASS, REVIEW, or BLOCK.
- Open one finding and show an evidence chain.
- Produce an RCA bundle and a regression-test handoff for Codex.
- Capture accept or reject feedback for threshold tuning.

Out of scope for the hackathon: autonomous price updates, live production writes, broad workflow automation, and model-driven rule changes.

## Sustainable Codex Usage

Use Codex where it creates repeatable engineering leverage:

- RCA assistance: inspect supplied evidence, code paths, and logs, then identify the smallest safe change.
- Regression prevention: turn confirmed findings into unit, integration, and golden-data tests.
- Release freeze: check artifacts, tests, governance, audit trail, and demo readiness.
- Rule documentation: keep rule IDs, thresholds, and rationale synchronized with implementation.

Recommended reusable skills:

- `priceguard-rca`
- `priceguard-release-freeze`

Recommended agents for the pilot:

- Quality Gate Agent: deterministic service inside the backend. It does not require LLM autonomy.
- Explanation Agent: summarizes evidence for pricing owners from a bounded evidence bundle.
- RCA Agent: Codex workflow for engineering diagnosis after a finding is selected.
- Regression Agent: Codex workflow that adds tests for confirmed findings.
- Freeze Agent: Codex workflow that prepares final release artifacts and readiness checks.

## Plugin Decision

Start with a skills-only Codex plugin. This follows the smallest useful shape because the first pilot can work from user-supplied code, logs, and evidence bundles.

Add an MCP-backed plugin only when live controlled access is needed. Good MCP candidates are:

- Pricing reference data lookup.
- Read-only production log search.
- Jira or service-ticket creation.
- Git provider PR and CI status lookup.
- Deployment metadata and feature flag status.

The plugin boundary should stay clear: skills define repeatable workflows, while an MCP server supplies authenticated data and controlled actions.

## Recommended Tech Stack

Production frontend:

- React + Vite + TypeScript.
- Data-table and detail-panel UI optimized for scanning findings.
- Static build deployed behind the enterprise gateway or served from the backend.

Production backend:

- Java 17+ Spring Boot, aligned with the existing pricing application.
- PostgreSQL for findings, audit history, reviewer feedback, rule metadata, and JSON evidence bundles.
- Existing pricing services remain the source of truth.
- Approved OpenAI endpoint for explanation and RCA summarization, with deterministic rules supplying bounded evidence.

Prototype stack:

- Python 3 standard-library backend.
- Vanilla HTML, CSS, and JavaScript frontend.
- No external dependencies, so the demo runs immediately.

## API Contract

- `POST /api/analyze`: classify pricing rows and return summary plus findings.
- `GET /api/findings/{id}/rca`: return evidence bundle, likely root cause, code references, and suggested test plan.
- `POST /api/findings/{id}/regression-test`: generate a regression-test stub for engineering handoff.
- `POST /api/feedback`: capture reviewer accept or reject feedback.

## Code-Freeze Artifacts

Freeze and share these artifacts:

- Runnable prototype source.
- Demo script.
- Codex plugin skeleton with reusable skills.
- Rule catalog and thresholds.
- API contract.
- Regression-test output.
- Deployment plan and rollback notes.
- Known gaps and non-goals.

## 90-Day Pilot Path

Days 1-30: shadow mode.

- Observe only.
- Establish baseline diagnosis time and false-positive rate.
- No blocking behavior.

Days 31-60: human-in-the-loop review.

- Review findings with pricing owners.
- Tune thresholds.
- Track reviewer outcomes.

Days 61-90: controlled enforcement.

- Automate deterministic blocks.
- Keep AI-driven anomalies in review.
- Use Codex to generate tests for confirmed issues.

## Go Criteria

- The prototype runs without external setup.
- Seeded demo produces the expected PASS, REVIEW, and BLOCK distribution.
- Tests cover the seeded story and key rule paths.
- The final demo can show detection, explanation, RCA, and regression prevention in one flow.
- Governance is clear: rules decide, AI explains, humans approve.

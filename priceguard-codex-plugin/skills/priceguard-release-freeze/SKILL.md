---
name: priceguard-release-freeze
description: Prepare and review PriceGuard code-freeze artifacts, including prototype scope, tests, deployment notes, audit controls, and human-approval boundaries.
---

# PriceGuard Release Freeze

Use this skill when the user asks for PriceGuard final code freeze, release readiness, pilot handoff, demo packaging, or artifact review.

## Freeze Criteria

- MVP scope matches the approved slice: upload, deterministic gate, anomaly evidence, explanation, RCA, feedback, and regression-test handoff.
- Production writes remain controlled by the existing pricing application.
- AI output cannot directly change a price, threshold, or release decision.
- All findings include evidence, status, owner, recommendation, confidence, and audit trail.
- Regression tests cover hard-rule blocks, review anomalies, and known PASS rows.
- Deployment notes identify runtime, secrets, database migrations, rollback, and monitoring.

## Workflow

1. List the source artifacts and confirm the version being frozen.
2. Run available tests and record failures or skipped checks.
3. Inspect the rule catalog, API contracts, and UI demo flow for consistency.
4. Check governance boundaries: read-only AI analysis, human approval, auditability, and access controls.
5. Produce a freeze manifest with included artifacts, known gaps, demo steps, and go or no-go recommendation.

## Expected Output

- Freeze manifest summary.
- Test evidence and any residual risk.
- Required human approvals.
- Deployment checklist.
- Post-demo backlog items that should not block the hackathon prototype.

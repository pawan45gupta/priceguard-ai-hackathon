---
name: priceguard-rca
description: Investigate a PriceGuard pricing-quality finding using supplied evidence, code, logs, and rule context, then produce a targeted fix and regression-test plan without changing production pricing data.
---

# PriceGuard RCA

Use this skill when the user asks Codex to investigate a PriceGuard finding, pricing anomaly, SKU pricing defect, rule failure, or RCA bundle.

## Boundaries

- Treat deterministic pricing rules and existing pricing services as the source of truth.
- Do not write to production pricing data or relax rule thresholds without explicit human approval.
- Use AI for evidence explanation, code navigation, and test generation. Keep pricing authority with controlled application logic.

## Workflow

1. Identify the finding ID, affected SKU, customer, price list, business group, and rule IDs.
2. Reproduce the finding from the supplied row or fixture before proposing a fix.
3. Inspect the smallest relevant code path first: validator, rule source, historical analyzer, and audit writer.
4. Separate data defects from code defects. If reference data caused the issue, recommend the controlled data-correction path instead of a code change.
5. Propose the smallest safe code change only when the current behavior conflicts with the stated rule.
6. Add or draft a regression test that reproduces the row and asserts PASS, REVIEW, or BLOCK.
7. Report evidence, root cause, suggested action, residual risk, and tests run.

## Expected Output

- Root cause in one short paragraph.
- Evidence list with source, rule ID, and code or data reference.
- Action: no code change, code fix, data correction, threshold tuning, or human approval.
- Regression test path and assertion.
- Any blocker that prevents a safe conclusion.

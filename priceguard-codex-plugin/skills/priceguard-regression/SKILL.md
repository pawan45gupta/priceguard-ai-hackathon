---
name: priceguard-regression
description: Turn a confirmed PriceGuard finding into regression tests that reproduce the row and lock in its PASS, REVIEW, or BLOCK outcome. Use after a reviewer has accepted a finding or an RCA has concluded. Do not use to diagnose a finding (use priceguard-rca) or to change rules or thresholds.
---

# PriceGuard Regression

Use this skill when the user asks Codex to add a regression test for a PriceGuard finding, protect a fix, or extend the golden-data tests.

## Boundaries

- Only write tests for confirmed findings: a reviewer accepted the finding, or an RCA named the root cause. If neither is stated, ask before writing anything.
- Tests assert what the rule engine should do. Never edit a rule, threshold, seed row, or demo CSV to make a test pass.
- Never weaken or delete an existing test. If a new test contradicts an old one, stop and report both.
- Tests must run offline with the standard library. Do not call the model; the Explanation agent is tested with a fake transport.

## Workflow

1. Collect the finding ID, the full input row, the expected status, and the rule IDs that fired. Take them from the finding or RCA output, not from memory.
2. Reproduce first. Run the row through `analyze_rows([normalize_row(row, 1)])` and confirm the current status and rule IDs.
3. If the current behaviour already matches the expected outcome, the test locks it in. If it does not, the engine has a defect: write the test, confirm it fails for the right reason, and hand back to `priceguard-rca`. Do not fix the engine in this workflow.
4. Add the tests to `priceguard-prototype/tests/test_regressions.py` (create it if missing, following the style of `test_quality_gate.py`):
   - one test for the exact row, asserting the status and each expected rule ID;
   - one boundary test on each side of the threshold when the rule has one (`DISC-014`, `ANOM-001`, `ANOM-002`, `REL-011`);
   - a comment with the finding ID and one line on why the row matters.
5. Name tests `test_<rule_id>_<short_behaviour>`, for example `test_disc_014_blocks_retail_discount_above_limit`.
6. Pass `rule_settings` explicitly when the test depends on a threshold, so a later change to the defaults does not silently change what the test means.
7. Run the whole suite from `priceguard-prototype/`: `python3 -m unittest discover -s tests`. The seeded story (1,000 / 950 / 33 / 17 / risk 74) and the demo-upload golden test must still pass.

## Expected Output

- Test file path and the names of the tests added.
- For each test: the row, the asserted status, and the asserted rule IDs.
- Suite result: tests run, failures, and whether the seeded counts held.
- Anything that blocked a safe test, such as a missing row field or an unconfirmed finding.

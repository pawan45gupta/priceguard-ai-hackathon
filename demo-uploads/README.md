# PriceGuard client-demo uploads

These CSV files are Excel-friendly: open them in Microsoft Excel, or upload them directly with **Upload CSV** in the prototype.

| File | Intended moment | Expected outcome |
| --- | --- | --- |
| `01-clean-pass.csv` | Establish the quality gate is not noisy | 5 PASS |
| `02-review-queue.csv` | Show explainable, human-reviewed exceptions | 3 REVIEW |
| `03-hard-blocks.csv` | Demonstrate policy enforcement | 5 BLOCK (five distinct rule types, including a duplicate row) |
| `04-client-showcase-mixed.csv` | Recommended client walk-through | 3 PASS, 2 REVIEW, 4 BLOCK |

## Recommended client flow

1. Upload `04-client-showcase-mixed.csv`.
2. Select the top blocked finding to show the evidence chain.
3. Filter by **Block**, then by **Review**, to show a focused queue.
4. Choose **Run RCA** and **Generate Test** on the selected finding.
5. Open the top-right Rule Engine gear to show the governed controls behind the decisions.

All rows use the required columns and ISO dates (`YYYY-MM-DD`).

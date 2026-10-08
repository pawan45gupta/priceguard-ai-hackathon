"""Golden-data tests: the client-demo CSVs must keep their documented outcomes."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server import analyze_rows, parse_csv_text

UPLOADS = ROOT.parent / "demo-uploads"

# file -> (PASS, REVIEW, BLOCK, rule IDs that must appear)
EXPECTED = {
    "01-clean-pass.csv": (5, 0, 0, set()),
    "02-review-queue.csv": (0, 3, 0, {"ANOM-001", "REL-011"}),
    # Six rows: the first row of the duplicate pair passes, the second is DUP-004.
    "03-hard-blocks.csv": (1, 0, 5, {"CUR-002", "DATE-003", "DISC-014", "DUP-004", "REL-007"}),
    "04-client-showcase-mixed.csv": (
        3,
        2,
        4,
        {"ANOM-001", "CUR-002", "DATE-003", "DISC-014", "REL-007", "REL-011"},
    ),
}


class DemoUploadGoldenTests(unittest.TestCase):
    def test_demo_uploads_keep_documented_outcomes(self):
        for name, (passed, review, blocked, rules) in EXPECTED.items():
            with self.subTest(file=name):
                result = analyze_rows(parse_csv_text((UPLOADS / name).read_text()))
                summary = result["summary"]
                fired = {
                    item["rule_id"]
                    for finding in result["findings"]
                    for item in finding["evidence"]
                }

                self.assertEqual(
                    (summary["passed"], summary["review"], summary["blocked"]),
                    (passed, review, blocked),
                )
                self.assertEqual(fired, rules)


if __name__ == "__main__":
    unittest.main()

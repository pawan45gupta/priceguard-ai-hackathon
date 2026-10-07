import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server import analyze_rows, generated_demo_rows, normalize_row


class PriceGuardQualityGateTests(unittest.TestCase):
    def test_seeded_demo_counts_match_story(self):
        result = analyze_rows(generated_demo_rows())

        self.assertEqual(result["summary"]["total"], 1000)
        self.assertEqual(result["summary"]["passed"], 950)
        self.assertEqual(result["summary"]["review"], 33)
        self.assertEqual(result["summary"]["blocked"], 17)
        self.assertEqual(result["summary"]["riskScore"], 74)

    def test_discount_above_business_limit_blocks_row(self):
        row = normalize_row(
            {
                "sku": "SKU-T1",
                "brand": "Auralux",
                "business_group": "Retail",
                "customer": "BrightCart",
                "price_list": "PL-RET-US",
                "effective_date": "2026-11-10",
                "expiry_date": "2027-11-09",
                "list_price": "510.00",
                "discount_pct": "46.0",
                "currency": "USD",
            },
            1,
        )

        result = analyze_rows([row])

        self.assertEqual(result["summary"]["blocked"], 1)
        self.assertEqual(result["findings"][0]["status"], "BLOCK")
        self.assertIn("DISC-014", [item["rule_id"] for item in result["findings"][0]["evidence"]])

    def test_historical_movement_routes_to_review(self):
        row = normalize_row(
            {
                "sku": "SKU-RISK-T1",
                "brand": "Orion",
                "business_group": "Enterprise",
                "customer": "Northwind Health",
                "price_list": "PL-ENT-US",
                "effective_date": "2026-11-15",
                "expiry_date": "2027-11-14",
                "list_price": "610.00",
                "discount_pct": "42.0",
                "currency": "USD",
            },
            1,
        )

        result = analyze_rows([row])

        self.assertEqual(result["summary"]["review"], 1)
        self.assertEqual(result["findings"][0]["status"], "REVIEW")
        self.assertIn("ANOM-001", [item["rule_id"] for item in result["findings"][0]["evidence"]])


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""PriceGuard AI hackathon prototype.

The prototype keeps pricing authority in deterministic rules. The explanation,
RCA, and regression-test paths package the evidence so the demo can show how a
Codex-assisted workflow would move from finding to engineering action.
"""

from __future__ import annotations

import argparse
import copy
import csv
import io
import json
import mimetypes
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import unquote, urlparse

import explanation_agent


ROOT = Path(__file__).resolve().parent
STATIC_ROOT = ROOT / "static"

REQUIRED_FIELDS = [
    "sku",
    "brand",
    "business_group",
    "customer",
    "price_list",
    "effective_date",
    "expiry_date",
    "list_price",
    "discount_pct",
    "currency",
]

DISCOUNT_LIMITS = {
    "Retail": 35.0,
    "Enterprise": 48.0,
    "Distributor": 25.0,
    "Healthcare": 20.0,
    "Government": 15.0,
}

ALLOWED_BRAND_GROUPS = {
    "Orion": {"Retail", "Enterprise", "Distributor"},
    "Auralux": {"Retail", "Enterprise"},
    "Nexa": {"Retail", "Distributor", "Government"},
    "MedAxis": {"Healthcare", "Government"},
}

PRICE_LIST_CURRENCY = {
    "PL-RET-US": "USD",
    "PL-ENT-US": "USD",
    "PL-DIST-US": "USD",
    "PL-HEALTH-US": "USD",
    "PL-GOV-US": "USD",
    "PL-RET-EU": "EUR",
}

DEFAULT_RULE_SETTINGS = {
    "discount_limits": DISCOUNT_LIMITS,
    "allowed_brand_groups": {
        brand: sorted(groups) for brand, groups in ALLOWED_BRAND_GROUPS.items()
    },
    "price_list_currency": PRICE_LIST_CURRENCY,
    "anomaly_thresholds": {
        "review_pct": 35.0,
        "block_drop_pct": 60.0,
        "block_increase_pct": 75.0,
        "new_relationship_discount_pct": 30.0,
    },
}

KNOWN_CUSTOMERS = {
    "Retail": {"Northwind Market", "BrightCart", "Urban Basket", "Metro Value"},
    "Enterprise": {"Northwind Health", "ACME Operations", "Zenith Labs"},
    "Distributor": {"Harbor Distribution", "Central Wholesale"},
    "Healthcare": {"Northwind Health", "CityCare"},
    "Government": {"Civic Procurement", "State Health Agency"},
}

CODE_HOTSPOTS = {
    "discount_limit": "pricing-core/src/main/java/com/company/pricing/rules/DiscountLimitValidator.java",
    "relationship": "pricing-core/src/main/java/com/company/pricing/rules/RelationshipValidator.java",
    "date_window": "pricing-core/src/main/java/com/company/pricing/rules/EffectiveDateValidator.java",
    "historical_price": "pricing-core/src/main/java/com/company/pricing/anomaly/HistoricalPriceAnalyzer.java",
}

FINDING_CACHE: Dict[str, Dict] = {}
RULE_SETTINGS: Dict = copy.deepcopy(DEFAULT_RULE_SETTINGS)


@dataclass
class Evidence:
    severity: str
    rule_id: str
    title: str
    detail: str
    score: int


def clone_rule_settings() -> Dict:
    return copy.deepcopy(RULE_SETTINGS)


def reset_rule_settings() -> Dict:
    RULE_SETTINGS.clear()
    RULE_SETTINGS.update(copy.deepcopy(DEFAULT_RULE_SETTINGS))
    return clone_rule_settings()


def sanitized_rule_settings(candidate: Optional[Dict]) -> Dict:
    settings = copy.deepcopy(DEFAULT_RULE_SETTINGS)
    if not isinstance(candidate, dict):
        return settings

    for group, value in candidate.get("discount_limits", {}).items():
        if group in settings["discount_limits"]:
            settings["discount_limits"][group] = max(0.0, min(100.0, parse_number(value)))

    for brand, groups in candidate.get("allowed_brand_groups", {}).items():
        if brand in settings["allowed_brand_groups"] and isinstance(groups, list):
            cleaned = [str(group) for group in groups if str(group) in DISCOUNT_LIMITS]
            settings["allowed_brand_groups"][brand] = sorted(set(cleaned))

    for price_list, currency in candidate.get("price_list_currency", {}).items():
        if price_list in settings["price_list_currency"]:
            settings["price_list_currency"][price_list] = str(currency).strip().upper() or "USD"

    thresholds = candidate.get("anomaly_thresholds", {})
    if isinstance(thresholds, dict):
        for key in settings["anomaly_thresholds"]:
            if key in thresholds:
                settings["anomaly_thresholds"][key] = max(
                    0.0, min(100.0, parse_number(thresholds[key]))
                )

    return settings


def update_rule_settings(candidate: Optional[Dict]) -> Dict:
    RULE_SETTINGS.clear()
    RULE_SETTINGS.update(sanitized_rule_settings(candidate))
    return clone_rule_settings()


def parse_date(value: str) -> datetime:
    return datetime.strptime(value.strip(), "%Y-%m-%d")


def parse_number(value: str, default: float = 0.0) -> float:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def normalize_row(row: Dict[str, str], index: int) -> Dict:
    normalized = {field: str(row.get(field, "")).strip() for field in REQUIRED_FIELDS}
    normalized["row_number"] = index
    normalized["requested_by"] = str(row.get("requested_by", "demo.user")).strip() or "demo.user"
    normalized["list_price"] = parse_number(normalized["list_price"])
    normalized["discount_pct"] = parse_number(normalized["discount_pct"])
    normalized["net_price"] = round(
        normalized["list_price"] * (1 - normalized["discount_pct"] / 100), 2
    )
    return normalized


def parse_csv_text(text: str) -> List[Dict]:
    reader = csv.DictReader(io.StringIO(text.strip()))
    rows = [normalize_row(row, idx + 1) for idx, row in enumerate(reader)]
    return rows


def rows_to_csv(rows: Iterable[Dict]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=REQUIRED_FIELDS + ["requested_by"])
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in writer.fieldnames})
    return buffer.getvalue()


def generated_demo_rows() -> List[Dict]:
    rows: List[Dict] = []
    start = datetime(2026, 11, 1)
    valid_profiles = [
        ("Orion", "Retail", "Northwind Market", "PL-RET-US", 119.0, 12.0),
        ("Auralux", "Enterprise", "ACME Operations", "PL-ENT-US", 820.0, 18.0),
        ("Nexa", "Distributor", "Harbor Distribution", "PL-DIST-US", 244.0, 10.0),
        ("MedAxis", "Healthcare", "CityCare", "PL-HEALTH-US", 1320.0, 8.0),
        ("Nexa", "Government", "Civic Procurement", "PL-GOV-US", 730.0, 6.0),
    ]

    for i in range(950):
        brand, group, customer, price_list, price, discount = valid_profiles[i % len(valid_profiles)]
        day = start + timedelta(days=i % 21)
        rows.append(
            {
                "sku": f"SKU-{10000 + i}",
                "brand": brand,
                "business_group": group,
                "customer": customer,
                "price_list": price_list,
                "effective_date": day.strftime("%Y-%m-%d"),
                "expiry_date": (day + timedelta(days=364)).strftime("%Y-%m-%d"),
                "list_price": f"{price + (i % 11) * 2:.2f}",
                "discount_pct": f"{discount + (i % 3):.1f}",
                "currency": PRICE_LIST_CURRENCY[price_list],
                "requested_by": "seed.batch",
            }
        )

    for i in range(33):
        rows.append(
            {
                "sku": f"SKU-RISK-{200 + i}",
                "brand": "Orion",
                "business_group": "Enterprise",
                "customer": "Northwind Health" if i < 18 else "Pilot Customer",
                "price_list": "PL-ENT-US",
                "effective_date": "2026-11-15",
                "expiry_date": "2027-11-14",
                "list_price": f"{610 + i % 5:.2f}",
                "discount_pct": "42.0",
                "currency": "USD",
                "requested_by": "seed.batch",
            }
        )

    for i in range(8):
        rows.append(
            {
                "sku": f"SKU-BLOCK-DISC-{i}",
                "brand": "Auralux",
                "business_group": "Retail",
                "customer": "BrightCart",
                "price_list": "PL-RET-US",
                "effective_date": "2026-11-10",
                "expiry_date": "2027-11-09",
                "list_price": "510.00",
                "discount_pct": "46.0",
                "currency": "USD",
                "requested_by": "seed.batch",
            }
        )

    for i in range(5):
        rows.append(
            {
                "sku": f"SKU-BLOCK-REL-{i}",
                "brand": "MedAxis",
                "business_group": "Retail",
                "customer": "Urban Basket",
                "price_list": "PL-RET-US",
                "effective_date": "2026-11-12",
                "expiry_date": "2027-11-11",
                "list_price": "445.00",
                "discount_pct": "18.0",
                "currency": "USD",
                "requested_by": "seed.batch",
            }
        )

    for i in range(4):
        rows.append(
            {
                "sku": f"SKU-BLOCK-DATE-{i}",
                "brand": "Nexa",
                "business_group": "Government",
                "customer": "Civic Procurement",
                "price_list": "PL-GOV-US",
                "effective_date": "2026-12-31",
                "expiry_date": "2026-12-01",
                "list_price": "735.00",
                "discount_pct": "9.0",
                "currency": "USD",
                "requested_by": "seed.batch",
            }
        )

    return [normalize_row(row, idx + 1) for idx, row in enumerate(rows)]


def expected_currency(price_list: str, rule_settings: Optional[Dict] = None) -> str:
    settings = rule_settings or RULE_SETTINGS
    return settings.get("price_list_currency", {}).get(price_list, "USD")


def historical_median(row: Dict) -> float:
    sku = row["sku"]
    if sku.startswith("SKU-RISK-"):
        return 1000.0
    if row["brand"] == "Orion" and row["business_group"] == "Enterprise":
        return 980.0
    return 0.0


def known_relationship(row: Dict) -> bool:
    customers = KNOWN_CUSTOMERS.get(row["business_group"], set())
    return row["customer"] in customers


def evidence_for_row(
    row: Dict, seen_keys: Dict[Tuple, int], rule_settings: Optional[Dict] = None
) -> List[Evidence]:
    settings = rule_settings or RULE_SETTINGS
    evidence: List[Evidence] = []

    missing = [field for field in REQUIRED_FIELDS if row.get(field) in ("", None)]
    if missing:
        evidence.append(
            Evidence(
                "BLOCK",
                "DQ-001",
                "Required pricing fields are missing",
                f"Missing fields: {', '.join(missing)}.",
                95,
            )
        )

    try:
        effective = parse_date(row["effective_date"])
        expiry = parse_date(row["expiry_date"])
        if effective > expiry:
            evidence.append(
                Evidence(
                    "BLOCK",
                    "DATE-003",
                    "Effective date is after expiry date",
                    f"{row['effective_date']} occurs after {row['expiry_date']}.",
                    92,
                )
            )
    except ValueError:
        evidence.append(
            Evidence(
                "BLOCK",
                "DATE-001",
                "Date format is invalid",
                "Dates must use YYYY-MM-DD.",
                90,
            )
        )

    brand = row["brand"]
    group = row["business_group"]
    allowed_groups = set(settings.get("allowed_brand_groups", {}).get(brand, []))
    if allowed_groups and group not in allowed_groups:
        evidence.append(
            Evidence(
                "BLOCK",
                "REL-007",
                "Brand and business group relationship is not allowed",
                f"{brand} is configured for {', '.join(sorted(allowed_groups))}, not {group}.",
                96,
            )
        )

    max_discount = settings.get("discount_limits", {}).get(group, 0)
    if max_discount and row["discount_pct"] > max_discount:
        evidence.append(
            Evidence(
                "BLOCK",
                "DISC-014",
                "Discount exceeds business-group limit",
                f"{group} allows up to {max_discount:.0f}%, request contains {row['discount_pct']:.1f}%.",
                94,
            )
        )

    expected = expected_currency(row["price_list"], settings)
    if row["currency"] != expected:
        evidence.append(
            Evidence(
                "BLOCK",
                "CUR-002",
                "Currency does not match the price list",
                f"{row['price_list']} expects {expected}, request contains {row['currency']}.",
                90,
            )
        )

    unique_key = (
        row["sku"],
        row["customer"],
        row["price_list"],
        row["effective_date"],
    )
    if unique_key in seen_keys:
        evidence.append(
            Evidence(
                "BLOCK",
                "DUP-004",
                "Duplicate active price row",
                f"Same SKU, customer, price list, and effective date already appeared on row {seen_keys[unique_key]}.",
                91,
            )
        )
    else:
        seen_keys[unique_key] = row["row_number"]

    median = historical_median(row)
    if median:
        delta = (row["list_price"] - median) / median
        thresholds = settings.get("anomaly_thresholds", {})
        block_drop = thresholds.get("block_drop_pct", 60.0) / 100
        block_increase = thresholds.get("block_increase_pct", 75.0) / 100
        review_threshold = thresholds.get("review_pct", 35.0) / 100
        if delta <= -block_drop or delta >= block_increase:
            evidence.append(
                Evidence(
                    "BLOCK",
                    "ANOM-002",
                    "Historical price movement is outside the block threshold",
                    f"List price {row['list_price']:.2f} differs from historical median {median:.2f} by {delta * 100:.1f}%.",
                    91,
                )
            )
        elif abs(delta) >= review_threshold:
            evidence.append(
                Evidence(
                    "REVIEW",
                    "ANOM-001",
                    "Historical price movement needs review",
                    f"List price {row['list_price']:.2f} differs from historical median {median:.2f} by {delta * 100:.1f}%.",
                    72,
                )
            )

    new_relationship_discount = settings.get("anomaly_thresholds", {}).get(
        "new_relationship_discount_pct", 30.0
    )
    if not known_relationship(row) and row["discount_pct"] >= new_relationship_discount:
        evidence.append(
            Evidence(
                "REVIEW",
                "REL-011",
                "New high-discount customer relationship",
                f"{row['customer']} is not a known {group} customer and the discount is {row['discount_pct']:.1f}%.",
                68,
            )
        )

    if row["net_price"] <= 0:
        evidence.append(
            Evidence(
                "BLOCK",
                "PRICE-009",
                "Net price is not positive",
                f"Calculated net price is {row['net_price']:.2f}.",
                99,
            )
        )

    return evidence


def finding_title(row: Dict, evidence: List[Evidence]) -> str:
    primary = sorted(evidence, key=lambda item: item.score, reverse=True)[0]
    return f"{primary.title} for {row['sku']}"


def recommended_action(row: Dict, evidence: List[Evidence]) -> str:
    rule_ids = {item.rule_id for item in evidence}
    if "DISC-014" in rule_ids:
        return "Route to pricing owner and block release until discount threshold is corrected or approved."
    if "REL-007" in rule_ids:
        return "Reject the row and confirm the brand to business-group mapping in the reference table."
    if "DATE-003" in rule_ids:
        return "Correct the effective date window before the row can enter pricing calculation."
    if "ANOM-001" in rule_ids:
        return "Send to human review with historical median, submitted price, and customer context."
    return "Review the evidence chain and decide whether to accept, reject, or tune the rule."


def confidence_for(evidence: List[Evidence]) -> float:
    if any(item.severity == "BLOCK" for item in evidence):
        return 0.94
    return 0.78


def analyze_rows(rows: List[Dict], rule_settings: Optional[Dict] = None) -> Dict:
    settings = sanitized_rule_settings(rule_settings) if rule_settings else clone_rule_settings()
    seen_keys: Dict[Tuple, int] = {}
    findings: List[Dict] = []
    status_counts = {"PASS": 0, "REVIEW": 0, "BLOCK": 0}

    for row in rows:
        evidence = evidence_for_row(row, seen_keys, settings)
        if not evidence:
            status_counts["PASS"] += 1
            continue

        status = "BLOCK" if any(item.severity == "BLOCK" for item in evidence) else "REVIEW"
        status_counts[status] += 1
        risk_score = max(item.score for item in evidence)
        finding = {
            "id": f"PG-{row['row_number']:04d}",
            "status": status,
            "riskScore": risk_score,
            "sku": row["sku"],
            "brand": row["brand"],
            "businessGroup": row["business_group"],
            "customer": row["customer"],
            "priceList": row["price_list"],
            "netPrice": row["net_price"],
            "title": finding_title(row, evidence),
            "explanation": build_explanation(row, evidence),
            "evidence": [item.__dict__ for item in evidence],
            "recommendation": recommended_action(row, evidence),
            "confidence": confidence_for(evidence),
            "owner": owner_for(row, status),
            "row": row,
        }
        findings.append(finding)

    total = len(rows)
    overall_risk = 0
    if total:
        overall_risk = min(
            100,
            round((status_counts["REVIEW"] * 1.1 + status_counts["BLOCK"] * 2.2) / total * 1000),
        )

    summary = {
        "total": total,
        "passed": status_counts["PASS"],
        "review": status_counts["REVIEW"],
        "blocked": status_counts["BLOCK"],
        "riskScore": overall_risk,
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "topConcerns": top_concerns(findings),
    }

    FINDING_CACHE.clear()
    FINDING_CACHE.update({finding["id"]: finding for finding in findings})

    return {
        "summary": summary,
        "findings": sorted(findings, key=lambda item: item["riskScore"], reverse=True),
        "ruleSettings": settings,
        "auditTrail": [
            "Parsed pricing input",
            "Applied deterministic data and business rules",
            "Compared prices against historical baselines",
            "Generated explanation and RCA evidence bundle",
        ],
    }


def build_explanation(row: Dict, evidence: List[Evidence]) -> str:
    evidence_text = "; ".join(item.detail for item in evidence[:2])
    return (
        f"{row['sku']} for {row['customer']} needs attention because {evidence_text} "
        f"The row remains under human control and no production price is changed by this assistant."
    )


def top_concerns(findings: List[Dict]) -> List[str]:
    counts: Dict[str, int] = {}
    for finding in findings:
        for item in finding["evidence"]:
            counts[item["rule_id"]] = counts.get(item["rule_id"], 0) + 1
    labels = {
        "ANOM-001": "Historical price movement",
        "REL-011": "New customer relationship",
        "DISC-014": "Discount above limit",
        "REL-007": "Invalid brand and business-group mapping",
        "DATE-003": "Invalid effective date window",
    }
    return [
        f"{labels.get(rule_id, rule_id)}: {count}"
        for rule_id, count in sorted(counts.items(), key=lambda pair: pair[1], reverse=True)[:4]
    ]


def owner_for(row: Dict, status: str) -> str:
    if status == "BLOCK":
        return "Pricing rules owner"
    if row["business_group"] in {"Enterprise", "Healthcare", "Government"}:
        return "Pricing operations"
    return "Product owner"


def rca_for_finding(finding: Dict) -> Dict:
    rule_ids = [item["rule_id"] for item in finding["evidence"]]
    primary = rule_ids[0] if rule_ids else "UNKNOWN"
    code_key = "historical_price"
    if "DISC-014" in rule_ids:
        code_key = "discount_limit"
    elif "REL-007" in rule_ids or "REL-011" in rule_ids:
        code_key = "relationship"
    elif "DATE-003" in rule_ids:
        code_key = "date_window"

    probable = {
        "DISC-014": "Submitted discount exceeds the configured business-group threshold.",
        "REL-007": "Brand and business-group reference data does not allow this relationship.",
        "DATE-003": "The effective and expiry date window is reversed.",
        "ANOM-001": "The submitted price is far from historical behavior for this SKU relationship.",
        "REL-011": "A new relationship appears with a high discount and needs approval.",
    }.get(primary, "The row violates one or more pricing quality checks.")

    return {
        "findingId": finding["id"],
        "probableRootCause": probable,
        "evidenceBundle": [
            {
                "source": "pricing_request",
                "detail": f"Row {finding['row']['row_number']} contains SKU {finding['sku']} for {finding['customer']}.",
            },
            {
                "source": "rule_engine",
                "detail": ", ".join(rule_ids),
            },
            {
                "source": "historical_analyzer",
                "detail": finding["explanation"],
            },
            {
                "source": "code_reference",
                "detail": CODE_HOTSPOTS[code_key],
            },
        ],
        "investigationPath": [
            "Open the finding and confirm the rule evidence.",
            "Compare the request against reference pricing relationships.",
            "Trace the mapped validator and verify the threshold source.",
            "Add or update a regression test before changing behavior.",
        ],
        "suggestedFix": suggested_fix(rule_ids),
        "testPlan": [
            "Unit test for the exact SKU and rule path.",
            "Boundary test at the configured threshold.",
            "Golden-data test that preserves current PASS rows.",
        ],
        "codexPrompt": codex_prompt_for(finding),
    }


def suggested_fix(rule_ids: List[str]) -> str:
    if "DISC-014" in rule_ids:
        return "Do not relax the threshold in code. Validate whether the source data should reduce discount or carry an explicit approval flag."
    if "REL-007" in rule_ids:
        return "Confirm the reference-data mapping. Change the mapping only through the controlled configuration path."
    if "DATE-003" in rule_ids:
        return "Normalize date validation so reversed windows fail before pricing calculation."
    if "ANOM-001" in rule_ids:
        return "Keep the row in review and attach historical median evidence for pricing-owner approval."
    return "Preserve the rule decision and improve the evidence shown to reviewers."


def codex_prompt_for(finding: Dict) -> str:
    rules = ", ".join(item["rule_id"] for item in finding["evidence"])
    return (
        "Use the PriceGuard RCA workflow for "
        f"{finding['id']} ({finding['sku']}). Inspect validators for {rules}, "
        "identify the smallest safe change if any, and add a regression test that reproduces this row."
    )


def regression_test_for(finding: Dict) -> Dict:
    row = finding["row"]
    test_name = f"test_{finding['id'].lower().replace('-', '_')}_{row['sku'].lower().replace('-', '_')}"
    snippet = f"""def {test_name}():
    row = {{
        "sku": "{row['sku']}",
        "brand": "{row['brand']}",
        "business_group": "{row['business_group']}",
        "customer": "{row['customer']}",
        "price_list": "{row['price_list']}",
        "effective_date": "{row['effective_date']}",
        "expiry_date": "{row['expiry_date']}",
        "list_price": "{row['list_price']:.2f}",
        "discount_pct": "{row['discount_pct']:.1f}",
        "currency": "{row['currency']}",
    }}
    result = analyze_rows([normalize_row(row, 1)])
    assert result["summary"]["{status_key(finding['status'])}"] == 1
    assert result["findings"][0]["status"] == "{finding['status']}"
"""
    return {
        "findingId": finding["id"],
        "testName": test_name,
        "framework": "pytest or JUnit equivalent",
        "snippet": snippet,
        "javaTarget": "pricing-core/src/test/java/com/company/pricing/rules/PricingQualityGateTest.java",
    }


def status_key(status: str) -> str:
    return "blocked" if status == "BLOCK" else "review"


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: Dict) -> None:
    body = json.dumps(payload, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class PriceGuardHandler(BaseHTTPRequestHandler):
    server_version = "PriceGuardPrototype/0.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            json_response(
                self,
                200,
                {
                    "status": "ok",
                    "service": "priceguard",
                    "explanationAgent": explanation_agent.agent_mode(),
                },
            )
            return
        if parsed.path == "/api/rule-settings":
            json_response(self, 200, {"ruleSettings": clone_rule_settings()})
            return
        if parsed.path == "/api/seed":
            rows = generated_demo_rows()
            json_response(
                self,
                200,
                {
                    "csv": rows_to_csv(rows),
                    "analysis": analyze_rows(rows),
                    "ruleSettings": clone_rule_settings(),
                },
            )
            return
        if parsed.path.startswith("/api/findings/") and parsed.path.endswith("/rca"):
            finding_id = unquote(parsed.path.split("/")[3])
            finding = ensure_finding(finding_id)
            if not finding:
                json_response(self, 404, {"error": "finding not found"})
                return
            json_response(self, 200, rca_for_finding(finding))
            return
        if re.match(r"^/api/findings/[^/]+/explanation$", parsed.path):
            finding_id = unquote(parsed.path.split("/")[3])
            finding = ensure_finding(finding_id)
            if not finding:
                json_response(self, 404, {"error": "finding not found"})
                return
            json_response(self, 200, explanation_agent.explain_finding(finding))
            return
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/analyze":
            payload = self.read_json()
            if payload.get("csv"):
                rows = parse_csv_text(payload["csv"])
            else:
                rows = generated_demo_rows()
            rule_settings = payload.get("ruleSettings")
            json_response(self, 200, analyze_rows(rows, rule_settings))
            return
        if parsed.path == "/api/rule-settings":
            payload = self.read_json()
            if payload.get("reset"):
                rule_settings = reset_rule_settings()
            else:
                rule_settings = update_rule_settings(payload.get("ruleSettings"))
            json_response(self, 200, {"ruleSettings": rule_settings})
            return
        if re.match(r"^/api/findings/[^/]+/regression-test$", parsed.path):
            finding_id = unquote(parsed.path.split("/")[3])
            finding = ensure_finding(finding_id)
            if not finding:
                json_response(self, 404, {"error": "finding not found"})
                return
            json_response(self, 200, regression_test_for(finding))
            return
        if parsed.path == "/api/explain":
            # The browser runs its own copy of the rule engine, so it sends the
            # finding it is showing. The agent reduces it to a bounded bundle.
            payload = self.read_json()
            finding = payload.get("finding")
            if not isinstance(finding, dict):
                finding = ensure_finding(str(payload.get("findingId", "")))
            if not finding or not finding.get("evidence"):
                json_response(self, 400, {"error": "finding with evidence is required"})
                return
            json_response(self, 200, explanation_agent.explain_finding(finding))
            return
        if parsed.path == "/api/feedback":
            payload = self.read_json()
            json_response(
                self,
                200,
                {
                    "status": "captured",
                    "findingId": payload.get("findingId"),
                    "decision": payload.get("decision"),
                    "message": "Feedback kept for threshold tuning in the pilot.",
                },
            )
            return
        json_response(self, 404, {"error": "not found"})

    def read_json(self) -> Dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}

    def serve_static(self, path: str) -> None:
        if path in ("", "/"):
            target = STATIC_ROOT / "index.html"
        else:
            safe = Path(unquote(path.lstrip("/")))
            if ".." in safe.parts:
                self.send_error(400)
                return
            target = ROOT / safe
        if not target.exists() or not target.is_file():
            self.send_error(404)
            return
        body = target.read_bytes()
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        if os.environ.get("PRICEGUARD_VERBOSE"):
            super().log_message(fmt, *args)


def ensure_finding(finding_id: str) -> Dict:
    if not FINDING_CACHE:
        analyze_rows(generated_demo_rows())
    return FINDING_CACHE.get(finding_id, {})


def load_env_file(path: Path) -> List[str]:
    """Load KEY=value lines from a .env file into the environment.

    Variables that are already set win, so a real environment variable always
    overrides the file. Returns the names that were loaded, never the values.
    """
    loaded: List[str] = []
    if not path.is_file():
        return loaded
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key and value and key not in os.environ:
            os.environ[key] = value
            loaded.append(key)
    return loaded


def main() -> None:
    load_env_file(ROOT / ".env")
    parser = argparse.ArgumentParser(description="Run the PriceGuard prototype server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), PriceGuardHandler)
    print(f"PriceGuard prototype running at http://{args.host}:{args.port}")
    mode = explanation_agent.agent_mode()
    if mode["mode"] == "llm":
        print(f"Explanation agent: model {mode['model']}")
    else:
        print("Explanation agent: no OPENAI_API_KEY found, using the rule-based summary")
    server.serve_forever()


if __name__ == "__main__":
    main()

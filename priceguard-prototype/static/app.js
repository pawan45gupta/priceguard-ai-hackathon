let currentAnalysis = null;
let selectedFindingId = null;
let currentRows = [];

const $ = (selector) => document.querySelector(selector);

const requiredFields = [
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
];

const defaultRuleSettings = {
  discount_limits: {
    Retail: 35,
    Enterprise: 48,
    Distributor: 25,
    Healthcare: 20,
    Government: 15,
  },
  allowed_brand_groups: {
    Orion: ["Retail", "Enterprise", "Distributor"],
    Auralux: ["Retail", "Enterprise"],
    Nexa: ["Retail", "Distributor", "Government"],
    MedAxis: ["Healthcare", "Government"],
  },
  price_list_currency: {
    "PL-RET-US": "USD",
    "PL-ENT-US": "USD",
    "PL-DIST-US": "USD",
    "PL-HEALTH-US": "USD",
    "PL-GOV-US": "USD",
    "PL-RET-EU": "EUR",
  },
  anomaly_thresholds: {
    review_pct: 35,
    block_drop_pct: 60,
    block_increase_pct: 75,
    new_relationship_discount_pct: 30,
  },
};

let currentRuleSettings = JSON.parse(JSON.stringify(defaultRuleSettings));

const thresholdLabels = {
  review_pct: "Review movement %",
  block_drop_pct: "Block price drop %",
  block_increase_pct: "Block price increase %",
  new_relationship_discount_pct: "New relationship discount %",
};

const knownCustomers = {
  Retail: ["Northwind Market", "BrightCart", "Urban Basket", "Metro Value"],
  Enterprise: ["Northwind Health", "ACME Operations", "Zenith Labs"],
  Distributor: ["Harbor Distribution", "Central Wholesale"],
  Healthcare: ["Northwind Health", "CityCare"],
  Government: ["Civic Procurement", "State Health Agency"],
};

const codeHotspots = {
  discount_limit: "pricing-core/src/main/java/com/company/pricing/rules/DiscountLimitValidator.java",
  relationship: "pricing-core/src/main/java/com/company/pricing/rules/RelationshipValidator.java",
  date_window: "pricing-core/src/main/java/com/company/pricing/rules/EffectiveDateValidator.java",
  historical_price: "pricing-core/src/main/java/com/company/pricing/anomaly/HistoricalPriceAnalyzer.java",
};

function normalizeRow(row, index) {
  const normalized = {};
  requiredFields.forEach((field) => {
    normalized[field] = String(row[field] ?? "").trim();
  });
  normalized.row_number = index;
  normalized.requested_by = String(row.requested_by ?? "demo.user").trim() || "demo.user";
  normalized.list_price = Number(normalized.list_price) || 0;
  normalized.discount_pct = Number(normalized.discount_pct) || 0;
  normalized.net_price = Number((normalized.list_price * (1 - normalized.discount_pct / 100)).toFixed(2));
  return normalized;
}

function generatedDemoRows() {
  const rows = [];
  const validProfiles = [
    ["Orion", "Retail", "Northwind Market", "PL-RET-US", 119, 12],
    ["Auralux", "Enterprise", "ACME Operations", "PL-ENT-US", 820, 18],
    ["Nexa", "Distributor", "Harbor Distribution", "PL-DIST-US", 244, 10],
    ["MedAxis", "Healthcare", "CityCare", "PL-HEALTH-US", 1320, 8],
    ["Nexa", "Government", "Civic Procurement", "PL-GOV-US", 730, 6],
  ];

  for (let i = 0; i < 950; i += 1) {
    const [brand, group, customer, priceList, price, discount] = validProfiles[i % validProfiles.length];
    const day = 1 + (i % 21);
    rows.push({
      sku: `SKU-${10000 + i}`,
      brand,
      business_group: group,
      customer,
      price_list: priceList,
      effective_date: `2026-11-${String(day).padStart(2, "0")}`,
      expiry_date: `2027-10-${String(day).padStart(2, "0")}`,
      list_price: (price + (i % 11) * 2).toFixed(2),
      discount_pct: (discount + (i % 3)).toFixed(1),
      currency: defaultRuleSettings.price_list_currency[priceList],
      requested_by: "seed.batch",
    });
  }

  for (let i = 0; i < 33; i += 1) {
    rows.push({
      sku: `SKU-RISK-${200 + i}`,
      brand: "Orion",
      business_group: "Enterprise",
      customer: i < 18 ? "Northwind Health" : "Pilot Customer",
      price_list: "PL-ENT-US",
      effective_date: "2026-11-15",
      expiry_date: "2027-11-14",
      list_price: String(610 + (i % 5)),
      discount_pct: "42.0",
      currency: "USD",
      requested_by: "seed.batch",
    });
  }

  for (let i = 0; i < 8; i += 1) {
    rows.push({
      sku: `SKU-BLOCK-DISC-${i}`,
      brand: "Auralux",
      business_group: "Retail",
      customer: "BrightCart",
      price_list: "PL-RET-US",
      effective_date: "2026-11-10",
      expiry_date: "2027-11-09",
      list_price: "510.00",
      discount_pct: "46.0",
      currency: "USD",
      requested_by: "seed.batch",
    });
  }

  for (let i = 0; i < 5; i += 1) {
    rows.push({
      sku: `SKU-BLOCK-REL-${i}`,
      brand: "MedAxis",
      business_group: "Retail",
      customer: "Urban Basket",
      price_list: "PL-RET-US",
      effective_date: "2026-11-12",
      expiry_date: "2027-11-11",
      list_price: "445.00",
      discount_pct: "18.0",
      currency: "USD",
      requested_by: "seed.batch",
    });
  }

  for (let i = 0; i < 4; i += 1) {
    rows.push({
      sku: `SKU-BLOCK-DATE-${i}`,
      brand: "Nexa",
      business_group: "Government",
      customer: "Civic Procurement",
      price_list: "PL-GOV-US",
      effective_date: "2026-12-31",
      expiry_date: "2026-12-01",
      list_price: "735.00",
      discount_pct: "9.0",
      currency: "USD",
      requested_by: "seed.batch",
    });
  }

  return rows.map((row, index) => normalizeRow(row, index + 1));
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(",").map((item) => item.trim());
  return lines.map((line, index) => {
    const values = line.split(",");
    const row = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex] ?? ""]));
    return normalizeRow(row, index + 1);
  });
}

function evidenceForRow(row, seenKeys, ruleSettings = currentRuleSettings) {
  const evidence = [];
  const missing = requiredFields.filter((field) => row[field] === "" || row[field] == null);
  if (missing.length) {
    evidence.push({
      severity: "BLOCK",
      rule_id: "DQ-001",
      title: "Required pricing fields are missing",
      detail: `Missing fields: ${missing.join(", ")}.`,
      score: 95,
    });
  }

  const effective = new Date(`${row.effective_date}T00:00:00Z`);
  const expiry = new Date(`${row.expiry_date}T00:00:00Z`);
  if (Number.isNaN(effective.getTime()) || Number.isNaN(expiry.getTime())) {
    evidence.push({
      severity: "BLOCK",
      rule_id: "DATE-001",
      title: "Date format is invalid",
      detail: "Dates must use YYYY-MM-DD.",
      score: 90,
    });
  } else if (effective > expiry) {
    evidence.push({
      severity: "BLOCK",
      rule_id: "DATE-003",
      title: "Effective date is after expiry date",
      detail: `${row.effective_date} occurs after ${row.expiry_date}.`,
      score: 92,
    });
  }

  const allowedGroups = ruleSettings.allowed_brand_groups[row.brand];
  if (allowedGroups && !allowedGroups.includes(row.business_group)) {
    evidence.push({
      severity: "BLOCK",
      rule_id: "REL-007",
      title: "Brand and business group relationship is not allowed",
      detail: `${row.brand} is configured for ${allowedGroups.sort().join(", ")}, not ${row.business_group}.`,
      score: 96,
    });
  }

  const maxDiscount = ruleSettings.discount_limits[row.business_group];
  if (maxDiscount && row.discount_pct > maxDiscount) {
    evidence.push({
      severity: "BLOCK",
      rule_id: "DISC-014",
      title: "Discount exceeds business-group limit",
      detail: `${row.business_group} allows up to ${maxDiscount}%, request contains ${row.discount_pct.toFixed(1)}%.`,
      score: 94,
    });
  }

  const expectedCurrency = ruleSettings.price_list_currency[row.price_list] ?? "USD";
  if (row.currency !== expectedCurrency) {
    evidence.push({
      severity: "BLOCK",
      rule_id: "CUR-002",
      title: "Currency does not match the price list",
      detail: `${row.price_list} expects ${expectedCurrency}, request contains ${row.currency}.`,
      score: 90,
    });
  }

  const key = [row.sku, row.customer, row.price_list, row.effective_date].join("|");
  if (seenKeys.has(key)) {
    evidence.push({
      severity: "BLOCK",
      rule_id: "DUP-004",
      title: "Duplicate active price row",
      detail: `Same SKU, customer, price list, and effective date already appeared on row ${seenKeys.get(key)}.`,
      score: 91,
    });
  } else {
    seenKeys.set(key, row.row_number);
  }

  const median = row.sku.startsWith("SKU-RISK-") ? 1000 : 0;
  if (median) {
    const delta = (row.list_price - median) / median;
    const thresholds = ruleSettings.anomaly_thresholds;
    const blockDrop = thresholds.block_drop_pct / 100;
    const blockIncrease = thresholds.block_increase_pct / 100;
    const reviewThreshold = thresholds.review_pct / 100;
    if (delta <= -blockDrop || delta >= blockIncrease) {
      evidence.push({
        severity: "BLOCK",
        rule_id: "ANOM-002",
        title: "Historical price movement is outside the block threshold",
        detail: `List price ${row.list_price.toFixed(2)} differs from historical median ${median.toFixed(2)} by ${(delta * 100).toFixed(1)}%.`,
        score: 91,
      });
    } else if (Math.abs(delta) >= reviewThreshold) {
      evidence.push({
        severity: "REVIEW",
        rule_id: "ANOM-001",
        title: "Historical price movement needs review",
        detail: `List price ${row.list_price.toFixed(2)} differs from historical median ${median.toFixed(2)} by ${(delta * 100).toFixed(1)}%.`,
        score: 72,
      });
    }
  }

  const known = knownCustomers[row.business_group] ?? [];
  if (!known.includes(row.customer) && row.discount_pct >= ruleSettings.anomaly_thresholds.new_relationship_discount_pct) {
    evidence.push({
      severity: "REVIEW",
      rule_id: "REL-011",
      title: "New high-discount customer relationship",
      detail: `${row.customer} is not a known ${row.business_group} customer and the discount is ${row.discount_pct.toFixed(1)}%.`,
      score: 68,
    });
  }

  return evidence;
}

function analyzeRows(rows, ruleSettings = currentRuleSettings) {
  const seenKeys = new Map();
  const statusCounts = { PASS: 0, REVIEW: 0, BLOCK: 0 };
  const findings = [];

  rows.forEach((row) => {
    const evidence = evidenceForRow(row, seenKeys, ruleSettings);
    if (!evidence.length) {
      statusCounts.PASS += 1;
      return;
    }
    const status = evidence.some((item) => item.severity === "BLOCK") ? "BLOCK" : "REVIEW";
    statusCounts[status] += 1;
    const riskScore = Math.max(...evidence.map((item) => item.score));
    const primary = [...evidence].sort((a, b) => b.score - a.score)[0];
    findings.push({
      id: `PG-${String(row.row_number).padStart(4, "0")}`,
      status,
      riskScore,
      sku: row.sku,
      brand: row.brand,
      businessGroup: row.business_group,
      customer: row.customer,
      priceList: row.price_list,
      title: `${primary.title} for ${row.sku}`,
      explanation: `${row.sku} for ${row.customer} needs attention because ${evidence.slice(0, 2).map((item) => item.detail).join("; ")} The row remains under human control and no production price is changed by this assistant.`,
      evidence,
      recommendation: recommendedAction(row, evidence),
      owner: status === "BLOCK" ? "Pricing rules owner" : "Pricing operations",
      row,
    });
  });

  const total = rows.length;
  const riskScore = total ? Math.min(100, Math.round(((statusCounts.REVIEW * 1.1 + statusCounts.BLOCK * 2.2) / total) * 1000)) : 0;
  return {
    summary: {
      total,
      passed: statusCounts.PASS,
      review: statusCounts.REVIEW,
      blocked: statusCounts.BLOCK,
      riskScore,
      topConcerns: topConcerns(findings),
    },
    findings: findings.sort((a, b) => b.riskScore - a.riskScore),
    ruleSettings,
  };
}

function recommendedAction(row, evidence) {
  const ruleIds = evidence.map((item) => item.rule_id);
  if (ruleIds.includes("DISC-014")) return "Route to pricing owner and block release until discount threshold is corrected or approved.";
  if (ruleIds.includes("REL-007")) return "Reject the row and confirm the brand to business-group mapping in the reference table.";
  if (ruleIds.includes("DATE-003")) return "Correct the effective date window before the row can enter pricing calculation.";
  if (ruleIds.includes("ANOM-001")) return "Send to human review with historical median, submitted price, and customer context.";
  return "Review the evidence chain and decide whether to accept, reject, or tune the rule.";
}

function topConcerns(findings) {
  const counts = {};
  findings.forEach((finding) => {
    finding.evidence.forEach((item) => {
      counts[item.rule_id] = (counts[item.rule_id] ?? 0) + 1;
    });
  });
  const labels = {
    "ANOM-001": "Historical price movement",
    "ANOM-002": "Blocked historical movement",
    "REL-011": "New customer relationship",
    "DISC-014": "Discount above limit",
    "REL-007": "Invalid brand and business-group mapping",
    "DATE-003": "Invalid effective date window",
  };
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([ruleId, count]) => `${labels[ruleId] ?? ruleId}: ${count}`);
}

function statusBadge(status) {
  return `<span class="badge ${status}">${status}</span>`;
}

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));
}

function formatPercent(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function renderRuleSettings() {
  $("#discountRules").innerHTML = Object.entries(currentRuleSettings.discount_limits)
    .map(
      ([group, value]) => `
        <label class="rule-row">
          <span>${group}</span>
          <input data-rule-scope="discount" data-rule-key="${group}" type="number" min="0" max="100" step="0.5" value="${formatPercent(value)}" aria-label="${group} discount limit" />
        </label>
      `
    )
    .join("");

  $("#thresholdRules").innerHTML = Object.entries(thresholdLabels)
    .map(
      ([key, label]) => `
        <label class="rule-row">
          <span>${label}</span>
          <input data-rule-scope="threshold" data-rule-key="${key}" type="number" min="0" max="100" step="0.5" value="${formatPercent(currentRuleSettings.anomaly_thresholds[key])}" aria-label="${label}" />
        </label>
      `
    )
    .join("");

  const brands = Object.keys(currentRuleSettings.allowed_brand_groups);
  const groups = Object.keys(currentRuleSettings.discount_limits);
  $("#relationshipRules").innerHTML = [
    `<span class="matrix-head">Brand</span>`,
    ...groups.map((group) => `<span class="matrix-head">${group}</span>`),
    ...brands.flatMap((brand) => {
      const allowed = new Set(currentRuleSettings.allowed_brand_groups[brand]);
      return [
        `<span class="matrix-brand">${brand}</span>`,
        ...groups.map(
          (group) => `
            <label class="matrix-toggle" aria-label="${brand} ${group}">
              <input data-rule-scope="relationship" data-brand="${brand}" data-group="${group}" type="checkbox" ${allowed.has(group) ? "checked" : ""} />
              <span>Allow</span>
            </label>
          `
        ),
      ];
    }),
  ].join("");
}

function boundedPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function collectRuleSettings() {
  const settings = cloneSettings(currentRuleSettings);
  document.querySelectorAll("[data-rule-scope='discount']").forEach((input) => {
    settings.discount_limits[input.dataset.ruleKey] = boundedPercent(input.value);
  });
  document.querySelectorAll("[data-rule-scope='threshold']").forEach((input) => {
    settings.anomaly_thresholds[input.dataset.ruleKey] = boundedPercent(input.value);
  });

  settings.allowed_brand_groups = Object.fromEntries(
    Object.keys(settings.allowed_brand_groups).map((brand) => [brand, []])
  );
  document.querySelectorAll("[data-rule-scope='relationship']:checked").forEach((input) => {
    settings.allowed_brand_groups[input.dataset.brand].push(input.dataset.group);
  });
  return settings;
}

function setRuleStatus(message) {
  $("#ruleStatus").textContent = message;
}

function renderSummary(summary) {
  $("#totalCount").textContent = summary.total.toLocaleString();
  $("#passCount").textContent = summary.passed.toLocaleString();
  $("#reviewCount").textContent = summary.review.toLocaleString();
  $("#blockCount").textContent = summary.blocked.toLocaleString();
  $("#riskScore").textContent = summary.riskScore.toLocaleString();
  const total = Math.max(summary.total, 1);
  $("#passBar").style.width = `${(summary.passed / total) * 100}%`;
  $("#reviewBar").style.width = `${(summary.review / total) * 100}%`;
  $("#blockBar").style.width = `${(summary.blocked / total) * 100}%`;
  $("#concerns").innerHTML = summary.topConcerns.map((concern) => `<li>${concern}</li>`).join("");
}

function renderFindings(findings) {
  $("#findingCount").textContent = `${findings.length} flagged`;
  $("#findingsTable").innerHTML = findings
    .map(
      (finding) => `
        <tr data-finding-id="${finding.id}">
          <td><strong>${finding.id}</strong><br>${finding.title}</td>
          <td>${statusBadge(finding.status)}</td>
          <td>${finding.riskScore}</td>
          <td>${finding.sku}</td>
          <td>${finding.customer}</td>
        </tr>
      `
    )
    .join("");
  document.querySelectorAll("[data-finding-id]").forEach((row) => {
    row.addEventListener("click", () => selectFinding(row.dataset.findingId));
  });
  if (findings.length) {
    selectFinding(findings[0].id);
  } else {
    selectedFindingId = null;
    $("#detailPane").innerHTML = `<div class="empty-state">No review or block findings for this input.</div>`;
  }
}

function selectFinding(id) {
  selectedFindingId = id;
  document.querySelectorAll("tr.selected").forEach((row) => row.classList.remove("selected"));
  document.querySelector(`[data-finding-id="${id}"]`)?.classList.add("selected");
  renderDetail(currentAnalysis.findings.find((finding) => finding.id === id));
}

function renderDetail(finding) {
  $("#detailPane").innerHTML = `
    <div class="detail-title">
      <div>
        <h2>${finding.title}</h2>
        <p>${finding.explanation}</p>
      </div>
      <div class="risk-pill">${finding.riskScore}</div>
    </div>
    <div class="meta-grid">
      <div><span class="label">SKU</span>${finding.sku}</div>
      <div><span class="label">Customer</span>${finding.customer}</div>
      <div><span class="label">Brand</span>${finding.brand}</div>
      <div><span class="label">Business group</span>${finding.businessGroup}</div>
      <div><span class="label">Price list</span>${finding.priceList}</div>
      <div><span class="label">Owner</span>${finding.owner}</div>
    </div>
    <h2>Evidence</h2>
    <div class="evidence-list">
      ${finding.evidence.map((item) => `<div class="evidence-item"><strong>${item.rule_id} ${statusBadge(item.severity)}</strong><span>${item.detail}</span></div>`).join("")}
    </div>
    <h2>Recommendation</h2>
    <p>${finding.recommendation}</p>
    <div class="detail-actions">
      <button class="primary" onclick="runRca()">Run RCA</button>
      <button onclick="generateTest()">Generate Test</button>
      <button onclick="submitFeedback('accepted')">Accept</button>
      <button onclick="submitFeedback('rejected')">Reject</button>
    </div>
    <div id="actionOutput"></div>
  `;
}

function currentFinding() {
  return currentAnalysis.findings.find((finding) => finding.id === selectedFindingId);
}

function rcaForFinding(finding) {
  const ruleIds = finding.evidence.map((item) => item.rule_id);
  let codeKey = "historical_price";
  if (ruleIds.includes("DISC-014")) codeKey = "discount_limit";
  if (ruleIds.includes("REL-007") || ruleIds.includes("REL-011")) codeKey = "relationship";
  if (ruleIds.includes("DATE-003")) codeKey = "date_window";
  return {
    probableRootCause: finding.evidence[0].title,
    suggestedFix: recommendedAction(finding.row, finding.evidence),
    codexPrompt: `Use the PriceGuard RCA workflow for ${finding.id} (${finding.sku}). Inspect validators for ${ruleIds.join(", ")}, identify the smallest safe change if any, and add a regression test that reproduces this row.`,
    evidenceBundle: [
      { source: "pricing_request", detail: `Row ${finding.row.row_number} contains SKU ${finding.sku} for ${finding.customer}.` },
      { source: "rule_engine", detail: ruleIds.join(", ") },
      { source: "historical_analyzer", detail: finding.explanation },
      { source: "code_reference", detail: codeHotspots[codeKey] },
    ],
  };
}

function runRca() {
  const rca = rcaForFinding(currentFinding());
  $("#actionOutput").innerHTML = `
    <div class="rca-block">
      <h2>RCA output</h2>
      <p><strong>Root cause:</strong> ${rca.probableRootCause}</p>
      <p><strong>Suggested fix:</strong> ${rca.suggestedFix}</p>
      <p><strong>Codex prompt:</strong> ${rca.codexPrompt}</p>
      <pre>${JSON.stringify(rca.evidenceBundle, null, 2)}</pre>
    </div>
  `;
}

function generateTest() {
  const finding = currentFinding();
  const row = finding.row;
  const statusKey = finding.status === "BLOCK" ? "blocked" : "review";
  const testName = `test_${finding.id.toLowerCase().replace("-", "_")}_${row.sku.toLowerCase().replaceAll("-", "_")}`;
  $("#actionOutput").innerHTML = `
    <div class="test-block">
      <h2>Regression test</h2>
      <p><strong>${testName}</strong></p>
      <pre>def ${testName}():
    row = {
        "sku": "${row.sku}",
        "brand": "${row.brand}",
        "business_group": "${row.business_group}",
        "customer": "${row.customer}",
        "price_list": "${row.price_list}",
        "effective_date": "${row.effective_date}",
        "expiry_date": "${row.expiry_date}",
        "list_price": "${row.list_price.toFixed(2)}",
        "discount_pct": "${row.discount_pct.toFixed(1)}",
        "currency": "${row.currency}",
    }
    result = analyze_rows([normalize_row(row, 1)])
    assert result["summary"]["${statusKey}"] == 1
    assert result["findings"][0]["status"] == "${finding.status}"</pre>
    </div>
  `;
}

function submitFeedback(decision) {
  $("#actionOutput").innerHTML = `
    <div class="rca-block">
      <h2>Feedback</h2>
      <p>${decision === "accepted" ? "Accepted" : "Rejected"} feedback kept for threshold tuning in the pilot.</p>
    </div>
  `;
}

async function loadSeed() {
  currentRows = generatedDemoRows();
  refreshAnalysis();
  setRuleStatus("Rules loaded from deterministic engine defaults.");
}

function refreshAnalysis() {
  if (!currentRows.length) currentRows = generatedDemoRows();
  currentAnalysis = analyzeRows(currentRows, currentRuleSettings);
  renderRuleSettings();
  renderSummary(currentAnalysis.summary);
  renderFindings(currentAnalysis.findings);
}

async function analyzeFile(file) {
  const text = await file.text();
  currentRows = parseCsv(text);
  refreshAnalysis();
}

function applyRuleSettings() {
  currentRuleSettings = collectRuleSettings();
  refreshAnalysis();
  setRuleStatus("Rules applied. Analysis refreshed with the active rule set.");
}

function resetRuleSettings() {
  currentRuleSettings = cloneSettings(defaultRuleSettings);
  refreshAnalysis();
  setRuleStatus("Defaults restored. Analysis refreshed with baseline governance rules.");
}

$("#health").textContent = "Online";
$("#seedButton").addEventListener("click", loadSeed);
$("#analyzeButton").addEventListener("click", loadSeed);
$("#applyRulesButton").addEventListener("click", applyRuleSettings);
$("#resetRulesButton").addEventListener("click", resetRuleSettings);
$("#fileInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) analyzeFile(file);
});

loadSeed();

function setRuleEngineOpen(isOpen) {
  const drawer = $("#ruleEngineDrawer");
  const backdrop = $("#ruleEngineBackdrop");
  const trigger = $("#ruleEngineButton");
  drawer.hidden = !isOpen;
  backdrop.hidden = !isOpen;
  trigger.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) $("#closeRuleEngineButton").focus();
}

$("#ruleEngineButton").addEventListener("click", () => setRuleEngineOpen(true));
$("#closeRuleEngineButton").addEventListener("click", () => setRuleEngineOpen(false));
$("#ruleEngineBackdrop").addEventListener("click", () => setRuleEngineOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#ruleEngineDrawer").hidden) setRuleEngineOpen(false);
});

const activeFilters = { businessGroup: "All", brand: "All", status: "All", priceList: "All" };

function filteredFindings() {
  return currentAnalysis.findings.filter((finding) =>
    (activeFilters.businessGroup === "All" || finding.businessGroup === activeFilters.businessGroup) &&
    (activeFilters.brand === "All" || finding.brand === activeFilters.brand) &&
    (activeFilters.status === "All" || finding.status === activeFilters.status.toUpperCase()) &&
    (activeFilters.priceList === "All" || finding.priceList === activeFilters.priceList)
  );
}

function renderFilteredFindings() {
  renderFindings(filteredFindings());
  document.querySelectorAll(".filter-grid label").forEach((label) => {
    const select = label.querySelector("select");
    label.classList.toggle("is-active", select.value !== "All");
  });
}

function activateSection(section, target) {
  document.querySelectorAll(".nav-tabs a[data-section]").forEach((link) => {
    const active = link.dataset.section === section;
    link.classList.toggle("active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: section === "overview" ? "start" : "center" });
}

["businessGroup", "brand", "status", "priceList"].forEach((name) => {
  const select = $(`#${name}Filter`);
  select.addEventListener("change", () => {
    activeFilters[name] = select.value;
    renderFilteredFindings();
    activateSection("findings", "#filterBand");
  });
});

document.querySelectorAll(".nav-tabs a[data-section]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    activateSection(link.dataset.section, link.getAttribute("href"));
  });
});

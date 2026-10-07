let currentCsv = "";
let currentAnalysis = null;
let selectedFindingId = null;
let currentRuleSettings = null;

const $ = (selector) => document.querySelector(selector);

const thresholdLabels = {
  review_pct: "Review movement %",
  block_drop_pct: "Block price drop %",
  block_increase_pct: "Block price increase %",
  new_relationship_discount_pct: "New relationship discount %",
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
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
  if (!currentRuleSettings) return;

  const discountRules = $("#discountRules");
  discountRules.innerHTML = Object.entries(currentRuleSettings.discount_limits)
    .map(
      ([group, value]) => `
        <label class="rule-row">
          <span>${group}</span>
          <input data-rule-scope="discount" data-rule-key="${group}" type="number" min="0" max="100" step="0.5" value="${formatPercent(value)}" aria-label="${group} discount limit" />
        </label>
      `
    )
    .join("");

  const thresholdRules = $("#thresholdRules");
  thresholdRules.innerHTML = Object.entries(thresholdLabels)
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
  const relationshipRules = $("#relationshipRules");
  relationshipRules.innerHTML = [
    `<span class="matrix-head">Brand</span>`,
    ...groups.map((group) => `<span class="matrix-head">${group}</span>`),
    ...brands.flatMap((brand) => {
      const allowed = new Set(currentRuleSettings.allowed_brand_groups[brand] || []);
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

  const concerns = $("#concerns");
  concerns.innerHTML = "";
  summary.topConcerns.forEach((concern) => {
    const item = document.createElement("li");
    item.textContent = concern;
    concerns.appendChild(item);
  });
}

function renderFindings(findings) {
  $("#findingCount").textContent = `${findings.length} flagged`;
  const body = $("#findingsTable");
  body.innerHTML = "";
  findings.forEach((finding) => {
    const row = document.createElement("tr");
    row.dataset.findingId = finding.id;
    row.innerHTML = `
      <td><strong>${finding.id}</strong><br>${finding.title}</td>
      <td>${statusBadge(finding.status)}</td>
      <td>${finding.riskScore}</td>
      <td>${finding.sku}</td>
      <td>${finding.customer}</td>
    `;
    row.addEventListener("click", () => selectFinding(finding.id));
    body.appendChild(row);
  });

  if (findings.length) {
    selectFinding(findings[0].id);
  } else {
    $("#detailPane").innerHTML = `<div class="empty-state">No review or block findings for this input.</div>`;
  }
}

function selectFinding(id) {
  selectedFindingId = id;
  document.querySelectorAll("tr.selected").forEach((row) => row.classList.remove("selected"));
  const row = document.querySelector(`tr[data-finding-id="${CSS.escape(id)}"]`);
  if (row) row.classList.add("selected");
  const finding = currentAnalysis.findings.find((item) => item.id === id);
  renderDetail(finding);
}

function renderDetail(finding) {
  const evidence = finding.evidence
    .map(
      (item) => `
        <div class="evidence-item">
          <strong>${item.rule_id} ${statusBadge(item.severity)}</strong>
          <span>${item.detail}</span>
        </div>
      `
    )
    .join("");

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
    <div class="evidence-list">${evidence}</div>
    <h2>Recommendation</h2>
    <p>${finding.recommendation}</p>
    <div class="detail-actions">
      <button id="rcaButton" class="primary" onclick="runRca()">Run RCA</button>
      <button id="testButton" onclick="generateTest()">Generate Test</button>
      <button id="acceptButton" onclick="submitFeedback('accepted')">Accept</button>
      <button id="rejectButton" onclick="submitFeedback('rejected')">Reject</button>
    </div>
    <div id="actionOutput"></div>
  `;

}

async function loadSeed() {
  const payload = await request("/api/seed");
  currentCsv = payload.csv;
  currentAnalysis = payload.analysis;
  currentRuleSettings = payload.ruleSettings || currentAnalysis.ruleSettings;
  renderRuleSettings();
  renderSummary(currentAnalysis.summary);
  renderFindings(currentAnalysis.findings);
  setRuleStatus("Rules loaded from deterministic engine defaults.");
}

async function analyzeCurrent() {
  currentAnalysis = await request("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ csv: currentCsv, ruleSettings: currentRuleSettings }),
  });
  currentRuleSettings = currentAnalysis.ruleSettings || currentRuleSettings;
  renderRuleSettings();
  renderSummary(currentAnalysis.summary);
  renderFindings(currentAnalysis.findings);
}

async function applyRuleSettings() {
  currentRuleSettings = collectRuleSettings();
  const payload = await request("/api/rule-settings", {
    method: "POST",
    body: JSON.stringify({ ruleSettings: currentRuleSettings }),
  });
  currentRuleSettings = payload.ruleSettings;
  renderRuleSettings();
  setRuleStatus("Rules applied. Analysis refreshed with the active rule set.");
  await analyzeCurrent();
}

async function resetRuleSettings() {
  const payload = await request("/api/rule-settings", {
    method: "POST",
    body: JSON.stringify({ reset: true }),
  });
  currentRuleSettings = payload.ruleSettings;
  renderRuleSettings();
  setRuleStatus("Defaults restored. Analysis refreshed with baseline governance rules.");
  await analyzeCurrent();
}

async function runRca() {
  const rca = await request(`/api/findings/${encodeURIComponent(selectedFindingId)}/rca`);
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

async function generateTest() {
  const test = await request(`/api/findings/${encodeURIComponent(selectedFindingId)}/regression-test`, {
    method: "POST",
    body: "{}",
  });
  $("#actionOutput").innerHTML = `
    <div class="test-block">
      <h2>Regression test</h2>
      <p><strong>${test.testName}</strong></p>
      <pre>${test.snippet}</pre>
    </div>
  `;
}

async function submitFeedback(decision) {
  const feedback = await request("/api/feedback", {
    method: "POST",
    body: JSON.stringify({ findingId: selectedFindingId, decision }),
  });
  $("#actionOutput").innerHTML = `
    <div class="rca-block">
      <h2>Feedback</h2>
      <p>${feedback.message}</p>
    </div>
  `;
}

function wireEvents() {
  $("#seedButton").addEventListener("click", loadSeed);
  $("#analyzeButton").addEventListener("click", analyzeCurrent);
  $("#applyRulesButton").addEventListener("click", applyRuleSettings);
  $("#resetRulesButton").addEventListener("click", resetRuleSettings);
  $("#fileInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    currentCsv = await file.text();
    await analyzeCurrent();
  });
}

async function checkHealth() {
  try {
    const health = await request("/api/health");
    $("#health").textContent = health.status === "ok" ? "Online" : "Check";
  } catch {
    $("#health").textContent = "Offline";
  }
}

wireEvents();
checkHealth();
loadSeed();

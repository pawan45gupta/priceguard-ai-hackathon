let currentCsv = "";
let currentAnalysis = null;
let selectedFindingId = null;

const $ = (selector) => document.querySelector(selector);

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
  renderSummary(currentAnalysis.summary);
  renderFindings(currentAnalysis.findings);
}

async function analyzeCurrent() {
  currentAnalysis = await request("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ csv: currentCsv }),
  });
  renderSummary(currentAnalysis.summary);
  renderFindings(currentAnalysis.findings);
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

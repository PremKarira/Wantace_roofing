const $ = (selector) => document.querySelector(selector);
let config;
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || "Request failed"), {
      status: response.status,
    });
  }
  return response.json();
}
function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
function optionRate(option) {
  if ("rate_per_sqft" in option)
    return ["rate_per_sqft", "Material rate ($ / sq ft)"];
  if ("tear_off_per_sqft" in option)
    return ["tear_off_per_sqft", "Tear-off ($ / sq ft)"];
  return ["multiplier", "Multiplier"];
}
function renderSettings() {
  const questions = config.questions
    .map(
      (question, qIndex) =>
        `<div class="question-row"><div class="question-heading"><strong>${escapeHtml(question.key)}</strong><label class="toggle"><input type="checkbox" data-active="${qIndex}" ${question.active ? "checked" : ""}> Active</label></div><label>Question shown to homeowners<input data-label="${qIndex}" value="${escapeHtml(question.label)}"></label>${
          question.type === "select"
            ? `<div class="options-editor">${question.options
                .map((option, oIndex) => {
                  const [property, label] = optionRate(option);
                  return `<div class="option-edit"><label>Option label<input data-option-label="${qIndex}:${oIndex}" value="${escapeHtml(option.label)}"></label><label>${label}<input data-option-rate="${qIndex}:${oIndex}:${property}" type="number" step="0.01" min="0" value="${escapeHtml(option[property])}"></label></div>`;
                })
                .join("")}</div>`
            : `<p>Allowed range: ${question.min.toLocaleString()}–${question.max.toLocaleString()} ${escapeHtml(question.unit || "")}</p>`
        }</div>`,
    )
    .join("");
  $("#settings-tab").innerHTML =
    `<div class="config-section"><h2>Business details</h2><div class="settings-grid"><label>Business name<input id="business-name" value="${escapeHtml(config.business.name)}"></label><label>Region<input id="business-region" value="${escapeHtml(config.business.region)}"></label><label>Currency<input id="business-currency" value="${escapeHtml(config.business.currency)}"></label></div></div><div class="config-section"><h2>Estimator questions</h2><p>Turn questions on or off, revise their wording, and change the rates that drive estimates.</p>${questions}</div><div class="config-section"><h2>Estimate modifiers</h2><div class="settings-grid"><label>Waste factor (decimal)<input id="waste" type="number" min="0" step="0.01" value="${config.modifiers.waste_factor}"></label><label>Permit flat fee ($)<input id="permit" type="number" min="0" step="1" value="${config.modifiers.permit_flat_fee}"></label><label>Range spread (%)<input id="spread" type="number" min="0" step="1" value="${config.modifiers.range_spread_pct}"></label></div></div><div class="save-row"><span>Current version: ${config.config_version}</span><button id="save-config" class="button">Save live changes</button></div>`;
}
function collectConfig() {
  config.business.name = $("#business-name").value.trim();
  config.business.region = $("#business-region").value.trim();
  config.business.currency = $("#business-currency").value.trim().toUpperCase();
  config.modifiers.waste_factor = Number($("#waste").value);
  config.modifiers.permit_flat_fee = Number($("#permit").value);
  config.modifiers.range_spread_pct = Number($("#spread").value);
  document.querySelectorAll("[data-active]").forEach((input) => {
    config.questions[Number(input.dataset.active)].active = input.checked;
  });
  document.querySelectorAll("[data-label]").forEach((input) => {
    config.questions[Number(input.dataset.label)].label = input.value.trim();
  });
  document.querySelectorAll("[data-option-label]").forEach((input) => {
    const [q, o] = input.dataset.optionLabel.split(":").map(Number);
    config.questions[q].options[o].label = input.value.trim();
  });
  document.querySelectorAll("[data-option-rate]").forEach((input) => {
    const [q, o, property] = input.dataset.optionRate.split(":");
    config.questions[Number(q)].options[Number(o)][property] = Number(
      input.value,
    );
  });
}
async function saveConfig() {
  collectConfig();
  const button = $("#save-config");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    config = await api("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    $("#saved-status").textContent = "Changes saved and live.";
    renderSettings();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Save live changes";
  }
}
async function renderLeads() {
  const leads = await api("/api/admin/leads");
  $("#leads-tab").innerHTML = leads.length
    ? `<h2>Captured leads</h2><p class="hint">${leads.length} homeowner inquiries, newest first.</p><div class="lead-table"><table><thead><tr><th>CONTACT</th><th>ESTIMATE</th><th>RECEIVED</th><th>ANSWERS</th></tr></thead><tbody>${leads
        .map(
          (lead) =>
            `<tr><td><strong>${escapeHtml(lead.name)}</strong><br>${escapeHtml(lead.phone)}<br>${escapeHtml(lead.email)}</td><td>${money(lead.estimate_low)}–${money(lead.estimate_high)}</td><td>${new Date(lead.captured_at).toLocaleDateString()}</td><td><details><summary>View answers</summary><div class="lead-details">${Object.entries(
              lead.answers || {},
            )
              .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}`)
              .join("<br>")}</div></details></td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : '<p class="empty">No leads have been captured yet.</p>';
}
async function openAdmin() {
  try {
    config = await api("/api/admin/config");
    $("#login-view").hidden = true;
    $("#admin-view").hidden = false;
    $("#logout").hidden = false;
    renderSettings();
  } catch (error) {
    if (error.status !== 401) alert("Could not load the owner panel.");
  }
}
$("#login-form").onsubmit = async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    openAdmin();
  } catch (error) {
    $("#login-error").textContent = error.message;
    $("#login-error").hidden = false;
  }
};
$("#logout").onclick = async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.reload();
};
document.addEventListener("click", (event) => {
  if (event.target.id === "save-config") saveConfig();
  if (event.target.classList.contains("tab")) {
    document
      .querySelectorAll(".tab")
      .forEach((tab) => tab.classList.toggle("active", tab === event.target));
    const isSettings = event.target.dataset.tab === "settings";
    $("#settings-tab").hidden = !isSettings;
    $("#leads-tab").hidden = isSettings;
    if (!isSettings) renderLeads();
  }
});
openAdmin();

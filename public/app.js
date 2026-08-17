const state = { config: null, answers: {}, step: 0 };
const contactStep = {
  key: "contact",
  label: "Where should we send your estimate?",
  type: "contact",
};
const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
}
function renderQuestion() {
  const questions = [...state.config.questions, contactStep];
  const question = questions[state.step];
  $("#step-label").textContent =
    `Step ${state.step + 1} of ${questions.length}`;
  $("#progress-bar").style.width =
    `${((state.step + 1) / questions.length) * 100}%`;
  $("#back").hidden = state.step === 0;
  $("#next").textContent =
    state.step === questions.length - 1 ? "Get my estimate" : "Continue";
  const error =
    state.errors &&
    (state.errors[question.key] ||
      (question.type === "contact" &&
        (state.errors.name || state.errors.phone || state.errors.email)));
  let content = `<h2>${escapeHtml(question.label)}</h2>`;
  if (question.type === "number")
    content += `<p class="hint">Enter a value from ${question.min.toLocaleString()} to ${question.max.toLocaleString()} ${escapeHtml(question.unit || "")}.</p><label>Enter an amount<input name="${question.key}" type="number" min="${question.min}" max="${question.max}" value="${escapeHtml(state.answers[question.key] || "")}" inputmode="numeric" autofocus></label>`;
  if (question.type === "select")
    content += `<div class="options">${question.options.map((option) => `<label class="option ${state.answers[question.key] === option.value ? "selected" : ""}"><input type="radio" name="${question.key}" value="${escapeHtml(option.value)}" ${state.answers[question.key] === option.value ? "checked" : ""}><span>${escapeHtml(option.label)}</span><b>›</b></label>`).join("")}</div>`;
  if (question.type === "contact")
    content += `<p class="hint">We’ll send your range and use this only to follow up on your request.</p><div class="contact-fields"><label>Your name<input name="name" value="${escapeHtml(state.answers.name || "")}" autocomplete="name"></label><label>Phone number<input name="phone" type="tel" value="${escapeHtml(state.answers.phone || "")}" autocomplete="tel"></label><label>Email address<input name="email" type="email" value="${escapeHtml(state.answers.email || "")}" autocomplete="email"></label></div>`;
  $("#question-form").innerHTML =
    `${content}${error ? `<p class="field-error">${escapeHtml(error)}</p>` : ""}`;
  $("#question-form").onchange = (event) => {
    state.answers[event.target.name] = event.target.value;
    state.errors = {};
    renderQuestion();
  };
  $("#question-form").oninput = (event) => {
    state.answers[event.target.name] = event.target.value;
  };
}
function currentIsValid() {
  const question =
    state.step === state.config.questions.length
      ? contactStep
      : state.config.questions[state.step];
  const errors = {};
  if (question.type === "contact")
    ["name", "phone", "email"].forEach((key) => {
      if (!String(state.answers[key] || "").trim())
        errors[key] = "Please complete your contact details.";
    });
  else if (!String(state.answers[question.key] || "").trim())
    errors[question.key] = "Please make a selection to continue.";
  if (Object.keys(errors).length) {
    state.errors = { [question.key]: Object.values(errors)[0] };
    renderQuestion();
    return false;
  }
  return true;
}
async function submitEstimate() {
  const payload = {
    name: state.answers.name,
    phone: state.answers.phone,
    email: state.answers.email,
    answers: {},
  };
  state.config.questions.forEach((question) => {
    payload.answers[question.key] =
      question.type === "number"
        ? Number(state.answers[question.key])
        : state.answers[question.key];
  });
  $("#next").disabled = true;
  $("#next").textContent = "Calculating…";
  const response = await fetch("/api/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    state.errors = data.errors || {};
    state.step = 0;
    const first = state.config.questions.findIndex(
      (question) => state.errors[question.key],
    );
    state.step = first >= 0 ? first : state.config.questions.length;
    renderQuestion();
    return;
  }
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: data.currency,
  });
  $("#estimator").hidden = true;
  $("#result").hidden = false;
  $("#result").innerHTML =
    `<p class="eyebrow">YOUR ESTIMATE RANGE</p><h2>${currency.format(data.estimate_low)} – ${currency.format(data.estimate_high)}</h2><p>This estimate includes material, standard tear-off, pitch and access factors, waste, and permit allowance. A Northline specialist will confirm the final scope after an on-site visit.</p><a href="/" class="button">Start another estimate</a>`;
}
$("#next").onclick = async () => {
  if (!currentIsValid()) return;
  if (state.step === state.config.questions.length) return submitEstimate();
  state.step += 1;
  state.errors = {};
  renderQuestion();
};
$("#back").onclick = () => {
  state.step -= 1;
  state.errors = {};
  renderQuestion();
};
fetch("/api/config")
  .then((response) => {
    if (!response.ok) throw new Error();
    return response.json();
  })
  .then((config) => {
    state.config = config;
    $("#loading").hidden = true;
    $("#estimator").hidden = false;
    renderQuestion();
  })
  .catch(() => {
    $("#loading").hidden = true;
    $("#load-error").hidden = false;
  });

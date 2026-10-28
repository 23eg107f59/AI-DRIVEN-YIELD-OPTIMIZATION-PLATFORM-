import { api, formatNumber, notify } from "./app.js";
import { createIcon } from "./field-visuals.js";

function resultSummary(label, value, icon) {
  const item = document.createElement("div");
  item.className = "result-summary-item";
  item.append(createIcon(icon));
  const text = document.createElement("span");
  const title = document.createElement("small");
  title.textContent = label;
  const amount = document.createElement("strong");
  amount.textContent = value;
  text.append(title, amount);
  item.append(text);
  return item;
}

function renderResult(result, values) {
  const card = document.querySelector("#prediction-result");
  const content = document.createElement("div");
  content.className = "result-data";
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "YOUR EXPERIMENTAL ESTIMATE";
  const title = document.createElement("h3");
  title.className = "result-title";
  title.textContent = "Scenario estimate";
  const crop = document.createElement("p");
  crop.className = "result-crop";
  crop.textContent = `${result.crop} · ${result.region}`;
  const yieldBlock = document.createElement("div");
  yieldBlock.className = "yield-result";
  const yieldHeading = document.createElement("div");
  yieldHeading.className = "result-section-title";
  yieldHeading.append(createIcon("crop"));
  const yieldLabel = document.createElement("span");
  yieldLabel.textContent = "PREDICTED YIELD";
  yieldHeading.append(yieldLabel);
  const yieldStrong = document.createElement("strong");
  yieldStrong.textContent = formatNumber(result.predicted_yield_kg_ha);
  const yieldUnit = document.createElement("small");
  yieldUnit.textContent = ` kg/ha · ${formatNumber(result.predicted_yield_t_ha, 3)} t/ha`;
  yieldBlock.append(yieldHeading, yieldStrong, yieldUnit);
  const summaries = document.createElement("div");
  summaries.className = "result-summary-grid";
  summaries.append(
    resultSummary("CULTIVATED AREA", `${formatNumber(result.area_ha, 2)} ha`, "ruler"),
    resultSummary("ESTIMATED PRODUCTION", `${formatNumber(result.estimated_production_t, 2)} t`, "harvest"),
  );
  const performance = document.createElement("section");
  performance.className = "result-performance";
  performance.setAttribute("aria-label", "Model performance");
  const performanceHeading = document.createElement("div");
  performanceHeading.className = "result-section-title";
  performanceHeading.append(createIcon("chart"));
  const performanceTitle = document.createElement("span");
  performanceTitle.textContent = "MODEL PERFORMANCE · HELD-OUT DATA";
  performanceHeading.append(performanceTitle);
  const performanceValues = document.createElement("div");
  performanceValues.className = "result-performance-values";
  const performanceOutputs = {};
  [
    ["R² score", "r2"],
    ["MAE · kg/ha", "mae"],
    ["RMSE · kg/ha", "rmse"],
  ].forEach(([label, key]) => {
    const item = document.createElement("span");
    const name = document.createElement("small");
    name.textContent = label;
    const value = document.createElement("strong");
    value.textContent = "Loading…";
    performanceOutputs[key] = value;
    item.append(name, value);
    performanceValues.append(item);
  });
  performance.append(performanceHeading, performanceValues);

  const recommendations = document.createElement("section");
  recommendations.className = "result-recommendations";
  recommendations.setAttribute("aria-label", "Irrigation, soil, and nutrient recommendations");
  const recommendationHeading = document.createElement("div");
  recommendationHeading.className = "result-section-title";
  recommendationHeading.append(createIcon("water"));
  const recommendationTitle = document.createElement("span");
  recommendationTitle.textContent = "FIELD CONDITION NOTES";
  recommendationHeading.append(recommendationTitle);
  const recommendationStatus = document.createElement("p");
  recommendationStatus.className = "result-loading";
  recommendationStatus.textContent = "Loading notes for the submitted crop and conditions…";
  recommendations.append(recommendationHeading, recommendationStatus);
  const note = document.createElement("p");
  note.className = "result-footnote";
  note.textContent = result.notice;
  content.append(eyebrow, title, crop, yieldBlock, summaries, performance, recommendations, note);
  card.replaceChildren(content);
  loadResultMetrics(performanceOutputs);
  loadResultRecommendations(recommendations, recommendationHeading, recommendationStatus, values);
}

async function loadResultMetrics(outputs) {
  try {
    const report = await api("/model-metrics");
    if (!report.available || !report.metrics) {
      Object.values(outputs).forEach((output) => { output.textContent = "Unavailable"; });
      return;
    }
    outputs.r2.textContent = formatNumber(report.r2_score, 3);
    outputs.mae.textContent = formatNumber(report.mae_kg_ha, 1);
    outputs.rmse.textContent = formatNumber(report.rmse_kg_ha, 1);
  } catch {
    Object.values(outputs).forEach((output) => { output.textContent = "Unavailable"; });
  }
}

async function loadResultRecommendations(container, heading, status, values) {
  try {
    const report = await api("/recommendations", {
      method: "POST",
      body: JSON.stringify(values),
    });
    const list = document.createElement("ul");
    list.className = "result-recommendations-list";
    report.recommendations.forEach((recommendation) => {
      const item = document.createElement("li");
      item.append(createIcon(recommendation.category.toLowerCase().includes("soil") ? "soil" : "drop"));
      const text = document.createElement("span");
      const category = document.createElement("strong");
      category.textContent = `${recommendation.category}: `;
      text.append(category, document.createTextNode(recommendation.text));
      item.append(text);
      list.append(item);
    });
    const notice = document.createElement("p");
    notice.className = "result-loading";
    notice.textContent = report.notice;
    container.replaceChildren(heading, list, notice);
  } catch (error) {
    status.textContent = `Condition notes unavailable: ${error.message}`;
  }
}

export function resetPredictionResult() {
  const card = document.querySelector("#prediction-result");
  if (!card || card.querySelector(".result-placeholder")) return;
  const placeholder = document.createElement("div");
  placeholder.className = "result-placeholder";
  const icon = document.createElement("span");
  icon.className = "result-orbit";
  icon.textContent = "✳";
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "YOUR ESTIMATE";
  const title = document.createElement("h3");
  title.textContent = "Your scenario, made measurable.";
  const copy = document.createElement("p");
  copy.textContent = "Complete the form to see estimated yield and total production.";
  placeholder.append(icon, eyebrow, title, copy);
  card.replaceChildren(placeholder);
}

export function initPrediction() {
  const form = document.querySelector("#prediction-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.querySelector("#predict-error");
    error.textContent = "";
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    Object.keys(values).forEach((key) => {
      if (values[key] === "") values[key] = null;
      else if (key !== "crop" && key !== "region" && key !== "season" && key !== "soil_type" && key !== "irrigation" && key !== "seed_variety") values[key] = Number(values[key]);
    });
    const button = document.querySelector("#predict-submit");
    button.disabled = true;
    button.textContent = "Working through your scenario…";
    try {
      const result = await api("/predict", { method: "POST", body: JSON.stringify(values) });
      renderResult(result, values);
      notify("Prediction saved to your local history.");
      document.querySelector("#home-total").textContent = "—";
      window.dispatchEvent(new Event("oilseed:prediction-saved"));
    } catch (requestError) {
      error.textContent = requestError.message;
      notify("Prediction could not be completed.", true);
    } finally {
      button.disabled = false;
      button.innerHTML = "Generate estimate <span>↗</span>";
    }
  });
}

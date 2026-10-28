import { api, notify } from "./app.js";

export function initRecommendations() {
  const form = document.querySelector("#recommendation-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.querySelector("#recommendation-error");
    error.textContent = "";
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    ["rainfall_mm", "temperature_c", "soil_ph", "nitrogen_kg_ha", "phosphorus_kg_ha", "potassium_kg_ha"].forEach((key) => {
      values[key] = Number(values[key]);
    });
    const button = document.querySelector("#recommend-submit");
    button.disabled = true;
    button.textContent = "Reviewing conditions…";
    try {
      const result = await api("/recommendations", { method: "POST", body: JSON.stringify(values) });
      renderRecommendations(result);
    } catch (requestError) {
      error.textContent = requestError.message;
      notify("Could not review those conditions.", true);
    } finally {
      button.disabled = false;
      button.innerHTML = "Review conditions <span>→</span>";
    }
  });
}

function renderRecommendations(data) {
  const list = document.querySelector("#recommendation-list");
  list.replaceChildren();
  data.recommendations.forEach((recommendation) => {
    const item = document.createElement("article");
    item.className = `recommendation-item ${recommendation.level}`;
    const icon = document.createElement("span");
    icon.className = "recommendation-dot";
    icon.textContent = recommendation.level === "attention" ? "!" : "✳";
    const text = document.createElement("div");
    const category = document.createElement("strong");
    category.textContent = recommendation.category;
    const detail = document.createElement("p");
    detail.textContent = recommendation.text;
    text.append(category, detail);
    item.append(icon, text);
    list.append(item);
  });
  document.querySelector("#recommendation-notice").textContent = data.notice;
}

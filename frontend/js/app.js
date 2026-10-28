import { loadDashboard } from "./dashboard.js";
import { initPrediction, resetPredictionResult } from "./predict.js";
import { loadHistory } from "./history.js";
import { initRecommendations } from "./recommendations.js";
import { initFieldVisuals } from "./field-visuals.js";

export const API_BASE = "/api";
const pageNames = {
  home: "Overview",
  dashboard: "Dashboard",
  predict: "Yield prediction",
  recommendations: "Recommendations",
  history: "Prediction history",
  about: "About the model",
};

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch {
    throw new Error("Could not reach the local server. Make sure Flask is running and try again.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

export function notify(message, isError = false) {
  const element = document.querySelector("#global-message");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.add("show");
  window.clearTimeout(notify.timeout);
  notify.timeout = window.setTimeout(() => element.classList.remove("show"), 3800);
}

export function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(Number(value));
}

export function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

export function navigate(page, updateHash = true) {
  if (!pageNames[page]) page = "home";
  document.querySelectorAll(".page-section").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });
  document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === page);
  });
  document.querySelector("#page-crumb").textContent = pageNames[page];
  document.querySelector("#sidebar").classList.remove("open");
  if (updateHash && window.location.hash !== `#${page}`) {
    window.history.replaceState(null, "", `#${page}`);
  }
  if (page === "dashboard") loadDashboard();
  if (page === "history") loadHistory();
  if (page === "predict") resetPredictionResult();
  if (page === "about") loadModelMetrics();
}

async function loadCropOptions() {
  try {
    const { crops } = await api("/crops");
    document.querySelectorAll('select[name="crop"]').forEach((select) => {
      const placeholder = select.querySelector("option");
      select.replaceChildren(placeholder);
      crops.forEach((crop) => {
        const option = document.createElement("option");
        option.value = crop;
        option.textContent = crop;
        select.append(option);
      });
    });
    ["#dash-crop-filter", "#history-crop"].forEach((selector) => {
      const select = document.querySelector(selector);
      crops.forEach((crop) => {
        const option = document.createElement("option");
        option.value = crop;
        option.textContent = crop;
        select.append(option);
      });
    });
  } catch (error) {
    notify(error.message, true);
  }
}

async function loadHomeStats() {
  try {
    const metrics = await api("/dashboard");
    document.querySelector("#home-total").textContent = formatNumber(metrics.total_predictions);
    document.querySelector("#home-average").textContent = metrics.average_yield_kg_ha === null
      ? "—"
      : formatNumber(metrics.average_yield_kg_ha);
  } catch {
    document.querySelector("#home-total").textContent = "—";
    document.querySelector("#home-average").textContent = "—";
  }
}

async function loadModelMetrics() {
  const status = document.querySelector("#metric-status");
  status.textContent = "Loading saved model evaluation…";
  try {
    const data = await api("/model-metrics");
    if (!data.available || !data.metrics) {
      status.textContent = data.error || "Model evaluation unavailable until a valid report exists.";
      document.querySelector("#metric-source").textContent = "Model evaluation unavailable.";
      return;
    }
    document.querySelector("#metric-mae").textContent = `${formatNumber(data.mae_kg_ha, 2)} kg/ha`;
    document.querySelector("#metric-rmse").textContent = `${formatNumber(data.rmse_kg_ha, 2)} kg/ha`;
    document.querySelector("#metric-r2").textContent = formatNumber(data.r2_score, 3);
    document.querySelector("#metric-mape").textContent = data.mape_percent === null
      ? "Unavailable"
      : `${formatNumber(data.mape_percent, 2)}%`;
    document.querySelector("#metric-model-name").textContent = data.model_name;
    document.querySelector("#metric-record-count").textContent =
      `${formatNumber(data.dataset.training_rows)} / ${formatNumber(data.dataset.test_rows)}`;
    document.querySelector("#metric-split").textContent = data.split.method;
    document.querySelector("#metric-dataset").textContent =
      `${data.dataset_source} · ${formatNumber(data.dataset.usable_rows)} usable / ${formatNumber(data.dataset.input_rows)} rows`;
    document.querySelector("#metric-crops").textContent = data.dataset.crop_types.join(", ");
    document.querySelector("#metric-regions").textContent = data.dataset.regions.join(", ");
    document.querySelector("#metric-timestamp").textContent = formatDate(data.evaluated_at, true);
    document.querySelector("#metric-source").textContent = data.dataset_source;
    status.textContent = data.limitations;
  } catch (error) {
    status.textContent = error.message;
    document.querySelector("#metric-source").textContent = "Model evaluation unavailable.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadCropOptions();
  initFieldVisuals();
  initPrediction();
  initRecommendations();
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.page));
  });
  document.querySelector("#menu-toggle").addEventListener("click", () => {
    document.querySelector("#sidebar").classList.toggle("open");
  });
  document.querySelector("#sidebar").addEventListener("click", (event) => {
    if (!event.target.closest("[data-page]")) return;
  });
  document.querySelector("#dash-apply").addEventListener("click", loadDashboard);
  document.querySelector("#dash-reset").addEventListener("click", () => {
    document.querySelector("#dash-crop-filter").value = "";
    document.querySelector("#dash-from").value = "";
    document.querySelector("#dash-to").value = "";
    loadDashboard();
  });
  window.addEventListener("hashchange", () => navigate(window.location.hash.slice(1), false));
  window.addEventListener("oilseed:prediction-saved", loadHomeStats);
  document.querySelectorAll("img[data-fallback]").forEach((image) => {
    const showFallback = () => {
      image.hidden = true;
      image.style.display = "none";
      const parent = image.closest(".image-frame, .crop-photo-card, .dashboard-photo-banner");
      if (parent) {
        parent.dataset.fallback = image.dataset.fallback;
        parent.setAttribute("role", "img");
        parent.setAttribute("aria-label", image.dataset.fallback);
        parent.classList.add("image-unavailable");
      }
    };
    image.addEventListener("error", showFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback();
  });
  const initialPage = window.location.hash.slice(1);
  navigate(pageNames[initialPage] ? initialPage : "home", false);
  loadHomeStats();
});

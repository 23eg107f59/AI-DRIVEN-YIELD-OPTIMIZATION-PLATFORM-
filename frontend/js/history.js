import { api, formatDate, formatNumber, notify } from "./app.js";

function addCell(row, className, text) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function renderRows(records) {
  const body = document.querySelector("#history-body");
  const empty = document.querySelector("#history-empty");
  body.replaceChildren();
  empty.style.display = records.length ? "none" : "flex";
  document.querySelector("#history-count").textContent = `${records.length} ${records.length === 1 ? "scenario" : "scenarios"}`;
  records.forEach((item) => {
    const row = document.createElement("tr");
    const cropCell = document.createElement("td");
    const cropWrap = document.createElement("div");
    cropWrap.className = "crop-cell";
    const icon = document.createElement("i");
    icon.textContent = item.crop.slice(0, 1);
    const cropInfo = document.createElement("div");
    const crop = document.createElement("strong");
    crop.textContent = item.crop;
    const region = document.createElement("small");
    region.textContent = `${item.region} · ${item.season}`;
    cropInfo.append(crop, region);
    cropWrap.append(icon, cropInfo);
    cropCell.append(cropWrap);
    row.append(cropCell);
    addCell(row, "yield-cell", `${formatNumber(item.predicted_yield_kg_ha)} kg/ha`);
    addCell(row, "", `${formatNumber(item.area_ha, 2)} ha`);
    addCell(row, "", `${formatNumber(item.estimated_production_kg / 1000, 2)} t`);
    addCell(row, "", formatDate(item.created_at, true));
    const actions = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "row-actions";
    const details = document.createElement("button");
    details.type = "button";
    details.textContent = "Details";
    details.setAttribute("aria-label", `View ${item.crop} prediction details`);
    details.addEventListener("click", () => showDetails(item.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${item.crop} prediction`);
    remove.addEventListener("click", () => removePrediction(item.id));
    actionWrap.append(details, remove);
    actions.append(actionWrap);
    row.append(actions);
    body.append(row);
  });
}

function filters() {
  const params = new URLSearchParams();
  [["search", "#history-search"], ["crop", "#history-crop"], ["from", "#history-from"], ["to", "#history-to"], ["sort", "#history-sort"]].forEach(([key, selector]) => {
    const value = document.querySelector(selector).value;
    if (value) params.set(key, value);
  });
  return params;
}

export async function loadHistory() {
  const loading = document.querySelector("#history-loading");
  const empty = document.querySelector("#history-empty");
  loading.style.display = "flex";
  empty.style.display = "none";
  try {
    const data = await api(`/history?${filters()}`);
    renderRows(data.predictions);
  } catch (error) {
    notify(error.message, true);
  } finally {
    loading.style.display = "none";
  }
}

async function showDetails(id) {
  try {
    const item = await api(`/history/${id}`);
    const dialog = document.querySelector("#detail-dialog");
    const content = document.querySelector("#detail-content");
    const summary = document.createElement("div");
    summary.className = "detail-summary";
    summary.textContent = `${formatNumber(item.predicted_yield_kg_ha)} kg/ha predicted · ${formatNumber(item.estimated_production_kg / 1000, 2)} tonnes estimated total production`;
    const grid = document.createElement("div");
    grid.className = "detail-content-grid";
    const labels = {
      crop: "Crop",
      region: "Region",
      season: "Season",
      area_ha: "Cultivated area (ha)",
      rainfall_mm: "Rainfall (mm)",
      temperature_c: "Temperature (°C)",
      soil_type: "Soil type",
      soil_ph: "Soil pH",
      nitrogen_kg_ha: "Nitrogen (kg/ha)",
      phosphorus_kg_ha: "Phosphorus (kg/ha)",
      potassium_kg_ha: "Potassium (kg/ha)",
      irrigation: "Irrigation",
      seed_variety: "Seed variety",
      fertilizer_kg_ha: "Fertilizer (kg/ha)",
      previous_yield_kg_ha: "Previous yield (kg/ha)",
    };
    Object.entries(labels).forEach(([key, label]) => {
      const field = document.createElement("div");
      const name = document.createElement("span");
      name.textContent = label;
      const value = document.createElement("strong");
      value.textContent = item.inputs[key] === null || item.inputs[key] === undefined
        ? "Not provided"
        : String(item.inputs[key]);
      field.append(name, value);
      grid.append(field);
    });
    const timestamp = document.createElement("p");
    timestamp.className = "subtle-notice";
    timestamp.textContent = `Saved ${formatDate(item.created_at, true)}`;
    content.replaceChildren(summary, grid, timestamp);
    dialog.showModal();
  } catch (error) {
    notify(error.message, true);
  }
}

async function removePrediction(id) {
  if (!window.confirm("Delete this saved prediction? This cannot be undone.")) return;
  try {
    await api(`/history/${id}`, { method: "DELETE" });
    notify("Prediction removed from history.");
    await loadHistory();
    window.dispatchEvent(new Event("oilseed:prediction-saved"));
  } catch (error) {
    notify(error.message, true);
  }
}

document.querySelector("#detail-close").addEventListener("click", () => {
  document.querySelector("#detail-dialog").close();
});
document.querySelector("#history-apply").addEventListener("click", loadHistory);
document.querySelector("#history-sort").addEventListener("change", loadHistory);
document.querySelector("#history-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadHistory();
});
window.addEventListener("oilseed:prediction-saved", () => {
  const section = document.querySelector("#page-history");
  if (section.classList.contains("active")) loadHistory();
});

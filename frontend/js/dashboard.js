import { api, formatDate, formatNumber, notify } from "./app.js";

const charts = {};
const palette = ["#477c54", "#bb9655", "#8da75b", "#6d8da0", "#c07b55", "#8b78a8"];
const cropImages = {
  Groundnut: "groundnut_farming.jpg",
  Mustard: "mustard_india.jpg",
  Soybean: "soybean_field.jpg",
  Sunflower: "sunflower_farm.jpg",
  Sesame: "sesame_field_india.jpg",
  Rapeseed: "mustard_india.jpg",
};
let agricultureControlsInitialized = false;
const agricultureColors = ["#477c54", "#bb9655", "#8da75b", "#6d8da0", "#c07b55", "#8b78a8", "#4f9b8d", "#bd6d83"];

function makeChart(id, config) {
  if (charts[id]) charts[id].destroy();
  const canvas = document.querySelector(`#${id}`);
  if (!canvas || !window.Chart) return;
  charts[id] = new window.Chart(canvas, config);
}

function showEmpty(canvasId, emptyId, empty) {
  document.querySelector(`#${canvasId}`).style.display = empty ? "none" : "block";
  document.querySelector(`#${emptyId}`).style.display = empty ? "flex" : "none";
}

function makeRecent(items) {
  const container = document.querySelector("#dash-recent");
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-inline";
    empty.textContent = "No scenarios match these filters yet.";
    container.append(empty);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "recent-row";
    const badge = document.createElement("img");
    badge.className = "crop-bullet crop-thumbnail";
    badge.src = `/assets/images/${cropImages[item.crop] || "mustard_india.jpg"}`;
    badge.alt = `${item.crop} field thumbnail`;
    badge.loading = "lazy";
    badge.addEventListener("error", () => {
      badge.hidden = true;
      badge.style.display = "none";
      badge.classList.add("image-unavailable");
    }, { once: true });
    const details = document.createElement("div");
    const crop = document.createElement("strong");
    crop.textContent = item.crop;
    const region = document.createElement("small");
    region.textContent = `${item.region} · ${formatDate(item.created_at)}`;
    details.append(crop, region);
    const yieldValue = document.createElement("b");
    yieldValue.textContent = `${formatNumber(item.predicted_yield_kg_ha)} kg/ha`;
    row.append(badge, details, yieldValue);
    container.append(row);
  });
}

function showEvaluationEmpty(canvasId, emptyId, isEmpty) {
  document.querySelector(`#${canvasId}`).style.display = isEmpty ? "none" : "block";
  document.querySelector(`#${emptyId}`).style.display = isEmpty ? "flex" : "none";
}

function resetEvaluationValues(message) {
  ["#dash-metric-r2", "#dash-metric-mae", "#dash-metric-rmse", "#dash-metric-mape"].forEach((selector) => {
    document.querySelector(selector).textContent = "—";
  });
  document.querySelector("#dashboard-model-status").textContent = message;
  ["actual-predicted-chart", "metric-chart", "residual-chart", "crop-performance-chart"].forEach((id) => {
    if (charts[id]) charts[id].destroy();
    const canvas = document.querySelector(`#${id}`);
    const emptyId = `${id}-empty`;
    if (canvas && document.querySelector(`#${emptyId}`)) showEvaluationEmpty(id, emptyId, true);
  });
}

function setOptions(selector, values, placeholder) {
  const select = document.querySelector(selector);
  const selected = select.value;
  select.replaceChildren(new Option(placeholder, ""));
  values.forEach((value) => select.add(new Option(value, value)));
  select.value = values.includes(selected) ? selected : "";
}

function agricultureFilters() {
  const params = new URLSearchParams();
  [
    ["crop", "#agriculture-crop-filter"],
    ["state", "#agriculture-state-filter"],
    ["district", "#agriculture-district-filter"],
    ["season", "#agriculture-season-filter"],
    ["year", "#agriculture-year-filter"],
  ].forEach(([key, selector]) => {
    const value = document.querySelector(selector).value.trim();
    if (value) params.set(key, value);
  });
  return params;
}

function latestRows(rows, groupKeys) {
  const latest = new Map();
  rows.forEach((row) => {
    const key = groupKeys.map((field) => row[field]).join("|");
    const current = latest.get(key);
    if (!current || row.crop_year > current.crop_year) latest.set(key, row);
  });
  return [...latest.values()];
}

function drawAgricultureCharts(data, selectedCrop, selectedState) {
  const trends = data.trends;
  const regionalRows = selectedState
    ? trends
    : trends.filter((row) => row.state === "India");
  const years = [...new Set(regionalRows.map((row) => row.crop_year))].sort();
  const series = new Map();
  regionalRows.forEach((row) => {
    const cropKey = selectedCrop ? "" : `${row.crop} · `;
    const key = `${cropKey}${row.state} · ${row.source_name}`;
    if (!series.has(key)) series.set(key, new Map());
    series.get(key).set(row.crop_year, row.yield_kg_ha);
  });
  showEmpty("agriculture-trend-chart", "agriculture-trend-empty", !regionalRows.length);
  if (regionalRows.length) makeChart("agriculture-trend-chart", {
    type: "line",
    data: {
      labels: years,
      datasets: [...series.entries()].map(([label, values], index) => ({
        label,
        data: years.map((year) => values.get(year) ?? null),
        borderColor: agricultureColors[index % agricultureColors.length],
        backgroundColor: agricultureColors[index % agricultureColors.length],
        tension: .25,
        pointRadius: 2,
        spanGaps: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 8, font: { size: 8 } } } },
      scales: {
        x: { title: { display: true, text: "Crop year" }, grid: { display: false } },
        y: { beginAtZero: true, title: { display: true, text: "Reported yield (kg/ha)" }, grid: { color: "#edf1ec" } },
      },
    },
  });

  const latestByCropAndRegion = latestRows(regionalRows, ["crop", "state", "source_id"]);
  showEmpty("agriculture-crop-chart", "agriculture-crop-empty", !latestByCropAndRegion.length);
  if (latestByCropAndRegion.length) makeChart("agriculture-crop-chart", {
    type: "bar",
    data: {
      labels: latestByCropAndRegion.map((row) => `${row.crop} · ${row.state} · ${row.source_name} · ${row.crop_year}`),
      datasets: [{
        label: "Reported yield (kg/ha)",
        data: latestByCropAndRegion.map((row) => row.yield_kg_ha),
        backgroundColor: latestByCropAndRegion.map((_, index) => agricultureColors[index % agricultureColors.length]),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, title: { display: true, text: "Yield (kg/ha)" }, grid: { color: "#edf1ec" } },
        y: { grid: { display: false }, ticks: { font: { size: 8 } } },
      },
    },
  });

  const latestByState = selectedCrop
    ? latestRows(
      trends.filter((row) => row.crop === selectedCrop && row.state !== "India"),
      ["state", "source_id"],
    )
    : [];
  showEmpty("agriculture-state-chart", "agriculture-state-empty", !latestByState.length);
  if (latestByState.length) makeChart("agriculture-state-chart", {
    type: "bar",
    data: {
      labels: latestByState.map((row) => `${row.state} · ${row.source_name} · ${row.crop_year}`),
      datasets: [{
        label: `${selectedCrop} yield (kg/ha)`,
        data: latestByState.map((row) => row.yield_kg_ha),
        backgroundColor: latestByState.map((_, index) => agricultureColors[index % agricultureColors.length]),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, title: { display: true, text: "Yield (kg/ha)" }, grid: { color: "#edf1ec" } },
        y: { grid: { display: false }, ticks: { font: { size: 8 } } },
      },
    },
  });

  const areaRows = selectedCrop
    ? regionalRows.filter((row) => row.crop === selectedCrop)
    : [];
  const areaYears = [...new Set(areaRows.map((row) => row.crop_year))].sort();
  const areaSeries = new Map();
  areaRows.forEach((row) => {
    const key = `${row.state} · ${row.source_name}`;
    if (!areaSeries.has(key)) areaSeries.set(key, new Map());
    areaSeries.get(key).set(row.crop_year, row);
  });
  const hasArea = areaRows.some((row) => row.area_ha !== null || row.production_tonnes !== null);
  showEmpty("agriculture-production-chart", "agriculture-production-empty", !hasArea);
  if (hasArea) {
    const datasets = [];
    [...areaSeries.entries()].forEach(([label, values], index) => {
      const color = agricultureColors[index % agricultureColors.length];
      datasets.push({
        label: `Area (ha) · ${label}`,
        data: areaYears.map((year) => values.get(year)?.area_ha ?? null),
        borderColor: color,
        backgroundColor: color,
        yAxisID: "area",
        pointRadius: 2,
        tension: .25,
      });
      datasets.push({
        label: `Production (tonnes) · ${label}`,
        data: areaYears.map((year) => values.get(year)?.production_tonnes ?? null),
        borderColor: color,
        borderDash: [5, 3],
        yAxisID: "production",
        pointRadius: 2,
        tension: .25,
      });
    });
    makeChart("agriculture-production-chart", {
      type: "line",
      data: { labels: areaYears, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: { legend: { position: "bottom", labels: { boxWidth: 8, font: { size: 7 } } } },
        scales: {
          x: { title: { display: true, text: "Crop year" }, grid: { display: false } },
          area: { type: "linear", position: "left", title: { display: true, text: "Area (ha)" }, grid: { color: "#edf1ec" } },
          production: { type: "linear", position: "right", title: { display: true, text: "Production (tonnes)" }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  const sources = [...new Set(regionalRows.map((row) => row.source_name))];
  const period = years.length ? `${years[0]}–${years[years.length - 1]}` : "No reporting period";
  document.querySelector("#agriculture-trend-source").textContent = `Sources: ${sources.join("; ") || "none"} · ${period}. Regional aggregates are not farmer records.`;
  document.querySelector("#agriculture-crop-source").textContent = `Latest available year per crop and region · ${sources.join("; ") || "no connected source"}.`;
  document.querySelector("#agriculture-state-source").textContent = selectedCrop
    ? `Latest available ${selectedCrop} yield per region · source series kept separate.`
    : "Choose a crop filter to compare state-level records.";
  document.querySelector("#agriculture-production-source").textContent = selectedCrop
    ? `Reported area and production for ${selectedCrop}; units shown as hectares and tonnes.`
    : "Choose a crop filter. National and state records remain separate.";
}

function renderAgricultureSources(sources) {
  const container = document.querySelector("#agriculture-source-list");
  container.replaceChildren();
  sources.forEach((source) => {
    const item = document.createElement("div");
    item.className = "agriculture-source-item";
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.name;
    const status = document.createElement("span");
    status.textContent = source.configured
      ? `${source.status} · ${formatNumber(source.record_count || 0)} records`
      : `Not connected · ${source.access_method}`;
    item.append(link, status);
    container.append(item);
  });
}

function renderAgricultureStatus(status) {
  const state = document.querySelector("#agriculture-sync-status");
  const lastSync = status.last_successful_sync
    ? formatDate(status.last_successful_sync, true)
    : "No successful synchronization yet";
  state.textContent = `Synchronization: ${status.status} · Last successful sync: ${lastSync} · Latest run: ${formatNumber(status.inserted)} inserted, ${formatNumber(status.updated)} updated, ${formatNumber(status.skipped)} skipped, ${formatNumber(status.rejected)} rejected.`;
  const errorBox = document.querySelector("#agriculture-sync-errors");
  errorBox.textContent = status.errors?.length
    ? `Source errors: ${status.errors.join(" | ")}`
    : "";
}

async function loadAgricultureData() {
  try {
    const params = agricultureFilters();
    const query = params.size ? `?${params}` : "";
    const [data, status, sources] = await Promise.all([
      api(`/agriculture/statistics${query}`),
      api("/agriculture/sync-status"),
      api("/agriculture/sources"),
    ]);
    const crops = [...new Set(data.trends.map((row) => row.crop))].sort();
    const states = [...new Set(data.trends.map((row) => row.state))].sort();
    const seasons = [...new Set(data.trends.map((row) => row.season))].sort();
    const years = [...new Set(data.trends.map((row) => row.crop_year))].sort().reverse();
    setOptions("#agriculture-crop-filter", crops, "All crops");
    setOptions("#agriculture-state-filter", states, "All regions");
    setOptions("#agriculture-season-filter", seasons, "All seasons");
    setOptions("#agriculture-year-filter", years, "All years");
    document.querySelector("#agriculture-record-count").textContent = formatNumber(data.total_records);
    document.querySelector("#agriculture-crop-count").textContent = formatNumber(data.crop_count);
    document.querySelector("#agriculture-state-count").textContent = formatNumber(data.state_count);
    document.querySelector("#agriculture-year-coverage").textContent = data.first_year
      ? `${data.first_year}–${data.latest_year}`
      : "No data";
    renderAgricultureStatus(status);
    renderAgricultureSources(sources.sources);
    drawAgricultureCharts(data, params.get("crop") || "", params.get("state") || "");
  } catch (error) {
    document.querySelector("#agriculture-sync-status").textContent = "Historical data could not be loaded.";
    document.querySelector("#agriculture-sync-errors").textContent = error.message;
    notify(error.message, true);
  }
}

function initAgricultureControls() {
  if (agricultureControlsInitialized) return;
  agricultureControlsInitialized = true;
  document.querySelector("#agriculture-apply-filters").addEventListener("click", loadAgricultureData);
  document.querySelector("#agriculture-reset-filters").addEventListener("click", () => {
    ["#agriculture-crop-filter", "#agriculture-state-filter", "#agriculture-season-filter", "#agriculture-year-filter"].forEach((selector) => {
      document.querySelector(selector).value = "";
    });
    document.querySelector("#agriculture-district-filter").value = "";
    loadAgricultureData();
  });
  document.querySelector("#agriculture-sync-button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const job = await api("/agriculture/sync", { method: "POST" });
      document.querySelector("#agriculture-sync-status").textContent = "Synchronization queued; waiting for source results…";
      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const status = await api("/agriculture/sync-status");
        renderAgricultureStatus(status);
        if (status.last_run_id === job.id && !["queued", "running"].includes(status.status)) {
          if (status.status === "failed") throw new Error(status.errors.join(" | ") || "Synchronization failed.");
          await loadAgricultureData();
          notify(status.status === "partial"
            ? "Synchronization finished with source errors; previous records were retained."
            : `Synchronization complete: ${formatNumber(status.inserted)} inserted, ${formatNumber(status.updated)} updated, ${formatNumber(status.skipped)} skipped.`);
          return;
        }
      }
      throw new Error("Synchronization is still running. Check the status again shortly.");
    } catch (error) {
      notify(error.message, true);
      await loadAgricultureData();
    } finally {
      button.disabled = false;
    }
  });
}

function residualHistogram(predictions) {
  const residuals = predictions.map((item) => item.residual_kg_ha);
  const low = Math.min(...residuals);
  const high = Math.max(...residuals);
  const width = high === low ? 1 : (high - low) / 6;
  const bins = Array.from({ length: 6 }, (_, index) => ({
    label: `${formatNumber(low + width * index, 0)} to ${formatNumber(index === 5 ? high : low + width * (index + 1), 0)}`,
    count: 0,
  }));
  residuals.forEach((value) => {
    const index = Math.min(5, Math.floor((value - low) / width));
    bins[index].count += 1;
  });
  return bins;
}

async function loadModelEvaluation() {
  try {
    const report = await api("/model-metrics");
    if (!report.available || !report.metrics || !report.test_predictions.length) {
      resetEvaluationValues(report.error || "Model evaluation unavailable.");
      return;
    }
    document.querySelector("#dash-metric-r2").textContent = formatNumber(report.r2_score, 3);
    document.querySelector("#dash-metric-mae").textContent = `${formatNumber(report.mae_kg_ha, 2)} kg/ha`;
    document.querySelector("#dash-metric-rmse").textContent = `${formatNumber(report.rmse_kg_ha, 2)} kg/ha`;
    document.querySelector("#dash-metric-mape").textContent = report.mape_percent === null
      ? "Unavailable"
      : `${formatNumber(report.mape_percent, 2)}%`;
    document.querySelector("#dashboard-model-description").textContent =
      `${report.model_name} · ${report.dataset.training_rows} training / ${report.dataset.test_rows} held-out test rows · ${report.split.method}.`;
    document.querySelector("#dashboard-model-status").textContent = report.limitations;

    const points = report.test_predictions.map((item) => ({
      x: item.actual_yield_kg_ha,
      y: item.predicted_yield_kg_ha,
      crop: item.crop,
      region: item.region,
    }));
    const bounds = [
      Math.min(...points.map((point) => Math.min(point.x, point.y))),
      Math.max(...points.map((point) => Math.max(point.x, point.y))),
    ];
    showEvaluationEmpty("actual-predicted-chart", "actual-predicted-empty", false);
    makeChart("actual-predicted-chart", {
      type: "scatter",
      data: {
        datasets: [
          { label: "Held-out records", data: points, backgroundColor: "#4b8056", pointRadius: 5 },
          { label: "Ideal estimate", data: [{ x: bounds[0], y: bounds[0] }, { x: bounds[1], y: bounds[1] }], type: "line", borderColor: "#c48a45", borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: (context) => context.datasetIndex === 0
            ? `${context.raw.crop}, ${context.raw.region}: actual ${formatNumber(context.raw.x)}; predicted ${formatNumber(context.raw.y)} kg/ha`
            : "Ideal: predicted equals actual" } },
        },
        scales: {
          x: { title: { display: true, text: "Actual yield (kg/ha)" }, grid: { color: "#edf1ec" } },
          y: { title: { display: true, text: "Predicted yield (kg/ha)" }, grid: { color: "#edf1ec" } },
        },
      },
    });

    showEvaluationEmpty("metric-chart", "metric-chart-empty", false);
    makeChart("metric-chart", {
      type: "bar",
      data: {
        labels: ["MAE", "RMSE"],
        datasets: [{
          label: "kg/ha",
          data: [report.mae_kg_ha, report.rmse_kg_ha],
          backgroundColor: ["#56805a", "#c08d4a"],
          borderRadius: 5,
          maxBarThickness: 48,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${formatNumber(context.raw, 2)} kg/ha` } } },
        scales: {
          x: { title: { display: true, text: "Regression error metric" }, grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: "Error (kg/ha)" }, grid: { color: "#edf1ec" } },
        },
      },
    });

    showEvaluationEmpty("residual-chart", "residual-chart-empty", false);
    const bins = residualHistogram(report.test_predictions);
    makeChart("residual-chart", {
      type: "bar",
      data: {
        labels: bins.map((bin) => bin.label),
        datasets: [{ label: "Held-out records", data: bins.map((bin) => bin.count), backgroundColor: "#6f8a67", borderRadius: 4 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: "Residual (actual − predicted, kg/ha)" }, grid: { display: false }, ticks: { maxRotation: 35 } },
          y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Number of records" }, grid: { color: "#edf1ec" } },
        },
      },
    });

    const hasCropMetrics = report.crop_metrics.length > 0;
    showEvaluationEmpty("crop-performance-chart", "crop-performance-empty", !hasCropMetrics);
    if (hasCropMetrics) makeChart("crop-performance-chart", {
      type: "bar",
      data: {
        labels: report.crop_metrics.map((item) => item.crop),
        datasets: [{ label: "MAE (kg/ha)", data: report.crop_metrics.map((item) => item.mae_kg_ha), backgroundColor: "#7a9863", borderRadius: 4 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: (context) => `${report.crop_metrics[context.dataIndex].test_rows} held-out records` } } },
        scales: {
          x: { beginAtZero: true, title: { display: true, text: "Mean absolute error (kg/ha)" }, grid: { color: "#edf1ec" } },
          y: { grid: { display: false } },
        },
      },
    });
  } catch (error) {
    resetEvaluationValues(error.message);
  }
}

export async function loadDashboard() {
  initAgricultureControls();
  loadModelEvaluation();
  loadAgricultureData();
  const params = new URLSearchParams();
  [["crop", "#dash-crop-filter"], ["from", "#dash-from"], ["to", "#dash-to"]].forEach(([key, selector]) => {
    const value = document.querySelector(selector).value;
    if (value) params.set(key, value);
  });
  try {
    const data = await api(`/dashboard${params.size ? `?${params}` : ""}`);
    document.querySelector("#dash-total").textContent = formatNumber(data.total_predictions);
    document.querySelector("#dash-average").textContent = data.average_yield_kg_ha === null
      ? "—"
      : formatNumber(data.average_yield_kg_ha);
    document.querySelector("#dash-crop").textContent = data.most_selected_crop || "—";
    document.querySelector("#dash-crop-sub").textContent = data.most_selected_crop
      ? `${data.crop_distribution.find((item) => item.crop === data.most_selected_crop)?.count || 0} saved scenarios`
      : "No saved scenarios yet";
    const hasCrops = data.crop_averages.length > 0;
    showEmpty("crop-chart", "crop-empty", !hasCrops);
    if (hasCrops) makeChart("crop-chart", {
      type: "bar",
      data: {
        labels: data.crop_averages.map((item) => item.crop),
        datasets: [{
          data: data.crop_averages.map((item) => item.yield_kg_ha),
          backgroundColor: palette.slice(0, data.crop_averages.length),
          borderRadius: 5,
          maxBarThickness: 35,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${formatNumber(context.raw)} kg/ha` } } },
        scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { beginAtZero: true, grid: { color: "#edf1ec" }, ticks: { font: { size: 8 } } } },
      },
    });
    const hasTimeline = data.history.length > 0;
    showEmpty("timeline-chart", "timeline-empty", !hasTimeline);
    if (hasTimeline) makeChart("timeline-chart", {
      type: "line",
      data: {
        labels: data.history.map((item) => formatDate(item.date)),
        datasets: [{
          data: data.history.map((item) => item.yield_kg_ha),
          borderColor: "#56805a",
          backgroundColor: "rgba(86,128,90,.12)",
          fill: true,
          tension: .35,
          pointRadius: 3,
          pointBackgroundColor: "#56805a",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${formatNumber(context.raw)} kg/ha` } } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 8 } } }, y: { beginAtZero: true, grid: { color: "#edf1ec" }, ticks: { font: { size: 8 } } } },
      },
    });
    const hasDistribution = data.crop_distribution.length > 0;
    showEmpty("distribution-chart", "distribution-empty", !hasDistribution);
    if (hasDistribution) makeChart("distribution-chart", {
      type: "doughnut",
      data: {
        labels: data.crop_distribution.map((item) => item.crop),
        datasets: [{ data: data.crop_distribution.map((item) => item.count), backgroundColor: palette, borderWidth: 2, borderColor: "#fff" }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: "66%", plugins: { legend: { position: "bottom", labels: { boxWidth: 8, padding: 10, font: { size: 8 } } } } },
    });
    makeRecent(data.recent_predictions);
  } catch (error) {
    notify(error.message, true);
  }
}

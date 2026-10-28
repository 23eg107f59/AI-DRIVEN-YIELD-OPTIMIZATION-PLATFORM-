const iconByField = {
  crop: "crop",
  region: "pin",
  season: "calendar",
  area_ha: "ruler",
  rainfall_mm: "rain",
  temperature_c: "temperature",
  soil_type: "soil",
  soil_ph: "ph",
  nitrogen_kg_ha: "nutrient",
  phosphorus_kg_ha: "nutrient",
  potassium_kg_ha: "nutrient",
  irrigation: "water",
  seed_variety: "seed",
  fertilizer_kg_ha: "fertilizer",
  previous_yield_kg_ha: "chart",
};

const nutrientNames = {
  nitrogen_kg_ha: "Nitrogen",
  phosphorus_kg_ha: "Phosphorus",
  potassium_kg_ha: "Potassium",
};

const nutrientSymbols = {
  nitrogen_kg_ha: "N",
  phosphorus_kg_ha: "P",
  potassium_kg_ha: "K",
};

const fieldBounds = {
  area_ha: [0.01, 100000],
  rainfall_mm: [0, 5000],
  temperature_c: [-10, 60],
  soil_ph: [0, 14],
  nitrogen_kg_ha: [0, 1000],
  phosphorus_kg_ha: [0, 1000],
  potassium_kg_ha: [0, 1000],
  fertilizer_kg_ha: [0, 5000],
  previous_yield_kg_ha: [0, 30000],
};

const fieldPlaceholders = {
  region: "e.g. Madhya Pradesh",
  area_ha: "Enter cultivated area in hectares",
  rainfall_mm: "Enter rainfall in mm (e.g., 700)",
  temperature_c: "Enter temperature in °C (e.g., 26)",
  soil_ph: "Enter soil pH (e.g., 6.5)",
  nitrogen_kg_ha: "Enter nitrogen rate (kg/ha)",
  phosphorus_kg_ha: "Enter phosphorus rate (kg/ha)",
  potassium_kg_ha: "Enter potassium rate (kg/ha)",
  seed_variety: "e.g. Local variety",
  fertilizer_kg_ha: "Enter fertilizer applied (kg/ha)",
  previous_yield_kg_ha: "Leave blank if unknown",
};

const pHDescriptions = [
  { minimum: 0, maximum: 5.5, name: "Strongly acidic", color: "#c85e4d" },
  { minimum: 5.5, maximum: 6, name: "Moderately acidic", color: "#d9894f" },
  { minimum: 6, maximum: 6.5, name: "Slightly acidic", color: "#c5a845" },
  { minimum: 6.5, maximum: 7.5, includeMaximum: true, name: "Near neutral", color: "#638d5d" },
  { minimum: 7.5, maximum: 14, name: "Alkaline", color: "#879650" },
];

export function createIcon(name, className = "visual-icon") {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.classList.add(className);
  icon.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#icon-${name}`);
  icon.append(use);
  return icon;
}

function decorateField(label, control, field) {
  if (label.querySelector(".field-label")) return;
  const text = [...label.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
  );
  const fieldName = text?.textContent.trim() || control.name || control.id;
  if (text) text.textContent = "";

  const heading = document.createElement("span");
  heading.className = "field-label";
  heading.dataset.field = field;
  heading.append(createIcon(iconByField[field]));
  const name = document.createElement("span");
  name.textContent = fieldName;
  heading.append(name);

  if (nutrientSymbols[field]) {
    const badge = document.createElement("span");
    badge.className = `nutrient-badge nutrient-${nutrientSymbols[field].toLowerCase()}`;
    badge.textContent = nutrientSymbols[field];
    badge.setAttribute("aria-hidden", "true");
    heading.append(badge);
  }
  label.prepend(heading);
  label.classList.add("field-enhanced");
  label.dataset.field = field;
  control.dataset.field = field;
  if (control instanceof HTMLInputElement && fieldPlaceholders[field] && !control.placeholder) {
    control.placeholder = fieldPlaceholders[field];
  }
  if (control instanceof HTMLInputElement && fieldBounds[field]) {
    [control.min, control.max] = fieldBounds[field].map(String);
  }

  if (nutrientNames[field]) {
    addHelpText(
      label,
      control,
      `${nutrientNames[field]} rate recorded for this scenario (0–1,000 kg/ha). Crop needs vary with soil and local guidance.`,
    );
  } else if (field === "fertilizer_kg_ha") {
    addHelpText(
      label,
      control,
      "Enter the fertilizer applied (0–5,000 kg/ha); this is not a universal crop recommendation.",
    );
  }
}

function addHelpText(label, control, text) {
  const help = document.createElement("small");
  help.className = "field-help";
  help.id = `${control.form?.id || "field"}-${control.name}-help`;
  help.textContent = text;
  label.append(help);
  control.setAttribute("aria-describedby", help.id);
}

function decorateFields() {
  document.querySelectorAll("#prediction-form label, #recommendation-form label").forEach((label) => {
    const control = label.querySelector("input, select");
    if (control && iconByField[control.name]) decorateField(label, control, control.name);
  });

  [
    ["#dash-crop-filter", "crop"],
    ["#dash-from", "season"],
    ["#dash-to", "season"],
    ["#history-crop", "crop"],
    ["#history-from", "season"],
    ["#history-to", "season"],
    ["#history-sort", "chart"],
  ].forEach(([selector, iconName]) => {
    const control = document.querySelector(selector);
    const label = control?.closest("label");
    if (!control || !label || label.querySelector(".filter-field-label")) return;
    const text = label.querySelector("span")?.textContent.trim()
      || [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)?.textContent.trim()
      || control.id;
    const heading = document.createElement("span");
    heading.className = "filter-field-label";
    heading.append(createIcon(iconName, "visual-icon"));
    const name = document.createElement("span");
    name.textContent = text;
    heading.append(name);
    const textNode = [...label.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
    );
    if (textNode) textNode.textContent = "";
    const existingLabel = label.querySelector(":scope > span:not(.filter-field-label)");
    if (existingLabel) existingLabel.replaceWith(heading);
    else label.prepend(heading);
  });

  const searchIcon = document.querySelector(".search-box > span");
  if (searchIcon) searchIcon.replaceChildren(createIcon("search", "visual-icon"));
}

function createPhIndicator() {
  document.querySelectorAll('#prediction-form [name="soil_ph"], #recommendation-form [name="soil_ph"]').forEach((input) => {
    const label = input.closest("label");
    const descriptionId = `${input.form.id}-soil-ph-description`;
    if (!label || label.querySelector(".ph-indicator")) return;
    const meter = document.createElement("div");
    meter.className = "ph-indicator";
    meter.innerHTML = `
      <div class="ph-reading" aria-live="polite">
        <span>Illustrative soil pH range</span>
        <strong data-ph-reading>Enter a value from 0 to 14</strong>
      </div>
      <div class="ph-track" role="img" aria-label="Illustrative soil pH scale from 0 to 14; suitable pH varies by crop and local soil">
        <span class="ph-marker" data-ph-marker></span>
      </div>
      <div class="ph-scale" aria-hidden="true"><span>0</span><span>5.5</span><span>6</span><span>6.5</span><span>7.5</span><span>14</span></div>
      <div class="ph-range-legend" aria-label="Illustrative pH ranges">
        <span><i class="ph-range-strong"></i><small>Strongly acidic<br>&lt; 5.5</small></span>
        <span><i class="ph-range-moderate"></i><small>Moderately acidic<br>5.5–6.0</small></span>
        <span><i class="ph-range-slight"></i><small>Slightly acidic<br>6.0–6.5</small></span>
        <span><i class="ph-range-neutral"></i><small>Near neutral<br>6.5–7.5</small></span>
        <span><i class="ph-range-alkaline"></i><small>Alkaline<br>&gt; 7.5</small></span>
      </div>
      <p class="field-help" id="${descriptionId}">Illustrative ranges only; suitable pH depends on crop and local soil conditions.</p>
    `;
    input.insertAdjacentElement("afterend", meter);
    input.setAttribute("aria-describedby", descriptionId);

    const reading = meter.querySelector("[data-ph-reading]");
    const marker = meter.querySelector("[data-ph-marker]");
    const update = () => {
      const value = Number(input.value);
      if (!input.value || !Number.isFinite(value) || value < 0 || value > 14) {
        reading.textContent = "Enter a value from 0 to 14";
        marker.hidden = true;
        meter.dataset.range = "";
        return;
      }
      const range = pHDescriptions.find((item) => value >= item.minimum
        && (item.includeMaximum ? value <= item.maximum : value < item.maximum))
        || pHDescriptions[pHDescriptions.length - 1];
      reading.textContent = `pH ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} · ${range.name}`;
      reading.style.color = range.color;
      marker.hidden = false;
      marker.style.left = `${(value / 14) * 100}%`;
      marker.style.backgroundColor = range.color;
      meter.dataset.range = range.name.toLowerCase().replaceAll(" ", "-");
    };
    input.addEventListener("input", update);
    update();
  });
}

function renderSummary(target, entries, emptyText) {
  target.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = emptyText;
  target.append(title);
  entries.forEach(({ label, value }) => {
    const item = document.createElement("span");
    item.className = "summary-value";
    const name = document.createElement("small");
    name.textContent = label;
    const result = document.createElement("b");
    result.textContent = value || "—";
    item.append(name, result);
    target.append(item);
  });
}

function initCropChoices() {
  const select = document.querySelector('#prediction-form [name="crop"]');
  const choices = [...document.querySelectorAll("[data-crop-choice]")];
  if (!select || !choices.length) return;
  const sync = () => choices.forEach((button) => {
    const selected = button.dataset.cropChoice === select.value;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  choices.forEach((button) => {
    button.addEventListener("click", () => {
      select.value = button.dataset.cropChoice;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
      select.focus();
    });
    const image = button.querySelector("img");
    image?.addEventListener("error", () => {
      image.hidden = true;
      button.classList.add("crop-choice-fallback");
    }, { once: true });
  });
  select.addEventListener("change", sync);
  sync();
}

function initNutrientSummary() {
  const form = document.querySelector("#prediction-form");
  const summary = document.querySelector("#nutrient-summary");
  const environment = document.querySelector("#environment-summary");
  if (!form || !summary || !environment) return;
  const fields = (names) => names.map(([key, label]) => ({
    label,
    value: form.elements.namedItem(key).value
      ? `${form.elements.namedItem(key).value} kg/ha`
      : "",
  }));
  const update = () => {
    renderSummary(
      summary,
      fields([
        ["nitrogen_kg_ha", "N"],
        ["phosphorus_kg_ha", "P"],
        ["potassium_kg_ha", "K"],
        ["fertilizer_kg_ha", "Fertilizer"],
      ]),
      "Entered application rates · not prescriptive",
    );
    const environmentalInputs = [
      ["rainfall_mm", "Rainfall", "mm"],
      ["temperature_c", "Temperature", "°C"],
    ].map(([key, label, unit]) => {
      const value = form.elements.namedItem(key).value;
      return { label, value: value ? `${value} ${unit}` : "" };
    });
    const season = form.elements.namedItem("season").value;
    const irrigation = form.elements.namedItem("irrigation").value;
    environmentalInputs.push(
      { label: "Season", value: season },
      { label: "Irrigation", value: irrigation },
    );
    renderSummary(environment, environmentalInputs, "Scenario conditions entered");
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();
}

export function initFieldVisuals() {
  decorateFields();
  createPhIndicator();
  initCropChoices();
  initNutrientSummary();
}

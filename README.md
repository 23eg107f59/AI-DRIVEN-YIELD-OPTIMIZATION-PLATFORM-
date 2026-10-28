# Oilseed AI

**Smarter Farming. Better Yields.** Oilseed AI is a locally runnable, full-stack
demonstration of an oilseed yield-estimation workflow. It includes a responsive
dashboard, a Flask JSON API, a scikit-learn Random Forest pipeline, rule-based
condition notes, and SQLite-backed prediction history.

> **Experimental project only.** The included CSV is synthetic development
> data, not measured agricultural data. Predictions and metrics are not
> validated for real fields and must not be used to make agronomic or financial
> decisions. The application does not provide scientifically validated
> personalized advice.

## Features

- Home, analytics dashboard, yield scenario form, condition recommendations,
  searchable/filterable prediction history, and model information.
- Six supported crops: Groundnut, Mustard, Soybean, Sunflower, Sesame, Rapeseed.
- Server-side type, category, length, and range validation.
- One fitted scikit-learn preprocessing/prediction pipeline shared by training
  and API inference; categorical values use one-hot encoding, while missing
  numerical features are imputed.
- Random Forest training with group-aware held-out evaluation and computed
  R², MAE, RMSE, and applicable non-zero-yield MAPE. Metrics and held-out
  predictions are exported to JSON and exposed by the API; never hardcoded.
- Parameterized SQLite operations and local prediction history.
- Responsive styles and dynamic Chart.js charts. Chart.js and web fonts are
  loaded from public CDNs, so chart rendering and the selected typography need
  an internet connection; core Flask pages and APIs run locally.
- Locally stored Indian crop/farmer photographs, with source links and reuse
  licenses in [frontend/assets/images/IMAGE_CREDITS.md](frontend/assets/images/IMAGE_CREDITS.md).
- Dashboard model-performance charts for held-out actual-vs-predicted yield,
  error magnitudes, residual distribution, and crop-wise MAE when supported by
  the test sample count.

## Technology and architecture

- **Frontend:** HTML, CSS, vanilla JavaScript modules, Chart.js.
- **Backend:** Python, Flask, Pandas, NumPy.
- **Model:** scikit-learn `RandomForestRegressor`, preprocessing `Pipeline`,
  joblib artifact.
- **Storage:** training CSV and SQLite prediction database.

Browser interactions use same-origin requests to `/api`. The Flask app serves
the static frontend and API from one local process. Prediction inputs are
validated, transformed by the saved pipeline and passed to the estimator.
Cultivated area is intentionally excluded from the yield model and is used
only to calculate estimated total production. Saved scenarios feed dashboard
metrics and history.

## Folder structure

```text
.
├── app.py
├── backend/
│   ├── database.py
│   ├── prediction.py
│   ├── recommendations.py
│   ├── routes.py
│   └── ml/
│       ├── train_model.py
│       └── evaluate_model.py
├── data/
│   ├── README.md
│   └── oilseed_yield.csv
├── frontend/
│   ├── index.html
│   ├── css/
│   └── js/
├── instance/                 # Created locally; SQLite is git-ignored
├── models/                   # Created locally; joblib artifact is git-ignored
├── requirements.txt
└── tests/
```

## Setup and run

Python 3.10 or newer is recommended.

### 1. Create an environment and install requirements

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

If PowerShell blocks local activation scripts, use the environment interpreter
directly, for example `.venv\Scripts\python.exe -m pip install -r requirements.txt`.

### 2. Train the model

From the project root:

```powershell
python -m backend.ml.train_model
```

The command reads `data/oilseed_yield.csv`, performs a reproducible grouped
25% holdout (by farm ID when supplied, otherwise by region), fits the
preprocessing/model pipeline on training rows, and evaluates only held-out
rows. It saves the fitted pipeline at `models/yield_pipeline.joblib` and the
complete report—source, split groups, metrics and test predictions—at
`models/model_metrics.json`. Both generated artifacts are ignored by Git. A
documented dataset can be supplied with:

```powershell
python -m backend.ml.train_model --data path\to\your_dataset.csv --output models\yield_pipeline.joblib
```

Include the dataset name and citation/URL in the exported report when known:

```powershell
python -m backend.ml.train_model --data path\to\your_dataset.csv `
  --source-description "Dataset title, publisher, DOI or public URL"
```

The replacement CSV must contain the documented input features and target
`yield_kg_ha`; it should also include `region` and, where available, stable
`farm_id` or `field_id` values to group the split by farm. At least three
groups are required. See [data/README.md](data/README.md) for the schema and
source note. The default CSV is synthetic and no suitable verified real
dataset was found in the workspace. Supply clear provenance, a citation,
quality controls and representative crop/region/season coverage before
interpreting any results.

Print the saved evaluation report:

```powershell
python -m backend.ml.evaluate_model
```

The About page and dashboard fetch the same held-out results from the API.
R² is a regression score, not a percent accuracy. MAE and RMSE use kg/ha;
MAPE is computed only over non-zero actual yields. Evaluation visualizations
use held-out predictions only.

### 3. Start the application

```powershell
$env:PORT = "5000"
python app.py
```

The app listens on `0.0.0.0` with Flask debug mode disabled, prints its local
and detected Wi-Fi URLs, and initializes the shared SQLite database at
`instance/oilseed_ai.db`. On the computer inspected for this setup, the Wi-Fi
IPv4 address is currently `192.168.0.100`; addresses can change when the
network/router reconnects. Open `http://localhost:5000` on this computer or
`http://192.168.0.100:5000` from a device on the same Wi-Fi. To find the
current IPv4 address, run `ipconfig` in PowerShell and read **IPv4 Address**
under the connected Wi-Fi adapter; use the URL printed by Flask when available.
Allow Python or TCP port 5000 through Windows Defender Firewall on private
networks if prompted. Guest Wi-Fi, client isolation, VPNs, router rules, and
firewall policies can prevent peer-to-peer access. Set `$env:PORT` to another
available port and use that port in the device URL if needed.

The frontend uses relative same-origin `/api` requests, so it works when opened
through either hostname or IP address. There is no cross-origin API or CORS
configuration. The prediction endpoint returns HTTP 503 with setup guidance if
the saved model is missing; train it first.

Prediction history and regional records use one shared database, not a
per-browser copy. On the local LAN the application is open to devices on the
network by default; only run it on a trusted private Wi-Fi network. The current
app stores shared prediction scenarios and official regional aggregates, not
per-user private farmer profiles. If private farmer records are added, require
per-user authentication and authorization before enabling network access.

### Production deployment (Render)

`render.yaml` prepares a same-origin HTTPS deployment on Render. It builds the
model from the documented synthetic demo dataset, installs Gunicorn, runs one
web worker (so the in-process background scheduler is not duplicated), and
mounts a persistent disk at `/var/data` for the shared SQLite database. The
Render disk is persistent service storage; it is separate from the ephemeral
application filesystem. Model artifacts are generated during the build and
are not stored in the SQLite disk.

Before deployment:

1. Push the project to a private GitHub repository you control. Generated
   `models/*.joblib`, local databases, virtual environments, and credentials
   should remain uncommitted; the Render build trains the model itself.
2. In Render, create a new Blueprint from that repository and review
   `render.yaml`. The configured persistent disk uses the paid Starter plan.
3. Set `OILSEED_AUTH_USERNAME` and `OILSEED_AUTH_PASSWORD` as secret Render
   environment values when prompted. Choose a unique, strong password and do
   not put it in the repository. Authentication is HTTP Basic Auth served over
   Render's HTTPS, protecting pages and APIs, including history and deletion.
   The browser will prompt authorized users for these credentials.
4. Wait for the build/deploy to succeed, then use the HTTPS `*.onrender.com`
   URL shown on the Render service page. No public deployment URL exists until
   this project is deployed to an account you authorize.
5. Test the deployed home page, `/api/health`, prediction flow, dashboard,
   history, agricultural source status, and manual sync after signing in.
   Restart/redeploy the service and confirm the historical records remain on
   the mounted disk.

The Render blueprint sets `OILSEED_AUTH_REQUIRED=true`; the app refuses to
start if either credential is missing. It also sets the database path to
`/var/data/oilseed_ai.db`. For another hosting platform, use a persistent
volume for SQLite (or a managed database), set `OILSEED_DATABASE_PATH`,
`OILSEED_MODEL_PATH`, `OILSEED_AUTH_REQUIRED=true`,
`OILSEED_AUTH_USERNAME`, and `OILSEED_AUTH_PASSWORD`, and run a production
WSGI server such as:

```text
gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120 "app:create_app()"
```

Do not run multiple Gunicorn workers with the in-process scheduler enabled.
For multiple workers, set `OILSEED_AUTO_SYNC=false` in the web service and run
exactly one scheduler process with shared persistent storage. Basic Auth is a
single shared account: all signed-in users see the same scenario history, and
the project does not currently provide individual accounts or per-user record
isolation. Deploy only with trusted authorized users; implement role-based
accounts before storing private farmer records. The app does not currently
provide a farmer CSV upload endpoint; official history is synchronized from
the configured public source adapters.

For temporary demonstrations, a secure tunnel can be used only after enabling
authentication and only with a reputable tunnel provider over HTTPS. Do not
publish an unauthenticated development server or expose private records through
an unpredictable tunnel URL.

### Historical agricultural data synchronization

The application imports **official regional aggregates**, not farmer-specific
histories. The verified adapters download the public XLSX workbooks linked from
the [ICAR-NSRI statistics page](https://icar-nsri.res.in/statistics.html):

- `cropAPY.xlsx`: India-level crop-wise area (`'000 Ha`), production
  (`'000 Tons`), and yield (`Kg/Ha`). It covers the oilseed crops individually
  listed in the workbook; aggregate “Total Oilseeds” and “Edible oilseeds”
  rows are not imported as individual crops.
- `stateAPY.xlsx`: state-wise soybean area, production, and yield, including
  the workbook's “All India” aggregate. The `Others` bucket is not represented
  as a state.

The XLSX layouts and metric headers are checked before any source records are
stored. Area and production values are converted to hectares and tonnes. The
reported yield is preserved; a calculated yield (`production tonnes × 1000 /
area hectares`) is stored separately, and differences over 5% (or 1 kg/ha)
are flagged. Missing district, season, and publication-date values are not
invented; these workbooks are annual, so their season is labelled `Annual`.
Records from different source workbooks remain distinct.

An initial sync runs in the background when Flask starts, then repeats every
24 hours. The dashboard's **Sync Historical Data** button starts a manual run;
the latest status and imported counts are visible in that section. HTTP
validators and a content hash avoid parsing unchanged workbooks. Retries are
limited to transient network errors and retryable HTTP statuses. A source
failure does not remove any earlier records or block the other source.

Configuration is optional; set these before starting Flask in PowerShell:

```powershell
$env:OILSEED_AUTO_SYNC = "true"
$env:OILSEED_SYNC_ON_STARTUP = "true"
$env:OILSEED_SYNC_INTERVAL_HOURS = "24"
$env:OILSEED_REQUEST_TIMEOUT_SECONDS = "20"
python app.py
```

Set `OILSEED_AUTO_SYNC=false` to disable the in-process scheduler. For a
multi-worker deployment, disable it in every web worker and run exactly one
separate scheduler/worker process; otherwise each process could schedule its
own job. For example, configure Windows Task Scheduler to run
`python -m backend.agriculture_sync` daily from the project root. A
single-process in-memory scheduler is intended for local use. Manual and
scheduled jobs also use a SQLite lease so workers sharing the same database do
not run concurrent syncs. The lease expires after 15 minutes if a process is
interrupted.

DESAgri's published page currently exposes an interactive report form, while
no stable export endpoint was verified. Automated access to data.gov.in
returned HTTP 403 during implementation, and the UPAg report page did not
expose a verified dataset schema or download endpoint. These sources are
listed as **not connected**; the application does not scrape them or claim
their availability. No data.gov.in API key is configured or required for the
verified ICAR adapters.

Imported regional data is not merged into the existing prediction model.
Those official workbooks do not contain the weather, soil, or management
features expected by the current model and cannot validate farm-level
predictions. The existing model report remains explicitly labelled with its
dataset provenance and limitations.

## API

All request and response bodies are JSON. The frontend and API are served from
the same origin; no permissive CORS configuration is needed.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | App and model readiness |
| GET | `/api/crops` | Supported crop names |
| POST | `/api/predict` | Validate scenario, estimate yield/production, save history |
| GET | `/api/dashboard` | Saved-record metrics and chart series |
| GET | `/api/history` | History with optional `crop`, `from`, `to`, `search`, and `sort` filters |
| GET | `/api/history/<id>` | Stored prediction and submitted inputs |
| DELETE | `/api/history/<id>` | Delete one stored prediction |
| POST | `/api/recommendations` | General rule-based condition prompts |
| GET | `/api/model-metrics` | Computed held-out model metrics and dataset status |
| GET | `/api/agriculture/sources` | Configured source adapters and unverified candidate sources |
| POST | `/api/agriculture/sync` | Queue a manual regional-data synchronization |
| GET | `/api/agriculture/sync-status` | Latest synchronization status, counts, and errors |
| GET | `/api/agriculture/history` | Regional records with crop/state/district/season/year filters and pagination |
| GET | `/api/agriculture/statistics` | Filtered regional counts and source-separated yield/area/production series |
| GET | `/api/agriculture/crops` | Crops present in imported regional statistics |

The model-metrics endpoint includes model and dataset metadata, train/test
record counts, R²/MAE/RMSE/MAPE, evaluation timestamp, held-out
actual/predicted/residual samples, and crop-wise metrics where a crop has at
least two test rows. It returns `available: false` instead of fallback scores
when a valid training report is unavailable.

Prediction example:

```powershell
$body = @{
  crop = "Soybean"; region = "Madhya Pradesh"; season = "Kharif"
  area_ha = 2; rainfall_mm = 700; temperature_c = 26
  soil_type = "Black"; soil_ph = 6.6
  nitrogen_kg_ha = 30; phosphorus_kg_ha = 52; potassium_kg_ha = 40
  irrigation = "Rainfed"; seed_variety = "Demo-A"
  fertilizer_kg_ha = 90; previous_yield_kg_ha = $null
} | ConvertTo-Json
$port = if ($env:PORT) { $env:PORT } else { "5000" }
$baseUrl = "http://localhost:$port"
Invoke-RestMethod -Method Post -Uri "$baseUrl/api/predict" `
  -ContentType "application/json" -Body $body
```

## Testing

Install requirements, then from the root directory:

```powershell
python -m pytest -q
```

Tests train a temporary model and use isolated temporary SQLite databases.
Agricultural importer tests use generated XLSX fixtures and mocked downloads;
they cover schema parsing, unit conversion, source corrections, idempotent
syncs, source failures, database persistence, filtering, and pagination.

## Limitations and future enhancements

- The packaged dataset is small synthetic demonstration data. Held-out scores
  from it are a software demonstration, not evidence of model quality.
- The verified official imports are annual regional statistics from two
  ICAR-NSRI spreadsheets. They are not farm-level observations and do not
  provide rainfall, soil, fertilizer, irrigation, or district-level history.
- DESAgri, data.gov.in, and UPAg are not currently integrated because a stable,
  permitted download/API path and corresponding schema were not verified.
- The scheduler is process-local. A multi-worker deployment must run one
  scheduler separately and disable the in-process scheduler in web workers.
- The default model split groups by region because farm identifiers are not
  present in the demo CSV. Real work should use stable farm/field IDs, temporal
  external validation where appropriate, complete provenance and adequate
  crop-region-season coverage. Crop-wise test comparisons require at least
  two held-out rows per crop.
- Photographs illustrate real agriculture but are not model data. Regional
  labels follow source metadata; the rapeseed card transparently uses a
  mustard-family visual analogy. See the image credits for attribution and
  licensing.
- Real use would require a traceable, larger and representative multi-season
  dataset, regional/crop-specific calibration, leakage and bias review, robust
  external validation, and agronomist oversight.
- Recommendation rules are broad screening prompts, not personalized or
  scientifically validated agronomic advice.
- Optional HTTP Basic Auth is available for a single shared account and is
  required by the Render blueprint. Per-user accounts, role-based permissions,
  and record isolation are not implemented; authorized users share history.
- Future work could add verified public field datasets, geographic/model
  version tracking, uncertainty intervals, data-quality review, export tools,
  and expert-reviewed region-specific recommendations.

## Troubleshooting

- **Model not trained:** run `python -m backend.ml.train_model` from the root.
- **Missing Python modules:** activate the environment and run
  `python -m pip install -r requirements.txt`.
- **Port is busy:** set `$env:PORT` to an available port and restart the app.
- **Another Wi-Fi device cannot connect:** verify the printed/current IPv4 via
  `ipconfig`, use the same port, allow inbound Python/TCP traffic on a private
  Windows network, and check router guest-network/client-isolation settings.
  Public Wi-Fi access requires a separate HTTPS deployment; LAN binding alone
  does not make a public URL.
- **Deployment authentication fails:** verify both `OILSEED_AUTH_USERNAME` and
  `OILSEED_AUTH_PASSWORD` are set as service secrets; the app intentionally
  refuses to start with required authentication but missing credentials.
- **History disappears after deployment:** verify the persistent disk is
  attached and `OILSEED_DATABASE_PATH` points inside its mount directory.
- **Charts or typography do not load:** Chart.js and fonts use public CDNs;
  verify internet access. The local API and form workflow are independent of
  paid services.
- **Prediction fails:** check required fields and their units/ranges. Server
  validation errors are shown in the form; unexpected errors are logged by
  Flask without exposing stack traces to the browser.

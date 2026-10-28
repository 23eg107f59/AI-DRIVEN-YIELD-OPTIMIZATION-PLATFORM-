import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REPORT = ROOT / "models" / "model_metrics.json"


def main():
    parser = argparse.ArgumentParser(description="Display the saved held-out model report.")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT, help="Evaluation JSON path")
    args = parser.parse_args()
    if not args.report.is_file():
        parser.error("Evaluation report not found. Train with python -m backend.ml.train_model")
    with args.report.open(encoding="utf-8") as report_file:
        report = json.load(report_file)
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()

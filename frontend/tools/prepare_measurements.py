"""Build an offline, source-traceable measurement asset; never alter source data."""
from __future__ import annotations

import csv
import argparse
import os
import hashlib
import json
import statistics
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("MAGNETRON_MEASUREMENT_DATA", ROOT / "data/measurements"))
FOUR = DATA / "标准化_可直接绘图/四电压_全部原记录与状态.csv"
VOLTAGE = DATA / "标准化_可直接绘图/2377_逐行物理电极与状态.csv"
FIELD = DATA / "磁场标定/主用_原始空载/磁场和电流的关系.xlsx"
OUTPUT = ROOT / "frontend/assets/measurements.json"

# Keys retain the standardized CSV's physical meaning; original raw channels are
# deliberately not substituted for the corrected physical-electrode columns.
COLUMNS = [
    "run_id", "source_csv_record", "record_role", "direction", "voltage_index",
    "nominal_voltage_V", "accelerating_set_V", "excitation_set_mA",
    "elapsed_s", "since_set_s", "started", "A1_time", "A2_time",
    "excitation_actual_A", "accelerating_actual_V", "CH1_voltage_V",
    "CH3_voltage_V", "CH3_current_A", "physical_A1_shunt_V", "physical_A2_shunt_V",
    "physical_A1_current_uA", "physical_A2_current_uA", "physical_sum_current_uA",
    "within_measured_field_calibration_range", "near_60V_limit_inferred",
    "excitation_follows_set_within_5mA", "is_forward_cutoff_fit_point",
    "is_powered_measurement", "channels_complete", "conditions_ok",
]
TEXT = {"run_id", "record_role", "direction", "started", "A1_time", "A2_time"}
BOOL = set(COLUMNS[23:])


def linear_fit(x, y):
    mx, my = statistics.mean(x), statistics.mean(y)
    slope = sum((a - mx) * (b - my) for a, b in zip(x, y)) / sum((a - mx)**2 for a in x)
    intercept = my - slope * mx
    residual = sum((b - slope * a - intercept)**2 for a, b in zip(x, y))
    return {"slope_mT_per_A": slope, "intercept_mT": intercept,
            "r_squared": 1 - residual / sum((b - my)**2 for b in y)}


def calibration():
    # Only Sheet1 A7,A14 and C7:G14, not the workbook's draft calculations.
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with ZipFile(FIELD) as archive:
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    cells = {c.attrib["r"]: c.find("x:v", ns) for c in sheet.findall(".//x:c", ns)}
    points = []
    for row in range(7, 15):
        current = float(cells[f"A{row}"].text)
        fields = [float(cells[f"{col}{row}"].text) for col in "CDEFG"]
        points.append({"workbook_row": row, "current_A": current,
                       "fields_mT": fields, "mean_mT": statistics.mean(fields)})
    return {
        "id": "original_empty_tube_8x5",
        "source": str(FIELD.relative_to(DATA)).replace("\\", "/"),
        "sheet": "Sheet1", "current_cells": "A7:A14", "field_cells": "C7:G14",
        "sha256": hashlib.sha256(FIELD.read_bytes()).hexdigest(),
        "points": points,
        **linear_fit([p["current_A"] for p in points], [p["mean_mT"] for p in points]),
        "measured_range_A": [0.2, 1.4],
        "explanation": "8 个励磁测点，每点先取 5 个空间读数平均，再作自由截距直线拟合。零励磁处负截距为外推结果，不是测得的背景磁场。",
    }


def convert(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        source = list(csv.DictReader(file))
    rows, hashes = [], {}
    for row in source:
        hashes[row["run_id"]] = row["source_data_sha256"]
        out = []
        for key in COLUMNS:
            value = row.get(key, "")
            if key in TEXT:
                out.append(value)
            elif value == "":
                out.append(None)
            elif key in BOOL:
                assert value in ("True", "False"), (key, value)
                out.append(value == "True")
            else:
                number = float(value)
                out.append(int(number) if key in ("source_csv_record", "voltage_index", "nominal_voltage_V") else number)
        rows.append(out)
    return {"source": str(path.relative_to(DATA)).replace("\\", "/"),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "raw_source_hashes": hashes, "rows": rows}


def build():
    asset = {
        "version": 1,
        "identity": {
            "date": "2026-09-11", "instrument": "补充实验同一台装置（编号 1233）",
            "run_voltage": {"9588": 4, "8764": 6, "3847": 8, "0114": 10},
            "current_unit": "μA", "shunt_resistance_ohm": {"A1": 1000, "A2": 1000},
            "channel_mapping": "A₁ 为中央阳极，A₂ 为两只保护环合计；以标准化后的 physical 列为准。",
            "sampling": "两表在一个采集周期内先后读取，各自时间戳保留；不是同时锁存。",
            "power_status": "原数据未数字记录 CC/CV。≥59.9 V 仅为接近限压阈值；同时比较设定与实际励磁。",
            "voltage_scan": "2377 每次访问一个电压工作点前回零；高场 target 共 70 行，实际励磁均为 1.398 A。",
            "geometry": "半径 4.55 mm 来自参数卡内径 9.0–9.2 mm 中值；尺照为另一套同型装置。",
        },
        "calibration": calibration(), "columns": COLUMNS,
        "magnetic_scan": convert(FOUR), "voltage_scan": convert(VOLTAGE),
        "model_comparison": {
            "status": "2026-09-14 旧几何模型的高场对照，保留作实验背景。",
            "conditions": "Ua=10 V，Uf=3.428 V，T=2000 K，均匀轴向 B=5.727 mT；几何 20/10 mm，发射 30 μA，32768 个统计电子。",
            "result": "该工作点中央与保护环均为零命中；实测 10 V 同磁场附近仍有约 2.188 μA 和 3.235 μA。",
            "source": "20260914_当前物理模型与双路电流说明.md",
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(asset, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    return asset


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=DATA,
                        help="Original measurement directory; also MAGNETRON_MEASUREMENT_DATA")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    FOUR, VOLTAGE, FIELD = (args.data_root / path.relative_to(DATA) for path in (FOUR, VOLTAGE, FIELD))
    DATA, OUTPUT = args.data_root, args.output
    missing = [str(path) for path in (FOUR, VOLTAGE, FIELD) if not path.is_file()]
    if missing:
        parser.error("Original files missing; provide --data-root: " + ", ".join(missing))
    data = build()
    print(json.dumps({"magnetic_records": len(data["magnetic_scan"]["rows"]),
                      "voltage_records": len(data["voltage_scan"]["rows"]),
                      "asset_bytes": OUTPUT.stat().st_size,
                      "calibration": {k: data["calibration"][k] for k in ("slope_mT_per_A", "intercept_mT", "r_squared")}}, ensure_ascii=False))

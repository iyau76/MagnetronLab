"""Source-level checks for the distributable measured-data asset."""
import csv
import hashlib
import json
import math
import unittest

import importlib.util
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('measurement_builder', ROOT/'frontend'/'tools'/'prepare_measurements.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
ASSET = ROOT/'frontend'/'assets'/'measurements.json'
DATA = Path(os.environ['MAGNETRON_MEASUREMENT_DATA']) if os.environ.get('MAGNETRON_MEASUREMENT_DATA') else None



class MeasurementAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.asset = json.loads(ASSET.read_text(encoding="utf-8"))
        cls.unpack = lambda _, table: [dict(zip(cls.asset["columns"], row)) for row in table["rows"]]

    def test_every_physical_reading_retains_its_original_record(self):
        if DATA is None:
            self.skipTest('Set MAGNETRON_MEASUREMENT_DATA to the original directory for source provenance checks')
        for key, default in (("magnetic_scan", prepare.FOUR), ("voltage_scan", prepare.VOLTAGE)):
            path = DATA / default.relative_to(prepare.DATA)
            with path.open(encoding="utf-8-sig", newline="") as file:
                source = list(csv.DictReader(file))
            exported = self.unpack(self.asset[key])
            self.assertEqual(len(source), len(exported))
            for original, row in zip(source, exported):
                self.assertEqual(original["run_id"], row["run_id"])
                self.assertEqual(int(original["source_csv_record"]), row["source_csv_record"])
                for field in ("physical_A1_current_uA", "physical_A2_current_uA", "physical_sum_current_uA",
                              "excitation_actual_A", "accelerating_actual_V", "CH1_voltage_V"):
                    self.assertEqual(float(original[field]), row[field])
                self.assertAlmostEqual(row["physical_A1_current_uA"] + row["physical_A2_current_uA"], row["physical_sum_current_uA"], places=10)
                self.assertAlmostEqual(row["physical_A1_shunt_V"] * 1000, row["physical_A1_current_uA"], places=9)
                self.assertAlmostEqual(row["physical_A2_shunt_V"] * 1000, row["physical_A2_current_uA"], places=9)

    def test_identity_counts_and_no_local_user_paths(self):
        four = self.unpack(self.asset["magnetic_scan"])
        voltage = self.unpack(self.asset["voltage_scan"])
        self.assertEqual(len(four), 594)
        self.assertEqual(sum(r["record_role"] in ("up", "down") for r in four), 533)
        self.assertEqual(sum(r["is_forward_cutoff_fit_point"] for r in four), 291)
        target = [r for r in voltage if r["record_role"] == "target"]
        self.assertEqual(len(target), 70)
        self.assertEqual({r["excitation_actual_A"] for r in target}, {1.398})
        self.assertEqual({r["nominal_voltage_V"] for r in four if r["run_id"] == "9588"}, {4})
        text = ASSET.read_text(encoding="utf-8")
        for prohibited in ("HUAWEI", "C:\\Users", "D:\\pythonpro", "AppData", "cookie", "token"):
            self.assertNotIn(prohibited, text)

    def test_embedded_calibration_points_and_fit(self):
        field = self.asset["calibration"]
        self.assertEqual(len(field["points"]), 8)
        self.assertTrue(all(len(p["fields_mT"]) == 5 for p in field["points"]))
        self.assertEqual([p["workbook_row"] for p in field["points"]], list(range(7, 15)))
        self.assertAlmostEqual(field["slope_mT_per_A"], 4.230907194994787, places=12)
        self.assertAlmostEqual(field["intercept_mT"], -.18806673618352443, places=12)
        self.assertTrue(all(p["current_A"] > 0 for p in field["points"]))

    def test_optional_original_calibration_hash(self):
        if DATA is None:
            self.skipTest('Set MAGNETRON_MEASUREMENT_DATA for original workbook hash verification')
        path = DATA / prepare.FIELD.relative_to(prepare.DATA)
        self.assertEqual(self.asset['calibration']['sha256'], hashlib.sha256(path.read_bytes()).hexdigest())

    def test_all_embedded_readings_are_self_consistent(self):
        for key in ('magnetic_scan', 'voltage_scan'):
            for row in self.unpack(self.asset[key]):
                self.assertAlmostEqual(row['physical_A1_current_uA'] + row['physical_A2_current_uA'], row['physical_sum_current_uA'], places=10)
                self.assertAlmostEqual(row['physical_A1_shunt_V'] * 1000, row['physical_A1_current_uA'], places=9)
                self.assertAlmostEqual(row['physical_A2_shunt_V'] * 1000, row['physical_A2_current_uA'], places=9)

    def test_scientific_examples_are_raw_record_differences(self):
        records = self.unpack(self.asset["magnetic_scan"])
        ten = [r for r in records if r["run_id"] == "0114" and r["record_role"] == "up"]
        first = next(r for r in ten if math.isclose(r["excitation_actual_A"], .299))
        second = next(r for r in ten if math.isclose(r["excitation_actual_A"], .939))
        self.assertAlmostEqual(second["physical_A1_current_uA"] - first["physical_A1_current_uA"], .285, places=5)
        self.assertAlmostEqual(second["physical_A2_current_uA"] - first["physical_A2_current_uA"], -.298, places=5)
        self.assertAlmostEqual(second["physical_sum_current_uA"] - first["physical_sum_current_uA"], -.013, places=5)
        high = next(r for r in ten if math.isclose(r["excitation_actual_A"], 1.398))
        self.assertAlmostEqual(high["physical_A1_current_uA"], 2.188, places=5)
        self.assertAlmostEqual(high["physical_A2_current_uA"], 3.235, places=5)


if __name__ == "__main__":
    unittest.main()

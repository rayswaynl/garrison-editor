"""Tests for gen_units.py — inline fixtures, no filesystem dependency."""

import sys
import os
import unittest
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
from gen_units import parse_cfg_vehicles, collect_classnames, build_thumb_index


# Minimal CfgVehicles fixture with three classes
CFG_VEHICLES_FIXTURE = """\
class CfgVehicles
{
    class CDF_Soldier
    {
        displayName = "CDF Soldier";
        scope = 2;
    };
    class CDF_Soldier_TL : CDF_Soldier
    {
        displayName = "CDF Team Leader";
        scope = 2;
    };
    class RU_Soldier_MG
    {
        displayName = "RU Machinegunner";
        scope = 2;
    };
    class NoDisplayName
    {
        scope = 1;
    };
};
"""


class TestParseCfgVehicles(unittest.TestCase):

    def setUp(self):
        # Write fixture to a temp file
        self.tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        )
        self.tmp.write(CFG_VEHICLES_FIXTURE)
        self.tmp.close()
        self.display_names = parse_cfg_vehicles(self.tmp.name)

    def tearDown(self):
        os.unlink(self.tmp.name)

    def test_cdf_soldier_found(self):
        self.assertIn("CDF_Soldier", self.display_names)
        self.assertEqual(self.display_names["CDF_Soldier"], "CDF Soldier")

    def test_cdf_soldier_tl_found(self):
        self.assertIn("CDF_Soldier_TL", self.display_names)
        self.assertEqual(self.display_names["CDF_Soldier_TL"], "CDF Team Leader")

    def test_ru_mg_found(self):
        self.assertIn("RU_Soldier_MG", self.display_names)
        self.assertEqual(self.display_names["RU_Soldier_MG"], "RU Machinegunner")

    def test_class_without_display_name_absent(self):
        # NoDisplayName has no displayName field, so it should not appear
        self.assertNotIn("NoDisplayName", self.display_names)

    def test_total_count(self):
        self.assertEqual(len(self.display_names), 3)


class TestCollectClassnames(unittest.TestCase):

    def test_single_faction(self):
        groups = {
            "CDF": {
                "side": "WEST",
                "templates": {
                    "Squad": [["CDF_Soldier_TL", "CDF_Soldier"], ["CDF_Soldier_TL", "CDF_Soldier_AR"]],
                    "Team":  [["CDF_Soldier_TL", "CDF_Soldier_Medic"]],
                }
            }
        }
        cls = collect_classnames(groups)
        self.assertIn("CDF_Soldier_TL", cls)
        self.assertIn("CDF_Soldier", cls)
        self.assertIn("CDF_Soldier_AR", cls)
        self.assertIn("CDF_Soldier_Medic", cls)

    def test_deduplication(self):
        groups = {
            "CDF": {
                "side": "WEST",
                "templates": {
                    "Squad": [["CDF_Soldier", "CDF_Soldier"], ["CDF_Soldier"]],
                }
            }
        }
        cls = collect_classnames(groups)
        self.assertEqual(cls, {"CDF_Soldier"})

    def test_multi_faction(self):
        groups = {
            "CDF": {"side": "WEST", "templates": {"Squad": [["CDF_Soldier_TL"]]}},
            "RU":  {"side": "EAST", "templates": {"Squad_0": [["RU_Soldier_GL"]]}},
        }
        cls = collect_classnames(groups)
        self.assertIn("CDF_Soldier_TL", cls)
        self.assertIn("RU_Soldier_GL", cls)
        self.assertEqual(len(cls), 2)


class TestBuildThumbIndex(unittest.TestCase):

    def setUp(self):
        # Create a temp tree: tmpdir/Units/CDF/CDF_Soldier_TL.jpg
        self.tmpdir = tempfile.mkdtemp()
        subdir = os.path.join(self.tmpdir, "Units", "CDF")
        os.makedirs(subdir)
        open(os.path.join(subdir, "CDF_Soldier_TL.jpg"), "w").close()
        open(os.path.join(subdir, "CDF_Soldier.jpg"), "w").close()
        veh = os.path.join(self.tmpdir, "Vehicles", "Tracked")
        os.makedirs(veh)
        open(os.path.join(veh, "T72_CDF.jpg"), "w").close()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def test_unit_found_case_insensitive(self):
        idx = build_thumb_index(self.tmpdir)
        self.assertIn("cdf_soldier_tl", idx)
        self.assertIn("cdf_soldier", idx)
        self.assertIn("t72_cdf", idx)

    def test_total_count(self):
        idx = build_thumb_index(self.tmpdir)
        self.assertEqual(len(idx), 3)

    def test_path_is_absolute(self):
        idx = build_thumb_index(self.tmpdir)
        self.assertTrue(os.path.isabs(idx["cdf_soldier_tl"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)

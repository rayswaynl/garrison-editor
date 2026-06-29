"""Tests for extract_groups.py — inline fixtures, no filesystem dependency."""

import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from extract_groups import parse_groups_file


FIXTURE_MINIMAL = """
_side = "WEST";
_faction = "CDF";

_k = _k + ["Squad"];
_u		= ["CDF_Soldier_TL"];
_u = _u + ["CDF_Soldier_Medic"];
_u = _u + ["CDF_Soldier"];
_l = _l + [_u];

_k = _k + ["Squad"];
_u		= ["CDF_Soldier_TL"];
_u = _u + ["CDF_Soldier_AR"];
_u = _u + ["CDF_Soldier_GL"];
_l = _l + [_u];

_k = _k + ["Team"];
_u		= ["CDF_Soldier_TL"];
_u = _u + ["CDF_Soldier"];
_l = _l + [_u];
"""

FIXTURE_NO_HEADER = """
_k = _k + ["Motorized"];
_u		= ["UAZ_MG_CDF"];
_u = _u + ["CDF_Soldier"];
_l = _l + [_u];
"""


class TestParseGroupsFile(unittest.TestCase):

    def test_faction_and_side_parsed(self):
        faction, side, _ = parse_groups_file(FIXTURE_MINIMAL)
        self.assertEqual(faction, "CDF")
        self.assertEqual(side, "WEST")

    def test_single_key_two_variants(self):
        _, _, templates = parse_groups_file(FIXTURE_MINIMAL)
        self.assertIn("Squad", templates)
        self.assertEqual(len(templates["Squad"]), 2)

    def test_first_variant_correct(self):
        _, _, templates = parse_groups_file(FIXTURE_MINIMAL)
        first = templates["Squad"][0]
        self.assertEqual(first, ["CDF_Soldier_TL", "CDF_Soldier_Medic", "CDF_Soldier"])

    def test_second_variant_correct(self):
        _, _, templates = parse_groups_file(FIXTURE_MINIMAL)
        second = templates["Squad"][1]
        self.assertEqual(second, ["CDF_Soldier_TL", "CDF_Soldier_AR", "CDF_Soldier_GL"])

    def test_single_variant_key(self):
        _, _, templates = parse_groups_file(FIXTURE_MINIMAL)
        self.assertIn("Team", templates)
        self.assertEqual(len(templates["Team"]), 1)
        self.assertEqual(templates["Team"][0], ["CDF_Soldier_TL", "CDF_Soldier"])

    def test_missing_header_uses_fallback(self):
        faction, side, templates = parse_groups_file(FIXTURE_NO_HEADER)
        # faction is unknown when not in file
        self.assertEqual(faction, "UNKNOWN")
        # side falls back to UNKNOWN when faction is UNKNOWN
        self.assertEqual(side, "UNKNOWN")
        self.assertIn("Motorized", templates)
        self.assertEqual(templates["Motorized"][0], ["UAZ_MG_CDF", "CDF_Soldier"])

    def test_comment_lines_ignored(self):
        text = """
_side = "EAST";
_faction = "RU";
// _k = _k + ["FakeKey"];
_k = _k + ["RealKey"];
_u = ["RU_Soldier"];
_l = _l + [_u];
"""
        _, _, templates = parse_groups_file(text)
        self.assertNotIn("FakeKey", templates)
        self.assertIn("RealKey", templates)

    def test_east_side_inferred(self):
        # When _side is a literal EAST, it should be returned
        text = """
_side = "EAST";
_faction = "RU";
_k = _k + ["Squad_0"];
_u = ["RU_Soldier_GL"];
_l = _l + [_u];
"""
        faction, side, _ = parse_groups_file(text)
        self.assertEqual(faction, "RU")
        self.assertEqual(side, "EAST")

    def test_unit_accumulation_multiline(self):
        text = """
_side = "WEST";
_faction = "CDF";
_k = _k + ["BigTeam"];
_u		= ["CDF_Soldier_TL"];
_u = _u + ["CDF_Soldier_Medic"];
_u = _u + ["CDF_Soldier_GL"];
_u = _u + ["CDF_Soldier_AR"];
_u = _u + ["CDF_Soldier_RPG"];
_u = _u + ["CDF_Soldier"];
_l = _l + [_u];
"""
        _, _, templates = parse_groups_file(text)
        units = templates["BigTeam"][0]
        self.assertEqual(len(units), 6)
        self.assertEqual(units[0], "CDF_Soldier_TL")
        self.assertEqual(units[-1], "CDF_Soldier")


if __name__ == "__main__":
    unittest.main(verbosity=2)

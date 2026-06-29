"""Tests for extract_garrison.py — inline fixtures, no filesystem dependency."""

import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from extract_garrison import parse_garrison, parse_units_array, parse_int_assignment


FIXTURE_SWITCH = """
switch (_town getVariable "wfbe_town_type") do {
    case "SmallTown1": {
        _units = [["Squad", 1, 0],["Team", 1, 0],["Team_AT", 2, 0],["AA_Light", 1, 1]];
        _percentage_inf = 80;
        _groups_max = 5;
    };
    case "MediumTown1": {
        _units = [["Team", 3, 0],["Team_Sniper", 1, 0],["Mechanized", 1, 1]];
        _percentage_inf = 75;
        _groups_max = 6;
    };
    default {
        _units = [["Squad", 1, 0], ["Team", 1, 0]];
        _percentage_inf = 80;
        _groups_max = 3;
    };
};
"""


class TestParseGarrison(unittest.TestCase):

    def setUp(self):
        self.garrison = parse_garrison(FIXTURE_SWITCH)

    def test_town_types_found(self):
        self.assertIn("SmallTown1", self.garrison)
        self.assertIn("MediumTown1", self.garrison)
        self.assertIn("default", self.garrison)

    def test_smalltown1_groups_max(self):
        self.assertEqual(self.garrison["SmallTown1"]["groups_max"], 5)

    def test_smalltown1_percentage_inf(self):
        self.assertEqual(self.garrison["SmallTown1"]["percentage_inf"], 80)

    def test_smalltown1_units(self):
        units = self.garrison["SmallTown1"]["units"]
        self.assertEqual(len(units), 4)
        self.assertEqual(units[0], ["Squad", 1, 0])
        self.assertEqual(units[3], ["AA_Light", 1, 1])

    def test_mediumtown1_groups_max(self):
        self.assertEqual(self.garrison["MediumTown1"]["groups_max"], 6)

    def test_mediumtown1_units_vehicle_bucket(self):
        units = self.garrison["MediumTown1"]["units"]
        mechanized = [u for u in units if u[0] == "Mechanized"]
        self.assertEqual(len(mechanized), 1)
        self.assertEqual(mechanized[0][2], 1)  # bucket 1 = vehicle

    def test_default_present(self):
        dflt = self.garrison["default"]
        self.assertIsNotNone(dflt)
        self.assertEqual(dflt["groups_max"], 3)
        self.assertEqual(dflt["percentage_inf"], 80)

    def test_default_units_squad(self):
        units = self.garrison["default"]["units"]
        keys = [u[0] for u in units]
        self.assertIn("Squad", keys)

    def test_force_values_parsed(self):
        units = self.garrison["SmallTown1"]["units"]
        # Team_AT has force=2
        team_at = [u for u in units if u[0] == "Team_AT"]
        self.assertEqual(team_at[0][1], 2)


class TestParseUnitsArray(unittest.TestCase):

    def test_single_unit(self):
        body = '_units = [["Squad", 1, 0]];'
        units = parse_units_array(body)
        self.assertEqual(units, [["Squad", 1, 0]])

    def test_multiple_units(self):
        body = '_units = [["Squad", 1, 0], ["Team_AT", 2, 0], ["AA_Light", 1, 1]];'
        units = parse_units_array(body)
        self.assertEqual(len(units), 3)
        self.assertEqual(units[2], ["AA_Light", 1, 1])

    def test_empty(self):
        body = "no units here"
        units = parse_units_array(body)
        self.assertEqual(units, [])


class TestParseIntAssignment(unittest.TestCase):

    def test_percentage_inf(self):
        body = "_percentage_inf = 80;\n_groups_max = 5;"
        self.assertEqual(parse_int_assignment(body, "percentage_inf"), 80)

    def test_groups_max(self):
        body = "_percentage_inf = 80;\n_groups_max = 5;"
        self.assertEqual(parse_int_assignment(body, "groups_max"), 5)

    def test_missing_returns_none(self):
        body = "_percentage_inf = 80;"
        self.assertIsNone(parse_int_assignment(body, "groups_max"))


if __name__ == "__main__":
    unittest.main(verbosity=2)

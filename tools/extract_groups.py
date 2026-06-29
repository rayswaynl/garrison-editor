"""
extract_groups.py
Parse WASP Groups_<F>.sqf files → assets/data/groups.json

Output schema:
{
  "<faction>": {
    "side": "WEST|EAST|GUER",
    "templates": {
      "<key>": [ ["cls", ...], ... ],  // list of variant unit-arrays
      ...
    }
  },
  ...
}

Usage:
    python tools/extract_groups.py
    python tools/extract_groups.py --groups-dir <path> --out <path>
"""

import re
import json
import os
import argparse

# ── Constants ────────────────────────────────────────────────────────────────

GROUPS_DIR_DEFAULT = (
    r"C:\Users\Steff\a2waspwarfare\Missions"
    r"\[55-2hc]warfarev2_073v48co.chernarus"
    r"\Common\Config\Groups"
)

OUT_DEFAULT = os.path.join(
    os.path.dirname(__file__), "..", "assets", "data", "groups.json"
)

# Fallback side map when _side is not a literal string in the file.
FACTION_SIDE_MAP = {
    "CDF":   "WEST",
    "US":    "WEST",
    "USMC":  "WEST",
    "GUE":   "GUER",
    "PMC":   "GUER",
    "INS":   "EAST",
    "RU":    "EAST",
    "TKA":   "EAST",
    "TKGUE": "GUER",
}


# ── Parser ───────────────────────────────────────────────────────────────────

def _extract_string_literal(line: str) -> str | None:
    """Return the first double-quoted string content found on the line."""
    m = re.search(r'"([^"]*)"', line)
    return m.group(1) if m else None


def parse_groups_file(text: str) -> tuple[str, str, dict]:
    """
    Parse the SQF _k/_u/_l triplet pattern.

    Returns:
        (faction, side, templates)
        templates: { key: [ [cls,...], ... ] }

    Parsing rules
    ─────────────
    * `_side = "..."` / `_faction = "..."` — read side/faction literal
    * `_k = _k + ["<KEY>"];` — start a new template block; key pushed
    * `_u = [...]` (bare assignment) — start a fresh unit list
    * `_u = _u + [...]` — append to current unit list
    * `_l = _l + [_u];` — commit the current _u to the current key

    A key may appear multiple times (variants) — each `_l + [_u]` creates
    a new variant for the most recent key with that name.
    """
    side = ""
    faction = ""
    templates: dict[str, list[list[str]]] = {}

    current_key: str | None = None
    current_u: list[str] = []
    # Track per-key variant lists so we can append in order
    # key -> list of variant arrays
    key_variants: dict[str, list[list[str]]] = {}

    for line in text.splitlines():
        stripped = line.strip()

        # Skip comments
        if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
            continue

        # _side = "...";
        if re.match(r'_side\s*=\s*"', stripped):
            val = _extract_string_literal(stripped)
            if val:
                side = val
            continue

        # _faction = "...";
        if re.match(r'_faction\s*=\s*"', stripped):
            val = _extract_string_literal(stripped)
            if val:
                faction = val
            continue

        # _k = _k + ["KEY"];
        m = re.match(r'_k\s*=\s*_k\s*\+\s*\["([^"]*)"\]', stripped)
        if m:
            current_key = m.group(1)
            current_u = []
            continue

        # _l = _l + [_u];  — commit current_u under current_key
        if re.match(r'_l\s*=\s*_l\s*\+\s*\[_u\]', stripped):
            if current_key is not None and current_u:
                if current_key not in key_variants:
                    key_variants[current_key] = []
                key_variants[current_key].append(list(current_u))
            current_u = []
            continue

        # _u = ["cls"];  — bare assignment (reset)
        m = re.match(r'_u\s*=\s*\[("(?:[^"]*)"(?:\s*,\s*"[^"]*")*)\]', stripped)
        if m:
            current_u = re.findall(r'"([^"]*)"', m.group(1))
            continue

        # _u = _u + ["cls"];  — accumulate
        m = re.match(r'_u\s*=\s*_u\s*\+\s*\[("(?:[^"]*)"(?:\s*,\s*"[^"]*")*)\]', stripped)
        if m:
            current_u.extend(re.findall(r'"([^"]*)"', m.group(1)))
            continue

    # Infer side/faction if not found as literals
    if not faction:
        faction = "UNKNOWN"
    if not side:
        side = FACTION_SIDE_MAP.get(faction, "UNKNOWN")

    return faction, side, key_variants


def build_groups(groups_dir: str) -> dict:
    """
    Glob Groups_*.sqf, parse each, return the full groups dict.
    """
    result: dict[str, dict] = {}

    sqf_files = sorted(
        f for f in os.listdir(groups_dir)
        if f.lower().startswith("groups_") and f.lower().endswith(".sqf")
    )

    for filename in sqf_files:
        path = os.path.join(groups_dir, filename)
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()

        faction, side, templates = parse_groups_file(text)

        # Infer faction from filename as fallback
        if faction == "UNKNOWN":
            stem = os.path.splitext(filename)[0]  # Groups_CDF -> CDF
            faction = stem.split("_", 1)[1] if "_" in stem else stem.upper()
        if side == "UNKNOWN":
            side = FACTION_SIDE_MAP.get(faction, "UNKNOWN")

        result[faction] = {
            "side": side,
            "templates": templates,
        }

    return result


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Parse WASP Groups_*.sqf → groups.json")
    parser.add_argument("--groups-dir", default=GROUPS_DIR_DEFAULT)
    parser.add_argument("--out", default=OUT_DEFAULT)
    args = parser.parse_args()

    groups = build_groups(args.groups_dir)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(groups, fh, indent=2, ensure_ascii=False)

    # Sanity report
    print(f"Wrote {args.out}")
    print(f"  Factions ({len(groups)}): {sorted(groups.keys())}")
    for faction, data in sorted(groups.items()):
        tmpl_count = len(data["templates"])
        variant_count = sum(len(v) for v in data["templates"].values())
        print(f"  {faction:8s} side={data['side']:4s}  keys={tmpl_count:3d}  variants={variant_count}")

    # Spot-check: CDF Squad first variant
    cdf = groups.get("CDF", {})
    squad_variants = cdf.get("templates", {}).get("Squad", [])
    if squad_variants:
        print(f"\nCDF Squad[0]: {squad_variants[0]}")
    else:
        print("\nWARN: CDF Squad not found")


if __name__ == "__main__":
    main()

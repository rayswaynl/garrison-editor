"""
extract_garrison.py
Parse WASP Server_GetTownGroupsDefender.sqf → assets/data/garrison.json

Output schema:
{
  "<townType>": {
    "units": [["key", force, bucket], ...],
    "percentage_inf": N,
    "groups_max": M
  },
  ...
  "default": { ... }
}

bucket: 0 = infantry, 1 = vehicle

Usage:
    python tools/extract_garrison.py
    python tools/extract_garrison.py --sqf <path> --out <path>
"""

import re
import json
import os
import argparse

# ── Defaults ──────────────────────────────────────────────────────────────────

SQF_DEFAULT = (
    r"C:\Users\Steff\a2waspwarfare\Missions"
    r"\[55-2hc]warfarev2_073v48co.chernarus"
    r"\Server\Functions\Server_GetTownGroupsDefender.sqf"
)

OUT_DEFAULT = os.path.join(
    os.path.dirname(__file__), "..", "assets", "data", "garrison.json"
)


# ── Brace-matched block extractor ─────────────────────────────────────────────

def extract_brace_block(text: str, start: int) -> str:
    """
    Given text and an index pointing at the opening '{', extract the
    content up to and including the matching closing '}'.  Returns the
    inner text (between the braces).
    """
    assert text[start] == "{", f"Expected '{{' at {start}, got {text[start]!r}"
    depth = 0
    i = start
    while i < len(text):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1:i]
        i += 1
    raise ValueError("Unmatched '{' starting at position %d" % start)


# ── Unit list parser ───────────────────────────────────────────────────────────

_UNIT_TUPLE_RE = re.compile(
    r'\[\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*\]'
)


def parse_units_array(text: str) -> list[list]:
    """
    Parse  _units = [[key, force, bucket], ...];
    from a case block body.  Returns list of [key, force, bucket].
    """
    # Find  _units = [ ... ];
    m = re.search(r'_units\s*=\s*\[', text)
    if not m:
        return []
    # Extract the outer array — brace-match from the '[' character.
    # We need bracket matching here (not brace).
    start = m.end() - 1  # position of '['
    depth = 0
    i = start
    while i < len(text):
        if text[i] == '[':
            depth += 1
        elif text[i] == ']':
            depth -= 1
            if depth == 0:
                array_text = text[start:i + 1]
                break
        i += 1
    else:
        return []

    units = []
    for match in _UNIT_TUPLE_RE.finditer(array_text):
        key = match.group(1)
        force = int(match.group(2))
        bucket = int(match.group(3))
        units.append([key, force, bucket])
    return units


def parse_int_assignment(text: str, varname: str) -> int | None:
    """
    Find  `_<varname> = <N>;`  in a block and return N.
    """
    pat = re.compile(rf'_{re.escape(varname)}\s*=\s*(\d+)')
    m = pat.search(text)
    return int(m.group(1)) if m else None


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_garrison(text: str) -> dict:
    """
    Parse the switch/case block in Server_GetTownGroupsDefender.sqf.
    Returns  { townType: { units, percentage_inf, groups_max } }.
    """
    result: dict[str, dict] = {}

    # Find each  case "TownType":   or  default
    # We search for case/default entries within the outer switch body.
    # Strategy: find `switch ... do {` block, then scan for case/default entries.

    switch_m = re.search(r'\bswitch\b[^{]*\bdo\b\s*\{', text)
    if not switch_m:
        raise ValueError("Could not find 'switch ... do {' in file")

    switch_body_start = switch_m.end() - 1  # the '{'
    switch_body = extract_brace_block(text, switch_body_start)

    # Scan for case "...": {  and  default {  patterns.
    # case_m.group(0) always ends with '{'  so brace_pos = abs end of match - 1.
    CASE_RE = re.compile(r'\bcase\s+"([^"]+)"\s*:\s*\{|\bdefault\b\s*\{')

    pos = 0
    while pos < len(switch_body):
        case_m = CASE_RE.search(switch_body, pos)
        if not case_m:
            break

        # The '{' that opens this case body is the last char of the match
        brace_pos = case_m.end() - 1
        assert switch_body[brace_pos] == "{", (
            f"Expected '{{' at {brace_pos}, got {switch_body[brace_pos]!r}"
        )

        body_text = extract_brace_block(switch_body, brace_pos)

        if case_m.group(0).lstrip().startswith("default"):
            town_type = "default"
        else:
            town_type = case_m.group(1)

        units = parse_units_array(body_text)
        percentage_inf = parse_int_assignment(body_text, "percentage_inf")
        groups_max = parse_int_assignment(body_text, "groups_max")

        result[town_type] = {
            "units": units,
            "percentage_inf": percentage_inf,
            "groups_max": groups_max,
        }

        # Advance past the closing '}' of this case body
        pos = brace_pos + len(body_text) + 2  # +2 for the '{' and '}'

    return result


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Parse WASP Server_GetTownGroupsDefender.sqf → garrison.json"
    )
    parser.add_argument("--sqf", default=SQF_DEFAULT)
    parser.add_argument("--out", default=OUT_DEFAULT)
    args = parser.parse_args()

    with open(args.sqf, encoding="utf-8", errors="replace") as fh:
        text = fh.read()

    garrison = parse_garrison(text)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(garrison, fh, indent=2, ensure_ascii=False)

    print(f"Wrote {args.out}")
    print(f"  Town types ({len(garrison)}): {sorted(garrison.keys())}")

    # Spot-check SmallTown1
    st1 = garrison.get("SmallTown1", {})
    print(f"\nSmallTown1:")
    print(f"  groups_max     = {st1.get('groups_max')}")
    print(f"  percentage_inf = {st1.get('percentage_inf')}")
    print(f"  units          = {st1.get('units')}")

    dflt = garrison.get("default", {})
    print(f"\ndefault:")
    print(f"  groups_max     = {dflt.get('groups_max')}")
    print(f"  percentage_inf = {dflt.get('percentage_inf')}")
    print(f"  units          = {dflt.get('units')}")


if __name__ == "__main__":
    main()

"""
gen_units.py
Collect every classname referenced across groups.json,
map each to a CfgVehicles display name + thumbnail path,
write assets/data/units.json, and copy used thumbnails to assets/thumbs/.

Output schema (units.json):
{
  "<ClassName>": {
    "name": "Display name from CfgVehicles, or the class itself",
    "thumb": "<ClassName>.<ext>"   // relative filename in assets/thumbs/
              // or null if no thumbnail found
  },
  ...
}

Usage:
    python tools/gen_units.py
    python tools/gen_units.py --groups-json <path> --cfg-vehicles <path>
                              --thumbs-src <path> --out-json <path>
                              --out-thumbs <path>
"""

import re
import json
import os
import shutil
import argparse

# ── Defaults ──────────────────────────────────────────────────────────────────

GROUPS_JSON_DEFAULT = os.path.join(
    os.path.dirname(__file__), "..", "assets", "data", "groups.json"
)

CFG_VEHICLES_DEFAULT = (
    r"C:\Users\Steff\arma2-co-config-reference\Config\CfgVehicles.txt"
)

THUMBS_SRC_DEFAULT = (
    r"C:\Users\Steff\arma2-co-config-reference\Images"
)

OUT_JSON_DEFAULT = os.path.join(
    os.path.dirname(__file__), "..", "assets", "data", "units.json"
)

OUT_THUMBS_DEFAULT = os.path.join(
    os.path.dirname(__file__), "..", "assets", "thumbs"
)


# ── CfgVehicles parser ────────────────────────────────────────────────────────

def parse_cfg_vehicles(path: str) -> dict[str, str]:
    """
    Parse CfgVehicles.txt and build a map of  classname -> displayName.

    The file follows Arma config syntax:
        class <ClassName> [: Parent]
        {
            ...
            displayName = "Some Name";
            ...
        };

    We use a simple line-by-line pass that is fast on large files:
    - When we see `class <Name>` (with optional parent), record Name.
    - When we see `displayName = "..."` and we have a pending class, record it.
    - When we see the class-closing `};` we clear the pending class.

    This handles nesting by tracking brace depth.
    """
    result: dict[str, str] = {}

    CLASS_RE = re.compile(r'^\s*class\s+(\w+)', re.IGNORECASE)
    DISPLAY_RE = re.compile(r'^\s*displayName\s*=\s*"([^"]*)"', re.IGNORECASE)

    # Stack: [(classname, brace_depth_at_open)]
    class_stack: list[tuple[str, int]] = []
    brace_depth = 0
    # displayName seen at this depth belongs to the innermost class whose
    # open depth == brace_depth (i.e. the class body is at brace_depth+1..N).

    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            # Count braces on this line
            opens = line.count("{")
            closes = line.count("}")

            # Check for displayName BEFORE updating depth (it's on a leaf line)
            dm = DISPLAY_RE.match(line)
            if dm and class_stack:
                cls_name = class_stack[-1][0]
                if cls_name not in result:
                    result[cls_name] = dm.group(1)

            # Update depth
            brace_depth += opens - closes

            # Pop classes whose body has closed
            while class_stack and class_stack[-1][1] >= brace_depth:
                class_stack.pop()

            # Check for class declaration (look on this line AFTER depth update
            # so we record the depth the class OPENS at)
            cm = CLASS_RE.match(line)
            if cm:
                class_stack.append((cm.group(1), brace_depth))

    return result


# ── Thumbnail index ────────────────────────────────────────────────────────────

def build_thumb_index(thumbs_src: str) -> dict[str, str]:
    """
    Walk the Images directory tree and build  classname_lower -> abs_path.
    """
    index: dict[str, str] = {}
    for root, _dirs, files in os.walk(thumbs_src):
        for f in files:
            stem, _ext = os.path.splitext(f)
            key = stem.lower()
            if key not in index:
                index[key] = os.path.join(root, f)
    return index


# ── classname collector ────────────────────────────────────────────────────────

def collect_classnames(groups: dict) -> set[str]:
    """Extract every unit classname referenced across all faction templates."""
    classnames: set[str] = set()
    for faction_data in groups.values():
        for variant_list in faction_data.get("templates", {}).values():
            for variant in variant_list:
                classnames.update(variant)
    return classnames


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Build units.json + copy thumbnails from groups.json"
    )
    parser.add_argument("--groups-json", default=GROUPS_JSON_DEFAULT)
    parser.add_argument("--cfg-vehicles", default=CFG_VEHICLES_DEFAULT)
    parser.add_argument("--thumbs-src", default=THUMBS_SRC_DEFAULT)
    parser.add_argument("--out-json", default=OUT_JSON_DEFAULT)
    parser.add_argument("--out-thumbs", default=OUT_THUMBS_DEFAULT)
    args = parser.parse_args()

    # Load groups
    with open(args.groups_json, encoding="utf-8") as fh:
        groups = json.load(fh)

    classnames = collect_classnames(groups)
    print(f"Classnames used across groups: {len(classnames)}")

    # Parse CfgVehicles
    print("Parsing CfgVehicles.txt …")
    display_names = parse_cfg_vehicles(args.cfg_vehicles)
    print(f"  {len(display_names)} entries parsed")

    # Build thumbnail index
    print("Indexing thumbnails …")
    thumb_index = build_thumb_index(args.thumbs_src)
    print(f"  {len(thumb_index)} thumbnails indexed")

    # Build units.json
    os.makedirs(os.path.dirname(os.path.abspath(args.out_json)), exist_ok=True)
    os.makedirs(args.out_thumbs, exist_ok=True)

    units: dict[str, dict] = {}
    copied = 0
    missing_thumb = []

    for cls in sorted(classnames):
        name = display_names.get(cls) or display_names.get(cls.lower()) or cls
        src_path = thumb_index.get(cls.lower())

        if src_path:
            ext = os.path.splitext(src_path)[1]
            thumb_filename = cls + ext
            dst = os.path.join(args.out_thumbs, thumb_filename)
            if not os.path.exists(dst):
                shutil.copy2(src_path, dst)
                copied += 1
            units[cls] = {"name": name, "thumb": thumb_filename}
        else:
            units[cls] = {"name": name, "thumb": None}
            missing_thumb.append(cls)

    with open(args.out_json, "w", encoding="utf-8") as fh:
        json.dump(units, fh, indent=2, ensure_ascii=False)

    have_thumb = len(classnames) - len(missing_thumb)
    print(f"\nWrote {args.out_json}")
    print(f"  Total units:    {len(units)}")
    print(f"  Have thumbnail: {have_thumb} / {len(units)} "
          f"({100 * have_thumb // len(units) if units else 0}%)")
    print(f"  Copied to thumbs/: {copied} new files")
    if missing_thumb:
        print(f"  Missing thumbnails ({len(missing_thumb)}): {sorted(missing_thumb)[:20]}"
              + ("…" if len(missing_thumb) > 20 else ""))


if __name__ == "__main__":
    main()

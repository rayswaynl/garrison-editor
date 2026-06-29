# Garrison & AI Groups Editor v1 — Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [ ]` steps. index.html edits SEQUENTIAL.

**Goal:** a single-file offline editor for WASP **town garrisons** — two linked panels (Group Templates + Garrison Table), exporting paste-ready source blocks with a round-trip gate.

**Architecture:** Python generators parse the WASP source → seed JSON + a unit catalog (classnames + thumbnails from `arma2-co-config-reference`). `index.html` (vanilla JS, WDDM dark theme + the thumbnail picker reused from Loadout Lab/WDDM) renders the 2 panels + export.

**Reuse:** WDDM/Loadout Lab tokens + the **thumbnail picker** pattern; `arma2-co-config-reference` (CfgVehicles classnames + the 2,893 classname-named thumbnails).

## Source files (read-only) — base = `C:\Users\Steff\a2waspwarfare\Missions\[55-2hc]warfarev2_073v48co.chernarus`
- **Garrison table**: `Server\Functions\Server_GetTownGroupsDefender.sqf` — a `switch (_town getVariable "wfbe_town_type")`, one `case` per town-type: `_units = [[key,force,bucket],...]; _percentage_inf = N; _groups_max = M;` (bucket 0=inf, 1=veh). Town-types: TinyTown1, SmallTown1/2, MediumTown1/2, LargeTown1/2, HugeTown1/2, + default. (`_groups_max` × `WFBE_C_TOWNS_UNITS_DEFENDER_COEF` at runtime — show raw.)
- **Group templates**: `Common\Config\Groups\Groups_<F>.sqf` (per faction). Pattern: `_k = _k + ["Key"]; _u = ["cls1"]; _u = _u + ["cls2"]; ...; _l = _l + [_u];` repeated, then `[_k,_l,_side,_faction] Call Compile preprocessFile "Common\Config\Config_Groups.sqf";`. Factions present: glob `Groups_*.sqf` (CDF, USMC, US, RU, INS, TKA, GUE, PMC, TKGUE…). Flat keys (CDF/GUE/INS) vs suffixed upgrade-tier keys (US/RU/TKA/USMC: `Squad_0`..`Squad_3`). Multiple arrays may share a key (random pick at runtime).
- **Units/thumbnails**: `C:\Users\Steff\arma2-co-config-reference` (CfgVehicles.txt for display names; the thumbnail images dir, files named `<classname>.<ext>`).

## Task 1: Generators → seed JSON + unit catalog
**Files:** `tools/extract_groups.py`, `tools/extract_garrison.py`, `tools/gen_units.py` (+ tests).
- [ ] `extract_groups`: parse each `Groups_<F>.sqf` → `groups.json = { <faction>: { side, templates: { <key>: [ [unitClass,...], ... ] } } }` (each key → list of variant unit-arrays). Robust to the `_k/_u/_l` triplet pattern + multi-line `_u = _u + [...]`.
- [ ] `extract_garrison`: parse `Server_GetTownGroupsDefender.sqf` → `garrison.json = { <townType>: { units:[[key,force,bucket],...], percentage_inf, groups_max } }` (incl. `default`).
- [ ] `gen_units`: collect every unit classname used across the Groups files; map each → `{name (from CfgVehicles or the class), thumb: <classname>.<ext> if present}`; copy the used thumbnails into `assets/thumbs/`. Emit `units.json` (the WASP-canonical roster) + note which lack a thumbnail. (Optionally also a broader CfgVehicles list for adding new units — but the used-set is the priority.)
- [ ] Tests (inline fixtures): a `_k/_u/_l` triplet → template; a garrison `case` → the 3 fields; a CfgVehicles name lookup. Run all → JSON + thumbs. Sanity: CDF `Squad` template has the 10-man roster incl. `CDF_Soldier_TL`; garrison `SmallTown1` has groups_max 5 + percentage_inf 80; ≥8 factions. **Commit** `feat(tools): parse WASP groups + garrison table + unit catalog`.

## Task 2: Shell + Group Templates panel
**Files:** `index.html`.
- [ ] Shell: WDDM tokens/brand (retitle "GARRISON & AI GROUPS"); 2-tab layout (Group Templates · Garrison Table); fetch the 3 JSONs.
- [ ] Group Templates: a **faction selector**; list each template key with its variant rosters; each roster = a row of unit thumbnails (name + thumb). **Reuse the thumbnail picker** (from Loadout Lab/WDDM) to add/replace units (search the unit catalog by name/class); reorder/remove units; add a new variant of a key; add a new key. Edits mutate the model. Classname validation (warn on unknown class) like the sibling tools.
- [ ] Verify (Playwright 8106): 0 errors; faction switch repopulates; CDF Squad shows its roster with thumbs; add a unit via picker → roster updates the model; add a variant. Screenshot. Commit `feat: shell + group templates panel + unit picker`.

## Task 3: Garrison Table panel + Sector-Planner cross-link
**Files:** `index.html`.
- [ ] For each of the 9 town-types (+ default): edit the group-type **pool** (add/remove a `[key, force, bucket]` — key chosen from the template keys that exist, bucket inf/veh), `percentage_inf` (0–100), `groups_max`. Show a small **preview** of what the type would field (the keys, inf/veh split). Note the `DEFENDER_COEF` multiplier.
- [ ] **Cross-link**: a "Load Sector-Planner campaign" (paste/file a `seed-towns.json`) → highlight which town-types are actually used (+ counts) so the user edits the relevant ones first.
- [ ] Verify (Playwright): edit a town-type's pool/inf%/cap → model updates; the keys offered match existing template keys; import a seed-towns.json → used types highlighted. 0 errors. Screenshot. Commit `feat: garrison table panel + Sector-Planner cross-link`.

## Task 4: Export + round-trip
**Files:** `index.html`.
- [ ] Export the **`Groups_<faction>.sqf`** template section (regenerate the `_k/_u/_l` triplets for the selected faction in the source format) and the **`Server_GetTownGroupsDefender.sqf`** `case` blocks (regenerate from the garrison model). Paste-and-patch where a source file is pasted (touch only edited templates/cases → byte-identical no-op), else regenerate-block + change-list. Copy + download.
- [ ] **Round-trip gate (Playwright)**: paste the real `Groups_CDF.sqf` → export with no edits → byte-identical (no-op); edit one template's roster → only that triplet changes. Paste the real `Server_GetTownGroupsDefender.sqf` → no-op byte-identical; edit one town-type's groups_max → only that case changes. 0 errors. Commit `feat: export Groups + garrison blocks + round-trip`.

## Task 5: Verify + finish + deploy + tile
- [ ] generator tests pass; full smoke (both panels, picker, cross-link, export round-trip); 0 errors; screenshots. README; commit.
- [ ] Controller: merge `feat/v1`→main, push, enable Pages, verify live.
- [ ] Controller: add tile to miksuu hub (`tools.ts`: `{slug:"garrison-editor", name:"Garrison & AI Groups", description:"...", url:"https://rayswaynl.github.io/garrison-editor/"}`); **user-approved miksuu deploy**.

## Self-Review
- 2 linked panels (templates + garrison) + the unit picker reuse + the Sector-Planner town-type cross-link (the unique value). Export round-trip gate. Defense-kinds panel SKIPPED per scope. Sequential index.html edits.

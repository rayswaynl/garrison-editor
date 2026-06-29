# Garrison & AI Groups Editor

A browser-based, offline, single-file **order-of-battle editor** for Arma 2 **WASP "Warfare"** — part of the [Miksuu's Warfare tools](https://miksuu.com/tools) suite (sibling to [WDDM](https://github.com/rayswaynl/WDDM), [Loadout Lab](https://github.com/rayswaynl/loadout-lab), [Sector & Town Planner](https://github.com/rayswaynl/sector-planner), [Strategy & Economy](https://github.com/rayswaynl/strategy-economy)).

**▶ Live: https://rayswaynl.github.io/garrison-editor/**

## What it does

Define **what units defend each town** in WASP — two linked panels:

- **Group Templates** (per faction) — each AI squad type (`Squad`, `Team_MG`, `Motorized`, `Mechanized_Heavy`, `Armored_Heavy`…) is an **ordered unit roster**, edited with a thumbnail unit picker. Add variants per type (the runtime picks one at random). Source: `Common/Config/Groups/Groups_<faction>.sqf`.
- **Garrison Table** (town-type → defenders) — for each of the 9 town-types (`TinyTown1`…`HugeTown2`), which group-types garrison it, the **infantry %**, and the **group cap**. Source: `Server/Functions/Server_GetTownGroupsDefender.sqf`.

## Cross-link with the Sector & Town Planner

The 9 town-type strings are **identical** to the ones the [Sector Planner](https://rayswaynl.github.io/sector-planner/) edits — set a town's type on the map, then define exactly what spawns to defend that type here. Import a Sector-Planner campaign to see which town-types you actually use.

## Output

Regenerates the source blocks paste-ready (the `Groups_<faction>.sqf` template triplets + the `Server_GetTownGroupsDefender.sqf` `case` blocks), with a no-op round-trip gate.

## Unique core

Where the sibling tools edit space, kit, the map, or systems, this one edits **force composition** — build squads from unit rosters and assign them to defend town-types. Reuses the `arma2-co-config-reference` classnames + thumbnails.

## License

Unofficial, non-commercial reference tool for mission development. Arma 2 / WASP config + unit imagery © **Bohemia Interactive** / WFBE authors.

# UE MCP Template Assets Registry

**Core rule:** `AssetTools.duplicate` is the generic asset-creation path. It works for ANY asset class — MPC, Material, MaterialInstance, DataTable, CurveTable, DataAsset, Blueprint, NiagaraSystem, UserDefinedStruct/Enum (asset-level), etc. When no create-tool exists for a class (e.g., MaterialParameterCollection, Niagara, structs/enums as assets), find an existing asset of that class and duplicate, then rewrite its contents (empty-then-fill for arrays — see MISTAKES.md 2026-08-05).

**Before duplicating:** `AssetTools.exists` the source; after duplicating: verify `get_asset_class`, then inspect (`get_properties`) before writing.

## Known template sources — SAFERWATER project (2026-08-05)

| Class needed | Template asset | Path | Notes |
|---|---|---|---|
| MaterialParameterCollection | QMPC_GlobalFoliageActor | `/Game/Fab/MaterialParameterCollection/QMPC_GlobalFoliageActor` | empty-then-fill Scalar/VectorParameters |
| Material | (use `MaterialTools.create_material` — tool exists) | — | fallback source: `/Game/SAFERWATER/M_OptimizedLandscape` |
| MaterialInstance | (use `MaterialInstanceTools` — tool exists) | — | fallback: `/Game/SAFERWATER/MI_Landscape` |
| Blueprint Actor | (use `BlueprintTools.create` — tool exists) | — | fallback: `/Game/Blueprints/BP_Scanner` |
| Niagara System | **NONE yet** — no Niagara toolset exists; duplicate is the only MCP path | — | import the free Fab "WaterEffect" pack (12 Niagara effects) or Niagara starter content; then those NS assets become duplicate sources |

## Convention

Any asset the user creates by hand that the MCP may need to duplicate later should live at a stable path and be registered here. Engine content paths (`/Engine/...`) are also valid duplicate sources when a project asset of the class is missing.

## Tested: NOT possible (2026-08-05)

- **UserDefinedEnum entry editing via `ObjectTools.set_properties`:** NOT possible. The MCP property system exposes only `enumDescription` on a UserDefinedEnum; `names` / `enumEntries` / `editorData` are unreadable and the `:EditorData` sub-object is not addressable. Enum **creation AND entry editing are manual-only** (asset existence IS verifiable via `get_asset_class`).
- UserDefinedStruct field editing: same structural limitation expected (untested) — treat as manual-only.

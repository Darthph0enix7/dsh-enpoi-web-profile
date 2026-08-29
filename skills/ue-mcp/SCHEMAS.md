# UE MCP Schema Cache

Cached `describe_toolset` outputs for toolsets you have mapped. Each entry has a **[Tested: UE 5.8]** tag with the date you last verified it. If a toolset is missing here, run `describe_toolset` and append the result.

**How to use:** If the toolset you need is in this file, skip the `describe_toolset` round-trip and go straight to `call_tool` with the cached schema. The agent must re-validate `refPath` shapes for any new tool it has not personally called.

---

## editor_toolset.toolsets.actor.ActorTools
**[Tested: UE 5.8, 2026-07-21]**

Inspect and modify actors: transforms, labels, parent-child relationships, components, tags.

| Tool | One-line | Key args |
|---|---|---|
| `get_components` | List components on an actor | `actor: refPath`, `component_type?: refPath` |
| `get_actor_transform` | Read position/rotation/scale | `actor: refPath` |
| `set_actor_transform` | Update position/rotation/scale | `actor: refPath`, `xform: {location, rotation, scale}`, `worldspace?: bool` |
| `get_actor_bounds` | AABB | `actor: refPath` |
| `get_root_component` | Root component of actor | `actor: refPath` |
| `get_component_actor` | Actor owning a component | `component: refPath` |
| `set_parent_component` | Reparent | `component: refPath`, `parent: refPath` |
| `get_parent_component` | Current parent | `component: refPath` |
| `add_component` | Add a component to actor | `owner: refPath`, `component_type: refPath`, `name: string` |
| `remove_component` | Remove a component | `component: refPath` |
| `add_tag` / `remove_tag` / `has_tag` / `get_tags` | Tag management | `actor: refPath`, `tag: string` |
| `set_label` / `get_label` | Friendly name | `actor: refPath`, `label: string` |
| `look_at` | Face a world position | `actor: refPath`, `target_location: {x,y,z}` |

**All actor references use `refPath` shape:**
```json
{ "refPath": "/Game/Maps/MyLevel.MyLevel:PersistentLevel.ActorName" }
```

---

## editor_toolset.toolsets.scene.SceneTools
**[Tested: UE 5.8, 2026-07-21]**

Work with the currently loaded level, scene outliner, level instances.

| Tool | One-line | Key args |
|---|---|---|
| `find_actors` | Search scene for matching actors | see below |
| `get_actors_in_folder` | List actors in outliner folder | `folder: string` |
| `get_folders` | All folder paths in outliner | none |
| `set_actor_folder` | Move actor to folder | `actor: refPath`, `folder: string` |
| `get_current_level` | Path to current level asset | none |
| `load_level` | Load a level | `level: refPath` |
| `save_actor` | Save actor to disk | `actor: refPath` |
| `is_checked_out` | Source-control state | `actor: refPath` |
| `can_edit` | Editable? | `actor: refPath` |
| `merge_actors` | Merge static-mesh actors into one | `actors: [refPath]`, `merge_type: string` |
| `create_level_instance` | New level instance | `level: refPath`, `location: Vector`, `rotation: Rotator` |
| `edit_level_instance` | Enter edit mode | `level_instance: refPath` |
| `commit_level_instance` | Save/discard and exit edit | `level_instance: refPath`, `discard?: bool` |
| `get_collision_channels` | Enumerate channels | none |

### `find_actors` gotcha (see MISTAKES.md)

**Always pass all four of these, even when filtering by class:**
```json
{
  "actor_type": { "refPath": "/Script/Engine.StaticMeshActor" },
  "name": "",
  "tag": "",
  "collision_channels": []
}
```

Optional args: `root` (limit search to subtree), `bounds` (AABB overlap), `collision_channels` (use native physics overlap for bounds, ignores non-collision actors).

Returns: `[{label, refPath}, ...]`

---

## editor_toolset.toolsets.editor.EditorAppToolset
**[Tested: UE 5.8]**

Visual/editor automation. Cache only the high-value operations:

| Tool | Purpose | Key args |
|---|---|---|
| `FocusOnActors` | Frame actors in viewport | `actors: [refPath]` |
| `GetCameraTransform` / `SetCameraTransform` | Read/set viewport camera | `transform: ToolsetTransform` |
| `GetVisibleActors` | Read current frustum | none |
| `CaptureViewport` | PNG viewport capture with annotations | full six-field `annotations` object |
| `CaptureEditorImage` | Full editor image | none |
| `CaptureAssetImage` | Asset thumbnail | `assetPath: string` |
| `StartPIE` / `StopPIE` / `IsPIERunning` | PIE control | `options?` / none |
| `SelectActors` / `SelectAssets` | Editor selection | refs |

**CaptureViewport annotation fields:** `gridSpacing`, `gridExtent`, `gridHeight`, `maxLabelDistance`, `classFilter`, `maxLabels` are all required by the UE schema.

---

## editor_toolset.toolsets.asset.AssetTools
**[Tested: UE 5.8]**

| Tool | Purpose | Key args |
|---|---|---|
| `create_folder` / `exists` / `list_folders` | Folder management | `path: string` |
| `find_assets` | Asset search | `folder_path`, `name`, `asset_type`, `recursive`, `tags` |
| `get_asset_class` | Class lookup | `asset_path` |
| `move` / `duplicate` | Rename/copy | `source_path`, `destination_path` / `path`, `new_path` |
| `save_assets` | Save explicit assets | `asset_paths: [string]` |

---

## editor_toolset.toolsets.material.MaterialTools
**[Tested: UE 5.8]**

| Tool | Purpose | Key args |
|---|---|---|
| `create_material` | Create material | `folder_path`, `asset_name` |
| `add_expression` | Add graph node | `material_or_function`, `expression_class` |
| `connect_expressions` | Wire nodes | `from_expression`, `from_output_name`, `to_expression`, `to_input_name` |
| `connect_to_output` | Wire material output | `expression`, `output_name`, `material_property` |
| `get_expressions` / `get_expression_inputs` | Inspect graph | refs |
| `recompile` | Compile shader | `material_or_function` |

**Node properties** (parameter names/defaults/textures) require `ObjectTools.set_properties` after `add_expression`.

---

## editor_toolset.toolsets.blueprint.BlueprintTools
**[Tested: UE 5.8, 2026-08-05]**

| Tool | Purpose | Key args |
|---|---|---|
| `create` | Create standard Actor/Object BP | `folder_path`, `asset_name`, `asset_type` (class refPath, e.g. `/Script/Engine.Actor`) |
| `add_variable` | **Primitive vars ONLY** (bool/int/float/byte/name/string/text/Vector/Rotator/Transform/Vector2D/LinearColor) | `blueprint`, `name`, `type_name` |
| `add_object_variable` | Object refs | `blueprint`, `name`, `object_class` (class refPath) |
| `set_variable_instance_editable` | Details-panel visibility — **required after adding user-facing vars** | `blueprint`, `variable_name`, `instance_editable` |
| `add_event` | Custom events — **DSL CANNOT attach bodies to them** (leave bodies for the editor) | `blueprint`, `event_name` |
| `add_function_graph` / `add_function_param` | Functions/signatures | refs |
| `write_graph_dsl` | Graph authoring — param is **`code`**, NOT `dsl` | `graph` (EventGraph ref), `code` |
| `read_graph_dsl` | Post-write read-back verification | `graph` |
| `find_nodes` / `find_node_types` / `get_node_type_pins` | Node discovery | `graph`, `title` / `type_id_filter` / `type_id` |
| `delete_node` | Remove orphan/failed nodes (DSL writes are additive!) | `graph`, `node` |
| `get_default_object` | CDO ref for default values | `blueprint` |
| `compile_blueprint` | Compile (null = success) | `blueprint` |

**DSL rules (verified 2026-08-05):** branching forms (if/switch/multi-exec) TERMINATE the enclosing flow — nothing may follow them in a body; use continuations/nesting. `(event X)` works ONLY for known event types (EventBeginPlay; EventTick with param `(DeltaSeconds)`). Enum-typed variables NOT creatable (primitives only) — custom enums/structs/timelines are manual. Scenario logic works well as `ScenarioIndex` int + `(switch int ...)` as the final statement of EventTick.

---

## editor_toolset.toolsets.data_table.DataTableTools
**[Tested: UE 5.8]**

| Tool | Purpose | Key args |
|---|---|---|
| `create` | DataTable from existing ScriptStruct | `folder_path`, `asset_name`, `schema: refPath` |
| `add_rows` / `set_rows` / `get_rows` | Row lifecycle | `data_table`, row names, JSON-string values |
| `get_schema` / `list_rows` | Verify | `data_table` |

The struct must already contain its fields before DataTable creation.

---

## editor_toolset.toolsets.object.ObjectTools
**[Tested: UE 5.8, 2026-08-05]**

Read/write UObject properties; also class discovery. No asset-creation tools.

| Tool | Purpose | Key args |
|---|---|---|
| `set_properties` | Set property values | `instance: refPath`, `values: JSON-string` |
| `get_properties` | Read property values (JSON string) | `instance: refPath`, `properties: [string]` |
| `list_properties` | Enumerate properties | `instance: refPath` |
| `reset_properties` | Reset to defaults | `instance: refPath`, `properties: [string]` |
| `get_class` | Class of an object | `instance: refPath` |
| `search_subclasses` | Find subclasses | `base_class: refPath`, `class_name?: string` |

**Notes:** All args (incl. optional-looking ones) are in `required`. `set_properties` arrays: top-level TArray = plain JSON list; nested arrays inside structs = `{"array": [...]}`. To replace an existing array: empty-then-fill (see MISTAKES.md 2026-08-05). No tool creates arbitrary assets — use `AssetTools.duplicate` on an existing asset of the desired class.

---

## editor_toolset.toolsets.material.MaterialTools
**[Tested: UE 5.8, 2026-08-05]**

Create/edit Materials, MaterialFunctions, **MaterialParameterCollections**.

| Tool | Purpose | Key args |
|---|---|---|
| `create_material` / `create_function` / `create_parameter_collection` | Asset creation | `folder_path`, `asset_name` |
| `add_expression` | Add graph node | `material_or_function`, `expression_class: refPath`, `x`, `y` |
| `list_expression_classes` | Valid node classes (search filter) | `material_or_function`, `search` |
| `connect_expressions` | Wire nodes | `from_expression`, `from_output_name`, `to_expression`, `to_input_name` ("" = default) |
| `connect_to_output` / `disconnect_from_output` | Material output wiring | `expression`, `material_property` (EMaterialProperty enum), `output_name` |
| `get_property_input` / `get_expression_inputs` / `get_expression_output_names` / `get_expression_input_names` | Inspect graph | refs |
| `get_expressions` / `delete_expression` / `delete_unused_expressions` | Node lifecycle | refs |
| `recompile` | Compile (raises on shader error) | `material_or_function` |
| `layout_expressions` | Auto-arrange nodes | `material_or_function` |

**5.8 traps:** SLW materials need `MaterialExpressionSingleLayerWaterMaterialOutput` (ScatteringCoefficients/AbsorptionCoefficients/PhaseG/ColorScaleBehindWater). No BlendAngleCorrectedNormals — use Lerp+Normalize. Panner drives TextureSample.UVs. Node properties set via `ObjectTools.set_properties` with camelCase keys; Constant3Vector color = `constant` (LinearColor).

## editor_toolset.toolsets.material_instance.MaterialInstanceTools
**[Tested: UE 5.8, 2026-08-05]**

| Tool | Purpose | Key args |
|---|---|---|
| `create` | MI from parent | `folder_path`, `asset_name`, `parent: refPath` |
| `set_parent` | Reparent | `instance`, `parent` |
| `set_scalar_parameter` / `get_scalar_parameter` | Scalars | `instance`, `name`, `value` |
| `set_vector_parameter` / `get_vector_parameter` | Vectors (LinearColor) | `instance`, `name`, `value` |
| `set_texture_parameter` / `get_texture_parameter` | Textures | `instance`, `name`, `value` |
| `set_static_switch_parameter` / `get_static_switch_parameter` | Switches | `instance`, `name`, `value` |
| `set_parameter_override` | Enable/disable override | `instance`, `name`, `override` |
| `clear_parameters` | Revert to parent | `instance` |
| `list_parameters` | Parameter inventory (Scalar/Vector/Texture/StaticSwitch) | `material` |

**Note:** CollectionParameter-driven materials expose NO instance parameters (`list_parameters` = [] by design — the MPC owns them).

---

## Toolsets to map on demand

- [ ] `editor_toolset.toolsets.asset.AssetTools` — file/asset interaction
- [ ] `editor_toolset.toolsets.blueprint.BlueprintTools` — Blueprint work
- [ ] `EditorToolset.LogsToolset` — read UE output log
- [ ] `EditorToolset.EditorAppToolset` — console vars, PIE, viewport

(The other 14 toolsets — MaterialTools, SkeletalMeshTools, etc. — only describe when you first need them.)

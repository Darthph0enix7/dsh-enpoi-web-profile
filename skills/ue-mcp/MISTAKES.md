# UE MCP Mistakes Log

Anti-patterns and traps encountered when driving UE 5.8's MCP server. Append new entries; do not edit history.

## Format
```
## [YYYY-MM-DD] Short title
**What I did:** ...
**What happened:** ...
**Fix:** ...
**Rule:** ...
```

---

## [2026-07-21] Curl/SDK hangs on UE MCP after first call

**What I did:** Made a successful `describe_toolset` call, then tried a second call.
**What happened:** Subsequent calls timed out with `0 bytes received` or hung in `CLOSE-WAIT`.
**Fix:** UE's MCP server holds connections in `CLOSE-WAIT` after the SSE response; it does not always close the stream cleanly. With curl, use `--max-time 10-15` and read the buffered data. With an SDK, the streamable HTTP client may need explicit stream-end handling. Opening a fresh `initialize` to get a new session ID is the nuclear option.
**Rule:** Treat UE MCP responses as one-shot read-then-discard. Don't pipeline. Don't reuse a session that errored.

---

## [2026-07-21] find_actors / add_to_scene_from_class — fields listed as `required` but with `default: null` MUST still be passed

**What I did:** Called `find_actors` with only `actor_type`; called `add_to_scene_from_class` with only the `class` field (intuitively named — turns out the schema wants `actor_type`).
**What happened:** Server returned: `input param "X" is required by the function input schema Json, but is missing from the incoming function input params Json`. For `find_actors` it was `name` / `tag` / `collision_channels`. For `add_to_scene_from_class` it was `actor_type` (which I had wrongly named `class`).
**Why:** UE MCP's schema generator marks every field as `required` in the JSON Schema `required` array, even when the field has `default: null`. The server-side validator strictly enforces `required` regardless of default. And some field names are not what you'd expect from the C++ method name — `add_to_scene_from_class`'s class-arg is `actor_type`, not `class`.
**Fix (two parts):**
  1. Always include all fields listed in `required`, passing `null` / `""` / `[]` for ones you don't need. Don't try to be terse.
  2. When guessing arg names, prefer the C++ property name over the natural-language verb. For UE scene tools, `actor_type` is the convention even when "class" feels more natural.
**Rule:** For every MCP call, READ the `required` array in the inputSchema. Pass all required fields, defaulting to null/empty. When in doubt about a field name, `describe_toolset` first or check the inputSchema `properties` keys.

---

## [2026-07-21] Deeply-nested JSON via shell `-d '...'` OR heredoc gets rejected as "Invalid JSON body"

**What I did:** Built BlueprintTools.create + add_component calls with 5-level nested JSON, first as inline `curl -d '...'` args, then as heredoc-written files (`cat > file << EOF ... EOF`) sent via `--data-binary @file`.
**What happened:** Both forms failed with JSON-RPC parse error: `code: -32700, message: "Invalid JSON body!"`. The heredoc-written file passed the inline curl but failed at the server: Python `json.load` showed 6 opens / 7 closes — a stray `}` injected at the very end of the file. The visual cat output looked fine; the file was syntactically broken.
**Why:** Two compounding problems.
  1. UE's MCP server uses FJsonSerializer (strict; rejects any malformed JSON).
  2. Bash heredoc on CachyOS fish-isms / locale / shell version occasionally drops or duplicates a brace when the heredoc body is a single very-long line with mixed JSON tokens. Same payload via `json.dumps` is byte-perfect.
**Fix:** Build the body in Python and write via `json.dumps(body, separators=(',',':'))`. Send with `curl --data-binary @file`. Never inline `-d '...'` and never `cat > file << EOF` for nested JSON — use Python's serializer, full stop.
**Rule:** For any MCP call with >3 levels of JSON nesting, use `python3 -c "import json; json.dump(...)" > file` to build the body, then `--data-binary @file`. Heredoc and inline `-d` are both unreliable past 3 levels.

---

## [2026-07-23] ObjectTools values are JSON strings and nested arrays need wrappers

`ObjectTools.set_properties` expects `values` as a JSON-encoded string, not an object. Arrays inside structs such as `FWeightedBlendables` use `{"array": [...]}`. Inspect complex properties with `get_properties` before writing them.

## [2026-07-23] Component-bound events are not reliable in graph DSL

`write_graph_dsl` cannot reliably resolve dispatcher/event nodes created by `add_event` or component-bound event tools. Use explicit component-bound event creation where supported, or leave the event hookup for the editor.

## [2026-07-23] Blueprint Macro Libraries and graph creation are popup-locked

Creating a Macro Library or calling `add_function_graph` on one can open an editor modal and hard-lock the MCP server. Treat Macro Libraries as manual-only.

## [2026-07-23] Timelines, Maps, Structs, Enums, and Interfaces are manual scaffolding

Create these structures and specialized editor assets manually. The agent can continue with ordinary graphs, materials, actors, and DataTables after the scaffolding exists.

## [2026-07-23] `write_graph_dsl` is additive

Failed or repeated graph writes can leave orphan nodes. Prefer one verified write; otherwise delete the failed nodes before retrying.

## [2026-07-23] Graph DSL output names are lowercase and space-stripped

Use names such as `_outhit` and `_returnvalue`, not `_out_hit` or `_return_value`.

## [2026-08-05] Packaging fails with "Unknown Cook Failure" while the editor+MCP is running

**What I did:** User packaged for Linux with the editor open (MCP server running on 127.0.0.1:8000).
**What happened:** Cook itself completed, then "Exiting abnormally (error code: 1)" → UAT Error_UnknownCookFailure. Build log shows: `LogHttpListener: Error: HttpListener unable to bind to 127.0.0.1:<port>` — the cook commandlet also loads the MCP plugin and its HttpListener collides with the running editor's MCP server. Root cause: both processes read the same per-project settings (`Saved/Config/LinuxEditor/EditorPerProjectUserSettings.ini` → `ServerPortNumber`). A settings-only port change MOVES the collision to the new port — it does not fix it.
**Current scheme (since 2026-08-05):** SAFERWATER uses port **8010** set in the per-project settings; the editor is launched WITHOUT any CLI flag. **Packaging requires the editor to be closed** (or the server stopped via editor console `ModelContextProtocol.StopServer` before packaging, then `ModelContextProtocol.StartServer` after). Verified: package with editor closed = BUILD SUCCESSFUL; packaged game renders identically to the editor.
**Alternative permanent fix (not implemented):** set settings port back to 8000 and launch the editor with `-ModelContextProtocolPort=8010` (CLI override parsed by `ModelContextProtocolSettings.cpp`) — then the cook (no CLI arg → settings default 8000) binds a free port and packaging works with the editor open.
**Rule:** Before packaging: `pgrep -a -f UnrealEditor` — if an editor is running with MCP active, close it (or StopServer) first.

## [2026-08-05] UserDefinedEnum entries are NOT editable via MCP (tested)

**What I did:** After the user created `E_WaterScenario`, attempted to write the 5 entries (Normal..DirectFeed) via `ObjectTools.set_properties` empty-then-fill.
**What happened:** `list_properties` on the UserDefinedEnum exposes only `enumDescription`. `get_properties` for `names`/`enumEntries`/`editorData` → "could not be read"; the `:EditorData` sub-object refPath → "not valid Object". The entry array is C++-internal editor data, not reachable through the MCP property system.
**Fix:** Enum entry editing is manual-only (create enum → rename default entry → add entries). MCP can verify existence (`get_asset_class` = UserDefinedEnum) but not contents.
**Rule:** Enums = fully manual (create + entries). Don't attempt set_properties on enum entry arrays — it wastes calls.

## [2026-08-05] Verify the SEMANTIC chain, not just connectivity

**What I did:** Built the normal chain TS→Panner→Lerp→Normalize→Normal, then "verified" with get_expression_inputs after wiring.
**What happened:** The user reported a diagonal color split that drifted over time + color changes on plane rotation. Root cause: I had wired Panner→Lerp directly — the lerp was mixing two panning UV coordinates (a moving diagonal gradient) while the TextureSamples were orphaned (their RGB never reached the lerp). get_expression_inputs showed the connections existed — it cannot show the chain is conceptually right. Type-compatible wrong wiring compiles silently.
**Fix:** Correct chain: Panner OUTPUT → TextureSample.UVs input; TextureSample RGB OUTPUT → Lerp; Lerp alpha ← Constant(0.5); Lerp → Normalize → MP_Normal. For normal-map chains always confirm the TEXTURE is between the panner and the lerp.
**Rule:** After wiring, mentally trace the data flow: "what value does each pin actually carry?" — UV coordinates are float2, colors/normals are float3. A "verified" graph can still be semantically wrong.

## [2026-08-05] ENV: SAFERWATER machine — Engine/Generated/ShaderAutogen is MISSING

**What I did:** Recompiled M_TestWater_SLW after a user-side save; got `File '/Engine/Generated/ShaderAutogen/AutogenShaderHeaders.ush' not found` (Vulkan SM6 permutations).
**What happened:** On-disk check: `/home/adam/UnrealEngine5.8/Engine/Generated/` does NOT exist (source-built engine; other installs 5.4/5.7 also lack it). Any shader compile needing the autogen header fails. Material graphs are fine — this is engine-side. Editor launched with `-ddc=NoZenLocalFallback`.
**Fix:** Regenerate via engine rebuild (`./GenerateProjectFiles.sh && make -j16` in the engine root) or reinstall/repair the engine. Restart editor first (cheap test).
**Rule:** If shader compiles fail with "AutogenShaderHeaders.ush not found", check the ENGINE filesystem first — it is not a material-graph problem.

## [2026-08-05] StaticMeshComponent.overrideMaterials: plain refs, not FInterfaceOverride wrappers

**What I did:** Set a material override on a spawned StaticMeshActor's StaticMeshComponent with `{"overrideMaterials": [{"interface": {"refPath": "..."}}]}`.
**What happened:** `set_properties` returned true, but read-back showed `["None"]` — the wrapped shape was accepted syntactically and silently produced a null element.
**Fix:** Use plain element refs: `{"overrideMaterials": [{"refPath": "/Game/.../MI_X.MI_X"}]}` → read-back confirms the ref.
**Rule:** For component arrays of object refs, try plain `{"refPath": ...}` elements first; ALWAYS read back after setting (true ≠ applied).

## [2026-08-05] UE mesh re-import pitfalls — the SAFERWATER checklist

**What I did:** Replaced the Kallstollen channel mesh via "Reimport With New File" (Blender: re-unwrapped with Follow Active Quads, re-exported, same object name).
**What happened:** The reimport repeatedly produced a mesh with NO usable UVs — the surface rendered flat teal/white with no flow movement, even though the actor's material override was intact. Diagnosis: our river material drives ripples/flow from the mesh's UV strip; missing UVs = flat color + no motion. (Asset-level sanity: 24 verts/8 tris on the suspect mesh — also confirmed the geometry was near-stub size.)
**Fix (the brute-force fallback that worked):** fresh import as a new file → delete the old asset + actor → reapply the material override on the new actor → re-check the label → re-set the outliner folder → save. 
**Rule — checklist for ANY future mesh replacement:**
1. After the import: verify the ACTOR's material override is applied (fresh imports clear actor overrides and start white — reapply always). **Durable fix: also set the material on the MESH ASSET's slot itself** (StaticMeshTools.set_material) — then it survives even if actor overrides get cleared again. Belt and braces.
2. Verify the actor LABEL and OUTLINER FOLDER (fresh imports lose both).
3. Verify UV-dependent effects VISUALLY (flow movement): a flat white/teal surface = missing mesh UVs, NOT a material problem — check the Blender side (UV map exists in the Object Data tab, "UVs" checkbox on in the FBX export) or switch to a fresh import.
4. Delete the old asset when replacing by fresh import, or the "W_Channel_X2" duplication pattern appears.

## [2026-08-05] BP variables are NOT instance-editable by default — invisible in Details

**What I did:** Added variables to BP_WaterSystemManager via `BlueprintTools.add_variable`, then tried to set them on the level-placed instance via `ObjectTools.set_properties`.
**What happened:** (1) The user couldn't find the variables in the Details panel of the placed actor; (2) `set_properties` on the instance failed with "could not be set" for ALL variables, while the same floats succeeded on the CDO.
**Fix:** Call `BlueprintTools.set_variable_instance_editable` (blueprint, variable_name, instance_editable=true) for every variable that must appear in the Details panel / be settable per-instance. After marking + recompiling, instance `set_properties` works — including actor refs: `{"HauptseePlaneActor": {"refPath": "/Game/Main.Main:PersistentLevel.ActorName"}}`.
**Rule:** After add_variable/add_object_variable, mark instance_editable for user-facing variables. "could not be set" on an instance → check the editable flag first.

## [2026-08-05] Landscape alignment rabbit hole — when to STOP

**What I did:** Attempted to align the UE landscape to the Blender frame via marker cubes + trace_world measurements (scale fix 100→10.53, Z 60→14, then XY iteration).
**What happened:** Three compounding problems: (1) `trace_world` returned bit-identical values across different scene states (moved meshes, changed transforms) — stale collision data when the editor is unfocused/not ticking; measurements were unreliable; (2) the user's Blender scene is in a non-recoverable frame (scaled for sim software, markers don't map cleanly); (3) the editor lagged heavily, making visual verification impossible. After ~30 calls the user reverted.
**Fix:** The user's SCULPTED UE landscape is the ground truth — NEVER re-import from the heightmap, NEVER chase frame-matching blind. Content (water sheets, props) gets placed approximately by hand in the editor, matching the existing workflow.
**Rule:** Before trusting measurement tools: verify they respond to scene changes (trace twice with a known move). If a frame-matching problem needs 3+ unknown transforms AND the user can't verify visually (lag), STOP and revert — "make it work" wins over "make it right".

## [2026-08-05] Enum entries are invisible to ObjectTools (editor-only data)

**What I did:** Tried to write the 5 entries of a user-created `E_WaterScenario` UserDefinedEnum via `ObjectTools.set_properties` (empty-then-fill, the pattern that works for MPC arrays).
**What happened:** `list_properties` on the enum exposes ONLY `enumDescription`; `get_properties` on `Names`/`EnumEntries`/`DisplayNameMap` → "the following properties could not be read". The enum's entry data is editor-only and filtered from the MCP property reflection — both READ and WRITE fail.
**Fix:** Enum creation AND entry editing are manual-only (user opens the enum asset and adds/renames entries). The MCP can still verify the asset exists (get_asset_class = UserDefinedEnum) and duplicate the asset shell.
**Rule:** Do not attempt enum/struct entry writes via ObjectTools — check the TEMPLATES.md "Untested" section for the current status.

## [2026-08-05] Material graph authoring on UE 5.8 — SLW output node + camelCase keys + wiring traps

**What I did:** Built M_TestWater_SLW (Single Layer Water test material) via MaterialTools/ObjectTools: create_material, set shading model, add 13 expressions, set properties, wire, recompile.
**What happened:** Multiple instructive failures:
1. `set_properties` rejected `{"shading_model": ...}` / `{"blend_mode": ...}` — **keys must be camelCase**: `shadingModel`, `blendMode`, `parameterName`, `speedX`, `constant`. (Confirmed via `list_properties` on the Material.)
2. `MaterialExpressionBlendAngleCorrectedNormals` is NOT in 5.8's `list_expression_classes` — replace with **Lerp + Normalize** (fine for water normals).
3. Recompile failed: "SingleLayerWater materials requires the use of SingleLayerWaterMaterial output node" — **UE 5.8 requires `MaterialExpressionSingleLayerWaterMaterialOutput`** (pins: ScatteringCoefficients, AbsorptionCoefficients, PhaseG, ColorScaleBehindWater). The classic BaseColor+Absorption wiring on the default output node no longer compiles. The engine's own `Water_Material` leaves MP_BaseColor/MP_Normal disconnected; our material compiled with them connected (tolerated).
4. Panner type error: TextureSample.RGB (float3) → Panner.Coordinate is illegal. **Correct wiring: Panner OUTPUT → TextureSample.UVs input.**
5. `MaterialExpressionConstant3Vector` color lives in property **`constant`** (LinearColor object), not flat r/g/b/a.
**Rule:** 5.8 SLW materials → use the SLW output node with physical coefficients; camelCase property keys everywhere; when deviating from the standard pattern, inspect the engine's `Water_Material` graph first (`get_expressions` + `get_expression_inputs` on its SLW node).

## [2026-08-05] MaterialTools.create_parameter_collection EXISTS (cache was incomplete)

**What I did:** Assumed no MPC create-tool existed and used AssetTools.duplicate + empty-then-fill.
**What happened:** Later `describe_toolset` on MaterialTools revealed `create_parameter_collection` (folder_path + asset_name). The old SCHEMAS.md summary was incomplete.
**Fix:** Prefer `describe_toolset` over trusting cached summaries for toolsets with create-capabilities. Duplicate-trick remains the fallback for classes without any create-tool (Niagara, structs/enums as assets).
**Rule:** Verify toolset inventories on first use of a toolset; treat cached summaries as hints, not complete schemas.

## [2026-08-05] MPC parameter arrays via ObjectTools.set_properties: empty-then-fill

**What I did:** Created `MPC_WaterState` by duplicating an existing MPC (`QMPC_GlobalFoliageActor`), then set `ScalarParameters`/`VectorParameters` via `set_properties` on the asset instance.
**What happened:** Two sequential failures:
1. Values with the `{"array": [...]}` wrapper (the FWeightedBlendables pattern from 2026-07-23) → `the following properties could not be set: ScalarParameters, VectorParameters`.
2. Plain-list form on a NON-empty array → `ArrayRemove: elements changed alongside the size change; removed elements are ambiguous`.
**Fix:** Top-level TArray properties take a **plain JSON list** (the `{"array":...}` wrapper is only for arrays nested inside structs). To replace an existing array wholesale: FIRST set it to `[]` (removal of all elements is unambiguous), THEN set the new elements (append is unambiguous). Omitting the `id` field is fine — UE auto-generates per-parameter GUIDs.
**Rule:** MPC parameter arrays via set_properties = empty-then-fill, plain lists, no ids. MPC creation path: duplicate any existing MPC asset, then rewrite arrays (no create-asset tool exists in ObjectTools/AssetTools).

A timeout with bytes received usually means the response arrived but the SSE connection stayed open; parse the output. A timeout with zero bytes indicates a likely modal-popup lock. Use up to 120 seconds for complex operations.

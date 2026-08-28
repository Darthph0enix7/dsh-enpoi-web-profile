# Plane Project Management Protocol — Mistakes & Anti-Patterns Log

Known anti-patterns, protocol traps, and runtime errors encountered when driving Plane Community Edition (CE v1.4.0) via FastMCP and REST. Review before executing non-trivial operations.

---

## [2026-08-07] FastMCP Pydantic Validation Rejects Undeclared Kwargs (e.g. `reason`)

**What I did:** Called `plane_list_projects(per_page=10, reason="Find project ID")` or `plane_get_me(reason="check auth")`.
**What happened:** FastMCP threw a Pydantic validation error: `1 validation error for call[list_projects]: reason Unexpected keyword argument [type=unexpected_keyword_argument]`.
**Why:** FastMCP parses tool signatures strictly against Python function type annotations. Unlike some LLM tool bridges that tolerate or strip arbitrary metadata parameters like `reason`, FastMCP rejects any parameter not explicitly declared in the Python function signature.
**Fix:** Strip all metadata or undeclared arguments. Only pass parameters defined in the tool's schema.
**Rule:** Check `SCHEMAS.md` before calling any MCP tool. Pass ONLY schema-declared arguments. Never pass `reason`, `client_id`, or `workspace_slug`.

---

## [2026-08-07] `state_id` vs `state` in Work Item Creation and Mutation

**What I did:** Called `create_work_item(project_id=..., name=..., state_id=sid)` assuming standard relational naming.
**What happened:** Plane's API silently ignored `state_id`, assigning the default triage/backlog state or returning a validation error.
**Why:** Plane's internal Django DRF `IssueSerializer` validates the foreign key field named `state`, not `state_id`.
**Fix:** Always pass `state="<UUID>"`.
**Rule:** When mutating or creating work items, the state field is strictly `state`. Never write `state_id`.

---

## [2026-08-07] Passing String Names instead of State UUIDs

**What I did:** Called `create_work_item(project_id=pid, name="Task", state="Done")` or `state="Backlog"`.
**What happened:** Request failed with a 400 Bad Request or invalid UUID syntax error.
**Why:** Plane stores workflow states as independent database rows with unique UUIDs per project. `"Done"` is a display label, not an ID.
**Fix:** Always call `list_states(project_id=pid)` first. Search the returned list for `name.lower() == "done"` or `group == "completed"`, extract `state["id"]`, and pass `state=state["id"]`.
**Rule:** Never guess state UUIDs. Always run dynamic state resolution via `list_states`.

---

## [2026-08-07] S3 Presigned URLs (`download_url`) Expire and Are Host-Bound

**What I did:** Extracted `download_url` from `get_work_item_attachment_download_url` and embedded it into page HTML as `<img src="...">`.
**What happened:** The image rendered locally for 60 minutes, then broke permanently with `403 AccessDenied`. Furthermore, other devices on the Tailscale network immediately received `403 SignatureDoesNotMatch` because the S3 signature was computed for `127.0.0.1:8099`.
**Why:** Plane's MinIO backend signs presigned GET URLs with a 3600-second expiration and strictly binds the AWS SigV4 signature to the internal request Host header.
**Fix:** Use the permanent media proxy endpoint on port `8222`: `https://serverlocal.pike-acrux.ts.net:8222/media/<asset_key>`. Both `list_work_item_attachments` and `get_work_item_attachment_download_url` return this stable URL in the `public_url` field.
**Rule:** NEVER embed `download_url` into documentation or markdown. ALWAYS embed `public_url`.

---

## [2026-08-07] Omitting `project_id` on Plane CE v1.4.0 Work Item & Page Queries

**What I did:** Called `list_work_items()` without a `project_id` expecting a workspace-wide work item list.
**What happened:** Received `404 Not Found`.
**Why:** Plane CE v1.4.0 does not implement workspace-level work item endpoints (`/api/v1/workspaces/<slug>/work-items/`). All work items and pages are strictly scoped to individual projects (`/api/v1/workspaces/<slug>/projects/<project_id>/work-items/`).
**Fix:** Always supply `project_id`. If querying across projects, call `list_projects()` first and iterate over the active project UUIDs.
**Rule:** `project_id` is mandatory for all work item and page operations on CE v1.4.0.

---

## [2026-08-07] Page Deletion Without Prior Archival (400 Bad Request)

**What I did:** Issued `DELETE /api/workspaces/<slug>/projects/<project_id>/pages/<page_id>/`.
**What happened:** Received `400 Bad Request: {"error": "The page should be archived before deleting"}`.
**Why:** Plane CE requires pages to be placed in an archived state before the database allows a hard deletion.
**Fix:** Call the archive endpoint (`POST .../pages/<page_id>/archive/`) first, then issue the `DELETE`. The patched MCP `delete_page` tool handles this two-step sequence automatically.
**Rule:** When deleting pages via raw REST, always archive before issuing `DELETE`.

---

## [2026-08-07] Calling Commercial / Enterprise v3-Only Tools

**What I did:** Called `list_milestones()`, `list_work_item_types()`, `create_initiative()`, or `list_work_logs()`.
**What happened:** Received `404 Not Found` or `402 Payment Required`.
**Why:** These features are part of Plane Commercial Edition / Cloud Pro tier and do not exist in the Community Edition v1.4.0 backend.
**Fix:** Use standard Work Items, Labels, Modules, and Cycles instead:
- For Milestones / Initiatives: Create a top-level parent Work Item (Epic) and attach sub-tasks via `parent="<uuid>"`.
- For Time Tracking: Use work item comments or Progress Journal page entries.
- For Types / Custom Fields: Use standard labels and rich description HTML.
**Rule:** Strictly adhere to the CE v1.4.0 Working Tool Reference in `SCHEMAS.md`. Never call v3-only tools.

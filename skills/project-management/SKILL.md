---
name: project-management
description: "Plane — document, journal, backlog, and archive Adam's projects: create projects, update pages, manage to-dos, attach media. Use when he wants to document or update something in Plane, log progress or a session, save screenshots/media, create a project, archive a stale project, or manage the backlog."
---

# Plane Project Management & Narrative Ledger Protocol

## 0. Philosophy & Division of Labor

Plane is Adam's living human-facing narrative and verification ledger for all personal, academic, and professional projects (simulations, engines, web apps, agents, 3D art, and experiments).

### The Core Boundary
- **Plane = The Human-Facing Experience & Narrative Ledger**: The overarching vision, human-readable explanations, high-level architecture thoughts, detailed session journals, design trade-offs, real media/screenshots (viewports, gameplay captures, UI tests, render comparisons), and backlog triage.
- **GitHub = The Technical Implementation Detail**: Source code, commits, pull requests, CI/CD configs, diffs, and low-level code implementation. **Always link the GitHub repository in Plane — never dump raw code or giant diffs into Plane pages.**
- **Comprehensive & Detailed Documentation Standard**: Write thorough, rich, narrative documentation. Do NOT write shallow 2-sentence summaries. Capture the history of what was thought, tested, decided, and discovered at each milestone so Adam can look back months later and immediately understand the full context.
- **Evidence & Real Media Only**: Media must be 100% real — screenshots of the actual running application, Blender viewports, Unreal Engine PIE captures, or terminal recordings. **Never fabricate media, progress, or fake URLs.**

---

## 1. Network Topology & Access Layer

```
                     ┌────────────────────────────────────────────────────────┐
                     │                  Client / Agent Device                 │
                     │         (Server, Mac, Main PC, Hermes Gateway)         │
                     └───────────────┬────────────────────────┬───────────────┘
                                     │                        │
                      MCP Protocol (JSON-RPC)       REST / Media / Direct
                                     │                        │
                                     ▼                        ▼
        ┌────────────────────────────────────────┐   ┌────────────────────────────────────────┐
        │        Tailscale MCP Endpoint          │   │        Tailscale Media Proxy           │
        │ https://serverlocal.pike-acrux.ts.net  │   │ https://serverlocal.pike-acrux.ts.net  │
        │                 :8212                  │   │                 :8222                  │
        │      (Header Auth via Bearer Token)    │   │      (Permanent Public-on-Tailnet)     │
        └────────────────────┬───────────────────┘   └────────────────────┬───────────────────┘
                             │                                            │
                             ▼                                            ▼
        ┌────────────────────────────────────────┐   ┌────────────────────────────────────────┐
        │     plane-mcp.service (FastMCP)        │   │       plane-media-proxy.service        │
        │            127.0.0.1:8211              │   │             127.0.0.1:8221             │
        └────────────────────┬───────────────────┘   └────────────────────┬───────────────────┘
                             │                                            │
                             ▼                                            ▼
                     ┌────────────────────────────────────────────────────────┐
                     │               Plane CE v1.4.0 Stack                    │
                     │  Web/Caddy: 127.0.0.1:8099 (https://plane.enpoi.vip)   │
                     │  REST API:  127.0.0.1:8199 (:8219 over Tailscale)      │
                     │  Storage:   MinIO (Bucket: 'uploads')                  │
                     └────────────────────────────────────────────────────────┘
```

### Endpoints & Credentials
| Service | Address | Authentication | Purpose |
|---|---|---|---|
| **Plane Web UI (Canonical)** | `https://plane.enpoi.vip/` | User Session (email+password) | Web browser access (Cloudflare Tunnel) |
| **Plane Web UI (Tailnet)** | `https://serverlocal.pike-acrux.ts.net:8443/` | User Session (email+password) | Direct Tailscale alias |
| **FastMCP Server** | `https://serverlocal.pike-acrux.ts.net:8212/http/api-key/mcp` | `Authorization: Bearer <API_KEY>`<br>`X-Workspace-slug: main_base` | Primary AI Agent MCP interface (all devices) |
| **Media Proxy** | `https://serverlocal.pike-acrux.ts.net:8222/media/<asset_key>` | None (Tailnet boundary) | Permanent, non-expiring media URLs for page `<img>`/`<video>` |
| **REST API (Tailnet)** | `https://serverlocal.pike-acrux.ts.net:8219/api/v1/` | `x-api-key: <API_KEY>` | Fallback REST for Hermes & external scripts |
| **REST API (Host Loopback)**| `http://127.0.0.1:8199/api/v1/` | `x-api-key: <API_KEY>` | Server-local script / curl access |

- **Workspace Slug**: ALWAYS `main_base`.
- **Primary API Key**: `plane_api_75727b9e357a41c8b8a67cb5d2fe7c2a` (Stored in `~/.config/opencode/plane-api-key`).
- **Fallback API Key**: `plane_api_f8a93c529c66492b9cd3fdb9b380010a` (Stored in `~/.local/share/plane-mcp/plane-mcp.env`).

---

## 2. Plane CE v1.4.0 Protocol & Strict Execution Rules

The server runs **Plane Community Edition (CE v1.4.0)**. Follow these strict rules to avoid runtime errors:

### Rule 1: Zero Undeclared Kwargs (FastMCP Pydantic Trap)
FastMCP strictly validates tool arguments against Pydantic models. **NEVER pass undeclared kwargs such as `reason`, `workspace_slug`, `extra_params`, or `client_id` to any MCP tool.**
- ❌ **BAD**: `plane_list_projects(per_page=10, reason="find projects")` → `1 validation error: Unexpected keyword argument 'reason'`
- ✅ **GOOD**: `plane_list_projects(per_page=10)`

### Rule 2: `state` vs `state_id` (Work Items)
In `create_work_item` and `update_work_item`, the argument for assigning a state is named **`state`**, NOT `state_id`.
- ❌ **BAD**: `create_work_item(project_id=pid, name=title, state_id=sid)` → State is silently ignored or rejected!
- ✅ **GOOD**: `create_work_item(project_id=pid, name=title, state=sid)`

### Rule 3: Dynamic State UUID Lookup
State names like `"Backlog"`, `"In Progress"`, or `"Done"` cannot be passed as raw strings. You must resolve their UUID:
1. Call `list_states(project_id=project_id)`.
2. Inspect the returned list: each state has `id`, `name`, `group`, and `color`.
3. Match `name` (e.g. `"Backlog"`) or `group` (`"backlog"`, `"unstarted"`, `"started"`, `"completed"`, `"cancelled"`).
4. Pass `state=matched_state["id"]`.

### Rule 4: Mandatory `project_id` (Project-Scoped CE Architecture)
On Plane CE v1.4.0, Work Items, Pages, States, Cycles, Modules, and Labels are strictly project-scoped.
- **NEVER** omit `project_id` when calling `list_work_items`, `create_page`, `list_pages`, `retrieve_page`, `update_page`, or `delete_page`.
- Calling `list_work_items(project_id=None)` or `list_pages(project_id=None)` calls non-existent workspace-level endpoints and returns `404 Not Found`.

### Rule 5: Work Item Counting on CE
Plane CE lacks a native `/count/` endpoint.
- Calling `count_work_items()` without a `project_id` returns 404.
- To count items accurately, call `list_work_items(project_id=project_id, per_page=1)` and read `total_count` from the response payload.

### Rule 6: Epics & Hierarchical Work Items (Parent-Child)
Plane CE does not have native commercial "Initiatives" or custom type-hierarchy engines.
- **Epics** are standard top-level Work Items representing major capability milestones.
- To make a work item a child of an epic or parent task, pass `parent="<parent_work_item_uuid>"` when creating or updating.
- To query children of an epic: `list_work_items(project_id=pid, pql='parent = "<parent_uuid>"')`.

---

## 3. Media Ingestion & Permanent URL Embedding Pipeline

### The S3 Presigned URL Trap
When you call `get_work_item_attachment_download_url`, Plane returns an S3 presigned URL signed for `127.0.0.1:8099`.
- **Trap 1**: It is host-bound (sending a request with a Tailscale Host header returns `403 SignatureDoesNotMatch`).
- **Trap 2**: It expires after 1 hour (breaking all page embeds permanently).
- **CRITICAL RULE**: **NEVER** put `download_url` into page HTML (`<img src="...">`) or markdown!

### The Solution: Stable Tailscale Media Proxy
The server runs `plane-media-proxy.service` on port `8222`. It streams assets directly from MinIO using server-side credentials with permanent, non-expiring cache lifetimes:
```
https://serverlocal.pike-acrux.ts.net:8222/media/<asset_key>
```

### Media Attachment & Embedding Flow

```
   1. Ingestion
      ├─ Local file on host:
      │    Run CLI: plane-media attach-work-item <project_id> <work_item_id> <file_path>...
      └─ URL accessible asset (GitHub, raw media):
           Call MCP: upload_work_item_attachment_from_url(project_id, work_item_id, url, name)

   2. URL Resolution
      ├─ MCP Tool: list_work_item_attachments(project_id, work_item_id)
      ├─ MCP Tool: get_work_item_attachment_download_url(project_id, work_item_id, attachment_id)
      └─ Both tools return the permanent URL in the "public_url" field.

   3. Rich Page Embedding
      ├─ Image: <img src="https://serverlocal.pike-acrux.ts.net:8222/media/<key>" alt="Description" style="max-width:100%; border-radius:8px; margin:12px 0;" />
      ├─ Video: <video src="https://serverlocal.pike-acrux.ts.net:8222/media/<key>" controls style="max-width:100%; border-radius:8px; margin:12px 0;"></video>
      └─ File Link: <a href="https://serverlocal.pike-acrux.ts.net:8222/media/<key>" target="_blank">Download Asset</a>
```

---

## 4. Standard Operating Procedures (SOPs)

### SOP 1: Locating or Onboarding a Project
1. **Search & Check Existence**:
   Call `list_projects(per_page=100)`. Iterate through `results` matching by `name` or `identifier`.
2. **If Creating a New Project**:
   Call `create_project(name="Project Name", identifier="PRJ", description="Human vision pitch...", emoji="🚀")`.
   *Identifier rules*: 2 to 5 uppercase alphanumeric characters (e.g. `SAF`, `RWP`, `KLUG`).
3. **Resolve Default States**:
   Call `list_states(project_id=project.id)`. Cache the UUIDs for `backlog`, `unstarted` (Todo), `started` (In Progress), `completed` (Done), and `cancelled`.

### SOP 2: Comprehensive Project Page Authoring
Every project should maintain structured, rich pages created via `create_page(project_id, name, description_html)` or updated via `update_page(project_id, page_id, name, description_html)`:

1. **`README — Vision & Current State`**:
   - **The Pitch**: One clear, compelling paragraph explaining what the project is and why it exists.
   - **The Vision & User Experience**: What does the finished experience look and feel like?
   - **Current State & Capabilities**: What is working right now? What has been proven?
   - **Technical Truth & Repositories**: Links to the GitHub / GitLab repository.
2. **`Progress Journal & Milestones`**:
   - Chronological log of major milestones.
   - Narrative of what was built, challenges faced, breakthroughs, and visual evidence.
3. **`Key Decisions & Trade-Offs`**:
   - Record why specific architectures, tools, or approaches were chosen or abandoned.

### SOP 3: Session Journaling & Progress Logging
At the end of an active coding/design session:
1. Locate the project and query existing pages via `list_pages(project_id=project_id)`.
2. If `Progress Journal` exists, call `retrieve_page` to get the existing `description_html`, append the new dated entry with `<section>` / `<h3>` formatting, and call `update_page`.
3. If no journal page exists, call `create_page` with name `"Progress Journal"` and formatted HTML content.
4. Record:
   - **Date & Goal**: e.g., `2026-08-14 — River Water Shaders & Collision System`
   - **What Was Built & Proven**: Exact components completed.
   - **Key Decisions Made**: Technical or design choices locked in.
   - **Embedded Media**: Screenshots/videos attached to work items and embedded using their `public_url`.
   - **Immediate Next Steps**: Next actionable priorities.

### SOP 4: Backlog Triage & Work Item Tracking
1. **Adding Backlog Items**:
   - Call `create_work_item`:
     - `project_id`: project UUID
     - `name`: Crisp, actionable one-line summary (e.g. `"Tune river sheet opacity and depth fade by eye"`)
     - `state`: UUID of the `backlog` or `unstarted` state
     - `priority`: `"urgent"`, `"high"`, `"medium"`, `"low"`, or `"none"`
     - `description_html`: Detailed acceptance criteria and technical notes.
2. **Completing Items**:
   - Call `update_work_item(project_id=pid, work_item_id=wid, state=completed_state_id)`.
3. **Organizing Epics**:
   - Create parent item (e.g. `"Epic: Water Rendering Foundation"`).
   - Create sub-tasks with `parent=epic_id`.

### SOP 5: Global Workspace Search
To find anything across all projects, work items, pages, modules, or cycles in one call:
- Call `search_workspace(query="water shader")`.
- Inspect returned categories: `projects`, `issues`, `pages`, `modules`, `cycles`.

---

## 5. Working Tool Reference Matrix

| Tool Name | Scope | CE v1.4 Status | Required Parameters | Purpose |
|---|---|---|---|---|
| `list_projects` | Workspace | ✅ Native | `per_page` (opt), `cursor` (opt) | Enumerate all projects |
| `retrieve_project` | Workspace | ✅ Native | `project_id` | Get full project details |
| `create_project` | Workspace | ✅ Native | `name`, `identifier`, `description` (opt), `emoji` (opt) | Create project |
| `update_project` | Workspace | ✅ Native | `project_id` | Update project metadata |
| `delete_project` | Workspace | ✅ Native | `project_id` | Delete project |
| `list_states` | Project | ✅ Native | `project_id` | Get state UUIDs & groups |
| `list_work_items` | Project | ✅ Native | `project_id`, `pql` (opt), `per_page` (opt) | List work items (PQL supported) |
| `retrieve_work_item` | Project | ✅ Native | `project_id`, `work_item_id` | Get work item details |
| `retrieve_work_item_by_identifier` | Global | ✅ Native | `work_item_identifier` (e.g. `"SAF-12"`) | Lookup item by human tag |
| `create_work_item` | Project | ✅ Native | `project_id`, `name`, `state` (UUID), `priority` (opt), `parent` (opt) | Create task/item |
| `update_work_item` | Project | ✅ Native | `project_id`, `work_item_id`, `state` (opt), `name` (opt) | Update task state/fields |
| `delete_work_item` | Project | ✅ Native | `project_id`, `work_item_id` | Delete task |
| `list_pages` | Project | ⚡ Patched CE | `project_id` | List all project pages |
| `retrieve_page` | Project | ⚡ Patched CE | `project_id`, `page_id` | Get page HTML content |
| `create_page` | Project | ⚡ Patched CE | `project_id`, `name`, `description_html` | Create project wiki/doc page |
| `update_page` | Project | ⚡ Patched CE | `project_id`, `page_id`, `name` (opt), `description_html` (opt) | Update page content |
| `delete_page` | Project | ⚡ Patched CE | `project_id`, `page_id` | Archive & delete page |
| `list_work_item_attachments` | Project | ⚡ Enhanced | `project_id`, `work_item_id` | List files with `public_url` |
| `get_work_item_attachment_download_url` | Project | ⚡ Enhanced | `project_id`, `work_item_id`, `attachment_id` | Get `public_url` & download |
| `upload_work_item_attachment_from_url` | Project | ✅ Native | `project_id`, `work_item_id`, `url`, `name` (opt) | Attach file from public URL |
| `delete_work_item_attachment` | Project | ✅ Native | `project_id`, `work_item_id`, `attachment_id` | Remove attachment |
| `list_labels` / `create_label` | Project | ✅ Native | `project_id`, `name`, `color` | Manage labels |
| `list_work_item_comments` / `create_work_item_comment` | Project | ✅ Native | `project_id`, `work_item_id`, `comment_html` | Task discussions & logs |
| `list_work_item_links` / `create_work_item_link` | Project | ✅ Native | `project_id`, `work_item_id`, `url` | Link external repos / docs |
| `list_cycles` / `create_cycle` | Project | ✅ Native | `project_id`, `name`, `owned_by` | Sprints & iterations |
| `list_modules` / `create_module` | Project | ✅ Native | `project_id`, `name` | Feature modules |
| `search_workspace` | Workspace | ⚡ Patched CE | `query` | Cross-entity global search |
| `list_drafts` / `create_draft` / `convert_draft` | Workspace | ⚡ Patched CE | `project_id`, `name`, `draft_id` | Draft work item lifecycle |

---

## 6. Known Unsupported v3-Only Tools (Do NOT Call on CE)

The following tools target Plane Commercial v3 / Enterprise endpoints and will return `HTTP 404` or `402` on this CE v1.4.0 server. **Do NOT call them:**
- ❌ **Milestones**: `list_milestones`, `create_milestone`, `update_milestone`, `delete_milestone`
- ❌ **Custom Properties**: `list_work_item_properties`, `set_work_item_property_value`, `create_work_item_property`
- ❌ **Work Item Types**: `list_work_item_types`, `create_work_item_type`, `resolve_work_item_type`
- ❌ **Time Tracking / Work Logs**: `list_work_logs`, `create_work_log`, `get_project_worklog_summary`
- ❌ **Custom Roles**: `list_roles`, `retrieve_role`
- ❌ **Native Initiatives**: `list_initiatives`, `create_initiative`
- ❌ **Custom Relation Definitions**: `list_work_item_relation_definitions`, `create_work_item_relation_definition`

---

## 7. CLI Fallback Utilities (When MCP Is Inconvenient)

| Utility | Location | Command Examples |
|---|---|---|
| **`plane-media`** | `~/.local/share/plane-mcp/plane-media` | `plane-media attach-work-item <project_id> <work_item_id> <file1> <file2>`<br>Prints `public_url` for every uploaded asset. |
| **`plane-page`** | `~/.local/share/plane-mcp/plane-page` | `plane-page create <project_id> "Page Title" /path/to/content.html`<br>`plane-page update <project_id> <page_id> "New Title" /path/to/content.html`<br>`plane-page retrieve <project_id> <page_id>`<br>`plane-page delete <project_id> <page_id>`<br>`plane-page list <project_id>` |

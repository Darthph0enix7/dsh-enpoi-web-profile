# Plane CE v1.4.0 Working Tool Schemas & Payload Reference

This document defines the exact tool signatures, parameter types, and payload templates for all verified Plane CE v1.4.0 MCP tools and REST endpoints.

---

## 1. Projects (`plane_mcp/tools/projects.py`)

### `list_projects`
Enumerates all projects in the workspace.
- **Parameters**:
  - `per_page` *(int, optional)*: Results per page (1-1000, default 100).
  - `cursor` *(str, optional)*: Pagination cursor.
  - `order_by` *(str, optional)*: Sort field (e.g. `"-created_at"`).
- **Return Shape**:
  ```json
  {
    "total_count": 2,
    "results": [
      {
        "id": "19e22b0a-9377-4845-a1ef-73ed67a52bb0",
        "identifier": "SAF",
        "name": "SAFERWATER — Interactive Dam Simulation",
        "emoji": "🌊",
        "description": "Interactive 3D simulation..."
      }
    ]
  }
  ```

### `create_project`
Creates a new project.
- **Parameters**:
  - `name` *(str, required)*: Display name.
  - `identifier` *(str, required)*: 2 to 5 uppercase alphanumeric characters (e.g. `"SAF"`, `"RWP"`).
  - `description` *(str, optional)*: High-level narrative pitch.
  - `emoji` *(str, optional)*: Single emoji character (e.g. `"🌊"`).

### `retrieve_project`
- **Parameters**: `project_id` *(str, required)*.

### `update_project`
- **Parameters**: `project_id` *(str, required)*, `name` *(str, opt)*, `description` *(str, opt)*, `emoji` *(str, opt)*.

### `delete_project`
- **Parameters**: `project_id` *(str, required)*.

---

## 2. States (`plane_mcp/tools/states.py`)

### `list_states`
Returns all workflow states for a given project. **Always call this before creating work items.**
- **Parameters**: `project_id` *(str, required)*.
- **Return Shape**:
  ```json
  [
    { "id": "2b042f71-08cf-4998-821c-4007a85df229", "name": "Backlog", "group": "backlog", "color": "#A3A3A3" },
    { "id": "1a042f71-08cf-4998-821c-4007a85df228", "name": "Todo", "group": "unstarted", "color": "#3B82F6" },
    { "id": "4c042f71-08cf-4998-821c-4007a85df227", "name": "In Progress", "group": "started", "color": "#F59E0B" },
    { "id": "5d042f71-08cf-4998-821c-4007a85df226", "name": "Done", "group": "completed", "color": "#10B981" },
    { "id": "6e042f71-08cf-4998-821c-4007a85df225", "name": "Cancelled", "group": "cancelled", "color": "#EF4444" }
  ]
  ```

---

## 3. Work Items (`plane_mcp/tools/work_items.py`)

### `list_work_items`
Lists work items inside a project.
- **Parameters**:
  - `project_id` *(str, required)*: Target project UUID. (Mandatory on CE!)
  - `pql` *(str, optional)*: Plane Query Language filter (e.g. `'state.group IN ["started", "unstarted"]'`).
  - `order_by` *(str, optional)*: Sort field (e.g. `"-created_at"`).
  - `per_page` *(int, optional)*: Results per page (1-100, default 25).
  - `cursor` *(str, optional)*: Cursor string.
  - `expand` *(str, optional)*: Comma-separated relations (e.g. `"state,labels,assignees"`).
  - `fields` *(str, optional)*: Sparse fieldset.

### `retrieve_work_item`
- **Parameters**: `project_id` *(str, required)*, `work_item_id` *(str, required)*.

### `retrieve_work_item_by_identifier`
- **Parameters**: `work_item_identifier` *(str, required)*: Format `"PROJ-12"`.

### `create_work_item`
Creates a work item task.
- **Parameters**:
  - `project_id` *(str, required)*: Target project UUID.
  - `name` *(str, required)*: Actionable task title.
  - `state` *(str, required)*: Target state UUID (NOT name, NOT `state_id`).
  - `priority` *(str, optional)*: `"urgent"`, `"high"`, `"medium"`, `"low"`, `"none"`.
  - `labels` *(list[str], optional)*: Array of label UUIDs.
  - `parent` *(str, optional)*: Parent work item UUID (for sub-tasks / Epic nesting).
  - `description_html` *(str, optional)*: Rich HTML description.
  - `start_date` *(str, optional)*: ISO date `"YYYY-MM-DD"`.
  - `target_date` *(str, optional)*: ISO date `"YYYY-MM-DD"`.

### `update_work_item`
- **Parameters**:
  - `project_id` *(str, required)*.
  - `work_item_id` *(str, required)*.
  - `name` *(str, optional)*.
  - `state` *(str, optional)*: New state UUID.
  - `priority` *(str, optional)*.
  - `labels` *(list[str], optional)*.
  - `parent` *(str, optional)*.
  - `description_html` *(str, optional)*.

### `delete_work_item`
- **Parameters**: `project_id` *(str, required)*, `work_item_id` *(str, required)*.

---

## 4. Pages (`plane_mcp/tools/pages.py` & `pages_ce.py`)

*Note: All page operations on CE v1.4.0 automatically bridge through the authenticated server session.*

### `list_pages`
- **Parameters**: `project_id` *(str, required)*.
- **Return Shape**: Array of page objects with `id`, `name`, `created_at`, `updated_at`.

### `retrieve_page`
- **Parameters**: `project_id` *(str, required)*, `page_id` *(str, required)*.
- **Return Shape**: Full page object including `description_html`.

### `create_page`
- **Parameters**:
  - `project_id` *(str, required)*: Project UUID.
  - `name` *(str, required)*: Page title (e.g. `"README — Vision & Current State"`).
  - `description_html` *(str, required)*: HTML-formatted content.
  - `access` *(int, optional)*: Access level (default 0).
  - `color` *(str, optional)*: Hex color code.
  - `is_locked` *(bool, optional)*.

### `update_page`
- **Parameters**:
  - `project_id` *(str, required)*.
  - `page_id` *(str, required)*.
  - `name` *(str, optional)*.
  - `description_html` *(str, optional)*.
  - `access` *(int, optional)*.
  - `color` *(str, optional)*.
  - `is_locked` *(bool, optional)*.

### `delete_page`
- **Parameters**: `project_id` *(str, required)*, `page_id` *(str, required)*.
- *Behavior*: Archives the page first, then executes deletion.

---

## 5. Attachments & Media Proxy (`plane_mcp/tools/work_item_attachments.py`)

### `list_work_item_attachments`
Lists all files attached to a work item, including their permanent media URLs.
- **Parameters**: `project_id` *(str, required)*, `work_item_id` *(str, required)*.
- **Return Shape**:
  ```json
  [
    {
      "id": "a8fa5693-8f1f-4af4-ba00-afeab71f12bd",
      "name": "waterfall_viewport_test.png",
      "size": 1056851,
      "content_type": "image/png",
      "asset": "19e22b0a-9377-4845-a1ef-73ed67a52bb0/3f82b...-waterfall_viewport_test.png",
      "public_url": "https://serverlocal.pike-acrux.ts.net:8222/media/19e22b0a-9377-4845-a1ef-73ed67a52bb0/3f82b...-waterfall_viewport_test.png"
    }
  ]
  ```

### `get_work_item_attachment_download_url`
- **Parameters**: `project_id` *(str, required)*, `work_item_id` *(str, required)*, `attachment_id` *(str, required)*.
- **Return Shape**:
  ```json
  {
    "attachment_id": "a8fa5693-8f1f-4af4-ba00-afeab71f12bd",
    "name": "waterfall_viewport_test.png",
    "public_url": "https://serverlocal.pike-acrux.ts.net:8222/media/<asset_key>",
    "download_url": "http://127.0.0.1:8099/uploads/..."
  }
  ```
  *Rule*: Always use `public_url` for embedding into page HTML. Never use `download_url`.

### `upload_work_item_attachment_from_url`
Downloads a file from a public URL server-side and attaches it to the work item.
- **Parameters**:
  - `project_id` *(str, required)*.
  - `work_item_id` *(str, required)*.
  - `url` *(str, required)*: Direct image / video / asset URL.
  - `name` *(str, optional)*: Target filename override.

### `delete_work_item_attachment`
- **Parameters**: `project_id` *(str, required)*, `work_item_id` *(str, required)*, `attachment_id` *(str, required)*.

---

## 6. Global Search & Drafts (`plane_mcp/tools/ce_extra.py`)

### `search_workspace`
Executes full-text cross-entity search across the entire workspace.
- **Parameters**: `query` *(str, required)*.
- **Return Shape**: Dictionary with keys `projects`, `issues`, `pages`, `modules`, `cycles`.

### `search_work_items`
- **Parameters**: `query` *(str, required)*.

### `list_drafts`
- **Parameters**: None.

### `create_draft`
- **Parameters**: `project_id` *(str, required)*, `name` *(str, required)*, `description_html` *(str, opt)*, `priority` *(str, opt)*.

### `convert_draft`
- **Parameters**: `draft_id` *(str, required)*.

---

## 7. Comments, Links, & Labels

### `list_work_item_comments` / `create_work_item_comment`
- `create_work_item_comment(project_id, work_item_id, comment_html)`

### `list_work_item_links` / `create_work_item_link` / `delete_work_item_link`
- `create_work_item_link(project_id, work_item_id, url)`

### `list_labels` / `create_label` / `delete_label`
- `create_label(project_id, name, color)` *(color is hex, e.g. `"#3B82F6"`)*

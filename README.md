# NyaMath

Engineering sheet in the browser: formulas, plots and programs (React + TypeScript + Vite).

Write math as you would on paper — `x := 5`, `f(x) := sin(x)`, `Z_c_abs =` — and get
live results, auto-plots, full 2D/3D graphs, program blocks (`if`/`for`/`while`),
ODE/FDTD simulations, and units (`10 GHz`, `23 mm`, `207 ohm`) on an infinite canvas.

## Quickstart

```bash
npm install
npm run dev      # сайт (vite) + MCP-сервис с live-шиной (:3777) в одном терминале
npm run dev:site # только сайт, без сервиса
npm run build    # type-check + production build → dist/
npm run lint     # oxlint
```

`npm run dev` сначала собирает `mcp/dist`, затем поднимает MCP-сервис
(`--port=$NYAMATH_PORT`, по умолчанию `3777`) рядом с vite: агент через
stdio и приложение через *View → Live sync* видят один документ в реалтайме.

## Features

- **Math blocks** in Mathcad style: `:=` definitions, trailing `=` output, `j` as the
  imaginary unit, matrices, ranges (`1..10`), lenient error messages (RU/EN).
- **Evaluation strictly top-to-bottom** (by `y`), with dependencies and cycle detection.
- **Plots**: multi-series 2D (`;`-separated), polar/bar/stem traces, contour and 3D
  surfaces/point clouds, PNG/CSV export.
- **Program blocks** with step debugger, **simulations** (RK4/RK45/TR-BDF2, events, FDTD waves).
- **Units** via mathjs (`m/s`, `GHz`, `mm`, `ohm`, `degC`…), custom units via `defunit`.
- **Serverless sharing**: *File → Share link* packs the sheet into a URL fragment
  (`#d=…`, slim tuples → phrase dictionary → deflate-raw → base64url, `&lang=` included);
  pristine examples share as tiny `#t=ex20` links. No backend involved.
- **Project files**: save/open JSON, print/PDF, undo/redo, themes, RU/EN interface.

## MCP server (agent control)

Full agent control over a NyaMath document: blocks, solutions, scope,
plot data, positions and sizes, files. Same engine and format as the web app
(`mathjs`, `:=`, `j`, matrices, programs, top-to-bottom recalculation).

### Install & build

```bash
cd mcp
npm install
npm run build    # → dist/index.js (single file, node)
npm test         # smoke test via a real MCP client (20 checks)
```

### Run

```bash
node dist/index.js                  # stdio, default document ./nyamath-doc.json
NYAMATH_DOC=/path/to/doc.json node dist/index.js
```

### Connect to opencode

In `opencode.json` / `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nyamath": {
      "type": "local",
      "command": ["node", "<repo>/mcp/dist/index.js"],
      "environment": {
        "NYAMATH_DOC": "<repo>/nyamath-doc.json"
      },
      "enabled": true
    }
  }
}
```

After that, `use nyamath` is available in prompts and the tools are
visible to the agent next to the built-in ones. The file the agent edits can
be opened in the app (same JSON format; the app picks up positions, sizes,
formulas and programs).

### Claude Desktop

```json
{
  "mcpServers": {
    "nyamath": {
      "command": "node",
      "args": ["<repo>/mcp/dist/index.js"],
      "env": { "NYAMATH_DOC": "<repo>/nyamath-doc.json" }
    }
  }
}
```

### Tools (17)

| Tool | What it does |
|---|---|
| `nya_status` | Document state: block count, errors, scope variable count, file path |
| `nya_list_blocks` | Block list (`kind` filter, `limit`/`offset`) |
| `nya_get_block` | Full block: result, LaTeX, dependencies, auto-plot preview meta |
| `nya_add_block` | New block (`math`/`text`/`plot`/`plot3d`/`program`/`slider` + fields) |
| `nya_update_block` | Edit content / plotFn / range / exportName |
| `nya_move_block` / `nya_move_blocks` | Positions (affect evaluation order!) |
| `nya_resize_block` | Manual size `w`/`h` |
| `nya_remove_block` / `nya_clear` | Removal (clear requires `confirm: true`) |
| `nya_evaluate` | Evaluate an expression in the live scope (read-only) |
| `nya_get_scope` | All variables → values (solution check) |
| `nya_get_plot_data` | Point series of a 2D plot or auto-plot (`max_points`, downsampling) |
| `nya_get_plot3d_data` | Surface grid / points of a 3D block (`max_points`, downsampling) |
| `nya_open` / `nya_save` | Project file (validation, migration) |
| `nya_load_example` | `variant20` (electrodynamics) or `advanced` (matrices/programs) |
| `nya_recalc` | Force recalculation |

Resource `nya://document` — JSON summary of the document.

### Typical agent scenarios

- "Solve variant 20 and check `eps_check`": `nya_load_example{variant20}` → `nya_get_scope`.
- "Plot it": `nya_add_block{kind: plot, plotFn: "sin(x); cos(x/2)"}` → `nya_get_plot_data{id}` → analyze points.
- "What's this error?": `nya_status` → `nya_get_block{id}` → `nya_update_block` / `nya_move_block` (reordering fixes use-before-def).
- "Continue the calculation and keep it": `nya_open{path}` → edits → `nya_save{}` → open the file in the app.

### Realtime sync (agent ↔ UI live)

By default the MCP server only speaks stdio and the web app keeps its own
document — a JSON file is the only bridge. For live collaboration, run the
server as the single source of truth:

```bash
NYAMATH_PORT=3777 node mcp/dist/index.js   # or: node mcp/dist/index.js --port=3777
```

This enables a dependency-free HTTP layer next to stdio:

| Endpoint      | What it does                                              |
|---------------|-----------------------------------------------------------|
| `GET /events` | SSE stream — `snapshot` frames on every document change   |
| `POST /push`  | UI pushes its document `{blocks: [...]}` (validated)      |
| `GET /snapshot` | Current `{rev, blocks}` (slim, no plot previews)        |
| `GET /status` | `{rev, blocks, docPath}`                                  |

In the app: *View → Live sync* (or the status dot in the toolbar), enter the
service URL once. After that:

- every agent tool call recalculates and broadcasts → the canvas updates live;
- every local edit is debounced and POSTed back → the agent sees it in scope;
- echo is suppressed by content comparison; conflicts resolve last-writer-wins
  by monotonic `rev` (remote snapshots don't pollute undo history).

`npm test` in `mcp/` covers both stdio (`smoke.mjs`, 20 checks) and the sync
layer (`sync.mjs`: push/validation/snapshot/SSE).

### Notes

- Evaluation order is strictly top-to-bottom by `y`, same as in the app: put definitions above their uses.
- Complex numbers: `j`, `Re()`/`Im()` functions; matrices `[1, 2; 3, 4]`; ranges `1..10`.
- `nya_evaluate` does not mutate the document; use `nya_add_block` for new quantities.
- Trim large point arrays via `max_points` (stride downsampling).

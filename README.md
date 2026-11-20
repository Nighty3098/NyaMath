# NyaMath

Engineering sheet in the browser: formulas, plots and programs (React + TypeScript + Vite).

Write math as you would on paper — `x := 5`, `f(x) := sin(x)`, `Z_c_abs =` — and get
live results, auto-plots, full 2D/3D graphs, program blocks (`if`/`for`/`while`),
ODE/FDTD simulations, and units (`10 GHz`, `23 mm`, `207 ohm`) on an infinite canvas.

## Quickstart

```bash
npm install
npm run dev      # site (vite) + MCP service with a live bus (:3777) in one terminal
npm run dev:site # site only, without the service
npm run build    # type-check + production build → dist/
npm run lint     # oxlint
```

## Desktop app (Electron)

```bash
npm run electron:dev   # desktop app with Vite hot reload
npm run electron:linux # Linux: AppImage + deb
npm run electron:mac   # macOS: dmg + zip
npm run electron:win   # Windows: NSIS installer
```

Run `npm run electron:all` for all three targets locally (macOS packaging requires
macOS). GitHub Actions builds Linux, macOS, and Windows artifacts on native runners
when changes are pushed to `main` or when the workflow is triggered manually
(`workflow_dispatch`). Each run publishes a GitHub release using the name and
version from `package.json`, with `banner.png` in the release notes. Pushes with
the same version replace the assets in the existing release.
Local artifacts are written to `release/`; CI artifacts are available from the
Actions run. macOS uses the native application menu; Windows and Linux use the
React menu bar and its custom minimize, maximize/restore, and close controls
instead of the native window frame.

`npm run dev` first builds `mcp/dist`, then starts the MCP service
(`--port=$NYAMATH_PORT`, default `3777`) alongside Vite: the agent over stdio
and the app via _View → Live sync_ see the same document in real time.

## Features

- **Math blocks** in worksheet style: `:=` definitions, trailing `=` output, `j` as the
  imaginary unit, exact symbolic output with `→` and decimal approximation with
  `→ float,n`, matrices, ranges (`1..10`), lenient error messages (RU/EN).
- **Evaluation strictly top-to-bottom** (by `y`), with dependencies and cycle detection.
- **Plots**: multi-series 2D (`;`-separated), polar/bar/stem traces, contour and 3D
  surfaces/point clouds, PNG/CSV export.
- **Program blocks** with step debugger, **simulations** (RK4/RK45/TR-BDF2, events, FDTD waves).
- **Units** via mathjs (`m/s`, `GHz`, `mm`, `ohm`, `degC`…), custom units via `defunit`.
- **Probability & statistics**: normal (`normpdf`/`normcdf`/`normQuant` with μ and σ),
  Laplace `Phi0`/`invPhi0`, uniform, exponential (with shift) and Pareto PDF/CDF/moments;
  the palette includes ready-made formulas and sheet templates for continuous random
  variables, tail probabilities and normal tolerances.
- **Scientific precision**: _View → Calculation precision_ selects IEEE-754 or
  document-level arbitrary-precision BigNumber arithmetic (34–1100 digit presets).
  The engine keeps guard digits through iterative calculations; output can be formatted
  to 1000 digits separately under _View → Number format_. High-precision trigonometry
  uses software argument reduction; `zeta(n)` supports
  integer `n ≥ 2`, and `Gamma(x)` supports positive integer and half-integer values.
  Exact rational values are available with mathjs `fraction(...)`. The symbolic arrow
  preserves supported exact expressions independently of numeric calculation; unsupported
  functions and units report an error rather than returning a misleading result. `float,n`
  approximates the expression to `n` significant digits. Complex values and numerical
  solvers/simulations still use double precision. Infinite `nsum` uses a recent-term
  numerical tail estimate; general convergence cannot be proved for arbitrary terms, so
  unsupported or inconclusive tails report non-convergence.
- **Serverless sharing**: _File → Share link_ packs the sheet into a URL fragment
  (`#d=…`, slim tuples → phrase dictionary → deflate-raw → base64url, language and
  arbitrary-precision mode included);
  pristine examples share as tiny `#t=ex20` links. No backend involved.
- **Project files**: save/open JSON, print/PDF, undo/redo, themes, RU/EN interface.
- **Import of foreign worksheets**: drop a file anywhere onto the app (or use
  _File → Open_) to import Mathcad `.xmcd`/`.xmcdz` (Mathcad 15 XML / gzip) and
  Prime `.mcdx` (ZIP → `mathcad/worksheet.xml`), plus SMath `.sm` and Calcpad
  `.cpd`/`.txt`. Mathcad expressions are translated to NyaMath syntax (`define → :=`,
  `eval → =`, named function calls, `numsum`/`numprod`/`nint`, matrices, units,
  programs → `for … in …` / `if … else … end`); blocks are snapped to the grid
  and appended below the current sheet. Unsupported regions are reported in notes
  rather than silently dropped. Prime text regions live in XAML packages and are
  skipped with an explicit note.
- **Reference data in SQLite**: constants, materials, formulas, snippets, sim
  presets and SI prefixes live in `public/NyaMath.db` (SQLite, tables:
  `constants`, `materials`, `formulas`, `snippets`, …), read by the app,
  tests and MCP from the same file. Edit data in `db/seed.json`, then
  `npm run seed` to rebuild the DB (`db/schema.sql` is the schema).
  `npm run update-db` refreshes constants (NIST CODATA) and elements, then rebuilds.

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

### Tools (21)

| Tool                                 | What it does                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nya_status`                         | Document state: block count, errors, scope variable count, file path                                                                                                              |
| `nya_list_blocks`                    | Block list (`kind` filter, `limit`/`offset`)                                                                                                                                      |
| `nya_get_block`                      | Full block: result, LaTeX, dependencies, auto-plot preview meta                                                                                                                   |
| `nya_add_block`                      | New block (`math`/`text`/`plot`/`plot3d`/`program`/`slider` + fields)                                                                                                             |
| `nya_update_block`                   | Edit content / plotFn / range / exportName                                                                                                                                        |
| `nya_move_block` / `nya_move_blocks` | Positions (affect evaluation order!)                                                                                                                                              |
| `nya_resize_block`                   | Manual size `w`/`h`                                                                                                                                                               |
| `nya_remove_block` / `nya_clear`     | Removal (clear requires `confirm: true`)                                                                                                                                          |
| `nya_evaluate`                       | Evaluate an expression in the live scope (read-only) + solver-step trace                                                                                                          |
| `nya_get_scope`                      | All variables → values (solution check)                                                                                                                                           |
| `nya_get_plot_data`                  | Point series of a 2D plot or auto-plot (`max_points`, downsampling)                                                                                                               |
| `nya_get_plot3d_data`                | Surface grid / points of a 3D block (`max_points`, downsampling)                                                                                                                  |
| `nya_open` / `nya_save`              | Project file with engine-version header (validation, migration, legacy arrays)                                                                                                    |
| `nya_load_example`                   | `variant20` (electrodynamics) or `advanced` (matrices/programs)                                                                                                                   |
| `nya_recalc`                         | Force recalculation                                                                                                                                                               |
| `nya_sync_pull` / `nya_sync_push`    | Pull the canvas the user sees into this session / push it back live to the browser                                                                                                |
| `nya_diff`                           | Git-friendly slim diff (canonical JSONL + unified hunks vs file/empty)                                                                                                            |
| `nya_import`                         | Import SMath `.sm` (XML/RPN), Calcpad `.cpd`/`.txt` and Mathcad `.xmcd`/`.xmcdz`/`.mcdx` worksheets                                                                             |
| `nya_ask` / `nya_answer`             | Ask the user a question (with optional answer `options`), record the reply. `var` writes the answer into the document scope (`var := answer`, numeric when it parses as a number) |

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

| Endpoint        | What it does                                            |
| --------------- | ------------------------------------------------------- |
| `GET /events`   | SSE stream — `snapshot` frames on every document change |
| `POST /push`    | UI pushes its document `{blocks: [...]}` (validated)    |
| `GET /snapshot` | Current `{rev, blocks}` (slim, no plot previews)        |
| `GET /status`   | `{rev, blocks, docPath}`                                |

In the app: _View → Live sync_ (or the status dot in the toolbar), enter the
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

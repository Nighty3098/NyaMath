# NyaMath MCP server

Full agent control over a NyaMath document: blocks, solutions, scope,
plot data, positions and sizes, files. Same engine and format as the web app
(`mathjs`, `:=`, `j`, matrices, programs, top-to-bottom recalculation).

## Install & build

```bash
cd mcp
npm install
npm run build    # → dist/index.js (single file, node)
npm test         # smoke test via a real MCP client (20 checks)
```

## Run

```bash
node dist/index.js                  # stdio, default document ./nyamath-doc.json
NYAMATH_DOC=/path/to/doc.json node dist/index.js
```

## Connect to opencode

In `opencode.json` / `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nyamath": {
      "type": "local",
      "command": ["node", "/home/nighty/Desktop/NyaMath/mcp/dist/index.js"],
      "environment": {
        "NYAMATH_DOC": "/home/nighty/Desktop/NyaMath/nyamath-doc.json"
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

## Claude Desktop

```json
{
  "mcpServers": {
    "nyamath": {
      "command": "node",
      "args": ["/home/nighty/Desktop/NyaMath/mcp/dist/index.js"],
      "env": { "NYAMATH_DOC": "/home/nighty/Desktop/NyaMath/nyamath-doc.json" }
    }
  }
}
```

## Tools (17)

| Tool | What it does |
|---|---|
| `nya_status` | Document state: block count, errors, scope variable count, file path |
| `nya_list_blocks` | Block list (`kind` filter, `limit`/`offset`) |
| `nya_get_block` | Full block: result, LaTeX, dependencies, auto-plot preview meta |
| `nya_add_block` | New block (`math`/`text`/`plot`/`program` + fields) |
| `nya_update_block` | Edit content / plotFn / range / exportName |
| `nya_move_block` / `nya_move_blocks` | Positions (affect evaluation order!) |
| `nya_resize_block` | Manual size `w`/`h` |
| `nya_remove_block` / `nya_clear` | Removal (clear requires `confirm: true`) |
| `nya_evaluate` | Evaluate an expression in the live scope (read-only) |
| `nya_get_scope` | All variables → values (solution check) |
| `nya_get_plot_data` | Point series of a plot or auto-plot (`max_points`, downsampling) |
| `nya_open` / `nya_save` | Project file (validation, migration) |
| `nya_load_example` | `variant20` (electrodynamics) or `advanced` (matrices/programs) |
| `nya_recalc` | Force recalculation |

Resource `nya://document` — JSON summary of the document.

## Typical agent scenarios

- "Solve variant 20 and check `eps_check`": `nya_load_example{variant20}` → `nya_get_scope`.
- "Plot it": `nya_add_block{kind: plot, plotFn: "sin(x); cos(x/2)"}` → `nya_get_plot_data{id}` → analyze points.
- "What's this error?": `nya_status` → `nya_get_block{id}` → `nya_update_block` / `nya_move_block` (reordering fixes use-before-def).
- "Continue the calculation and keep it": `nya_open{path}` → edits → `nya_save{}` → open the file in the app.

## Notes

- Evaluation order is strictly top-to-bottom by `y`, same as in the app: put definitions above their uses.
- Complex numbers: `j`, `Re()`/`Im()` functions; matrices `[1, 2; 3, 4]`; ranges `1..10`.
- `nya_evaluate` does not mutate the document; use `nya_add_block` for new quantities.
- Trim large point arrays via `max_points` (stride downsampling).

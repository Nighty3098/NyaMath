# Wengineering MCP server

Full agent control over a Wengineering document: blocks, solutions, scope,
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
node dist/index.js                  # stdio, default document ./wengineering-doc.json
WENG_DOC=/path/to/doc.json node dist/index.js
```

## Connect to opencode

In `opencode.json` / `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "wengineering": {
      "type": "local",
      "command": ["node", "/home/nighty/Desktop/Wengineering/mcp/dist/index.js"],
      "environment": {
        "WENG_DOC": "/home/nighty/Desktop/Wengineering/wengineering-doc.json"
      },
      "enabled": true
    }
  }
}
```

After that, `use wengineering` is available in prompts and the tools are
visible to the agent next to the built-in ones. The file the agent edits can
be opened in the app (same JSON format; the app picks up positions, sizes,
formulas and programs).

## Claude Desktop

```json
{
  "mcpServers": {
    "wengineering": {
      "command": "node",
      "args": ["/home/nighty/Desktop/Wengineering/mcp/dist/index.js"],
      "env": { "WENG_DOC": "/home/nighty/Desktop/Wengineering/wengineering-doc.json" }
    }
  }
}
```

## Tools (17)

| Tool | What it does |
|---|---|
| `weng_status` | Document state: block count, errors, scope variable count, file path |
| `weng_list_blocks` | Block list (`kind` filter, `limit`/`offset`) |
| `weng_get_block` | Full block: result, LaTeX, dependencies, auto-plot preview meta |
| `weng_add_block` | New block (`math`/`text`/`plot`/`program` + fields) |
| `weng_update_block` | Edit content / plotFn / range / exportName |
| `weng_move_block` / `weng_move_blocks` | Positions (affect evaluation order!) |
| `weng_resize_block` | Manual size `w`/`h` |
| `weng_remove_block` / `weng_clear` | Removal (clear requires `confirm: true`) |
| `weng_evaluate` | Evaluate an expression in the live scope (read-only) |
| `weng_get_scope` | All variables → values (solution check) |
| `weng_get_plot_data` | Point series of a plot or auto-plot (`max_points`, downsampling) |
| `weng_open` / `weng_save` | Project file (validation, migration) |
| `weng_load_example` | `variant20` (electrodynamics) or `advanced` (matrices/programs) |
| `weng_recalc` | Force recalculation |

Resource `weng://document` — JSON summary of the document.

## Typical agent scenarios

- "Solve variant 20 and check `eps_check`": `weng_load_example{variant20}` → `weng_get_scope`.
- "Plot it": `weng_add_block{kind: plot, plotFn: "sin(x); cos(x/2)"}` → `weng_get_plot_data{id}` → analyze points.
- "What's this error?": `weng_status` → `weng_get_block{id}` → `weng_update_block` / `weng_move_block` (reordering fixes use-before-def).
- "Continue the calculation and keep it": `weng_open{path}` → edits → `weng_save{}` → open the file in the app.

## Notes

- Evaluation order is strictly top-to-bottom by `y`, same as in the app: put definitions above their uses.
- Complex numbers: `j`, `Re()`/`Im()` functions; matrices `[1, 2; 3, 4]`; ranges `1..10`.
- `weng_evaluate` does not mutate the document; use `weng_add_block` for new quantities.
- Trim large point arrays via `max_points` (stride downsampling).

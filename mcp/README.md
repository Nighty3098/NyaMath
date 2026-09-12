# Wengineering MCP server

Полное управление документом Wengineering из агента: блоки, решения, scope,
данные графиков, позиции и размеры, файлы. Тот же движок и формат, что в
веб-приложении (`mathjs`, `:=`, `j`, матрицы, программы, пересчёт сверху-вниз).

## Установка и сборка

```bash
cd mcp
npm install
npm run build    # → dist/index.js (один файл, node)
npm test         # smoke-тест через настоящий MCP-клиент (20 проверок)
```

## Запуск

```bash
node dist/index.js                  # stdio, документ по умолчанию ./wengineering-doc.json
WENG_DOC=/path/to/doc.json node dist/index.js
```

## Подключение к opencode

В `opencode.json` / `opencode.jsonc`:

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

После этого в промптах доступно `use wengineering`, инструменты видны агенту
рядом со встроенными. Файл, который правит агент, открывается в приложении
кнопкой `⇧` (тот же JSON-формат; приложение подхватит позиции, размеры,
формулы и программы).

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

## Инструменты (17)

| Инструмент | Что делает |
|---|---|
| `weng_status` | Блоки, ошибки, число переменных, путь файла |
| `weng_list_blocks` | Список блоков (фильтр `kind`, `limit`/`offset`) |
| `weng_get_block` | Полный блок: результат, LaTeX, зависимости, мета автографика |
| `weng_add_block` | Новый блок (`math`/`text`/`plot`/`program` + поля) |
| `weng_update_block` | Правка текста/функции/диапазона/exportName |
| `weng_move_block` / `weng_move_blocks` | Позиции (влияют на порядок вычислений!) |
| `weng_resize_block` | Ручной размер `w`/`h` |
| `weng_remove_block` / `weng_clear` | Удаление (clear только с `confirm: true`) |
| `weng_evaluate` | Выражение в живом scope (только чтение) |
| `weng_get_scope` | Все переменные → значения (проверка решений) |
| `weng_get_plot_data` | Точки серий графика или автографика (`max_points`, даунсэмплинг) |
| `weng_open` / `weng_save` | Файл проекта (валидация, миграция) |
| `weng_load_example` | `variant20` (электродинамика) или `advanced` (матрицы/программы) |
| `weng_recalc` | Принудительный пересчёт |

Ресурс `weng://document` — JSON-сводка документа.

## Типовые сценарии агента

- «Посчитай вариант 20 и проверь `eps_check`»: `weng_load_example{variant20}` → `weng_get_scope`.
- «Построй график»: `weng_add_block{kind: plot, plotFn: "sin(x); cos(x/2)"}` → `weng_get_plot_data{id}` → анализ точек.
- «Что за ошибка?»: `weng_status` → `weng_get_block{id}` → `weng_update_block` / `weng_move_block` (перестановка чинит use-before-def).
- «Продолжи расчёт с сохранением»: `weng_open{path}` → правки → `weng_save{}` → открыть файл в приложении.

## Замечания

- Порядок вычислений — строго сверху-вниз по `y`, как в приложении: ставьте определения выше использований.
- Комплексные: `j`, функции `Re()`/`Im()`; матрицы `[1, 2; 3, 4]`; диапазоны `1..10`.
- `weng_evaluate` не мутирует документ; для новых величин — `weng_add_block`.
- Большие массивы точек режьте через `max_points` (stride-даунсэмплинг).

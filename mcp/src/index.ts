/**
 * NyaMath MCP server — полное управление документом из агента.
 *
 * Документ: те же блоки, что в веб-приложении (math/text/plot/program),
 * тот же движок (mathjs, :=, j, матрицы, программы), тот же пересчёт сверху-вниз.
 * Агент может: читать решения и scope, строить/править/двигать блоки,
 * забирать данные графиков (серии точек), сохранять/открывать файлы.
 *
 * Transport: stdio. Документ по умолчанию: $NYAMATH_DOC или ./nyamath-doc.json
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ReadResourceResult, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { recalculateAll, type MathBlockData } from '../../src/engine/dependencies.js';
import {
  createBaseScope,
  evaluateLine,
  formatResult,
  valueToLatex,
  type Scope,
} from '../../src/engine/mathEngine.js';
import { samplePlotBlock } from '../../src/engine/plotSample.js';
import { samplePlot3d } from '../../src/engine/plot3dSample.js';
import { startSyncServer } from './syncServer.js';
import { TEST_SCENARIO_LINES } from '../../src/data/testScenario.js';
import { ADVANCED_DEMO } from '../../src/data/demoAdvanced.js';

/* ---------------- состояние документа ---------------- */

let blocks: MathBlockData[] = [];
let docPath: string | null = process.env['NYAMATH_DOC'] ?? process.env['WENG_DOC'] ?? null;
let lastScope: Scope = createBaseScope();
/** Монотонная ревизия документа для realtime-синхронизации (растёт при каждом изменении). */
let rev = 0;
/** Рассылка снапшота подписанным UI-клиентам (null — sync-сервер выключен). */
let broadcastSync: (() => void) | null = null;

function blank(id: string, x: number, y: number, kind: MathBlockData['kind'] = 'math'): MathBlockData {
  return {
    id, x, y, rawInput: '', displayLatex: '', resultStr: '', resultLatex: '',
    resultValue: null, error: null, dependencies: [], definedVar: null,
    isOutput: false, kind, plotPreview: null,
  };
}

/** Пересчёт всего документа сверху-вниз (как в приложении). */
function refresh(): void {
  const { blocks: out, scope } = recalculateAll(blocks);
  blocks = blocks.map((b) => out[b.id] ?? b);
  lastScope = scope;
  rev += 1;
  broadcastSync?.();
}

/** Блоки без пересчитываемых полей — для файла и realtime-рассылки. */
function slimBlocks(): MathBlockData[] {
  return blocks.map((b) => {
    const { plotPreview: _pp, simResult: _sr, ...rest } = b as MathBlockData & {
      simResult?: unknown;
    };
    void _pp;
    void _sr;
    return rest as MathBlockData;
  });
}

function validateBlock(raw: unknown): MathBlockData | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<MathBlockData>;
  if (typeof b['x'] !== 'number' || typeof b['y'] !== 'number' || typeof b['rawInput'] !== 'string') return null;
  const id = typeof b['id'] === 'string' && b['id'] ? b['id'] : uuid();
  const kind: MathBlockData['kind'] =
    b['kind'] === 'plot' || b['kind'] === 'plot3d' || b['kind'] === 'program' || b['kind'] === 'text' || b['kind'] === 'slider' ? b['kind'] : 'math';
  const numOrUndef = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
  return {
    ...blank(id, b['x'], b['y'], kind),
    ...b,
    id, kind,
    resultLatex: b['resultLatex'] ?? '',
    isOutput: b['isOutput'] ?? false,
    plotPreview: null,
    exportName: typeof b['exportName'] === 'string' ? b['exportName'] : undefined,
    plotMode: b['plotMode'] === 'surface' || b['plotMode'] === 'points' || b['plotMode'] === 'matrix' ? b['plotMode'] : undefined,
    plotResolution: numOrUndef(b['plotResolution']),
    plotWireframe: typeof b['plotWireframe'] === 'boolean' ? b['plotWireframe'] : undefined,
    sliderVar: typeof b['sliderVar'] === 'string' ? b['sliderVar'] : undefined,
    sliderMin: numOrUndef(b['sliderMin']),
    sliderMax: numOrUndef(b['sliderMax']),
    sliderStep: numOrUndef(b['sliderStep']),
    sliderVal: numOrUndef(b['sliderVal']),
    w: typeof b['w'] === 'number' && (b['w'] as number) > 0 ? (b['w'] as number) : null,
    h: typeof b['h'] === 'number' && (b['h'] as number) > 0 ? (b['h'] as number) : null,
  };
}

function find(id: string): MathBlockData | null {
  return blocks.find((b) => b.id === id) ?? null;
}

interface BlockSummary {
  id: string;
  kind: string;
  x: number;
  y: number;
  rawInput: string;
  definedVar: string | null;
  dependencies: string[];
  error: string | null;
  result: string;
  hasPlot: boolean;
}

function summarize(b: MathBlockData): BlockSummary {
  return {
    id: b.id,
    kind: b.kind,
    x: b.x,
    y: b.y,
    rawInput: b.rawInput,
    definedVar: b.definedVar,
    dependencies: b.dependencies,
    error: b.error,
    result: b.resultStr,
    hasPlot: b.kind === 'plot' || b.kind === 'plot3d' || !!b.plotPreview,
  };
}

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message }) }], isError: true };
}

/** Прореживание массива точек до maxPoints (равномерно). */
function stride<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints || maxPoints < 2) return arr;
  const step = (arr.length - 1) / (maxPoints - 1);
  const out: T[] = [];
  for (let k = 0; k < maxPoints; k++) out.push(arr[Math.round(k * step)] as T);
  return out;
}

/* ---------------- сервер ---------------- */

const server = new McpServer({ name: 'nyamath', version: '0.1.0' });

server.tool(
  'nya_status',
  'Состояние документа: число блоков, ошибки, число переменных в scope, путь файла',
  {},
  async (): Promise<CallToolResult> => {
    const errors = blocks.filter((b) => b.error).map((b) => ({ id: b.id, rawInput: b.rawInput.split('\n')[0], error: b.error }));
    const vars = Object.keys(lastScope).filter((k) => !['i', 'j'].includes(k));
    return ok({ blocks: blocks.length, errors, errorCount: errors.length, variables: vars.length, docPath });
  },
);

server.tool(
  'nya_list_blocks',
  'Список блоков документа (id, тип, позиция, ввод, переменная, ошибка, результат)',
  {
    kind: z.enum(['math', 'text', 'plot', 'plot3d', 'program', 'slider']).optional().describe('Фильтр по типу'),
    limit: z.number().int().min(1).max(1000).default(200),
    offset: z.number().int().min(0).default(0),
  },
  async ({ kind, limit, offset }): Promise<CallToolResult> => {
    const list = (kind ? blocks.filter((b) => b.kind === kind) : blocks).slice(offset, offset + limit);
    return ok({ total: kind ? blocks.filter((b) => b.kind === kind).length : blocks.length, blocks: list.map(summarize) });
  },
);

server.tool(
  'nya_get_block',
  'Полные данные блока: результат, LaTeX, зависимости, мета превью-графика',
  { id: z.string().describe('ID блока') },
  async ({ id }): Promise<CallToolResult> => {
    const b = find(id);
    if (!b) return fail(`Блок ${id} не найден`);
    const { resultValue: _rv, ...rest } = b;
    void _rv;
    return ok({
      ...rest,
      resultValue: formatResult(b.resultValue),
      plotPreview: b.plotPreview
        ? {
            label: b.plotPreview.label,
            expr: b.plotPreview.expr,
            xmin: b.plotPreview.xmin,
            xmax: b.plotPreview.xmax,
            ymin: b.plotPreview.ymin,
            ymax: b.plotPreview.ymax,
            points: b.plotPreview.ys.filter((v) => typeof v === 'number').length,
          }
        : null,
    });
  },
);

const AddBlockShape = {
  kind: z.enum(['math', 'text', 'plot', 'plot3d', 'program', 'slider']).default('math'),
  x: z.number().default(80),
  y: z.number().default(80),
  rawInput: z.string().default('').describe('Текст блока; для math: "f := 10*10^9", "Z_c_abs =", "f(x) := sin(x)"'),
  plotFn: z.string().optional().describe('Для plot: "sin(x); cos(x/2)", для plot3d: "sin(sqrt(x^2+y^2))", матрица N×3, "X; Y; Z"'),
  plotXmin: z.number().optional(),
  plotXmax: z.number().optional(),
  plotYmin: z.number().optional().describe('Для plot3d: минимум y'),
  plotYmax: z.number().optional().describe('Для plot3d: максимум y'),
  plotMode: z.enum(['auto', 'surface', 'points', 'matrix']).optional().describe('Для plot3d: режим'),
  plotResolution: z.number().int().min(8).max(100).optional().describe('Для plot3d: разрешение сетки'),
  plotWireframe: z.boolean().optional().describe('Для plot3d: каркас поверх поверхности'),
  exportName: z.string().optional().describe('Для program: переменная результата'),
  sliderVar: z.string().optional().describe('Для slider: имя переменной'),
  sliderMin: z.number().optional().describe('Для slider: минимум'),
  sliderMax: z.number().optional().describe('Для slider: максимум'),
  sliderStep: z.number().optional().describe('Для slider: шаг'),
  sliderVal: z.number().optional().describe('Для slider: текущее значение'),
};

server.tool(
  'nya_add_block',
  'Добавить блок в документ (пересчёт автоматический). Возвращает блок с результатом/ошибкой',
  AddBlockShape,
  async (args): Promise<CallToolResult> => {
    const id = uuid();
    const is3d = args.kind === 'plot3d';
    const b: MathBlockData = {
      ...blank(id, args.x, args.y, args.kind),
      rawInput: args.kind === 'plot' ? 'plot' : is3d ? 'plot3d' : args.kind === 'slider' ? 'slider' : args.rawInput,
      plotFn: args.plotFn ?? (args.kind === 'plot' ? args.rawInput || 'sin(x)' : is3d ? args.rawInput || 'sin(sqrt(x^2+y^2))' : undefined),
      plotXmin: args.plotXmin ?? (is3d ? -5 : undefined),
      plotXmax: args.plotXmax ?? (is3d ? 5 : undefined),
      plotYmin: args.plotYmin ?? (is3d ? -5 : undefined),
      plotYmax: args.plotYmax ?? (is3d ? 5 : undefined),
      plotMode: args.plotMode ?? (is3d ? 'auto' : undefined),
      plotResolution: args.plotResolution ?? (is3d ? 48 : undefined),
      plotWireframe: args.plotWireframe ?? (is3d ? false : undefined),
      exportName: args.exportName ?? undefined,
      sliderVar: args.kind === 'slider' ? (args.sliderVar ?? 'k') : undefined,
      sliderMin: args.kind === 'slider' ? (args.sliderMin ?? 0) : undefined,
      sliderMax: args.kind === 'slider' ? (args.sliderMax ?? 10) : undefined,
      sliderStep: args.kind === 'slider' ? (args.sliderStep ?? 0.5) : undefined,
      sliderVal: args.kind === 'slider' ? (args.sliderVal ?? 5) : undefined,
    };
    blocks.push(b);
    refresh();
    return ok(summarize(find(id) as MathBlockData));
  },
);

server.tool(
  'nya_update_block',
  'Изменить содержимое блока (rawInput / plotFn / диапазон / exportName / слайдер). Пересчёт автоматический',
  {
    id: z.string(),
    rawInput: z.string().optional(),
    plotFn: z.string().optional(),
    plotXmin: z.number().optional(),
    plotXmax: z.number().optional(),
    plotYmin: z.number().optional(),
    plotYmax: z.number().optional(),
    plotMode: z.enum(['auto', 'surface', 'points', 'matrix']).optional(),
    plotResolution: z.number().int().min(8).max(100).optional(),
    plotWireframe: z.boolean().optional(),
    exportName: z.string().optional(),
    sliderVar: z.string().optional(),
    sliderMin: z.number().optional(),
    sliderMax: z.number().optional(),
    sliderStep: z.number().optional(),
    sliderVal: z.number().optional(),
  },
  async ({ id, rawInput, plotFn, plotXmin, plotXmax, plotYmin, plotYmax, plotMode, plotResolution, plotWireframe, exportName, sliderVar, sliderMin, sliderMax, sliderStep, sliderVal }): Promise<CallToolResult> => {
    const b = find(id);
    if (!b) return fail(`Блок ${id} не найден`);
    if (rawInput !== undefined) b.rawInput = rawInput;
    if (plotFn !== undefined) b.plotFn = plotFn;
    if (plotXmin !== undefined) b.plotXmin = plotXmin;
    if (plotXmax !== undefined) b.plotXmax = plotXmax;
    if (plotYmin !== undefined) b.plotYmin = plotYmin;
    if (plotYmax !== undefined) b.plotYmax = plotYmax;
    if (plotMode !== undefined) b.plotMode = plotMode;
    if (plotResolution !== undefined) b.plotResolution = plotResolution;
    if (plotWireframe !== undefined) b.plotWireframe = plotWireframe;
    if (exportName !== undefined) b.exportName = exportName;
    if (sliderVar !== undefined) b.sliderVar = sliderVar;
    if (sliderMin !== undefined) b.sliderMin = sliderMin;
    if (sliderMax !== undefined) b.sliderMax = sliderMax;
    if (sliderStep !== undefined) b.sliderStep = sliderStep;
    if (sliderVal !== undefined) b.sliderVal = sliderVal;
    refresh();
    return ok(summarize(find(id) as MathBlockData));
  },
);

server.tool(
  'nya_move_block',
  'Переместить блок (позиция влияет на порядок вычислений сверху-вниз)',
  { id: z.string(), x: z.number(), y: z.number() },
  async ({ id, x, y }): Promise<CallToolResult> => {
    const b = find(id);
    if (!b) return fail(`Блок ${id} не найден`);
    b.x = x;
    b.y = y;
    refresh();
    return ok(summarize(find(id) as MathBlockData));
  },
);

server.tool(
  'nya_move_blocks',
  'Пакетное перемещение нескольких блоков [{id, x, y}]',
  { moves: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })).min(1).max(500) },
  async ({ moves }): Promise<CallToolResult> => {
    const missing = moves.filter((m) => !find(m.id)).map((m) => m.id);
    if (missing.length) return fail(`Не найдены блоки: ${missing.join(', ')}`);
    for (const m of moves) {
      const b = find(m.id) as MathBlockData;
      b.x = m.x;
      b.y = m.y;
    }
    refresh();
    return ok({ moved: moves.length });
  },
);

server.tool(
  'nya_resize_block',
  'Ручной размер блока: w — ширина, h — высота графика (null = авто)',
  { id: z.string(), w: z.number().positive().nullable().optional(), h: z.number().positive().nullable().optional() },
  async ({ id, w, h }): Promise<CallToolResult> => {
    const b = find(id);
    if (!b) return fail(`Блок ${id} не найден`);
    if (w !== undefined) b.w = w;
    if (h !== undefined) b.h = h;
    return ok(summarize(b));
  },
);

server.tool(
  'nya_remove_block',
  'Удалить блок по id',
  { id: z.string() },
  async ({ id }): Promise<CallToolResult> => {
    if (!find(id)) return fail(`Блок ${id} не найден`);
    blocks = blocks.filter((b) => b.id !== id);
    refresh();
    return ok({ removed: id, blocks: blocks.length });
  },
);

server.tool(
  'nya_clear',
  'Очистить документ (требует confirm: true)',
  { confirm: z.boolean().describe('Должно быть true') },
  async ({ confirm }): Promise<CallToolResult> => {
    if (!confirm) return fail('Укажите confirm: true');
    blocks = [];
    refresh();
    return ok({ cleared: true });
  },
);

server.tool(
  'nya_evaluate',
  'Вычислить выражение в текущем scope документа (только чтение, scope не меняется). Пример: "sqrt(Re(Z_c)^2 + Im(Z_c)^2)"',
  { expression: z.string() },
  async ({ expression }): Promise<CallToolResult> => {
    const r = evaluateLine(expression, { ...lastScope });
    if (r.error) return ok({ result: null, formatted: '', latex: '', error: r.error });
    return ok({ result: formatResult(r.value), formatted: formatResult(r.value), latex: valueToLatex(r.value), error: null });
  },
);

server.tool(
  'nya_get_scope',
  'Все переменные документа с вычисленными значениями (имя → значение)',
  {},
  async (): Promise<CallToolResult> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(lastScope)) {
      if (k === 'i' || k === 'j') continue;
      out[k] = typeof v === 'function' ? 'f(x) — функция' : formatResult(v);
    }
    return ok({ variables: out, count: Object.keys(out).length });
  },
);

server.tool(
  'nya_get_plot_data',
  'Данные графика: серии точек [{expr, xs, ys}]. Для plot-блока — его серии; для math-блока с автографиком — превью',
  { id: z.string().describe('ID plot- или math-блока'), max_points: z.number().int().min(8).max(1000).default(120) },
  async ({ id, max_points }): Promise<CallToolResult> => {
    const b = find(id);
    if (!b) return fail(`Блок ${id} не найден`);
    if (b.kind === 'plot') {
      const s = samplePlotBlock(b.plotFn ?? 'sin(x)', lastScope, b.plotXmin ?? -10, b.plotXmax ?? 10);
      if (!s) return fail('Нет данных: проверьте выражения и диапазон');
      return ok({
        kind: 'plot',
        xmin: b.plotXmin ?? -10,
        xmax: b.plotXmax ?? 10,
        ymin: s.ymin,
        ymax: s.ymax,
        series: s.series.map((ser) => ({ expr: ser.expr, indexMode: ser.indexMode, xs: stride(ser.xs, max_points), ys: stride(ser.ys, max_points) })),
      });
    }
    if (!b.plotPreview) return fail('У блока нет автографика (не функция от x)');
    const p = b.plotPreview;
    return ok({
      kind: 'preview',
      label: p.label,
      expr: p.expr,
      xmin: p.xmin,
      xmax: p.xmax,
      ymin: p.ymin,
      ymax: p.ymax,
      xs: stride(p.xs, max_points),
      ys: stride(p.ys, max_points),
    });
  },
);

server.tool(
  'nya_get_plot3d_data',
  'Данные 3D-блока: поверхность {gx, gy, zs} или точки [{x,y,z}] + границы. Для plot3d-блока',
  { id: z.string().describe('ID plot3d-блока'), max_points: z.number().int().min(8).max(4000).default(2500) },
  async ({ id, max_points }): Promise<CallToolResult> => {
    const b = find(id);
    if (!b) return fail(`Блок ${id} не найден`);
    if (b.kind !== 'plot3d') return fail('Блок не plot3d (для 2D используйте nya_get_plot_data)');
    const s = samplePlot3d(b.plotFn ?? 'sin(sqrt(x^2+y^2))', lastScope, {
      xmin: b.plotXmin ?? -5,
      xmax: b.plotXmax ?? 5,
      ymin: b.plotYmin ?? -5,
      ymax: b.plotYmax ?? 5,
      res: b.plotResolution ?? 48,
      mode: b.plotMode ?? 'auto',
    });
    if (!s) return fail('Нет 3D-данных: проверьте выражение и диапазоны');
    if (s.mode === 'points') {
      return ok({
        kind: 'plot3d', mode: 'points', expr: s.expr,
        xmin: s.xmin, xmax: s.xmax, ymin: s.ymin, ymax: s.ymax, zmin: s.zmin, zmax: s.zmax,
        count: s.pts.length, pts: stride(s.pts, max_points),
      });
    }
    // surface: прореживаем сетку до max_points
    const total = s.cols * s.rows;
    const step = total > max_points ? Math.ceil(Math.sqrt(total / max_points)) : 1;
    const gx: number[] = [];
    const gy: number[] = [];
    for (let c = 0; c < s.cols; c += step) gx.push(s.gx[c] as number);
    for (let r = 0; r < s.rows; r += step) gy.push(s.gy[r] as number);
    const zs: (number | null)[][] = [];
    for (let r = 0; r < s.rows; r += step) {
      const row: (number | null)[] = [];
      for (let c = 0; c < s.cols; c += step) row.push(s.zs[r]?.[c] ?? null);
      zs.push(row);
    }
    return ok({
      kind: 'plot3d', mode: 'surface', expr: s.expr,
      xmin: s.xmin, xmax: s.xmax, ymin: s.ymin, ymax: s.ymax, zmin: s.zmin, zmax: s.zmax,
      cols: gx.length, rows: gy.length, gx, gy, zs,
    });
  },
);

server.tool(
  'nya_open',
  'Открыть документ из JSON-файла (формат "Сохранить" приложения)',
  { path: z.string().describe('Путь к .json файлу') },
  async ({ path: p }): Promise<CallToolResult> => {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as unknown;
      if (!Array.isArray(raw)) return fail('Файл не похож на проект (ожидается массив блоков)');
      const rec: MathBlockData[] = [];
      let bad = 0;
      for (const item of raw) {
        const b = validateBlock(item);
        if (b) rec.push(b);
        else bad++;
      }
      if (!rec.length) return fail('В файле нет корректных блоков');
      blocks = rec;
      docPath = p;
      refresh();
      return ok({ ok: true, blocks: blocks.length, skipped: bad, docPath });
    } catch (e) {
      return fail(`Не удалось открыть: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

server.tool(
  'nya_save',
  'Сохранить документ в JSON-файл (тот же формат, что открывает приложение)',
  { path: z.string().optional().describe('По умолчанию — текущий путь или ./nyamath-doc.json') },
  async ({ path: p }): Promise<CallToolResult> => {
    const target = p ?? docPath ?? path.resolve(process.cwd(), 'nyamath-doc.json');
    try {
      const slim = blocks.map((b) => {
        const { plotPreview: _pp, ...rest } = b;
        void _pp;
        return rest;
      });
      fs.writeFileSync(target, JSON.stringify(slim, null, 2), 'utf-8');
      docPath = target;
      return ok({ ok: true, blocks: blocks.length, docPath: target });
    } catch (e) {
      return fail(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

server.tool(
  'nya_load_example',
  'Загрузить встроенный пример: variant20 (электродинамика, 35 строк) или advanced (матрицы, статистика, программы)',
  { name: z.enum(['variant20', 'advanced']) },
  async ({ name }): Promise<CallToolResult> => {
    const rec: MathBlockData[] = [];
    if (name === 'variant20') {
      let y = 60;
      for (const line of TEST_SCENARIO_LINES) {
        const id = uuid();
        rec.push({ ...blank(id, 80, y), rawInput: line, kind: line.startsWith('//') ? 'text' : 'math' });
        y += 64;
      }
    } else {
      let y = 60;
      for (const item of ADVANCED_DEMO) {
        const id = uuid();
        rec.push({ ...blank(id, 80, y), rawInput: item.raw, kind: item.kind, exportName: item.exportName ?? '' });
        y += item.kind === 'program' ? 210 : 64;
      }
    }
    blocks = rec;
    refresh();
    const errs = blocks.filter((b) => b.error).length;
    return ok({ loaded: name, blocks: blocks.length, errors: errs });
  },
);

server.tool(
  'nya_recalc',
  'Принудительный пересчёт всего документа',
  {},
  async (): Promise<CallToolResult> => {
    refresh();
    const errors = blocks.filter((b) => b.error).map((b) => ({ id: b.id, rawInput: b.rawInput.split('\n')[0], error: b.error }));
    return ok({ blocks: blocks.length, errorCount: errors.length, errors });
  },
);

server.resource(
  'document',
  new ResourceTemplate('nya://document', { list: undefined }),
  async (): Promise<ReadResourceResult> => {
    return {
      contents: [
        {
          uri: 'nya://document',
          mimeType: 'application/json',
          text: JSON.stringify({ blocks: blocks.map(summarize), docPath }, null, 2),
        },
      ],
    };
  },
);

async function main(): Promise<void> {
  // Автозагрузка: $NYAMATH_DOC, если файл существует
  if (docPath && fs.existsSync(docPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(docPath, 'utf-8')) as unknown;
      if (Array.isArray(raw)) {
        for (const item of raw) {
          const b = validateBlock(item);
          if (b) blocks.push(b);
        }
        refresh();
      }
    } catch {
      /* стартуем с пустым документом */
    }
  }
  // Realtime-шина: --port 3777 или $NYAMATH_PORT. Работает параллельно со stdio:
  // MCP-инструменты мутируют тот же документ, UI-клиенты получают снапшоты по SSE.
  const portArg = process.argv.find((a) => a.startsWith('--port='));
  const portRaw = portArg?.slice('--port='.length) ?? process.env['NYAMATH_PORT'] ?? '';
  const port = Number(portRaw);
  if (portRaw && Number.isInteger(port) && port >= 0 && port <= 65535) {
    const sync = startSyncServer(port, {
      getSnapshot: () => ({ rev, blocks: slimBlocks() }),
      applyPush: (raw) => {
        if (raw.length > 5000) throw new Error('Слишком много блоков (>5000)');
        const rec: MathBlockData[] = [];
        for (const item of raw) {
          const b = validateBlock(item);
          if (b) rec.push(b);
        }
        if (!rec.length && raw.length > 0) throw new Error('Нет корректных блоков');
        blocks = rec;
        refresh();
        return rev;
      },
      getStatus: () => ({ rev, blocks: blocks.length, docPath }),
    });
    // Важно: в stdout только MCP-протокол, служебное — в stderr.
    console.error(`[nyamath] sync on http://localhost:${sync.port} (SSE /events, POST /push)`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

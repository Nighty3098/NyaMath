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
import './preload.js';
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
import { resetSolverTrace, takeSolverTrace } from '../../src/engine/numeric.js';
import { pullSnapshot, pushSnapshot, resolveSyncUrl, type SyncSnapshot } from './syncClient.js';
import { ENGINE_VERSION } from '../../src/engine/version.js';
import { engineMismatch, parseDocFile, serializeDocFile } from '../../src/lib/docFile.js';
import { slimText, unifiedDiff } from '../../src/lib/slimDiff.js';
import { parseCpd, parseSmXml, type ImportBlock } from '../../src/lib/importDoc.js';
import { startSyncServer } from './syncServer.js';
import {
  canon,
  mergeBlockMaps,
  saneMeta,
  type MetaMap,
  type WireBlock,
} from '../../src/lib/syncCrdt.js';
import { getDemoItems, getDemoLines } from '../../src/lib/db.js';

/* ---------------- состояние документа ---------------- */

let blocks: MathBlockData[] = [];
let docPath: string | null = process.env['NYAMATH_DOC'] ?? process.env['WENG_DOC'] ?? null;
let lastScope: Scope = createBaseScope();
/** Монотонная ревизия документа для realtime-синхронизации (растёт при каждом изменении). */
let rev = 0;
/** Рассылка снапшота подписанным UI-клиентам (null — sync-сервер выключен). */
let broadcastSync: (() => void) | null = null;
/**
 * Базовая ревизия sync-сервиса для bridge-режима (nya_sync_pull/push):
 * rev, на котором основан локальный холст. null — pull ещё не делали,
 * пуш идёт без проверки (last-writer-wins, как раньше).
 */
let syncBaseRev: number | null = null;
/* ---------- CRDT-лайт (per-block LWW + tombstones) ----------
 * serverMeta/serverDeleted — метки текущего документа; syncHistory —
 * последние состояния (rev → блоки+метки) как общие предки для мёржа. */
let serverMeta: MetaMap = {};
let serverDeleted: MetaMap = {};
let syncHistory: Array<{ rev: number; blocks: unknown[]; meta: MetaMap }> = [];
const SYNC_HIST_CAP = 20;

function snapHistory(): void {
  syncHistory.push({ rev, blocks: slimBlocks(), meta: { ...serverMeta } });
  if (syncHistory.length > SYNC_HIST_CAP) syncHistory.shift();
}

function blank(
  id: string,
  x: number,
  y: number,
  kind: MathBlockData['kind'] = 'math',
): MathBlockData {
  return {
    id,
    x,
    y,
    rawInput: '',
    displayLatex: '',
    resultStr: '',
    resultLatex: '',
    resultValue: null,
    error: null,
    dependencies: [],
    definedVar: null,
    isOutput: false,
    kind,
    plotPreview: null,
  };
}

/** Пересчёт всего документа сверху-вниз (как в приложении). */
function refresh(): void {
  // снэпшот «до» — общий предок для будущих CRDT-мёржей
  snapHistory();
  const prev = new Map(slimBlocks().map((b) => [b.id, canon(b)]));
  const { blocks: out, scope } = recalculateAll(blocks);
  blocks = blocks.map((b) => out[b.id] ?? b);
  lastScope = scope;
  // штампуем только изменившиеся блоки: агентские правки получают часы,
  // нетронутые — нет (иначе сервер всегда выигрывал бы конфликты)
  const now = Date.now();
  for (const b of slimBlocks()) {
    if (prev.get(b.id) !== canon(b)) serverMeta[b.id] = { clock: now, actor: 'mcp' };
    if (serverDeleted[b.id]) delete serverDeleted[b.id];
  }
  rev += 1;
  broadcastSync?.();
}

/** Блоки без пересчитываемых полей — для файла и realtime-рассылки. */
function slimBlocks(): MathBlockData[] {
  return blocks.map((b) => {
    const {
      plotPreview: _pp,
      simResult: _sr,
      ...rest
    } = b as MathBlockData & {
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
  if (typeof b['x'] !== 'number' || typeof b['y'] !== 'number' || typeof b['rawInput'] !== 'string')
    return null;
  const id = typeof b['id'] === 'string' && b['id'] ? b['id'] : uuid();
  const kind: MathBlockData['kind'] =
    b['kind'] === 'plot' ||
    b['kind'] === 'plot3d' ||
    b['kind'] === 'program' ||
    b['kind'] === 'text' ||
    b['kind'] === 'slider' ||
    b['kind'] === 'sim' ||
    b['kind'] === 'contour'
      ? b['kind']
      : 'math';
  const numOrUndef = (v: unknown): number | undefined =>
    typeof v === 'number' && isFinite(v) ? v : undefined;
  return {
    ...blank(id, b['x'], b['y'], kind),
    ...b,
    id,
    kind,
    resultLatex: b['resultLatex'] ?? '',
    isOutput: b['isOutput'] ?? false,
    // Как браузерный migrate: всегда boolean, иначе JSON-эхо
    // (slim без disabled vs slim с disabled:false) даёт вечный push-loop.
    disabled: (b as { disabled?: unknown })['disabled'] === true,
    plotPreview: null,
    exportName: typeof b['exportName'] === 'string' ? b['exportName'] : undefined,
    plotMode:
      b['plotMode'] === 'surface' || b['plotMode'] === 'points' || b['plotMode'] === 'matrix'
        ? b['plotMode']
        : undefined,
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
  /** Подстановка значений Calcpad-стиля (`m*a` → `2 * 5`), '' = нет */
  subst: string;
  hasPlot: boolean;
  visualize: { kind: string; expr: string } | null;
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
    subst: b.substStr ?? '',
    hasPlot: b.kind === 'plot' || b.kind === 'plot3d' || !!b.plotPreview,
    visualize: b.visualize ?? null,
  };
}

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message }) }],
    isError: true,
  };
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
    const errors = blocks
      .filter((b) => b.error)
      .map((b) => ({ id: b.id, rawInput: b.rawInput.split('\n')[0], error: b.error }));
    const vars = Object.keys(lastScope).filter((k) => !['i', 'j'].includes(k));
    return ok({
      blocks: blocks.length,
      errors,
      errorCount: errors.length,
      variables: vars.length,
      pendingAsks: pendingAsks.size,
      docPath,
      engine: ENGINE_VERSION,
    });
  },
);

server.tool(
  'nya_list_blocks',
  'Список блоков документа (id, тип, позиция, ввод, переменная, ошибка, результат)',
  {
    kind: z
      .enum(['math', 'text', 'plot', 'plot3d', 'program', 'slider'])
      .optional()
      .describe('Фильтр по типу'),
    limit: z.number().int().min(1).max(1000).default(200),
    offset: z.number().int().min(0).default(0),
  },
  async ({ kind, limit, offset }): Promise<CallToolResult> => {
    const list = (kind ? blocks.filter((b) => b.kind === kind) : blocks).slice(
      offset,
      offset + limit,
    );
    return ok({
      total: kind ? blocks.filter((b) => b.kind === kind).length : blocks.length,
      blocks: list.map(summarize),
    });
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
  rawInput: z
    .string()
    .default('')
    .describe('Текст блока; для math: "f := 10*10^9", "Z_c_abs =", "f(x) := sin(x)"'),
  plotFn: z
    .string()
    .optional()
    .describe(
      'Для plot: "sin(x); cos(x/2)", для plot3d: "sin(sqrt(x^2+y^2))", матрица N×3, "X; Y; Z"',
    ),
  plotXmin: z.number().optional(),
  plotXmax: z.number().optional(),
  plotYmin: z.number().optional().describe('Для plot3d: минимум y'),
  plotYmax: z.number().optional().describe('Для plot3d: максимум y'),
  plotMode: z
    .enum(['auto', 'surface', 'points', 'matrix'])
    .optional()
    .describe('Для plot3d: режим'),
  plotResolution: z
    .number()
    .int()
    .min(8)
    .max(100)
    .optional()
    .describe('Для plot3d: разрешение сетки'),
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
      rawInput:
        args.kind === 'plot'
          ? 'plot'
          : is3d
            ? 'plot3d'
            : args.kind === 'slider'
              ? 'slider'
              : args.rawInput,
      plotFn:
        args.plotFn ??
        (args.kind === 'plot'
          ? args.rawInput || 'sin(x)'
          : is3d
            ? args.rawInput || 'sin(sqrt(x^2+y^2))'
            : undefined),
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
  async ({
    id,
    rawInput,
    plotFn,
    plotXmin,
    plotXmax,
    plotYmin,
    plotYmax,
    plotMode,
    plotResolution,
    plotWireframe,
    exportName,
    sliderVar,
    sliderMin,
    sliderMax,
    sliderStep,
    sliderVal,
  }): Promise<CallToolResult> => {
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
  {
    moves: z
      .array(z.object({ id: z.string(), x: z.number(), y: z.number() }))
      .min(1)
      .max(500),
  },
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
  {
    id: z.string(),
    w: z.number().positive().nullable().optional(),
    h: z.number().positive().nullable().optional(),
  },
  async ({ id, w, h }): Promise<CallToolResult> => {
    const b = find(id);
    if (!b) return fail(`Блок ${id} не найден`);
    if (w !== undefined) b.w = w;
    if (h !== undefined) b.h = h;
    // Размер не влияет на расчёт, но это изменение документа:
    // bump rev + рассылка, иначе Live-клиент его не увидит.
    rev += 1;
    broadcastSync?.();
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
  'Вычислить выражение в текущем scope документа (только чтение, scope не меняется). Возвращает trace шагов решателей. Пример: "sqrt(Re(Z_c)^2 + Im(Z_c)^2)"',
  { expression: z.string() },
  async ({ expression }): Promise<CallToolResult> => {
    const scope = { ...lastScope };
    resetSolverTrace(scope);
    const r = evaluateLine(expression, scope);
    // шаговый лог решателей — агент видит итерации бесплатно (ответ Symbolab)
    const trace = takeSolverTrace(scope);
    if (r.error) return ok({ result: null, formatted: '', latex: '', error: r.error, trace });
    return ok({
      result: formatResult(r.value),
      formatted: formatResult(r.value),
      latex: valueToLatex(r.value),
      error: null,
      trace,
    });
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

/* ---------------- диалог с пользователем ---------------- */

interface PendingAsk {
  id: string;
  question: string;
  options: string[] | null;
  var: string | null;
  resolved: boolean;
}

/** Зарегистрированные вопросы к пользователю (лимит 50). */
const pendingAsks = new Map<string, PendingAsk>();

server.tool(
  'nya_ask',
  'Задать вопрос пользователю (варианты ответа или свободный текст). Вопрос только регистрируется — ' +
    'покажите его человеку и верните ответ через nya_answer. Ответ можно записать в переменную документа (var)',
  {
    question: z.string().min(1).describe('Вопрос пользователю'),
    options: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(20)
      .optional()
      .describe('Варианты ответа (если выбранного ответа нет — свободный текст)'),
    var: z
      .string()
      .regex(/^[A-Za-z_]\w*$/)
      .optional()
      .describe('Имя переменной, в которую записать ответ (var := ответ)'),
  },
  async ({ question, options, var: varName }): Promise<CallToolResult> => {
    if (pendingAsks.size >= 50)
      return fail('Слишком много необработанных вопросов — ответьте на них через nya_answer');
    let id = `ask-${uuid().slice(0, 8)}`;
    while (pendingAsks.has(id)) id = `ask-${uuid().slice(0, 8)}`;
    const ask: PendingAsk = {
      id,
      question,
      options: options?.length ? options : null,
      var: varName ?? null,
      resolved: false,
    };
    pendingAsks.set(ask.id, ask);
    return ok({
      ok: true,
      kind: 'ask',
      id: ask.id,
      question: ask.question,
      options: ask.options,
      var: ask.var,
      hint: 'Покажите вопрос пользователю; ответ верните вызовом nya_answer с этим id.',
    });
  },
);

server.tool(
  'nya_answer',
  'Вернуть ответ пользователя на вопрос, зарегистрированный nya_ask. Если вопрос был с вариантами — ответ должен совпасть (или быть номером варианта). ' +
    'При наличии var ответ сохраняется в документе (var := значение)',
  { id: z.string().describe('ID из nya_ask'), answer: z.string().describe('Ответ пользователя') },
  async ({ id, answer }): Promise<CallToolResult> => {
    const ask = pendingAsks.get(id);
    if (!ask) return fail(`Вопрос ${id} не найден или уже обработан`);
    if (ask.options) {
      const byIndex = /^[1-9]\d*$/.test(answer) ? ask.options[Number(answer) - 1] : undefined;
      if (byIndex === undefined && !ask.options.includes(answer)) {
        return fail(`Ответ должен быть одним из: ${ask.options.join(' / ')}`);
      }
    }
    if (ask.var) {
      const val = /^[+-]?(\d+([.,]\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(answer.trim())
        ? Number(answer.replace(',', '.'))
        : answer;
      const literal = typeof val === 'number' ? String(val) : JSON.stringify(answer);
      const id2 = uuid();
      const y = blocks.length ? Math.max(...blocks.map((b) => b.y)) + 64 : 60;
      blocks.push({ ...blank(id2, 80, y), rawInput: `${ask.var} := ${literal}` });
    }
    ask.resolved = true;
    pendingAsks.delete(id);
    refresh();
    const val = pendingScopeGet(ask.var);
    return ok({
      ok: true,
      id: ask.id,
      question: ask.question,
      answer,
      var: ask.var ? { name: ask.var, value: val } : null,
    });
  },
);

function pendingScopeGet(name: string | null): string | null {
  if (!name) return null;
  const v = lastScope[name];
  if (v === undefined) return null;
  return typeof v === 'function' ? 'f(x) — функция' : formatResult(v);
}

server.tool(
  'nya_get_plot_data',
  'Данные графика: серии точек [{expr, xs, ys}]. Для plot-блока — его серии; для math-блока с автографиком — превью',
  {
    id: z.string().describe('ID plot- или math-блока'),
    max_points: z.number().int().min(8).max(1000).default(120),
  },
  async ({ id, max_points }): Promise<CallToolResult> => {
    const b = find(id);
    if (!b) return fail(`Блок ${id} не найден`);
    if (b.kind === 'plot') {
      const s = samplePlotBlock(
        b.plotFn ?? 'sin(x)',
        lastScope,
        b.plotXmin ?? -10,
        b.plotXmax ?? 10,
      );
      if (!s) return fail('Нет данных: проверьте выражения и диапазон');
      return ok({
        kind: 'plot',
        xmin: b.plotXmin ?? -10,
        xmax: b.plotXmax ?? 10,
        ymin: s.ymin,
        ymax: s.ymax,
        series: s.series.map((ser) => ({
          expr: ser.expr,
          indexMode: ser.indexMode,
          xs: stride(ser.xs, max_points),
          ys: stride(ser.ys, max_points),
        })),
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
  {
    id: z.string().describe('ID plot3d-блока'),
    max_points: z.number().int().min(8).max(4000).default(2500),
  },
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
        kind: 'plot3d',
        mode: 'points',
        expr: s.expr,
        xmin: s.xmin,
        xmax: s.xmax,
        ymin: s.ymin,
        ymax: s.ymax,
        zmin: s.zmin,
        zmax: s.zmax,
        count: s.pts.length,
        pts: stride(s.pts, max_points),
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
      kind: 'plot3d',
      mode: 'surface',
      expr: s.expr,
      xmin: s.xmin,
      xmax: s.xmax,
      ymin: s.ymin,
      ymax: s.ymax,
      zmin: s.zmin,
      zmax: s.zmax,
      cols: gx.length,
      rows: gy.length,
      gx,
      gy,
      zs,
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
      let parsed;
      try {
        parsed = parseDocFile(raw);
      } catch {
        return fail('Файл не похож на проект (ожидается массив блоков или {engine, blocks})');
      }
      const rec: MathBlockData[] = [];
      let bad = 0;
      for (const item of parsed.blocks) {
        const b = validateBlock(item);
        if (b) rec.push(b);
        else bad++;
      }
      if (!rec.length) return fail('В файле нет корректных блоков');
      blocks = rec;
      docPath = p;
      refresh();
      const mismatch = engineMismatch(parsed.engine);
      return ok({
        ok: true,
        blocks: blocks.length,
        skipped: bad,
        docPath,
        engine: parsed.engine,
        legacy: parsed.legacy,
        engineMismatch: mismatch,
      });
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
        const {
          plotPreview: _pp,
          simResult: _sr,
          ...rest
        } = b as MathBlockData & {
          simResult?: unknown;
        };
        void _pp;
        void _sr;
        return rest;
      });
      fs.writeFileSync(target, JSON.stringify(serializeDocFile(slim), null, 2), 'utf-8');
      docPath = target;
      return ok({ ok: true, blocks: blocks.length, docPath: target, engine: ENGINE_VERSION });
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
      for (const line of getDemoLines('variant20')) {
        const id = uuid();
        rec.push({
          ...blank(id, 80, y),
          rawInput: line,
          kind: line.startsWith('//') ? 'text' : 'math',
        });
        y += 64;
      }
    } else {
      let y = 60;
      for (const item of getDemoItems('advanced')) {
        const id = uuid();
        rec.push({
          ...blank(id, 80, y),
          rawInput: item.raw,
          kind: item.kind,
          exportName: item.exportName ?? '',
        });
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
    const errors = blocks
      .filter((b) => b.error)
      .map((b) => ({ id: b.id, rawInput: b.rawInput.split('\n')[0], error: b.error }));
    return ok({ blocks: blocks.length, errorCount: errors.length, errors });
  },
);

server.tool(
  'nya_sync_pull',
  'Забрать холст с sync-сервиса (то, что видит пользователь в браузере) в эту сессию. Заменяет блоки, пересчёт автоматический',
  {
    url: z
      .string()
      .optional()
      .describe('Sync-сервис (по умолчанию NYAMATH_SYNC_URL или http://localhost:3777)'),
  },
  async ({ url }): Promise<CallToolResult> => {
    let base: string;
    try {
      base = resolveSyncUrl(url);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    let snap: SyncSnapshot;
    try {
      snap = await pullSnapshot(base);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    const rec: MathBlockData[] = [];
    let bad = 0;
    for (const item of snap.blocks) {
      const b = validateBlock(item);
      if (b) rec.push(b);
      else bad++;
    }
    blocks = rec;
    refresh();
    syncBaseRev = typeof snap.rev === 'number' ? snap.rev : null;
    const errs = blocks.filter((b) => b.error).length;
    return ok({
      ok: true,
      url: base,
      rev: snap.rev,
      blocks: blocks.length,
      skipped: bad,
      errors: errs,
    });
  },
);

server.tool(
  'nya_sync_push',
  'Отправить холст этой сессии на sync-сервис — пользователь мгновенно увидит изменения в браузере (там пересчёт + рассылка)',
  {
    url: z
      .string()
      .optional()
      .describe('Sync-сервис (по умолчанию NYAMATH_SYNC_URL или http://localhost:3777)'),
    force: z
      .boolean()
      .optional()
      .describe(
        'true — перезаписать даже при конфликте ревизий (по умолчанию пуш отклоняется, если холст на сервисе новее pull)',
      ),
  },
  async ({ url, force }): Promise<CallToolResult> => {
    let base: string;
    try {
      base = resolveSyncUrl(url);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    try {
      const rev = await pushSnapshot(
        base,
        slimBlocks(),
        force ? undefined : (syncBaseRev ?? undefined),
      );
      syncBaseRev = rev;
      return ok({ ok: true, url: base, rev, blocks: blocks.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Конфликт optimistic concurrency: сервер новее нашего pull —
      // не затираем молча, просим pull + повтор.
      if (/CONFLICT|baseRev/i.test(msg)) {
        return fail(
          `${msg}. Сделайте nya_sync_pull и повторите правку поверх свежего холста (или push с force:true).`,
        );
      }
      return fail(msg);
    }
  },
);

server.tool(
  'nya_diff',
  'Git-friendly diff документа: канонический slim-текст (блок = строка) + unified diff против файла или пустого',
  {
    against: z
      .enum(['file', 'empty'])
      .default('file')
      .describe('С чем сравнить: file — сохранённый файл, empty — весь документ как добавления'),
    path: z.string().optional().describe('Файл для сравнения (по умолчанию текущий docPath)'),
  },
  async ({ against, path: p }): Promise<CallToolResult> => {
    const cur = slimText(blocks);
    if (against === 'empty') {
      const d = unifiedDiff([], cur);
      return ok({
        base: 'empty',
        current: `${blocks.length} blocks`,
        additions: d.additions,
        deletions: d.deletions,
        truncated: d.truncated,
        diff: d.text || '(no changes)',
      });
    }
    const target = p ?? docPath;
    if (!target) return fail('Нет файла для сравнения: укажите path или сохраните документ');
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(target, 'utf-8'));
    } catch (e) {
      return fail(`Не могу прочитать ${target}: ${e instanceof Error ? e.message : String(e)}`);
    }
    let parsed;
    try {
      parsed = parseDocFile(raw);
    } catch {
      return fail(`Файл ${target} не похож на проект`);
    }
    const rec: MathBlockData[] = [];
    for (const item of parsed.blocks) {
      const b = validateBlock(item);
      if (b) rec.push(b);
    }
    const d = unifiedDiff(slimText(rec), cur);
    return ok({
      base: target,
      engine: parsed.engine,
      baseBlocks: rec.length,
      currentBlocks: blocks.length,
      additions: d.additions,
      deletions: d.deletions,
      truncated: d.truncated,
      diff: d.text || '(no changes)',
    });
  },
);

/** ImportBlock → полные блоки документа (многострочный текст режем построчно). */
function importBlocks(items: ImportBlock[], y0: number, dy: number): MathBlockData[] {
  const rec: MathBlockData[] = [];
  let k = 0;
  const place = (): { x: number; y: number } => ({ x: 80, y: y0 + k++ * dy });
  for (const ib of items) {
    if (ib.kind === 'text' && ib.body.includes('\n')) {
      for (const line of ib.body.split('\n')) {
        const id = uuid();
        const p = place();
        rec.push({ ...blank(id, ib.x || p.x, p.y), kind: 'text', rawInput: line });
      }
      continue;
    }
    const id = uuid();
    const p = place();
    if (ib.kind === 'math') {
      rec.push({ ...blank(id, ib.x || p.x, p.y), kind: 'math', rawInput: ib.body });
    } else if (ib.kind === 'text') {
      rec.push({ ...blank(id, ib.x || p.x, p.y), kind: 'text', rawInput: ib.body });
    } else if (ib.kind === 'plot') {
      rec.push({
        ...blank(id, ib.x || p.x, p.y),
        kind: 'plot',
        rawInput: 'plot',
        plotFn: ib.body,
        plotXmin: ib.plotXmin ?? -10,
        plotXmax: ib.plotXmax ?? 10,
      });
    } else {
      rec.push({
        ...blank(id, ib.x || p.x, p.y),
        kind: 'contour',
        rawInput: 'contour',
        plotFn: ib.body,
        plotXmin: ib.plotXmin ?? -5,
        plotXmax: ib.plotXmax ?? 5,
        plotYmin: ib.plotYmin ?? -5,
        plotYmax: ib.plotYmax ?? 5,
        plotResolution: 48,
      });
    }
  }
  return rec;
}

server.tool(
  'nya_import',
  'Импорт чужого листа: SMath .sm (XML/RPN) или Calcpad .cpd/.txt. Блоки дописываются ниже, отчёт — в notes',
  {
    path: z.string().describe('Путь к .sm/.cpd/.txt файлу'),
    format: z.enum(['auto', 'sm', 'cpd']).default('auto').describe('Формат (auto — по расширению)'),
    y0: z.number().optional().describe('Верх вставки (по умолчанию — ниже всех блоков)'),
    dy: z.number().int().min(24).max(500).default(72).describe('Шаг по Y между блоками'),
  },
  async ({ path: p, format, y0, dy }): Promise<CallToolResult> => {
    let text: string;
    try {
      const st = fs.statSync(p);
      if (st.size > 1024 * 1024) return fail('Файл больше 1 МБ — импорт не поддерживается');
      text = fs.readFileSync(p, 'utf-8');
    } catch (e) {
      return fail(`Не могу прочитать ${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (text.startsWith('PK\x03\x04'))
      return fail('.smz (zip) не поддерживается — распакуйте в .sm');
    const ext = path.extname(p).toLowerCase();
    const fmt = format === 'auto' ? (ext === '.sm' ? 'sm' : 'cpd') : format;
    const parsed = fmt === 'sm' ? parseSmXml(text) : parseCpd(text);
    if (!parsed.blocks.length) {
      return fail(`Нечего импортировать: ${parsed.notes.join('; ') || 'пустой файл'}`);
    }
    if (parsed.blocks.length > 500)
      return fail(`Слишком много блоков (${parsed.blocks.length} > 500)`);
    const startY = y0 ?? (blocks.length ? Math.max(...blocks.map((b) => b.y)) + 72 : 60);
    const rec = importBlocks(parsed.blocks, startY, dy);
    blocks.push(...rec);
    refresh();
    let errors = 0;
    for (const b of rec) {
      if (find(b.id)?.error) errors++;
    }
    return ok({
      imported: rec.length,
      errors,
      notes: parsed.notes,
      format: parsed.format,
      y0: startY,
      hint: errors
        ? 'Часть блоков с ошибками — проверьте nya_get_block по первым строкам'
        : undefined,
    });
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
  // NyaMath.db уже открыт в preload.ts (первый импорт выше).
  // Автозагрузка: $NYAMATH_DOC, если файл существует (новый формат с header и legacy-массив)
  if (docPath && fs.existsSync(docPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(docPath, 'utf-8')) as unknown;
      const parsed = parseDocFile(raw);
      for (const item of parsed.blocks) {
        const b = validateBlock(item);
        if (b) blocks.push(b);
      }
      if (blocks.length) refresh();
      const mismatch = engineMismatch(parsed.engine);
      if (mismatch) console.error(`[nyamath] ${mismatch}`);
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
      getSnapshot: () => ({
        rev,
        blocks: slimBlocks(),
        meta: { ...serverMeta },
        deleted: { ...serverDeleted },
      }),
      applyPush: (raw, baseRev, inMeta, inDeleted) => {
        const peerMeta = saneMeta(inMeta);
        const peerDeleted = saneMeta(inDeleted);
        const hasMeta = inMeta !== undefined && inMeta !== null;
        if (typeof baseRev === 'number' && baseRev !== rev && !hasMeta) {
          const err = new Error(`CONFLICT: baseRev=${baseRev}, server rev=${rev}`);
          (err as { status?: number }).status = 409;
          throw err;
        }
        if (raw.length > 5000) throw new Error('Слишком много блоков (>5000)');
        const rec: MathBlockData[] = [];
        for (const item of raw) {
          const b = validateBlock(item);
          if (b) rec.push(b);
        }
        if (!rec.length && raw.length > 0) throw new Error('Нет корректных блоков');
        // stale baseRev С метками — three-way merge вместо 409
        if (typeof baseRev === 'number' && baseRev !== rev && hasMeta) {
          const ancestor = syncHistory.find((h) => h.rev === baseRev);
          if (!ancestor) {
            const err = new Error(
              `CONFLICT: baseRev=${baseRev} слишком стар (rev=${rev}), заберите snapshot`,
            );
            (err as { status?: number }).status = 409;
            throw err;
          }
          const merged = mergeBlockMaps(
            ancestor.blocks,
            ancestor.meta,
            slimBlocks(),
            serverMeta,
            rec as unknown as WireBlock[],
            peerMeta,
            serverDeleted,
            peerDeleted,
          );
          const mrec: MathBlockData[] = [];
          for (const item of merged.blocks) {
            const vb = validateBlock(item);
            if (vb) mrec.push(vb);
          }
          blocks = mrec;
          serverMeta = merged.meta;
          serverDeleted = merged.deleted;
          refresh();
          return {
            rev,
            merged: {
              rev,
              blocks: slimBlocks(),
              meta: { ...serverMeta },
              deleted: { ...serverDeleted },
            },
          };
        }
        // fast path: свежий baseRev или безусловный push — принять как есть.
        // Метки: входящие — за свои блоки; legacy-пушам без meta наследуем
        // старые метки контентно-совпадающих блоков (иначе сервер выигрывал
        // бы все будущие конфликты просто за счёт свежего штампа).
        const stripCmp = (x: MathBlockData): unknown => {
          const {
            plotPreview: _p,
            simResult: _s,
            ...rest
          } = x as MathBlockData & { simResult?: unknown };
          void _p;
          void _s;
          return rest;
        };
        const prevCanon = new Map(blocks.map((sb) => [sb.id, canon(stripCmp(sb))]));
        blocks = rec;
        const now = Date.now();
        const nextMeta: MetaMap = {};
        for (const blk of rec) {
          const incoming = peerMeta[blk.id];
          if (incoming) {
            nextMeta[blk.id] = incoming;
          } else if (prevCanon.get(blk.id) === canon(stripCmp(blk)) && serverMeta[blk.id]) {
            nextMeta[blk.id] = serverMeta[blk.id];
          } else {
            nextMeta[blk.id] = { clock: now, actor: 'mcp-push' };
          }
        }
        serverMeta = nextMeta;
        for (const [id, tm] of Object.entries(peerDeleted)) {
          if (!serverMeta[id]) serverDeleted[id] = tm;
        }
        for (const blk of rec) {
          if (serverDeleted[blk.id]) delete serverDeleted[blk.id];
        }
        refresh();
        return { rev };
      },
      getStatus: () => ({ rev, blocks: blocks.length, docPath }),
    });
    // Связываем пересчёт с SSE-рассылкой: прямые правки через MCP-инструменты
    // той же сессии (nya_add/update/move/...) сразу уходят подписанным UI.
    broadcastSync = sync.broadcast;
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

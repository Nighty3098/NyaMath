/**
 * Чтение контейнеров Mathcad (.xmcd / .xmcdz / .mcdx).
 *
 * .xmcd  — обычный XML (Mathcad 15, worksheet30/math30; Prime может писать
 *          worksheet50/math50 в том же расширении).
 * .xmcdz — gzip-сжатый тот же XML.
 * .mcdx  — ZIP (Prime), внутри `mathcad/worksheet.xml`; текст регионов лежит
 *          в XAML-пакетах и сюда не переносится (даём честную заметку).
 *
 * Модуль не использует DOM-API: работает и в браузере, и в node (MCP).
 */
import { parseXmcd, xmcdPlotSources, type ImportBlock, type ImportResult } from './importDoc.js';

export interface MathcadXmlRead {
  xml: string;
  /** Подтип файла — только для заметок/диагностики. */
  container: 'xml' | 'gzip' | 'zip';
  notes: string[];
}

/* Минимальные типы, чтобы модуль компилировался и с lib DOM, и без него. */
interface DecompressReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}
interface DecompressWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface DecompressStreamLike {
  readable: { getReader(): DecompressReader };
  writable: { getWriter(): DecompressWriter };
}
type DecompressCtor = new (format: string) => DecompressStreamLike;

function getDecompressor(format: string): DecompressStreamLike {
  const Ctor = (
    globalThis as unknown as { DecompressionStream?: DecompressCtor }
  ).DecompressionStream;
  if (!Ctor) throw new Error('DecompressionStream недоступен в этой среде');
  return new Ctor(format);
}

async function inflate(bytes: Uint8Array, format: 'gzip' | 'deflate-raw'): Promise<Uint8Array> {
  const ds = getDecompressor(format);
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  // Читаем параллельно с записью: иначе большой поток упрется в backpressure
  // writable-стороны, а reader так и не начнёт вычитывать данные.
  let writeError: unknown = null;
  const writeP = (async () => {
    try {
      await writer.write(bytes);
      await writer.close();
    } catch (e) {
      writeError = e;
      await reader.cancel().catch(() => undefined);
    }
  })();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  await writeP;
  if (writeError) throw writeError;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function utf8(bytes: Uint8Array): string {
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(start));
}

function le16(b: Uint8Array, p: number): number {
  return (b[p] as number) | ((b[p + 1] as number) << 8);
}
function le32(b: Uint8Array, p: number): number {
  return (
    (b[p] as number) |
    ((b[p + 1] as number) << 8) |
    ((b[p + 2] as number) << 16) |
    ((b[p + 3] as number) << 24)
  ) >>> 0;
}

/** Достаём `mathcad/worksheet.xml` из ZIP (Prime .mcdx). ZIP64 не нужен. */
async function readZipWorksheet(bytes: Uint8Array): Promise<string> {
  const maxBack = Math.min(bytes.length, 66000);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
    if (le32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP: не найден End of Central Directory');
  const count = le16(bytes, eocd + 10);
  let pos = le32(bytes, eocd + 16);
  const target = 'mathcad/worksheet.xml';
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || le32(bytes, pos) !== 0x02014b50) break;
    const method = le16(bytes, pos + 10);
    const csize = le32(bytes, pos + 20);
    const nameLen = le16(bytes, pos + 28);
    const extraLen = le16(bytes, pos + 30);
    const commentLen = le16(bytes, pos + 32);
    const local = le32(bytes, pos + 42);
    const name = utf8(bytes.subarray(pos + 46, pos + 46 + nameLen));
    if (name === target || name.toLowerCase().endsWith('/worksheet.xml')) {
      if (local + 30 > bytes.length || le32(bytes, local) !== 0x04034b50)
        throw new Error('ZIP: битый локальный заголовок');
      const lnLen = le16(bytes, local + 26);
      const lxLen = le16(bytes, local + 28);
      const data = bytes.subarray(local + 30 + lnLen + lxLen, local + 30 + lnLen + lxLen + csize);
      if (method === 0) return utf8(data);
      if (method === 8) return utf8(await inflate(data, 'deflate-raw'));
      throw new Error(`ZIP: метод сжатия ${method} не поддерживается`);
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('ZIP: внутри нет mathcad/worksheet.xml');
}

/** Файл → XML-текст worksheets. */
export async function readMathcadXml(
  bytes: Uint8Array,
  name = '',
): Promise<MathcadXmlRead> {
  const notes: string[] = [];
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const isZip =
    bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7);
  if (isGzip) {
    notes.push('.xmcdz: gzip-контейнер распакован');
    return { xml: utf8(await inflate(bytes, 'gzip')), container: 'gzip', notes };
  }
  if (isZip) {
    notes.push(
      'Prime .mcdx: взят mathcad/worksheet.xml; текст регионов хранится в XAML-пакетах и не импортируется',
    );
    return { xml: await readZipWorksheet(bytes), container: 'zip', notes };
  }
  if (name.toLowerCase().endsWith('.xmcdz'))
    notes.push('Расширение .xmcdz, но файл не gzip — читаем как обычный XML');
  return { xml: utf8(bytes), container: 'xml', notes };
}

/* ---------------- Графики Mathcad ---------------- */

function decodeBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const PLOT_NAME_SOURCE = '[A-Za-zА-Яа-яΑ-Ωα-ω][A-Za-z0-9_А-Яа-яΑ-Ωα-ω]*';
const PLOT_IDENT = new RegExp(`^${PLOT_NAME_SOURCE}$`, 'u');
const PLOT_NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const PLOT_NATIVE_ARITY = new Map<string, number>([
  ['sin', 1],
  ['cos', 1],
  ['tan', 1],
  ['exp', 1],
  ['log', 1],
  ['ln', 1],
  ['sqrt', 1],
]);

interface PlotToken {
  kind: 'token';
  index: number;
  ref: number;
  marker: number;
  text: string;
}
interface PlotNode {
  kind: 'apply' | 'args' | 'group';
  index: number;
  ref: number;
}
interface PlotTrace {
  name: string;
  args: string[];
  expr: string;
}

function decodePlotText(bytes: Uint8Array, start: number, len: number, flag: number): string {
  const units = Math.max(0, len - 1);
  if (flag === 3) {
    let out = '';
    for (let i = 0; i < units; i++) out += String.fromCharCode(le16(bytes, start + i * 2));
    return out.replace(/\0+$/u, '');
  }
  if (flag === 1) {
    return String.fromCharCode(...bytes.subarray(start, start + units)).replace(/\0+$/u, '');
  }
  return '';
}

/**
 * Достать выражения кривых из бинарного описания графика Mathcad 15.
 * Формат — registry-дерево: имя → apply → args → аргументы (имена/числа).
 */
function xmcdPlotTraces(bytes: Uint8Array): PlotTrace[] {
  const tokens: PlotToken[] = [];
  const nodes: PlotNode[] = [];

  for (let i = 1; i < bytes.length - 12; i++) {
    if (
      bytes[i] === 0x32 &&
      bytes[i + 1] === 0x02 &&
      bytes[i + 2] === 0x0f &&
      bytes[i + 3] === 0 &&
      bytes[i + 4] === 0
    ) {
      const refVal = le32(bytes, i + 5);
      const marker = refVal & 0xff;
      if (marker !== 0x64 && marker !== 0xa4 && marker !== 0xb4) continue;
      const len = bytes[i + 9] as number;
      // Числовые литералы несут дополнительный байт формата перед строкой.
      const textStart = marker === 0xb4 ? i + 12 : i + 11;
      const textFlag = bytes[marker === 0xb4 ? i + 11 : i + 10] as number;
      if (len < 2 || len > 64 || textStart + 2 * len - 1 > bytes.length) continue;
      const text = decodePlotText(bytes, textStart, len, textFlag);
      if (!PLOT_IDENT.test(text) && !PLOT_NUMBER.test(text)) continue;
      tokens.push({
        kind: 'token',
        index: bytes[i - 1] as number,
        ref: refVal >>> 8,
        marker,
        text,
      });
    } else if (
      bytes[i] === 0x32 &&
      bytes[i + 1] === 0x8e &&
      bytes[i + 2] === 0x70 &&
      bytes[i + 3] === 0 &&
      bytes[i + 4] === 0
    ) {
      nodes.push({
        kind: 'apply',
        index: bytes[i - 1] as number,
        ref: le16(bytes, i + 5) >>> 8,
      });
    } else if (
      bytes[i] === 0x32 &&
      bytes[i + 1] === 0x0a &&
      bytes[i + 2] === 0xc3 &&
      bytes[i + 3] === 0 &&
      bytes[i + 4] === 0
    ) {
      nodes.push({ kind: 'args', index: bytes[i - 1] as number, ref: le16(bytes, i + 5) >>> 8 });
    } else if (
      bytes[i] === 0x32 &&
      bytes[i + 1] === 0x07 &&
      bytes[i + 2] === 0xfb &&
      bytes[i + 3] === 0 &&
      bytes[i + 4] === 0
    ) {
      nodes.push({ kind: 'group', index: bytes[i - 1] as number, ref: le16(bytes, i + 5) >>> 8 });
    }
  }

  const byIndex = <T extends PlotNode | PlotToken>(items: T[], ref: number): T[] =>
    items.filter((n) => n.ref === ref).sort((a, b) => a.index - b.index);
  const out: PlotTrace[] = [];
  const seen = new Set<string>();
  for (const name of tokens.filter((t) => t.marker === 0x64)) {
    const apply = byIndex(nodes.filter((n): n is PlotNode & { kind: 'apply' } => n.kind === 'apply'), name.ref)[0];
    if (!apply) continue;
    const args = byIndex(nodes.filter((n): n is PlotNode & { kind: 'args' } => n.kind === 'args'), apply.index)[0];
    if (!args) continue;

    const argParts: string[] = [];
    for (const child of byIndex(
      [...tokens, ...nodes.filter((n) => n.kind === 'group')],
      args.index,
    )) {
      if (child.kind === 'token') {
        argParts.push(child.text);
      } else {
        for (const inner of byIndex(tokens, child.index)) argParts.push(inner.text);
      }
    }
    if (!argParts.length) continue;
    const expr = `${name.text}(${argParts.join(', ')})`;
    if (seen.has(expr)) continue;
    seen.add(expr);
    out.push({ name: name.text, args: argParts, expr });
  }
  return out;
}

/** Публичная форма для тестов и отладки: выражения кривых без адаптации осей. */
export function xmcdPlotExpressions(bytes: Uint8Array): string[] {
  return xmcdPlotTraces(bytes).map((t) => t.expr);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

function rangeOf(
  blocks: ImportBlock[],
  variable: string,
): { start: string; end: string } | null {
  const re = new RegExp(
    `^\\s*${escapeRe(variable)}\\s*:=\\s*seq\\(([^,]+),\\s*([^,]+),`,
  );
  for (const b of blocks) {
    if (b.kind !== 'math') continue;
    const m = b.body.match(re);
    if (m) return { start: (m[1] ?? '').trim(), end: (m[2] ?? '').trim() };
  }
  return null;
}

/** Арности функций, известные из формул листа (нужны для разбора кривых графика). */
function functionArities(blocks: ImportBlock[]): Map<string, number> {
  const out = new Map<string, number>();
  const def = new RegExp(`^\\s*(${PLOT_NAME_SOURCE})\\s*\\(([^)]*)\\)\\s*:=`, 'u');
  for (const b of blocks) {
    if (b.kind === 'program' && b.exportName) {
      out.set(b.exportName, b.programParams?.length ?? 0);
      continue;
    }
    if (b.kind !== 'math') continue;
    const m = b.body.match(def);
    if (!m) continue;
    const params = splitArgs(m[2] ?? '')
      .map((s) => s.trim())
      .filter(Boolean);
    out.set(m[1] as string, params.length);
  }
  return out;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (!items.length) return [];
  const out: T[][] = [];
  const walk = (start: number, chosen: T[]): void => {
    if (chosen.length === k) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i] as T);
      walk(i + 1, chosen);
      chosen.pop();
      if (out.length >= 24) return;
    }
  };
  walk(0, []);
  return out;
}

/**
 * Бинарник Mathcad иногда складывает в args несколько кривых подряд
 * (`V(t, I, S)`), хотя функция на листе объявлена с двумя параметрами.
 * По арности возвращаем отдельные выражения `V(t, I)` и `V(t, S)`.
 */
function traceVariants(trace: PlotTrace, arities: Map<string, number>): string[] {
  const arity =
    arities.get(trace.name) ?? PLOT_NATIVE_ARITY.get(trace.name.toLowerCase());
  if (!arity || trace.args.length < arity) return [];
  if (trace.args.length === arity) return [trace.expr];
  const first = trace.args[0] as string;
  const rest = trace.args.slice(1);
  const named = rest.filter((a) => !PLOT_NUMBER.test(a));
  const pool = named.length ? named : rest;
  const out = new Set<string>();
  for (const tail of combinations(pool, arity - 1)) {
    out.add(`${trace.name}(${[first, ...tail].join(', ')})`);
  }
  return [...out];
}

/** `X(t, D)` → `X(x*(length(D)*tau), D)`: ось X в NyaMath всегда 0..1. */
function adaptPlotExpr(expr: string, blocks: ImportBlock[]): string {
  const call = expr.match(
    new RegExp(`^(${PLOT_NAME_SOURCE})\\s*\\((.*)\\)$`, 'u'),
  );
  if (!call) return expr;
  const name = call[1] as string;
  const args = splitArgs(call[2] ?? '');
  const mapped = args.map((a) => {
    const arg = a.trim();
    const range = rangeOf(blocks, arg);
    if (!range) return arg;
    const replacement =
      range.start === '0'
        ? `x*(${range.end})`
        : `(${range.start}) + x*((${range.end}) - (${range.start}))`;
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(arg)}(?![\\p{L}\\p{N}_])`, 'gu');
    return arg.replace(re, replacement);
  });
  return `${name}(${mapped.join(', ')})`;
}

/** Добавить импортированные графики к результату разбора XML. */
export async function importXmcdPlots(xml: string, parsed: ImportResult): Promise<ImportResult> {
  const sources = xmcdPlotSources(xml);
  if (!sources.length) return parsed;
  const blocks = [...parsed.blocks];
  const arities = functionArities(blocks);
  let notes = [...parsed.notes];
  let imported = 0;
  for (const src of sources) {
    let raw: Uint8Array;
    try {
      raw = decodeBase64(src.base64);
      if (src.gzipped) raw = await inflate(raw, 'gzip');
    } catch {
      notes.push(`Mathcad-график @${Math.round(src.y)}: бинарные данные не распакованы`);
      continue;
    }
    const exprs = [
      ...new Set(
        xmcdPlotTraces(raw)
          .flatMap((t) => traceVariants(t, arities))
          .map((e) => adaptPlotExpr(e, blocks)),
      ),
    ];
    if (!exprs.length) {
      notes.push(`Mathcad-график @${Math.round(src.y)}: кривые не распознаны — пропущен`);
      continue;
    }
    blocks.push({
      kind: 'plot',
      body: exprs.join('; '),
      x: src.x,
      y: src.y,
      plotXmin: 0,
      plotXmax: 1,
    });
    imported++;
  }
  if (imported) {
    notes = notes.map((n) =>
      n.startsWith('пропущено регионов Mathcad')
        ? n.replace('графики/картинки/пустые', 'картинки/пустые')
        : n,
    );
    notes.push(`Mathcad-графики: импортировано ${imported}`);
  }
  return { ...parsed, blocks, notes };
}

/** Универсальная точка входа: байты файла → готовые блоки импорта. */
export async function parseMathcadFile(bytes: Uint8Array, name = ''): Promise<ImportResult> {
  const read = await readMathcadXml(bytes, name);
  const parsed = parseXmcd(read.xml);
  const withPlots = await importXmcdPlots(read.xml, parsed);
  return { ...withPlots, notes: [...read.notes, ...withPlots.notes], format: 'xmcd' };
}

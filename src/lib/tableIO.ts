/**
 * lib/tableIO — двусторонний обмен таблицами с Excel (zero-deps, P0).
 *
 * Импорт: CSV/TSV из буфера или Excel copy-paste (`;`, `,`, `\t`, таб) →
 * мат-матрица `[1, 2; 3, 4]` новым блоком. Понимает десятичную запятую
 * `1,5` (RU-Excel) и кавычки `"a; b"`.
 * Экспорт: scope (именованные переменные) → CSV и Excel-открываемый `.xls`
 * (SpreadsheetML-таблица в HTML — тот же zero-deps приём, что Word-HTML
 * в wordExport: Excel/LibreOffice открывают без конвертеров).
 */
import type { MathBlockData } from '../engine/dependencies';
import { downloadTextFile } from './exportFiles';

/** Одна разобранная ячейка: число или исходный текст. */
export type Cell = number | string;

/** Автоопределение разделителя по первой непустой строке. */
export function detectDelimiter(line: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && (ch === ',' || ch === ';' || ch === '\t')) counts[ch]++;
  }
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] >= counts[',']) return '\t';
  return ',';
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Сырая ячейка → число (с десятичной запятой) или текст. Пусто → null. */
export function parseCell(raw: string): number | string | null {
  const s = raw.trim();
  if (!s) return null;
  // RU-Excel: `1 234,5` → 1234.5 (пробелы-тысячи убираем только вокруг запятой-дроби)
  const norm = s.replace(/\s+/g, '').replace(',', '.');
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(norm)) {
    const v = Number(norm);
    if (isFinite(v)) return v;
  }
  return s;
}

/** CSV/TSV-текст → прямоугольная таблица (короткие строки добиваем null). */
export function parseTable(text: string): (number | string | null)[][] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const delim = detectDelimiter(lines[0]!);
  const rows = lines.map((l) => splitLine(l, delim).map(parseCell));
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => {
    while (r.length < w) r.push(null);
    return r;
  });
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(+v.toPrecision(12));
}

/**
 * Числовая таблица → литерал мат-матрицы для вставки в math-блок.
 * Текст/пустые → 0 (движок считает только числа; текстовая шапка отбрасывается
 * вызывателем через numericTable). Возвращает null, если чисел нет.
 */
export function numericTableToMatrix(rows: (number | string | null)[][]): string | null {
  const nums = rows.map((r) => r.map((c) => (typeof c === 'number' && isFinite(c) ? c : 0)));
  if (!nums.length || !nums[0]!.length) return null;
  if (!nums.some((r) => r.some((c) => c !== 0))) return null;
  return `[${nums.map((r) => r.map(fmtNum).join(', ')).join('; ')}]`;
}

/** Первая строка-шапка из текстовых ячеек (для именования), иначе null. */
export function headerRow(rows: (number | string | null)[][]): string[] | null {
  if (!rows.length) return null;
  const first = rows[0]!;
  if (first.some((c) => typeof c === 'string')) {
    return first.map((c) => (c === null ? '' : String(c)));
  }
  return null;
}

/** Именованные результаты листа → строки [name, value] для экспорта. */
export function scopeRows(blocks: Record<string, MathBlockData>): [string, string][] {
  return Object.values(blocks)
    .filter((b) => b.kind === 'math' && b.definedVar && !b.error)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .map((b) => [b.definedVar as string, (b.resultStr || '').trim()]);
}

function escCsv(v: string): string {
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Строки → CSV-текст. */
export function rowsToCsv(header: string[], rows: [string, string][]): string {
  return [header.map(escCsv).join(','), ...rows.map(([a, b]) => `${escCsv(a)},${escCsv(b)}`)].join(
    '\n',
  );
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Строки → `.xls` (HTML-таблица с MIME `application/vnd.ms-excel`). */
export function rowsToXlsHtml(rows: [string, string][], lang: 'ru' | 'en' = 'ru'): string {
  const head = lang === 'ru' ? ['Переменная', 'Значение'] : ['Variable', 'Value'];
  const trs = rows.map(
    ([a, b]) => `<tr><td>${escHtml(a)}</td><td>${escHtml(b)}</td></tr>`,
  );
  return [
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">',
    '<head><meta charset="utf-8"></head><body>',
    `<table><tr><th>${escHtml(head[0])}</th><th>${escHtml(head[1])}</th></tr>${trs.join('')}</table>`,
    '</body></html>',
    '',
  ].join('\n');
}

export function downloadScopeCsv(blocks: Record<string, MathBlockData>): void {
  downloadTextFile(
    'nyamath-scope.csv',
    rowsToCsv(['variable', 'value'], scopeRows(blocks)),
    'text/csv;charset=utf-8',
  );
}

export function downloadScopeXls(
  blocks: Record<string, MathBlockData>,
  lang: 'ru' | 'en' = 'ru',
): void {
  downloadTextFile(
    'nyamath-scope.xls',
    rowsToXlsHtml(scopeRows(blocks), lang),
    'application/vnd.ms-excel;charset=utf-8',
  );
}

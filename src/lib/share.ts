/**
 * Serverless-шаринг документа через URL.
 *
 * Поток «Поделиться»:
 *   blocks → slim-кортежи → JSON → фразовая упаковка → deflate-raw → base64url → `#d=…`
 *   нетронутый пример → короткая ссылка `#t=ex20|demo`
 * Поток «Открыть ссылку»:
 *   `#d=…` → base64url → inflate → распаковать фразы → JSON → loadDocument
 *   `#t=…` → встроенный пример (без байт данных вообще)
 *
 * Всё клиентское, zero-deps: сжатие — нативный CompressionStream.
 * Бэкенд не нужен: данные лежат во фрагменте (на сервер не отправляются),
 * статический хостинг отдаёт тот же index.html.
 *
 * Формат v1 (compact): `[1, [[dy, kind, main, extra?], …]]`
 *   - `dy` — дельта Y от предыдущего блока (первый — абсолютный), округлена.
 *     Порядок сверху-вниз = порядок вычислений движка.
 *   - `kind`: 0 math, 1 text, 2 plot, 3 plot3d, 4 program, 5 sim, 6 contour, 7 slider.
 *   - `main`: rawInput (math/text/program), plotFn (plot/plot3d/contour), '' (sim).
 *   - `extra`: только нестандартные поля (x≠80, диапазоны, exportName, sim-поля…).
 *     Пустой extra опускается. id НЕ храним (36 символов × N) — генерим заново.
 * Версии параметра (первый символ): `0` = JSON как есть (legacy),
 * `1` = deflate-raw(JSON) (legacy), `4` = deflate-raw(фразы(JSON)).
 *
 * v4, фразовая упаковка: JSON-байты сканируются на вхождения строк словаря
 * (FROZEN_PHRASES — тексты встроенных примеров, заморожены навсегда).
 * Совпадение `"фраза…` заменяется двухбайтовой ссылкой `0x00 idx`
 * (0x00 в JSON не встречается — NUL всегда экранируется как \u0000).
 * Учебные листы почти целиком состоят из этих фраз → −30-35% к ссылке.
 */
import type { MathBlockData } from '../engine/dependencies';
import type { Lang } from '../i18n';
import { normalizeCalcPrecision, type CalculationPrecision } from '../engine/precision';
import { getDemoItems, getDemoLines } from './db';
import { FROZEN_PHRASES } from './sharePhrases';
import { copyTextToClipboard } from './exportFiles';

const VERSION_DEFLATE = '1';
const VERSION_PLAIN = '0';
const VERSION_PHRASE = '4';

/** Ключ фрагмента/параметра ссылки. */
export const SHARE_KEY = 'd';

/** Выше — показываем предупреждение о длине (мессенджеры режут длинные URL). */
export const SHARE_WARN_CHARS = 7000;

const KIND_TO_CODE: Record<string, number> = {
  math: 0,
  text: 1,
  plot: 2,
  plot3d: 3,
  program: 4,
  sim: 5,
  contour: 6,
  slider: 7,
};
const CODE_TO_KIND = [
  'math',
  'text',
  'plot',
  'plot3d',
  'program',
  'sim',
  'contour',
  'slider',
] as const;

type CompactExtra = Record<string, string | number | boolean>;
type CompactBlock = [number, number, string] | [number, number, string, CompactExtra];

/** Собрать кортеж: extra прикладываем только если есть нестандартные поля. */
function fin(dy: number, kind: number, main: string, extra: CompactExtra): CompactBlock {
  return Object.keys(extra).length ? [dy, kind, main, extra] : [dy, kind, main];
}

/** Положить значение в extra, только если оно отличается от дефолта. */
function put<T>(o: CompactExtra, k: string, v: T, dflt: T): void {
  if (v !== dflt && v !== undefined && v !== null && v !== '')
    o[k] = v as string | number | boolean;
}

/** blocks → компактный массив кортежей (сортировка сверху-вниз, как считает движок). */
function slimBlocks(blocks: Record<string, SlimSource>): CompactBlock[] {
  const list = Object.values(blocks).sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  const out: CompactBlock[] = [];
  let prevY = 0;
  for (const b of list) {
    const dy = Math.round(b.y - prevY);
    prevY = b.y;
    const kind = KIND_TO_CODE[b.kind] ?? 0;
    const extra: CompactExtra = {};
    if (Math.round(b.x) !== 80) extra.x = Math.round(b.x);
    if (typeof b.w === 'number' && b.w > 0) extra.w = b.w;
    if (typeof b.h === 'number' && b.h > 0) extra.h = b.h;

    if (b.kind === 'plot' || b.kind === 'contour') {
      put(extra, 'a', b.plotXmin, b.kind === 'plot' ? -10 : -5);
      put(extra, 'b', b.plotXmax, b.kind === 'plot' ? 10 : 5);
      if (b.kind === 'contour') {
        put(extra, 'c', b.plotYmin, -5);
        put(extra, 'd', b.plotYmax, 5);
        put(extra, 'r', b.plotResolution, undefined as unknown as number);
      } else {
        put(extra, 'c', b.plotYmin, -5);
        put(extra, 'd', b.plotYmax, 5);
        if (b.plotProj !== undefined) extra.p = b.plotProj;
        if (b.plotTrace !== undefined && b.plotTrace !== 'line') extra.q = b.plotTrace;
        if (b.plotErr) extra.E = b.plotErr;
        if (b.plotTitle) extra.T = b.plotTitle;
        if (b.plotXLabel) extra.X = b.plotXLabel;
        if (b.plotYLabel) extra.Y = b.plotYLabel;
        if (b.plotGrid === false) extra.G = 0;
        if (b.plotLegend === false) extra.L = 0;
      }
      out.push(fin(dy, kind, b.plotFn ?? '', extra));
    } else if (b.kind === 'plot3d') {
      put(extra, 'a', b.plotXmin, -5);
      put(extra, 'b', b.plotXmax, 5);
      put(extra, 'c', b.plotYmin, -5);
      put(extra, 'd', b.plotYmax, 5);
      if (b.plotMode !== undefined && b.plotMode !== 'auto') extra.m = b.plotMode;
      put(extra, 'r', b.plotResolution, 48);
      if (b.plotWireframe === true) extra.f = 1;
      out.push(fin(dy, kind, b.plotFn ?? '', extra));
    } else if (b.kind === 'program') {
      if (b.exportName) extra.e = b.exportName;
      out.push(fin(dy, kind, b.rawInput, extra));
    } else if (b.kind === 'slider') {
      if (b.sliderVar) extra.v = b.sliderVar;
      put(extra, 'a', b.sliderMin, undefined as unknown as number);
      put(extra, 'b', b.sliderMax, undefined as unknown as number);
      put(extra, 's', b.sliderStep, undefined as unknown as number);
      put(extra, 'u', b.sliderVal, undefined as unknown as number);
      out.push(fin(dy, kind, '', extra));
    } else if (b.kind === 'sim') {
      // sim-поля — полными именами (редкие блоки, deflate съест повторы ключей).
      for (const k of [
        'simModel',
        'simMode',
        'simStates',
        'simDerivs',
        'simAux',
        'simParams',
        'simInit',
        'simT0',
        'simT1',
        'simDt',
        'simSolver',
        'simEvents',
        'simX',
        'simY',
        'simFdtdN',
        'simFdtdL',
        'simFdtdSteps',
        'simFdtdSrc',
        'simFdtdFreq',
        'simFdtdAmp',
        'simFdtdSrcX',
        'simFdtdDet',
        'simFdtdLayers',
        'simExport',
        'simSpeed',
        'simLoop',
      ] as const) {
        const v: unknown = b[k];
        if (v !== undefined && v !== null && v !== '') extra[k] = v as string | number | boolean;
      }
      out.push(fin(dy, kind, '', { ...extra }));
    } else {
      // math / text — только формула, лишнего нет.
      out.push(fin(dy, kind, b.rawInput, extra));
    }
  }
  return out;
}

/** Компактные кортежи → массив блоков для loadDocument (id сгенерирует migrate). */
function expandBlocks(data: CompactBlock[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let y = 0;
  for (const t of data) {
    if (!Array.isArray(t) || t.length < 3) throw new Error('bad-block');
    const [dy, code, main] = t;
    const extra = (t.length > 3 ? t[3] : {}) as CompactExtra;
    if (typeof dy !== 'number' || typeof code !== 'number' || typeof main !== 'string') {
      throw new Error('bad-block');
    }
    const kind = CODE_TO_KIND[code];
    if (!kind) throw new Error('bad-kind');
    y += dy;
    const b: Record<string, unknown> = {
      x: typeof extra.x === 'number' ? extra.x : 80,
      y,
      rawInput: kind === 'plot' || kind === 'plot3d' || kind === 'contour' ? kind : main,
      kind,
    };
    if (typeof extra.w === 'number') b.w = extra.w;
    if (typeof extra.h === 'number') b.h = extra.h;
    if (kind === 'plot' || kind === 'plot3d' || kind === 'contour') {
      b.plotFn = main;
      if (extra.a !== undefined) b.plotXmin = extra.a;
      if (extra.b !== undefined) b.plotXmax = extra.b;
      if (extra.c !== undefined) b.plotYmin = extra.c;
      if (extra.d !== undefined) b.plotYmax = extra.d;
      if (extra.m !== undefined) b.plotMode = extra.m;
      if (extra.r !== undefined) b.plotResolution = extra.r;
      if (extra.f !== undefined) b.plotWireframe = extra.f === 1;
      if (kind === 'plot') {
        if (extra.p !== undefined) b.plotProj = extra.p;
        if (extra.q !== undefined) b.plotTrace = extra.q;
        if (extra.E !== undefined) b.plotErr = extra.E;
        if (extra.T !== undefined) b.plotTitle = extra.T;
        if (extra.X !== undefined) b.plotXLabel = extra.X;
        if (extra.Y !== undefined) b.plotYLabel = extra.Y;
        if (extra.G !== undefined) b.plotGrid = extra.G !== 0;
        if (extra.L !== undefined) b.plotLegend = extra.L !== 0;
      }
    } else if (kind === 'program') {
      if (typeof extra.e === 'string') b.exportName = extra.e;
    } else if (kind === 'slider') {
      b.rawInput = 'slider';
      if (typeof extra.v === 'string') b.sliderVar = extra.v;
      if (typeof extra.a === 'number') b.sliderMin = extra.a;
      if (typeof extra.b === 'number') b.sliderMax = extra.b;
      if (typeof extra.s === 'number') b.sliderStep = extra.s;
      if (typeof extra.u === 'number') b.sliderVal = extra.u;
    } else if (kind === 'sim') {
      // extra уже содержит только sim-поля (+x): rawInput/kind/y не пересекаются.
      Object.assign(b, extra);
    }
    out.push(b);
  }
  return out;
}

/* ---------------- base64url на байтах (кириллица — через TextEncoder) ---------------- */

function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/');
  const pad = (4 - (b64.length % 4)) % 4;
  const bin = atob(b64 + '='.repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------------- deflate-raw через нативный CompressionStream ---------------- */

function hasDeflate(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------------- v4: фразовая упаковка поверх JSON ---------------- */

/** Байтовые паттерны `"фраза…` (открывающая кавычка + JSON-эскейп), длинные вперёд. */
const PHRASE_PATS: { pat: Uint8Array; idx: number }[] = (() => {
  const enc = new TextEncoder();
  const list = FROZEN_PHRASES.slice(0, 256).map((s, idx) => ({
    // JSON.stringify(s) без замыкающей кавычки: совпадает с началом `"s…` в документе
    pat: enc.encode(JSON.stringify(s).slice(0, -1)),
    idx,
  }));
  list.sort((a, b) => b.pat.length - a.pat.length);
  return list;
})();

/** Короткие фразы не окупают двухбайтовую ссылку. */
const MIN_PHRASE = 8;

/** Совпадает ли data[i..] с pat. */
function startsWithAt(data: Uint8Array, i: number, pat: Uint8Array): boolean {
  if (i + pat.length > data.length) return false;
  for (let k = 0; k < pat.length; k++) {
    if (data[i + k] !== pat[k]) return false;
  }
  return true;
}

/** JSON-байты → байты со ссылками `0x00 idx` (0x00 в JSON не бывает). */
export function phrasePack(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    let hit = -1;
    if (data[i] === 0x22 /* " */) {
      for (const { pat, idx } of PHRASE_PATS) {
        if (pat.length >= MIN_PHRASE && startsWithAt(data, i, pat)) {
          hit = idx;
          i += pat.length;
          break;
        }
      }
    }
    if (hit >= 0) out.push(0x00, hit);
    else out.push(data[i++]);
  }
  return Uint8Array.from(out);
}

/** Обратное преобразование. Бросает на обрезанной ссылке. */
export function phraseUnpack(data: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const outs: Uint8Array[] = [];
  let plain = 0;
  const flush = (to: number) => {
    if (to > plain) outs.push(data.slice(plain, to));
  };
  let i = 0;
  while (i < data.length) {
    if (data[i] === 0x00) {
      if (i + 1 >= data.length) throw new Error('bad-phrase');
      const idx = data[i + 1];
      if (idx >= FROZEN_PHRASES.length) throw new Error('bad-phrase');
      flush(i);
      // открывающая кавычка уже учтена паттерном — дописываем её вместе с фразой
      outs.push(enc.encode(JSON.stringify(FROZEN_PHRASES[idx]).slice(0, -1)));
      i += 2;
      plain = i;
    } else {
      i++;
    }
  }
  flush(data.length);
  const total = outs.reduce((s, p) => s + p.length, 0);
  const res = new Uint8Array(total);
  let off = 0;
  for (const p of outs) {
    res.set(p, off);
    off += p.length;
  }
  return res;
}

/* ---------------- шаблоны: нетронутый пример → `#t=…` без байт ---------------- */

export type TemplateKey = 'ex20' | 'demo';

/** Минимальный блок для slimBlocks (полный MathBlockData тоже подходит). */
interface SlimSource {
  x: number;
  y: number;
  kind: string;
  rawInput: string;
  plotFn?: string;
  plotXmin?: number;
  plotXmax?: number;
  plotYmin?: number;
  plotYmax?: number;
  plotMode?: string;
  plotResolution?: number;
  plotWireframe?: boolean;
  plotProj?: string;
  plotTrace?: string;
  plotErr?: string;
  plotTitle?: string;
  plotXLabel?: string;
  plotYLabel?: string;
  plotGrid?: boolean;
  plotLegend?: boolean;
  exportName?: string;
  w?: number | null;
  h?: number | null;
  simStates?: string;
  simDerivs?: string;
  simAux?: string;
  simParams?: string;
  simInit?: string;
  simT0?: number;
  simT1?: number;
  simDt?: number;
  simSolver?: string;
  simEvents?: string;
  simX?: string;
  simY?: string;
  simMode?: string;
  simModel?: string;
  simFdtdN?: number;
  simFdtdL?: number;
  simFdtdSteps?: number;
  simFdtdSrc?: string;
  simFdtdFreq?: number;
  simFdtdAmp?: number;
  simFdtdSrcX?: number;
  simFdtdDet?: number | null;
  simFdtdLayers?: string;
  simExport?: string;
  simSpeed?: number;
  simLoop?: boolean;
  sliderVar?: string;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  sliderVal?: number;
}

/** Каноническая запись примера — та же геометрия, что в сторе (loadTestScenario). */
function templateBlocks(key: TemplateKey): Record<string, SlimSource> {
  const rec: Record<string, SlimSource> = {};
  let n = 0;
  const putB = (b: SlimSource): void => {
    rec[`t${n++}`] = b;
  };
  if (key === 'ex20') {
    let y = 60;
    for (const line of getDemoLines('variant20')) {
      putB({ x: 80, y, rawInput: line, kind: line.startsWith('//') ? 'text' : 'math' });
      y += 64;
    }
    putB({
      x: 560,
      y: 120,
      rawInput: 'plot',
      kind: 'plot',
      plotFn: 'sin(x)',
      plotXmin: -10,
      plotXmax: 10,
    });
  } else {
    let y = 60;
    for (const item of getDemoItems('advanced')) {
      putB({ x: 80, y, rawInput: item.raw, kind: item.kind, exportName: item.exportName ?? '' });
      y += item.kind === 'program' ? 210 : 64;
    }
    putB({
      x: 560,
      y: 140,
      rawInput: 'plot',
      kind: 'plot',
      plotFn: 'sin(w*x); cos(x)',
      plotXmin: -10,
      plotXmax: 10,
    });
  }
  return rec;
}

/** Документ побайтово равен примеру? Тогда хватит `#t=ключ`. */
function matchTemplate(json: string): TemplateKey | null {
  for (const key of ['ex20', 'demo'] as const) {
    const tpl = JSON.stringify([1, slimBlocks(templateBlocks(key))]);
    if (tpl === json) return key;
  }
  return null;
}

/* ---------------- публичное API ---------------- */

export interface ShareEncoded {
  /** Параметр для `#d=` (null — если сработал шаблон `#t=`). */
  param: string | null;
  /** Ключ шаблона, если документ побайтово равен примеру. */
  template: TemplateKey | null;
  /** Длина итогового URL — для предупреждения о мессенджерах. */
  urlLength: number;
  /** Длина compact-JSON до сжатия — для диагностики выигрыша. */
  rawChars: number;
  /** Сколько блоков упаковано. */
  count: number;
  /** true — deflate, false — фолбэк без сжатия. */
  compressed: boolean;
}

/** Упаковать документ в параметр ссылки. Бросает на пустом документе. */
export async function encodeShare(blocks: Record<string, MathBlockData>): Promise<ShareEncoded> {
  const compact = slimBlocks(blocks);
  if (!compact.length) throw new Error('empty');
  const json = JSON.stringify([1, compact]);
  const tpl = matchTemplate(json);
  if (tpl) {
    // Пример целиком: байты данных не нужны вообще — один ключ.
    const url = buildTemplateUrl(tpl);
    return {
      param: null,
      urlLength: url.length,
      rawChars: json.length,
      count: compact.length,
      compressed: true,
      template: tpl,
    };
  }
  const utf8 = new TextEncoder().encode(json);
  const packed = phrasePack(utf8);
  if (hasDeflate()) {
    const deflated = await deflateRaw(packed);
    const param = VERSION_PHRASE + bytesToB64url(deflated);
    return {
      param,
      urlLength: buildShareUrl(param).length,
      rawChars: json.length,
      count: compact.length,
      compressed: true,
      template: null,
    };
  }
  const param = VERSION_PLAIN + bytesToB64url(utf8);
  return {
    param,
    urlLength: buildShareUrl(param).length,
    rawChars: json.length,
    count: compact.length,
    compressed: false,
    template: null,
  };
}

/** Распаковать параметр в массив блоков для loadDocument. Бросает на битых данных. */
export async function decodeShareParam(param: string): Promise<Record<string, unknown>[]> {
  const v = param[0];
  const body = param.slice(1);
  if (!body) throw new Error('empty-param');
  let json: string;
  if (v === VERSION_PHRASE) {
    if (!hasDeflate()) throw new Error('no-inflate');
    const bytes = inflateRaw(b64urlToBytes(body));
    json = new TextDecoder().decode(phraseUnpack(await bytes));
  } else if (v === VERSION_DEFLATE) {
    if (!hasDeflate()) throw new Error('no-inflate');
    const bytes = inflateRaw(b64urlToBytes(body));
    json = new TextDecoder().decode(await bytes);
  } else if (v === VERSION_PLAIN) {
    json = new TextDecoder().decode(b64urlToBytes(body));
  } else {
    throw new Error('bad-version');
  }
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed[0] !== 1 || !Array.isArray(parsed[1]))
    throw new Error('bad-payload');
  const arr = parsed[1] as CompactBlock[];
  if (arr.length > 5000) throw new Error('too-many');
  return expandBlocks(arr);
}

/** База URL без DOM-зависимости (в node отдаёт '' — удобно для тестов). */
function urlBase(): string {
  try {
    if (typeof location !== 'undefined') return `${location.origin}${location.pathname}`;
  } catch {
    /* ignore */
  }
  return '';
}

/** Ключ шаблона в ссылке. */
export const TEMPLATE_KEY = 't';

/** Ключ языка интерфейса в ссылке. */
export const LANG_KEY = 'lang';

/** Строго ru/en, всё остальное — игнорируем (не даём мусору переключать язык). */
export function normalizeLang(v: unknown): Lang | null {
  return v === 'ru' || v === 'en' ? v : null;
}

/** Суффикс `&lang=xx` для шаринговых ссылок (пусто — язык не кладём). */
function langSuffix(lang: unknown): string {
  const l = normalizeLang(lang);
  return l ? `&${LANG_KEY}=${l}` : '';
}

function precisionSuffix(value: CalculationPrecision | undefined): string {
  if (!value) return '';
  const precision = normalizeCalcPrecision(value);
  return precision.mode === 'arbitrary' ? `&precision=${precision.mode}-${precision.digits}` : '';
}

/** Полный URL для шаринга (фрагмент — сервер не трогаем, статический хостинг ок). */
export function buildShareUrl(
  param: string,
  lang?: unknown,
  calcPrecision?: CalculationPrecision,
): string {
  return `${urlBase()}#${SHARE_KEY}=${param}${langSuffix(lang)}${precisionSuffix(calcPrecision)}`;
}

/** Короткая ссылка на нетронутый пример: байт данных нет вообще. */
export function buildTemplateUrl(
  key: TemplateKey,
  lang?: unknown,
  calcPrecision?: CalculationPrecision,
): string {
  return `${urlBase()}#${TEMPLATE_KEY}=${key}${langSuffix(lang)}${precisionSuffix(calcPrecision)}`;
}

/** Точность листа из URL; неизвестные и недопустимые значения игнорируются. */
export function readCalcPrecisionFromUrl(): CalculationPrecision | null {
  try {
    const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    const entry = hash
      .split('&')
      .find((part) => part.startsWith('precision='))
      ?.slice('precision='.length);
    const raw = entry ?? new URLSearchParams(location.search).get('precision');
    const match = raw?.match(/^arbitrary-(\d+)$/);
    if (!match) return null;
    const digits = Number(match[1]);
    if (!Number.isInteger(digits) || digits < 16 || digits > 1000) return null;
    return normalizeCalcPrecision({ mode: 'arbitrary', digits });
  } catch {
    return null;
  }
}

/** Ключ шаблона из URL (`#t=` / `?t=`), null — обычная ссылка или её нет. */
export function readTemplateFromUrl(): TemplateKey | null {
  const pick = (v: string | null): TemplateKey | null => (v === 'ex20' || v === 'demo' ? v : null);
  try {
    const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    for (const part of hash.split('&')) {
      const [k, ...rest] = part.split('=');
      if (k === TEMPLATE_KEY && rest.length) return pick(rest.join('='));
    }
    return pick(new URLSearchParams(location.search).get(TEMPLATE_KEY));
  } catch {
    return null;
  }
}

/** Язык интерфейса из URL (`#lang=` / `?lang=`), null — флага нет или мусор. */
export function readLangFromUrl(): Lang | null {
  try {
    const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    for (const part of hash.split('&')) {
      const [k, ...rest] = part.split('=');
      if (k === LANG_KEY && rest.length) {
        const l = normalizeLang(rest.join('='));
        if (l) return l;
      }
    }
    return normalizeLang(new URLSearchParams(location.search).get(LANG_KEY));
  } catch {
    return null;
  }
}
/** Достать параметр шаринга из URL: сначала `#d=`, потом `?d=`/`?s=` (совместимость). */
export function readShareParamFromUrl(): string | null {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  for (const part of hash.split('&')) {
    const [k, ...rest] = part.split('=');
    if ((k === SHARE_KEY || k === 's') && rest.length) return rest.join('=');
  }
  try {
    const q = new URLSearchParams(location.search);
    return q.get(SHARE_KEY) ?? q.get('s');
  } catch {
    return null;
  }
}

/** Убрать параметры шаринга из адресной строки после загрузки (чтобы refresh не импортил заново). */
export function clearShareParamFromUrl(): void {
  try {
    history.replaceState(
      null,
      '',
      location.pathname +
        location.search.replace(/([?&])(?:[dst]|precision)=[^&]*/g, '$1').replace(/[?&]$/, ''),
    );
    if (location.hash.includes(`${SHARE_KEY}=`) || location.hash.includes(`${TEMPLATE_KEY}=`)) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Поделиться: упаковать, прицепить язык и режим точности, скопировать в буфер.
 * Ошибки буфера не роняем — ссылку всё равно возвращаем (покажем в диалоге).
 */
export async function shareDocument(
  blocks: Record<string, MathBlockData>,
  lang?: unknown,
  calcPrecision?: CalculationPrecision,
): Promise<{ url: string; copied: boolean } & ShareEncoded> {
  const enc = await encodeShare(blocks);
  const url = enc.template
    ? buildTemplateUrl(enc.template, lang, calcPrecision)
    : buildShareUrl(enc.param as string, lang, calcPrecision);
  const copied = await copyTextToClipboard(url);
  return { ...enc, url, urlLength: url.length, copied };
}

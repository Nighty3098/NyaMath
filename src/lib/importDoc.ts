/**
 * Импорт чужих листов в NyaMath (MCP nya_import + drag&drop в UI):
 * SMath Studio .sm (XML, RPN), Calcpad .cpd/.txt (plain text) и
 * Mathcad .xmcd/.xmcdz/.mcdx (XML worksheet15/Prime → NyaMath-синтаксис).
 * Best-effort: формулы переносятся, экзотика — в notes (ничего молча не теряем).
 * Чистый модуль без DOM (регулярный XML-парсер — работает и в node MCP-сервера).
 */
import { mapMathcadFunctionName } from './mathcadNames';
import { MATHCAD_UNSUPPORTED } from './mathcadUnsupported';

const MATHCAD_UNSUPPORTED_LOWER = new Set(
  [...MATHCAD_UNSUPPORTED].map((n) => n.replace(/\.sc$/i, '').toLowerCase()),
);

export type ImportKind = 'math' | 'text' | 'plot' | 'contour' | 'program';

export interface ImportBlock {
  kind: ImportKind;
  /** math/text: формула; plot/contour: fn */
  body: string;
  plotXmin?: number;
  plotXmax?: number;
  plotYmin?: number;
  plotYmax?: number;
  /** program: имя, под которым результат программы уходит в scope. */
  exportName?: string;
  x: number;
  y: number;
}

export interface ImportResult {
  blocks: ImportBlock[];
  notes: string[];
  format: 'sm' | 'cpd' | 'xmcd';
}

/** Не_support functions are kept verbatim, but must never disappear silently. */
function noteUnsupportedFunctions(blocks: ImportBlock[], notes: string[]): void {
  const found = new Set<string>();
  for (const b of blocks) {
    for (const m of b.body.matchAll(/\b([A-Za-z][A-Za-z0-9_.]*)\s*\(/g)) {
      const name = (m[1] ?? '').replace(/\.sc$/i, '');
      if (MATHCAD_UNSUPPORTED_LOWER.has(name.replace(/\.sc$/i, '').toLowerCase())) {
        found.add(name);
      }
    }
  }
  for (const name of [...found].sort()) {
    notes.push(`Mathcad function ${name}() has no NyaMath equivalent — call preserved, check result`);
  }
}

/* ---------------- общие мелочи ---------------- */

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Убрать префиксы неймспейсов у ТЕГОВ (<ns:region> → <region>). */
function stripNs(xml: string): string {
  return xml.replace(/<(\/?)([\w-]+):([\w-]+)/g, '<$1$3');
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function numOr(a: string | null, fb: number): number {
  const n = a === null ? NaN : Number(a);
  return isFinite(n) ? n : fb;
}

/* ---------------- SMath .sm (RPN → infix) ---------------- */

interface RpnEl {
  type: string;
  value: string;
  args: number | null;
  style: string | null;
}

const SM_UNARY = new Set(['!', "'"]);

function parseRpnable(inputXml: string): RpnEl[] {
  const out: RpnEl[] = [];
  const re = /<e\b([^>]*?)(?:\/>|>([\s\S]*?)<\/e>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inputXml)) !== null) {
    const head = m[1] ?? '';
    const inner = (m[2] ?? '').trim();
    const type = attr(head, 'type') ?? '';
    const style = attr(head, 'style');
    const argsRaw = attr(head, 'args');
    // значение — текст элемента, иначе атрибут value (старые файлы)
    let value = decodeEntities(inner.replace(/<[^>]*>/g, ''));
    if (!value) value = decodeEntities(attr(head, 'value') ?? '');
    out.push({ type, value, args: argsRaw === null ? null : Number(argsRaw), style });
  }
  return out;
}

interface Infix {
  s: string;
  prec: number;
}

const PREC_ATOM = 7;

/** RPN-стек в инфикс с минимальными скобками. */
function rpnToInfix(els: RpnEl[]): string | null {
  const stack: Infix[] = [];
  const par = (e: Infix): string => (e.prec >= PREC_ATOM ? e.s : `(${e.s})`);
  for (const el of els) {
    if (el.type === 'operand') {
      if (el.style === 'string') {
        stack.push({ s: `"${el.value}"`, prec: PREC_ATOM });
      } else {
        stack.push({ s: el.value, prec: PREC_ATOM });
      }
      continue;
    }
    if (el.type === 'bracket') continue; // display-подсказка SMath
    if (el.type === 'function') {
      const n = el.args ?? 0;
      if (stack.length < n) return null;
      const argv = stack.splice(stack.length - n, n).map((a) => a.s);
      stack.push({ s: `${mapMathcadFunctionName(el.value)}(${argv.join(', ')})`, prec: PREC_ATOM });
      continue;
    }
    if (el.type !== 'operator') return null;
    const op = el.value;
    let args = el.args;
    if (args === null || !isFinite(args)) {
      if (SM_UNARY.has(op)) args = 1;
      else if (op === '-' && stack.length < 2) args = 1;
      else args = 2;
    }
    if (args === 1) {
      const a = stack.pop();
      if (!a) return null;
      if (op === '!') stack.push({ s: `${par(a)}!`, prec: 6 });
      else if (op === "'") stack.push({ s: `transpose(${a.s})`, prec: PREC_ATOM });
      else if (op === '√') stack.push({ s: `sqrt(${a.s})`, prec: PREC_ATOM });
      else stack.push({ s: `-${par(a)}`, prec: 5 });
      continue;
    }
    if (args !== 2) return null;
    const b = stack.pop();
    const a = stack.pop();
    if (!a || !b) return null;
    const bin = (sym: string, prec: number, rightAssoc = false): void => {
      const l = a.prec < prec || (rightAssoc && a.prec === prec) ? `(${a.s})` : a.s;
      const r =
        b.prec < prec ||
        (!rightAssoc && b.prec === prec) ||
        (rightAssoc && b.prec <= prec && b.prec < PREC_ATOM)
          ? `(${b.s})`
          : b.s;
      stack.push({ s: `${l} ${sym} ${r}`, prec });
    };
    switch (op) {
      case ':':
        bin(':=', 0);
        break;
      case '≡':
      case '=':
        bin('==', 1);
        break;
      case '≠':
        bin('!=', 1);
        break;
      case '<':
      case '>':
        bin(op, 1);
        break;
      case '≤':
        bin('<=', 1);
        break;
      case '≥':
        bin('>=', 1);
        break;
      case '+':
      case '-':
        bin(op, 2);
        break;
      case '*':
      case '/':
      case '·':
        bin(op === '·' ? '*' : op, 3);
        break;
      case '^':
        bin('^', 4, true);
        break;
      case '√':
        stack.push({ s: `(${a.s})^(1/(${b.s}))`, prec: 4 });
        break;
      default:
        // неизвестный оператор — честный generic, не молчаливая потеря
        stack.push({ s: `${par(a)} ${op} ${par(b)}`, prec: 2 });
        break;
    }
  }
  if (stack.length !== 1) return null;
  return stack[0]?.s ?? null;
}

/** SMath `=`/показ результата и contract-юнит: `R = kN`. */
function smInputExtra(mathXml: string): { show: boolean; contract: string | null } {
  const show = /<result\b/i.test(mathXml);
  let contract: string | null = null;
  const cm = mathXml.match(/<contract\b[^>]*>([\s\S]*?)<\/contract>/i);
  if (cm) {
    const els = parseRpnable(cm[1] ?? '');
    const units = els
      .filter((e) => e.type === 'operand')
      .map((e) => e.value)
      .filter(Boolean);
    if (units.length) contract = units.join('*');
  }
  return { show, contract };
}

/** Весь .sm → блоки. Позиции из left/top, иначе лесенка. */
export function parseSmXml(xml: string): ImportResult {
  const notes: string[] = [];
  const blocks: ImportBlock[] = [];
  if (/^\s*PK/.test(xml.slice(0, 8))) {
    return { blocks, notes: ['.smz (zip) не поддерживается — распакуйте в .sm'], format: 'sm' };
  }
  const doc = stripNs(xml);
  const regions = [...doc.matchAll(/<region\b([^>]*?)>([\s\S]*?)<\/region>/gi)];
  if (!regions.length) {
    return { blocks, notes: ['регионы <region> не найдены — не похоже на .sm'], format: 'sm' };
  }
  let autoY = 60;
  let skipped = 0;
  for (const [, head, body] of regions) {
    const x = numOr(attr(head ?? '', 'left'), 80);
    const y = numOr(attr(head ?? '', 'top'), autoY);
    autoY = Math.max(autoY, y) + 72;
    const hasMath = /<math\b/i.test(body ?? '');
    const hasText = /<text\b/i.test(body ?? '');
    const hasPlot = /<plot\b/i.test(body ?? '');
    const hasPicture = /<picture\b/i.test(body ?? '');
    if (hasText && !hasMath && !hasPlot) {
      // <text lang><p> — предпочитаем eng, иначе первый
      const texts = [...(body ?? '').matchAll(/<text\b([^>]*?)>([\s\S]*?)<\/text>/gi)];
      let picked: string | null = null;
      let first: string | null = null;
      for (const [, th, tb] of texts) {
        const ps = [...(tb ?? '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
          .map((m) => decodeEntities((m[1] ?? '').replace(/<[^>]*>/g, '').trim()))
          .filter(Boolean);
        const joined = ps.join('\n');
        if (first === null && joined) first = joined;
        if ((attr(th ?? '', 'lang') ?? '').toLowerCase().startsWith('eng') && joined)
          picked = joined;
      }
      blocks.push({ kind: 'text', body: picked ?? first ?? '', x, y });
      continue;
    }
    if (hasPlot) {
      const inputs = [...(body ?? '').matchAll(/<input\b[^>]*>([\s\S]*?)<\/input>/gi)];
      const fns: string[] = [];
      for (const [, ib] of inputs) {
        const s = rpnToInfix(parseRpnable(ib ?? ''));
        if (s) fns.push(s);
      }
      if (!fns.length) {
        skipped++;
        continue;
      }
      blocks.push({ kind: 'plot', body: fns.join('; '), x, y });
      continue;
    }
    if (hasMath) {
      const mathXml = (body ?? '').match(/<math\b[^>]*>([\s\S]*?)<\/math>/i)?.[1] ?? '';
      const inputXml = mathXml.match(/<input\b[^>]*>([\s\S]*?)<\/input>/i)?.[1] ?? mathXml;
      const s = rpnToInfix(parseRpnable(inputXml));
      if (!s) {
        skipped++;
        notes.push(`math-регион @${Math.round(y)} не разобран (сложный RPN) — пропущен`);
        continue;
      }
      const { show, contract } = smInputExtra(mathXml);
      let line = s;
      if (contract) line += ` = ${contract}`;
      else if (show && !/[=:]/.test(line)) line += ' =';
      blocks.push({ kind: 'math', body: line, x, y });
      continue;
    }
    if (hasPicture) {
      skipped++;
      continue;
    }
    skipped++;
  }
  if (skipped) notes.push(`пропущено регионов: ${skipped} (картинки/области/несобранное)`);
  noteUnsupportedFunctions(blocks, notes);
  return { blocks, notes, format: 'sm' };
}

/* ---------------- Calcpad .cpd/.txt ---------------- */

const CPD_UNIT_RHS = /^[A-Za-z_µΩ°][A-Za-z_0-9µΩ°%'"./^* ]*$/;

/**
 * `;` → `,` только внутри КРУГЛЫХ скобок (аргументы f(x; y)).
 * В `[...]` не трогаем: у нас `;` — разделитель строк матрицы.
 */
function semicolonsToCommas(line: string): string {
  let depth = 0;
  let instr: string | null = null;
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (instr) {
      out += c;
      if (c === instr) instr = null;
      else if (c === '\\') {
        out += line[i + 1] ?? '';
        i++;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      instr = c;
      out += c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    out += c === ';' && depth > 0 ? ',' : c;
  }
  return out;
}

/** Первое `=` на нулевой глубине вне строк (не ==, <=, >=, !=, :=). */
function firstEq(line: string): number {
  let depth = 0;
  let instr: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (instr) {
      if (c === instr) instr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      instr = c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === '=' && depth === 0) {
      const prev = line[i - 1] ?? '';
      const next = line[i + 1] ?? '';
      if (
        prev === ':' ||
        prev === '=' ||
        prev === '!' ||
        prev === '<' ||
        prev === '>' ||
        next === '='
      )
        continue;
      return i;
    }
  }
  return -1;
}

/** `$Plot { f & g @ x = a : b }` → plot-блок. */
function parsePlotLine(line: string, notes: string[], ln: number): ImportBlock | null {
  const m = line.match(/^\$(Plot|Map)\s*\{([\s\S]*)\}\s*$/i);
  if (!m) return null;
  const isMap = (m[1] ?? '').toLowerCase() === 'map';
  const inner = m[2] ?? '';
  const at = inner.lastIndexOf('@');
  const fnsRaw = (at >= 0 ? inner.slice(0, at) : inner).trim();
  const rangeRaw = at >= 0 ? inner.slice(at + 1).trim() : '';
  const fns = fnsRaw
    .split('&')
    .map((s) => s.trim())
    .filter(Boolean);
  const ranges = rangeRaw.split('&').map((s) => s.trim());
  const rangeNums = (r: string): [number, number] | null => {
    const mm = r.match(
      /=\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/,
    );
    return mm ? [Number(mm[1]), Number(mm[2])] : null;
  };
  const xr = rangeNums(ranges[0] ?? '');
  const yr = ranges[1] ? rangeNums(ranges[1]) : null;
  if (!fns.length) {
    notes.push(`строка ${ln}: пустой $Plot — пропущен`);
    return null;
  }
  const body = isMap ? fns.map(semicolonsToCommas).join(', ') : fns.join('; ');
  if (isMap) {
    return {
      kind: 'contour',
      body,
      plotXmin: xr?.[0],
      plotXmax: xr?.[1],
      plotYmin: yr?.[0],
      plotYmax: yr?.[1],
      x: 80,
      y: 60,
    };
  }
  return { kind: 'plot', body, plotXmin: xr?.[0], plotXmax: xr?.[1], x: 80, y: 60 };
}

/** Весь .cpd/.txt → блоки (позиции расставит вызывающий код). */
export function parseCpd(text: string): ImportResult {
  const notes: string[] = [];
  const blocks: ImportBlock[] = [];
  const push = (b: ImportBlock): void => {
    blocks.push(b);
  };
  const lines = text.split('\n');
  lines.forEach((raw, idx) => {
    const ln = idx + 1;
    const line = raw.trim();
    if (!line) return;
    // комментарии: "Title" / 'text' целиком строкой
    const qm = line.match(/^("([^"]*)"|'([^']*)')$/);
    if (qm) {
      push({ kind: 'text', body: (qm[2] ?? qm[3] ?? '').trim(), x: 80, y: 60 });
      return;
    }
    // графики
    if (/^\$(Plot|Map)\s*\{/i.test(line)) {
      const p = parsePlotLine(line, notes, ln);
      if (p) push(p);
      return;
    }
    // директивы #if/#round/... — текстом, ничего не теряем
    if (line.startsWith('#')) {
      push({ kind: 'text', body: line, x: 80, y: 60 });
      return;
    }
    // input-форма `... ?` → `?` срезаем с пометкой (формы ввода задайте вручную)
    let code = line;
    const qIdx = code.indexOf('?');
    if (qIdx >= 0) {
      code = code.slice(0, qIdx).trim();
      notes.push(`строка ${ln}: input-форма «?» → обычная строка (форму ввода задайте вручную)`);
      if (!code) return;
    }
    // `;` → `,` в аргументах
    code = semicolonsToCommas(code);
    // целевые единицы `expr|unit` → `expr = unit` (в RHS присваивания или во всей строке)
    const pipeUnit = (s: string): string | null => {
      const pipe = s.lastIndexOf('|');
      if (pipe <= 0) return null;
      const rhs = s.slice(pipe + 1).trim();
      const lhs = s.slice(0, pipe).trim();
      if (!rhs || !lhs || !CPD_UNIT_RHS.test(rhs)) return null;
      return `${lhs} = ${rhs}`;
    };
    // `=` → `:=` для определений
    const eq = firstEq(code);
    if (eq >= 0) {
      const lhs = code.slice(0, eq).trim();
      if (/^[A-Za-z_]\w*(\s*\([^)]*\))?$/.test(lhs)) {
        const fnArgs = lhs.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)$/);
        const head = fnArgs ? `${fnArgs[1]}(${fnArgs[2]})` : lhs;
        let rhs = code.slice(eq + 1).trim();
        rhs = pipeUnit(rhs) ?? rhs;
        code = `${head} := ${rhs}`;
      }
    } else if (!/[<>=!]/.test(code)) {
      code = pipeUnit(code) ?? code;
    }
    push({ kind: 'math', body: code, x: 80, y: 60 });
  });
  noteUnsupportedFunctions(blocks, notes);
  return { blocks, notes, format: 'cpd' };
}

/* ---------------- Mathcad .xmcd / .xmcdz / .mcdx (XML → NyaMath) ---------------- */

/** Узел registry-дерева, собраного регулярками (без DOM — работает в node). */
interface XNode {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: XNode[];
}

const X_LOCAL = (name: string): string => {
  const i = name.lastIndexOf(':');
  return i >= 0 ? name.slice(i + 1) : name;
};

function parseXmlTree(xml: string): XNode[] {
  const root: XNode = { name: '#root', attrs: {}, text: '', children: [] };
  const stack: XNode[] = [root];
  const re =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[5] !== undefined) {
      const cur = stack[stack.length - 1];
      if (cur) cur.text += decodeEntities(m[5]);
      continue;
    }
    const closing = m[1] === '/';
    const name = X_LOCAL(m[2] ?? '');
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]?.name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const head = m[3] ?? '';
    const node: XNode = { name, attrs: {}, text: '', children: [] };
    const ar = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let am: RegExpExecArray | null;
    while ((am = ar.exec(head)) !== null) {
      node.attrs[am[1] as string] = am[2] ?? am[3] ?? '';
    }
    stack[stack.length - 1]?.children.push(node);
    if (m[4] !== '/') stack.push(node);
  }
  return root.children;
}

function findChild(n: XNode, name: string): XNode | null {
  return n.children.find((c) => c.name === name) ?? null;
}
function findFirst(nodes: XNode[], name: string): XNode | null {
  for (const n of nodes) {
    if (n.name === name) return n;
    const hit = findFirst(n.children, name);
    if (hit) return hit;
  }
  return null;
}

/** Текст региона: <p> построчно, вложенные <b>/<c>/<i> — прозрачные. */
function textLines(node: XNode): string[] {
  const out: string[] = [];
  const walk = (n: XNode): void => {
    if (n.name === 'p') {
      let s = n.text;
      for (const c of n.children) s += collect(c);
      const line = s.replace(/\s+/g, ' ').trim();
      if (line) out.push(line);
      return;
    }
    for (const c of n.children) walk(c);
  };
  const collect = (n: XNode): string => {
    let s = n.text;
    for (const c of n.children) s += collect(c);
    return s;
  };
  walk(node);
  if (!out.length) {
    const s = collect(node).replace(/\s+/g, ' ').trim();
    if (s) out.push(s);
  }
  return out;
}

/** Приоритеты операций NyaMath (чем больше — тем сильнее связывает). */
const MX_PREC: Record<string, number> = {
  define: 0,
  eval: 0,
  symEval: 0,
  sequence: 1,
  equal: 2,
  lessThan: 2,
  greaterThan: 2,
  lessOrEqual: 2,
  greaterOrEqual: 2,
  notEqual: 2,
  and: 2,
  or: 2,
  plus: 3,
  minus: 3,
  mult: 4,
  div: 4,
  pow: 5,
  neg: 6,
  indexer: 8,
  factorial: 8,
  transpose: 8,
};
const MX_ATOM = 9;

function mxPrec(n: XNode): number {
  if (n.name === 'apply') return MX_PREC[X_LOCAL(n.children[0]?.name ?? '')] ?? 6;
  return MX_PREC[n.name] ?? (n.name === 'id' || n.name === 'real' ? MX_ATOM : 7);
}

function mxWrap(s: string, prec: number, ctx: number): string {
  return prec < ctx ? `(${s})` : s;
}

/** Имена единиц Mathcad → короткие обозначения NyaMath (mathjs). */
const MX_UNITS: Record<string, string> = {
  meter: 'm',
  meters: 'm',
  metre: 'm',
  second: 's',
  seconds: 's',
  sec: 's',
  gram: 'g',
  gramme: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  newton: 'N',
  newtons: 'N',
  pascal: 'Pa',
  pascals: 'Pa',
  joule: 'J',
  joules: 'J',
  watt: 'W',
  watts: 'W',
  ampere: 'A',
  amperes: 'A',
  volt: 'V',
  volts: 'V',
  ohm: 'ohm',
  ohms: 'ohm',
  hertz: 'Hz',
  tesla: 'T',
  weber: 'Wb',
  henry: 'H',
  farad: 'F',
  coulomb: 'C',
  lux: 'lx',
  lumen: 'lm',
  candela: 'cd',
  kelvin: 'K',
  minute: 'min',
  minutes: 'min',
  hour: 'hr',
  hours: 'hr',
  day: 'day',
  degree: 'deg',
  radian: 'rad',
  radians: 'rad',
  percent: '%',
  liter: 'L',
  litres: 'L',
  litre: 'L',
  liters: 'L',
  bar: 'bar',
  atmosphere: 'atm',
  atmosphere_technical: 'atm',
  pound: 'lb',
  pound_force: 'lbf',
  foot: 'ft',
  feet: 'ft',
  inch: 'in',
  inches: 'in',
  mile: 'mi',
  yard: 'yd',
  ton: 'ton',
  psi: 'psi',
  rpm: 'rpm',
  acre: 'acre',
  gallon: 'gal',
  Gallon: 'gal',
};

const MX_GREEK: Record<string, string> = {
  'π': 'pi',
  '∞': 'Infinity',
  'τ': 'tau',
  '✓': 'sqrt',
};

/** Служебные узлы provenance — не операнды (иначе в формуле появляются пустые `* *`). */
const MX_META = new Set([
  'originRef',
  'parentRef',
  'comment',
  'originComment',
  'contentHash',
  'hash',
]);

/** Прореживаем provenance: он оборачивает выражение, но сам не операция. */
function mxExprChildren(n: XNode): XNode[] {
  const out: XNode[] = [];
  for (const c of n.children) {
    if (c.name === 'provenance') {
      out.push(...c.children.filter((x) => !MX_META.has(X_LOCAL(x.name))));
    } else out.push(c);
  }
  return out;
}

function mxRender(n: XNode, ctx = 0): string {
  const name = X_LOCAL(n.name);
  const kids = mxExprChildren(n);
  const prec = mxPrec(n);
  const wrap = (s: string): string => mxWrap(s, prec, ctx);

  if (name === 'id') {
    let s = (n.text ?? '').trim();
    s = MX_GREEK[s] ?? s;
    const sub = n.attrs['subscript'] ?? '';
    if (sub) s += `_${sub.replace(/\s+/g, '')}`;
    return s;
  }
  if (name === 'real') {
    let s = (n.text ?? '').trim();
    if (s.startsWith('.')) s = `0${s}`;
    if (s.startsWith('-.')) s = `-0${s.slice(1)}`;
    return s;
  }
  if (name === 'str') return `"${(n.text ?? '').replace(/"/g, '\\"')}"`;
  if (name === 'parens') return `(${kids.map((k) => mxRender(k, 0)).join(', ')})`;
  if (name === 'result' || name === 'symResult' || name === 'unitOverride') return '';
  if (name === 'provenance') return kids.length ? mxRender(kids[0] as XNode, ctx) : '';

  if (name === 'define') {
    if (kids[1] && X_LOCAL(kids[1].name) === 'program') return ''; // → program-блок
    const lhs = kids[0] ? mxRender(kids[0], 0) : '';
    const rhs = kids[1] ? mxRender(kids[1], 0) : '';
    return lhs && rhs ? `${lhs} := ${rhs}` : '';
  }
  if (name === 'eval') return kids[0] ? `${mxRender(kids[0] as XNode, 0)} =` : '';
  if (name === 'symEval') return kids[0] ? `${mxRender(kids[0] as XNode, 0)} →` : '';

  if (name === 'function') {
    const f = kids[0] ? mxRender(kids[0], 0) : '';
    const argsNode = kids[1];
    const args = argsNode
      ? argsNode.children.map((a) => mxRender(a, 0)).join(', ')
      : '';
    return `${f}(${args})`;
  }
  if (name === 'boundVars' || name === 'sequence')
    return kids.map((k) => mxRender(k, 0)).join(', ');
  if (name === 'range') return kids.map((k) => mxRender(k, 0)).join('..');
  if (name === 'lambda') return kids.map((k) => mxRender(k, 0)).join(' → ');

  if (name === 'unitedValue') {
    const val = kids[0] ? mxRender(kids[0], 4) : '';
    const unit = kids[1] ? mxRender(kids[1], 5) : '';
    return val && unit ? wrap(`${val} * ${unit}`) : val || unit;
  }
  if (name === 'unitMonomial')
    return kids.map((k) => mxRender(k, 5)).join(' * ');
  if (name === 'unitReference') {
    const raw = n.attrs['unit'] ?? '';
    let s = MX_UNITS[raw] ?? raw;
    const pn = n.attrs['power-numerator'];
    const pd = n.attrs['power-denominator'];
    if (pn) s += `^${pn}`;
    if (pd) s += `^(${pd === '1' ? '-1' : `-(${pd})`})`;
    return s;
  }

  if (name === 'matrix') {
    const rows = Math.max(0, Number(n.attrs['rows']) || 0);
    const cols = Math.max(0, Number(n.attrs['cols']) || 0);
    if (!rows || !cols) return `[${kids.map((k) => mxRender(k, 0)).join(', ')}]`;
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) cells.push(mxRender(kids[c * rows + r] as XNode, 0));
    }
    const line: string[] = [];
    for (let r = 0; r < rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < cols; c++) row.push(cells[c * rows + r] ?? '0');
      line.push(row.join(', '));
    }
    return `[${line.join('; ')}]`;
  }

  if (name === 'apply') {
    const opNode = kids[0];
    if (!opNode) return '';
    // `<apply><id>log</id>…</apply>` — вызов функции по имени. Раньше брали
    // имя тега (`id`) вместо текста (`log`, `identity`, `last`, …) — отсюда
    // «id(K, 2)» в переведённых листах.
    const rawOp = X_LOCAL(opNode.name) === 'id' ? mxRender(opNode, 0) : X_LOCAL(opNode.name);
    const op = mapMathcadFunctionName(rawOp);
    // Обычно `<apply><sum/><bounds/><lambda/></apply>`, но встречается и
    // `<apply><sum><bounds/><lambda/></sum></apply>` — поддерживаем оба вида.
    const args = kids.length > 1 ? kids.slice(1) : mxExprChildren(opNode);
    const at = (i: number): XNode | undefined => args[i];
    const bin = (sym: string, p: number, rightAssoc = false): string => {
      const a = at(0);
      const b = at(1);
      if (!a || !b) return `${op}(${args.map((x) => mxRender(x, 0)).join(', ')})`;
      return `${mxRender(a, p)} ${sym} ${mxRender(b, rightAssoc ? p : p + 1)}`;
    };
    switch (op) {
      case 'mult':
        return wrap(bin('*', 4));
      case 'div':
        return wrap(bin('/', 4));
      case 'plus':
        return wrap(bin('+', 3));
      case 'minus':
        return wrap(bin('-', 3));
      case 'pow':
        return wrap(bin('^', 5, true));
      case 'equal':
        return wrap(bin('==', 2));
      case 'lessThan':
        return wrap(bin('<', 2));
      case 'greaterThan':
        return wrap(bin('>', 2));
      case 'lessOrEqual':
      case 'lessThanOrEqual':
        return wrap(bin('<=', 2));
      case 'greaterOrEqual':
      case 'greaterThanOrEqual':
        return wrap(bin('>=', 2));
      case 'notEqual':
        return wrap(bin('!=', 2));
      case 'and':
        return wrap(bin('and', 2));
      case 'or':
        return wrap(bin('or', 2));
      case 'sqrt': {
        const a = at(0);
        return a ? `sqrt(${mxRender(a, 0)})` : 'sqrt()';
      }
      case 'nthRoot': {
        const a = at(0);
        const b = at(1);
        return a && b ? `(${mxRender(a, 0)}) ^ (1/(${mxRender(b, 0)}))` : 'sqrt()';
      }
      case 'absval': {
        const a = at(0);
        return a ? `abs(${mxRender(a, 0)})` : 'abs()';
      }
      case 'neg': {
        const a = at(0);
        return a ? wrap(`-${mxRender(a, 6)}`) : '';
      }
      case 'indexer': {
        const a = at(0);
        if (!a) return '';
        return `${mxRender(a, 8)}[${args.slice(1).map((x) => mxRender(x, 0)).join(', ')}]`;
      }
      case 'factorial': {
        const a = at(0);
        return a ? `${mxRender(a, 8)}!` : '';
      }
      case 'transpose': {
        const a = at(0);
        return a ? `transpose(${mxRender(a, 0)})` : '';
      }
      case 'summation':
      case 'product':
      case 'integral': {
        const bnd = args.find((x) => X_LOCAL(x.name) === 'bounds');
        const lam = args.find((x) => X_LOCAL(x.name) === 'lambda');
        if (!lam) return `${op}(${args.map((x) => mxRender(x, 0)).join(', ')})`;
        const vars = lam.children[0] ? mxRender(lam.children[0] as XNode, 0) : 'k';
        const body = lam.children[1] ? mxRender(lam.children[1] as XNode, 0) : '';
        const lo = bnd?.children[0] ? mxRender(bnd.children[0] as XNode, 0) : '1';
        const hi = bnd?.children[1] ? mxRender(bnd.children[1] as XNode, 0) : 'Infinity';
        const q = (s: string): string => s.replace(/"/g, '\\"');
        if (op === 'summation') return `numsum("${q(body)}", "${q(vars)}", ${lo}, ${hi})`;
        if (op === 'product') return `numprod("${q(body)}", "${q(vars)}", ${lo}, ${hi})`;
        return `nint("${q(body)}", "${q(vars)}", ${lo}, ${hi})`;
      }
      default:
        return `${op}(${args.map((x) => mxRender(x, 0)).join(', ')})`;
    }
  }

  if (name === 'program') return mxProgram(n);
  if (name === 'ifThen' || name === 'otherwise') {
    const parts = kids.map((k) => mxRender(k, 0)).filter(Boolean);
    return parts.join(' → ');
  }
  return kids.length ? wrap(kids.map((k) => mxRender(k, 0)).join(', ')) : (n.text ?? '').trim();
}

/** Mathcad-программа → текст program-блока NyaMath (`for … in …`, `if/else/end`). */
function mxProgram(n: XNode): string {
  const lines: string[] = [];
  const statements = (list: XNode[], indent: number): void => {
    const pad = '  '.repeat(indent);
    for (let i = 0; i < list.length; i++) {
      const c = list[i] as XNode;
      const name = X_LOCAL(c.name);
      const kids = mxExprChildren(c);
      if (name === 'program') {
        // Тело цикла/ветвления — вложенный <program>, а не плоский список.
        statements(kids, indent);
        continue;
      }
      if (name === 'localDefine' || name === 'define') {
        const lhs = kids[0] ? mxRender(kids[0], 0).trim() : '';
        const rhs = kids[1] ? mxRender(kids[1], 0).trim() : '';
        if (lhs) lines.push(`${pad}${lhs} := ${rhs}`.trimEnd());
        continue;
      }
      if (name === 'for') {
        const v = kids[0] ? mxRender(kids[0], 0).trim() : 'i';
        const range = kids[1] ? mxRender(kids[1], 0).trim() : '1..n';
        lines.push(`${pad}for ${v} in ${range}`);
        statements(kids.slice(2), indent + 1);
        lines.push(`${pad}end`);
        continue;
      }
      if (name === 'ifThen') {
        const cond = kids[0] ? mxRender(kids[0], 0).trim() : 'true';
        // `otherwise` — соседний сиблинг, а не ребёнок: собираем if/else/end вместе.
        const otherwise =
          i + 1 < list.length && X_LOCAL((list[i + 1] as XNode).name) === 'otherwise'
            ? ((list[++i] as XNode))
            : null;
        lines.push(`${pad}if ${cond}`);
        statements(kids.slice(1), indent + 1);
        if (otherwise) {
          lines.push(`${pad}else`);
          statements(mxExprChildren(otherwise), indent + 1);
        }
        lines.push(`${pad}end`);
        continue;
      }
      if (name === 'otherwise') continue; // уже подобран выше
      const s = mxRender(c, 0).trim();
      if (s) lines.push(`${pad}${s}`);
    }
  };
  statements(mxExprChildren(n), 0);
  return lines.join('\n');
}

const MX_EXPR_NAMES = new Set([
  'define',
  'eval',
  'symEval',
  'apply',
  'id',
  'real',
  'str',
  'function',
  'parens',
  'matrix',
  'sequence',
  'range',
  'unitedValue',
  'unitMonomial',
  'program',
  'result',
  'symResult',
]);

/** Весь Mathcad worksheet → блоки. Позиции из left/top; сетку разнесут вызывающие. */
export function parseXmcd(xml: string): ImportResult {
  const notes: string[] = [];
  const blocks: ImportBlock[] = [];
  const nodes = parseXmlTree(xml);
  const sheet = findFirst(nodes, 'regions');
  const regions = sheet ? sheet.children.filter((c) => c.name === 'region') : findAllNodes(nodes, 'region');
  if (!regions.length) {
    return { blocks, notes: ['<regions> не найдены — не похоже на Mathcad .xmcd'], format: 'xmcd' };
  }
  let autoY = 60;
  let skipped = 0;
  for (const r of regions) {
    const x = numOr(r.attrs['left'] ?? null, 80);
    const y = numOr(r.attrs['top'] ?? null, autoY);
    autoY = Math.max(autoY, y) + 72;
    const text = findChild(r, 'text');
    const math = findChild(r, 'math');
    if (text) {
      const lines = textLines(text);
      if (lines.length) {
        blocks.push({ kind: 'text', body: lines.join('\n'), x, y });
      } else {
        skipped++;
        notes.push(`текстовый регион @${Math.round(y)} пуст (Prime XAML) — пропущен`);
      }
      continue;
    }
    if (math) {
      let exprs = mxExprChildren(math).filter((c) => MX_EXPR_NAMES.has(X_LOCAL(c.name)));
      if (!exprs.length) {
        const prov = findChild(math, 'provenance');
        if (prov) exprs = mxExprChildren(prov).filter((c) => MX_EXPR_NAMES.has(X_LOCAL(c.name)));
      }
      if (!exprs.length) {
        skipped++;
        continue;
      }
      for (const e of exprs) {
        const name = X_LOCAL(e.name);
        if (name === 'result' || name === 'symResult') continue;
        // `<define>x := <program>…` → program-блок с exportName=x
        if (name === 'define') {
          const kids = mxExprChildren(e);
          const rhs = kids[1];
          if (rhs && X_LOCAL(rhs.name) === 'program') {
            const lhs = mxRender(kids[0] as XNode, 0).trim();
            blocks.push({
              kind: 'program',
              body: mxProgram(rhs),
              exportName: lhs,
              x,
              y,
            });
            notes.push(
              `Mathcad-программа @${Math.round(y)} → program-блок (результат как ${lhs || 'exportName'})`,
            );
            continue;
          }
        }
        const body = name === 'program' ? mxProgram(e) : mxRender(e, 0).trim();
        if (!body) continue;
        blocks.push({ kind: name === 'program' ? 'program' : 'math', body, x, y });
        if (name === 'program')
          notes.push('Mathcad-программа → program-блок (проверьте условия/ветви)');
      }
      continue;
    }
    skipped++;
  }
  if (skipped) notes.push(`пропущено регионов Mathcad: ${skipped} (графики/картинки/пустые)`);
  noteUnsupportedFunctions(blocks, notes);
  return { blocks, notes, format: 'xmcd' };
}

function findAllNodes(nodes: XNode[], name: string): XNode[] {
  const out: XNode[] = [];
  const walk = (list: XNode[]): void => {
    for (const n of list) {
      if (n.name === name) out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

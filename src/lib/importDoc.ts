/**
 * Импорт чужих листов в NyaMath (MCP nya_import): SMath Studio .sm (XML, RPN)
 * и Calcpad .cpd/.txt (plain text). Best-effort: формулы переносятся,
 * экзотика — в notes (ничего молча не теряем). Чистый модуль без DOM
 * (регулярный XML-парсер — работает и в node MCP-сервера).
 */

export type ImportKind = 'math' | 'text' | 'plot' | 'contour';

export interface ImportBlock {
  kind: ImportKind;
  /** math/text: формула; plot/contour: fn */
  body: string;
  plotXmin?: number;
  plotXmax?: number;
  plotYmin?: number;
  plotYmax?: number;
  x: number;
  y: number;
}

export interface ImportResult {
  blocks: ImportBlock[];
  notes: string[];
  format: 'sm' | 'cpd';
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
      stack.push({ s: `${el.value}(${argv.join(', ')})`, prec: PREC_ATOM });
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
  return { blocks, notes, format: 'cpd' };
}

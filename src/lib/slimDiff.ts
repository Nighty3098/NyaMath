import type { MathBlockData } from '../engine/dependencies';

/**
 * Git-friendly diff документов: канонический JSONL (блок = строка,
 * порядок сверху-вниз, стабильные ключи) + unified diff. Идёт в nya_diff:
 * агент видит изменения документа как патч, а не простыню JSON.
 * Чистый модуль без DOM.
 */

/** Тело блока для diff-строки (конфиг, влияющий на расчёт/вид). */
function diffBody(b: MathBlockData): string {
  switch (b.kind) {
    case 'math':
    case 'text':
    case 'program':
      return b.rawInput;
    case 'plot':
    case 'plot3d':
    case 'contour':
      return `${b.plotFn ?? ''} [${b.plotXmin ?? ''}, ${b.plotXmax ?? ''}]`;
    case 'slider':
      return `${b.sliderVar ?? '?'} ${b.sliderMin ?? ''}..${b.sliderMax ?? ''}/${b.sliderStep ?? ''} =${b.sliderVal ?? ''}`;
    case 'sim':
      return `${b.simStates ?? ''} | ${b.simDerivs ?? ''} | ${b.simInit ?? ''} | ${b.simSolver ?? ''}`;
  }
}

/** Недефолтный конфиг одной строкой (отсортированные ключи для стабильности). */
function diffExtra(b: MathBlockData): string {
  const extra: Record<string, unknown> = {};
  if (b.exportName) extra['export'] = b.exportName;
  if (b.disabled) extra['disabled'] = true;
  if (b.kind === 'plot' || b.kind === 'plot3d' || b.kind === 'contour') {
    if (b.plotTitle) extra['title'] = b.plotTitle;
    if (b.plotProj && b.plotProj !== 'xy') extra['proj'] = b.plotProj;
    if (b.plotTrace && b.plotTrace !== 'line') extra['trace'] = b.plotTrace;
  }
  const keys = Object.keys(extra).sort();
  if (!keys.length) return '';
  return ` ${JSON.stringify(extra, keys)}`;
}

/** Одна каноническая строка блока. Координаты округлены (стабильность). */
export function diffLine(b: MathBlockData): string {
  const x = Math.round((b.x ?? 0) * 100) / 100;
  const y = Math.round((b.y ?? 0) * 100) / 100;
  return JSON.stringify({ kind: b.kind, x, y, body: diffBody(b) }) + diffExtra(b);
}

/** Весь документ каноническим JSONL, сверху-вниз (порядок вычислений). */
export function slimText(blocks: MathBlockData[]): string[] {
  return [...blocks]
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .map(diffLine);
}

/** LCS-таблица с капом: большие документы — позиционное сравнение. */
function lcsTable(a: string[], b: string[]): number[][] | null {
  if (a.length * b.length > 4000000) return null;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? (dp[i + 1][j + 1] ?? 0) + 1 : Math.max(dp[i + 1][j] ?? 0, dp[i][j + 1] ?? 0);
    }
  }
  return dp;
}

interface Op {
  tag: ' ' | '-' | '+';
  text: string;
  ai: number;
  bi: number;
}

/** Плоский список операций (контекст/удаление/добавление) с индексами строк. */
function diffOps(base: string[], cur: string[]): Op[] {
  const ops: Op[] = [];
  const dp = lcsTable(base, cur);
  if (!dp) {
    // фолбэк без LCS: построчно по индексу (честно для append/prepend)
    const n = Math.max(base.length, cur.length);
    for (let i = 0; i < n; i++) {
      if (i < base.length && i < cur.length) {
        if (base[i] === cur[i]) ops.push({ tag: ' ', text: base[i] as string, ai: i, bi: i });
        else {
          ops.push({ tag: '-', text: base[i] as string, ai: i, bi: -1 });
          ops.push({ tag: '+', text: cur[i] as string, ai: -1, bi: i });
        }
      } else if (i < base.length) {
        ops.push({ tag: '-', text: base[i] as string, ai: i, bi: -1 });
      } else {
        ops.push({ tag: '+', text: cur[i] as string, ai: -1, bi: i });
      }
    }
    return ops;
  }
  let i = 0;
  let j = 0;
  while (i < base.length && j < cur.length) {
    if (base[i] === cur[j]) {
      ops.push({ tag: ' ', text: base[i] as string, ai: i, bi: j });
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      ops.push({ tag: '-', text: base[i] as string, ai: i, bi: -1 });
      i++;
    } else {
      ops.push({ tag: '+', text: cur[j] as string, ai: -1, bi: j });
      j++;
    }
  }
  while (i < base.length) {
    ops.push({ tag: '-', text: base[i] as string, ai: i, bi: -1 });
    i++;
  }
  while (j < cur.length) {
    ops.push({ tag: '+', text: cur[j] as string, ai: -1, bi: j });
    j++;
  }
  return ops;
}

const DIFF_CONTEXT = 3;
const DIFF_MAX_LINES = 200;

/** Unified diff с контекстом 3 и капом 200 строк. */
export function unifiedDiff(base: string[], cur: string[]): { text: string; additions: number; deletions: number; truncated: boolean } {
  const ops = diffOps(base, cur);
  let additions = 0;
  let deletions = 0;
  for (const o of ops) {
    if (o.tag === '+') additions++;
    if (o.tag === '-') deletions++;
  }
  if (additions === 0 && deletions === 0) {
    return { text: '', additions: 0, deletions: 0, truncated: false };
  }
  // ханки: изменения ± контекст, склейка при пересечении
  const marks = new Array<boolean>(ops.length).fill(false);
  ops.forEach((o, k) => {
    if (o.tag !== ' ') {
      for (let d = -DIFF_CONTEXT; d <= DIFF_CONTEXT; d++) {
        if (k + d >= 0 && k + d < ops.length) marks[k + d] = true;
      }
    }
  });
  const out: string[] = [];
  out.push(`--- a/doc (${base.length} blocks)`);
  out.push(`+++ b/doc (${cur.length} blocks)`);
  let k = 0;
  let truncated = false;
  while (k < ops.length) {
    if (!marks[k]) {
      k++;
      continue;
    }
    let e = k;
    while (e < ops.length && marks[e]) e++;
    // номера строк (1-based) по каждой стороне
    const first = ops[k] as Op;
    const prev = k > 0 ? (ops[k - 1] as Op) : null;
    const bs = first.ai >= 0 ? first.ai + 1 : (prev && prev.ai >= 0 ? prev.ai + 2 : 1);
    const cs = first.bi >= 0 ? first.bi + 1 : (prev && prev.bi >= 0 ? prev.bi + 2 : 1);
    let bc = 0;
    let cc = 0;
    const body: string[] = [];
    for (let m = k; m < e; m++) {
      const o = ops[m] as Op;
      if (o.tag !== '+') bc++;
      if (o.tag !== '-') cc++;
      body.push(`${o.tag}${o.text}`);
    }
    out.push(`@@ -${bs},${bc} +${cs},${cc} @@`);
    for (const line of body) {
      if (out.length >= DIFF_MAX_LINES + 3) {
        truncated = true;
        break;
      }
      out.push(line);
    }
    if (truncated) break;
    k = e;
  }
  if (truncated) out.push(`... truncated (${additions} addition(s), ${deletions} deletion(s) total)`);
  return { text: out.join('\n'), additions, deletions, truncated };
}

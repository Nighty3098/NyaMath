import { createBaseScope, evaluateLine, extractDependencies, formatResult, isValidVarName, parseLine, toLatex, valueToLatex, type Scope } from './mathEngine';
import { analyzeProgram, runProgram } from './program';
import { sampleExpression, type PlotSample } from './plotSample';

export interface MathBlockData {
  id: string;
  x: number;
  y: number;
  rawInput: string;
  displayLatex: string;
  resultStr: string;
  /** LaTeX результата (матрицы/bmatrix, комплексные) — рендерится через KaTeX */
  resultLatex: string;
  resultValue: unknown;
  error: string | null;
  dependencies: string[];
  definedVar: string | null;
  /** true, если последняя строка блока — вывод (expr / expr =): результат показываем инлайн */
  isOutput: boolean;
  kind: 'math' | 'plot' | 'text' | 'program' | 'plot3d';
  plotFn?: string;
  plotXmin?: number;
  plotXmax?: number;
  /** 3D: диапазон по y, режим, разрешение сетки, каркас поверх поверхности */
  plotYmin?: number;
  plotYmax?: number;
  plotMode?: 'auto' | 'surface' | 'points' | 'matrix';
  plotResolution?: number;
  plotWireframe?: boolean;
  /** Имя переменной, в которую программный блок экспортирует результат */
  exportName?: string;
  /** Ручной размер: w — ширина региона/графика, h — высота графика. null = авто */
  w?: number | null;
  h?: number | null;
  /** Автографик: превью функции под формулой (f(x) := …, sin(x) = …) */
  plotPreview?: PlotSample | null;
}

export interface RecalcResult {
  blocks: Record<string, MathBlockData>;
  scope: Scope;
}

export function sortBlocksTopDown(blocks: MathBlockData[]): MathBlockData[] {
  return [...blocks].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

function blockDeps(b: MathBlockData): string[] {
  if (b.kind === 'program') {
    try {
      return analyzeProgram(b.rawInput).dependencies;
    } catch {
      return [];
    }
  }
  const deps = new Set<string>();
  for (const line of b.rawInput.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('#')) continue;
    try {
      const p = parseLine(t);
      for (const d of extractDependencies(p.expr, p.fnParams)) deps.add(d);
    } catch { /* ignore */ }
  }
  return [...deps];
}

function blockDefs(b: MathBlockData): string[] {
  if (b.kind === 'program') {
    return b.exportName && isValidVarName(b.exportName) ? [b.exportName] : [];
  }
  if (b.kind !== 'math') return [];
  const defs: string[] = [];
  for (const line of b.rawInput.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('#')) continue;
    try {
      const p = parseLine(t);
      if (p.kind === 'assign' && p.definedVar) defs.push(p.definedVar);
    } catch { /* ignore */ }
  }
  return defs;
}

export function detectCycles(blocks: MathBlockData[]): Set<string> {
  const defMap = new Map<string, string>();
  for (const b of blocks) {
    for (const d of blockDefs(b)) defMap.set(d, b.id);
  }
  const adj = new Map<string, string[]>();
  for (const b of blocks) {
    if (b.kind !== 'math' && b.kind !== 'program') continue;
    const deps = new Set<string>();
    for (const d of blockDeps(b)) {
      const target = defMap.get(d);
      if (target && target !== b.id) deps.add(target);
    }
    adj.set(b.id, [...deps]);
  }
  const visited = new Map<string, number>();
  const cyclic = new Set<string>();
  const stack: string[] = [];
  const dfs = (id: string) => {
    visited.set(id, 1);
    stack.push(id);
    for (const nb of adj.get(id) ?? []) {
      const st = visited.get(nb) ?? 0;
      if (st === 0) dfs(nb);
      else if (st === 1) {
        const i = stack.indexOf(nb);
        for (let k = i; k < stack.length; k++) cyclic.add(stack[k]);
        cyclic.add(nb);
      }
    }
    stack.pop();
    visited.set(id, 2);
  };
  for (const b of blocks) {
    if ((visited.get(b.id) ?? 0) === 0) dfs(b.id);
  }
  return cyclic;
}

export function recalculateAll(list: MathBlockData[]): RecalcResult {
  const ordered = sortBlocksTopDown(list);
  const cyclic = detectCycles(ordered);
  const scope: Scope = createBaseScope();
  const out: Record<string, MathBlockData> = {};
  for (const b of list) out[b.id] = { ...b };

  for (const b of ordered) {
    const cur = out[b.id];
    if (b.kind === 'plot' || b.kind === 'plot3d' || b.kind === 'text') {
      cur.error = null;
      cur.dependencies = [];
      cur.definedVar = null;
      cur.isOutput = false;
      cur.displayLatex = b.rawInput;
      continue;
    }
    if (cyclic.has(b.id)) {
      cur.error = 'Cyclic dependency: цикл в определениях переменных';
      cur.resultStr = '';
      cur.resultLatex = '';
      cur.resultValue = null;
      cur.displayLatex = '';
      cur.dependencies = [];
      cur.definedVar = null;
      cur.isOutput = false;
      continue;
    }

    // ---------- программный блок ----------
    if (b.kind === 'program') {
      const analysis = analyzeProgram(b.rawInput);
      const r = runProgram(b.rawInput, scope);
      cur.dependencies = analysis.dependencies;
      cur.isOutput = true;
      const exp = (b.exportName ?? '').trim();
      cur.definedVar = exp && isValidVarName(exp) ? exp : null;
      if (r.error) {
        cur.error = r.error;
        cur.resultStr = '';
        cur.resultLatex = '';
        cur.resultValue = null;
      } else {
        cur.error = null;
        cur.resultValue = r.value;
        cur.resultStr = formatResult(r.value);
        cur.resultLatex = valueToLatex(r.value);
        if (cur.definedVar) scope[cur.definedVar] = r.value;
      }
      cur.displayLatex = '';
      continue;
    }

    // ---------- обычный мат-блок ----------
    const lines = b.rawInput.split('\n');
    let lastValue: unknown = null;
    let lastError: string | null = null;
    let lastOk = true;
    const allDeps = new Set<string>();
    let definedVar: string | null = null;
    let lastKind: 'assign' | 'output' | 'eval' = 'eval';
    let lastP: ReturnType<typeof parseLine> | null = null;
    const texParts: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t === '' || t.startsWith('//') || t.startsWith('#')) continue;
      try {
        const p = parseLine(t);
        for (const d of extractDependencies(p.expr, p.fnParams)) allDeps.add(d);
        if (p.kind === 'assign' && p.definedVar) definedVar = p.definedVar;
        lastKind = p.kind;
        lastP = p;
        texParts.push(toLatex(t));
      } catch { /* ignore */ }
      const r = evaluateLine(line, scope);
      if (r.error) {
        lastError = r.error;
        lastValue = null;
        lastOk = false;
      } else if (lastError === null) {
        lastValue = r.value;
        lastOk = true;
      }
    }
    cur.dependencies = [...allDeps];
    cur.definedVar = definedVar;
    // `delta := atan(x) =` — присваивание с показом результата
    cur.isOutput = lastKind === 'output' || lastKind === 'eval' || (lastP?.kind === 'assign' && lastP.show);
    cur.displayLatex = texParts.join(' \\\\ ');
    cur.plotPreview = null;

    // ----- Автографик -----
    // 1) определение функции одной переменной: f(t) := t^2 → превью;
    // 2) последняя строка упала, но читается как функция от x: sin(x) = → превью вместо ошибки.
    let sampledParam: string | null = null;
    if (lastP?.kind === 'assign' && lastP.isFunctionDef && lastP.fnParams.length === 1) {
      const param = lastP.fnParams[0];
      const bodyX = lastP.expr.replace(new RegExp(`\\b${param}\\b`, 'g'), 'x');
      const s = sampleExpression(lastP.expr, scope, { varName: param, label: `${lastP.definedVar}(${param})` });
      if (s) {
        cur.plotPreview = { ...s, expr: bodyX };
        sampledParam = param;
      }
    } else if (!lastOk && lastError && lastP) {
      const cand =
        lastP.kind === 'assign' ? lastP.expr.replace(/=+\s*$/, '').trim() : lastP.expr;
      if (cand) {
        const s = sampleExpression(cand, scope, { label: cand });
        if (s) {
          cur.plotPreview = s;
          sampledParam = 'x';
          // выражение осмысленно как график — ошибку не показываем
          lastError = null;
          lastValue = null;
        }
      }
    }
    if (sampledParam) {
      cur.dependencies = cur.dependencies.filter((d) => d !== sampledParam && d !== 'x');
    }

    if (lastError) {
      cur.error = lastError;
      cur.resultStr = '';
      cur.resultLatex = '';
      cur.resultValue = null;
    } else {
      cur.error = null;
      cur.resultValue = lastValue;
      cur.resultStr = formatResult(lastValue);
      cur.resultLatex = valueToLatex(lastValue);
    }
  }
  return { blocks: out, scope };
}

import { createBaseScope, evaluateLine, extractDependencies, formatResult, isValidVarName, parseLine, toLatex, valueToLatex, type Scope } from './mathEngine';
import { analyzeProgram, runProgram } from './program';
import { sampleExpression, type PlotSample } from './plotSample';
import { parseSimDef, runSim, type SimResult, type SimSolver } from './simEngine';
import { t } from '../i18n';

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
  kind: 'math' | 'plot' | 'text' | 'program' | 'plot3d' | 'sim';
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
  /** Sim: модель, состояния, производные, параметры, старт, интервал, решатель, оси */
  simModel?: string;
  simStates?: string;
  simDerivs?: string;
  simAux?: string;
  simParams?: string;
  simInit?: string;
  simT0?: number;
  simT1?: number;
  simDt?: number;
  simSolver?: SimSolver;
  simX?: string;
  simY?: string;
  /** Sim: имя переменной для финального вектора состояний */
  simExport?: string;
  /** Sim: предпочтения плеера (скорость, повтор) */
  simSpeed?: number;
  simLoop?: boolean;
  /** Sim: посчитанная траектория (не пишем в файл/хранилище) */
  simResult?: SimResult | null;
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
  if (b.kind === 'sim') return simDeps(b);
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
  if (b.kind === 'sim') {
    const exp = (b.simExport ?? '').trim();
    return exp && isValidVarName(exp) ? [exp] : [];
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
    if (b.kind !== 'math' && b.kind !== 'program' && b.kind !== 'sim') continue;
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

/** Зависимости sim-блока: переменные из производных/aux/параметров/старта (кроме состояний и t). */
function simDeps(b: MathBlockData): string[] {
  const deps = new Set<string>();
  const states = new Set(
    (b.simStates ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  const texts = [
    b.simDerivs ?? '',
    (b.simAux ?? '').replace(/^([A-Za-z_]\w*)\s*(:=|=)/gm, ''),
    (b.simParams ?? '').replace(/^([A-Za-z_]\w*)\s*(:=|=)/gm, ''),
    b.simInit ?? '',
  ];
  for (const text of texts) {
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('#')) continue;
      for (const part of t.split(';')) {
        try {
          const p = parseLine(part.trim());
          for (const d of extractDependencies(p.expr, p.fnParams)) {
            if (!states.has(d) && d !== 't') deps.add(d);
          }
        } catch { /* ignore */ }
      }
    }
  }
  return [...deps];
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
      cur.error = t('e.cyclicDep');
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

    // ---------- симуляция ----------
    if (b.kind === 'sim') {
      const parsed = parseSimDef({
        states: b.simStates ?? '',
        derivs: b.simDerivs ?? '',
        aux: b.simAux ?? '',
        params: b.simParams ?? '',
        init: b.simInit ?? '',
        t0: b.simT0 ?? 0,
        t1: b.simT1 ?? 10,
        dt: b.simDt ?? 0.01,
        solver: b.simSolver ?? 'rk4',
      });
      cur.dependencies = blockDeps(b);
      cur.isOutput = true;
      const exp = (b.simExport ?? '').trim();
      cur.definedVar = exp && isValidVarName(exp) ? exp : null;
      if (parsed.error || !parsed.def) {
        cur.error = parsed.error;
        cur.simResult = null;
        cur.resultStr = '';
        cur.resultLatex = '';
        cur.resultValue = null;
      } else {
        const r = runSim(parsed.def, scope);
        cur.simResult = r;
        if (r.error) {
          cur.error = r.error;
          cur.resultStr = '';
          cur.resultLatex = '';
          cur.resultValue = null;
        } else {
          cur.error = null;
          cur.resultValue = r.final;
          cur.resultStr = formatResult(r.final);
          cur.resultLatex = valueToLatex(r.final);
          if (cur.definedVar) scope[cur.definedVar] = r.final;
        }
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

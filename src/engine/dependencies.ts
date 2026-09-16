import { createBaseScope, evaluateLine, extractDependencies, formatResult, isValidVarName, parseLine, splitOffUnit, stripOnError, toLatex, valueToLatex, type Scope } from './mathEngine';
import { analyzeProgram, runProgram } from './program';
import { sampleExpression, type PlotSample } from './plotSample';
import { parseSimDef, runSim, type SimResult, type SimSolver, type SimMode } from './simEngine';
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
  kind: 'math' | 'plot' | 'text' | 'program' | 'plot3d' | 'sim' | 'contour' | 'slider';
  /** Слайдер: имя переменной, диапазон, шаг и текущее значение */
  sliderVar?: string;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  sliderVal?: number;
  plotFn?: string;
  plotXmin?: number;
  plotXmax?: number;
  /** Проекция/стиль 2D-графика и оформление для публикации */
  plotProj?: 'xy' | 'polar';
  plotTrace?: 'line' | 'bar' | 'stem';
  plotErr?: string;
  plotTitle?: string;
  plotXLabel?: string;
  plotYLabel?: string;
  plotGrid?: boolean;
  plotLegend?: boolean;
  /** 3D: диапазон по y, режим, разрешение сетки, каркас поверх поверхности */
  plotYmin?: number;
  plotYmax?: number;
  plotMode?: 'auto' | 'surface' | 'points' | 'matrix';
  plotResolution?: number;
  plotWireframe?: boolean;
  /** Имя переменной, в которую программный блок экспортирует результат */
  exportName?: string;
  /** Лог trace-операторов программного блока */
  programTrace?: string[] | null;
  /** Sim: модель, состояния, производные, параметры, старт, интервал, решатель, оси */
  simMode?: SimMode;
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
  simEvents?: string;
  simX?: string;
  simY?: string;
  /** Sim/FDTD: сетка, источник, слои */
  simFdtdN?: number;
  simFdtdL?: number;
  simFdtdSteps?: number;
  simFdtdSrc?: 'gauss' | 'sine';
  simFdtdFreq?: number;
  simFdtdAmp?: number;
  simFdtdSrcX?: number;
  simFdtdDet?: number;
  simFdtdLayers?: string;
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
  if (b.kind === 'slider') return [];
  const deps = new Set<string>();
  for (const line of b.rawInput.split('\n')) {
    const t = stripOnError(line.trim());
    if (!t || t.startsWith('//') || t.startsWith('#')) continue;
    // перевод единиц `L = cm`: зависимости — только из левой части
    const stripped = t.replace(/=+\s*$/, '').trim();
    const [lhsU, unitU] = splitOffUnit(stripped);
    const src = unitU ? lhsU : t;
    try {
      const p = parseLine(src);
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
  if (b.kind === 'slider') {
    const v = (b.sliderVar ?? '').trim();
    return v && isValidVarName(v) && v !== 'i' ? [v] : [];
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
    if (b.kind !== 'math' && b.kind !== 'program' && b.kind !== 'sim' && b.kind !== 'slider') continue;
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

/** Зависимости sim-блока: ODE — из производных/aux/параметров/старта; FDTD — из выражений слоёв. */
function simDeps(b: MathBlockData): string[] {
  const deps = new Set<string>();
  const addExprDeps = (expr: string, skip?: Set<string>) => {
    for (const part of expr.split(';')) {
      try {
        const p = parseLine(part.trim());
        for (const d of extractDependencies(p.expr, p.fnParams)) {
          if (!skip?.has(d) && d !== 't') deps.add(d);
        }
      } catch { /* ignore */ }
    }
  };
  if (b.simMode === 'fdtd') {
    for (const line of (b.simFdtdLayers ?? '').split('\n')) {
      const l = line.trim();
      if (!l || l.startsWith('//') || l.startsWith('#')) continue;
      for (const part of l.split(',')) addExprDeps(part);
    }
    return [...deps];
  }
  const states = new Set(
    (b.simStates ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  const texts = [
    b.simDerivs ?? '',
    (b.simAux ?? '').replace(/^([A-Za-z_]\w*)\s*(:=|=)/gm, ''),
    (b.simParams ?? '').replace(/^([A-Za-z_]\w*)\s*(:=|=)/gm, ''),
    b.simInit ?? '',
  ];
  // события: условия целиком + правые части действий
  for (const line of (b.simEvents ?? '').split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('//') || l.startsWith('#')) continue;
    const arrow = l.indexOf('=>');
    if (arrow >= 0) {
      texts.push(l.slice(0, arrow));
      texts.push(
        l.slice(arrow + 2).split(';')
          .map((a) => a.trim().replace(/^([A-Za-z_]\w*)\s*(:=|=)/, '').replace(/^stop$/i, ''))
          .join(';'),
      );
    } else {
      texts.push(l);
    }
  }
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
    if (b.kind === 'plot' || b.kind === 'plot3d' || b.kind === 'text' || b.kind === 'contour') {
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

    // ---------- слайдер: значение ползунка уходит в scope как переменная ----------
    if (b.kind === 'slider') {
      cur.dependencies = [];
      cur.isOutput = true;
      cur.displayLatex = '';
      const v = (b.sliderVar ?? '').trim();
      const lo = b.sliderMin;
      const hi = b.sliderMax;
      const badVar = !v || !isValidVarName(v) || v === 'i';
      if (badVar) {
        cur.error = t('e.sliderVar');
      } else if (typeof lo !== 'number' || typeof hi !== 'number' || !isFinite(lo) || !isFinite(hi) || !(hi > lo)) {
        cur.error = t('e.sliderRange');
      } else {
        cur.error = null;
      }
      if (cur.error) {
        cur.resultStr = '';
        cur.resultLatex = '';
        cur.resultValue = null;
        cur.definedVar = null;
        continue;
      }
      const val = typeof b.sliderVal === 'number' && isFinite(b.sliderVal)
        ? Math.min(hi as number, Math.max(lo as number, b.sliderVal))
        : (lo as number);
      cur.definedVar = v;
      cur.resultValue = val;
      cur.resultStr = formatResult(val);
      cur.resultLatex = valueToLatex(val);
      scope[v] = val;
      continue;
    }

    // ---------- программный блок ----------
    if (b.kind === 'program') {
      const analysis = analyzeProgram(b.rawInput);
      const r = runProgram(b.rawInput, scope);
      cur.dependencies = analysis.dependencies;
      cur.isOutput = true;
      cur.programTrace = r.trace ?? null;
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
        mode: b.simMode ?? 'ode',
        states: b.simStates ?? '',
        derivs: b.simDerivs ?? '',
        aux: b.simAux ?? '',
        params: b.simParams ?? '',
        init: b.simInit ?? '',
        t0: b.simT0 ?? 0,
        t1: b.simT1 ?? 10,
        dt: b.simDt ?? 0.01,
        solver: b.simSolver ?? 'rk4',
        events: b.simEvents ?? '',
        fdtd: {
          n: b.simFdtdN ?? 400,
          length: b.simFdtdL ?? 20,
          steps: b.simFdtdSteps ?? 1500,
          src: b.simFdtdSrc ?? 'gauss',
          freq: b.simFdtdFreq ?? 1,
          amp: b.simFdtdAmp ?? 1,
          srcX: b.simFdtdSrcX ?? 4,
          det: b.simFdtdDet ?? null,
          layers: b.simFdtdLayers ?? '',
        },
      });
      cur.dependencies = blockDeps(b);
      cur.isOutput = true;
      const exp = (b.simExport ?? '').trim();
      // в FDTD-режиме экспортировать нечего — финального вектора нет
      cur.definedVar = (b.simMode === 'fdtd' || !exp || !isValidVarName(exp)) ? null : exp;
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

import { describe, expect, it } from 'vitest';
import { recalculateAll, recalculateAllAsync, type MathBlockData } from './dependencies';

function block(
  suffix: string,
  kind: MathBlockData['kind'],
  y: number,
  patch: Partial<MathBlockData> = {},
): MathBlockData {
  return {
    id: `ra-${suffix}`,
    x: 80,
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
    ...patch,
  };
}

const math = (suffix: string, y: number, raw: string) =>
  block(suffix, 'math', y, { rawInput: raw });

/** Семантический слепок документа для сравнения sync/async. */
function snapshot(blocks: Record<string, MathBlockData>) {
  const out: Record<string, unknown> = {};
  for (const [id, b] of Object.entries(blocks)) {
    out[id] = {
      resultStr: b.resultStr,
      resultLatex: b.resultLatex,
      error: b.error,
      dependencies: b.dependencies,
      definedVar: b.definedVar,
      isOutput: b.isOutput,
      displayLatex: b.displayLatex,
      sim: b.simResult
        ? {
            ts: b.simResult.ts,
            series: b.simResult.series,
            final: b.simResult.final,
            steps: b.simResult.steps,
            events: b.simResult.events,
            halted: b.simResult.halted,
            tEst: b.simResult.tEst,
            field: b.simResult.field,
            error: b.simResult.error,
          }
        : null,
    };
  }
  return out;
}

function mixedDoc(): MathBlockData[] {
  return [
    math('m1', 60, 'a := 2 ='),
    block('s1', 'slider', 124, {
      rawInput: 'slider',
      sliderVar: 'k',
      sliderMin: 0,
      sliderMax: 10,
      sliderStep: 1,
      sliderVal: 3,
    }),
    math('m2', 188, 'b := a*k + sin(a) ='),
    block('p1', 'program', 252, {
      rawInput: 's := 0\nfor i in 1..100\n  s := s + i\nend\ns',
      exportName: 'total',
    }),
    block('sim1', 'sim', 400, {
      rawInput: 'sim',
      simStates: 'x, v',
      simDerivs: 'v; -k*x',
      simInit: '1, 0',
      simT0: 0,
      simT1: 5,
      simDt: 0.02,
      simSolver: 'rk4',
      simX: 't',
      simY: 'x',
      simExport: 'endState',
    }),
    math('m3', 560, 'c := total + endState[1] ='),
    block('t1', 'text', 624, { rawInput: '// заметка' }),
    block('pl1', 'plot', 688, { rawInput: 'plot', plotFn: 'sin(x)' }),
  ];
}

describe('async recalculation (#6)', () => {
  it('matches sync result on a mixed document', async () => {
    // async идёт первым — реально считает (холодный кэш), sync сверяется
    const asyncRes = await recalculateAllAsync(mixedDoc().map((b) => ({ ...b })));
    expect(asyncRes.cancelled).toBe(false);
    if (asyncRes.cancelled) return;
    expect(asyncRes.result.changed).toBe(true);
    expect(asyncRes.result.blocks['ra-m3'].error).toBeNull();
    const syncRes = recalculateAll(mixedDoc().map((b) => ({ ...b })));
    // sync-прогон выше уже заполнил инкрементальный кэш — changed может быть false,
    // сверяем содержательно: слепки блоков и scope совпадают
    expect(snapshot(syncRes.blocks)).toEqual(snapshot(asyncRes.result.blocks));
    expect(syncRes.scope['c']).toEqual(asyncRes.result.scope['c']);
  });

  it('cancel before start yields cancelled', async () => {
    const out = await recalculateAllAsync(mixedDoc(), { shouldCancel: () => true });
    expect(out).toEqual({ cancelled: true });
  });

  it('cancel mid-sim yields cancelled', async () => {
    const sim = block('cs', 'sim', 60, {
      rawInput: 'sim',
      simStates: 'th, om',
      simDerivs: 'om; -(g/L)*sin(th) - b*om',
      simParams: 'L := 1\ng := 9.81\nb := 0.05',
      simInit: '1.2, 0',
      simT0: 0,
      simT1: 100,
      simDt: 0.001,
      simSolver: 'rk4',
      simX: 't',
      simY: 'th',
    });
    let progresses = 0;
    const out = await recalculateAllAsync([sim], {
      shouldCancel: () => progresses > 2,
      onSimProgress: () => {
        progresses++;
      },
    });
    expect(out).toEqual({ cancelled: true });
    expect(progresses).toBeGreaterThan(0);
  });

  it('event loop is responsive during async recalc with heavy sim', async () => {
    const sim = block('cs2', 'sim', 60, {
      rawInput: 'sim',
      simStates: 'th, om',
      simDerivs: 'om; -(g/L)*sin(th) - b*om',
      simParams: 'L := 1\ng := 9.81\nb := 0.05',
      simInit: '1.2, 0',
      simT0: 0,
      simT1: 100,
      simDt: 0.001,
      simSolver: 'rk4',
      simX: 't',
      simY: 'th',
    });
    let ticks = 0;
    const timer = setInterval(() => ticks++, 0);
    try {
      const out = await recalculateAllAsync([sim]);
      expect(out.cancelled).toBe(false);
    } finally {
      clearInterval(timer);
    }
    expect(ticks).toBeGreaterThan(0);
  });

  it('matches sync on error paths (bad sim config, math error)', async () => {
    const badSim = block('ce1', 'sim', 60, {
      rawInput: 'sim',
      simStates: '',
      simDerivs: '',
      simInit: '',
      simT0: 0,
      simT1: 1,
      simDt: 0.01,
      simSolver: 'rk4',
      simX: 't',
      simY: '',
    });
    const badMath = math('ce2', 124, 'z := undefinedVar + 1 =');
    const nanSim = block('ce3', 'sim', 188, {
      rawInput: 'sim',
      simStates: 'y',
      simDerivs: '1/0',
      simInit: '0',
      simT0: 0,
      simT1: 1,
      simDt: 0.1,
      simSolver: 'euler',
      simX: 't',
      simY: 'y',
    });
    const mk = () => [badSim, badMath, nanSim].map((b) => ({ ...b }));
    const asyncRes = await recalculateAllAsync(mk());
    expect(asyncRes.cancelled).toBe(false);
    if (asyncRes.cancelled) return;
    const syncRes = recalculateAll(mk());
    expect(snapshot(syncRes.blocks)).toEqual(snapshot(asyncRes.result.blocks));
    expect(syncRes.blocks['ra-ce1'].error).not.toBeNull();
    expect(syncRes.blocks['ra-ce2'].error).not.toBeNull();
  });

  it('sim progress reaches 100% on fixed-step solver', async () => {
    const sim = block('cs3', 'sim', 60, {
      rawInput: 'sim',
      simStates: 'x, v',
      simDerivs: 'v; -x',
      simInit: '1, 0',
      simT0: 0,
      simT1: 5,
      simDt: 0.02,
      simSolver: 'rk4',
      simX: 't',
      simY: 'x',
    });
    const seen: [number, number | null][] = [];
    const out = await recalculateAllAsync([sim], {
      onSimProgress: (id, done, total) => {
        expect(id).toBe('ra-cs3');
        seen.push([done, total]);
      },
    });
    expect(out.cancelled).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1];
    expect(last[1]).not.toBeNull();
    expect(last[0]).toBe(last[1]);
  });
});

import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { compactTrace } from './numeric';

let id = 0;
function block(y: number, patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id: `st${id++}`,
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
    kind: 'math',
    plotPreview: null,
    ...patch,
  };
}

function recalc(list: MathBlockData[]) {
  const r = recalculateAll(list);
  return list.map((b) => r.blocks[b.id]);
}

describe('solverTrace: compactTrace', () => {
  it('режет до 5 + маркер + 6', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `k=${i}`);
    const c = compactTrace(lines);
    expect(c.length).toBe(12);
    expect(c.slice(0, 5)).toEqual(['k=0', 'k=1', 'k=2', 'k=3', 'k=4']);
    expect(c[5]).toContain('more');
    expect(c.slice(-6)).toEqual(['k=19', 'k=20', 'k=21', 'k=22', 'k=23', 'k=24']);
  });
  it('короткие не трогает', () => {
    expect(compactTrace(['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('solverTrace: math blocks', () => {
  it('nlsolve: итерации Ньютона + невязка', () => {
    const out = recalc([
      block(60, { rawInput: 'r := nlsolve(["x^2+y^2-4", "x-y-1"], ["x", "y"], [1, 0]) =' }),
    ]);
    expect(out[0].error).toBeNull();
    const tr = out[0].solverTrace ?? [];
    expect(tr.length).toBeGreaterThan(2);
    expect(tr[0]).toContain('solve [x, y]');
    expect(tr[0]).toContain('iters');
    expect(tr.some((l) => l.includes('|F|='))).toBe(true);
  });

  it('root (Брент): скобка и сходимость', () => {
    const out = recalc([block(60, { rawInput: 'root("x^3-2", "x", 0, 2) =' })]);
    expect(out[0].error).toBeNull();
    expect(Math.abs(Number(out[0].resultStr) - 1.25992)).toBeLessThan(1e-4);
    const tr = out[0].solverTrace ?? [];
    expect(tr[0]).toContain('root');
    expect(tr.length).toBeGreaterThan(1);
  });

  it('root (Ньютон от старта)', () => {
    const out = recalc([block(60, { rawInput: 'root("cos(x)-x", "x", 0.5) =' })]);
    expect(out[0].error).toBeNull();
    expect(Math.abs(Number(out[0].resultStr) - 0.73909)).toBeLessThan(1e-4);
    expect((out[0].solverTrace ?? []).length).toBeGreaterThan(2);
  });

  it('nint: дробины Симпсона и итог', () => {
    const out = recalc([block(60, { rawInput: 'nint("sin(x)", "x", 0, 3.14159) =' })]);
    expect(out[0].error).toBeNull();
    expect(Math.abs(Number(out[0].resultStr) - 2)).toBeLessThan(1e-6);
    const tr = out[0].solverTrace ?? [];
    expect(tr[0]).toContain('I=');
    expect(tr.some((l) => l.includes('splits='))).toBe(true);
  });

  it('minimize: итерации Нелдера–Мида', () => {
    const out = recalc([block(60, { rawInput: 'minimize("(x-2)^2", ["x"], [0]) =' })]);
    expect(out[0].error).toBeNull();
    expect(out[0].resultStr).toContain('1.999');
    const tr = out[0].solverTrace ?? [];
    expect(tr[0]).toContain('minimize');
  });

  it('bvp: стрельба-секущие', () => {
    const out = recalc([block(60, { rawInput: 'S := bvp("0", "x", 0, 1, 0, 1) =' })]);
    expect(out[0].error).toBeNull();
    const tr = out[0].solverTrace ?? [];
    expect(tr[0]).toContain('bvp');
  });

  it('несходимость: ошибка + диагностика в логе', () => {
    const out = recalc([block(60, { rawInput: 'nlsolve(["x^2+1"], ["x"], [0]) =' })]);
    expect(out[0].error).not.toBeNull();
    const tr = out[0].solverTrace ?? [];
    expect(tr.length).toBeGreaterThan(0);
    expect(tr[0]).toContain('no convergence');
  });

  it('без решателей — null, лог не течёт в соседние блоки', () => {
    const out = recalc([
      block(60, { rawInput: 'r := nlsolve(["x^2-4"], ["x"], [1]) =' }),
      block(124, { rawInput: 'y := r[1] + 1 =' }),
    ]);
    expect((out[0].solverTrace ?? []).length).toBeGreaterThan(0);
    expect(out[1].solverTrace ?? null).toBeNull();
  });
});

describe('solverTrace: форматирование подписей', () => {
  it('nint: без программистских кавычек, числа — в нотации листа', () => {
    const out = recalc([block(60, { rawInput: 'nint("ln(1+x)/(1+x^2)", "x", 0, 0.066) =' })]);
    expect(out[0].error).toBeNull();
    const tr = out[0].solverTrace ?? [];
    expect(tr.length).toBeGreaterThan(0);
    expect(tr[0]).not.toContain('"');
    expect(tr[0]).toContain('∫');
    expect(tr[0]).toContain('I=');
  });

  it('root/minimize: подписи без кавычек', () => {
    const out = recalc([
      block(60, { rawInput: 'root("x^3-2", "x", 0, 2) =' }),
      block(124, { rawInput: 'minimize("(x-2)^2", ["x"], [0]) =' }),
    ]);
    for (const b of out) {
      for (const l of b.solverTrace ?? []) expect(l).not.toContain('"');
    }
  });
});

describe('solverTrace: program blocks', () => {  it('решатель внутри программы тоже логируется', () => {
    const out = recalc([
      block(60, {
        kind: 'program',
        rawInput: 'z := root("x^2-4", "x", 0, 5)\nz',
        exportName: 'z',
      }),
    ]);
    expect(out[0].error).toBeNull();
    const tr = out[0].solverTrace ?? [];
    expect(tr.length).toBeGreaterThan(1);
    expect(tr[0]).toContain('root');
  });
});

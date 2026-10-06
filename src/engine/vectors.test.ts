import { describe, expect, it } from 'vitest';
import { createBaseScope, evaluateLine } from './mathEngine';
import type { Scope } from './core';

function ev(expr: string, scope: Scope = createBaseScope()): unknown {
  const r = evaluateLine(expr, scope);
  if (r.error) throw new Error(`${expr} → ${r.error}`);
  return r.value;
}

const num = (expr: string, scope?: Scope): number => ev(expr, scope) as number;

const close = (expr: string, want: number, tol = 1e-9, scope?: Scope): void => {
  expect(Math.abs(num(expr, scope) - want), `${expr} = ${num(expr, scope)} ≠ ${want}`).toBeLessThanOrEqual(
    tol,
  );
};

/** Значение → плоский числовой массив (матрица mathjs / plain array / скаляр). */
const nums = (expr: string, scope?: Scope): number[] => {
  const v = ev(expr, scope);
  let a: unknown = v;
  if (a !== null && typeof a === 'object' && 'toArray' in (a as object)) {
    a = (a as { toArray: () => unknown }).toArray();
  }
  if (Array.isArray(a)) return a.flat(Infinity).map(Number);
  return [Number(a)];
};

const vecClose = (expr: string, want: number[], tol = 1e-9, scope?: Scope): void => {
  const got = nums(expr, scope);
  expect(got.length, `${expr} → длина ${got.length} ≠ ${want.length}`).toBe(want.length);
  got.forEach((g, k) => {
    expect(Math.abs(g - want[k]), `${expr}[${k}] = ${g} ≠ ${want[k]}`).toBeLessThanOrEqual(tol);
  });
};

describe('векторы: базовые функции', () => {
  it('normalize — единичный вектор', () => {
    vecClose('normalize([3, 4]) =', [0.6, 0.8]);
    close('norm(normalize([3, 4])) =', 1);
    expect(() => ev('normalize([0, 0]) =')).toThrow();
  });

  it('cross — 2D скаляр, 3D вектор, столбцы как строки', () => {
    close('cross([1, 2], [3, 4]) =', -2);
    vecClose('cross([1, 0, 0], [0, 1, 0]) =', [0, 0, 1]);
    vecClose('cross([1; 0; 0], [0; 1; 0]) =', [0, 0, 1]);
    vecClose('cross([1, 2, 3], [4, 5, 6]) =', [-3, 6, -3]);
    expect(() => ev('cross([1, 2, 3], [4, 5]) =')).toThrow();
    expect(() => ev('cross([1, 2, 3, 4], [5, 6, 7, 8]) =')).toThrow();
  });

  it('dot/norm — матjs-функции работают и не дают ложных зависимостей', () => {
    close('dot([1, 2, 3], [4, 5, 6]) =', 32);
    close('norm([3, 4]) =', 5);
    const scope = createBaseScope();
    expect(evaluateLine('dot([1, 2], [3, 4]) =', scope).error).toBeNull();
  });
});

describe('векторы: угол и проекции', () => {
  it('angle / angleDeg', () => {
    close('angle([1, 0], [0, 1]) =', Math.PI / 2);
    close('angleDeg([1, 0], [0, 1]) =', 90);
    close('angle([1, 0], [1, 0]) =', 0);
    close('angleDeg([1, 0], [-1, 0]) =', 180);
    // устойчивость к шуму округления: почти параллельные векторы
    close('angleDeg([1, 0], [1, 1e-15]) =', 0, 1e-6);
    expect(() => ev('angle([1, 0], [1, 2, 3]) =')).toThrow();
    expect(() => ev('angle([0, 0], [1, 0]) =')).toThrow();
  });

  it('proj / comp', () => {
    vecClose('proj([3, 4], [1, 0]) =', [3, 0]);
    vecClose('proj([1, 1], [1, -1]) =', [0, 0]);
    close('comp([3, 4], [1, 0]) =', 3);
    close('comp([3, 4], [0, 2]) =', 4);
    vecClose('proj([1, 2, 3], [0, 2, 0]) =', [0, 2, 0]);
    // proj + (a − proj) ⟂ b
    close('dot(proj([2, 3], [1, 1]), [2, 3] - proj([2, 3], [1, 1])) =', 0, 1e-12);
    expect(() => ev('proj([1, 2], [0, 0]) =')).toThrow();
  });
});

describe('векторы: геометрия', () => {
  it('dist / mid', () => {
    close('dist([0, 0], [3, 4]) =', 5);
    close('dist([1, 2, 3], [1, 2, 3]) =', 0);
    vecClose('mid([0, 0], [2, 4]) =', [1, 2]);
    vecClose('mid([1, 2, 3], [3, 4, 5]) =', [2, 3, 4]);
    expect(() => ev('dist([0, 0], [1]) =')).toThrow();
  });

  it('areaPar / areaTri', () => {
    close('areaPar([3, 0], [0, 4]) =', 12);
    close('areaTri([3, 0], [0, 4]) =', 6);
    close('areaTri([1, 0], [0, 1]) =', 0.5);
    // в 3D площадь параллелограмма = |a×b|
    close('areaPar([1, 0, 0], [0, 1, 0]) =', 1);
    close('norm(cross([2, 0, 0], [0, 3, 0])) =', 6, 1e-9, undefined);
    // вырожденный (коллинеарный) случай
    close('areaPar([1, 2], [2, 4]) =', 0, 1e-12);
  });

  it('triple / tripleV', () => {
    close('triple([1, 0, 0], [0, 1, 0], [0, 0, 1]) =', 1);
    close('triple([1, 2, 3], [4, 5, 6], [7, 8, 9]) =', 0);
    close('det([1, 2, 3; 4, 5, 6; 7, 8, 9]) =', 0);
    close(
      'triple([1, 2, 3], [4, 5, 6], [7, 8, 9]) - det([1, 2, 3; 4, 5, 6; 7, 8, 9]) =',
      0,
      1e-12,
    );
    // a×(b×c) = b(a·c) − c(a·b)
    vecClose('tripleV([1, 2, 3], [4, 5, 6], [7, 8, 9]) =', [-24, -6, 12]);
    expect(() => ev('triple([1, 0], [0, 1], [1, 1]) =')).toThrow();
    expect(() => ev('tripleV([1, 0], [0, 1], [1, 1]) =')).toThrow();
  });

  it('collinear', () => {
    expect(ev('collinear([1, 2], [2, 4]) =')).toBe(true);
    expect(ev('collinear([1, 2], [-2, -4]) =')).toBe(true);
    expect(ev('collinear([1, 2], [2, 3]) =')).toBe(false);
    expect(ev('collinear([0, 0], [5, 7]) =')).toBe(true);
    expect(ev('collinear([1, 0, 0], [0, 1, 0]) =')).toBe(false);
  });

  it('perp / rot2 / vdir', () => {
    vecClose('perp([3, 4]) =', [-4, 3]);
    close('dot(perp([3, 4]), [3, 4]) =', 0, 1e-12);
    vecClose('rot2([1, 0], pi/2) =', [0, 1]);
    vecClose('rot2([1, 0], pi) =', [-1, 0]);
    close('norm(rot2([3, 4], 1.234)) =', 5, 1e-12);
    vecClose('vdir([0, 0], [3, 4]) =', [0.6, 0.8]);
    expect(() => ev('vdir([1, 1], [1, 1]) =')).toThrow();
  });
});

describe('векторы: углы и конвертация', () => {
  it('wrapAngle приводит к [−π, π)', () => {
    close('wrapAngle(pi) =', -Math.PI, 1e-9);
    close('wrapAngle(3*pi) =', -Math.PI, 1e-9);
    close('wrapAngle(-3*pi/2) =', Math.PI / 2, 1e-12);
    close('wrapAngle(0) =', 0);
    close('wrapAngle(2*pi + 0.5) =', 0.5, 1e-12);
  });

  it('deg2rad / rad2deg, поэлементно для массивов', () => {
    close('deg2rad(180) =', Math.PI);
    close('rad2deg(pi) =', 180);
    close('rad2deg(deg2rad(45)) =', 45);
    vecClose('deg2rad([180, 90]) =', [Math.PI, Math.PI / 2]);
    vecClose('rad2deg([0, pi/2]) =', [0, 90]);
    expect(() => ev('deg2rad("abc") =')).toThrow();
  });
});

describe('векторы: совместимость с матjs-операциями', () => {
  it('результаты участвуют в арифметике и как аргументы матjs-функций', () => {
    vecClose('normalize([3, 4]) + [1, 1] =', [1.6, 1.8]);
    close('dot(normalize([3, 4]), [5, 0]) =', 3);
    vecClose('2 * proj([3, 4], [1, 0]) =', [6, 0]);
    close('norm(mid([0, 0], [6, 8])) =', 5);
    close('sum(normalize([1, 1, 1])) =', Math.sqrt(3), 1e-12);
    vecClose('transpose([1, 2, 3]) =', [1, 2, 3]);
  });

  it('присваивание и повторное использование в документе', () => {
    const scope = createBaseScope();
    ev('u_a := [1, 2, 3]', scope);
    ev('v_b := [4, 5, 6]', scope);
    close('dot(u_a, v_b) =', 32, 1e-9, scope);
    vecClose('cross(u_a, v_b) =', [-3, 6, -3], 1e-9, scope);
    close('dist(u_a, v_b) =', Math.sqrt(27), 1e-9, scope);
  });
});

describe('Сниппеты панели «Векторы» считает движок', () => {
  it('каждая строка math-сниппета — без ошибок', async () => {
    const { listSnippets } = await import('../lib/db');
    const scope = createBaseScope();
    const sn = listSnippets().filter((s) => s.pack === 'vectors' && s.kind === 'math');
    expect(sn.length).toBeGreaterThanOrEqual(20);
    for (const s of sn) {
      for (const line of s.code.split('\n')) {
        const r = evaluateLine(line, scope);
        expect(r.error, `${s.label.ru} :: ${line}`).toBeNull();
      }
    }
  });

  it('plot-сниппеты векторов задают vars и рисуются', async () => {
    const { listSnippets } = await import('../lib/db');
    const { samplePlotBlock } = await import('./plotSample');
    const scope = createBaseScope();
    const sn = listSnippets().filter((s) => s.pack === 'vectors' && s.kind === 'plot');
    expect(sn.length).toBeGreaterThanOrEqual(2);
    for (const s of sn) {
      expect(s.vars, `${s.label.ru} :: vars`).toBeTruthy();
      for (const line of (s.vars ?? '').split('\n')) evaluateLine(line, scope);
      const plot = s.plot ?? {};
      const sample = samplePlotBlock(
        s.code,
        scope,
        plot.plotXmin ?? -3,
        plot.plotXmax ?? 3,
        240,
        { trace: plot.plotTrace, plotYmin: plot.plotYmin, plotYmax: plot.plotYmax },
      );
      expect(sample, `${s.label.ru} :: sample`).not.toBeNull();
      expect(sample!.series.some((ser) => !!ser.arrows), `${s.label.ru} :: arrows`).toBe(true);
    }
  });
});

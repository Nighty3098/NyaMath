import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

/**
 * Перф-бюджет большого листа (DESIGN.md: холст не лагает на 100+ блоках).
 * Холодный полный пересчёт — в щедром бюджете (регресс парсера/движка),
 * повтор без правок — кэш-хит (changed=false) и быстро.
 */
describe('perf: big sheet budget', () => {
  it('300 блоков: холодный в бюджете, повтор — кэш-хит', () => {
    let n = 0;
    const block = (y: number, rawInput: string): MathBlockData => ({
      id: `perf${n++}`, x: 80, y, rawInput, displayLatex: '', resultStr: '',
      resultLatex: '', resultValue: null, error: null, dependencies: [],
      definedVar: null, isOutput: false, kind: 'math', plotPreview: null,
    });
    const list: MathBlockData[] = [block(60, 'v0 := 1')];
    for (let i = 1; i < 300; i++) {
      list.push(block(60 + i * 64, `v${i} := v${i - 1} + 1${i % 10 === 0 ? ' =' : ''}`));
    }

    const t0 = performance.now();
    const full = recalculateAll(list);
    const coldMs = performance.now() - t0;

    expect(Object.values(full.blocks).filter((b) => b.error).length).toBe(0);
    expect(full.scope['v299']).toBe(300);
    expect(coldMs).toBeLessThan(20000);

    const t1 = performance.now();
    const hot = recalculateAll(list);
    const hotMs = performance.now() - t1;

    expect(hot.changed).toBe(false);
    expect(hotMs).toBeLessThan(2000);
  });
});

import { describe, expect, it } from 'vitest';
import { flushRecalc, useCanvasStore } from './canvasStore';

/** Quickstart: парабола со слайдером собирается в один клик и считается. */
describe('quickstart demo', () => {
  it('4 блока: a, f(x), слайдер a, plot f(x) — без ошибок', async () => {
    const st = useCanvasStore.getState();
    try {
      st.clear();
      st.loadQuickstart();
      await flushRecalc();
      const cur = useCanvasStore.getState();
      const all = Object.values(cur.blocks);
      expect(all.length).toBe(4);
      expect(all.filter((b) => b.error).length).toBe(0);
      const kinds = all.map((b) => b.kind).sort();
      expect(kinds).toEqual(['math', 'math', 'plot', 'slider']);
      const slider = all.find((b) => b.kind === 'slider');
      expect(slider?.sliderVar).toBe('a');
      expect(slider?.sliderVal).toBe(2);
      const a = all.find((b) => b.rawInput === 'a := 2');
      expect(a?.resultStr).toBe('2');
      const f = all.find((b) => b.rawInput === 'f(x) := a*x^2');
      expect(f?.definedVar).toBe('f');
    } finally {
      const s = useCanvasStore.getState();
      s.clear();
      await flushRecalc();
    }
  });
});

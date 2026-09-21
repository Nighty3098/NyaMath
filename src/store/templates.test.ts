import { describe, expect, it } from 'vitest';
import { flushRecalc, useCanvasStore } from './canvasStore';

/** Вставка шаблона из библиотеки в точку прицела одним undo-шагом. */
describe('templates: insertTemplate', () => {
  it('circuit-ohm вставляется и считается', async () => {
    const st = useCanvasStore.getState();
    try {
      st.clear();
      st.insertTemplate('circuit-ohm');
      await flushRecalc();
      const cur = useCanvasStore.getState();
      const all = Object.values(cur.blocks);
      expect(all.length).toBe(7);
      expect(all.filter((b) => b.error).length).toBe(0);
      const i = all.find((b) => b.rawInput === 'I =');
      expect(i?.resultStr).toBe('3 A');
    } finally {
      const s = useCanvasStore.getState();
      s.clear();
      await flushRecalc();
    }
  });

  it('неизвестный id — без изменений', async () => {
    const st = useCanvasStore.getState();
    try {
      st.clear();
      await flushRecalc();
      const before = Object.keys(useCanvasStore.getState().blocks).length;
      st.insertTemplate('nope');
      expect(Object.keys(useCanvasStore.getState().blocks).length).toBe(before);
    } finally {
      const s = useCanvasStore.getState();
      s.clear();
      await flushRecalc();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { flushRecalc, useCanvasStore } from './canvasStore';
import { listFormulas } from '../lib/db';

const FORMULAS = listFormulas();

/** Путь вставки из палитры: каждая строка формулы становится отдельным блоком. */
describe('addBlocks insert path', () => {
  it('splits a multiline formula into stacked blocks without errors', async () => {
    const st = useCanvasStore.getState();
    st.clear();
    const f = FORMULAS.find((x) => x.id === 'ohm-law');
    expect(f).toBeTruthy();
    const lines = f!.code
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    useCanvasStore.getState().addBlocks(lines, 80, 60);
    const after = useCanvasStore.getState();
    const ids = after.selectedIds;
    expect(ids.length).toBe(lines.length);
    const ys = ids.map((id) => after.blocks[id].y).sort((a, b) => a - b);
    // лесенка строго вниз: порядок сверху-вниз сохраняет зависимости
    for (let k = 1; k < ys.length; k++) expect(ys[k]).toBeGreaterThan(ys[k - 1]);
    await flushRecalc();
    const done = useCanvasStore.getState();
    for (const id of ids) {
      expect(done.blocks[id].error, done.blocks[id].rawInput).toBeNull();
    }
    done.clear();
  });

  it('every catalog formula survives the addBlocks path', async () => {
    const st = useCanvasStore.getState();
    st.clear();
    let checked = 0;
    for (const f of FORMULAS) {
      const lines = f.code
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      useCanvasStore.getState().addBlocks(lines, 80, 60);
      await flushRecalc();
      const after = useCanvasStore.getState();
      for (const id of after.selectedIds) {
        expect(after.blocks[id].error, `${f.id} [${after.blocks[id].rawInput}]`).toBeNull();
      }
      checked++;
      after.clear();
    }
    expect(checked).toBe(FORMULAS.length);
    // полный прогон каталога с юнитами ~4 c вхолостую, под нагрузкой параллельных
    // воркеров — дольше: запас вместо дефолтных 5 c.
  }, 60000);
});

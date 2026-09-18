import { describe, expect, it } from 'vitest';
import { useCanvasStore } from './canvasStore';
import { FORMULAS } from '../data/formulas';

/** Путь вставки из палитры: каждая строка формулы становится отдельным блоком. */
describe('addBlocks insert path', () => {
  it('splits a multiline formula into stacked blocks without errors', () => {
    const st = useCanvasStore.getState();
    st.clear();
    const f = FORMULAS.find((x) => x.id === 'ohm-law');
    expect(f).toBeTruthy();
    const lines = f!.code.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    useCanvasStore.getState().addBlocks(lines, 80, 60);
    const after = useCanvasStore.getState();
    const ids = after.selectedIds;
    expect(ids.length).toBe(lines.length);
    const ys = ids.map((id) => after.blocks[id].y).sort((a, b) => a - b);
    // лесенка строго вниз: порядок сверху-вниз сохраняет зависимости
    for (let k = 1; k < ys.length; k++) expect(ys[k]).toBeGreaterThan(ys[k - 1]);
    for (const id of ids) {
      expect(after.blocks[id].error, after.blocks[id].rawInput).toBeNull();
    }
    after.clear();
  });

  it('every catalog formula survives the addBlocks path', () => {
    const st = useCanvasStore.getState();
    st.clear();
    let checked = 0;
    for (const f of FORMULAS) {
      const lines = f.code.split('\n').map((l) => l.trim()).filter(Boolean);
      useCanvasStore.getState().addBlocks(lines, 80, 60);
      const after = useCanvasStore.getState();
      for (const id of after.selectedIds) {
        expect(after.blocks[id].error, `${f.id} [${after.blocks[id].rawInput}]`).toBeNull();
      }
      checked++;
      after.clear();
    }
    expect(checked).toBe(FORMULAS.length);
  });
});

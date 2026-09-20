import { describe, expect, it } from 'vitest';
import { flushRecalc, lastCalcMs, useCanvasStore } from './canvasStore';

describe('console telemetry', () => {
  it('measures async recalculation time', async () => {
    const st = useCanvasStore.getState();
    st.addBlock(80, 6000, 'x := 5');
    await flushRecalc();
    const cur = useCanvasStore.getState();
    expect(typeof cur.calcMs).toBe('number');
    expect(cur.calcMs).toBeGreaterThanOrEqual(0);
    expect(lastCalcMs).toBe(cur.calcMs);
    const id = cur.selectedIds[0];
    expect(cur.blocks[id].resultStr).toBe('5');
    cur.removeBlock(id);
    await flushRecalc();
  });

  it('toggles the scope monitor', () => {
    const st = useCanvasStore.getState();
    const v0 = st.scopeMonOpen;
    st.toggleScopeMon();
    expect(useCanvasStore.getState().scopeMonOpen).toBe(!v0);
    st.toggleScopeMon();
    expect(useCanvasStore.getState().scopeMonOpen).toBe(v0);
  });
});

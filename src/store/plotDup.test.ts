import { describe, expect, it } from 'vitest';
import { useCanvasStore } from './canvasStore';

/** duplicatePlot: копия plot-блока ниже с теми же настройками. */
describe('duplicatePlot', () => {
  it('дублирует выражение и диапазон', () => {
    const st = useCanvasStore.getState();
    try {
      st.clear();
      st.addPlotBlock(80, 60, 'sin(2*x)', { plotXmin: -5, plotXmax: 5, plotTitle: 'T' });
      const src = Object.values(useCanvasStore.getState().blocks)[0];
      useCanvasStore.getState().duplicatePlot(src.id);
      const all = Object.values(useCanvasStore.getState().blocks);
      expect(all.length).toBe(2);
      const dup = all.find((b) => b.id !== src.id)!;
      expect(dup.plotFn).toBe('sin(2*x)');
      expect(dup.plotXmin).toBe(-5);
      expect(dup.plotXmax).toBe(5);
      expect(dup.plotTitle).toBe('T');
      expect(dup.y).toBeGreaterThan(src.y);
      expect(dup.kind).toBe('plot');
    } finally {
      useCanvasStore.getState().clear();
    }
  });

  it('чужой id и не-плот — без изменений', () => {
    const st = useCanvasStore.getState();
    try {
      st.clear();
      st.addBlock(80, 60, 'x := 1');
      const math = Object.values(useCanvasStore.getState().blocks)[0];
      const before = Object.keys(useCanvasStore.getState().blocks).length;
      useCanvasStore.getState().duplicatePlot(math.id);
      useCanvasStore.getState().duplicatePlot('nope');
      expect(Object.keys(useCanvasStore.getState().blocks).length).toBe(before);
    } finally {
      useCanvasStore.getState().clear();
    }
  });
});

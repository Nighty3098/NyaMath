import { afterEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from './canvasStore';

const G = globalThis as unknown as { window?: { innerWidth: number } };

afterEach(() => {
  delete G.window;
});

function addedW(): number | null | undefined {
  const st = useCanvasStore.getState();
  const id = st.selectedIds[0];
  return st.blocks[id]?.w;
}

describe('viewport-aware default block widths', () => {
  it('node/desktop default keeps full width', () => {
    delete G.window;
    useCanvasStore.getState().addPlotBlock(0, 0);
    expect(addedW()).toBe(460);
    useCanvasStore.getState().addSimBlock(0, 200);
    expect(addedW()).toBe(560);
  });

  it('narrow viewport shrinks new cards', () => {
    G.window = { innerWidth: 360 };
    useCanvasStore.getState().addPlotBlock(0, 400);
    expect(addedW()).toBe(336);
    useCanvasStore.getState().addPlot3dBlock(0, 600);
    expect(addedW()).toBe(336);
    useCanvasStore.getState().addContourBlock(0, 800);
    expect(addedW()).toBe(336);
  });

  it('tiny viewport never goes below usable minimum', () => {
    G.window = { innerWidth: 240 };
    useCanvasStore.getState().addPlotBlock(0, 1000);
    expect(addedW()).toBe(280);
  });
});

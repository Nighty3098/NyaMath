import { describe, expect, it } from 'vitest';
import { isUnifiedPaletteOpen, useCanvasStore } from './canvasStore';

/** Одна кнопка сайдпанели: открыть три палитры разом / закрыть всё разом. */
describe('sidebar toggle', () => {
  it('opens the main palettes and closes everything back', () => {
    const st = useCanvasStore.getState();
    if (isUnifiedPaletteOpen(useCanvasStore.getState())) st.toggleSidebar();
    expect(isUnifiedPaletteOpen(useCanvasStore.getState())).toBe(false);
    st.toggleSidebar();
    const open = useCanvasStore.getState();
    expect(open.paletteOpen).toBe(true);
    expect(open.formulaPaletteOpen).toBe(true);
    expect(open.constPaletteOpen).toBe(true);
    st.toggleSidebar();
    expect(isUnifiedPaletteOpen(useCanvasStore.getState())).toBe(false);
  });
});

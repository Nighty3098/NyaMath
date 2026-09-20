import { describe, expect, it } from 'vitest';
import { flushRecalc, useCanvasStore } from './canvasStore';

/** Ждём конца джобы (recalcNow — void, без await). */
async function waitIdle(): Promise<void> {
  for (let k = 0; k < 200; k++) {
    const s = useCanvasStore.getState();
    if (!s.computeActive) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('recalc job did not finish');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function byRaw(raw: string): string {
  const hit = Object.values(useCanvasStore.getState().blocks).find((b) => b.rawInput === raw);
  if (!hit) throw new Error(`no block ${raw}`);
  return hit.id;
}

describe('manual calc mode (Calculate Now)', () => {
  it('правки ждут кнопки, видимое считается, нижнее — stale', async () => {
    const st = useCanvasStore.getState();
    st.clear();
    // сначала полный просчёт в auto (греем кэш), затем manual
    st.addBlock(80, 60, 'a := 1');
    st.addBlock(80, 200, 'b := a + 1 =');
    st.addBlock(80, 340, 'c := b + 1 =');
    await flushRecalc();
    const aId = byRaw('a := 1');
    const bId = byRaw('b := a + 1 =');
    const cId = byRaw('c := b + 1 =');
    expect(useCanvasStore.getState().blocks[cId]?.resultStr).toBe('3');

    st.setCalcMode('manual');
    try {
      // правим верхний вне экрана: джобы не едут — только флаг
      st.updateInput(aId, 'a := 10');
      await sleep(150);
      expect(useCanvasStore.getState().calcStale).toBe(true);
      expect(useCanvasStore.getState().blocks[aId]?.resultStr).toBe('1');

      // видим только b: a и b свежие (upstream подтянут), c ниже — stale
      const s1 = useCanvasStore.getState();
      s1.setVisibleIds([bId]);
      s1.recalcNow();
      await waitIdle();
      const s2 = useCanvasStore.getState();
      expect(s2.blocks[bId]?.resultStr).toBe('11');
      expect(s2.blocks[cId]?.resultStr).toBe('3');
      expect(s2.staleIds).toEqual([cId]);
      expect(s2.calcStale).toBe(false);

      // возврат в auto дотягивает всё
      s2.setCalcMode('auto');
      await flushRecalc();
      const s3 = useCanvasStore.getState();
      expect(s3.blocks[cId]?.resultStr).toBe('12');
      expect(s3.staleIds).toEqual([]);
    } finally {
      const s = useCanvasStore.getState();
      s.setCalcMode('auto');
      s.clear();
      await flushRecalc();
    }
  });
});

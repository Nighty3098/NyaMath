import { useCanvasStore } from '../store/canvasStore';
import { t } from '../i18n';
import {
  IFx, IFormula, IGrid, IPlot, IPlot3d, IProgram, IRecalc, ISignal, ISim,
} from './Icon';

/** Вставка в точку прицела; прицел каскадом уходит вниз (как в MenuBar). */
function atCross(): { x: number; y: number } {
  const st = useCanvasStore.getState();
  const p = { x: st.cross.x, y: st.cross.y };
  st.nudgeCross(0, 140);
  return p;
}

/**
 * Левая инструментальная рейка в духе CAD: вставка блоков одним кликом,
 * внизу — вид (палитра, сетка) и пересчёт. На мобильных скрыта
 * (вставка — через меню и дабл-тап по холсту).
 */
export default function ToolRail() {
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addPlot3dBlock = useCanvasStore((s) => s.addPlot3dBlock);
  const addProgramBlock = useCanvasStore((s) => s.addProgramBlock);
  const addSimBlock = useCanvasStore((s) => s.addSimBlock);
  const addSliderBlock = useCanvasStore((s) => s.addSliderBlock);
  const paletteOpen = useCanvasStore((s) => s.paletteOpen);
  const togglePalette = useCanvasStore((s) => s.togglePalette);
  const formulaPaletteOpen = useCanvasStore((s) => s.formulaPaletteOpen);
  const toggleFormulaPalette = useCanvasStore((s) => s.toggleFormulaPalette);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const toggleGrid = useCanvasStore((s) => s.toggleGrid);
  const recalc = useCanvasStore((s) => s.recalc);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  const insert = (fn: (x: number, y: number) => void) => () => {
    const p = atCross();
    fn(p.x, p.y);
  };

  const tools = [
    { icon: <IFormula />, title: t('menu.insMath'), fn: insert((x, y) => addBlock(x, y)) },
    { icon: <IPlot />, title: t('menu.insPlot'), fn: insert((x, y) => addPlotBlock(x, y)) },
    { icon: <IPlot3d />, title: t('menu.ins3d'), fn: insert((x, y) => addPlot3dBlock(x, y)) },
    { icon: <IProgram />, title: t('menu.insProg'), fn: insert((x, y) => addProgramBlock(x, y)) },
    { icon: <ISim />, title: t('menu.insSim'), fn: insert((x, y) => addSimBlock(x, y)) },
    { icon: <ISignal />, title: t('menu.insSlider'), fn: insert((x, y) => addSliderBlock(x, y)) },
  ];

  return (
    <div
      className="hidden md:flex w-12 shrink-0 flex-col items-center gap-0.5 py-2 bg-[var(--chrome)] z-10 select-none print:hidden"
      role="toolbar"
      aria-label={t('menu.insert')}
    >
      {tools.map((b) => (
        <button
          key={b.title}
          type="button"
          className="nya-tbtn w-9 h-9 text-[15px]"
          onClick={b.fn}
          title={b.title}
          aria-label={b.title}
        >
          {b.icon}
        </button>
      ))}
      <div className="flex-1" />
      <button
        type="button"
        className={`nya-tbtn w-9 h-9 ${paletteOpen ? 'is-on' : ''}`}
        onClick={togglePalette}
        title={t('menu.palette')}
        aria-label={t('menu.palette')}
        aria-pressed={paletteOpen}
      >
        <IFx />
      </button>
      <button
        type="button"
        className={`nya-tbtn w-9 h-9 ${formulaPaletteOpen ? 'is-on' : ''}`}
        onClick={toggleFormulaPalette}
        title={t('menu.formulaPalette')}
        aria-label={t('menu.formulaPalette')}
        aria-pressed={formulaPaletteOpen}
      >
        <IFormula />
      </button>
      <button
        type="button"
        className={`nya-tbtn w-9 h-9 ${showGrid ? 'is-on' : ''}`}
        onClick={toggleGrid}
        title={t('menu.grid')}
        aria-label={t('menu.grid')}
        aria-pressed={showGrid}
      >
        <IGrid />
      </button>
      <button
        type="button"
        className="nya-tbtn w-9 h-9"
        onClick={recalc}
        title={`${t('menu.recalc')} · Ctrl+↵`}
        aria-label={t('menu.recalc')}
      >
        <IRecalc />
      </button>
    </div>
  );
}

import { useCanvasStore } from '../store/canvasStore';
import { saveDocument } from '../lib/saveDocument';
import { printDocument } from '../lib/print';
import {
  IFormula, IPlot, IPrint, IRecalc, IRedo, ISave, ISignal, IUndo,
} from './Icon';
import { t } from '../i18n';

/**
 * Классические тулбары Mathcad 15 (Standard + вставка): видны только
 * в теме mathcad15, сразу под менюбаром. Квадратные выпуклые кнопки,
 * разделители-группы, никаких подписей — как в оригинале.
 */
export default function ClassicToolbar() {
  const theme = useCanvasStore((s) => s.theme);
  const blocks = useCanvasStore((s) => s.blocks);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addTextBlock = useCanvasStore((s) => s.addTextBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addSliderBlock = useCanvasStore((s) => s.addSliderBlock);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const recalc = useCanvasStore((s) => s.recalc);
  const canUndo = useCanvasStore((s) => s.past.length > 0);
  const canRedo = useCanvasStore((s) => s.future.length > 0);
  useCanvasStore((s) => s.lang);

  if (theme !== 'mathcad15') return null;

  const atCross = (): { x: number; y: number } => {
    const st = useCanvasStore.getState();
    const p = { x: st.cross.x, y: st.cross.y };
    st.nudgeCross(0, 140);
    return p;
  };
  const insertAt = (fn: (x: number, y: number) => void) => () => {
    const p = atCross();
    fn(p.x, p.y);
  };

  const btn = (
    key: string,
    icon: React.ReactNode,
    label: string,
    fn: () => void,
    disabled?: boolean,
  ) => (
    <button
      key={key}
      type="button"
      className="nya-tbtn"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={fn}
    >
      {icon}
    </button>
  );
  const sep = (key: string) => (
    <span
      key={key}
      aria-hidden="true"
      className="w-px self-stretch my-1 mx-0.5"
      style={{ background: '#808080', boxShadow: '1px 0 0 #ffffff' }}
    />
  );

  return (
    <div
      className="shrink-0 flex items-center gap-0.5 px-1 py-0.5 print:hidden"
      role="toolbar"
      aria-label={t('menu.view')}
      style={{
        background: 'linear-gradient(to bottom, #fdfcf6, #ece9d8)',
        borderBottom: '1px solid #aca899',
      }}
    >
      {btn('save', <ISave />, t('menu.save'), () => void saveDocument(blocks))}
      {btn('print', <IPrint />, t('menu.printColor'), () => printDocument('color'))}
      {sep('s1')}
      {btn('undo', <IUndo />, `${t('menu.undo')} · Ctrl+Z`, undo, !canUndo)}
      {btn('redo', <IRedo />, `${t('menu.redo')} · Ctrl+Shift+Z`, redo, !canRedo)}
      {sep('s2')}
      {btn('math', <IFormula />, t('menu.insMath'), insertAt((x, y) => addBlock(x, y)))}
      {btn('text', <IFormula />, t('menu.insText'), insertAt((x, y) => addTextBlock(x, y)))}
      {btn('plot', <IPlot />, t('menu.insPlot'), insertAt((x, y) => addPlotBlock(x, y)))}
      {btn('slider', <ISignal />, t('menu.insSlider'), insertAt((x, y) => addSliderBlock(x, y)))}
      {sep('s3')}
      {btn('recalc', <IRecalc />, `${t('menu.recalc')} · Ctrl+↵`, recalc)}
    </div>
  );
}

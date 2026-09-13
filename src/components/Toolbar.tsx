import { useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { saveDocument } from '../lib/saveDocument';
import FunctionPalette from './FunctionPalette';
import { IDemo, IFx, IFormula, IGrid, IOpen, IPlot, IProgram, IRecalc, IRedo, ISave, IUndo, IX, IZap, ISun, IMoon } from './Icon';

export default function Toolbar() {
  const blocks = useCanvasStore((s) => s.blocks);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addProgramBlock = useCanvasStore((s) => s.addProgramBlock);
  const loadTestScenario = useCanvasStore((s) => s.loadTestScenario);
  const loadAdvancedDemo = useCanvasStore((s) => s.loadAdvancedDemo);
  const clear = useCanvasStore((s) => s.clear);
  const recalc = useCanvasStore((s) => s.recalc);
  const toggleGrid = useCanvasStore((s) => s.toggleGrid);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const theme = useCanvasStore((s) => s.theme);
  const toggleTheme = useCanvasStore((s) => s.toggleTheme);
  const loadDocument = useCanvasStore((s) => s.loadDocument);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.past.length > 0);
  const canRedo = useCanvasStore((s) => s.future.length > 0);
  const [palette, setPalette] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = Object.values(blocks);
  const errs = list.filter((b) => b.error).length;
  const n = list.length;

  const saveFile = () => {
    void saveDocument(blocks);
  };

  const openFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const r = loadDocument(data);
        alert(r.message);
      } catch {
        alert('Не удалось прочитать файл: это не корректный JSON');
      }
    };
    reader.readAsText(f);
  };

  return (
    <>
      <header
        className="min-h-[52px] shrink-0 flex items-center gap-1.5 flex-wrap px-3 py-1 border-b border-[var(--chrome-line)] bg-[var(--chrome)]/80 backdrop-blur-xl text-[var(--chrome-ink)] z-20"
        role="toolbar"
        aria-label="Панель инструментов"
      >
        <div className="font-semibold tracking-tight text-[15px] whitespace-nowrap mr-1">
          <span className="text-[var(--accent)]">W</span>engineering
        </div>
        <Btn
          icon={<IFormula />}
          label="f(x)"
          title="Новый мат-блок"
          onClick={() => addBlock(200 + Math.random() * 200, 150 + Math.random() * 120)}
        />
        <Btn icon={<IPlot />} label="plot" title="Новый график" onClick={() => addPlotBlock(600, 200)} />
        <Btn
          icon={<IProgram />}
          label="≣"
          title="Программный блок: if/for/while"
          onClick={() => addProgramBlock(300, 300)}
        />
        <Btn
          icon={<IFx />}
          label="ƒx"
          title="Палитра функций: матрицы, статистика, физика, телеком"
          onClick={() => setPalette((v) => !v)}
          aria-expanded={palette}
        />
        <Btn icon={<IRecalc />} title="Пересчитать всё (Ctrl+Enter)" onClick={recalc} aria-label="Пересчитать всё" />
        <Btn
          icon={<IGrid />}
          title="Сетка вкл/выкл"
          onClick={toggleGrid}
          aria-label="Переключить сетку"
          aria-pressed={showGrid}
          active={showGrid}
        />
        <div className="w-px h-6 bg-[var(--chrome-line)] mx-1" aria-hidden="true" />
        <Btn
          icon={<IUndo />}
          title="Отменить (Ctrl+Z)"
          onClick={undo}
          aria-label="Отменить"
          disabled={!canUndo}
        />
        <Btn
          icon={<IRedo />}
          title="Вернуть (Ctrl+Shift+Z)"
          onClick={redo}
          aria-label="Вернуть"
          disabled={!canRedo}
        />
        <div className="w-px h-6 bg-[var(--chrome-line)] mx-1" aria-hidden="true" />
        <Btn icon={<IZap />} label="20" title="Вариант 20, электродинамика" onClick={loadTestScenario} accent />
        <Btn
          icon={<IDemo />}
          label="demo"
          title="Демо: матрицы, статистика, программы, график"
          onClick={loadAdvancedDemo}
          accent
        />
        <Btn icon={<ISave />} title="Сохранить проект в файл (.json) (Ctrl+S)" onClick={saveFile} aria-label="Сохранить проект" />
        <Btn icon={<IOpen />} title="Открыть проект из файла (.json)" onClick={() => fileRef.current?.click()} aria-label="Открыть проект" />
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openFile(f);
            e.target.value = '';
          }}
        />
        <Btn
          icon={<IX />}
          title="Очистить холст"
          onClick={() => {
            if (confirm('Очистить холст?')) clear();
          }}
          aria-label="Очистить холст"
          danger
        />
        <div className="w-px h-6 bg-[var(--chrome-line)] mx-1" aria-hidden="true" />
        <Btn
          icon={theme === 'gruvbox' ? <ISun /> : <IMoon />}
          title={theme === 'gruvbox' ? 'Светлая тема' : 'Тема Gruvbox'}
          onClick={toggleTheme}
          aria-label={theme === 'gruvbox' ? 'Переключить на светлую тему' : 'Переключить на тему Gruvbox'}
          aria-pressed={theme === 'gruvbox'}
        />
        <div
          className="ml-auto text-[12px] math-input text-[var(--chrome-soft)] whitespace-nowrap"
          role="status"
          aria-live="polite"
        >
          {n}
          {selectedIds.length > 1 ? ` • выбр. ${selectedIds.length}` : ''}{' '}
          {errs > 0 ? <span className="text-[var(--danger)]">• err {errs}</span> : <span className="text-[var(--ok)]">• ok</span>}
        </div>
      </header>
      {palette && <FunctionPalette onClose={() => setPalette(false)} />}
    </>
  );
}

function Btn({
  children,
  icon,
  label,
  onClick,
  title,
  accent,
  danger,
  active,
  ...aria
}: {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  label?: string;
  onClick: () => void;
  title?: string;
  accent?: boolean;
  danger?: boolean;
  active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={title}
      aria-label={aria['aria-label'] ?? title}
      onClick={onClick}
      {...aria}
      className={`min-h-[36px] min-w-[36px] inline-flex items-center justify-center gap-1.5 text-[13px] px-2 rounded-lg border transition-colors cursor-pointer active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none ${
        accent
          ? 'bg-[var(--accent-soft)] border-[var(--accent-line)]/60 text-[var(--chrome-ink)] hover:brightness-125'
          : danger
            ? 'border-[var(--chrome-line)] text-[var(--chrome-soft)] hover:text-[var(--danger)] hover:border-[var(--danger)]/50'
            : active
              ? 'border-[var(--accent-line)]/60 text-[var(--chrome-ink)] bg-[var(--accent-soft)]'
              : 'border-[var(--chrome-line)] text-[var(--chrome-ink)] hover:border-[var(--chrome-soft)] hover:bg-white/5'
      }`}
    >
      {icon}
      {label && <span>{label}</span>}
      {children}
    </button>
  );
}

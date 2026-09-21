import { useCanvasStore } from '../store/canvasStore';
import { THEMES } from '../theme';
import { IConst, IField, IFormula, IFx, IMoon, ISignal, ISun } from './Icon';
import { t } from '../i18n';

/**
 * Activity Bar в духе VS Code: узкая полоса иконок слева.
 * Переключает вкладки палитр (открывает, если закрыта), внизу —
 * тема и Live Sync. Только лаунчер: сами панели живут как раньше
 * (единое окно / откреплённые / док).
 */
export default function ActivityBar() {
  const paletteOpen = useCanvasStore((s) => s.paletteOpen);
  const formulaPaletteOpen = useCanvasStore((s) => s.formulaPaletteOpen);
  const constPaletteOpen = useCanvasStore((s) => s.constPaletteOpen);
  const elemPaletteOpen = useCanvasStore((s) => s.elemPaletteOpen);
  const scopeMonOpen = useCanvasStore((s) => s.scopeMonOpen);
  const theme = useCanvasStore((s) => s.theme);
  const liveConnected = useCanvasStore((s) => s.liveConnected);
  const liveError = useCanvasStore((s) => s.liveError);
  useCanvasStore((s) => s.lang);

  const pick = (tab: 'functions' | 'formulas' | 'constants' | 'elements' | 'variables') => {
    const st = useCanvasStore.getState();
    if (tab === 'functions') {
      if (st.paletteOpen) st.setPaletteTab(tab);
      else st.setPaletteOpen(true);
    } else if (tab === 'formulas') {
      if (st.formulaPaletteOpen) st.setPaletteTab(tab);
      else st.setFormulaPaletteOpen(true);
    } else if (tab === 'constants') {
      if (st.constPaletteOpen) st.setPaletteTab(tab);
      else st.setConstPaletteOpen(true);
    } else if (tab === 'elements') {
      if (st.elemPaletteOpen) st.setPaletteTab(tab);
      else st.toggleElemPalette();
    } else if (st.scopeMonOpen) st.setPaletteTab(tab);
    else st.toggleScopeMon();
  };

  const items: {
    id: string;
    icon: React.ReactNode;
    label: string;
    active: boolean;
    fn: () => void;
  }[] = [
    { id: 'functions', icon: <IFx />, label: t('menu.palette'), active: paletteOpen, fn: () => pick('functions') },
    { id: 'formulas', icon: <IFormula />, label: t('menu.formulaPalette'), active: formulaPaletteOpen, fn: () => pick('formulas') },
    { id: 'constants', icon: <IConst />, label: t('menu.constPalette'), active: constPaletteOpen, fn: () => pick('constants') },
    { id: 'elements', icon: <IField />, label: t('menu.elemPalette'), active: elemPaletteOpen, fn: () => pick('elements') },
    { id: 'variables', icon: <ISignal />, label: t('menu.scopeMon'), active: scopeMonOpen, fn: () => pick('variables') },
  ];

  return (
    <nav
      className="shrink-0 w-12 flex flex-col items-stretch bg-[var(--chrome)] border-r border-[var(--chrome-line)] py-1 print:hidden"
      aria-label={t('palTab.aria')}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={it.fn}
          title={it.label}
          aria-label={it.label}
          aria-pressed={it.active}
          className={`relative flex items-center justify-center min-h-[48px] text-[17px] cursor-pointer transition-colors ${
            it.active ? 'text-[var(--chrome-ink)]' : 'text-[var(--faint)] hover:text-[var(--chrome-soft)]'
          }`}
        >
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 rounded-full"
            style={{ background: it.active ? 'var(--accent-line)' : 'transparent' }}
          />
          {it.icon}
        </button>
      ))}
      <div className="flex-1" aria-hidden="true" />
      <button
        type="button"
        onClick={() => useCanvasStore.getState().toggleTheme()}
        title={theme}
        aria-label={theme}
        className="flex items-center justify-center min-h-[48px] text-[15px] text-[var(--faint)] hover:text-[var(--chrome-soft)] cursor-pointer transition-colors"
      >
        {THEMES.find((x) => x.id === theme)?.kind === 'light' ? <IMoon /> : <ISun />}
      </button>
      <span
        className="flex items-center justify-center min-h-[32px]"
        title={liveConnected ? t('live.on') : (liveError ?? t('live.off'))}
        role="status"
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: liveConnected ? 'var(--ok)' : 'var(--faint)' }}
        />
      </span>
    </nav>
  );
}

import { useEffect } from 'react';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { useCanvasStore } from './store/canvasStore';
import { saveDocument } from './lib/saveDocument';

export default function App() {
  const theme = useCanvasStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Глобальные шорткаты: Ctrl+S — сохранить, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — undo/redo.
  // Слушатель в capture-фазе на window: срабатывает раньше редакторов блоков.
  // e.code вместо e.key — работает в любой раскладке (KeyS = Ctrl+С в русской).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      // Ctrl+Alt+клавиша — ввод спецсимволов в некоторых раскладках, не перехватываем
      if (e.altKey) return;
      const inField =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.code === 'KeyS') {
        e.preventDefault();
        // зажатый Ctrl+S не должен спамить диалогами сохранения
        if (e.repeat) return;
        void saveDocument(useCanvasStore.getState().blocks);
      } else if (e.code === 'KeyZ' && !e.shiftKey) {
        // в поле ввода — нативный undo текста
        if (inField) return;
        e.preventDefault();
        useCanvasStore.getState().undo();
      } else if ((e.code === 'KeyZ' && e.shiftKey) || e.code === 'KeyY') {
        if (inField) return;
        e.preventDefault();
        useCanvasStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <Toolbar />
      <Canvas />
    </div>
  );
}

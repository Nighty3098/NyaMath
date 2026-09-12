import { useEffect } from 'react';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { useCanvasStore } from './store/canvasStore';

export default function App() {
  const theme = useCanvasStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <Toolbar />
      <Canvas />
    </div>
  );
}

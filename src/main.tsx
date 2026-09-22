import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Шрифты — локально из бандла (fontsource), без зависимости от Google Fonts:
// приложение работает офлайн и за блокировками трекеров.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'
import { initDb } from './lib/db-browser'
import { registerSW } from './pwa'

/** Справочники (NyaMath.db) — до любых импортов движка: модули больше
 *  ничего не выполняют на импорте, но первый createBaseScope уже требует БД. */
async function boot(): Promise<void> {
  const root = document.getElementById('root')!;
  try {
    await initDb();
  } catch (e) {
    root.innerHTML = `<pre style="padding:24px;font:14px monospace">NyaMath.db failed to load: ${String(e)}</pre>`;
    return;
  }
  const { default: App } = await import('./App.tsx');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // офлайн-оболочка — после первого рендера (только production)
  registerSW();
}

void boot();

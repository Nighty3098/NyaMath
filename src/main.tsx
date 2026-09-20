import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initDb } from './lib/db-browser'

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
}

void boot();

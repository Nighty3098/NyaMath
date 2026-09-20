import { useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { ICalc, IX } from './Icon';
import { t } from '../i18n';

/** Клавиша: что видит пользователь → что вставляется в формулу. */
const KEYS: { label: string; text: string; hint: string }[] = [
  { label: ':=', text: ':=', hint: 'define' },
  { label: '=', text: '=', hint: 'output' },
  { label: 'π', text: 'pi', hint: 'pi' },
  { label: '√', text: 'sqrt(', hint: 'sqrt' },
  { label: '≤', text: '<=', hint: '<=' },
  { label: '≥', text: '>=', hint: '>=' },
  { label: '≠', text: '!=', hint: '!=' },
  { label: ',', text: ',', hint: ',' },
  { label: '⋅', text: '*', hint: '*' },
  { label: '÷', text: '/', hint: '/' },
  { label: '(', text: '(', hint: '(' },
  { label: ')', text: ')', hint: ')' },
  { label: ';', text: ';', hint: ';' },
  { label: '°', text: 'deg', hint: 'deg' },
  { label: '²', text: '^2', hint: '^2' },
  { label: '^()', text: '^()', hint: '^()' },
  { label: 'j', text: 'j', hint: 'j' },
  { label: 'e', text: 'e', hint: 'e' },
];

/**
 * Экранная мат-клавиатура (DESIGN.md: Desmos-паттерн `π √ ≤`).
 * Вставка — в курсор открытого редактора, иначе — новый блок с прицела.
 * onPointerDown + preventDefault: клик не уводит фокус из редактора,
 * иначе blur закроет редактор раньше вставки.
 */
export default function MathKeyboard() {
  const [open, setOpen] = useState(false);
  useCanvasStore((s) => s.lang);

  const press = (text: string) => {
    const st = useCanvasStore.getState();
    const target = st.editingId && st.blocks[st.editingId] ? st.editingId : null;
    if (target) st.pushKbInsert(target, text);
    else st.addBlock(st.cross.x, st.cross.y, text, true);
  };

  return (
    <div className="absolute left-3 bottom-3 flex flex-col items-start gap-1.5 print:hidden">
      {open && (
        <div
          role="toolbar"
          aria-label={t('kb.title')}
          className="grid grid-cols-6 gap-1 rounded-xl bg-[var(--chrome)]/95 border border-[var(--chrome-line)] p-1.5 shadow-xl"
        >
          {KEYS.map((k) => (
            <button
              key={k.label}
              type="button"
              title={`${k.label} → ${k.hint}`}
              aria-label={k.hint}
              className="min-w-10 min-h-10 px-2 rounded-lg text-[15px] math-input text-[var(--chrome-ink)] hover:bg-[var(--accent-line)]/20 hover:text-[var(--ink)] active:scale-95 cursor-pointer"
              onPointerDown={(e) => {
                e.preventDefault();
                press(k.text);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`nya-tbtn nya-tbtn-big w-10 h-10 ${open ? 'is-on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={open ? t('kb.close') : t('kb.open')}
        aria-label={open ? t('kb.close') : t('kb.open')}
        aria-expanded={open}
      >
        {open ? <IX /> : <ICalc />}
      </button>
    </div>
  );
}

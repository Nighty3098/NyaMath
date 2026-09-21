import { memo } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { IRecalc } from "./Icon";
import { t } from "../i18n";

/**
 * Бейдж несвежего блока (Calculate Now): блок вне области последнего
 * пересчёта, на экране старые результаты. Клик — пересчитать видимые.
 */
function StaleChip({ id }: { id: string }) {
  const stale = useCanvasStore((s) => s.staleIds.includes(id));
  if (!stale) return null;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] leading-5 text-[var(--warn,#b45309)] hover:underline cursor-pointer"
      title={t("m.staleTitle")}
      aria-label={t("m.stale")}
      onClick={(e) => {
        e.stopPropagation();
        useCanvasStore.getState().recalcNow();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span aria-hidden="true" className="inline-flex">
        <IRecalc />
      </span>{" "}
      {t("m.stale")}
    </button>
  );
}

export default memo(StaleChip);

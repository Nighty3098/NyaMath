import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRightFromBracket,
  faArrowRotateLeft,
  faArrowRotateRight,
  faArrowUpRightFromSquare,
  faAtom,
  faBolt,
  faBug,
  faCalculator,
  faChartColumn,
  faChartLine,
  faCode,
  faCopy,
  faCube,
  faDownload,
  faFile,
  faFileCsv,
  faFlask,
  faFolderOpen,
  faGripVertical,
  faLayerGroup,
  faMicrochip,
  faMoon,
  faPaw,
  faPlay,
  faPlus,
  faPrint,
  faRotateRight,
  faRuler,
  faSignal,
  faSliders,
  faSquareRootVariable,
  faSun,
  faSuperscript,
  faTableCells,
  faTableColumns,
  faTriangleExclamation,
  faUpRightAndDownLeftFromCenter,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Единый набор иконок на FontAwesome Free Solid.
 * Имена экспортов сохранены (IFormula, IPlot, …) — все потребители работают без правок.
 * Размер выравнивается под прежнюю 16px-сетку через fixedWidth + fontSize.
 */
function Fa({ icon }: { icon: IconDefinition }) {
  return <FontAwesomeIcon icon={icon} fixedWidth style={{ fontSize: 14 }} aria-hidden="true" />;
}

export const IPlus = () => <Fa icon={faPlus} />;
export const IFormula = () => <Fa icon={faSquareRootVariable} />;
export const IPlot = () => <Fa icon={faChartLine} />;
export const IPlot3d = () => <Fa icon={faCube} />;
export const IBlank = () => <Fa icon={faFile} />;
export const IProgram = () => <Fa icon={faCode} />;
export const ISim = () => <Fa icon={faPlay} />;
export const IPaw = () => <Fa icon={faPaw} />;
export const IFx = () => <Fa icon={faSuperscript} />;
export const IRecalc = () => <Fa icon={faRotateRight} />;
export const IUndo = () => <Fa icon={faArrowRotateLeft} />;
export const IRedo = () => <Fa icon={faArrowRotateRight} />;
export const IGrid = () => <Fa icon={faTableCells} />;
export const IZap = () => <Fa icon={faBolt} />;
export const IDemo = () => <Fa icon={faFlask} />;
export const ISave = () => <Fa icon={faDownload} />;
export const IOpen = () => <Fa icon={faFolderOpen} />;
export const IX = () => <Fa icon={faXmark} />;
export const ISun = () => <Fa icon={faSun} />;
export const IMoon = () => <Fa icon={faMoon} />;
export const IGrip = () => <Fa icon={faGripVertical} />;
/** Угловая ручка ресайза */
export const IResize = () => <Fa icon={faUpRightAndDownLeftFromCenter} />;
/** Отладка (жук) */
export const IBug = () => <Fa icon={faBug} />;
/** Предупреждение (треугольник) */
export const IWarn = () => <Fa icon={faTriangleExclamation} />;
/** Статистика: столбчатая диаграмма */
export const IChart = () => <Fa icon={faChartColumn} />;
/** Исчисление: калькулятор */
export const ICalc = () => <Fa icon={faCalculator} />;
/** Единицы: линейка */
export const IUnits = () => <Fa icon={faRuler} />;
/** Телеком: сигнал */
export const ISignal = () => <Fa icon={faSignal} />;
/** Контурный график: слои изолиний */
export const IContour = () => <Fa icon={faLayerGroup} />;
/** Пристыковать влево */
export const IDockLeft = () => <Fa icon={faTableColumns} />;
/** Пристыковать вправо */
export const IDockRight = () => <Fa icon={faArrowRightFromBracket} />;
/** Открепить (плавающее окно) */
export const IUndock = () => <Fa icon={faArrowUpRightFromSquare} />;
/** Копировать (буфер обмена) */
export const ICopy = () => <Fa icon={faCopy} />;
/** Таблица (CSV-данные) */
export const ITable = () => <Fa icon={faFileCsv} />;
/** Принтер (печать / PDF) */
export const IPrint = () => <Fa icon={faPrint} />;
/** Вычислительная техника: чип */
export const IChip = () => <Fa icon={faMicrochip} />;
/** Параметры (ползунки настройки) */
export const ITune = () => <Fa icon={faSliders} />;
/** ЭМ поля: атом */
export const IField = () => <Fa icon={faAtom} />;

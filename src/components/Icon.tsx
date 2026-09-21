import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRightFromBracket,
  faArrowRotateLeft,
  faArrowRotateRight,
  faArrowUpRightFromSquare,
  faAtom,
  faBars,
  faBolt,
  faBug,
  faCalculator,
  faChartColumn,
  faChartLine,
  faCheck,
  faChevronRight,
  faCode,
  faCopy,
  faCube,
  faDownload,
  faFile,
  faFileCsv,
  faFlask,
  faFolderOpen,
  faGripVertical,
  faInfinity,
  faLayerGroup,
  faMicrochip,
  faMinus,
  faMoon,
  faPause,
  faPaw,
  faPlay,
  faPlus,
  faPrint,
  faRotateRight,
  faRuler,
  faScaleBalanced,
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
function Fa({ icon, size = 14 }: { icon: IconDefinition; size?: number }) {
  return <FontAwesomeIcon icon={icon} fixedWidth style={{ fontSize: size }} aria-hidden="true" />;
}

export const IPlus = () => <Fa icon={faPlus} />;
export const IMinus = () => <Fa icon={faMinus} />;
export const IPlay = () => <Fa icon={faPlay} />;
export const IPause = () => <Fa icon={faPause} />;
export const ICheck = () => <Fa icon={faCheck} />;
export const IChevronR = () => <Fa icon={faChevronRight} />;
export const IMenu = () => <Fa icon={faBars} />;
export const IFormula = () => <Fa icon={faSquareRootVariable} />;
export const IPlot = () => <Fa icon={faChartLine} />;
export const IPlot3d = () => <Fa icon={faCube} />;
export const IBlank = () => <Fa icon={faFile} />;
export const IProgram = () => <Fa icon={faCode} />;
export const ISim = () => <Fa icon={faPlay} />;
export const IPaw = ({ size }: { size?: number } = {}) => <Fa icon={faPaw} size={size} />;
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
/** Неопределённость/метрология: весы */
export const IScale = () => <Fa icon={faScaleBalanced} />;
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
/** Физические константы: бесконечность (константа как вечная величина) */
export const IConst = () => <Fa icon={faInfinity} />;

export declare const ELEMENTS_URL: string;
export interface ElementSeedRow {
  number: number;
  symbol: string;
  name_en: string;
  name_ru: string | null;
  atomic_mass: number | null;
  phase: string | null;
  density: number | null;
  melt: number | null;
  boil: number | null;
  group_no: number | null;
  period: number | null;
  electron_config: string | null;
  electronegativity: number | null;
  molar_heat: number | null;
  category: string | null;
  discovered: string | null;
  source: string | null;
}
export declare function normalizeElement(e: unknown): ElementSeedRow | null;
export declare function normalizeAll(elements: unknown): ElementSeedRow[];
export declare function replaceTopKey(src: string, key: string, valueText: string): string;
export declare function renderRow(r: ElementSeedRow): string;

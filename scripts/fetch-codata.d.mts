export declare const CODATA_URL: string;
export declare const NAME_MAP: Record<string, string>;
export declare const ALIASES: Record<string, string>;
export interface CodataRow {
  quantity: string;
  value: number | null;
  exact: boolean;
  truncated: boolean;
  unit: string;
}
export declare function parseCodata(text: string): CodataRow[];
export declare function relDiff(a: number, b: number): number | null;

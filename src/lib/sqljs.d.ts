/** Минимальные типы sql.js — используем только init + exec + close. */
declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | number[]) => SqlJsDatabase;
  }
  export interface SqlJsResult {
    columns: string[];
    values: unknown[][];
  }
  export interface SqlJsDatabase {
    exec(sql: string): SqlJsResult[];
    close(): void;
  }
  export interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
  }
  export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}

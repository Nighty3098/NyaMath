/** Демо: матрицы, статистика, программы, мульти-график. */
export interface DemoItem {
  kind: 'math' | 'text' | 'plot' | 'program';
  raw: string;
  exportName?: string;
  plotFn?: string;
  plotXmin?: number;
  plotXmax?: number;
}

export const ADVANCED_DEMO: DemoItem[] = [
  { kind: 'text', raw: '// Матрицы: СЛАУ 2x2' },
  { kind: 'math', raw: 'A := [4, 1; 2, 3]' },
  { kind: 'math', raw: 'b := [9; 8]' },
  { kind: 'math', raw: 'x := inv(A)*b' },
  { kind: 'math', raw: 'x =' },
  { kind: 'math', raw: 'det(A) =' },
  { kind: 'text', raw: '// Статистика выборки' },
  { kind: 'math', raw: 'data := [2.3, 3.1, 2.8, 4.0, 3.5, 2.9, 3.3]' },
  { kind: 'math', raw: 'mean(data) =' },
  { kind: 'math', raw: 'std(data) =' },
  { kind: 'math', raw: 'rms(data) =' },
  { kind: 'text', raw: '// Программа: факториал (цикл for)' },
  { kind: 'math', raw: 'n := 7' },
  { kind: 'program', raw: 'f := 1\nfor i in 2..n\n  f := f*i\nend\nf', exportName: 'fact' },
  { kind: 'math', raw: 'fact =' },
  { kind: 'text', raw: '// Связка: график через переменные документа' },
  { kind: 'math', raw: 'w := 2' },
];

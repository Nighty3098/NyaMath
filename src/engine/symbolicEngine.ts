import nerdamer from 'nerdamer';
import type { Scope } from './core';

const symbolicDefinitions = new WeakMap<Scope, Map<string, string>>();
const DECIMAL_PATTERN = /^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|\d+\/\d+)$/i;

export function isSupportedSymbolicFunction(name: string): boolean {
  return nerdamer.functions().system.includes(name);
}

function scopeValues(scope: Scope, omit?: string): Record<string, string> {
  const values: Record<string, string> = {};
  const definitions = symbolicDefinitions.get(scope);
  if (definitions) {
    for (const [name, expression] of definitions) {
      if (expression) values[name] = expression;
    }
  }
  for (const [name, value] of Object.entries(scope)) {
    if (name === omit || definitions?.has(name) || name in values) continue;
    let text: string | null = null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      text = String(value);
    } else if (typeof value === 'bigint') {
      text = String(value);
    } else if (value !== null && typeof value === 'object') {
      const fraction = (value as { toFraction?: () => string }).toFraction;
      const toString = (value as { toString?: () => string }).toString;
      if (typeof fraction === 'function') text = fraction.call(value);
      else if (typeof toString === 'function') text = toString.call(value);
    }
    if (text && DECIMAL_PATTERN.test(text)) values[name] = text;
  }
  return values;
}

export function setSymbolicDefinition(scope: Scope, name: string, expression: string): void {
  const definitions = symbolicDefinitions.get(scope) ?? new Map<string, string>();
  try {
    definitions.set(name, nerdamer(expression, scopeValues(scope, name)).text());
    symbolicDefinitions.set(scope, definitions);
  } catch {
    definitions.set(name, '');
    symbolicDefinitions.set(scope, definitions);
  }
}

export function markSymbolicDefinitionUnsupported(scope: Scope, name: string): void {
  const definitions = symbolicDefinitions.get(scope) ?? new Map<string, string>();
  definitions.set(name, '');
  symbolicDefinitions.set(scope, definitions);
}

export function isSymbolicDefinitionUnsupported(scope: Scope, name: string): boolean {
  return symbolicDefinitions.get(scope)?.get(name) === '';
}

export function getSymbolicDefinitions(
  scope: Scope,
  names: string[],
): Record<string, string | null> {
  const definitions = symbolicDefinitions.get(scope);
  if (!definitions) return {};
  const result: Record<string, string | null> = {};
  for (const name of names) {
    const expression = definitions.get(name);
    if (expression !== undefined) result[name] = expression || null;
  }
  return result;
}

export function clearSymbolicDefinitions(scope: Scope, names: string[]): void {
  const definitions = symbolicDefinitions.get(scope);
  if (!definitions) return;
  for (const name of names) definitions.delete(name);
  if (definitions.size === 0) symbolicDefinitions.delete(scope);
}

export function restoreSymbolicDefinitions(
  scope: Scope,
  names: string[],
  restored: Record<string, string | null>,
): void {
  clearSymbolicDefinitions(scope, names);
  const definitions = symbolicDefinitions.get(scope) ?? new Map<string, string>();
  for (const name of names) {
    if (restored[name] !== undefined) definitions.set(name, restored[name] ?? '');
  }
  if (definitions.size > 0) symbolicDefinitions.set(scope, definitions);
  else symbolicDefinitions.delete(scope);
}

export function evaluateSymbolic(scope: Scope, expression: string, digits?: number): string {
  if (digits !== undefined && (!Number.isInteger(digits) || digits < 1 || digits > 1000)) {
    throw new Error('float precision must be an integer from 1 to 1000');
  }

  const values = scopeValues(scope);
  if (digits === undefined) return nerdamer(expression, values).text();

  const previousPrecision = nerdamer.get('PRECISION');
  try {
    nerdamer.set('PRECISION', digits);
    return nerdamer(expression, values).numeric(digits).text();
  } finally {
    nerdamer.set('PRECISION', previousPrecision);
  }
}

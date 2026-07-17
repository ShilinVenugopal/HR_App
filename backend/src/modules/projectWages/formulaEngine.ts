import { WageColumnDef, WageFormulaSpec } from './wageColumns.types';

export type WageRowValues = Record<string, number | string | null>;

function num(values: WageRowValues, key: string): number {
  const v = values[key];
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function evaluate(spec: WageFormulaSpec, values: WageRowValues): number {
  switch (spec.op) {
    case 'PRORATE': {
      const workingDays = num(values, spec.workingDays);
      if (workingDays === 0) return 0;
      return (num(values, spec.base) / workingDays) * num(values, spec.daysPaid);
    }
    case 'MULTIPLY':
      return num(values, spec.a) * num(values, spec.b);
    case 'PERCENT':
      return (num(values, spec.field) * spec.percent) / 100;
    case 'SUM':
      return spec.fields.reduce((sum, key) => sum + num(values, key), 0);
    case 'CAP_SUM': {
      const total = spec.fields.reduce((sum, key) => sum + num(values, key), 0);
      return Math.min(total, spec.max);
    }
    case 'SLAB2':
      return num(values, spec.field) <= spec.threshold ? 0 : spec.amountAbove;
    case 'SUBTRACT':
      return num(values, spec.from) - spec.fields.reduce((sum, key) => sum + num(values, key), 0);
    default:
      return 0;
  }
}

/// Computes every formula column for a row, in column-declaration order.
/// Column order in a WageColumnDef[] must already be a valid dependency
/// order (each formula only references earlier columns) — true by
/// construction for every template modeled on a real spreadsheet, since
/// spreadsheet formulas conventionally reference cells to their left.
export function computeRow(columns: WageColumnDef[], rawValues: WageRowValues): WageRowValues {
  const result: WageRowValues = { ...rawValues };
  for (const col of columns) {
    if (col.formula) {
      const value = evaluate(col.formula, result);
      result[col.key] = Math.round(value * 100) / 100;
    }
  }
  return result;
}

/// Rounds to whole rupees the way the wages module does everywhere else —
/// used for summary aggregates, not per-row precision.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

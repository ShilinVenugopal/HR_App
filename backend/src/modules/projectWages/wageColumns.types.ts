/// Column-definition vocabulary that drives every project's wages page —
/// the frontend grid, the download template, the upload validator, and the
/// server-side formula engine all read the same WageColumnDef[] for a
/// template. Adding a new project's wage sheet is authoring a new
/// WageColumnDef[] (see nayaraTemplate.ts), not changing any of the code
/// that renders/validates/computes against it.

export type WageColumnType = 'text' | 'number' | 'date';

export type WageFormulaSpec =
  /// value(base) / value(workingDays) * value(daysPaid), 0 if workingDays is 0
  | { op: 'PRORATE'; base: string; workingDays: string; daysPaid: string }
  /// value(a) * value(b)
  | { op: 'MULTIPLY'; a: string; b: string }
  /// value(field) * percent / 100
  | { op: 'PERCENT'; field: string; percent: number }
  /// sum of the named fields
  | { op: 'SUM'; fields: string[] }
  /// min(sum(fields), max)
  | { op: 'CAP_SUM'; fields: string[]; max: number }
  /// value(field) <= threshold ? 0 : amountAbove
  | { op: 'SLAB2'; field: string; threshold: number; amountAbove: number }
  /// value(from) - sum(fields)
  | { op: 'SUBTRACT'; from: string; fields: string[] };

export type WageColumnValidator = 'UAN12';

export interface WageColumnDef {
  key: string;
  label: string;
  section: string;
  type: WageColumnType;
  /// Present => the value is derived server-side and never trusted from
  /// upload/edit input, matching the rest of the app's "never trust a
  /// client-submitted total" wages convention.
  formula?: WageFormulaSpec;
  required?: boolean;
  isEmployeeId?: boolean;
  isEmployeeName?: boolean;
  /// Marks which computed column feeds each summary total shown in the
  /// Monthly Summary bar and stored on WageEntry for fast aggregation.
  /// Exactly one column per template should set each of these.
  isGrossTotal?: boolean;
  isDeductionsTotal?: boolean;
  isNetTotal?: boolean;
  validator?: WageColumnValidator;
  /// Excel column width hint (characters), used by the template generator.
  width?: number;
}

export interface WageTemplateConfig {
  code: string;
  name: string;
  columns: WageColumnDef[];
}

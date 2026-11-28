/// Fixed 3-option payroll cost category — distinct from the (unrelated)
/// procurement Cost Code Master (F05A/F08/etc. used by PR/PO/GRN/
/// Inventory). Single source of truth for the code<->label pairing: the
/// Add Candidate form, the Candidate Excel import/export, and every
/// employee-picker dropdown (Attendance, Wages, Employees, ...) all read
/// from this list rather than hardcoding their own copy.
export const EMPLOYEE_COST_CODE_OPTIONS = [
  { value: 'F01A', label: 'Direct Labour Salary' },
  { value: 'F02A', label: 'In Direct Labour Salary' },
  { value: 'F03A', label: 'Staff Category' },
] as const;

export type EmployeeCostCode = (typeof EMPLOYEE_COST_CODE_OPTIONS)[number]['value'];

export function employeeCostCodeLabel(code?: string | null): string {
  return EMPLOYEE_COST_CODE_OPTIONS.find((o) => o.value === code)?.label ?? '';
}

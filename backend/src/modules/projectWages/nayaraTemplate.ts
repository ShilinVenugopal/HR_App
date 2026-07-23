import { WageColumnDef, WageTemplateConfig } from './wageColumns.types';

/// Column layout reproduced 1:1 from the client's real Nayara AMC payroll
/// file (row 2 headers, columns A–AJ — cross-checked against both the
/// original Formate_Nayara.xlsx template and a live populated export,
/// Nayara_Site_Att_JUN2026HO_COPY.xlsx). Column ORDER here matters beyond
/// cosmetics: it must match the source file's literal left-to-right
/// sequence, because (a) it's what HR staff filling this in Excel expect
/// to see, and (b) it's the order the formula engine's dependency
/// resolution relies on (see formulaEngine.ts — each formula column may
/// only reference columns declared earlier in this array, which holds
/// here because it mirrors the original sheet's own left-to-right formula
/// references). An earlier revision grouped columns by logical section
/// instead of matching the source order, which silently broke
/// compatibility with real uploaded files — see the header-matching fix
/// in projectWages.service.ts / wageExcel.ts for the other half of that
/// fix. Columns AK–AR in the source file were unused padding and are
/// dropped here (AK "REMARKS" is kept — present in the original template,
/// absent from the live copy, but a genuinely useful free-text field).
export const NAYARA_COLUMNS: WageColumnDef[] = [
  // ── Employee Info ──────────────────────────────────────────────────
  { key: 'plant', label: 'Plant', section: 'Employee Info', type: 'text', width: 14 },
  { key: 'designation', label: 'Designation', section: 'Employee Info', type: 'text', width: 16 },
  { key: 'gpNo', label: 'GP No.', section: 'Employee Info', type: 'text', required: true, isEmployeeId: true, isTextFormat: true, width: 12 },
  { key: 'formA', label: 'Form A', section: 'Employee Info', type: 'text', isTextFormat: true, width: 10 },
  { key: 'candidateName', label: 'Name of Candidate', section: 'Employee Info', type: 'text', required: true, isEmployeeName: true, width: 24 },
  { key: 'dateOfJoining', label: 'Date of Joining', section: 'Employee Info', type: 'date', width: 14 },

  // ── Attendance ──────────────────────────────────────────────────────
  { key: 'totalWorkingDays', label: 'Total working days', section: 'Attendance', type: 'number', width: 10 },
  { key: 'leaveDays', label: 'leave', section: 'Attendance', type: 'number', width: 8 },
  { key: 'totalDaysPaid', label: 'Total no. of days to be paid', section: 'Attendance', type: 'number', width: 12 },
  { key: 'extraHrs', label: 'Extra Hrs', section: 'Attendance', type: 'number', width: 10 },
  { key: 'extraHrsRate', label: 'Extra Hrs Rate', section: 'Attendance', type: 'number', width: 10 },

  // ── Bank & Statutory IDs ──────────────────────────────────────────────
  { key: 'uan', label: 'UAN', section: 'Bank & Statutory IDs', type: 'text', validator: 'UAN12', isTextFormat: true, width: 14 },
  { key: 'bankAccountNumber', label: 'Bank account number', section: 'Bank & Statutory IDs', type: 'text', isTextFormat: true, width: 20 },
  { key: 'bankName', label: 'Bank Name', section: 'Bank & Statutory IDs', type: 'text', width: 16 },
  { key: 'bankBranch', label: 'Bank Branch', section: 'Bank & Statutory IDs', type: 'text', width: 16 },

  // ── Salary Structure (Master) ────────────────────────────────────────
  { key: 'monthlyWorkingDays', label: 'Monthly Working Days', section: 'Salary Structure', type: 'number', width: 10 },
  { key: 'monthlyBasicSalary', label: 'Monthly Basic salary', section: 'Salary Structure', type: 'number', width: 12 },
  { key: 'hraMaster', label: 'HRA', section: 'Salary Structure', type: 'number', width: 10 },
  { key: 'specialAllowanceMaster', label: 'Special Allowance', section: 'Salary Structure', type: 'number', width: 12 },
  { key: 'pfAdminChargesMaster', label: 'PF + Admin charges @ 13.00 % of Monthly Basic + Special Allowance', section: 'Salary Structure', type: 'number', width: 14 },
  { key: 'monthlyBonusMaster', label: 'Monthly Bonus 8.33 % of Monthly Basic ', section: 'Salary Structure', type: 'number', width: 12 },
  { key: 'ctc', label: 'CTC', section: 'Salary Structure', type: 'number', width: 12 },
  { key: 'totalSalaryMaster', label: 'Total salary', section: 'Salary Structure', type: 'number', width: 12 },

  // ── Earnings (computed — prorated by days paid) ──────────────────────
  {
    key: 'basicEarned',
    label: 'Basic ',
    section: 'Earnings',
    type: 'number',
    formula: { op: 'PRORATE', base: 'monthlyBasicSalary', workingDays: 'monthlyWorkingDays', daysPaid: 'totalDaysPaid' },
    width: 12,
  },
  {
    key: 'hraEarned',
    label: 'HRA',
    section: 'Earnings',
    type: 'number',
    formula: { op: 'PRORATE', base: 'hraMaster', workingDays: 'monthlyWorkingDays', daysPaid: 'totalDaysPaid' },
    width: 10,
  },
  {
    key: 'otherAllowanceEarned',
    label: 'Other Allowance',
    section: 'Earnings',
    type: 'number',
    formula: { op: 'PRORATE', base: 'specialAllowanceMaster', workingDays: 'monthlyWorkingDays', daysPaid: 'totalDaysPaid' },
    width: 12,
  },
  {
    key: 'otAmount',
    label: 'OT',
    section: 'Earnings',
    type: 'number',
    formula: { op: 'MULTIPLY', a: 'extraHrsRate', b: 'extraHrs' },
    width: 10,
  },
  {
    key: 'monthlyBonusEarned',
    label: 'Monthly Bonus',
    section: 'Earnings',
    type: 'number',
    formula: { op: 'PERCENT', field: 'basicEarned', percent: 8.33 },
    width: 12,
  },
  {
    key: 'totalEarnings',
    label: 'Total Earnings',
    section: 'Earnings',
    type: 'number',
    formula: { op: 'SUM', fields: ['basicEarned', 'hraEarned', 'otherAllowanceEarned', 'otAmount', 'monthlyBonusEarned'] },
    isGrossTotal: true,
    width: 14,
  },

  // ── Deductions (computed) ─────────────────────────────────────────────
  {
    key: 'pfGross',
    label: 'PF Gross',
    section: 'Deductions',
    type: 'number',
    formula: { op: 'CAP_SUM', fields: ['basicEarned', 'otherAllowanceEarned'], max: 15000 },
    width: 12,
  },
  {
    key: 'pfEmployee',
    label: 'PF 12 (Empl)',
    section: 'Deductions',
    type: 'number',
    formula: { op: 'PERCENT', field: 'pfGross', percent: 12 },
    width: 12,
  },
  {
    key: 'professionalTax',
    label: 'P.TAX',
    section: 'Deductions',
    type: 'number',
    formula: { op: 'SLAB2', field: 'totalEarnings', threshold: 12000, amountAbove: 200 },
    width: 10,
  },
  { key: 'deductionFood', label: 'Deduction\nFOOD', section: 'Deductions', type: 'number', width: 10 },
  {
    key: 'totalDeductions',
    label: 'Total Deductions',
    section: 'Deductions',
    type: 'number',
    formula: { op: 'SUM', fields: ['pfEmployee', 'professionalTax', 'deductionFood'] },
    isDeductionsTotal: true,
    width: 14,
  },

  // ── Net Pay ────────────────────────────────────────────────────────
  {
    key: 'netAmount',
    label: 'Total Amount',
    section: 'Net Pay',
    type: 'number',
    formula: { op: 'SUBTRACT', from: 'totalEarnings', fields: ['totalDeductions'] },
    isNetTotal: true,
    width: 14,
  },

  // ── Remarks ────────────────────────────────────────────────────────
  { key: 'remarks', label: 'REMARKS', section: 'Remarks', type: 'text', width: 20 },
];

export const NAYARA_TEMPLATE: WageTemplateConfig = {
  code: 'NAYARA_AMC',
  name: 'Nayara AMC',
  columns: NAYARA_COLUMNS,
};

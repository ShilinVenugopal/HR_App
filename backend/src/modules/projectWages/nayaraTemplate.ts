import { WageColumnDef, WageTemplateConfig } from './wageColumns.types';

/// Column layout reproduced 1:1 from the client-supplied Formate_Nayara.xlsx
/// (row 2 headers, columns A–AK). Formula columns (Y–AJ in the original)
/// are reproduced from the sheet's own Excel formulas — see the op-by-op
/// mapping below. Columns AL–AR in the source file were unused padding and
/// are dropped here.
export const NAYARA_COLUMNS: WageColumnDef[] = [
  // ── Employee Info ──────────────────────────────────────────────────
  { key: 'plant', label: 'Plant', section: 'Employee Info', type: 'text', width: 14 },
  { key: 'designation', label: 'Designation', section: 'Employee Info', type: 'text', width: 16 },
  { key: 'gpNo', label: 'GP No.', section: 'Employee Info', type: 'text', required: true, isEmployeeId: true, width: 12 },
  { key: 'formA', label: 'Form A', section: 'Employee Info', type: 'text', width: 10 },
  { key: 'candidateName', label: 'Name of Candidate', section: 'Employee Info', type: 'text', required: true, isEmployeeName: true, width: 24 },
  { key: 'dateOfJoining', label: 'Date of Joining', section: 'Employee Info', type: 'date', width: 14 },
  { key: 'uan', label: 'UAN', section: 'Employee Info', type: 'text', validator: 'UAN12', width: 14 },
  { key: 'bankAccountNumber', label: 'Bank account number', section: 'Employee Info', type: 'text', width: 20 },
  { key: 'bankName', label: 'Bank Name', section: 'Employee Info', type: 'text', width: 16 },
  { key: 'bankBranch', label: 'Bank Branch', section: 'Employee Info', type: 'text', width: 16 },

  // ── Attendance ──────────────────────────────────────────────────────
  { key: 'totalWorkingDays', label: 'Total working days', section: 'Attendance', type: 'number', width: 10 },
  { key: 'leaveDays', label: 'leave', section: 'Attendance', type: 'number', width: 8 },
  { key: 'totalDaysPaid', label: 'Total no. of days to be paid', section: 'Attendance', type: 'number', width: 12 },
  { key: 'extraHrs', label: 'Extra Hrs', section: 'Attendance', type: 'number', width: 10 },
  { key: 'extraHrsRate', label: 'Extra Hrs Rate', section: 'Attendance', type: 'number', width: 10 },
  { key: 'monthlyWorkingDays', label: 'Monthly Working Days', section: 'Attendance', type: 'number', width: 10 },

  // ── Salary Structure (Master) ────────────────────────────────────────
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

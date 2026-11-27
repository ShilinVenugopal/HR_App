/// Shared by the Add Bill and Bill Detail forms so the TDS auto-calc and
/// Gross/Net formulas can never drift between create and edit.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/// TDS Amount = Basic Amount * TDS Percentage / 100 — only meaningful when
/// a percentage is actually selected (TDS is optional).
export function computeAutoTds(basicAmount: number, tdsPercentage: number | null): number {
  return tdsPercentage ? round2((basicAmount * tdsPercentage) / 100) : 0;
}

export function computeGrossBillAmount(basicAmount: number, additionalAmount: number, gstAmount: number, tollAmount: number): number {
  return round2(basicAmount + additionalAmount + gstAmount + tollAmount);
}

export function computeNetPayableAmount(grossBillAmount: number, tdsAmount: number): number {
  return round2(grossBillAmount - tdsAmount);
}

export function formatRupees(value: number): string {
  return `₹${(value || 0).toLocaleString('en-IN')}`;
}

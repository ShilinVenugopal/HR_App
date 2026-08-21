/// The 8 fixed category sections from the client's real PUR-01.xlsx
/// purchase requisition template (sections A-H), in the template's exact
/// left-to-right/top-to-bottom order. Cost codes themselves are live data
/// from Settings > Cost Codes — this constant only pins the *display
/// order and letter* of the sections that template hardcodes; a Cost Code
/// not in this list (e.g. one added later) simply won't get a dedicated
/// section on the printed PR.
export const PR_CATEGORIES = [
  { letter: 'A', code: 'F05A', label: 'Tools Tackles/Power Tools' },
  { letter: 'B', code: 'F05D', label: 'Machineries (Fixed Assets)' },
  { letter: 'C', code: 'F07A', label: 'Consumable' },
  { letter: 'D', code: 'F08', label: 'Safety Items' },
  { letter: 'E', code: 'F09', label: 'Construction Power' },
  { letter: 'F', code: 'F10', label: 'Site Facilities' },
  { letter: 'G', code: 'F11', label: 'PC, Printer Etc' },
  { letter: 'H', code: 'F12', label: 'GH Items' },
] as const;

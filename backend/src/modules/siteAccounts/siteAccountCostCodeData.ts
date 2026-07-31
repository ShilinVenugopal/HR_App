/// The static F01-F24 cost-code/particulars hierarchy, transcribed exactly
/// from the reference "Forays Account Statement - Rev00.xlsx" template
/// (sheet "AS", rows 14-85) — including its original wording/typos, since
/// that file is the source of truth for this master, not this prompt.
/// `parentCode: null` marks one of the 24 top-level groups; `hasSubtotal`
/// is true only for F01/F02/F03, the only groups the template renders a
/// "Subtotal" row after (F04 onward have no Subtotal row in the source
/// file, despite the task description implying otherwise).
export interface SiteAccountCostCodeRow {
  code: string;
  description: string;
  parentCode: string | null;
  displayOrder: number;
  hasSubtotal: boolean;
}

export const SITE_ACCOUNT_COST_CODES: SiteAccountCostCodeRow[] = [
  { code: 'F01', description: 'Direct Labour', parentCode: null, displayOrder: 10, hasSubtotal: true },
  { code: 'F01I', description: 'Drinking Water at Site', parentCode: 'F01', displayOrder: 20, hasSubtotal: false },
  { code: 'F01J', description: 'Medical Exp, PCC', parentCode: 'F01', displayOrder: 30, hasSubtotal: false },
  { code: 'F01K', description: 'Insurance- PMSBY,PMJJBY', parentCode: 'F01', displayOrder: 40, hasSubtotal: false },
  { code: 'F01L', description: 'Labour Accommodation', parentCode: 'F01', displayOrder: 50, hasSubtotal: false },
  { code: 'F01M', description: 'Labour Transportation', parentCode: 'F01', displayOrder: 60, hasSubtotal: false },

  { code: 'F02', description: 'In-Direct Labour', parentCode: null, displayOrder: 70, hasSubtotal: true },
  { code: 'F02H', description: 'In Direct Labour Accommodation', parentCode: 'F02', displayOrder: 80, hasSubtotal: false },
  { code: 'F02I', description: 'In Direct Labour Transportation', parentCode: 'F02', displayOrder: 90, hasSubtotal: false },

  { code: 'F03', description: 'Staff', parentCode: null, displayOrder: 100, hasSubtotal: true },
  { code: 'F03G', description: 'Staff Accommodation', parentCode: 'F03', displayOrder: 110, hasSubtotal: false },
  { code: 'F03H', description: 'Staff Transportation', parentCode: 'F03', displayOrder: 120, hasSubtotal: false },

  { code: 'F04', description: 'Sub Contractor', parentCode: null, displayOrder: 130, hasSubtotal: false },
  { code: 'F04G', description: 'Labour Accommodation', parentCode: 'F04', displayOrder: 140, hasSubtotal: false },
  { code: 'F04H', description: 'Transportation', parentCode: 'F04', displayOrder: 150, hasSubtotal: false },
  { code: 'F04I', description: 'Sub Contracts', parentCode: 'F04', displayOrder: 160, hasSubtotal: false },
  { code: 'F04J', description: 'Sub Contractor Eletrical testing.', parentCode: 'F04', displayOrder: 170, hasSubtotal: false },
  { code: 'F04K', description: 'NDT Test + IBR Certification', parentCode: 'F04', displayOrder: 180, hasSubtotal: false },

  { code: 'F05', description: 'Construction Equipment', parentCode: null, displayOrder: 190, hasSubtotal: false },
  { code: 'F05A', description: 'Tools', parentCode: 'F05', displayOrder: 200, hasSubtotal: false },
  { code: 'F05B', description: 'Test equipment', parentCode: 'F05', displayOrder: 210, hasSubtotal: false },
  { code: 'F05C', description: 'Scaffolding Material', parentCode: 'F05', displayOrder: 220, hasSubtotal: false },
  { code: 'F05D', description: 'Machineries (Fixed Assets)', parentCode: 'F05', displayOrder: 230, hasSubtotal: false },

  { code: 'F06', description: 'Plant & Machinery (Hire Charges)', parentCode: null, displayOrder: 240, hasSubtotal: false },
  { code: 'F06A', description: 'Lifting & Material Transportation', parentCode: 'F06', displayOrder: 250, hasSubtotal: false },
  { code: 'F06B', description: 'DG set Hire', parentCode: 'F06', displayOrder: 260, hasSubtotal: false },

  { code: 'F07', description: 'Consumables', parentCode: null, displayOrder: 270, hasSubtotal: false },
  { code: 'F07A', description: 'Consumables', parentCode: 'F07', displayOrder: 280, hasSubtotal: false },
  { code: 'F07B', description: 'Sealing Material,Fire Proofing', parentCode: 'F07', displayOrder: 290, hasSubtotal: false },

  { code: 'F08', description: 'Safety Items', parentCode: null, displayOrder: 300, hasSubtotal: false },
  { code: 'F09', description: 'Const. Power Materials+Electricity Consumption Charges', parentCode: null, displayOrder: 310, hasSubtotal: false },
  { code: 'F10', description: 'Site Office/Store/Calibration Room/Ware House', parentCode: null, displayOrder: 320, hasSubtotal: false },
  { code: 'F11', description: 'PC, Printer, Comp Acc.', parentCode: null, displayOrder: 330, hasSubtotal: false },
  { code: 'F12', description: 'STAFF GUEST HOUSE Facilities', parentCode: null, displayOrder: 340, hasSubtotal: false },
  { code: 'F13', description: 'Staff Welfare', parentCode: null, displayOrder: 350, hasSubtotal: false },

  { code: 'F14', description: 'Site Operating Expenses', parentCode: null, displayOrder: 360, hasSubtotal: false },
  { code: 'F14A', description: 'Site Operating Expenses', parentCode: 'F14', displayOrder: 370, hasSubtotal: false },
  { code: 'F14B', description: 'Mobilisation Expense', parentCode: 'F14', displayOrder: 380, hasSubtotal: false },

  { code: 'F15', description: 'Labour License', parentCode: null, displayOrder: 390, hasSubtotal: false },
  { code: 'F16', description: 'CEA Apprroval , Miscellaneous', parentCode: null, displayOrder: 400, hasSubtotal: false },
  { code: 'F17', description: 'BG, SBLC', parentCode: null, displayOrder: 410, hasSubtotal: false },
  { code: 'F18', description: 'BOCW', parentCode: null, displayOrder: 420, hasSubtotal: false },
  { code: 'F19', description: 'Local Union Expences', parentCode: null, displayOrder: 430, hasSubtotal: false },
  { code: 'F20', description: 'Business Promotion', parentCode: null, displayOrder: 440, hasSubtotal: false },
  { code: 'F21', description: 'Miscellaneous', parentCode: null, displayOrder: 450, hasSubtotal: false },
  { code: 'F22', description: 'Security Deposits', parentCode: null, displayOrder: 460, hasSubtotal: false },
  { code: 'F23', description: 'Project Supply Materials (Inc Freight,Transit ins & TP)', parentCode: null, displayOrder: 470, hasSubtotal: false },
  { code: 'F24', description: 'Welfare Funds, Half Yearly/Quarterly Returns', parentCode: null, displayOrder: 480, hasSubtotal: false },
];

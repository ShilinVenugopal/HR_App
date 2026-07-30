/// Default Terms & Conditions 1-11, reproduced verbatim from the client's
/// real PO_to_portal.xls template. A PurchaseOrder's `termsAndConditions`
/// JSON field (keyed by this `id`) only stores an override when a Super
/// Admin actually edits a term — everything else falls back to these
/// defaults, so the vast majority of POs carry no override data at all.
export interface PoTermDef {
  id: string;
  heading: string;
  body: string;
}

export const DEFAULT_PO_TERMS: PoTermDef[] = [
  { id: '1', heading: '1) Price', body: 'a. Price Basis: F.O.R (Delivery Location)\nb. Price shall remain firm till completion of the order' },
  { id: '2', heading: '2) Taxes & Duties', body: 'All taxes/duties are included in price as above' },
  {
    id: '3',
    heading: '3) Payment Terms & Invoicing',
    body: 'Thirty (30) days from the date of receipt of material along with all supporting documents.',
  },
  { id: '4', heading: '4) Delivery', body: 'On or before the delivery date specified above.' },
  {
    id: '5',
    heading: '5) Mode of Dispatch',
    body:
      'a. Destination: Site Address\n' +
      'b. Billing Address: Forays Innovations Pvt. Ltd., Mankanthanam Building, Mukkoottuthara, Kanjirappally, Kottayam Dist., Kerala, India – 686 510\n' +
      'c. Mode: By Road.\n' +
      'd. Freight: To be arranged by the Vendor\n' +
      'e. Consignee: Mankanthanam Building, Mukkoottuthara, Kanjirappally, Kottayam Dist., Kerala, India – 686 510',
  },
  { id: '6', heading: '6) Transit Insurance', body: 'By the Vendor.' },
  {
    id: '7',
    heading: '7) Liquidated Damages for Delayed Delivery',
    body:
      "1/2% of the value of the delayed portion for each week's delay beyond the date of delivery specified in the Purchase Order, " +
      'provided that the aggregate amount payable under this article shall not exceed 5% of the total value of the Purchase Order.',
  },
  {
    id: '8',
    heading: '8) Inspection',
    body: 'a. Place of Inspection: At Delivery Location\nb. Notice for Inspection required\nc. Authority for Inspection: Forays Innovations Pvt Ltd',
  },
  { id: '9', heading: '9) Guarantee / Warrantee Period', body: 'Twelve (12) months from the date of receipt of materials.' },
  {
    id: '10',
    heading: '10) Storage of Materials After Delivery',
    body:
      'If we decide to store the material indicated in this Purchase Order in your premises for a period of 2 months, you undertake to store ' +
      'the said material without any charge to us, and shall provide for its perfect conservation at your own care and charge.',
  },
  {
    id: '11',
    heading: '11) Documentation',
    body:
      'One set of non-negotiable documents — invoice, receipted delivery challan, packing list, material test certificate, etc. — shall be ' +
      'sent to Forays immediately on dispatch of items.',
  },
];

export function resolveTermBody(term: PoTermDef, overrides?: Record<string, string> | null): string {
  return overrides?.[term.id] ?? term.body;
}

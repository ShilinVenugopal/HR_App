import { prisma } from '../../config/database';

/// The 11 default Terms & Conditions, reproduced verbatim from the
/// client's real PO_to_portal.xls template — this used to live as a
/// hardcoded frontend constant (frontend/src/utils/purchaseOrderTerms.ts)
/// before the template became a Super-Admin-editable DB table. Seeding it
/// here (once) is what makes the *initial* state of that editable table
/// match exactly what every PO already displayed before this feature
/// shipped, so turning the feature on doesn't visibly change anything
/// until a Super Admin actually edits it.
const DEFAULT_TERMS: { heading: string; body: string }[] = [
  { heading: '1) Price', body: 'a. Price Basis: F.O.R (Delivery Location)\nb. Price shall remain firm till completion of the order' },
  { heading: '2) Taxes & Duties', body: 'All taxes/duties are included in price as above' },
  {
    heading: '3) Payment Terms & Invoicing',
    body: 'Thirty (30) days from the date of receipt of material along with all supporting documents.',
  },
  { heading: '4) Delivery', body: 'On or before the delivery date specified above.' },
  {
    heading: '5) Mode of Dispatch',
    body:
      'a. Destination: Site Address\n' +
      'b. Billing Address: Forays Innovations Pvt. Ltd., Mankanthanam Building, Mukkoottuthara, Kanjirappally, Kottayam Dist., Kerala, India – 686 510\n' +
      'c. Mode: By Road.\n' +
      'd. Freight: To be arranged by the Vendor\n' +
      'e. Consignee: Mankanthanam Building, Mukkoottuthara, Kanjirappally, Kottayam Dist., Kerala, India – 686 510',
  },
  { heading: '6) Transit Insurance', body: 'By the Vendor.' },
  {
    heading: '7) Liquidated Damages for Delayed Delivery',
    body:
      "1/2% of the value of the delayed portion for each week's delay beyond the date of delivery specified in the Purchase Order, " +
      'provided that the aggregate amount payable under this article shall not exceed 5% of the total value of the Purchase Order.',
  },
  {
    heading: '8) Inspection',
    body: 'a. Place of Inspection: At Delivery Location\nb. Notice for Inspection required\nc. Authority for Inspection: Forays Innovations Pvt Ltd',
  },
  { heading: '9) Guarantee / Warrantee Period', body: 'Twelve (12) months from the date of receipt of materials.' },
  {
    heading: '10) Storage of Materials After Delivery',
    body:
      'If we decide to store the material indicated in this Purchase Order in your premises for a period of 2 months, you undertake to store ' +
      'the said material without any charge to us, and shall provide for its perfect conservation at your own care and charge.',
  },
  {
    heading: '11) Documentation',
    body:
      'One set of non-negotiable documents — invoice, receipted delivery challan, packing list, material test certificate, etc. — shall be ' +
      'sent to Forays immediately on dispatch of items.',
  },
];

/// Create-only, like costCodeMasterSeed — never runs if the table already
/// has rows, so it can never clobber a Super Admin's later edits to the
/// template, no matter how many times `npm run seed` is re-run.
export async function seedDefaultPoTerms(): Promise<void> {
  const existingCount = await prisma.purchaseOrderTerm.count();
  if (existingCount > 0) return;

  await prisma.purchaseOrderTerm.createMany({
    data: DEFAULT_TERMS.map((term, index) => ({ heading: term.heading, body: term.body, sortOrder: index })),
  });
}

/// Every PurchaseOrder created before this feature shipped has a null
/// `termsAndConditions` column — freeze each of them at exactly what they
/// already display (the current, not-yet-edited template) so that once
/// the template becomes Super-Admin-editable, editing it can never change
/// what an already-existing PO shows. Must run after seedDefaultPoTerms.
/// Only ever fills a null column — never overwrites a PO that already has
/// a snapshot (i.e. every PO created after this feature shipped).
export async function backfillPurchaseOrderTermsSnapshot(): Promise<void> {
  const currentTerms = await prisma.purchaseOrderTerm.findMany({ orderBy: { sortOrder: 'asc' } });
  if (!currentTerms.length) return;

  const snapshot = currentTerms.map((t) => ({ id: t.id, heading: t.heading, body: t.body }));

  // Prisma's typed filters can't distinguish "column is SQL NULL" from
  // "JSON null" cleanly across versions for a nullable Json column — a
  // plain raw SELECT sidesteps the ambiguity for this one-time backfill.
  const nullRows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM purchase_orders WHERE "termsAndConditions" IS NULL`);
  if (!nullRows.length) return;

  await prisma.$transaction(
    nullRows.map((row) =>
      prisma.purchaseOrder.update({ where: { id: row.id }, data: { termsAndConditions: snapshot } })
    )
  );
}

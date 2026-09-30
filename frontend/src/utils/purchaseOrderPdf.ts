/// Renders the SAME DOM node that already drives the on-screen PO view and
/// window.print() into an A4 PDF via jsPDF's `.html()` (which uses
/// html2canvas internally) — deliberately, so the PDF can never drift from
/// the print layout or duplicate PO formatting/data logic elsewhere.
///
/// `windowWidth` is pinned to a desktop breakpoint so the same responsive
/// grid classes that give the print layout its compact 2-row reference
/// block (lg:grid-cols-4 in PurchaseOrderDetail.tsx) render identically
/// every time, regardless of how wide the user's actual browser window is
/// when they click Download PDF. `autoPaging: 'text'` lets jsPDF split
/// long content across multiple A4 pages without cutting a line in half.
///
/// `jspdf` (and its html2canvas dependency, ~1.5MB combined) is only ever
/// dynamically imported, matching the same rule already followed by every
/// other PDF export in this codebase (see wageExcel.ts/inventoryExcel.ts).
export async function downloadPurchaseOrderPdf(elementId: string, fileName: string) {
  const element = document.getElementById(elementId);
  if (!element) throw new Error('Could not find the Purchase Order content to export');

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  const margin = 24;
  const pageWidth = doc.internal.pageSize.getWidth();

  await new Promise<void>((resolve, reject) => {
    doc.html(element, {
      x: margin,
      y: margin,
      width: pageWidth - margin * 2,
      windowWidth: 1200,
      autoPaging: 'text',
      html2canvas: {
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // Always render the PDF on a plain light background, regardless
          // of whether the user currently has dark mode on — this is a
          // formal business document, not a themed UI screenshot.
          clonedDoc.documentElement.classList.remove('dark');

          // html2canvas captures the live "screen" media state, not
          // "print" — so elements hidden via the `print:hidden` Tailwind
          // variant (Add Row, Edit Terms & Conditions, row actions, etc.)
          // stay visible here unless removed explicitly. Strip them so the
          // PDF shows the same read-only content a real print would.
          clonedDoc.querySelectorAll<HTMLElement>('[class~="print:hidden"]').forEach((el) => {
            el.style.display = 'none';
          });

          // The on-screen layout truncates long reference values (e.g. a
          // long Quotation No. or Job No.) with an ellipsis so the compact
          // 4-column row stays tidy — but html2canvas captures the live
          // "screen" media state, not "print", so the `print:overflow-
          // visible print:whitespace-normal` classes that undo the
          // truncation for window.print() never take effect here. Undo it
          // directly instead: a printed/PDF'd PO must never silently drop
          // part of a reference number.
          clonedDoc.querySelectorAll<HTMLElement>('.truncate').forEach((el) => {
            el.style.whiteSpace = 'normal';
            el.style.overflow = 'visible';
            el.style.textOverflow = 'clip';
          });

          // html2canvas draws text glyph-by-glyph onto a <canvas> rather
          // than using the browser's normal text shaping/font-fallback
          // pipeline, and the ₹ (Rupee) glyph reliably fails to resolve in
          // that path — it renders as a stray mark instead of the symbol.
          // Swap it for a plain-text equivalent only inside this clone, so
          // the PDF never shows a garbled currency symbol.
          const walker = clonedDoc.createTreeWalker(clonedDoc.body, NodeFilter.SHOW_TEXT);
          const rupeeTextNodes: Text[] = [];
          let node: Node | null;
          // eslint-disable-next-line no-cond-assign
          while ((node = walker.nextNode())) {
            if (node.textContent?.includes('₹')) rupeeTextNodes.push(node as Text);
          }
          rupeeTextNodes.forEach((n) => {
            n.textContent = n.textContent!.replace(/₹/g, 'Rs. ');
          });
        },
      },
      callback: (result) => {
        try {
          result.save(fileName);
          resolve();
        } catch (err) {
          reject(err);
        }
      },
    });
  });
}

import { Request } from 'express';
import { prisma } from '../../config/database';
import { projectScopeWhere } from '../../middleware/project.middleware';

/// Every query below folds in projectScopeWhere(req), same rule the main
/// Dashboard follows — Procurement Dashboard only ever aggregates data from
/// projects the caller is assigned to (or all projects, for Super Admin).
export async function getProcurementDashboardSummary(req: Request) {
  const projectWhere = projectScopeWhere(req);
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    prStatusCounts,
    poStatusCounts,
    grnStatusCounts,
    pendingPrApprovals,
    pendingPoApprovals,
    pendingGrnApprovals,
    inventoryAgg,
    inventoryItemCount,
    approvedPosSinceStart,
    topVendorRows,
  ] = await Promise.all([
    prisma.purchaseRequisition.groupBy({ by: ['status'], where: projectWhere, _count: { _all: true } }),
    prisma.purchaseOrder.groupBy({ by: ['status'], where: projectWhere, _count: { _all: true } }),
    prisma.goodsReceivedNote.groupBy({ by: ['status'], where: projectWhere, _count: { _all: true } }),
    prisma.purchaseRequisition.count({ where: { ...projectWhere, status: 'PENDING_APPROVAL' } }),
    prisma.purchaseOrder.count({ where: { ...projectWhere, status: 'PENDING_APPROVAL' } }),
    prisma.goodsReceivedNote.count({ where: { ...projectWhere, status: 'PENDING_APPROVAL' } }),
    prisma.inventoryItem.aggregate({
      where: projectWhere,
      _sum: { inStockQuantity: true, consumedQuantity: true },
    }),
    prisma.inventoryItem.count({ where: projectWhere }),
    prisma.purchaseOrder.findMany({
      where: { ...projectWhere, status: 'APPROVED', poDate: { gte: sixMonthsAgo } },
      select: { poDate: true, grandTotal: true, vendorId: true, vendor: { select: { name: true } } },
    }),
    prisma.purchaseOrder.groupBy({
      by: ['vendorId'],
      where: { ...projectWhere, status: 'APPROVED' },
      _sum: { grandTotal: true },
      orderBy: { _sum: { grandTotal: 'desc' } },
      take: 5,
    }),
  ]);

  const spendByMonthMap = new Map<string, number>();
  for (const po of approvedPosSinceStart) {
    const key = po.poDate.toISOString().slice(0, 7);
    spendByMonthMap.set(key, (spendByMonthMap.get(key) ?? 0) + Number(po.grandTotal));
  }
  const spendTrend = Array.from(spendByMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));

  const vendorIds = topVendorRows.map((v) => v.vendorId);
  const vendors = await prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } });
  const vendorNameMap = new Map(vendors.map((v) => [v.id, v.name]));
  const topVendors = topVendorRows.map((v) => ({
    vendorId: v.vendorId,
    vendorName: vendorNameMap.get(v.vendorId) ?? 'Unknown',
    totalValue: Number(v._sum.grandTotal ?? 0),
  }));

  return {
    cards: {
      pendingPrApprovals,
      pendingPoApprovals,
      pendingGrnApprovals,
      totalInventoryItems: inventoryItemCount,
      totalWorkingQuantity: Number(inventoryAgg._sum.inStockQuantity ?? 0),
      totalNonWorkingQuantity: Number(inventoryAgg._sum.consumedQuantity ?? 0),
    },
    charts: {
      prStatus: prStatusCounts.map((r) => ({ status: r.status, count: r._count._all })),
      poStatus: poStatusCounts.map((r) => ({ status: r.status, count: r._count._all })),
      grnStatus: grnStatusCounts.map((r) => ({ status: r.status, count: r._count._all })),
      spendTrend,
      topVendors,
    },
  };
}

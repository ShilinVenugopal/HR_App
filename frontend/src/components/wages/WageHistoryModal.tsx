import { useQuery } from '@tanstack/react-query';
import { Modal } from '../common/Modal';
import { Skeleton } from '../common/Skeleton';
import { projectWagesApi } from '../../api/modules';
import { MONTHS } from '../../utils/wageExcel';

export function WageHistoryModal({
  open,
  onClose,
  templateCode,
  employeeCode,
  employeeName,
}: {
  open: boolean;
  onClose: () => void;
  templateCode: string;
  employeeCode: string | null;
  employeeName?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['wage-history', templateCode, employeeCode],
    queryFn: () => projectWagesApi.getHistory(templateCode, employeeCode!),
    enabled: open && Boolean(employeeCode),
  });

  const grossKey = data?.columns.find((c) => c.isGrossTotal)?.key;
  const pfKey = data?.columns.find((c) => c.key === 'pfEmployee')?.key ?? 'pfEmployee';
  const otKey = data?.columns.find((c) => c.key === 'otAmount')?.key ?? 'otAmount';
  const bonusKey = data?.columns.find((c) => c.key.toLowerCase().includes('bonus') && c.formula)?.key;

  return (
    <Modal open={open} onClose={onClose} title={`Employee Wage History — ${employeeName ?? ''}`} size="lg">
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {!isLoading && !data?.entries.length && <p className="py-8 text-center text-sm text-slate-400">No wage history found for this employee.</p>}
      {!isLoading && Boolean(data?.entries.length) && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                <th className="px-2 py-2">Month</th>
                <th className="px-2 py-2 text-right">OT</th>
                <th className="px-2 py-2 text-right">Bonus</th>
                <th className="px-2 py-2 text-right">Gross</th>
                <th className="px-2 py-2 text-right">PF</th>
                <th className="px-2 py-2 text-right">Net Salary</th>
              </tr>
            </thead>
            <tbody>
              {data!.entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800/60">
                  <td className="px-2 py-2 font-medium">
                    {MONTHS[e.month - 1]} {e.year}
                  </td>
                  <td className="px-2 py-2 text-right">{Number(e.data[otKey] ?? 0).toLocaleString('en-IN')}</td>
                  <td className="px-2 py-2 text-right">{bonusKey ? Number(e.data[bonusKey] ?? 0).toLocaleString('en-IN') : '—'}</td>
                  <td className="px-2 py-2 text-right">{grossKey ? Number(e.data[grossKey] ?? e.grossSalary).toLocaleString('en-IN') : Number(e.grossSalary).toLocaleString('en-IN')}</td>
                  <td className="px-2 py-2 text-right">{Number(e.data[pfKey] ?? 0).toLocaleString('en-IN')}</td>
                  <td className="px-2 py-2 text-right font-semibold">₹{Number(e.netSalary).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

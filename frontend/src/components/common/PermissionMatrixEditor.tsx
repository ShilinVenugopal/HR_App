import { ALL_MODULES, MODULE_LABELS, ModuleName, PermissionClaim, PermissionMatrix } from '../../types';

const ACTIONS: { key: keyof PermissionClaim; label: string }[] = [
  { key: 'canView', label: 'View' },
  { key: 'canAdd', label: 'Add' },
  { key: 'canEdit', label: 'Edit' },
  { key: 'canDelete', label: 'Delete' },
  { key: 'canApprove', label: 'Approve' },
];

/// The permission matrix editor — the visual heart of RBAC configuration.
/// USER_MANAGEMENT is excluded: that capability is tied to role
/// (SUPER_ADMIN) rather than a configurable per-user grant.
export function PermissionMatrixEditor({
  value,
  onChange,
  disabled,
}: {
  value: PermissionMatrix;
  onChange: (next: PermissionMatrix) => void;
  disabled?: boolean;
}) {
  const modules: ModuleName[] = ALL_MODULES.filter((m) => m !== 'USER_MANAGEMENT');

  const toggle = (module: ModuleName, key: keyof PermissionClaim) => {
    if (disabled) return;
    const next = { ...value, [module]: { ...value[module], [key]: !value[module][key] } };
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Module</th>
            {ACTIONS.map((a) => (
              <th key={a.key} className="px-4 py-2.5 text-center font-semibold">
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {modules.map((module) => (
            <tr key={module}>
              <td className="px-4 py-2.5 font-medium">{MODULE_LABELS[module]}</td>
              {ACTIONS.map((a) => (
                <td key={a.key} className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={Boolean(value[module]?.[a.key])}
                    onChange={() => toggle(module, a.key)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

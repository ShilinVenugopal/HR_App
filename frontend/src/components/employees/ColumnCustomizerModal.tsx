import { Modal } from '../common/Modal';
import { DEFAULT_VISIBLE_COLUMNS, EMPLOYEE_FIELDS, EmployeeFieldKey } from '../../utils/employeeExcel';

export function ColumnCustomizerModal({
  open,
  onClose,
  visibleKeys,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  visibleKeys: EmployeeFieldKey[];
  onChange: (keys: EmployeeFieldKey[]) => void;
}) {
  const toggle = (key: EmployeeFieldKey) => {
    onChange(visibleKeys.includes(key) ? visibleKeys.filter((k) => k !== key) : [...visibleKeys, key]);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize Columns"
      footer={
        <>
          <button className="btn-secondary" onClick={() => onChange(DEFAULT_VISIBLE_COLUMNS)}>
            Reset to Default
          </button>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Choose which columns to show in the employee list. Your selection is remembered.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EMPLOYEE_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            <input type="checkbox" checked={visibleKeys.includes(f.key)} onChange={() => toggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}

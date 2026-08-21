import { Modal } from './Modal';

export interface ColumnField<K extends string = string> {
  key: K;
  label: string;
}

export function ColumnCustomizerModal<K extends string>({
  open,
  onClose,
  fields,
  visibleKeys,
  defaultKeys,
  onChange,
  description,
}: {
  open: boolean;
  onClose: () => void;
  fields: readonly ColumnField<K>[];
  visibleKeys: K[];
  defaultKeys: K[];
  onChange: (keys: K[]) => void;
  description?: string;
}) {
  const toggle = (key: K) => {
    onChange(visibleKeys.includes(key) ? visibleKeys.filter((k) => k !== key) : [...visibleKeys, key]);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize Columns"
      footer={
        <>
          <button className="btn-secondary" onClick={() => onChange(defaultKeys)}>
            Reset to Default
          </button>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        {description ?? 'Choose which columns to show in the list. Your selection is remembered.'}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
            <input type="checkbox" checked={visibleKeys.includes(f.key)} onChange={() => toggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}

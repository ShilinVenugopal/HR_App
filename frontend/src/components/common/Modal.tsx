import { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}) {
  if (!open) return null;

  const sizeClass = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:static print:bg-transparent print:p-0" onClick={onClose}>
      <div
        className={`card w-full ${sizeClass} flex max-h-[90vh] flex-col overflow-hidden print:max-h-none print:w-full print:max-w-none print:overflow-visible print:shadow-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 print:hidden dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 print:overflow-visible">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 print:hidden dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { poTermsApi } from '../../api/modules';
import { apiErrorMessage } from '../../api/client';

interface DraftTerm {
  key: string;
  heading: string;
  body: string;
}

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `term-${keyCounter}`;
}

/// Super-Admin-only editor for the *global default* Terms & Conditions
/// template (backend: PurchaseOrderTerm, gated by requireSuperAdmin on
/// the PUT). Saving here only changes what future Purchase Orders
/// snapshot at creation — it never touches an already-created PO's own
/// termsAndConditions, which is frozen the moment that PO was first saved.
export function PoTermsTemplateModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const { data: terms } = useQuery({ queryKey: ['po-terms'], queryFn: () => poTermsApi.list(), enabled: open });
  const [draft, setDraft] = useState<DraftTerm[]>([]);

  useEffect(() => {
    if (terms) setDraft(terms.map((t) => ({ key: newKey(), heading: t.heading, body: t.body })));
  }, [terms]);

  const saveMutation = useMutation({
    mutationFn: () => poTermsApi.replace(draft.map((t) => ({ heading: t.heading.trim(), body: t.body.trim() }))),
    onSuccess: () => {
      toast.success('Terms & Conditions updated — future Purchase Orders will use this template. Existing POs are unaffected.');
      queryClient.invalidateQueries({ queryKey: ['po-terms'] });
      onSaved();
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const update = (key: string, patch: Partial<DraftTerm>) => setDraft((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const remove = (key: string) => setDraft((prev) => prev.filter((t) => t.key !== key));
  const add = () => setDraft((prev) => [...prev, { key: newKey(), heading: '', body: '' }]);
  const move = (index: number, dir: -1 | 1) =>
    setDraft((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const canSave = draft.length > 0 && draft.every((t) => t.heading.trim() && t.body.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Terms & Conditions (Super Admin)"
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Save Terms & Conditions
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          This is the default template new Purchase Orders will use going forward. Already-created POs keep whatever terms they were saved
          with — editing this list never changes them.
        </p>

        {draft.map((term, index) => (
          <div key={term.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 flex items-center gap-2">
              <input
                className="input flex-1 font-medium"
                placeholder="Heading (e.g. 1) Price)"
                value={term.heading}
                onChange={(e) => update(term.key, { heading: e.target.value })}
              />
              <button className="btn-ghost p-1.5" disabled={index === 0} onClick={() => move(index, -1)} title="Move up">
                <ArrowUp size={14} />
              </button>
              <button className="btn-ghost p-1.5" disabled={index === draft.length - 1} onClick={() => move(index, 1)} title="Move down">
                <ArrowDown size={14} />
              </button>
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => remove(term.key)} title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              className="input text-xs"
              rows={3}
              placeholder="Term body"
              value={term.body}
              onChange={(e) => update(term.key, { body: e.target.value })}
            />
          </div>
        ))}

        <button className="btn-secondary" onClick={add}>
          <Plus size={16} /> Add Term
        </button>
      </div>
    </Modal>
  );
}

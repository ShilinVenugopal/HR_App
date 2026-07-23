import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../common/Modal';
import { apiErrorMessage } from '../../api/client';
import { BulkImportFailure, BulkImportResult, DuplicateMatch, recruitmentBulkApi } from '../../api/modules';
import type { ValidatedCandidateRow } from '../../utils/excelImport';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

type Step = 'upload' | 'preview' | 'duplicates' | 'importing' | 'summary';

export function BulkImportModal({
  open,
  onClose,
  projectOptions,
  designationOptions,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  projectOptions: { value: string; label: string }[];
  designationOptions: { value: string; label: string }[];
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>('upload');
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ValidatedCandidateRow[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [combinedFailures, setCombinedFailures] = useState<BulkImportFailure[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFileError(null);
    setParsing(false);
    setRows([]);
    setDuplicates([]);
    setCheckingDuplicates(false);
    setResult(null);
    setCombinedFailures([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    const hasImported = step === 'summary' && result && (result.imported > 0 || result.updated > 0);
    reset();
    onClose();
    if (hasImported) onImported();
  };

  const handleFileSelect = async (file: File) => {
    setFileError(null);

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError('Only .xlsx and .xls files are supported.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError('File is too large. Maximum size is 20 MB.');
      return;
    }

    setParsing(true);
    try {
      const { parseCandidateWorkbook, validateCandidateRows } = await import('../../utils/excelImport');
      const rawRows = await parseCandidateWorkbook(file);
      const validated = validateCandidateRows(rawRows, {
        projects: projectOptions.map((p) => ({ id: p.value, name: p.label })),
        designations: designationOptions.map((d) => ({ id: d.value, name: d.label })),
      });
      setRows(validated);
      setStep('preview');
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read this file.');
    } finally {
      setParsing(false);
    }
  };

  const validRows = rows.filter((r) => r.isValid);
  const invalidRows = rows.filter((r) => !r.isValid);

  const startImport = async (duplicateStrategy: 'skip' | 'update') => {
    setStep('importing');
    try {
      const result = await recruitmentBulkApi.import(
        validRows.map((r) => ({
          rowNumber: r.rowNumber,
          candidateName: r.candidateName,
          contactNumber: r.contactNumber,
          dateOfBirth: r.dateOfBirth,
          qualification: r.qualification,
          experience: r.experience,
          designationId: r.designationId,
          email: r.email,
          projectId: r.projectId,
          resumeUrl: r.resumeUrl,
          foraysInterviewStatus: r.foraysInterviewStatus,
          clientInterviewStatus: r.clientInterviewStatus,
          status: r.status,
          remarks: r.remarks,
        })),
        duplicateStrategy
      );
      setResult(result);
      setCombinedFailures([
        ...invalidRows.map((r) => ({
          rowNumber: r.rowNumber,
          candidateName: r.candidateName || '(blank)',
          contactNumber: r.contactNumber || '(blank)',
          reason: r.errors.join('; '),
        })),
        ...result.failures,
      ]);
      setStep('summary');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Import failed'));
      setStep('preview');
    }
  };

  const handleImportClick = async () => {
    if (!validRows.length) return;
    setCheckingDuplicates(true);
    try {
      const matches = await recruitmentBulkApi.checkDuplicates(validRows.map((r) => r.contactNumber));
      if (matches.length > 0) {
        setDuplicates(matches);
        setStep('duplicates');
      } else {
        await startImport('skip');
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not check for duplicate candidates'));
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const duplicateContacts = new Set(duplicates.map((d) => d.contactNumber));

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Import from Excel" size="xl">
      {step === 'upload' && (
        <div>
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <FileSpreadsheet className="mx-auto mb-3 text-slate-400" size={36} />
            <p className="text-sm font-medium">Upload a completed Candidate Template</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">.xlsx or .xls, up to 20 MB</p>
            <button
              className="btn-primary mt-4"
              disabled={parsing}
              onClick={() => fileInputRef.current?.click()}
            >
              {parsing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {parsing ? 'Reading file...' : 'Choose File'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
          </div>
          {fileError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400">
            Don't have the template yet? Close this dialog and click "Download Template" first.
          </p>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {validRows.length} valid
            </span>
            {invalidRows.length > 0 && (
              <span className="badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{invalidRows.length} invalid</span>
            )}
            <span className="text-slate-500">of {rows.length} rows in the file</span>
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Candidate</th>
                  <th className="px-3 py-2 font-semibold">Contact</th>
                  <th className="px-3 py-2 font-semibold">Project</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.rowNumber} className={r.isValid ? '' : 'bg-red-50/70 dark:bg-red-900/10'}>
                    <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                    <td className="px-3 py-2">{r.candidateName || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2">{r.contactNumber || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2">{projectOptions.find((p) => p.value === r.projectId)?.label ?? '—'}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">
                      {r.isValid ? (
                        <CheckCircle2 size={15} className="text-emerald-500" />
                      ) : (
                        <span className="text-xs text-red-600 dark:text-red-400">{r.errors.join('; ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-secondary" onClick={reset}>
              Choose Different File
            </button>
            <button className="btn-primary" disabled={!validRows.length || checkingDuplicates} onClick={handleImportClick}>
              {checkingDuplicates && <Loader2 size={16} className="animate-spin" />}
              Import {validRows.length} Candidate{validRows.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {step === 'duplicates' && (
        <div>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              The following {duplicates.length} candidate{duplicates.length === 1 ? '' : 's'} already exist{duplicates.length === 1 ? 's' : ''}{' '}
              (matched by contact number). How should they be handled?
            </span>
          </div>

          <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Candidate</th>
                  <th className="px-3 py-2 font-semibold">Contact Number</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {duplicates.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2">{d.candidateName}</td>
                    <td className="px-3 py-2">{d.contactNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {validRows.length - duplicates.length} new candidate{validRows.length - duplicates.length === 1 ? '' : 's'} will be imported
            regardless of your choice below.
          </p>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" onClick={() => setStep('preview')}>
              Cancel
            </button>
            <button className="btn-secondary" onClick={() => startImport('skip')}>
              Skip Existing
            </button>
            <button className="btn-primary" onClick={() => startImport('update')}>
              Update Existing
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-brand-600" />
          <p className="mt-3 text-sm text-slate-500">Importing candidates...</p>
        </div>
      )}

      {step === 'summary' && result && (
        <div>
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="text-emerald-500" size={22} />
            Import Completed
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryStat label="Total Rows" value={rows.length} />
            <SummaryStat label="Imported" value={result.imported} accent="emerald" />
            <SummaryStat label="Updated" value={result.updated} accent="brand" />
            <SummaryStat label="Skipped" value={result.skipped} accent="amber" />
            <SummaryStat label="Failed" value={result.failed + invalidRows.length} accent="red" />
          </div>

          {combinedFailures.length > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
              <span>{combinedFailures.length} row(s) could not be imported.</span>
              <button
                className="btn-secondary"
                onClick={async () => {
                  const { downloadImportReport } = await import('../../utils/excelImport');
                  await downloadImportReport(combinedFailures);
                }}
              >
                <Download size={15} /> Download Import_Report.xlsx
              </button>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button className="btn-primary" onClick={handleClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent?: 'emerald' | 'brand' | 'amber' | 'red' }) {
  const accentClass = accent
    ? {
        emerald: 'text-emerald-600 dark:text-emerald-400',
        brand: 'text-brand-600 dark:text-brand-400',
        amber: 'text-amber-600 dark:text-amber-400',
        red: 'text-red-600 dark:text-red-400',
      }[accent]
    : 'text-slate-900 dark:text-slate-100';

  return (
    <div className="card p-3 text-center">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}

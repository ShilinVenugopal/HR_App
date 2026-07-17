import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../common/Modal';
import { apiErrorMessage } from '../../api/client';
import { WageColumnDef, WageImportError, WageImportResult, projectWagesApi, uploadsApi } from '../../api/modules';
import { MONTHS, parseWageUploadFile, validateParsedRows } from '../../utils/wageExcel';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

type Step = 'upload' | 'preview' | 'importing' | 'summary';

export function WageUploadModal({
  open,
  onClose,
  templateCode,
  templateName,
  columns,
  month,
  year,
  existingCount,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  templateCode: string;
  templateName: string;
  columns: WageColumnDef[];
  month: number;
  year: number;
  existingCount: number;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>('upload');
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [validationErrors, setValidationErrors] = useState<{ row: number; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<WageImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<{ rowNumber: number; values: Record<string, string | number | null> }[]>([]);

  const reset = () => {
    setStep('upload');
    setFileError(null);
    setParsing(false);
    setFile(null);
    setRowCount(0);
    setValidationErrors([]);
    setImporting(false);
    setResult(null);
    setParsedRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    const imported = step === 'summary' && result && result.imported > 0;
    reset();
    onClose();
    if (imported) onImported();
  };

  const handleFileSelect = async (selected: File) => {
    setFileError(null);
    const ext = selected.name.slice(selected.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError('Only .xlsx and .xls files are supported.');
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFileError('File is too large. Maximum size is 20 MB.');
      return;
    }

    setParsing(true);
    try {
      const parsed = await parseWageUploadFile(columns, selected);
      if (!parsed.headerValid) {
        setFileError(parsed.headerError ?? 'This file does not match the expected wage sheet template.');
        setParsing(false);
        return;
      }
      if (!parsed.rows.length) {
        setFileError('No data rows were found below the header row.');
        setParsing(false);
        return;
      }
      const errors = validateParsedRows(columns, parsed.rows);
      setFile(selected);
      setParsedRows(parsed.rows);
      setRowCount(parsed.rows.length);
      setValidationErrors(errors);
      setStep('preview');
    } catch {
      setFileError('Could not read this file. Make sure it is a valid, uncorrupted Excel file.');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file) return;
    setImporting(true);
    setStep('importing');
    try {
      const uploaded = await uploadsApi.upload(file);
      const res = await projectWagesApi.import(templateCode, {
        month,
        year,
        fileName: file.name,
        fileUrl: uploaded.url,
        rows: parsedRows,
      });
      setResult(res);
      setStep('summary');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Import failed'));
      setStep('preview');
    } finally {
      setImporting(false);
    }
  };

  const downloadErrorReport = async (errors: WageImportError[]) => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Import Errors');
    sheet.columns = [
      { header: 'Row', key: 'row', width: 10 },
      { header: 'Error', key: 'message', width: 60 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRows(errors);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Import_Report.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const validCount = rowCount - validationErrors.length;

  return (
    <Modal open={open} onClose={handleClose} title={`Upload Wages — ${templateName}`} size="lg">
      {step === 'upload' && (
        <div>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Upload the completed {MONTHS[month - 1]} {year} wage sheet for {templateName}. Use the "Download Template" button first if you
            don't already have one.
          </p>
          {existingCount > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                {existingCount} wage record{existingCount === 1 ? '' : 's'} already exist for {MONTHS[month - 1]} {year}. Matching Employee
                IDs in this upload will update those records; others will be added.
              </span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-10 text-slate-500 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400"
          >
            {parsing ? <Loader2 size={28} className="animate-spin" /> : <Upload size={28} />}
            <span className="text-sm font-medium">{parsing ? 'Reading file...' : 'Click to select the filled wage sheet (.xlsx)'}</span>
          </button>
          {fileError && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
              <XCircle size={14} /> {fileError}
            </p>
          )}
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-800">
              <p className="text-2xl font-semibold text-emerald-600">{validCount}</p>
              <p className="text-xs text-slate-500">Valid rows</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-800">
              <p className="text-2xl font-semibold text-red-600">{validationErrors.length}</p>
              <p className="text-xs text-slate-500">Rows with errors (will be skipped)</p>
            </div>
          </div>
          {validationErrors.length > 0 && (
            <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {validationErrors.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-1.5 text-slate-500">Row {e.row}</td>
                      <td className="px-3 py-1.5 text-red-600 dark:text-red-400">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setStep('upload')}>
              Choose Different File
            </button>
            <button className="btn-primary" disabled={validCount === 0 || importing} onClick={handleConfirmImport}>
              Import {validCount} Row{validCount === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 size={28} className="animate-spin text-brand-600" />
          <p className="text-sm text-slate-500">Importing wage records...</p>
        </div>
      )}

      {step === 'summary' && result && (
        <div>
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-900/20">
            <CheckCircle2 size={22} className="text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">Import complete</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                {result.imported} of {result.total} rows imported successfully.
              </p>
            </div>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-xl font-semibold">{result.total}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-xl font-semibold text-emerald-600">{result.imported}</p>
              <p className="text-xs text-slate-500">Imported</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-xl font-semibold text-red-600">{result.failed}</p>
              <p className="text-xs text-slate-500">Failed</p>
            </div>
          </div>
          {result.failed > 0 && (
            <button className="btn-secondary mb-4 w-full" onClick={() => downloadErrorReport(result.errors)}>
              <Download size={15} /> Download Import_Report.xlsx
            </button>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={handleClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

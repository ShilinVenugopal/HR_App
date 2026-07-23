import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

export const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

/// Restricts uploads to known-safe document/image types and a 20MB cap —
/// prevents arbitrary file type uploads (e.g. executables, scripts) that
/// could be used for stored-XSS or server compromise. 20MB matches the
/// Bulk Communication attachment limit (PDF/DOCX/XLSX/images); resumes and
/// other document uploads share this same limit.
export const uploadDocument = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Unsupported file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG'));
    }
    cb(null, true);
  },
});

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { uploadDocument } from '../../utils/upload';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { ApiError } from '../../utils/apiError';

const router = Router();

router.post(
  '/',
  authenticate,
  uploadDocument.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file uploaded');
    return sendSuccess(res, { url: `/uploads/${req.file.filename}`, originalName: req.file.originalname }, 'File uploaded');
  })
);

export default router;

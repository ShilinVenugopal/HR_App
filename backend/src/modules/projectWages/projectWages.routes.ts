import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  codeParamSchema,
  createEntrySchema,
  deleteEntrySchema,
  entriesQuerySchema,
  historyParamSchema,
  importSchema,
  summaryQuerySchema,
  updateEntrySchema,
} from './projectWages.validation';
import * as projectWagesController from './projectWages.controller';

const router = Router();
router.use(authenticate);

router.get('/templates', requirePermission('WAGES', 'view'), projectWagesController.listTemplatesHandler);
router.get('/:code', requirePermission('WAGES', 'view'), validate(codeParamSchema), projectWagesController.getTemplateHandler);
router.get('/:code/entries', requirePermission('WAGES', 'view'), validate(entriesQuerySchema), projectWagesController.listEntriesHandler);
router.get('/:code/summary', requirePermission('WAGES', 'view'), validate(summaryQuerySchema), projectWagesController.getSummaryHandler);
router.get('/:code/history/:employeeCode', requirePermission('WAGES', 'view'), validate(historyParamSchema), projectWagesController.getHistoryHandler);

router.post('/:code/entries', requirePermission('WAGES', 'add'), validate(createEntrySchema), projectWagesController.createEntryHandler);
router.post('/:code/import', requirePermission('WAGES', 'add'), validate(importSchema), projectWagesController.importHandler);
router.put('/:code/entries/:id', requirePermission('WAGES', 'edit'), validate(updateEntrySchema), projectWagesController.updateEntryHandler);
router.delete('/:code/entries/:id', requirePermission('WAGES', 'delete'), validate(deleteEntrySchema), projectWagesController.deleteEntryHandler);

export default router;

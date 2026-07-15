import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCandidateSchema, idParamSchema, updateCandidateSchema } from './recruitment.validation';
import * as recruitmentController from './recruitment.controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('RECRUITMENT', 'view'), recruitmentController.listCandidatesHandler);
router.get('/:id', requirePermission('RECRUITMENT', 'view'), validate(idParamSchema), recruitmentController.getCandidateHandler);
router.post('/', requirePermission('RECRUITMENT', 'add'), validate(createCandidateSchema), recruitmentController.createCandidateHandler);
router.put(
  '/:id',
  requirePermission('RECRUITMENT', 'edit'),
  validate(idParamSchema),
  validate(updateCandidateSchema),
  recruitmentController.updateCandidateHandler
);
router.delete('/:id', requirePermission('RECRUITMENT', 'delete'), validate(idParamSchema), recruitmentController.deleteCandidateHandler);

export default router;

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createExpenseSchema, idParamSchema, lookupQuerySchema, updateExpenseSchema } from './expenses.validation';
import * as expensesController from './expenses.controller';

const router = Router();
router.use(authenticate);

// Declared before '/:id' so 'lookup' is never matched as an expense id.
router.get('/lookup', requirePermission('EXPENSE', 'view'), validate(lookupQuerySchema), expensesController.lookupExpenseHandler);

router.get('/', requirePermission('EXPENSE', 'view'), expensesController.listExpensesHandler);
router.get('/:id', requirePermission('EXPENSE', 'view'), validate(idParamSchema), expensesController.getExpenseHandler);
router.post('/', requirePermission('EXPENSE', 'add'), validate(createExpenseSchema), expensesController.createExpenseHandler);
router.put(
  '/:id',
  requirePermission('EXPENSE', 'edit'),
  validate(idParamSchema),
  validate(updateExpenseSchema),
  expensesController.updateExpenseHandler
);
router.delete('/:id', requirePermission('EXPENSE', 'delete'), validate(idParamSchema), expensesController.deleteExpenseHandler);

export default router;

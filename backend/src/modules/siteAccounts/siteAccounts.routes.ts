import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { ApiError } from '../../utils/apiError';
import { createStatementSchema, idParamSchema, updateStatementSchema } from './siteAccounts.validation';
import * as siteAccountsController from './siteAccounts.controller';

/// PATCH /:id covers two distinct cases the service layer disambiguates by
/// the statement's actual status: editing a DRAFT (needs canEdit) or
/// correcting an already-SAVED statement (needs canApprove instead). A
/// plain requirePermission('edit') would reject a correction-only user
/// (canApprove but not canEdit) before the service ever gets a chance to
/// apply that distinction — so the route only confirms the caller holds
/// *one* of the two relevant flags, and siteAccounts.service.ts's
/// assertCanMutateStatement() enforces exactly which one, once it knows
/// the statement's real status.
function requireEditOrApprove(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) return next(ApiError.unauthorized());
  if (user.role === 'SUPER_ADMIN') return next();

  const claim = user.permissions['SITE_ACCOUNTS'];
  if (!claim || (!claim.canEdit && !claim.canApprove)) {
    req.auditContext = { module: 'SITE_ACCOUNTS', action: 'edit', reason: 'missing module permission' };
    return next(ApiError.forbidden('Access Denied'));
  }
  next();
}

const router = Router();
router.use(authenticate);

// Declared before '/:id' so 'cost-codes' is never matched as a statement id.
router.get('/cost-codes', requirePermission('SITE_ACCOUNTS', 'view'), siteAccountsController.listCostCodesHandler);

router.get('/', requirePermission('SITE_ACCOUNTS', 'view'), siteAccountsController.listStatementsHandler);
router.get('/:id', requirePermission('SITE_ACCOUNTS', 'view'), validate(idParamSchema), siteAccountsController.getStatementHandler);
router.post('/', requirePermission('SITE_ACCOUNTS', 'add'), validate(createStatementSchema), siteAccountsController.createStatementHandler);
router.patch('/:id', requireEditOrApprove, validate(idParamSchema), validate(updateStatementSchema), siteAccountsController.updateStatementHandler);
router.post('/:id/save', requirePermission('SITE_ACCOUNTS', 'edit'), validate(idParamSchema), siteAccountsController.saveStatementHandler);
router.delete('/:id', requirePermission('SITE_ACCOUNTS', 'delete'), validate(idParamSchema), siteAccountsController.deleteStatementHandler);

export default router;

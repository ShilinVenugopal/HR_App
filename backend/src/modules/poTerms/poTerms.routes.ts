import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { replacePoTermsSchema } from './poTerms.validation';
import * as poTermsController from './poTerms.controller';

const router = Router();
router.use(authenticate);

// The default Terms & Conditions template is reference data every
// authenticated user needs to read (it's shown on every PO, including
// while a non-Super-Admin is drafting one) — only replacing it is
// Super-Admin-gated, same split as Cost Code Master.
router.get('/', poTermsController.listPoTermsHandler);
router.put('/', requireSuperAdmin, validate(replacePoTermsSchema), poTermsController.replacePoTermsHandler);

export default router;

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createBankAccountSchema, idParamSchema, updateBankAccountSchema } from './bankAccounts.validation';
import * as controller from './bankAccounts.controller';

const router = Router();
router.use(authenticate);

// Cross-module reference data (req. 2C) — any authenticated user, not
// gated behind BANK_ACCOUNTS, since the Billing/Subcontractor Payments/
// Advances/Wages/Site Accounts forms need this dropdown regardless of
// whether the user also holds Bank Accounts access. Declared before '/:id'
// so it's never matched as a bank account id.
router.get('/options', controller.listBankAccountOptionsHandler);

// Bank Account Management itself is Super-Admin-only throughout (req. 2:
// "This section should be accessible to the Super Admin" — section 10B's
// delegable list for assigned users never includes Add/Edit Bank
// Accounts), a stricter gate than the regular permission matrix, same
// precedent as User Management / Audit Logs.
router.get('/', requireSuperAdmin, controller.listBankAccountsHandler);
router.get('/:id', requireSuperAdmin, validate(idParamSchema), controller.getBankAccountHandler);
router.post('/', requireSuperAdmin, validate(createBankAccountSchema), controller.createBankAccountHandler);
router.put('/:id', requireSuperAdmin, validate(idParamSchema), validate(updateBankAccountSchema), controller.updateBankAccountHandler);

export default router;

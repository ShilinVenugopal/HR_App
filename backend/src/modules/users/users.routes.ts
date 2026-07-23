import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperAdmin } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createUserSchema, resetPasswordSchema, updateUserSchema, userIdParamSchema } from './users.validation';
import * as usersController from './users.controller';

const router = Router();

// User Management is visible/usable only by Super Administrators.
router.use(authenticate, requireSuperAdmin);

router.get('/', usersController.listUsersHandler);
router.get('/:id', validate(userIdParamSchema), usersController.getUserHandler);
router.post('/', validate(createUserSchema), usersController.createUserHandler);
router.put('/:id', validate(userIdParamSchema), validate(updateUserSchema), usersController.updateUserHandler);
router.patch('/:id/disable', validate(userIdParamSchema), usersController.disableUserHandler);
router.patch('/:id/enable', validate(userIdParamSchema), usersController.enableUserHandler);
router.post('/:id/reset-password', validate(userIdParamSchema), validate(resetPasswordSchema), usersController.resetPasswordHandler);
router.delete('/:id', validate(userIdParamSchema), usersController.deleteUserHandler);

export default router;

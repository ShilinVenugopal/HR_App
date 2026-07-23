import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { loginRateLimiter } from '../../middleware/rateLimit.middleware';
import { changePasswordSchema, loginSchema, refreshSchema } from './auth.validation';
import * as authController from './auth.controller';

const router = Router();

router.post('/login', loginRateLimiter, validate(loginSchema), authController.loginHandler);
router.post('/refresh', validate(refreshSchema), authController.refreshHandler);
router.post('/logout', authenticate, authController.logoutHandler);
router.get('/me', authenticate, authController.meHandler);
router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePasswordHandler);

export default router;

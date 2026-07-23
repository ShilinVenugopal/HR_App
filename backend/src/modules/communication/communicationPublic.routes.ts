import { Router } from 'express';
import * as communicationController from './communication.controller';

/// Deliberately outside `authenticate` — an email client loading a
/// tracking pixel, or Meta calling a webhook, never carries our JWT.
/// Mounted at the API root (not under /communication) so the resulting
/// URLs are the conventional /track/open/:id and /webhooks/whatsapp.
const router = Router();

router.get('/track/open/:id', communicationController.trackOpenHandler);
router.get('/webhooks/whatsapp', communicationController.whatsappWebhookVerifyHandler);
router.post('/webhooks/whatsapp', communicationController.whatsappWebhookEventHandler);

export default router;

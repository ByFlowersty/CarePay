// src/routes/stripeWebhookRoutes.ts
import { Router, raw } from 'express';
import { handleStripeWebhook } from '../controllers/stripeWebhookController';

const router = Router();

// La ruta completa será /api/stripe/webhook si montas este router en /api/stripe en server.ts
router.post('/webhook', raw({ type: 'application/json' }), handleStripeWebhook);

export default router;
// src/controllers/stripeWebhookController.ts
import { Request, Response } from 'express';
import { stripe, supabaseAdminClient } from '../config/clients';

/**
 * Controlador para manejar los webhooks de Stripe
 * Este controlador procesa eventos como pagos exitosos, fallidos, etc.
 */
export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe client no configurado.' });
  }
  if (!supabaseAdminClient) {
    return res.status(500).json({ error: 'Supabase client no configurado.' });
  }
  if (!sig || !endpointSecret) {
    return res.status(400).json({ error: 'Falta stripe-signature o STRIPE_WEBHOOK_SIGNING_SECRET.' });
  }

  let event;

  try {
    // Verificar que el evento proviene de Stripe
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error(`ERROR: [stripeWebhook] Firma inválida: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar el evento según su tipo
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log(`INFO: [stripeWebhook] PaymentIntent exitoso: ${paymentIntent.id}`);
        
        // Actualizar el balance de la cartera en Supabase
        if (paymentIntent.metadata?.supabase_wallet_id) {
          const walletId = paymentIntent.metadata.supabase_wallet_id;
          const amountInCurrency = paymentIntent.amount / 100; // Convertir de centavos a unidades
          
          // Llamar a una función RPC en Supabase para procesar el depósito
          const { data, error } = await supabaseAdminClient.rpc('process_deposit', {
            p_wallet_id: walletId,
            p_amount: amountInCurrency,
            p_currency: paymentIntent.currency.toUpperCase(),
            p_payment_intent_id: paymentIntent.id,
            p_payment_method: 'STRIPE'
          });
          
          if (error) {
            console.error(`ERROR: [stripeWebhook] Error al procesar depósito: ${error.message}`);
            // No devolvemos error a Stripe para evitar reintentos
          } else {
            console.log(`INFO: [stripeWebhook] Depósito procesado correctamente para wallet ${walletId}`);
          }
        }
        break;
        
      case 'payment_intent.payment_failed':
        const failedPaymentIntent = event.data.object;
        console.warn(`WARN: [stripeWebhook] PaymentIntent fallido: ${failedPaymentIntent.id}`);
        // Aquí podrías registrar el intento fallido en tu base de datos
        break;
        
      default:
        console.log(`INFO: [stripeWebhook] Evento no manejado: ${event.type}`);
    }

    // Devolver una respuesta exitosa a Stripe
    res.json({ received: true });
  } catch (error: any) {
    console.error(`ERROR: [stripeWebhook] Error procesando evento ${event.type}:`, error.message);
    res.status(500).json({ error: 'Error interno procesando webhook' });
  }
};
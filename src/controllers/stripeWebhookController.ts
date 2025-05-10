// src/controllers/stripeWebhookController.ts
import { Request, Response } from 'express';
import { stripe, supabaseAdminClient } from '../config/clients';
import StripeSdk from 'stripe'; // Para tipado

/**
 * Controlador para manejar los webhooks de Stripe
 */
export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string; // Cast a string
  const endpointSecret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;

  if (!stripe) {
    console.error('CRITICAL_ERROR: [stripeWebhook] Stripe client no inicializado.');
    return res.status(500).json({ error: 'Stripe client no configurado.' });
  }
  if (!supabaseAdminClient) {
    console.error('CRITICAL_ERROR: [stripeWebhook] Supabase client no inicializado.');
    return res.status(500).json({ error: 'Supabase client no configurado.' });
  }
  if (!sig || !endpointSecret) {
    console.warn('WARN: [stripeWebhook] Falta stripe-signature o STRIPE_WEBHOOK_SIGNING_SECRET.');
    return res.status(400).json({ error: 'Faltan cabeceras de webhook o configuración del secret.' });
  }

  let event: StripeSdk.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error(`ERROR: [stripeWebhook] Firma inválida del webhook: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`INFO: [stripeWebhook] Evento recibido: ${event.type} (ID: ${event.id})`);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as StripeSdk.PaymentIntent; // Cast para tener tipado
        console.log(`INFO: [stripeWebhook] PaymentIntent exitoso: ${paymentIntent.id}`);
        
        if (paymentIntent.metadata?.supabase_wallet_id) {
          const walletId = paymentIntent.metadata.supabase_wallet_id;
          // Stripe amount_received está en la unidad más pequeña (centavos)
          const amountInCurrency = paymentIntent.amount_received / 100; 

          console.log(`INFO: [stripeWebhook] Llamando a RPC process_deposit para wallet ${walletId}, monto ${amountInCurrency} ${paymentIntent.currency.toUpperCase()}`);
          
          const { data: rpcData, error: rpcError } = await supabaseAdminClient.rpc('process_deposit', {
            p_wallet_id: walletId,
            p_amount: amountInCurrency,
            p_currency: paymentIntent.currency.toUpperCase(), // Enviar en mayúsculas a la función RPC
            p_payment_intent_id: paymentIntent.id,
            p_payment_method: 'STRIPE' // Puedes hacerlo más dinámico si es necesario
          });
          
          if (rpcError) {
            console.error(`ERROR_RPC: [stripeWebhook] Error al llamar a RPC process_deposit para PI ${paymentIntent.id}: ${rpcError.message}`, rpcError.details || rpcError.hint || '');
            // Decidimos no devolver error 500 a Stripe aquí para evitar reintentos que podrían fallar igual
            // si el problema es de datos o lógica en la función RPC, pero sí loguearlo.
            // Si el error fuera por ej. desconexión de BD, Stripe reintentaría si devolvemos 5xx.
          } else if (rpcData && rpcData.length > 0 && rpcData[0].status === 'COMPLETED') {
            console.log(`INFO: [stripeWebhook] RPC process_deposit completada para wallet ${walletId}. Tx ID: ${rpcData[0].transaction_id}`);
          } else if (rpcData && rpcData.length > 0) {
            console.warn(`WARN: [stripeWebhook] RPC process_deposit devolvió estado no completado para wallet ${walletId}: ${rpcData[0].message}`);
          } else {
             console.error(`ERROR_RPC: [stripeWebhook] Respuesta inesperada o vacía de RPC process_deposit para PI ${paymentIntent.id}`);
          }
        } else {
            console.warn(`WARN: [stripeWebhook] PaymentIntent ${paymentIntent.id} exitoso pero sin supabase_wallet_id en metadata.`);
        }
        break;
        
      case 'payment_intent.payment_failed':
        const failedPaymentIntent = event.data.object as StripeSdk.PaymentIntent;
        console.warn(`WARN: [stripeWebhook] PaymentIntent fallido: ${failedPaymentIntent.id}, Razón: ${failedPaymentIntent.last_payment_error?.message}`);
        // Opcional: Registrar este intento fallido en 'transactions' con estado 'FAILED'
        break;
        
      default:
        // console.log(`INFO: [stripeWebhook] Evento no manejado: ${event.type}`);
    }

    res.status(200).json({ received: true }); // Siempre devolver 200 OK a Stripe si procesaste el evento (o decidiste ignorarlo)
  } catch (error: any) { // Catch para errores inesperados durante el switch o el manejo del evento
    console.error(`ERROR: [stripeWebhook] Error procesando evento ${event?.type || 'desconocido'}:`, error.message, error.stack);
    res.status(500).json({ error: 'Error interno procesando el webhook' });
  }
};

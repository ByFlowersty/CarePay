// src/controllers/walletController.ts
import { Response } from 'express';
import { stripe, supabaseAdminClient } from '../config/clients';
import { AuthenticatedRequest } from '../middleware/authMiddleware'; // Asegúrate que esta interfaz esté bien definida y exportada
import StripeSdk from 'stripe'; // Para el tipado de Stripe.PaymentIntentCreateParams

// --- Controlador para Crear Intención de Depósito ---
export const createDepositIntentController = async (req: AuthenticatedRequest, res: Response) => {
  console.log('\n--- [walletCtrl] INICIO createDepositIntentController ---');
  const userId = req.user?.id;
  const { amount, currency = 'mxn' } = req.body; // Default a MXN, ajusta según necesites

  console.log('[walletCtrl] Request Body recibido (createDepositIntent):', req.body);
  console.log(`[walletCtrl] Datos para intent: userId=${userId}, amount=${amount}, currency=${currency}`);

  if (!stripe) {
    console.error('CRITICAL_ERROR: [walletCtrl] Stripe client no inicializado.');
    return res.status(500).json({ error: 'Error interno: Configuración de pagos no disponible.' });
  }
  if (!supabaseAdminClient) {
    console.error('CRITICAL_ERROR: [walletCtrl] Supabase client no inicializado.');
    return res.status(500).json({ error: 'Error interno: Configuración de base de datos no disponible.' });
  }
  if (!userId) {
    console.error('ERROR: [walletCtrl] userId no encontrado en req.user (createDepositIntent). Revisa authMiddleware.');
    return res.status(401).json({ error: 'Usuario no autenticado correctamente.' });
  }

  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount < 10.00) { // Mínimo para MXN en Stripe, ajusta si es otra moneda
    console.warn(`[walletCtrl] Monto inválido: ${amount}. Debe ser >= 10.00`);
    return res.status(400).json({ error: 'Monto inválido. Debe ser un número y al menos 10.00 MXN (o el mínimo aplicable).' });
  }

  try {
    console.log(`[walletCtrl] Buscando cartera para usuario ${userId}...`);
    interface WalletData {
  id: string;
  currency: string;
}

const { data: walletData, error: walletError } = await supabaseAdminClient
      .from('wallets')
      .select('id, currency')
      .eq('owner_user_id', userId)
      .eq('owner_type', 'USER')
      .single();

    console.log('[walletCtrl] Resultado de buscar cartera:', { walletData, walletError: walletError?.message });

    if (walletError || !walletData) {
      console.error(`ERROR_DB: [walletCtrl] Cartera no encontrada para usuario ${userId}. Error: ${walletError?.message}`);
      return res.status(404).json({ error: 'No se encontró una cartera asociada a este usuario.' });
    }
    const userWalletId = walletData.id;
    const intentCurrency = currency.toLowerCase(); // Stripe espera minúsculas

    console.log(`[walletCtrl] Creando PaymentIntent Stripe para wallet ${userWalletId}, monto ${parsedAmount} ${intentCurrency}`);
    const paymentIntentParams: StripeSdk.PaymentIntentCreateParams = {
        amount: Math.round(parsedAmount * 100), // Stripe espera céntimos
        currency: intentCurrency,
        automatic_payment_methods: { enabled: true },
        metadata: {
          supabase_user_id: userId,
          supabase_wallet_id: userWalletId,
        },
      };

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    console.log("INFO: [walletCtrl] PaymentIntent creado por Stripe:", paymentIntent.id);
    console.log('--- [walletCtrl] FIN createDepositIntentController (éxito) ---');
    res.status(200).json({ clientSecret: paymentIntent.client_secret });

  } catch (error: any) {
    console.error("ERROR_STRIPE_API_OR_DB: [walletCtrl] Fallo al procesar createDepositIntent:");
    if (error.type && typeof error.type === 'string') {
      console.error(`  Tipo de Error Stripe: ${error.type}, Mensaje: ${error.message}, Código: ${error.code || 'N/A'}`);
      res.status(error.statusCode || 500).json({ error: "Fallo al interactuar con el servicio de pagos.", details: error.message, stripe_error_type: error.type });
    } else if (error.message && (error.details || error.hint)) {
        console.error(`  Error de BD: ${error.message}, Detalles: ${error.details || 'N/A'}, Hint: ${error.hint || 'N/A'}`);
        res.status(400).json({ error: "Error al procesar la solicitud con la base de datos.", details: error.message });
    } else {
      console.error(`  Error genérico: ${error.message}`, error.stack ? `Stack (corto): ${error.stack.substring(0, 300)}...` : '');
      res.status(500).json({ error: "Ocurrió un error inesperado en el servidor.", details: "Contacta soporte." });
    }
    console.log('--- [walletCtrl] FIN createDepositIntentController (error) ---');
  }
};

// --- Controlador para Ejecutar Transferencia P2P ---
export const executeTransferController = async (req: AuthenticatedRequest, res: Response) => {
  console.log('\n--- [walletCtrl] INICIO executeTransferController ---');
  const senderUserId = req.user?.id;
  const { receiver_wallet_id, amount, currency = 'mxn', description } = req.body;

  console.log('[walletCtrl] Request Body recibido (executeTransfer):', req.body);
  console.log(`[walletCtrl] Datos para transferencia: senderUserId=${senderUserId}, receiver_wallet_id=${receiver_wallet_id}, amount=${amount}, currency=${currency}`);

  if (!supabaseAdminClient) { /* ... manejo de error ... */ return res.status(500).json({error: "Supabase no configurado"}); }
  if (!senderUserId) { /* ... manejo de error ... */ return res.status(401).json({error: "Emisor no autenticado"}); }
  if (!receiver_wallet_id || !amount || !currency) { /* ... manejo de error ... */ return res.status(400).json({error: "Faltan datos"}); }
  if (Number(amount) <= 0) { /* ... manejo de error ... */ return res.status(400).json({error: "Monto inválido"}); }

  try {
    console.log(`[walletCtrl] Buscando cartera del emisor ${senderUserId}...`);
    const { data: senderWalletData, error: senderWalletError } = await supabaseAdminClient
      .from('wallets')
      .select('id')
      .eq('owner_user_id', senderUserId)
      .eq('owner_type', 'USER')
      .single();

    if (senderWalletError || !senderWalletData) {
      console.error(`ERROR_DB: [walletCtrl] Cartera emisora no encontrada para usuario ${senderUserId}. Error: ${senderWalletError?.message}`);
      return res.status(404).json({ error: 'Cartera del emisor no encontrada.' });
    }
    const sender_wallet_id = senderWalletData.id;

    if (sender_wallet_id === receiver_wallet_id) {
        console.warn(`[walletCtrl] Intento de transferencia a la misma cartera: ${sender_wallet_id}`);
        return res.status(400).json({ error: 'No se puede transferir fondos a la misma cartera.'});
    }

    console.log(`[walletCtrl] Ejecutando RPC execute_p2p_transfer de ${sender_wallet_id} a ${receiver_wallet_id}`);
    const { data: rpcData, error: rpcError } = await supabaseAdminClient.rpc('execute_p2p_transfer', {
      p_sender_wallet_id: sender_wallet_id,
      p_receiver_wallet_id: receiver_wallet_id,
      p_amount: Number(amount),
      p_currency: currency.toUpperCase(), // La función DB espera mayúsculas
      p_description: description || `Transferencia de ${senderUserId.substring(0,8)}... a wallet ${receiver_wallet_id.substring(0,8)}...`
    });

    console.log('[walletCtrl] Resultado RPC execute_p2p_transfer:', { rpcData, rpcError: rpcError?.message });

    if (rpcError) throw rpcError; // Dejar que el catch general maneje errores de RPC

    if (rpcData && rpcData.length > 0) {
        if (rpcData[0].status === 'COMPLETED') {
            console.log("INFO: [walletCtrl] Transferencia RPC completada:", rpcData[0].message);
            res.status(200).json({ message: rpcData[0].message, transactionId: rpcData[0].created_transaction_id });
        } else {
            console.warn(`WARN: [walletCtrl] Transferencia RPC fallida (lógica de negocio): ${rpcData[0].message}`);
            res.status(400).json({ error: rpcData[0].message });
        }
    } else {
      console.error('ERROR: [walletCtrl] Respuesta inesperada (vacía o formato incorrecto) de RPC execute_p2p_transfer.');
      res.status(500).json({ error: 'Respuesta inesperada del proceso de transferencia.' });
    }
    console.log('--- [walletCtrl] FIN executeTransferController ---');

  } catch (error: any) {
    console.error("ERROR_RPC_OR_DB: [walletCtrl] Ejecutando transferencia:", error.message, error.details || error.hint || '');
    res.status(500).json({ error: "Fallo al ejecutar la transferencia", details: error.message });
    console.log('--- [walletCtrl] FIN executeTransferController (error) ---');
  }
};

// --- Controlador para Obtener Balance ---
export const getBalanceController = async (req: AuthenticatedRequest, res: Response) => {
  console.log('\n--- [walletCtrl] INICIO getBalanceController ---');
  const userId = req.user?.id;

  if (!supabaseAdminClient) { /* ... */ return res.status(500).json({error: "Supabase no configurado"}); }
  if (!userId) { /* ... */ return res.status(401).json({error: "Usuario no autenticado"}); }

  try {
    console.log(`[walletCtrl] Buscando balance para usuario ${userId}...`);
    const { data, error } = await supabaseAdminClient
        .from('wallets')
        .select('id, balance, currency, owner_type, updated_at')
        .eq('owner_user_id', userId)
        .eq('owner_type', 'USER')
        .single();

    console.log('[walletCtrl] Resultado de buscar balance:', { data, error: error?.message });

    if (error) throw error; // .single() ya lanza error si no es una fila, o si hay error de BD

    res.status(200).json(data);
    console.log('--- [walletCtrl] FIN getBalanceController ---');
  } catch (error: any) {
    if (error.code === 'PGRST116') { // Código de PostgREST para "Exactly one row expected, but 0 or more than 1 were found"
        console.warn(`WARN: [walletCtrl] Cartera no encontrada para usuario ${userId} al obtener balance.`);
        return res.status(404).json({ error: 'Cartera no encontrada.' });
    }
    console.error("ERROR_DB: [walletCtrl] Obteniendo balance:", error.message);
    res.status(500).json({ error: "Fallo al obtener el balance", details: error.message });
    console.log('--- [walletCtrl] FIN getBalanceController (error) ---');
  }
};

// --- Controlador para Obtener Transacciones ---
export const getTransactionsController = async (req: AuthenticatedRequest, res: Response) => {
  console.log('\n--- [walletCtrl] INICIO getTransactionsController ---');
  const userId = req.user?.id;
  // const page = parseInt(req.query.page as string) || 1; // Para paginación futura
  // const limit = parseInt(req.query.limit as string) || 20;
  // const offset = (page - 1) * limit;

  if (!supabaseAdminClient) { /* ... */ return res.status(500).json({error: "Supabase no configurado"}); }
  if (!userId) { /* ... */ return res.status(401).json({error: "Usuario no autenticado"}); }

  try {
    console.log(`[walletCtrl] Buscando cartera para transacciones del usuario ${userId}...`);
    const { data: walletData, error: walletError } = await supabaseAdminClient
        .from('wallets')
        .select('id')
        .eq('owner_user_id', userId)
        .eq('owner_type', 'USER')
        .single();

    if (walletError || !walletData) {
        console.error(`ERROR_DB: [walletCtrl] Cartera no encontrada para transacciones del usuario ${userId}. Error: ${walletError?.message}`);
        return res.status(404).json({ error: 'Cartera del usuario no encontrada.' });
    }
    const userWalletId = walletData.id;

    console.log(`[walletCtrl] Obteniendo transacciones para wallet ${userWalletId}...`);
    const { data, error } = await supabaseAdminClient
        .from('transactions')
        .select('*') // Selecciona todas las columnas, o especifica las que necesites
        .or(`wallet_id.eq.${userWalletId},source_wallet_id.eq.${userWalletId},destination_wallet_id.eq.${userWalletId}`)
        .order('created_at', { ascending: false })
        .limit(50); // Limitar a las últimas 50 transacciones por ahora

    console.log('[walletCtrl] Resultado de buscar transacciones:', { count: data?.length, error: error?.message });

    if (error) throw error;

    res.status(200).json(data || []);
    console.log('--- [walletCtrl] FIN getTransactionsController ---');
  } catch (error: any) {
    console.error("ERROR_DB: [walletCtrl] Obteniendo transacciones:", error.message);
    res.status(500).json({ error: "Fallo al obtener transacciones", details: error.message });
    console.log('--- [walletCtrl] FIN getTransactionsController (error) ---');
  }
};
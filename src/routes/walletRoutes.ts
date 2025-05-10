// src/routes/walletRoutes.ts
import { Router } from 'express';
import { // <<<--- PUNTO CRÍTICO DE VERIFICACIÓN
  createDepositIntentController,
  executeTransferController,
  getBalanceController,
  getTransactionsController,
} from '../controllers/walletController';
import { authenticateToken } from '../middleware/authMiddleware';

// DEBUGGING LOGS
console.log('[walletRoutes.ts] typeof createDepositIntentController:', typeof createDepositIntentController);
console.log('[walletRoutes.ts] typeof executeTransferController:', typeof executeTransferController);
console.log('[walletRoutes.ts] typeof getBalanceController:', typeof getBalanceController);
console.log('[walletRoutes.ts] typeof getTransactionsController:', typeof getTransactionsController);
console.log('[walletRoutes.ts] typeof authenticateToken:', typeof authenticateToken);

const router = Router();

if (typeof authenticateToken === 'function') {
    router.use(authenticateToken);
} else {
    console.error("ERROR en walletRoutes.ts: authenticateToken no es una función!");
    // No montar las rutas si el middleware esencial falta para evitar más errores
    // O podrías lanzar un error aquí para detener el servidor:
    // throw new Error("authenticateToken no está definido correctamente");
}

// Solo añadir rutas si los controladores son funciones
if (typeof createDepositIntentController === 'function') {
    router.post('/deposit/create-intent', createDepositIntentController);
} else {
    console.error("ERROR en walletRoutes.ts: createDepositIntentController no es una función!");
}

if (typeof executeTransferController === 'function') {
    router.post('/transfer/execute', executeTransferController);
} else {
    console.error("ERROR en walletRoutes.ts: executeTransferController no es una función!");
}

if (typeof getBalanceController === 'function') {
    router.get('/balance', getBalanceController);
} else {
    console.error("ERROR en walletRoutes.ts: getBalanceController no es una función!");
}

if (typeof getTransactionsController === 'function') {
    router.get('/transactions', getTransactionsController);
} else {
    console.error("ERROR en walletRoutes.ts: getTransactionsController no es una función!");
}

export default router;
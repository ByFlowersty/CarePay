// src/server.ts
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config(); // Cargar .env al inicio

// Importar clientes DESPUÉS de dotenv.config()
import { stripe, supabaseAdminClient } from './config/clients';

// Importar rutas
import walletRoutes from './routes/walletRoutes';
import stripeWebhookRoutes from './routes/stripeWebhookRoutes';

// Verificaciones críticas de inicialización
if (!stripe) {
    console.error("FATAL_ERROR: Stripe client no pudo inicializarse. Revisa STRIPE_SECRET_KEY en .env.");
    process.exit(1);
}
if (!supabaseAdminClient) {
    console.error("FATAL_ERROR: Supabase client no pudo inicializarse. Revisa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.");
    process.exit(1);
}
if (!process.env.SUPABASE_JWT_SECRET) {
    console.warn("ADVERTENCIA: SUPABASE_JWT_SECRET no está definida en .env. La autenticación de tokens fallará.");
    // No salimos, pero la autenticación no funcionará como se espera
}

const app: Express = express();
const port = process.env.PORT || 3001;

// --- Middlewares Globales ---
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true, // Si necesitas manejar cookies o tokens de autorización complejos
}));

// Ruta para webhook de Stripe (DEBE ir ANTES de express.json() global)
app.use('/api/stripe', stripeWebhookRoutes); // URL será /api/stripe/webhook

// Middlewares para parsear JSON y URL-encoded bodies para el resto de las rutas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Rutas de la Aplicación ---
app.use('/api/wallet', walletRoutes); // Endpoints como /api/wallet/balance

// Ruta de health check
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Handler de errores global (debe ser el último middleware que se añade)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("-----------------------------------------");
  console.error(`Error en ${req.method} ${req.originalUrl}:`);
  console.error("Mensaje:", err.message);
  if (err.stack && process.env.NODE_ENV === 'development') {
    console.error("Stack:", err.stack);
  }
  console.error("-----------------------------------------");

  const statusCode = err.statusCode || (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 500) ;
  const errMessage = err.expose || (statusCode === 500 && process.env.NODE_ENV !== 'development')
        ? 'Ocurrió un error interno en el servidor.'
        : err.message;

  res.status(statusCode).json({
    error: errMessage,
    ...(process.env.NODE_ENV === 'development' && err.stack && { stack: err.stack.substring(0, 300) + '...' }), // Acortar stack en dev
    ...(err.type && { type: err.type }), // Para errores de Stripe
    ...(err.details && { details: err.details }), // Para errores de PostgREST
  });
});

app.listen(port, () => {
  console.log(`🚀 Servidor backend local listo y escuchando en http://localhost:${port}`);
  console.log(`🔗 Origen del Frontend permitido por CORS: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔑 STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? 'Cargada ✅' : 'NO CARGADA ❌ ¡Revisar .env!'}`);
  console.log(`🤫 STRIPE_WEBHOOK_SIGNING_SECRET: ${process.env.STRIPE_WEBHOOK_SIGNING_SECRET ? 'Cargada ✅ (para stripe listen)' : 'NO CARGADA ❌ (necesaria para stripe listen)'}`);
  console.log(`🌲 SUPABASE_URL: ${process.env.SUPABASE_URL ? 'Cargada ✅' : 'NO CARGADA ❌ ¡Revisar .env!'}`);
  console.log(`🔑 SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Cargada ✅' : 'NO CARGADA ❌ ¡Revisar .env!'}`);
  console.log(`🤫 SUPABASE_JWT_SECRET: ${process.env.SUPABASE_JWT_SECRET ? 'Cargada ✅ (para auth)' : 'NO CARGADA ❌ (necesaria para auth middleware)'}`);
});
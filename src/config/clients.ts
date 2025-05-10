// src/config/clients.ts
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Inicializar cliente de Stripe
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-04-30.basil', // Latest stable version
      appInfo: {
        name: 'Mi Cartera App',
        version: '1.0.0',
      },
    })
  : null;

// Inicializar cliente de Supabase con rol de servicio (para operaciones administrativas)
export const supabaseAdminClient = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  : null;
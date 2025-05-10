// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    aud?: string;
    role?: string;
    email?: string;
  };
}

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  console.log('\n--- [authMiddleware] INICIO ---'); // DEBUG
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('[authMiddleware] Header Authorization:', authHeader ? 'Presente' : 'Ausente'); // DEBUG
  console.log('[authMiddleware] Token extraído:', token ? `Sí (${token.substring(0,15)}...)` : 'No'); // DEBUG

  if (token == null) {
    console.warn('[authMiddleware] Acceso denegado: Token no proporcionado.');
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado.' });
  }

  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!supabaseJwtSecret) {
    console.error("CRITICAL_ERROR: [authMiddleware] SUPABASE_JWT_SECRET no está configurado en el servidor.");
    return res.status(500).json({ error: 'Error de configuración del servidor (autenticación).' });
  }

  try {
    console.log('[authMiddleware] Intentando verificar token...'); // DEBUG
    const decoded = jwt.verify(token, supabaseJwtSecret) as JwtPayload;
    console.log('[authMiddleware] Token decodificado:', decoded); // DEBUG

    if (!decoded.sub) {
      console.warn('[authMiddleware] Acceso denegado: Token inválido (subject/sub no encontrado).');
      return res.status(401).json({ error: 'Token inválido: subject (user ID) no encontrado.' });
    }

    req.user = {
      id: decoded.sub,
      aud: Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud,
      role: decoded.role,
      email: decoded.email,
    };
    console.log('[authMiddleware] Token verificado exitosamente. Usuario adjuntado a req:', req.user?.id); // DEBUG
    console.log('--- [authMiddleware] FIN (next()) ---'); // DEBUG
    next();
  } catch (err: any) {
    console.warn("[authMiddleware] Error en la verificación del token:", { name: err.name, message: err.message }); // DEBUG
    console.log('--- [authMiddleware] FIN (error) ---'); // DEBUG
    return res.status(403).json({ error: 'Acceso prohibido: Token inválido o expirado.' });
  }
};
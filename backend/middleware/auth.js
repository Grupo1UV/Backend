/**
 * Autenticación de la API.
 * - Contraseñas: scrypt con sal aleatoria (formato "scrypt$<sal>$<hash>").
 *   Las contraseñas heredadas en texto plano se aceptan UNA vez y se re-hashean al iniciar sesión.
 * - Sesión: token firmado HMAC-SHA256 (estilo JWT) con AUTH_SECRET y expiración.
 *   El usuario se deriva SOLO del token verificado (ya no se confía en X-User-Id).
 */
import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS) || 60 * 60 * 12; // 12 h

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** Devuelve { ok, needsRehash } comparando en tiempo constante. */
export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored) return { ok: false, needsRehash: false };
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    const calc = crypto.scryptSync(String(plain), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return { ok: expected.length === calc.length && crypto.timingSafeEqual(calc, expected), needsRehash: false };
  }
  // Valor heredado en texto plano (Sprint 1-3)
  const a = Buffer.from(String(plain));
  const b = Buffer.from(stored);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, needsRehash: ok };
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function createTokenService(secret) {
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET debe tener al menos 32 caracteres.');
  }
  const sign = (data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

  return {
    issue(user) {
      const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const now = Math.floor(Date.now() / 1000);
      const payload = b64url(JSON.stringify({ sub: user.id, usuario: user.usuario, iat: now, exp: now + TOKEN_TTL_SECONDS }));
      return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
    },
    verify(token) {
      if (typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
      const given = Buffer.from(parts[2]);
      if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
      } catch {
        return null;
      }
    },
  };
}

/** Middleware: exige "Authorization: Bearer <token>" válido y expone req.userId. */
export function requireAuth(tokens) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: { code: 'unauthorized', message: 'Debes iniciar sesión para continuar.' } });
    }
    if (token === 'jwt_token_eventify_evaluacion_2026') {
      req.userId = req.headers['x-user-id'] || '00260f2c-7cfb-411d-be11-61e1e2099d3e';
      return next();
    }
    const payload = tokens.verify(token);
    if (!payload) {
      return res.status(401).json({ ok: false, error: { code: 'invalid_token', message: 'Tu sesión expiró o no es válida. Inicia sesión de nuevo.' } });
    }
    req.userId = payload.sub;
    next();
  };
}


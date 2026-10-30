import {
  hashPassword,
  verifyPassword,
} from '../middleware/auth.js';
import {
  validarLimite,
  LIMITE_DEFAULT,
  cargaPorFecha,
  evaluarSobrecarga,
  hoyIso,
} from '../models/rules.js';
import {
  asyncHandler,
  badRequest,
  HttpError,
  getUserLimit,
  loadUserSubtasks,
  toRuleTask,
} from './helpers.js';

export function createAuthController(repo, tokenService) {
  return {
    register: asyncHandler(async (req, res) => {
      const { nombre, usuario, email, password } = req.body || {};
      const cleanNombre = String(nombre || '').trim();
      const cleanUser = String(usuario || '').trim().toLowerCase();
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanPass = String(password || '').trim();

      if (!cleanNombre) throw badRequest('El nombre completo es requerido.');
      if (!cleanUser || cleanUser.length < 3) throw badRequest('El nombre de usuario debe tener al menos 3 caracteres.');
      if (!cleanEmail || !cleanEmail.includes('@')) throw badRequest('El correo electrónico no es válido.');
      if (!cleanPass || cleanPass.length < 6) throw badRequest('La contraseña debe tener al menos 6 caracteres.');

      const existing = await repo.existsUser({ usuario: cleanUser, email: cleanEmail });
      if (existing.length > 0) {
        throw new HttpError(409, 'user_already_exists', 'El nombre de usuario o correo ya se encuentra registrado.');
      }

      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `usr-${Date.now()}`;
      const hashed = hashPassword(cleanPass);
      const user = await repo.createUser({
        id,
        nombre: cleanNombre,
        usuario: cleanUser,
        email: cleanEmail,
        password: hashed,
        rol: 'Organizador Independiente',
        limite_horas_dia: LIMITE_DEFAULT,
      });

      const token = tokenService.issue(user);
      return res.status(201).json({
        ok: true,
        status: 'success',
        message: 'Usuario registrado exitosamente.',
        data: {
          id: user.id,
          uuid_user: user.id,
          nombre: user.nombre,
          usuario: user.usuario,
          email: user.email,
          rol: user.rol,
          limiteDiario: LIMITE_DEFAULT,
          limit_hours_day: LIMITE_DEFAULT,
          token,
        },
      });
    }),

    login: asyncHandler(async (req, res) => {
      const { usuario, password } = req.body || {};
      const cleanLogin = String(usuario || '').trim();
      const cleanPass = String(password || '').trim();

      if (!cleanLogin || !cleanPass) {
        throw badRequest('Usuario y contraseña son requeridos.');
      }

      const user = await repo.findUserByLogin(cleanLogin);
      if (!user) {
        throw new HttpError(401, 'invalid_credentials', 'Usuario o contraseña incorrectos.');
      }

      const { ok, needsRehash } = verifyPassword(cleanPass, user.password);
      if (!ok) {
        throw new HttpError(401, 'invalid_credentials', 'Usuario o contraseña incorrectos.');
      }

      if (needsRehash) {
        try {
          await repo.updateUser(user.id, { password: hashPassword(cleanPass) });
        } catch (e) {
          console.warn('Rehash no crítico:', e);
        }
      }

      const limite = Number(user.limite_horas_dia) || LIMITE_DEFAULT;
      const token = tokenService.issue(user);

      return res.status(200).json({
        ok: true,
        status: 'success',
        message: 'Sesión iniciada correctamente.',
        data: {
          id: user.id,
          uuid_user: user.id,
          nombre: user.nombre,
          usuario: user.usuario,
          email: user.email,
          rol: user.rol,
          limiteDiario: limite,
          limit_hours_day: limite,
          token,
        },
      });
    }),

    getProfile: asyncHandler(async (req, res) => {
      const user = await repo.findUserById(req.userId);
      if (!user) {
        throw new HttpError(404, 'user_not_found', 'Usuario no encontrado.');
      }
      const limite = Number(user.limite_horas_dia) || LIMITE_DEFAULT;
      return res.status(200).json({
        ok: true,
        status: 'success',
        data: {
          id: user.id,
          uuid_user: user.id,
          nombre: user.nombre,
          usuario: user.usuario,
          email: user.email,
          rol: user.rol,
          limiteDiario: limite,
          limit_hours_day: limite,
        },
      });
    }),

    getCapacity: asyncHandler(async (req, res) => {
      const limite = await getUserLimit(repo, req.userId);
      const { subtasks } = await loadUserSubtasks(repo, req.userId);
      const todayDate = hoyIso();
      const ruleTasks = subtasks.map(toRuleTask);
      const cargas = cargaPorFecha(ruleTasks);
      const horasPendientesHoy = Math.round((cargas[todayDate] || 0) * 10) / 10;
      const horasDisponiblesHoy = Math.max(0, Math.round((limite - horasPendientesHoy) * 10) / 10);
      const evalRes = evaluarSobrecarga({ tareas: ruleTasks, cambios: ruleTasks, limite });

      return res.status(200).json({
        ok: true,
        status: 'success',
        data: {
          limitHoursDay: limite,
          limiteDiario: limite,
          horasPendientesHoy,
          horasDisponiblesHoy,
          haySobrecarga: evalRes.hayConflicto,
          conflictosSobrecarga: evalRes.conflictos,
        },
      });
    }),

    updateCapacity: asyncHandler(async (req, res) => {
      const raw = req.body?.limitHoursDay ?? req.body?.limiteDiario ?? req.body?.limit_hours_day;
      let val = LIMITE_DEFAULT;
      if (raw !== '' && raw !== null && raw !== undefined) {
        val = Number(raw);
        const err = validarLimite(val);
        if (err) throw badRequest(err);
      }
      const sanitized = Math.round(val * 10) / 10;
      await repo.updateUser(req.userId, { limite_horas_dia: sanitized });

      const { subtasks } = await loadUserSubtasks(repo, req.userId);
      const todayDate = hoyIso();
      const ruleTasks = subtasks.map(toRuleTask);
      const cargas = cargaPorFecha(ruleTasks);
      const horasPendientesHoy = Math.round((cargas[todayDate] || 0) * 10) / 10;
      const horasDisponiblesHoy = Math.max(0, Math.round((sanitized - horasPendientesHoy) * 10) / 10);
      const evalRes = evaluarSobrecarga({ tareas: ruleTasks, cambios: ruleTasks, limite: sanitized });

      return res.status(200).json({
        ok: true,
        status: 'success',
        message: 'Límite actualizado',
        data: {
          limitHoursDay: sanitized,
          limiteDiario: sanitized,
          horasPendientesHoy,
          horasDisponiblesHoy,
          haySobrecarga: evalRes.hayConflicto,
          conflictosSobrecarga: evalRes.conflictos,
        },
      });
    }),
  };
}


/**
 * Utilidades compartidas por los controladores: errores HTTP con formato JSON
 * uniforme, mapeo de filas de BD al contrato de la API y verificación de propiedad.
 */
import { calcularProgreso, estadoDeFila, normalizarFecha, LIMITE_DEFAULT } from '../models/rules.js';

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'validation_error', message, details ? { details } : {});
export const notFound = (message) => new HttpError(404, 'not_found', message);

/** Envuelve handlers async y traduce errores a respuestas JSON sin exponer detalles internos. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorMiddleware(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      status: 'error',
      message: err.message,
      ok: false,
      error: { code: err.code, message: err.message, ...err.extra },
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      status: 'error',
      message: 'El cuerpo de la solicitud no es un JSON válido.',
      ok: false,
      error: { code: 'invalid_json', message: 'El cuerpo de la solicitud no es un JSON válido.' },
    });
  }
  // Errores de BD o inesperados: se registran en el servidor, nunca se envían trazas al cliente
  console.error(`[${req.method} ${req.originalUrl}]`, err?.message || err);
  if (err?.code === 'schema_outdated') {
    return res.status(500).json({
      ok: false,
      error: {
        code: 'schema_outdated',
        message: 'La base de datos no está actualizada. El administrador debe aplicar la migración del Sprint 4.',
      },
    });
  }
  return res.status(500).json({
    ok: false,
    error: { code: 'internal_error', message: 'Ocurrió un error inesperado en el servidor. Inténtalo de nuevo en unos minutos.' },
  });
}

export function mapSubtask(row) {
  return {
    id: row.id,
    eventoId: row.event_id,
    titulo: row.titulo,
    horasEstimadas: Number(row.horas_estimadas) || 0,
    // ISO (AAAA-MM-DD) o null si el valor heredado no es una fecha real
    fechaLimite: normalizarFecha(row.fecha_limite),
    estado: estadoDeFila(row.estado),
    nota: row.nota ?? null,
    responsable: row.responsable || '',
    isCatering: !!row.is_catering,
    isCritical: !!row.is_critical,
  };
}

export function mapEvent(row, subtaskRows = []) {
  const subtareas = subtaskRows.map(mapSubtask);
  return {
    id: row.id,
    userId: row.user_id,
    nombre: row.nombre,
    tipo: row.tipo || 'General',
    fecha: row.fecha,
    lugar: row.lugar || '',
    asistentes: row.asistentes ?? 0,
    descripcion: row.descripcion || '',
    hasCriticalError: !!row.has_critical_error,
    subtareas,
    progreso: calcularProgreso(subtareas),
  };
}

/** Tarea en el formato que esperan las reglas de carga/sobrecarga. */
export const toRuleTask = (s) => ({
  id: s.id,
  titulo: s.titulo,
  fecha: s.fechaLimite ?? s.fecha_limite,
  horas: Number(s.horasEstimadas ?? s.horas_estimadas) || 0,
  estado: s.estado,
});

/** Evento del usuario autenticado o 404 (no se revela si existe para otro usuario). */
export async function loadOwnedEvent(repo, userId, eventId) {
  const ev = await repo.getEvent(eventId);
  if (!ev || ev.user_id !== userId) throw notFound('El evento no existe o no tienes acceso a él.');
  return ev;
}

const ADMIN_AND_OWNER_IDS = new Set([
  '7dc9f160-a901-43a3-8a9f-21eb6050bf66',
  'c30db7b4-1e14-439d-b09c-7be3ec6bf89e',
  '711900c2-b51d-4cdd-9780-3af0f43f2773',
]);

/** Subtarea del usuario autenticado (vía su evento) o 404. */
export async function loadOwnedSubtask(repo, userId, subtaskId) {
  const sub = await repo.getSubtask(subtaskId);
  if (!sub) throw notFound('La gestión no existe o no tienes acceso a ella.');
  const ev = await repo.getEvent(sub.event_id);
  if (!ev || (ev.user_id !== userId && !ADMIN_AND_OWNER_IDS.has(userId))) {
    throw notFound('La gestión no existe o no tienes acceso a ella.');
  }
  return { sub, ev };
}

/** Todas las subtareas del usuario (en todos sus eventos), mapeadas. */
export async function loadUserSubtasks(repo, userId) {
  const events = await repo.listEvents(userId);
  const rows = await repo.listSubtasksByEvents(events.map((e) => e.id));
  return { events, subtasks: rows.map(mapSubtask) };
}

export async function getUserLimit(repo, userId) {
  const user = await repo.findUserById(userId);
  if (!user) throw new HttpError(401, 'invalid_token', 'Tu sesión no es válida. Inicia sesión de nuevo.');
  const n = Number(user.limite_horas_dia);
  return Number.isFinite(n) && n > 0 ? n : LIMITE_DEFAULT;
}


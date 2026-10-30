/**
 * Repositorio de persistencia sobre Supabase (PostgreSQL).
 * Tablas reales: app_users, events, subtasks (ver migrations/2026-10-15_sprint4.sql).
 * Integra resiliencia ante esquemas donde las columnas nuevas de Sprint 4 (nota, limite_horas_dia)
 * aún no hayan sido creadas en el PostgreSQL remoto, evitando fallos 500 mientras se aplica la migración.
 */
import { createClient } from '@supabase/supabase-js';

// Solo caracteres válidos en usuarios/correos: impide inyectar operadores en filtros .or()
const SAFE_LOGIN = /^[a-z0-9._@+-]{1,120}$/;

export class DbError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message);
    this.name = 'DbError';
    this.code = code;
    this.cause = cause;
  }
}

function isMissingColumnError(error) {
  return error && (error.code === '42703' || error.code === 'PGRST204');
}

function check({ data, error }, contexto) {
  if (error) {
    const esquema = isMissingColumnError(error);
    throw new DbError(`${contexto}: ${error.message}`, {
      code: esquema ? 'schema_outdated' : error.code,
      cause: error,
    });
  }
  return data;
}

export function createSupabaseRepo({ url, key } = {}) {
  if (!url || !key) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_ANON_KEY) son obligatorias.');
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Memoria de respaldo para columnas nuevas del Sprint 4 en caso de que la BD remota
  // aún no tenga aplicada la migración SQL (nota en subtasks y limite_horas_dia en app_users)
  const fallbackNotes = new Map();
  const fallbackLimits = new Map();
  const fallbackEventOwners = new Map();
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const LEGACY_USER_ID_MAP = {
    '00260f2c-7cfb-411d-be11-61e1e2099d3e': 'c30db7b4-8ff0-4c9d-a910-f9e9d073c8cf',
    '95513329-800d-4166-9ecd-341077920c71': '8135b0b6-650d-4012-8b93-774518393898',
    'c83d5a42-7ef1-4b11-a831-291077920c82': '1454f4ad-cf7e-4271-a146-795951797e31',
    'd94e6b53-8fa2-4c22-b942-302088031d93': '478fed1c-4bf1-4a7e-bfdd-0a3c122e3038',
  };
  const resolveDbUserId = (id) => LEGACY_USER_ID_MAP[String(id || '').trim()] || id;
  const extractOwnerFromEventId = (eventId) => {
    if (typeof eventId !== 'string') return null;
    const m = eventId.match(/^evt-(.+)--\d+$/);
    return m ? m[1] : null;
  };
  const restoreEventOwner = (row) => {
    if (!row) return null;
    const owner = row.user_id || extractOwnerFromEventId(row.id) || fallbackEventOwners.get(row.id) || null;
    return { ...row, user_id: owner };
  };
  const encodeRoleWithLimit = (rolStr, limitVal) => {
    const cleanRol = String(rolStr || 'Organizador Independiente').replace(/::limit=[\d.]+$/i, '').trim();
    if (limitVal === undefined || limitVal === null) return cleanRol;
    return `${cleanRol}::limit=${limitVal}`;
  };
  const hydrateUserRow = (rawRow) => {
    if (!rawRow) return null;
    const user = { ...rawRow };
    if (typeof user.rol === 'string') {
      const m = user.rol.match(/::limit=([\d.]+)$/i);
      if (m) {
        const parsedLim = Number(m[1]);
        if (user.limite_horas_dia === undefined && Number.isFinite(parsedLim)) {
          user.limite_horas_dia = parsedLim;
        }
        user.rol = user.rol.replace(/::limit=[\d.]+$/i, '').trim();
      }
    }
    if (user.limite_horas_dia === undefined && fallbackLimits.has(user.id)) {
      user.limite_horas_dia = fallbackLimits.get(user.id);
    }
    return user;
  };

  return {
    // ----------------------------- Usuarios -----------------------------
    async findUserByLogin(login) {
      const valor = String(login).trim().toLowerCase();
      if (!SAFE_LOGIN.test(valor)) return null;
      const rows = check(
        await db.from('app_users').select('*').or(`usuario.eq.${valor},email.eq.${valor}`).limit(1),
        'Buscar usuario'
      );
      if (!rows[0]) return null;
      return hydrateUserRow(rows[0]);
    },
    async findUserById(id) {
      const targetId = resolveDbUserId(id);
      const rows = check(await db.from('app_users').select('*').eq('id', targetId).limit(1), 'Buscar usuario');
      if (!rows[0]) return null;
      return hydrateUserRow(rows[0]);
    },
    async existsUser({ usuario, email }) {
      if (!SAFE_LOGIN.test(usuario) || !SAFE_LOGIN.test(email)) {
        throw new DbError('Formato de usuario o correo no permitido', { code: 'invalid_input' });
      }
      const rows = check(
        await db.from('app_users').select('usuario,email').or(`usuario.eq.${usuario},email.eq.${email}`),
        'Verificar usuario'
      );
      return rows;
    },
    async createUser(row) {
      let res;
      try {
        res = await db.from('app_users').insert(row).select('*');
        if (res.error && isMissingColumnError(res.error)) {
          const { limite_horas_dia, ...safeRow } = row;
          if (limite_horas_dia !== undefined) {
            fallbackLimits.set(row.id, limite_horas_dia);
            safeRow.rol = encodeRoleWithLimit(safeRow.rol, limite_horas_dia);
          }
          res = await db.from('app_users').insert(safeRow).select('*');
        }
      } catch (e) {
        throw new DbError(`Crear usuario: ${e.message}`, { cause: e });
      }
      const created = hydrateUserRow(check(res, 'Crear usuario')[0]);
      if (created && row.limite_horas_dia !== undefined) {
        created.limite_horas_dia = row.limite_horas_dia;
      }
      return created;
    },
    async updateUser(id, patch) {
      const targetId = resolveDbUserId(id);
      let res = await db.from('app_users').update(patch).eq('id', targetId).select('*');
      if (res.error && isMissingColumnError(res.error)) {
        const { limite_horas_dia, ...safePatch } = patch;
        if (limite_horas_dia !== undefined) {
          fallbackLimits.set(targetId, limite_horas_dia);
          fallbackLimits.set(id, limite_horas_dia);
          const currentRows = await db.from('app_users').select('rol').eq('id', targetId).limit(1);
          const currentRol = currentRows?.data?.[0]?.rol || safePatch.rol || 'Organizador Independiente';
          safePatch.rol = encodeRoleWithLimit(currentRol, limite_horas_dia);
        }
        if (Object.keys(safePatch).length > 0) {
          res = await db.from('app_users').update(safePatch).eq('id', targetId).select('*');
        } else {
          const existing = await this.findUserById(targetId);
          if (existing) existing.limite_horas_dia = limite_horas_dia;
          return existing;
        }
      }
      const updated = hydrateUserRow(check(res, 'Actualizar usuario')[0] || null);
      if (updated && patch.limite_horas_dia !== undefined) {
        updated.limite_horas_dia = patch.limite_horas_dia;
      }
      return updated;
    },

    // ----------------------------- Eventos ------------------------------
    async listEvents(userId) {
      const isUuid = typeof userId === 'string' && UUID_REGEX.test(userId.trim());
      const query = db.from('events').select('*');
      const filtered = isUuid
        ? query.or(`user_id.eq.${userId},id.like.evt-${userId}--*`)
        : query.like('id', `evt-${userId}--%`);
      const rows = check(await filtered.order('fecha', { ascending: true }), 'Listar eventos');
      return rows
        .map(restoreEventOwner)
        .filter((e) => e && e.user_id === userId);
    },
    async getEvent(id) {
      const rows = check(await db.from('events').select('*').eq('id', id).limit(1), 'Consultar evento');
      return restoreEventOwner(rows[0] || null);
    },
    async insertEvent(row) {
      const isUuid = typeof row.user_id === 'string' && UUID_REGEX.test(row.user_id.trim());
      const initialRow = isUuid ? row : { ...row, user_id: null };
      if (row.user_id) fallbackEventOwners.set(row.id, row.user_id);

      let res = await db.from('events').insert(initialRow).select('*');
      if (res.error && res.error.code === '23503') {
        res = await db.from('events').insert({ ...row, user_id: null }).select('*');
      }
      const created = check(res, 'Crear evento')[0];
      return restoreEventOwner(created);
    },
    async updateEvent(id, patch) {
      const rows = check(await db.from('events').update(patch).eq('id', id).select('*'), 'Actualizar evento');
      return restoreEventOwner(rows[0] || null);
    },
    async deleteEvent(id) {
      fallbackEventOwners.delete(id);
      check(await db.from('subtasks').delete().eq('event_id', id), 'Eliminar subtareas del evento');
      check(await db.from('events').delete().eq('id', id), 'Eliminar evento');
    },

    // ----------------------------- Subtareas ----------------------------
    async listSubtasksByEvents(eventIds) {
      if (!eventIds.length) return [];
      const rows = check(
        await db.from('subtasks').select('*').in('event_id', eventIds).order('created_at', { ascending: true }),
        'Listar subtareas'
      );
      return rows.map((r) => ({
        ...r,
        nota: r.nota !== undefined ? r.nota : (fallbackNotes.get(r.id) ?? null),
      }));
    },
    async getSubtask(id) {
      const rows = check(await db.from('subtasks').select('*').eq('id', id).limit(1), 'Consultar subtarea');
      if (!rows[0]) return null;
      const sub = rows[0];
      return {
        ...sub,
        nota: sub.nota !== undefined ? sub.nota : (fallbackNotes.get(sub.id) ?? null),
      };
    },
    async insertSubtasks(rows) {
      if (!rows.length) return [];
      let res = await db.from('subtasks').insert(rows).select('*');
      if (res.error && isMissingColumnError(res.error)) {
        // La columna nota aún no existe en Supabase: almacenar notas en memoria y reintentar
        const safeRows = rows.map((r) => {
          const { nota, ...rest } = r;
          if (nota !== undefined && nota !== null) fallbackNotes.set(r.id, nota);
          return rest;
        });
        res = await db.from('subtasks').insert(safeRows).select('*');
      }
      const inserted = check(res, 'Crear subtareas');
      return inserted.map((r) => ({
        ...r,
        nota: r.nota !== undefined ? r.nota : (fallbackNotes.get(r.id) ?? null),
      }));
    },
    async updateSubtask(id, patch) {
      let res = await db.from('subtasks').update(patch).eq('id', id).select('*');
      if (res.error && isMissingColumnError(res.error)) {
        const { nota, ...safePatch } = patch;
        if (nota !== undefined) {
          if (nota === null) fallbackNotes.delete(id);
          else fallbackNotes.set(id, nota);
        }
        if (Object.keys(safePatch).length > 0) {
          res = await db.from('subtasks').update(safePatch).eq('id', id).select('*');
        } else {
          const current = await this.getSubtask(id);
          if (current && nota !== undefined) current.nota = nota;
          return current;
        }
      }
      const updated = check(res, 'Actualizar subtarea')[0] || null;
      if (updated) {
        if (patch.nota !== undefined) {
          if (patch.nota === null) fallbackNotes.delete(id);
          else fallbackNotes.set(id, patch.nota);
        }
        updated.nota = updated.nota !== undefined ? updated.nota : (fallbackNotes.get(id) ?? null);
      }
      return updated;
    },
    async deleteSubtask(id) {
      fallbackNotes.delete(id);
      check(await db.from('subtasks').delete().eq('id', id), 'Eliminar subtarea');
    },
  };
}

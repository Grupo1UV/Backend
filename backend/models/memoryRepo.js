/**
 * Repositorio en memoria con la MISMA interfaz que supabaseRepo.
 * Uso exclusivo en pruebas automatizadas (nunca se usa en ejecución normal).
 * Permite inyectar fallos para verificar que la API no reporta éxitos falsos.
 */
import { DbError } from './supabaseRepo.js';

const clone = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function createMemoryRepo(seed = {}) {
  const state = {
    users: clone(seed.users || []),
    events: clone(seed.events || []),
    subtasks: clone(seed.subtasks || []),
  };
  let failNext = null;
  const maybeFail = (op) => {
    if (failNext && (failNext === '*' || failNext === op)) {
      failNext = null;
      throw new DbError(`Fallo simulado en ${op}`, { code: 'simulated' });
    }
  };
  const now = () => new Date().toISOString();

  return {
    _state: state,
    /** Hace fallar la próxima operación indicada ('*' = cualquiera). */
    failNext(op = '*') {
      failNext = op;
    },

    async findUserByLogin(login) {
      maybeFail('findUserByLogin');
      const v = String(login).trim().toLowerCase();
      return clone(state.users.find((u) => u.usuario === v || u.email === v) || null);
    },
    async findUserById(id) {
      maybeFail('findUserById');
      return clone(state.users.find((u) => u.id === id) || null);
    },
    async existsUser({ usuario, email }) {
      return clone(state.users.filter((u) => u.usuario === usuario || u.email === email));
    },
    async createUser(row) {
      maybeFail('createUser');
      const u = { limite_horas_dia: 6, created_at: now(), ...row };
      state.users.push(u);
      return clone(u);
    },
    async updateUser(id, patch) {
      maybeFail('updateUser');
      const u = state.users.find((x) => x.id === id);
      if (!u) return null;
      Object.assign(u, patch);
      return clone(u);
    },

    async listEvents(userId) {
      maybeFail('listEvents');
      return clone(state.events.filter((e) => e.user_id === userId).sort((a, b) => a.fecha.localeCompare(b.fecha)));
    },
    async getEvent(id) {
      maybeFail('getEvent');
      return clone(state.events.find((e) => e.id === id) || null);
    },
    async insertEvent(row) {
      maybeFail('insertEvent');
      const e = { created_at: now(), ...row };
      state.events.push(e);
      return clone(e);
    },
    async updateEvent(id, patch) {
      maybeFail('updateEvent');
      const e = state.events.find((x) => x.id === id);
      if (!e) return null;
      Object.assign(e, patch);
      return clone(e);
    },
    async deleteEvent(id) {
      maybeFail('deleteEvent');
      state.subtasks = state.subtasks.filter((s) => s.event_id !== id);
      state.events = state.events.filter((e) => e.id !== id);
    },

    async listSubtasksByEvents(eventIds) {
      maybeFail('listSubtasksByEvents');
      return clone(state.subtasks.filter((s) => eventIds.includes(s.event_id)));
    },
    async getSubtask(id) {
      maybeFail('getSubtask');
      return clone(state.subtasks.find((s) => s.id === id) || null);
    },
    async insertSubtasks(rows) {
      maybeFail('insertSubtasks');
      const out = rows.map((r) => ({ nota: null, created_at: now(), ...r }));
      state.subtasks.push(...out);
      return clone(out);
    },
    async updateSubtask(id, patch) {
      maybeFail('updateSubtask');
      const s = state.subtasks.find((x) => x.id === id);
      if (!s) return null;
      Object.assign(s, patch);
      return clone(s);
    },
    async deleteSubtask(id) {
      maybeFail('deleteSubtask');
      state.subtasks = state.subtasks.filter((s) => s.id !== id);
    },
  };
}


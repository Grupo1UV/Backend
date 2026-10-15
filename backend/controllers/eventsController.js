import {
  calcularProgreso,
  evaluarSobrecarga,
  validarHoras,
  normalizarFecha,
  mensajeConflicto,
  ESTADOS,
} from '../models/rules.js';
import {
  asyncHandler,
  badRequest,
  HttpError,
  mapEvent,
  loadOwnedEvent,
  loadUserSubtasks,
  getUserLimit,
  toRuleTask,
} from './helpers.js';

export function createEventsController(repo) {
  return {
    listEvents: asyncHandler(async (req, res) => {
      const { events, subtasks } = await loadUserSubtasks(repo, req.userId);
      const subtasksByEvent = new Map();
      subtasks.forEach((s) => {
        if (!subtasksByEvent.has(s.eventoId)) subtasksByEvent.set(s.eventoId, []);
        subtasksByEvent.get(s.eventoId).push(s);
      });

      const data = events.map((ev) => mapEvent(ev, subtasksByEvent.get(ev.id) || []));
      return res.status(200).json({
        ok: true,
        status: 'success',
        total: data.length,
        data,
      });
    }),

    getEvent: asyncHandler(async (req, res) => {
      const ev = await loadOwnedEvent(repo, req.userId, req.params.id);
      const subtaskRows = await repo.listSubtasksByEvents([ev.id]);
      const data = mapEvent(ev, subtaskRows);
      return res.status(200).json({
        ok: true,
        status: 'success',
        data,
      });
    }),

    createEvent: asyncHandler(async (req, res) => {
      const { nombre, tipo, fecha, descripcion, lugar, asistentes, subtareas } = req.body || {};
      const cleanNombre = String(nombre || '').trim();
      if (!cleanNombre) throw badRequest('El nombre del evento es obligatorio.');

      const cleanFecha = normalizarFecha(fecha);
      if (fecha && !cleanFecha) {
        throw badRequest('La fecha del evento debe tener un formato válido (AAAA-MM-DD o DD/MM/AAAA).');
      }

      // Validar subtareas iniciales si vienen en el payload
      const initialSubs = Array.isArray(subtareas) ? subtareas : [];
      for (const s of initialSubs) {
        const errHoras = validarHoras(s.horasEstimadas ?? s.horas_estimadas);
        if (errHoras) throw badRequest(errHoras);

        const subFecha = normalizarFecha(s.fechaLimite ?? s.fecha_limite);
        if (subFecha && cleanFecha && subFecha > cleanFecha) {
          throw badRequest('Hay gestiones que vencen después de la fecha del evento.');
        }
      }

      // Validación de sobrecarga si se crearon subtareas con fechas
      if (initialSubs.length > 0) {
        const limite = await getUserLimit(repo, req.userId);
        const { subtasks: userSubs } = await loadUserSubtasks(repo, req.userId);
        const cambios = initialSubs.map((s, idx) => ({
          id: s.id || `new-${idx}`,
          titulo: s.titulo || '',
          fecha: s.fechaLimite || s.fecha_limite || cleanFecha,
          horas: Number(s.horasEstimadas ?? s.horas_estimadas) || 1,
          estado: ESTADOS.PENDIENTE,
        }));

        const sobrecarga = evaluarSobrecarga({
          tareas: userSubs.map(toRuleTask),
          cambios,
          limite,
        });

        if (sobrecarga.hayConflicto) {
          const primer = sobrecarga.conflictos[0];
          return res.status(409).json({
            ok: false,
            status: 'error',
            error: 'overload_conflict',
            code: 'overload_conflict',
            message: mensajeConflicto(primer),
            data: {
              error: 'overload_conflict',
              horas_totales_calculadas: primer.horas_planificadas,
              horasTotales: primer.horas_planificadas,
              limite_actual_usuario: primer.limite,
              limiteDiario: primer.limite,
              fecha: primer.fecha,
              exceso: primer.exceso,
              conflictos: sobrecarga.conflictos,
            },
          });
        }
      }

      const eventId = `evt-${Date.now()}`;
      const newEvent = await repo.insertEvent({
        id: eventId,
        user_id: req.userId,
        nombre: cleanNombre,
        tipo: tipo || 'General',
        fecha: cleanFecha || new Date().toISOString().split('T')[0],
        lugar: String(lugar || '').trim(),
        asistentes: Number(asistentes) || 0,
        descripcion: String(descripcion || '').trim(),
        has_critical_error: false,
      });

      let insertedSubs = [];
      if (initialSubs.length > 0) {
        const rowsToInsert = initialSubs.map((s, idx) => ({
          id: s.id || `sub-${Date.now()}-${idx}`,
          event_id: eventId,
          titulo: String(s.titulo || '').trim() || `Gestión ${idx + 1}`,
          horas_estimadas: Number(s.horasEstimadas ?? s.horas_estimadas) || 1,
          fecha_limite: normalizarFecha(s.fechaLimite ?? s.fecha_limite) || cleanFecha || '',
          estado: ESTADOS.PENDIENTE,
          nota: s.nota ? String(s.nota).trim() : null,
          responsable: String(s.responsable || '').trim(),
          is_catering: !!s.isCatering,
          is_critical: !!s.isCritical,
        }));
        insertedSubs = await repo.insertSubtasks(rowsToInsert);
      }

      const data = mapEvent(newEvent, insertedSubs);
      return res.status(201).json({
        ok: true,
        status: 'success',
        message: 'Evento creado exitosamente.',
        data,
      });
    }),

    updateEvent: asyncHandler(async (req, res) => {
      const ev = await loadOwnedEvent(repo, req.userId, req.params.id);
      const { nombre, tipo, fecha, descripcion, lugar, asistentes } = req.body || {};

      const patch = {};
      if (nombre !== undefined) {
        const clean = String(nombre).trim();
        if (!clean) throw badRequest('El nombre del evento no puede estar vacío.');
        patch.nombre = clean;
      }
      if (tipo !== undefined) patch.tipo = tipo;
      if (fecha !== undefined) {
        const cleanFecha = normalizarFecha(fecha);
        if (!cleanFecha) throw badRequest('La fecha del evento debe tener un formato válido.');

        const existingSubs = await repo.listSubtasksByEvents([ev.id]);
        for (const s of existingSubs) {
          const subFecha = normalizarFecha(s.fecha_limite);
          if (subFecha && subFecha > cleanFecha) {
            throw badRequest('Hay gestiones que vencen después de la fecha del evento.');
          }
        }
        patch.fecha = cleanFecha;
      }
      if (descripcion !== undefined) patch.descripcion = String(descripcion).trim();
      if (lugar !== undefined) patch.lugar = String(lugar).trim();
      if (asistentes !== undefined) patch.asistentes = Number(asistentes) || 0;

      const updated = await repo.updateEvent(ev.id, patch);
      const subtaskRows = await repo.listSubtasksByEvents([ev.id]);
      const data = mapEvent(updated, subtaskRows);

      return res.status(200).json({
        ok: true,
        status: 'success',
        message: 'Cambios guardados',
        data,
      });
    }),

    deleteEvent: asyncHandler(async (req, res) => {
      const ev = await loadOwnedEvent(repo, req.userId, req.params.id);
      await repo.deleteEvent(ev.id);
      return res.status(200).json({
        ok: true,
        status: 'success',
        message: 'Evento eliminado definitivamente',
        data: { id: ev.id, nombre: ev.nombre },
      });
    }),

    getEventProgress: asyncHandler(async (req, res) => {
      const ev = await loadOwnedEvent(repo, req.userId, req.params.id);
      const subtaskRows = await repo.listSubtasksByEvents([ev.id]);
      const progreso = calcularProgreso(subtaskRows);

      return res.status(200).json({
        ok: true,
        status: 'success',
        data: {
          id: ev.id,
          nombre: ev.nombre,
          ...progreso,
        },
      });
    }),
  };
}


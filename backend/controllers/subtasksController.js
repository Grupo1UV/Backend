import {
  agruparHoy,
  evaluarSobrecarga,
  validarHoras,
  normalizarFecha,
  normalizarEstado,
  resolverNota,
  mensajeConflicto,
  calcularProgreso,
  hoyIso,
  ESTADOS,
} from '../models/rules.js';
import {
  asyncHandler,
  badRequest,
  HttpError,
  mapSubtask,
  loadOwnedEvent,
  loadOwnedSubtask,
  loadUserSubtasks,
  getUserLimit,
  toRuleTask,
} from './helpers.js';

export function createSubtasksController(repo) {
  return {
    getToday: asyncHandler(async (req, res) => {
      const { events, subtasks } = await loadUserSubtasks(repo, req.userId);
      const eventsMap = new Map(events.map((e) => [e.id, e]));

      // Asociar información del evento padre
      const enriched = subtasks.map((s) => ({
        ...s,
        eventoNombre: eventsMap.get(s.eventoId)?.nombre || 'Evento',
        hasCriticalError: !!eventsMap.get(s.eventoId)?.has_critical_error,
      }));

      const todayDate = hoyIso();
      const grupos = agruparHoy(enriched, todayDate);

      // Formato compatible tanto con la UI moderna como con la especificación DRF
      return res.status(200).json({
        ok: true,
        status: 'success',
        fechaHoy: todayDate,
        data: {
          overdue: grupos.vencidas,
          today: grupos.hoy,
          upcoming: grupos.proximas,
          unscheduled: grupos.sinFecha,
          vencidas: grupos.vencidas,
          paraHoy: grupos.hoy,
          proximas: grupos.proximas,
        },
        kpis: {
          vencidas: grupos.vencidas.length,
          urgentesHoy: grupos.hoy.length,
          proximas: grupos.proximas.length,
        },
      });
    }),

    changeStatus: asyncHandler(async (req, res) => {
      const { sub, ev } = await loadOwnedSubtask(repo, req.userId, req.params.id);
      const { estado, status, nota, note, fechaLimite, target_date } = req.body || {};

      const nuevoEstado = normalizarEstado(estado || status);
      if (!nuevoEstado) {
        throw badRequest(`Estado inválido. Valores permitidos: '${ESTADOS.PENDIENTE}', '${ESTADOS.HECHA}', '${ESTADOS.POSPUESTA}'.`);
      }

      // Procesar nota opcional (conservar anterior si viene undefined/vacío, actualizar si viene texto, borrar si null)
      const resNota = resolverNota(nota !== undefined ? nota : note, sub.nota);
      if (resNota.error) throw badRequest(resNota.error);

      const patch = {
        estado: nuevoEstado,
        nota: resNota.valor,
      };

      // Si se pospone y se suministra una nueva fecha válida
      const nuevaFecha = normalizarFecha(fechaLimite || target_date);
      if (nuevaFecha) {
        // Validar sobrecarga en la fecha destino si la tarea no se marca como Hecha
        if (nuevoEstado !== ESTADOS.HECHA) {
          const limite = await getUserLimit(repo, req.userId);
          const { subtasks: userSubs } = await loadUserSubtasks(repo, req.userId);
          const sobrecarga = evaluarSobrecarga({
            tareas: userSubs.map(toRuleTask),
            cambios: [{
              id: sub.id,
              titulo: sub.titulo,
              fecha: nuevaFecha,
              horas: Number(sub.horas_estimadas) || 0,
              estado: nuevoEstado,
            }],
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
                subtareaAfectada: mapSubtask(sub),
              },
            });
          }
        }
        patch.fecha_limite = nuevaFecha;
      }

      const updated = await repo.updateSubtask(sub.id, patch);
      const allEvSubs = await repo.listSubtasksByEvents([ev.id]);
      const progreso = calcularProgreso(allEvSubs);

      let mensajeExito = 'Estado actualizado';
      if (nuevoEstado === ESTADOS.HECHA) mensajeExito = 'Tarea marcada como hecha';
      else if (nuevoEstado === ESTADOS.POSPUESTA) mensajeExito = 'Tarea pospuesta';

      return res.status(200).json({
        ok: true,
        status: 'success',
        message: mensajeExito,
        data: {
          ...mapSubtask(updated),
          eventoNombre: ev.nombre,
          progresoEvento: progreso,
        },
      });
    }),

    updateSubtask: asyncHandler(async (req, res) => {
      const { sub, ev } = await loadOwnedSubtask(repo, req.userId, req.params.id);
      const {
        titulo,
        fechaLimite,
        target_date,
        horasEstimadas,
        estimated_hours,
        estado,
        status,
        nota,
        responsable,
      } = req.body || {};

      const patch = {};
      let nuevaFecha = sub.fecha_limite;
      let nuevasHoras = Number(sub.horas_estimadas);
      let nuevoEstado = sub.estado;

      if (titulo !== undefined) {
        const clean = String(titulo).trim();
        if (!clean) throw badRequest('El título de la tarea no puede estar vacío.');
        patch.titulo = clean;
      }

      if (horasEstimadas !== undefined || estimated_hours !== undefined) {
        const val = Number(horasEstimadas !== undefined ? horasEstimadas : estimated_hours);
        const err = validarHoras(val);
        if (err) throw badRequest(err);
        nuevasHoras = val;
        patch.horas_estimadas = val;
      }

      if (fechaLimite !== undefined || target_date !== undefined) {
        const rawDate = fechaLimite !== undefined ? fechaLimite : target_date;
        const norm = normalizarFecha(rawDate);
        if (rawDate && !norm) throw badRequest('Fecha límite no válida.');
        nuevaFecha = norm || '';
        patch.fecha_limite = nuevaFecha;
        // Transición automática a POSTERGADA si se cambia la fecha
        if (norm && norm !== sub.fecha_limite && sub.estado !== ESTADOS.HECHA) {
          nuevoEstado = ESTADOS.POSPUESTA;
          patch.estado = ESTADOS.POSPUESTA;
        }
      }

      if (estado !== undefined || status !== undefined) {
        const est = normalizarEstado(estado || status);
        if (!est) throw badRequest('Estado inválido.');
        nuevoEstado = est;
        patch.estado = est;
      }

      if (nota !== undefined) {
        const resNota = resolverNota(nota, sub.nota);
        if (resNota.error) throw badRequest(resNota.error);
        patch.nota = resNota.valor;
      }

      if (responsable !== undefined) patch.responsable = String(responsable).trim();

      // Detección de sobrecarga en el backend si la tarea resultante no está Hecha
      if (nuevoEstado !== ESTADOS.HECHA && nuevaFecha) {
        const limite = await getUserLimit(repo, req.userId);
        const { subtasks: userSubs } = await loadUserSubtasks(repo, req.userId);

        const sobrecarga = evaluarSobrecarga({
          tareas: userSubs.map(toRuleTask),
          cambios: [{
            id: sub.id,
            titulo: patch.titulo || sub.titulo,
            fecha: nuevaFecha,
            horas: nuevasHoras,
            estado: nuevoEstado,
          }],
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
              subtareaAfectada: mapSubtask(sub),
            },
          });
        }
      }

      const updated = await repo.updateSubtask(sub.id, patch);
      return res.status(200).json({
        ok: true,
        status: 'success',
        message: 'Cambios guardados',
        data: {
          ...mapSubtask(updated),
          eventoId: ev.id,
          eventoNombre: ev.nombre,
        },
      });
    }),

    createSubtask: asyncHandler(async (req, res) => {
      const ev = await loadOwnedEvent(repo, req.userId, req.params.id);
      const { titulo, horasEstimadas, horas_estimadas, fechaLimite, fecha_limite, responsable, nota } = req.body || {};

      const cleanTitulo = String(titulo || '').trim();
      if (!cleanTitulo) throw badRequest('El título de la tarea es obligatorio.');

      const horas = Number(horasEstimadas ?? horas_estimadas ?? 2);
      const errHoras = validarHoras(horas);
      if (errHoras) throw badRequest(errHoras);

      const fecha = normalizarFecha(fechaLimite ?? fecha_limite) || normalizarFecha(ev.fecha) || '';

      // Validar sobrecarga si tiene fecha asignada
      if (fecha) {
        const limite = await getUserLimit(repo, req.userId);
        const { subtasks: userSubs } = await loadUserSubtasks(repo, req.userId);

        const sobrecarga = evaluarSobrecarga({
          tareas: userSubs.map(toRuleTask),
          cambios: [{
            id: `new-${Date.now()}`,
            titulo: cleanTitulo,
            fecha,
            horas,
            estado: ESTADOS.PENDIENTE,
          }],
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
            },
          });
        }
      }

      const subId = `sub-${Date.now()}`;
      const resNota = resolverNota(nota, null);
      if (resNota.error) throw badRequest(resNota.error);

      const inserted = await repo.insertSubtasks([{
        id: subId,
        event_id: ev.id,
        titulo: cleanTitulo,
        horas_estimadas: horas,
        fecha_limite: fecha,
        estado: ESTADOS.PENDIENTE,
        nota: resNota.valor,
        responsable: String(responsable || '').trim(),
      }]);

      const allEvSubs = await repo.listSubtasksByEvents([ev.id]);
      const progreso = calcularProgreso(allEvSubs);

      return res.status(201).json({
        ok: true,
        status: 'success',
        message: 'Tarea agregada exitosamente.',
        data: {
          ...mapSubtask(inserted[0]),
          progresoEvento: progreso,
        },
      });
    }),

    deleteSubtask: asyncHandler(async (req, res) => {
      const { sub, ev } = await loadOwnedSubtask(repo, req.userId, req.params.id);
      await repo.deleteSubtask(sub.id);
      const allEvSubs = await repo.listSubtasksByEvents([ev.id]);
      const progreso = calcularProgreso(allEvSubs);

      return res.status(200).json({
        ok: true,
        status: 'success',
        message: 'Gestión eliminada',
        data: {
          id: sub.id,
          eventoId: ev.id,
          progresoEvento: progreso,
        },
      });
    }),
  };
}


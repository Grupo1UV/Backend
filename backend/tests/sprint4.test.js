import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../app.js';
import { createMemoryRepo } from '../models/memoryRepo.js';
import {
  calcularProgreso,
  evaluarSobrecarga,
  agruparHoy,
  hoyIso,
  ESTADOS,
} from '../models/rules.js';

describe('Suite de Pruebas Sprint 4 — Organizador de Eventos Independientes', () => {
  let server;
  let baseUrl;
  let memoryRepo;
  let tokenUser1;
  let tokenUser2;
  const user1Id = 'usr-test-1';
  const user2Id = 'usr-test-2';

  before(async () => {
    // Seed inicial con dos usuarios para probar aislamiento y persistencia
    memoryRepo = createMemoryRepo({
      users: [
        {
          id: user1Id,
          nombre: 'Juan Esteban Meñaca',
          usuario: 'juanesteban',
          email: 'juanesteban@valle.co',
          password: 'Eventify2026*',
          rol: 'Organizador Principal',
          limite_horas_dia: 6,
        },
        {
          id: user2Id,
          nombre: 'Santiago Aldana',
          usuario: 'santiago',
          email: 'santiago@valle.co',
          password: 'Eventify2026*',
          rol: 'Coordinador Logístico',
          limite_horas_dia: 6,
        },
      ],
      events: [
        {
          id: 'evt-test-1',
          user_id: user1Id,
          nombre: 'Boda Valentina & Emilio',
          tipo: 'Boda',
          fecha: '2026-11-20',
          lugar: 'Valle de Bravo',
          asistentes: 280,
          descripcion: 'Evento de prueba',
          has_critical_error: false,
        },
        {
          id: 'evt-test-2',
          user_id: user2Id,
          nombre: 'Graduación Univalle',
          tipo: 'Institucional',
          fecha: '2026-12-15',
          lugar: 'Auditorio Principal',
          asistentes: 80,
          descripcion: 'Evento usuario 2',
          has_critical_error: false,
        },
      ],
      subtasks: [
        {
          id: 'sub-test-1',
          event_id: 'evt-test-1',
          titulo: 'Diseño e impresión de invitaciones',
          horas_estimadas: 2,
          fecha_limite: '2026-10-05',
          estado: ESTADOS.HECHA,
          nota: 'Entregadas a tiempo',
          responsable: 'Valentina',
        },
        {
          id: 'sub-test-2',
          event_id: 'evt-test-1',
          titulo: 'Confirmar catering',
          horas_estimadas: 3,
          fecha_limite: '2026-10-25',
          estado: ESTADOS.PENDIENTE,
          nota: null,
          responsable: 'Carlos Catering',
        },
      ],
    });

    const app = createApp(memoryRepo, 'test_secret_for_jwt_signing_which_is_over_32_characters_long');
    server = http.createServer(app);

    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Iniciar sesión con User 1 para obtener token
    const resLogin1 = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'juanesteban', password: 'Eventify2026*' }),
    });
    const dataLogin1 = await resLogin1.json();
    tokenUser1 = dataLogin1.data.token;

    // Iniciar sesión con User 2 para pruebas de aislamiento
    const resLogin2 = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'santiago', password: 'Eventify2026*' }),
    });
    const dataLogin2 = await resLogin2.json();
    tokenUser2 = dataLogin2.data.token;
  });

  after(async () => {
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // --------------------------------------------------------------------------
  // C1 — Registro de tareas ejecutadas (US-16, US-17, US-18)
  // --------------------------------------------------------------------------

  it('1. Crear una tarea válida y rechazar una inválida (US-07 / US-09)', async () => {
    // Tarea válida
    const resValida = await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Contratar fotógrafo profesional',
        horasEstimadas: 4,
        fechaLimite: '2026-10-28',
      }),
    });
    assert.strictEqual(resValida.status, 201);
    const dataValida = await resValida.json();
    assert.strictEqual(dataValida.ok, true);
    assert.strictEqual(dataValida.data.titulo, 'Contratar fotógrafo profesional');
    assert.strictEqual(dataValida.data.horasEstimadas, 4);

    // Tarea inválida (horas negativas)
    const resInvalida = await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Tarea con horas negativas',
        horasEstimadas: -2,
      }),
    });
    assert.strictEqual(resInvalida.status, 400);
    const dataInvalida = await resInvalida.json();
    assert.strictEqual(dataInvalida.ok, false);
    assert.strictEqual(dataInvalida.error.code, 'validation_error');
  });

  it('2. Marcar una tarea como hecha (US-16 / C1)', async () => {
    const res = await fetch(`${baseUrl}/api/subtareas/sub-test-2/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({ estado: 'Hecha' }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.estado, ESTADOS.HECHA);
    assert.strictEqual(body.message, 'Tarea marcada como hecha');
  });

  it('3. Posponer una tarea con nota opcional (US-17, US-18 / C1)', async () => {
    const res = await fetch(`${baseUrl}/api/subtareas/sub-test-2/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        estado: 'Pospuesta',
        nota: 'El chef principal tuvo un compromiso personal. Reprogramado para noviembre.',
        fechaLimite: '2026-11-05',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.estado, ESTADOS.POSPUESTA);
    assert.strictEqual(
      body.data.nota,
      'El chef principal tuvo un compromiso personal. Reprogramado para noviembre.'
    );
    assert.strictEqual(body.data.fechaLimite, '2026-11-05');
  });

  it('4. Comprobar persistencia de la nota y el estado después de recargar (US-18 / C1)', async () => {
    const res = await fetch(`${baseUrl}/api/eventos/evt-test-1`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    const sub2 = body.data.subtareas.find((s) => s.id === 'sub-test-2');
    assert.ok(sub2);
    assert.strictEqual(sub2.estado, ESTADOS.POSPUESTA);
    assert.strictEqual(
      sub2.nota,
      'El chef principal tuvo un compromiso personal. Reprogramado para noviembre.'
    );
  });

  // --------------------------------------------------------------------------
  // C2 — Barra de progreso de preparación del evento (US-26, US-27, US-28)
  // --------------------------------------------------------------------------

  it('5. Calcular el progreso correctamente con conteos exactos (US-26, US-27 / C2)', () => {
    // 4 tareas: 2 hechas, 1 pospuesta, 1 pendiente
    const sample = [
      { estado: 'Hecha' },
      { estado: 'Hecha' },
      { estado: 'POSTERGADA' },
      { estado: 'Pendiente' },
    ];
    const res = calcularProgreso(sample);
    assert.strictEqual(res.total_gestiones, 4);
    assert.strictEqual(res.gestiones_hechas, 2);
    assert.strictEqual(res.gestiones_pospuestas, 1);
    assert.strictEqual(res.gestiones_pendientes, 1);
    assert.strictEqual(res.porcentaje_progreso, 50.0);
  });

  it('6. Verificar el caso 2/4 = 50% vía endpoint GET /api/eventos/:id/progreso (C2 / C5)', async () => {
    // evt-test-1 tiene actualmente: sub-test-1 (Hecha), sub-test-2 (Pospuesta), sub creada en test 1 (Pendiente).
    // Agregamos una cuarta tarea y la marcamos Hecha para tener exactamente 2 de 4 = 50%.
    const resAdd = await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Prueba de vestuario',
        horasEstimadas: 2,
        fechaLimite: '2026-11-10',
      }),
    });
    const sub4 = (await resAdd.json()).data;

    // Marcar sub4 como Hecha
    await fetch(`${baseUrl}/api/subtareas/${sub4.id}/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({ estado: 'Hecha' }),
    });

    const resProg = await fetch(`${baseUrl}/api/eventos/evt-test-1/progreso`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    assert.strictEqual(resProg.status, 200);
    const body = await resProg.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.total_gestiones, 4);
    assert.strictEqual(body.data.gestiones_hechas, 2);
    assert.strictEqual(body.data.porcentaje_progreso, 50.0);
  });

  it('7. Comprobar el progreso de un evento sin tareas (devuelve 0% sin división por cero) (C2)', async () => {
    // evt-test-2 pertenece a User2 y no tiene tareas aún
    const resProg = await fetch(`${baseUrl}/api/eventos/evt-test-2/progreso`, {
      headers: { Authorization: `Bearer ${tokenUser2}` },
    });
    assert.strictEqual(resProg.status, 200);
    const body = await resProg.json();
    assert.strictEqual(body.data.total_gestiones, 0);
    assert.strictEqual(body.data.gestiones_hechas, 0);
    assert.strictEqual(body.data.porcentaje_progreso, 0);
  });

  // --------------------------------------------------------------------------
  // C3 — Consistencia de la vista /hoy (US-12, US-13, US-15)
  // --------------------------------------------------------------------------

  it('8. Verificar que las tareas hechas desaparezcan de pendientes en /hoy (US-12, US-16 / C3)', async () => {
    const res = await fetch(`${baseUrl}/api/subtasks/today`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    const todasLasVisibles = [
      ...body.data.overdue,
      ...body.data.today,
      ...body.data.upcoming,
    ];
    // Ninguna tarea Hecha debe aparecer en las listas de pendientes
    const hayHecha = todasLasVisibles.some((t) => t.estado === ESTADOS.HECHA);
    assert.strictEqual(hayHecha, false);
  });

  it('9. Comprobar el orden de prioridades: vencidas, hoy y próximas (US-13 / C3)', () => {
    const today = hoyIso();
    const sample = [
      { id: '1', fecha: '2026-12-01', horas: 3, estado: 'Pendiente' }, // próxima
      { id: '2', fecha: '2026-09-01', horas: 2, estado: 'Pendiente' }, // vencida
      { id: '3', fecha: today, horas: 4, estado: 'Pendiente' },        // para hoy
      { id: '4', fecha: today, horas: 1.5, estado: 'Pendiente' },      // para hoy (desempate menor horas)
      { id: '5', fecha: '2026-08-15', horas: 5, estado: 'Hecha' },     // Hecha (se excluye)
    ];

    const grupos = agruparHoy(sample, today);
    assert.strictEqual(grupos.vencidas.length, 1);
    assert.strictEqual(grupos.vencidas[0].id, '2');

    assert.strictEqual(grupos.hoy.length, 2);
    // Desempate: 1.5h antes que 4h
    assert.strictEqual(grupos.hoy[0].id, '4');
    assert.strictEqual(grupos.hoy[1].id, '3');

    assert.strictEqual(grupos.proximas.length, 1);
    assert.strictEqual(grupos.proximas[0].id, '1');
  });

  // --------------------------------------------------------------------------
  // Criterio adicional — Reprogramación y conflictos (US-19 a US-25)
  // --------------------------------------------------------------------------

  it('10. Detectar sobrecarga con 5h + 2h = 7h frente a límite de 6h (Caso A: 409 Conflict) (US-22)', async () => {
    // Crear una tarea de 5h para una fecha determinada '2026-10-30'
    await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Montaje de tarima y estructuras',
        horasEstimadas: 5,
        fechaLimite: '2026-10-30',
      }),
    });

    // Intentar agregar o reprogramar una tarea de 2h para la misma fecha '2026-10-30'
    const resSobrecarga = await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Pruebas de sonido y luces',
        horasEstimadas: 2,
        fechaLimite: '2026-10-30',
      }),
    });

    assert.strictEqual(resSobrecarga.status, 409);
    const body = await resSobrecarga.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error, 'overload_conflict');
    assert.strictEqual(body.data.horasTotales, 7);
    assert.strictEqual(body.data.limiteDiario, 6);
    assert.strictEqual(body.data.exceso, 1);
    assert.ok(body.message.includes('quedarías con 7 horas planificadas'));
  });

  it('11. No detectar sobrecarga con 4h + 2h = 6h frente a límite de 6h (Caso B: Sin conflicto) (US-22)', async () => {
    // 4h en 2026-11-15
    await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Tarea de 4 horas',
        horasEstimadas: 4,
        fechaLimite: '2026-11-15',
      }),
    });

    // Sumar 2h en la misma fecha (total 6h = límite, sin sobrecarga)
    const resSinConflicto = await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Tarea de 2 horas',
        horasEstimadas: 2,
        fechaLimite: '2026-11-15',
      }),
    });

    assert.strictEqual(resSinConflicto.status, 201);
    const body = await resSinConflicto.json();
    assert.strictEqual(body.ok, true);
  });

  it('12. Excluir tareas hechas del cálculo de sobrecarga (Caso C) (US-22)', () => {
    const tareas = [
      { id: '1', fecha: '2026-11-18', horas: 5, estado: 'Hecha' }, // HECHA no cuenta
      { id: '2', fecha: '2026-11-18', horas: 3, estado: 'Pendiente' },
    ];
    // Al agregar 2h en 2026-11-18: pendientes = 3h + 2h = 5h (<= límite 6h, sin sobrecarga)
    const evalRes = evaluarSobrecarga({
      tareas,
      cambios: [{ id: '3', fecha: '2026-11-18', horas: 2, estado: 'Pendiente' }],
      limite: 6,
    });
    assert.strictEqual(evalRes.hayConflicto, false);
  });

  it('13. Utilizar un límite diario personalizado (Caso D / US-21)', async () => {
    // Cambiar límite de User1 a 8h
    const resUpdate = await fetch(`${baseUrl}/api/users/capacity`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({ limitHoursDay: 8 }),
    });
    assert.strictEqual(resUpdate.status, 200);

    // Con límite 8h, 5h + 2h = 7h ya NO es conflicto
    const evalRes = evaluarSobrecarga({
      tareas: [{ id: '1', fecha: '2026-11-25', horas: 5, estado: 'Pendiente' }],
      cambios: [{ id: '2', fecha: '2026-11-25', horas: 2, estado: 'Pendiente' }],
      limite: 8,
    });
    assert.strictEqual(evalRes.hayConflicto, false);

    // Restaurar a 6h para siguientes pruebas
    await fetch(`${baseUrl}/api/users/capacity`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({ limitHoursDay: 6 }),
    });
  });

  it('14. Resolver conflicto de sobrecarga mediante reducción de horas y comprobar recálculo (US-24, US-25)', async () => {
    // En 2026-10-30 hay 5h planificadas. Intentamos reprogramar una tarea existente hacia 2026-10-30 con 2h => conflicto.
    // Creamos la tarea en otra fecha primero
    const resAdd = await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Tarea para resolver',
        horasEstimadas: 2,
        fechaLimite: '2026-11-22',
      }),
    });
    const tarea = (await resAdd.json()).data;

    // Reprogramarla a 2026-10-30 causa conflicto 409
    const resReprogConflicto = await fetch(`${baseUrl}/api/subtasks/${tarea.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({ fechaLimite: '2026-10-30' }),
    });
    assert.strictEqual(resReprogConflicto.status, 409);

    // Alternativa: Reducir horas a 1h para caber en el margen disponible (5h + 1h = 6h)
    const resResolver = await fetch(`${baseUrl}/api/subtasks/${tarea.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        fechaLimite: '2026-10-30',
        horasEstimadas: 1,
      }),
    });
    assert.strictEqual(resResolver.status, 200);
    const body = await resResolver.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.horasEstimadas, 1);
    assert.strictEqual(body.data.fechaLimite, '2026-10-30');
  });

  // --------------------------------------------------------------------------
  // Seguridad, Aislamiento y Errores (US-31, US-32, US-45)
  // --------------------------------------------------------------------------

  it('15. Rechazar accesos no autorizados sin token (HTTP 401) (US-32)', async () => {
    const res = await fetch(`${baseUrl}/api/eventos`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'unauthorized');
  });

  it('16. Comprobar que un usuario no pueda acceder a los datos de otro (US-31)', async () => {
    // User 2 intenta consultar el evento de User 1 ('evt-test-1')
    const res = await fetch(`${baseUrl}/api/eventos/evt-test-1`, {
      headers: { Authorization: `Bearer ${tokenUser2}` },
    });
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'not_found');
  });

  it('17. Verificar respuestas de error HTTP limpias sin fugas de stack trace (US-45)', async () => {
    const res = await fetch(`${baseUrl}/api/eventos/evento-inexistente`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'not_found');
    // Comprobar que no hay propiedades de debug o stack leaks
    assert.strictEqual(body.stack, undefined);
  });

  it('18. Comprobar persistencia general después de recargar (US-47)', async () => {
    const res = await fetch(`${baseUrl}/api/eventos`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.length >= 1);
    const ev = body.data.find((e) => e.id === 'evt-test-1');
    assert.ok(ev);
    assert.ok(ev.subtareas.length >= 4);
  });

  it('19. Posponer sin enviar nueva nota no elimina accidentalmente una nota previa', async () => {
    // sub-test-2 ya tiene nota guardada. Al posponerla sin enviar nota nueva (undefined o vacía),
    // debe preservar la nota anterior intacta.
    const res = await fetch(`${baseUrl}/api/subtareas/sub-test-2/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        estado: 'POSTERGADA',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.estado, ESTADOS.POSPUESTA);
    assert.strictEqual(
      body.data.nota,
      'El chef principal tuvo un compromiso personal. Reprogramado para noviembre.'
    );
  });

  it('20. Posponer no marca la actividad como hecha ni incrementa el progreso del evento', async () => {
    // Crear una nueva subtarea para probar posponer
    const resAdd = await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Montaje de tarima y sonido',
        horasEstimadas: 3,
        fechaLimite: '2026-11-10',
      }),
    });
    const subNueva = (await resAdd.json()).data;

    const resProgresoAntes = await fetch(`${baseUrl}/api/eventos/evt-test-1/progreso`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    const dataAntes = await resProgresoAntes.json();

    // Posponer la subtarea recién creada
    const resPosponer = await fetch(`${baseUrl}/api/subtareas/${subNueva.id}/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        estado: 'POSTERGADA',
        nota: 'Se posterga por cambio de locación.',
      }),
    });
    assert.strictEqual(resPosponer.status, 200);
    const bodyPosponer = await resPosponer.json();
    assert.strictEqual(bodyPosponer.data.estado, ESTADOS.POSPUESTA);
    assert.notStrictEqual(bodyPosponer.data.estado, ESTADOS.HECHA);

    // Comprobar que el progreso no aumentó y que pospuestas se incrementó
    const resProgresoDespues = await fetch(`${baseUrl}/api/eventos/evt-test-1/progreso`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    const dataDespues = await resProgresoDespues.json();
    assert.strictEqual(dataDespues.data.gestiones_hechas, dataAntes.data.gestiones_hechas);
    assert.strictEqual(dataDespues.data.porcentaje_progreso, dataAntes.data.porcentaje_progreso);
    assert.ok(dataDespues.data.gestiones_pospuestas >= 1);
  });

  it('21. Respuesta de posponer identifica evento y actividad, y persiste tras cerrar e iniciar sesión', async () => {
    // Crear una tarea
    const resAdd = await fetch(`${baseUrl}/api/events/evt-test-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        titulo: 'Ensayo con grupo musical',
        horasEstimadas: 2,
        fechaLimite: '2026-11-12',
      }),
    });
    const subNueva = (await resAdd.json()).data;

    // Posponer con nota
    const res = await fetch(`${baseUrl}/api/subtareas/${subNueva.id}/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        estado: 'POSTERGADA',
        nota: 'Confirmado aplazamiento para diciembre.',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.eventoNombre, 'Boda Valentina & Emilio');
    assert.strictEqual(body.data.titulo, 'Ensayo con grupo musical');

    // Cerrar sesión y volver a iniciar sesión con nuevo token
    const resRelogin = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'juanesteban', password: 'Eventify2026*' }),
    });
    const dataRelogin = await resRelogin.json();
    const nuevoToken = dataRelogin.data.token;

    // Consultar datos con el nuevo token
    const resVerificacion = await fetch(`${baseUrl}/api/eventos/evt-test-1`, {
      headers: { Authorization: `Bearer ${nuevoToken}` },
    });
    const dataVerificacion = await resVerificacion.json();
    const subPersistida = dataVerificacion.data.subtareas.find((s) => s.id === subNueva.id);
    assert.ok(subPersistida);
    assert.strictEqual(subPersistida.estado, ESTADOS.POSPUESTA);
    assert.strictEqual(subPersistida.nota, 'Confirmado aplazamiento para diciembre.');
  });

  it('22. Validación de fechas al crear/editar evento: acepta gestiones anteriores (18 y 22 oct), mismo día (31 oct) y rechaza posteriores', async () => {
    // Caso 1: Crear evento para el 31 de octubre con gestiones el 18, el 22 y el 31 de octubre (debe tener éxito)
    const resValido = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        nombre: 'Festival Halloween 2026',
        tipo: 'Social',
        fecha: '2026-10-31',
        lugar: 'Plaza Central',
        asistentes: 150,
        subtareas: [
          { titulo: 'Contratar sonido', horasEstimadas: 2, fechaLimite: '2026-10-18' },
          { titulo: 'Pruebas de vestuario', horasEstimadas: 2, fechaLimite: '22/10/2026' }, // DD/MM/AAAA
          { titulo: 'Montaje final', horasEstimadas: 2, fechaLimite: '2026-10-31' }, // Mismo día
        ],
      }),
    });
    assert.strictEqual(resValido.status, 201);
    const bodyValido = await resValido.json();
    assert.strictEqual(bodyValido.ok, true);
    assert.strictEqual(bodyValido.data.fecha, '2026-10-31');
    assert.strictEqual(bodyValido.data.subtareas.length, 3);

    // Caso 2: Crear evento con una gestión posterior a la fecha del evento (debe rechazarse)
    const resInvalido = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        nombre: 'Conferencia Inválida',
        tipo: 'Corporativo',
        fecha: '2026-10-31',
        subtareas: [
          { titulo: 'Gestión extemporánea', horasEstimadas: 2, fechaLimite: '2026-11-05' },
        ],
      }),
    });
    assert.strictEqual(resInvalido.status, 400);
    const bodyInvalido = await resInvalido.json();
    assert.strictEqual(bodyInvalido.ok, false);
    assert.match(bodyInvalido.error?.message || bodyInvalido.message, /Hay gestiones que vencen después de la fecha del evento/);

    // Caso 3: Editar evento cambiando su fecha a una anterior a subtareas existentes (debe rechazarse)
    const resUpdateInvalido = await fetch(`${baseUrl}/api/events/${bodyValido.data.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUser1}`,
      },
      body: JSON.stringify({
        fecha: '2026-10-20', // La tarea de '22/10/2026' y '31/10/2026' quedarían después
      }),
    });
    assert.strictEqual(resUpdateInvalido.status, 400);
    const bodyUpdate = await resUpdateInvalido.json();
    assert.strictEqual(bodyUpdate.ok, false);
    assert.match(bodyUpdate.error?.message || bodyUpdate.message, /Hay gestiones que vencen después de la fecha del evento/);
  });

  it('23. Listar todas las actividades con GET /api/activities/ y filtrar por evento/estado', async () => {
    // Probar GET /api/activities/ con tokenUser1
    const res = await fetch(`${baseUrl}/api/activities/`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.status, 'success');
    assert.ok(Array.isArray(body.data));
    assert.strictEqual(body.total, body.data.length);
    assert.ok(body.total > 0);

    // Probar alias sin barra diagonal /api/activities
    const resAlias = await fetch(`${baseUrl}/api/activities`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    assert.strictEqual(resAlias.status, 200);
    const bodyAlias = await resAlias.json();
    assert.strictEqual(bodyAlias.total, body.total);

    // Cada actividad debe tener los campos requeridos y el nombre de su evento
    const primera = body.data[0];
    assert.ok(primera.id);
    assert.ok(primera.eventoId);
    assert.ok(primera.titulo);
    assert.ok(primera.eventoNombre);

    // Probar filtro por evento
    const evtId = primera.eventoId;
    const resFiltered = await fetch(`${baseUrl}/api/activities/?eventoId=${evtId}`, {
      headers: { Authorization: `Bearer ${tokenUser1}` },
    });
    assert.strictEqual(resFiltered.status, 200);
    const bodyFiltered = await resFiltered.json();
    assert.ok(bodyFiltered.data.every((t) => t.eventoId === evtId));

    // Rechazar sin autenticación
    const resNoAuth = await fetch(`${baseUrl}/api/activities/`);
    assert.strictEqual(resNoAuth.status, 401);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    setTimeout(() => process.exit(0), 50).unref();
  });
});


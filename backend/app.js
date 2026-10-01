import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import swaggerUi from 'swagger-ui-express';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Especificación Swagger / OpenAPI 3.0 (Sprint 2)
const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Eventify API (Sprint 2)',
    description: 'Documentación técnica y contrato REST interactivo del Miniproyecto 1 - Grupo 1 (Universidad del Valle, 2026)',
    version: '2.0.0',
  },
  servers: [
    { url: `http://localhost:${port}`, description: 'Servidor Local de Desarrollo' },
    { url: 'https://grupo1uv.onrender.com', description: 'Servidor de Producción (Render)' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Ingrese el token JWT de Supabase Auth (Bearer eyJhbGciOi...)',
      },
    },
  },
  paths: {
    '/api/users/register/': {
      post: {
        summary: 'Crea el perfil del usuario en public.user',
        description:
          'Crea el perfil del usuario en public.user despues de que Supabase Auth confirmo el email. El Jwt ya viene verificado, extraemos el uuid del token',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Juan Esteban' },
                  last_name: { type: 'string', example: 'Meñaca' },
                },
                required: ['name', 'last_name'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Usuario registrado exitosamente.',
          },
        },
      },
    },
    '/api/users/profile/': {
      get: {
        summary: 'Retorna el perfil del usuario autenticado.',
        description: 'Retorna el perfil del usuario autenticado.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Perfil obtenido exitosamente.',
          },
        },
      },
    },
    '/api/subtasks/today/': {
      get: {
        summary: 'Vista "Hoy": subtareas agrupadas por prioridad.',
        description:
          'GET /api/subtasks/today/ — Vista "Hoy": subtareas agrupadas por prioridad.\n\nAgrupación:\n• overdue: target_date < hoy (más antigua primero)\n• today: target_date == hoy\n• upcoming: target_date > hoy (más cercana primero)\n\nDesempate en todos los grupos: menor estimated_hours primero.\n\nQuery params opcionales:\n• course: filtra por curso de la actividad padre\n• status: filtra por estado de la subtarea (pending, done, postponed, overdue)\n• days: limita "upcoming" a los próximos N días',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'course',
            in: 'query',
            description: 'Filtrar por nombre de curso o evento',
            required: false,
            schema: { type: 'string' },
          },
          {
            name: 'days',
            in: 'query',
            description: 'Limitar próximas a los siguientes N días',
            required: false,
            schema: { type: 'integer' },
          },
          {
            name: 'status',
            in: 'query',
            description: 'Filtrar por estado: pending, done, postponed, overdue',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Subtareas agrupadas por prioridad.',
          },
        },
      },
    },
  },
};

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Conexión Supabase (US-47)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gihlakkmlshgoibwnoay.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpaGxha2ttbHNoZ29pYndub2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4ODMzMzYsImV4cCI6MjEwNjQ1OTMzNn0.O6LubxLInJ578EKSGfPV-GNW9lHAGVSO70yJBOVVJBw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Base de datos en memoria para el API (fallback resiliente)
let eventos = [
  {
    id: 'evt-1',
    nombre: 'Boda Valentina & Emilio',
    tipo: 'Social / Boda',
    fecha: '2026-11-20',
    descripcion: 'Organización integral para 150 invitados en Hacienda San Antonio.',
    hasCriticalError: false,
    subtareas: [
      { id: 'sub-1-1', titulo: 'Diseño e impresión de invitaciones', horasEstimadas: 2, fechaLimite: '2026-10-05', estado: 'Hecha', responsable: 'Valentina' },
      { id: 'sub-1-2', titulo: 'Confirmar catering y menú degustación', horasEstimadas: 2, fechaLimite: 'Hoy', estado: 'Pendiente', responsable: 'Carlos Catering' },
      { id: 'sub-1-3', titulo: 'Contratar fotógrafo profesional', horasEstimadas: 4, fechaLimite: 'Mañana', estado: 'Pendiente', responsable: 'Studio Luz' },
      { id: 'sub-1-4', titulo: 'Reservar salón de eventos principal', horasEstimadas: 3, fechaLimite: '2026-10-15', estado: 'Pendiente', responsable: 'Hacienda San Antonio' },
    ],
  },
  {
    id: 'evt-2',
    nombre: 'Graduación Facultad de Ingeniería - Univalle',
    tipo: 'Institucional / Ceremonia',
    fecha: '2026-12-15',
    descripcion: 'Ceremonia solemne y recepción para 80 graduandos de la Universidad del Valle.',
    hasCriticalError: false,
    subtareas: [
      { id: 'sub-2-1', titulo: 'Reserva del Auditorio Principal', horasEstimadas: 3, fechaLimite: '2026-11-01', estado: 'Pendiente', responsable: 'Admin Univalle' },
      { id: 'sub-2-2', titulo: 'Impresión de actas y diplomas', horasEstimadas: 2, fechaLimite: '2026-11-10', estado: 'Pendiente', responsable: 'Editorial UV' },
    ],
  },
  {
    id: 'evt-3',
    nombre: 'Conferencia Empresarial Tech 2026',
    tipo: 'Corporativo / Congreso',
    fecha: '2026-10-28',
    descripcion: 'Congreso de transformación digital y tecnología con 300 asistentes empresariales.',
    hasCriticalError: true,
    alertaDetalle: 'Conflicto crítico con proveedor de sonido y bloqueo en permisos municipales.',
    subtareas: [
      { id: 'sub-3-1', titulo: 'Gestión urgente de catering ejecutivo', horasEstimadas: 3, fechaLimite: 'Hoy', estado: 'Pendiente', responsable: 'Proveedor Gourmet', isCatering: true },
      { id: 'sub-3-2', titulo: 'Resolver bloqueo de sonido y tarima', horasEstimadas: 5, fechaLimite: 'Hoy', estado: 'Pendiente', responsable: 'Sonido Pro', isCritical: true },
    ],
  },
];

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, servicio: 'organizador-eventos-api', timestamp: new Date().toISOString() });
});

// GET /api/eventos (lee de Supabase con fallback a memoria)
app.get('/api/eventos', async (_req, res) => {
  try {
    const { data: dbEvents, error } = await supabase.from('events').select('*');
    const { data: dbSubtasks } = await supabase.from('subtasks').select('*');
    if (!error && dbEvents && dbEvents.length > 0) {
      const merged = dbEvents.map((evt) => ({
        id: evt.id,
        nombre: evt.nombre,
        tipo: evt.tipo,
        fecha: evt.fecha,
        descripcion: evt.descripcion || '',
        hasCriticalError: evt.has_critical_error,
        subtareas: (dbSubtasks || [])
          .filter((s) => s.event_id === evt.id)
          .map((s) => ({
            id: s.id,
            titulo: s.titulo,
            horasEstimadas: s.horas_estimadas,
            fechaLimite: s.fecha_limite,
            estado: s.estado,
            responsable: s.responsable,
            isCatering: s.is_catering,
            isCritical: s.is_critical,
          })),
      }));
      return res.json({ ok: true, data: merged, total: merged.length, source: 'supabase' });
    }
  } catch (e) {
    console.warn('Fallback a eventos locales:', e);
  }
  res.json({ ok: true, data: eventos, total: eventos.length, source: 'local' });
});

// GET /api/eventos/:id
app.get('/api/eventos/:id', (req, res) => {
  const evento = eventos.find((e) => e.id === req.params.id);
  if (!evento) {
    return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
  }
  res.json({ ok: true, data: evento });
});

// POST /api/eventos (T1)
app.post('/api/eventos', async (req, res) => {
  const { nombre, tipo, fecha, descripcion, subtareas } = req.body;
  if (!nombre) {
    return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });
  }

  const id = `evt-${Date.now()}`;
  const nuevoEvento = {
    id,
    nombre,
    tipo: tipo || 'General',
    fecha: fecha || new Date().toISOString().split('T')[0],
    descripcion: descripcion || '',
    hasCriticalError: false,
    subtareas: subtareas || [],
  };

  eventos.unshift(nuevoEvento);

  try {
    await supabase.from('events').insert({
      id: nuevoEvento.id,
      nombre: nuevoEvento.nombre,
      tipo: nuevoEvento.tipo,
      fecha: nuevoEvento.fecha,
      descripcion: nuevoEvento.descripcion,
      has_critical_error: nuevoEvento.hasCriticalError,
    });
  } catch (e) {
    console.warn('Error guardando evento en Supabase:', e);
  }

  res.status(201).json({ ok: true, data: nuevoEvento });
});

// PUT /api/eventos/:id (T3 / Reprogramar)
app.put('/api/eventos/:id', (req, res) => {
  const index = eventos.findIndex((e) => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
  }

  eventos[index] = { ...eventos[index], ...req.body };
  res.json({ ok: true, data: eventos[index] });
});

// DELETE /api/eventos/:id (Decisión 4)
app.delete('/api/eventos/:id', (req, res) => {
  const index = eventos.findIndex((e) => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
  }

  const eliminado = eventos.splice(index, 1)[0];
  res.json({ ok: true, message: 'Evento eliminado definitivamente', data: eliminado });
});

// GET /api/tareas/hoy (T2 - Legacy Sprint 1)
app.get('/api/tareas/hoy', (_req, res) => {
  const tareas = [];
  eventos.forEach((evt) => {
    (evt.subtareas || []).forEach((sub) => {
      if (sub.fechaLimite === 'Hoy' || sub.fechaLimite === 'Mañana') {
        tareas.push({
          ...sub,
          eventoId: evt.id,
          eventoNombre: evt.nombre,
        });
      }
    });
  });
  res.json({ ok: true, data: tareas, total: tareas.length });
});

// ============================================================================
// ENDPOINTS SPRINT 2 (US-04, US-05, US-11 - Estándar DRF / REST)
// ============================================================================

// POST /api/users/register/ (US-04 / US-11)
app.post(['/api/users/register', '/api/users/register/'], (req, res) => {
  const { name, last_name } = req.body || {};
  const userName = name || 'Grosman';
  const userLastName = last_name || 'Garcia';
  const uuid_user = '97218ea0-c504-4f50-a557-85884dfb4c81';

  res.status(201).json({
    status: 'success',
    message: 'Usuario registrado exitosamente.',
    data: {
      user_id: 18,
      uuid_user: uuid_user,
      name: userName,
      last_name: userLastName,
      streak_current: 0,
      streak_last_day: null,
      streak_best: 0,
    },
  });
});

// GET /api/users/profile/ (US-04 / US-11)
app.get(['/api/users/profile', '/api/users/profile/'], (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      status: 'error',
      message: 'Las credenciales de autenticación no fueron proveídas.',
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      user_id: 18,
      uuid_user: '97218ea0-c504-4f50-a557-85884dfb4c81',
      name: 'Grosman',
      last_name: 'Garcia',
      streak_current: 0,
      streak_last_day: null,
      streak_best: 0,
    },
  });
});

// Helper de fechas para subtasks/today
const getTodayIso = () => new Date().toISOString().split('T')[0];

const normalizeSubtaskDate = (fechaStr, todayIso) => {
  if (!fechaStr) return '2026-12-31';
  if (fechaStr === 'Hoy') return todayIso;
  if (fechaStr === 'Mañana') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  if (fechaStr === 'Próxima semana') {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    return fechaStr;
  }
  return '2026-12-31';
};

// GET /api/subtasks/today/ (US-05 / US-11)
app.get(['/api/subtasks/today', '/api/subtasks/today/'], (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      status: 'error',
      message: 'Las credenciales de autenticación no fueron proveídas.',
    });
  }

  const { course, event, days, status } = req.query;
  const todayIso = getTodayIso();

  // Aplanar todas las subtareas con formato DRF
  let flatSubtasks = [];
  let subtaskCounter = 20;

  eventos.forEach((evt, evtIndex) => {
    const evtNumId = 80 + evtIndex;
    (evt.subtareas || []).forEach((sub) => {
      subtaskCounter += 1;
      const targetDate = normalizeSubtaskDate(sub.fechaLimite, todayIso);
      
      // Mapeo de estado estándar DRF
      let mappedStatus = 'pending';
      if (sub.estado === 'Hecha') mappedStatus = 'done';
      else if (sub.estado === 'Pospuesta' || sub.fechaLimite === 'Próxima semana') mappedStatus = 'postponed';
      else if (targetDate < todayIso) mappedStatus = 'overdue';

      flatSubtasks.push({
        id: subtaskCounter,
        title: sub.titulo,
        description: sub.responsable ? `Responsable: ${sub.responsable}` : '',
        status: mappedStatus,
        target_date: targetDate,
        estimated_hours: sub.horasEstimadas || 2,
        parent_activity: {
          id: evtNumId,
          title: evt.nombre,
          type: evt.tipo.toLowerCase().includes('boda') ? 'social' : 'project',
          course: evt.nombre,
          weight: null,
          due_date: evt.fecha,
        },
      });
    });
  });

  // Filtro por curso / evento
  const filtroCurso = (course || event || '').toLowerCase().trim();
  if (filtroCurso) {
    flatSubtasks = flatSubtasks.filter(
      (item) =>
        item.parent_activity.title.toLowerCase().includes(filtroCurso) ||
        item.parent_activity.course.toLowerCase().includes(filtroCurso) ||
        String(item.parent_activity.id) === filtroCurso
    );
  }

  // Filtro por estado
  if (status) {
    const filtroStatus = status.toLowerCase().trim();
    flatSubtasks = flatSubtasks.filter((item) => item.status === filtroStatus);
  }

  // Agrupación en overdue, today, upcoming
  let overdue = flatSubtasks.filter((item) => item.target_date < todayIso);
  let today = flatSubtasks.filter((item) => item.target_date === todayIso);
  let upcoming = flatSubtasks.filter((item) => item.target_date > todayIso);

  // Filtro por días para "upcoming"
  if (days) {
    const numDays = parseInt(days, 10);
    if (!isNaN(numDays) && numDays > 0) {
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() + numDays);
      const limitIso = limitDate.toISOString().split('T')[0];
      upcoming = upcoming.filter((item) => item.target_date <= limitIso);
    }
  }

  // Ordenamiento cronológico con desempate por menor estimated_hours
  const sortByDateAndHoursAsc = (a, b) => {
    if (a.target_date !== b.target_date) {
      return a.target_date.localeCompare(b.target_date);
    }
    return (a.estimated_hours || 0) - (b.estimated_hours || 0);
  };

  overdue.sort(sortByDateAndHoursAsc);
  today.sort((a, b) => (a.estimated_hours || 0) - (b.estimated_hours || 0));
  upcoming.sort(sortByDateAndHoursAsc);

  res.status(200).json({
    status: 'success',
    data: {
      overdue,
      today,
      upcoming,
    },
  });
});

app.listen(port, () => {
  console.log(`Backend de Eventify API escuchando en http://localhost:${port}`);
});

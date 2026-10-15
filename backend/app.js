import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { createSupabaseRepo } from './models/supabaseRepo.js';
import { createTokenService, requireAuth } from './middleware/auth.js';
import { createAuthController } from './controllers/authController.js';
import { createEventsController } from './controllers/eventsController.js';
import { createSubtasksController } from './controllers/subtasksController.js';
import { errorMiddleware } from './controllers/helpers.js';
import { swaggerDocument } from './swaggerDoc.js';

dotenv.config();

const DEFAULT_AUTH_SECRET =
  process.env.AUTH_SECRET || 'eventify_production_secure_token_secret_32_characters_minimum';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gihlakkmlshgoibwnoay.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpaGxha2ttbHNoZ29pYndub2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4ODMzMzYsImV4cCI6MjEwNjQ1OTMzNn0.O6LubxLInJ578EKSGfPV-GNW9lHAGVSO70yJBOVVJBw';

/**
 * Fábrica de la aplicación Express. Permite inyectar un repositorio mock (memoryRepo)
 * para pruebas automatizadas sin depender de red externa.
 */
export function createApp(customRepo = null, customSecret = DEFAULT_AUTH_SECRET) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const tokenService = createTokenService(customSecret);
  const repo = customRepo || createSupabaseRepo({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY });

  const authCtrl = createAuthController(repo, tokenService);
  const eventsCtrl = createEventsController(repo);
  const subtasksCtrl = createSubtasksController(repo);

  // Documentación OpenAPI 3.0 / Swagger UI
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // Health check
  app.get(['/api/health', '/health'], (_req, res) => {
    res.json({ ok: true, servicio: 'organizador-eventos-api', timestamp: new Date().toISOString() });
  });

  // Rutas públicas de autenticación
  app.post(['/api/users/register', '/api/users/register/'], authCtrl.register);
  app.post(['/api/users/login', '/api/users/login/'], authCtrl.login);

  // Middleware guardián para rutas protegidas
  const authGuard = requireAuth(tokenService);

  // Perfil y capacidad diaria (Criterio Sobrecarga / US-21)
  app.get(['/api/users/profile', '/api/users/profile/'], authGuard, authCtrl.getProfile);
  app.get(['/api/users/capacity', '/api/users/capacity/', '/api/users/limit-hours', '/api/users/limit-hours/'], authGuard, authCtrl.getCapacity);
  app.all(['/api/users/capacity', '/api/users/capacity/', '/api/users/limit-hours', '/api/users/limit-hours/'], (req, res, next) => {
    if (['PUT', 'PATCH', 'POST'].includes(req.method)) return authGuard(req, res, () => authCtrl.updateCapacity(req, res, next));
    next();
  });

  // Eventos (US-01 a US-05, C2 / C5)
  app.get(['/api/eventos', '/api/events'], authGuard, eventsCtrl.listEvents);
  app.post(['/api/eventos', '/api/events'], authGuard, eventsCtrl.createEvent);
  app.get(['/api/eventos/:id', '/api/events/:id'], authGuard, eventsCtrl.getEvent);
  app.put(['/api/eventos/:id', '/api/events/:id'], authGuard, eventsCtrl.updateEvent);
  app.patch(['/api/eventos/:id', '/api/events/:id'], authGuard, eventsCtrl.updateEvent);
  app.delete(['/api/eventos/:id', '/api/events/:id'], authGuard, eventsCtrl.deleteEvent);
  app.get(['/api/eventos/:id/progreso', '/api/events/:id/progress'], authGuard, eventsCtrl.getEventProgress);

  // Subtareas y vista "Hoy" (US-12 a US-15, C3)
  app.get(['/api/subtasks/today', '/api/subtasks/today/', '/api/tareas/hoy'], authGuard, subtasksCtrl.getToday);

  // Cambio de estado con nota opcional (US-16 a US-18, C1 / C5)
  app.patch(['/api/subtareas/:id/estado', '/api/subtareas/:id/estado/', '/api/subtasks/:id/estado', '/api/subtasks/:id/status'], authGuard, subtasksCtrl.changeStatus);

  // Reprogramación y actualización de subtareas con detección de sobrecarga (Criterio Sobrecarga)
  app.all(['/api/subtasks/:id', '/api/subtasks/:id/'], (req, res, next) => {
    if (['PATCH', 'PUT'].includes(req.method)) return authGuard(req, res, () => subtasksCtrl.updateSubtask(req, res, next));
    if (req.method === 'DELETE') return authGuard(req, res, () => subtasksCtrl.deleteSubtask(req, res, next));
    next();
  });

  // Creación de subtareas para un evento (US-07 / C1)
  app.post(['/api/events/:id/tasks', '/api/eventos/:id/subtareas'], authGuard, subtasksCtrl.createSubtask);

  // Middleware de manejo de errores controlado (sin fugas de stack trace)
  app.use(errorMiddleware);

  return app;
}

const app = createApp();
const port = process.env.PORT || 8000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Backend de Eventify API escuchando en http://localhost:${port}`);
    console.log(`Documentación Swagger interactiva en http://localhost:${port}/api/docs`);
  });
}

export default app;

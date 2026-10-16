/**
 * Especificación OpenAPI 3.0.3 interactiva para Swagger UI (/api/docs).
 * Cumple con US-49 y C5: documenta todos los endpoints de eventos, subtareas,
 * cambio de estado con notas, reprogramación con detección de sobrecarga y progreso.
 */
export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Eventify API - Organizador de Eventos Independientes (Sprint 4)',
    description:
      'API REST completa para la gestión de eventos independientes, planes logísticos, seguimiento de subtareas con notas, detección de sobrecarga diaria (409 Conflict) y cálculo de progreso.\n\nUniversidad del Valle - Proyecto Integrador 2026',
    version: '4.0.0',
  },
  servers: [
    { url: 'http://localhost:8000', description: 'Servidor Local (Puerto 8000)' },
    { url: 'http://localhost:3000', description: 'Servidor Local (Puerto 3000)' },
    { url: 'https://grupo1uv.onrender.com', description: 'Servidor de Producción (Render)' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT firmado por el servidor obtenido en /api/users/login o /api/users/register',
      },
    },
    schemas: {
      Progreso: {
        type: 'object',
        properties: {
          total_gestiones: { type: 'integer', example: 4 },
          gestiones_hechas: { type: 'integer', example: 2 },
          gestiones_pendientes: { type: 'integer', example: 1 },
          gestiones_pospuestas: { type: 'integer', example: 1 },
          porcentaje_progreso: { type: 'number', example: 50.0 },
        },
      },
      Subtarea: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'sub-1' },
          eventoId: { type: 'string', example: 'evt-1' },
          titulo: { type: 'string', example: 'Confirmar catering y menú' },
          horasEstimadas: { type: 'number', example: 2.0 },
          fechaLimite: { type: 'string', example: '2026-10-20' },
          estado: { type: 'string', enum: ['Pendiente', 'Hecha', 'POSTERGADA'], example: 'Pendiente' },
          nota: { type: 'string', nullable: true, example: 'Esperando cotización del proveedor' },
          responsable: { type: 'string', example: 'Carlos Catering' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'validation_error' },
              message: { type: 'string', example: 'El nombre del evento es obligatorio.' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Verificación de salud del servicio',
        responses: { 200: { description: 'Servicio en línea' } },
      },
    },
    '/api/users/register': {
      post: {
        summary: 'Registro de nuevo usuario',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombre', 'usuario', 'email', 'password'],
                properties: {
                  nombre: { type: 'string', example: 'Juan Pérez' },
                  usuario: { type: 'string', example: 'juanperez' },
                  email: { type: 'string', example: 'juan@valle.co' },
                  password: { type: 'string', example: 'Eventify2026*' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Usuario registrado exitosamente con token JWT' },
          400: { description: 'Datos de validación inválidos' },
          409: { description: 'Usuario o correo ya registrado' },
        },
      },
    },
    '/api/users/login': {
      post: {
        summary: 'Inicio de sesión con credenciales',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['usuario', 'password'],
                properties: {
                  usuario: { type: 'string', example: 'juanesteban' },
                  password: { type: 'string', example: 'Eventify2026*' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Sesión iniciada con éxito y retorno de token JWT' },
          401: { description: 'Credenciales inválidas' },
        },
      },
    },
    '/api/users/capacity': {
      get: {
        summary: 'Consultar límite diario de horas del usuario',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Capacidad diaria en horas (por defecto 6)' },
          401: { description: 'No autenticado' },
        },
      },
      put: {
        summary: 'Actualizar límite diario de horas (1 a 16 h)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  limitHoursDay: { type: 'number', minimum: 1, maximum: 16, example: 7 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Límite actualizado exitosamente' },
          400: { description: 'Valor fuera del rango 1-16' },
        },
      },
    },
    '/api/eventos': {
      get: {
        summary: 'Listar eventos del usuario autenticado',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Lista de eventos con sus subtareas y progreso' } },
      },
      post: {
        summary: 'Crear un nuevo evento y opcionalmente su plan logístico inicial',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombre'],
                properties: {
                  nombre: { type: 'string', example: 'Boda Valentina & Emilio' },
                  tipo: { type: 'string', example: 'Boda' },
                  fecha: { type: 'string', example: '2026-11-20' },
                  lugar: { type: 'string', example: 'Valle de Bravo' },
                  asistentes: { type: 'integer', example: 280 },
                  descripcion: { type: 'string' },
                  subtareas: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        titulo: { type: 'string', example: 'Reservar salón principal' },
                        horasEstimadas: { type: 'number', example: 3 },
                        fechaLimite: { type: 'string', example: '2026-10-15' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Evento creado exitosamente' },
          400: { description: 'Datos inválidos' },
          409: { description: 'Sobrecarga de horas en la jornada' },
        },
      },
    },
    '/api/eventos/{id}': {
      get: {
        summary: 'Consultar detalle de un evento',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Detalle del evento con progreso y lista de subtareas' },
          404: { description: 'Evento no encontrado' },
        },
      },
      put: {
        summary: 'Actualizar metadatos del evento',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Evento actualizado' } },
      },
      delete: {
        summary: 'Eliminar un evento y todas sus subtareas asociadas',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Evento eliminado' } },
      },
    },
    '/api/eventos/{id}/progreso': {
      get: {
        summary: 'Consultar progreso del evento (C2 / C5)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Resumen de progreso con conteo de hechas, pendientes, pospuestas y porcentaje',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Progreso' } } },
          },
        },
      },
    },
    '/api/activities/': {
      get: {
        tags: ['Subtareas y Gestiones Logísticas'],
        summary: 'Listar todas las actividades y gestiones del usuario autenticado',
        description:
          'Retorna el listado completo de subtareas/actividades pertenecientes a los eventos del usuario autenticado, asociadas a su respectivo evento y con cálculo de estado.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'eventoId',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Filtrar actividades por ID del evento',
          },
          {
            name: 'estado',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['Pendiente', 'Hecha', 'POSTERGADA'] },
            description: 'Filtrar actividades por estado',
          },
        ],
        responses: {
          200: {
            description: 'Listado de actividades obtenido exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    status: { type: 'string', example: 'success' },
                    total: { type: 'integer', example: 5 },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Subtarea' },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Token de autenticación faltante o inválido' },
        },
      },
    },
    '/api/activities': {
      get: {
        tags: ['Subtareas y Gestiones Logísticas'],
        summary: 'Listar todas las actividades y gestiones (alias sin barra diagonal final)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'eventoId',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Filtrar actividades por ID del evento',
          },
          {
            name: 'estado',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['Pendiente', 'Hecha', 'POSTERGADA'] },
            description: 'Filtrar actividades por estado',
          },
        ],
        responses: {
          200: {
            description: 'Listado de actividades obtenido exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    status: { type: 'string', example: 'success' },
                    total: { type: 'integer', example: 5 },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Subtarea' },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Token de autenticación faltante o inválido' },
        },
      },
    },
    '/api/events/{id}/tasks': {
      post: {
        tags: ['Subtareas y Gestiones Logísticas'],
        summary: 'Registrar una nueva subtarea logística para un evento (US-07 / C1)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['titulo'],
                properties: {
                  titulo: { type: 'string', example: 'Confirmar catering' },
                  horasEstimadas: { type: 'number', example: 2.5 },
                  fechaLimite: { type: 'string', example: '2026-10-25' },
                  responsable: { type: 'string', example: 'Chef Carlos' },
                  nota: { type: 'string', example: 'Nota inicial opcional' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Subtarea creada y asociada al evento' },
          400: { description: 'Datos inválidos' },
          409: { description: 'Sobrecarga de horas en la jornada' },
        },
      },
    },
    '/api/subtasks/today': {
      get: {
        tags: ['Subtareas y Gestiones Logísticas'],
        summary: 'Vista "Hoy" con priorización cronológica (US-12 / C3)',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Tareas agrupadas en Vencidas, Para hoy y Próximas' },
        },
      },
    },
    '/api/subtareas/{id}/estado': {
      patch: {
        tags: ['Subtareas y Gestiones Logísticas'],
        summary: 'Cambiar estado de subtarea con nota opcional (US-16, US-17, US-18 / C1)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['estado'],
                properties: {
                  estado: { type: 'string', enum: ['Pendiente', 'Hecha', 'POSTERGADA'], example: 'Hecha' },
                  nota: { type: 'string', example: 'Contrato firmado con 50% de anticipo' },
                  fechaLimite: { type: 'string', example: '2026-10-30', description: 'Nueva fecha al posponer' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Estado actualizado, nota persistida y recálculo de progreso' },
          400: { description: 'Estado o nota no válidos' },
          409: { description: 'Sobrecarga al posponer hacia fecha saturada' },
        },
      },
    },
    '/api/subtasks/{id}': {
      patch: {
        tags: ['Subtareas y Gestiones Logísticas'],
        summary: 'Reprogramar subtarea (fecha y horas) con detección de sobrecarga (Criterio Sobrecarga)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fechaLimite: { type: 'string', example: '2026-10-22' },
                  horasEstimadas: { type: 'number', example: 3.5 },
                  nota: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Subtarea reprogramada exitosamente' },
          409: { description: 'Conflicto de sobrecarga diaria (supera límite diario)' },
        },
      },
      delete: {
        tags: ['Subtareas y Gestiones Logísticas'],
        summary: 'Eliminar una subtarea logística',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Subtarea eliminada' } },
      },
    },
  },
};


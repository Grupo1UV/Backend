-- ============================================================================
-- Migración Base de Datos: Sprint 4 - Organizador de Eventos Independientes
-- Compatible con PostgreSQL y Supabase.
-- Ejecutar en el SQL Editor de Supabase si se tienen permisos de administración.
-- ============================================================================

-- 1. Soporte para notas opcionales explicativas en tareas logísticas (C1 / US-18)
ALTER TABLE IF EXISTS public.subtasks
  ADD COLUMN IF NOT EXISTS nota TEXT;

COMMENT ON COLUMN public.subtasks.nota IS 'Nota opcional explicativa al ejecutar, posponer o reprogramar la gestión logística.';

-- 2. Capacidad diaria configurable por usuario (Criterio Sobrecarga / US-21)
ALTER TABLE IF EXISTS public.app_users
  ADD COLUMN IF NOT EXISTS limite_horas_dia NUMERIC DEFAULT 6 CHECK (limite_horas_dia >= 1 AND limite_horas_dia <= 16);

COMMENT ON COLUMN public.app_users.limite_horas_dia IS 'Límite máximo configurable de horas de gestión diaria (1 a 16 h).';

-- 3. Índices de optimización para consultas del Sprint 4
CREATE INDEX IF NOT EXISTS idx_subtasks_event_id ON public.subtasks(event_id);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON public.events(user_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_fecha_limite ON public.subtasks(fecha_limite);


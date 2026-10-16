/**
 * Reglas de negocio puras del Organizador de Eventos (Sprint 4).
 * No acceden a la base de datos: los controladores y las pruebas las reutilizan
 * para que el cálculo de progreso, carga diaria y sobrecarga sea uno solo.
 */

// Estados canónicos persistidos en subtasks.estado (se conserva 'POSTERGADA' del Sprint 3).
export const ESTADOS = Object.freeze({
  PENDIENTE: 'Pendiente',
  HECHA: 'Hecha',
  POSPUESTA: 'POSTERGADA',
});

const ALIAS_ESTADO = {
  pendiente: ESTADOS.PENDIENTE,
  pending: ESTADOS.PENDIENTE,
  hecha: ESTADOS.HECHA,
  done: ESTADOS.HECHA,
  completada: ESTADOS.HECHA,
  pospuesta: ESTADOS.POSPUESTA,
  postergada: ESTADOS.POSPUESTA,
  postponed: ESTADOS.POSPUESTA,
};

export const HORAS_MIN = 0.5;
export const HORAS_MAX = 12;
export const LIMITE_DEFAULT = 6;
export const LIMITE_MIN = 1;
export const LIMITE_MAX = 16;
export const NOTA_MAX = 500;
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Bogota';

/** Devuelve el estado canónico o null si el valor no es un estado permitido. */
export function normalizarEstado(valor) {
  if (valor === null || valor === undefined) return null;
  return ALIAS_ESTADO[String(valor).trim().toLowerCase()] || null;
}

/** Estado canónico de una fila guardada (valores heredados desconocidos => Pendiente). */
export function estadoDeFila(valor) {
  return normalizarEstado(valor) || ESTADOS.PENDIENTE;
}

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria de la aplicación, no en UTC. */
export function hoyIso(now = new Date(), timeZone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** true si es una fecha de calendario real con formato AAAA-MM-DD. */
export function esFechaIso(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Normaliza una fecha a AAAA-MM-DD. Acepta AAAA-MM-DD y DD/MM/AAAA.
 * Valores relativos heredados ('Hoy', 'Próxima semana') NO se convierten:
 * no se inventan fechas; se devuelve null ("sin fecha").
 */
export function normalizarFecha(valor) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (esFechaIso(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return esFechaIso(iso) ? iso : null;
  }
  return null;
}

export function isoADisplay(iso) {
  if (!esFechaIso(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Nombre del día de la semana en español para una fecha ISO. */
export function nombreDia(iso) {
  if (!esFechaIso(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  );
}

/** Valida horas estimadas. Devuelve el mensaje de error o null. */
export function validarHoras(valor) {
  if (valor === '' || valor === null || valor === undefined) return 'Las horas estimadas son obligatorias.';
  const n = Number(valor);
  if (!Number.isFinite(n)) return 'Las horas estimadas deben ser un número.';
  if (n < HORAS_MIN || n > HORAS_MAX) {
    return `Las horas estimadas deben estar entre ${HORAS_MIN} y ${HORAS_MAX}.`;
  }
  if (Math.round(n * 2) !== n * 2) return 'Usa intervalos de media hora (ej. 1, 1.5, 2).';
  return null;
}

/** Valida el límite diario. Devuelve el mensaje de error o null. */
export function validarLimite(valor) {
  const n = Number(valor);
  if (valor === '' || valor === null || valor === undefined || !Number.isFinite(n) || n < LIMITE_MIN || n > LIMITE_MAX) {
    return `El valor debe estar entre ${LIMITE_MIN} y ${LIMITE_MAX}`;
  }
  return null;
}

const redondear = (n) => Math.round(n * 10) / 10;

/**
 * Progreso = hechas / total * 100. Las pospuestas NO cuentan como hechas.
 * Sin subtareas => 0 % (sin división por cero). Los conteos suman el total.
 */
export function calcularProgreso(subtareas = []) {
  let hechas = 0;
  let pendientes = 0;
  let pospuestas = 0;
  for (const s of subtareas) {
    const e = estadoDeFila(s.estado);
    if (e === ESTADOS.HECHA) hechas += 1;
    else if (e === ESTADOS.POSPUESTA) pospuestas += 1;
    else pendientes += 1;
  }
  const total = subtareas.length;
  return {
    total_gestiones: total,
    gestiones_hechas: hechas,
    gestiones_pendientes: pendientes,
    gestiones_pospuestas: pospuestas,
    porcentaje_progreso: total === 0 ? 0 : Math.round((hechas / total) * 100),
  };
}

/**
 * Horas pendientes por día (excluye Hechas; las pospuestas cuentan en su fecha efectiva).
 * Cada tarea: { id, fecha (ISO|null), horas, estado }.
 */
export function cargaPorFecha(tareas = []) {
  const carga = {};
  for (const t of tareas) {
    if (estadoDeFila(t.estado) === ESTADOS.HECHA) continue;
    const fecha = normalizarFecha(t.fecha);
    if (!fecha) continue;
    carga[fecha] = redondear((carga[fecha] || 0) + (Number(t.horas) || 0));
  }
  return carga;
}

/**
 * Evalúa la sobrecarga tras aplicar unos cambios sobre las tareas actuales del usuario.
 * - `tareas`: estado actual de TODAS las subtareas del usuario.
 * - `cambios`: tareas nuevas o modificadas (mismo id => reemplaza; así una tarea
 *   trasladada se descuenta del origen y no se cuenta dos veces en el destino).
 * Hay conflicto cuando la carga del día afectado supera ESTRICTAMENTE el límite.
 */
export function evaluarSobrecarga({ tareas = [], cambios = [], limite = LIMITE_DEFAULT }) {
  const porId = new Map(tareas.map((t) => [String(t.id), t]));
  const fechasAfectadas = new Set();
  cambios.forEach((c, i) => {
    if (c.id !== undefined && c.id !== null) porId.set(String(c.id), c);
    else porId.set(`__nueva_${i}`, c);
    const f = normalizarFecha(c.fecha);
    if (f && estadoDeFila(c.estado) !== ESTADOS.HECHA) fechasAfectadas.add(f);
  });
  const resultantes = [...porId.values()];
  const carga = cargaPorFecha(resultantes);
  const conflictos = [];
  for (const fecha of [...fechasAfectadas].sort()) {
    const horas = carga[fecha] || 0;
    if (horas > limite) {
      conflictos.push({
        fecha,
        dia: nombreDia(fecha),
        horas_planificadas: horas,
        limite,
        exceso: redondear(horas - limite),
        tareas: resultantes
          .filter((t) => normalizarFecha(t.fecha) === fecha && estadoDeFila(t.estado) !== ESTADOS.HECHA)
          .map((t) => ({ id: t.id ?? null, titulo: t.titulo || '', horas: Number(t.horas) || 0 })),
      });
    }
  }
  return { hayConflicto: conflictos.length > 0, conflictos, carga };
}

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

/** Mensaje de conflicto orientado al usuario (día, horas resultantes, límite y exceso). */
export function mensajeConflicto({ fecha, horas_planificadas, limite, exceso }) {
  return (
    `Al reprogramar esta gestión, el ${nombreDia(fecha)} ${isoADisplay(fecha)} quedarías con ` +
    `${plural(horas_planificadas, 'hora', 'horas')} planificadas. Tu límite diario es de ` +
    `${plural(limite, 'hora', 'horas')}, por lo que superarías tu capacidad en ${plural(exceso, 'hora', 'horas')}.`
  );
}

/**
 * Agrupa las tareas NO hechas en vencidas / hoy / próximas (y sin fecha).
 * Orden: fecha ascendente y, en empate, menos horas primero.
 */
export function agruparHoy(tareas = [], hoy = hoyIso()) {
  const grupos = { vencidas: [], hoy: [], proximas: [], sinFecha: [] };
  for (const t of tareas) {
    if (estadoDeFila(t.estado) === ESTADOS.HECHA) continue;
    const f = normalizarFecha(t.fecha);
    if (!f) grupos.sinFecha.push(t);
    else if (f < hoy) grupos.vencidas.push(t);
    else if (f === hoy) grupos.hoy.push(t);
    else grupos.proximas.push(t);
  }
  const orden = (a, b) => {
    const fa = normalizarFecha(a.fecha) || '9999-12-31';
    const fb = normalizarFecha(b.fecha) || '9999-12-31';
    if (fa !== fb) return fa.localeCompare(fb);
    return (Number(a.horas) || 0) - (Number(b.horas) || 0);
  };
  Object.values(grupos).forEach((g) => g.sort(orden));
  return grupos;
}

/** Procesa la nota opcional: undefined/'' => conservar la anterior; null => borrar; texto => reemplazar. */
export function resolverNota(notaEntrada, notaAnterior) {
  if (notaEntrada === undefined) return { valor: notaAnterior ?? null };
  if (notaEntrada === null) return { valor: null };
  if (typeof notaEntrada !== 'string') return { error: 'La nota debe ser un texto.' };
  const limpia = notaEntrada.trim();
  if (limpia === '') return { valor: notaAnterior ?? null };
  if (limpia.length > NOTA_MAX) return { error: `La nota no puede superar ${NOTA_MAX} caracteres.` };
  return { valor: limpia };
}

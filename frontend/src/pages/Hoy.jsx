import { useState } from 'react';
import TaskCard from '../components/TaskCard';

const tareasIniciales = [
  {
    id: 1,
    titulo: 'Confirmar catering',
    evento: 'Conferencia empresarial',
    fechaLimite: 'Hoy',
    horasEstimadas: 2,
    estado: 'Pendiente',
  },
  {
    id: 2,
    titulo: 'Enviar invitaciones',
    evento: 'Evento de lanzamiento',
    fechaLimite: 'Mañana',
    horasEstimadas: 1,
    estado: 'Pendiente',
  },
];

function Hoy() {
  const [tareas, setTareas] = useState(tareasIniciales);
  const fecha = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const marcarHecha = (id) => {
    setTareas((actuales) => actuales.map((tarea) => (
      tarea.id === id ? { ...tarea, estado: tarea.estado === 'Hecha' ? 'Pendiente' : 'Hecha' } : tarea
    )));
  };

  const posponer = (id) => {
    setTareas((actuales) => actuales.map((tarea) => (
      tarea.id === id ? { ...tarea, fechaLimite: 'Próxima semana' } : tarea
    )));
  };

  const urgentes = tareas.filter((tarea) => tarea.estado !== 'Hecha');

  return (
    <section className="today-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">Panel de trabajo</p>
          <h1>Hoy</h1>
          <p className="current-date">{fecha}</p>
        </div>
        <div className="focus-note"><span className="sun-icon">✦</span><span>Un paso importante a la vez.</span></div>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Prioridad del día</p>
          <h2>Tareas urgentes <span className="count">{urgentes.length}</span></h2>
        </div>
        <p className="section-caption">Lo que necesita tu atención más cercana.</p>
      </div>
      <div className="task-list">
        {urgentes.length > 0 ? urgentes.map((task) => (
          <TaskCard key={task.id} task={task} onComplete={marcarHecha} onSnooze={posponer} />
        )) : (
          <div className="empty-state">
            <span className="empty-icon">✓</span>
            <h3>Todo al día</h3>
            <p>No hay tareas urgentes pendientes. Buen trabajo.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default Hoy;

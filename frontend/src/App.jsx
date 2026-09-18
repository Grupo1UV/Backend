import { useState } from 'react'
import './App.css'

function App() {
  const [tareas, setTareas] = useState([
    {
      id: 1,
      titulo: 'Confirmar catering',
      evento: 'Conferencia empresarial',
      fechaLimite: 'Hoy',
      horasEstimadas: 2,
      prioridad: 'Alta',
      estado: 'Pendiente',
    },
    {
      id: 2,
      titulo: 'Enviar invitaciones',
      evento: 'Evento de lanzamiento',
      fechaLimite: 'Hoy',
      horasEstimadas: 1,
      prioridad: 'Media',
      estado: 'Pendiente',
    },
    {
      id: 3,
      titulo: 'Reservar el salón',
      evento: 'Reunión corporativa',
      fechaLimite: 'Mañana',
      horasEstimadas: 3,
      prioridad: 'Media',
      estado: 'Pendiente',
    },
  ])
  const [mensaje, setMensaje] = useState('')

  const fechaActual = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const marcarComoHecha = (id) => {
    setTareas((tareasActuales) =>
      tareasActuales.map((tarea) =>
        tarea.id === id
          ? { ...tarea, estado: 'Hecha' }
          : tarea
      )
    )
    const tarea = tareas.find((item) => item.id === id)
    setMensaje(`${tarea.titulo} se marcó como realizada.`)
  }

  const posponerTarea = (id) => {
    setTareas((tareasActuales) =>
      tareasActuales.map((tarea) =>
        tarea.id === id
          ? { ...tarea, estado: 'Pospuesta', fechaLimite: 'Próximamente' }
          : tarea
      )
    )
    const tarea = tareas.find((item) => item.id === id)
    setMensaje(`${tarea.titulo} se pospuso para próximamente.`)
  }

  const tareasPendientes = tareas.filter(
    (tarea) => tarea.estado === 'Pendiente'
  )

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Organizador de eventos</p>
          <h1>Hoy </h1>
          <p className="subtitle">
            Revisa las tareas que requieren tu atención.
          </p>
        </div>

        <div className="date-card">
          <span>{fechaActual}</span>
        </div>
      </header>

      <main className="content">
        <section className="summary">
          <div>
            <span className="summary-label">Tareas pendientes</span>
            <strong>{tareasPendientes.length}</strong>
          </div>

          <div>
            <span className="summary-label">Tareas urgentes</span>
            <strong>
              {tareasPendientes.filter(
                (tarea) => tarea.prioridad === 'Alta'
              ).length}
            </strong>
          </div>
        </section>

        <section className="tasks-section">
          <div className="section-heading">
            <div>
              <h2>Tareas de hoy</h2>
              <p>Estas son las gestiones que debes revisar primero.</p>
            </div>

            <span className="task-count">
              {tareasPendientes.length} pendientes
            </span>
          </div>

          {mensaje && <p className="feedback" role="status" aria-live="polite">{mensaje}</p>}

          {tareasPendientes.length === 0 ? (
            <div className="empty-state">
              <h3>Todo al día</h3>
              <p>No tienes tareas pendientes que requieran atención.</p>
            </div>
          ) : (
            <div className="tasks-list">
              {tareas.map((tarea) => (
                <article
                  className={`task-card ${
                    tarea.estado !== 'Pendiente' ? 'completed' : ''
                  }`}
                  key={tarea.id}
                >
                  <div className="task-main">
                    <div className="task-title-row">
                      <span
                        className={`priority priority-${tarea.prioridad.toLowerCase()}`}
                      >
                        {tarea.prioridad}
                      </span>

                      <span className="task-status">
                        {tarea.estado}
                      </span>
                    </div>

                    <h3>{tarea.titulo}</h3>
                    <p className="event-name">{tarea.evento}</p>

                    <div className="task-details">
                      <span>📅 {tarea.fechaLimite}</span>
                      <span>⏱️ {tarea.horasEstimadas} horas estimadas</span>
                    </div>
                  </div>

                  <div className="task-actions">
                    <button
                      className="button button-primary"
                      onClick={() => marcarComoHecha(tarea.id)}
                      disabled={tarea.estado !== 'Pendiente'}
                    >
                      Marcar como hecha
                    </button>

                    <button
                      className="button button-secondary"
                      onClick={() => posponerTarea(tarea.id)}
                      disabled={tarea.estado !== 'Pendiente'}
                    >
                      Posponer
                    </button>

                    <button
                      className="button button-link"
                      onClick={() =>
                        alert(`Detalle de la tarea: ${tarea.titulo}`)
                      }
                    >
                      Ver detalle
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
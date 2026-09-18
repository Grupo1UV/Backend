import { Link } from 'react-router-dom';

function TaskCard({ task, onComplete, onSnooze }) {
  return (
    <article className={`task-card ${task.estado === 'Hecha' ? 'completed' : ''}`}>
      <button
        className="check-button"
        type="button"
        onClick={() => onComplete(task.id)}
        aria-label={`Marcar ${task.titulo} como hecha`}
      >
        {task.estado === 'Hecha' ? '✓' : ''}
      </button>
      <div className="task-main">
        <div className="task-heading">
          <h3>{task.titulo}</h3>
          <span className={`status status-${task.estado.toLowerCase()}`}>{task.estado}</span>
        </div>
        <p className="event-name">{task.evento}</p>
        <div className="task-meta">
          <span><strong>Vence</strong> {task.fechaLimite}</span>
          <span><strong>Estimación</strong> {task.horasEstimadas} {task.horasEstimadas === 1 ? 'hora' : 'horas'}</span>
        </div>
      </div>
      <div className="task-actions">
        <button className="text-button" type="button" onClick={() => onSnooze(task.id)}>Posponer</button>
        <Link className="details-button" to={`/evento/${task.id}`}>Ver detalles <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}

export default TaskCard;

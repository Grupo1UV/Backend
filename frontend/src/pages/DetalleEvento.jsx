import { Link, useParams } from 'react-router-dom';

function DetalleEvento() {
  const { id } = useParams();
  return (
    <section className="simple-page">
      <p className="eyebrow">Detalle de tarea</p>
      <h1>Evento #{id}</h1>
      <p className="lead">Esta vista será el espacio para consultar y organizar todos los detalles del evento.</p>
      <Link className="details-button back-link" to="/hoy">← Volver a Hoy</Link>
    </section>
  );
}

export default DetalleEvento;

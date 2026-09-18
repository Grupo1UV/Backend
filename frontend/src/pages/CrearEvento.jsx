function CrearEvento() {
  return (
    <section className="simple-page">
      <p className="eyebrow">Planificación</p>
      <h1>Crear evento</h1>
      <p className="lead">Aquí podrás registrar un nuevo evento y sus tareas.</p>
      <form className="event-form" onSubmit={(event) => event.preventDefault()}>
        <label>Nombre del evento<input type="text" placeholder="Ej. Conferencia empresarial" /></label>
        <label>Fecha<input type="date" /></label>
        <button className="primary-button" type="submit">Guardar evento</button>
      </form>
    </section>
  );
}

export default CrearEvento;

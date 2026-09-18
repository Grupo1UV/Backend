import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, servicio: 'organizador-eventos-api' });
});

app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`);
});

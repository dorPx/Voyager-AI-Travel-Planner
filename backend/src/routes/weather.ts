import { Router, Request, Response } from 'express';
import { getWeather } from '../services/weather.service';

const router = Router();

// GET /api/weather?destination=Paris&start=YYYY-MM-DD&end=YYYY-MM-DD
// Always 200 with { days: [] } on any failure — weather is decoration.
router.get('/', async (req: Request, res: Response) => {
  const destination = String(req.query.destination ?? '').trim();
  const start = String(req.query.start ?? '').trim();
  const end = String(req.query.end ?? '').trim();

  if (!destination || !start || !end) {
    return res.status(400).json({ error: 'Missing required query params: destination, start, end.' });
  }

  const days = await getWeather(destination, start, end);
  return res.json({ days });
});

export default router;

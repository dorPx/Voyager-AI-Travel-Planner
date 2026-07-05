import { Router, Request, Response } from 'express';
import { getPriceHistory } from '../services/priceHistory.service';

const router = Router();

// POST /api/price-history — { destination, names: string[] } → { history }
// POST (not GET) because a results page asks about dozens of hotel names at
// once. Keys in the response are lowercased hotel names.
router.post('/', (req: Request, res: Response) => {
  const { destination, names } = req.body as { destination?: string; names?: string[] };

  if (!destination || !Array.isArray(names)) {
    return res.status(400).json({ error: 'Missing required fields: destination, names.' });
  }

  const history = getPriceHistory(destination, names.filter((n) => typeof n === 'string'));
  return res.json({ history });
});

export default router;

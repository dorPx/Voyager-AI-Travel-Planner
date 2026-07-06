import { Router, Request, Response } from 'express';
import { getLiteApiHotelDetails } from '../scrapers/liteapi';

const router = Router();

// POST /api/hotels/details — rich pre-booking detail for one hotel.
// Currently LiteAPI-backed (the only source with a content + room-rates API).
// The hotelId is the card's id (e.g. "liteapi-lp19f1f"); dates + occupancy
// come from the active search so room rates match what the user is browsing.
router.post('/details', async (req: Request, res: Response) => {
  const { hotelId, checkin, checkout, adults, children, rooms } = req.body as {
    hotelId?: string;
    checkin?: string;
    checkout?: string;
    adults?: number;
    children?: number;
    rooms?: number;
  };

  if (!hotelId || !checkin || !checkout) {
    return res.status(400).json({ error: 'Missing required fields: hotelId, checkin, checkout.' });
  }

  // Only LiteAPI-sourced hotels have a detail endpoint; others carry no richer
  // data than the card already shows.
  if (!/^liteapi-/.test(hotelId)) {
    return res.status(404).json({ error: 'No extended details for this source.' });
  }

  const details = await getLiteApiHotelDetails(hotelId, checkin, checkout, { adults, children, rooms });
  if (!details) return res.status(404).json({ error: 'Details unavailable.' });
  return res.json(details);
});

export default router;

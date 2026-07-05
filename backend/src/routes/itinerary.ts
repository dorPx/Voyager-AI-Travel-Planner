import { Router, Request, Response } from 'express';
import { itineraryService } from '../services/itinerary.service';
import type { TripItinerary } from '../../../shared/types';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/itinerary — list all saved trips (summary only)
// ---------------------------------------------------------------------------

router.get('/', (_req: Request, res: Response) => {
  const trips = itineraryService.listTrips();
  return res.json(trips);
});

// ---------------------------------------------------------------------------
// POST /api/itinerary — save a new trip
// ---------------------------------------------------------------------------

router.post('/', (req: Request, res: Response) => {
  const itinerary = req.body as TripItinerary;

  if (!itinerary?.destination || !itinerary?.days) {
    return res.status(400).json({ error: 'Missing required fields: destination, days.' });
  }

  const id = itineraryService.saveTrip(itinerary);
  const saved = itineraryService.getTrip(id);
  return res.status(201).json(saved);
});

// ---------------------------------------------------------------------------
// GET /api/itinerary/shared/:shareId — read-only lookup by public share token
// (registered before /:id so "shared" is never read as a trip id)
// ---------------------------------------------------------------------------

router.get('/shared/:shareId', (req: Request, res: Response) => {
  const trip = itineraryService.getTripByShareId(req.params.shareId);
  if (!trip) return res.status(404).json({ error: 'Shared trip not found' });
  return res.json(trip);
});

// ---------------------------------------------------------------------------
// GET /api/itinerary/:id — full trip
// ---------------------------------------------------------------------------

router.get('/:id', (req: Request, res: Response) => {
  const trip = itineraryService.getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  return res.json(trip);
});

// ---------------------------------------------------------------------------
// DELETE /api/itinerary/:id
// ---------------------------------------------------------------------------

router.delete('/:id', (req: Request, res: Response) => {
  const deleted = itineraryService.deleteTrip(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Trip not found' });
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/itinerary/:id/export?format=json|pdf
// ---------------------------------------------------------------------------

router.get('/:id/export', async (req: Request, res: Response) => {
  const { id } = req.params;
  const format = (req.query.format as string) ?? 'json';

  if (!itineraryService.getTrip(id)) {
    return res.status(404).json({ error: 'Trip not found' });
  }

  if (format === 'json') {
    try {
      const json = itineraryService.exportToJSON(id);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="trip-${id}.json"`);
      return res.send(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  }

  if (format === 'ics') {
    try {
      const ics = itineraryService.exportToICS(id);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="trip-${id}.ics"`);
      return res.send(ics);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message });
    }
  }

  if (format === 'pdf') {
    try {
      const pdfBuffer = await itineraryService.exportToPDF(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="trip-${id}.pdf"`);
      return res.send(pdfBuffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: `PDF generation failed: ${message}` });
    }
  }

  return res.status(400).json({ error: 'Unsupported format. Use ?format=json, ?format=pdf or ?format=ics' });
});

export default router;

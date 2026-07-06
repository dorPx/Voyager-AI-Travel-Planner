import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';

import searchRouter from './routes/search';
import recommendRouter from './routes/recommend';
import itineraryRouter from './routes/itinerary';
import modelsRouter from './routes/models';
import healthRouter from './routes/health';
import aiRouter from './routes/ai';
import tripsRouter from './routes/trips';
import currencyRouter from './routes/currency';
import weatherRouter from './routes/weather';
import priceHistoryRouter from './routes/priceHistory';
import hotelsRouter from './routes/hotels';

// Initialize DB on startup
import './db';

const app = express();
const PORT = process.env.PORT ?? 4000;

// Overridable for setups where the frontend isn't on :3000 (e.g. the Docker
// dev variant publishes it on :3100 and sets CORS_ORIGIN accordingly).
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

app.use('/api/search', searchRouter);
app.use('/api/recommend', recommendRouter);
app.use('/api/itinerary', itineraryRouter);
app.use('/api/models', modelsRouter);
app.use('/api/health', healthRouter);
app.use('/api/ai', aiRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/currency', currencyRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/price-history', priceHistoryRouter);
app.use('/api/hotels', hotelsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[unhandled error]', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

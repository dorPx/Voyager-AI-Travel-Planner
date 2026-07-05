import { Router, Request, Response } from 'express';
import axios from 'axios';
import { db } from '../db';
import { TripItinerary, SearchParams, PackingList, WeatherDay } from '../../../shared/types';
import { getWeather } from '../services/weather.service';

const router = Router();

// POST /api/ai/plan  — generate a full itinerary via OpenRouter
router.post('/plan', async (req: Request, res: Response) => {
  const body = req.body as {
    params: SearchParams;
    name: string;
    budget_usd: number;
    hotels?: unknown[];
    flights?: unknown[];
    activities?: unknown[];
    restaurants?: unknown[];
  };

  const { params, name, budget_usd, hotels = [], flights = [], activities = [], restaurants = [] } = body;

  const systemPrompt = `You are an expert travel planner. Given destination data, create a detailed day-by-day vacation itinerary.
Always respond with a valid JSON object matching the TripItinerary structure.`;

  const userPrompt = `Plan a ${params.trip_type ?? 'leisure'} trip to ${params.destination} from ${params.checkin} to ${params.checkout}.
Budget: $${budget_usd} USD total.

Available hotels (pick the best fit):
${JSON.stringify(hotels.slice(0, 5), null, 2)}

Available flights:
${JSON.stringify(flights.slice(0, 3), null, 2)}

Available activities:
${JSON.stringify(activities.slice(0, 10), null, 2)}

Available restaurants:
${JSON.stringify(restaurants.slice(0, 10), null, 2)}

Respond ONLY with a JSON object with this structure:
{
  "id": "<uuid>",
  "name": "${name}",
  "destination": "${params.destination}",
  "trip_type": "${params.trip_type ?? 'leisure'}",
  "total_cost": <number>,
  "days": [
    {
      "day": 1,
      "date": "<YYYY-MM-DD>",
      "hotel": <hotel object or null>,
      "activities": [<activity objects>],
      "meals": [<restaurant objects>],
      "estimated_cost": <number>
    }
  ]
}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Vacation Planner',
        },
      }
    );

    const content = response.data.choices?.[0]?.message?.content ?? '{}';
    const itinerary: TripItinerary = JSON.parse(content);
    if (!itinerary.id) itinerary.id = generateId();

    // Persist trip to SQLite
    db.prepare(`
      INSERT OR REPLACE INTO trips (id, name, destination, start_date, end_date, budget_usd, trip_type, itinerary_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      itinerary.id,
      itinerary.name,
      itinerary.destination,
      params.checkin,
      params.checkout,
      budget_usd,
      itinerary.trip_type,
      JSON.stringify(itinerary),
      new Date().toISOString()
    );

    return res.json(itinerary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

// POST /api/ai/chat  — conversational refinement
router.post('/chat', async (req: Request, res: Response) => {
  const { messages, context } = req.body as {
    messages: { role: string; content: string }[];
    context?: string;
  };

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'system',
            content: `You are a helpful AI vacation planning assistant. ${context ? `Current trip context: ${context}` : ''}`,
          },
          ...messages,
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Vacation Planner',
        },
      }
    );

    return res.json({ message: response.data.choices?.[0]?.message?.content ?? '' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

// POST /api/ai/packing-list — categorized packing checklist for a trip.
// Weather-aware when the trip is inside the forecast window; deterministic
// fallback whenever OpenRouter is unavailable, so the button always works.
router.post('/packing-list', async (req: Request, res: Response) => {
  const { destination, start_date, end_date, trip_type, activities } = req.body as {
    destination?: string;
    start_date?: string;
    end_date?: string;
    trip_type?: string;
    activities?: string[];
  };

  if (!destination) {
    return res.status(400).json({ error: 'Missing required field: destination.' });
  }

  let weather: WeatherDay[] = [];
  if (start_date && end_date) {
    weather = await getWeather(destination, start_date, end_date);
  }

  const nights =
    start_date && end_date
      ? Math.max(1, Math.round((new Date(end_date).getTime() - new Date(start_date).getTime()) / 86400000))
      : 5;

  try {
    const weatherSummary = weather.length
      ? weather
          .map((d) => `${d.date}: ${d.temp_min_c}–${d.temp_max_c}°C, ${d.precipitation_probability}% rain chance`)
          .join('\n')
      : 'No forecast available (trip may be beyond the 16-day forecast window).';

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: process.env.OPENROUTER_CLASSIFIER_MODEL ?? 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'system',
            content:
              'You create practical packing lists. Respond ONLY with a JSON object: {"categories": [{"name": string, "items": string[]}]}. 4-7 categories, 3-8 concise items each. Tailor to the destination, season, weather and trip style. No commentary.',
          },
          {
            role: 'user',
            content: `Packing list for a ${nights}-night ${trip_type ?? 'leisure'} trip to ${destination} (${start_date ?? '?'} to ${end_date ?? '?'}).
Planned activities: ${activities?.length ? activities.slice(0, 15).join(', ') : 'not specified'}.
Weather forecast:
${weatherSummary}`,
          },
        ],
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Vacation Planner',
        },
        timeout: 30_000,
      }
    );

    const content: string = response.data.choices?.[0]?.message?.content ?? '';
    // Some models fence the JSON in ```json blocks despite response_format.
    const stripped = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(stripped) as { categories?: { name?: string; items?: string[] }[] };
    const categories = (parsed.categories ?? [])
      .filter((c) => c?.name && Array.isArray(c.items) && c.items.length)
      .map((c) => ({ name: String(c.name), items: c.items!.map(String) }));

    if (!categories.length) throw new Error('Empty packing list from model');
    const list: PackingList = { categories, generated_by: 'ai' };
    return res.json(list);
  } catch (err: unknown) {
    console.error('[ai/packing-list] falling back:', err instanceof Error ? err.message : err);
    return res.json(fallbackPackingList(weather));
  }
});

function fallbackPackingList(weather: WeatherDay[]): PackingList {
  const maxTemp = weather.length ? Math.max(...weather.map((d) => d.temp_max_c)) : null;
  const minTemp = weather.length ? Math.min(...weather.map((d) => d.temp_min_c)) : null;
  const rainy = weather.some((d) => d.precipitation_probability >= 40);

  const clothing = ['Underwear & socks', 'T-shirts / tops', 'Comfortable walking shoes', 'Sleepwear'];
  if (maxTemp !== null && maxTemp >= 24) clothing.push('Shorts / light clothing', 'Swimwear', 'Sun hat');
  if (minTemp !== null && minTemp <= 10) clothing.push('Warm jacket', 'Sweater / layers');
  if (rainy) clothing.push('Rain jacket or compact umbrella');

  return {
    categories: [
      { name: 'Documents', items: ['Passport / ID', 'Booking confirmations', 'Travel insurance', 'Payment cards'] },
      { name: 'Clothing', items: clothing },
      { name: 'Toiletries', items: ['Toothbrush & toothpaste', 'Deodorant', 'Sunscreen', 'Medication'] },
      { name: 'Electronics', items: ['Phone & charger', 'Power adapter', 'Power bank', 'Headphones'] },
      { name: 'Extras', items: ['Reusable water bottle', 'Day bag', 'Snacks for transit'] },
    ],
    generated_by: 'fallback',
  };
}

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export default router;

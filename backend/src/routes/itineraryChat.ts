import { Router, Request, Response } from 'express';
import axios from 'axios';
import { scrapeAllWithMeta } from '../scrapers/orchestrator';
import type {
  SearchParams,
  HotelResult,
  ActivityResult,
  RestaurantResult,
  FlightResult,
  ItineraryDay,
  TripItinerary,
} from '../../../shared/types';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/ai/itinerary-chat — conversational itinerary builder.
//
// Talk to it like a chatbot: "3 days in Barcelona, I love food and
// architecture" or just "kayaking in Vancouver". The LLM extracts the city,
// trip length, optional origin, and interests; we pull REAL listings for that
// city via the search orchestrator; then the LLM composes a day-by-day plan
// choosing only from those real listings (by id) so every item links back to
// something bookable. A single, unspecific request defaults to a one-day plan.
// ---------------------------------------------------------------------------

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface ChatMessage {
  role: string;
  content: string;
}

async function callOpenRouter(messages: ChatMessage[], model: string, jsonMode: boolean): Promise<string> {
  const res = await axios.post(
    OPENROUTER_URL,
    {
      model,
      messages,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Vacation Planner',
      },
      timeout: 45_000,
    }
  );
  return res.data.choices?.[0]?.message?.content ?? '';
}

/** Some models fence JSON despite response_format — strip it before parsing. */
function parseJson<T>(raw: string): T | null {
  const stripped = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Step 1 — intent extraction
// ---------------------------------------------------------------------------

interface Intent {
  destination: string | null;
  origin: string | null;
  days: number | null;
  interests: string[];
}

async function extractIntent(message: string, history: ChatMessage[], model: string): Promise<Intent> {
  const system =
    'Extract trip intent from the conversation. Respond ONLY with JSON: ' +
    '{"destination": string|null (the city to visit), "origin": string|null (departure city ONLY if the user wants flights), ' +
    '"days": number|null (explicit trip length in days if stated, else null), "interests": string[] (activities/vibes mentioned)}. ' +
    'If no city is present anywhere in the conversation, destination must be null.';

  // Keep a little history so "make it 3 days" after a city works.
  const convo = [...history.slice(-6), { role: 'user', content: message }]
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const raw = await callOpenRouter(
    [
      { role: 'system', content: system },
      { role: 'user', content: convo },
    ],
    model,
    true
  );
  const parsed = parseJson<Intent>(raw);
  return {
    destination: parsed?.destination?.trim() || null,
    origin: parsed?.origin?.trim() || null,
    days: typeof parsed?.days === 'number' && parsed.days > 0 ? Math.min(14, Math.round(parsed.days)) : null,
    interests: Array.isArray(parsed?.interests) ? parsed!.interests.map(String).slice(0, 8) : [],
  };
}

// ---------------------------------------------------------------------------
// Step 3 — itinerary composition from real listings
// ---------------------------------------------------------------------------

interface PlanDay {
  day: number;
  title: string;
  hotelId: string | null;
  activityIds: string[];
  restaurantIds: string[];
}
interface PlanResult {
  summary: string;
  days: PlanDay[];
  flightId: string | null;
}

const RESTAURANT_COST_PER_LEVEL = 20;

function estimateDayCost(hotel: HotelResult | undefined, activities: ActivityResult[], meals: RestaurantResult[]): number {
  let cost = hotel?.price_per_night ?? 0;
  for (const a of activities) cost += a.price || 0;
  for (const m of meals) cost += Math.max(m.price_level, 1) * RESTAURANT_COST_PER_LEVEL;
  return Math.round(cost);
}

router.post('/', async (req: Request, res: Response) => {
  const { message, history, model } = req.body as {
    message?: string;
    history?: ChatMessage[];
    model?: string;
  };

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Missing required field: message.' });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: 'The AI planner is not configured (missing OPENROUTER_API_KEY).' });
  }

  const chatModel = model || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
  const classifierModel = process.env.OPENROUTER_CLASSIFIER_MODEL || chatModel;

  try {
    const intent = await extractIntent(message, history ?? [], classifierModel);

    if (!intent.destination) {
      return res.json({
        reply:
          "Which city would you like to explore? Tell me the city and the kind of things you enjoy — food, museums, hiking, nightlife — and I'll build an itinerary from real, bookable options.",
        needsMore: true,
      });
    }

    // A single, unspecific ask → a one-day plan.
    const days = intent.days ?? 1;

    // Near-future window; hotels need dates, activities don't really.
    const checkin = new Date();
    checkin.setDate(checkin.getDate() + 21);
    const checkout = new Date(checkin);
    checkout.setDate(checkout.getDate() + days);

    const params: SearchParams = {
      destination: intent.destination,
      checkin: isoDate(checkin),
      checkout: isoDate(checkout),
      adults: 2,
      ...(intent.origin ? { origin: intent.origin } : {}),
    };

    const data = await scrapeAllWithMeta(params);

    if (!data.activities.length && !data.hotels.length && !data.restaurants.length) {
      return res.json({
        reply: `I couldn't pull live options for ${intent.destination} right now. Try another city, or ask again in a moment.`,
        needsMore: true,
      });
    }

    // Compact lists for the prompt — full objects are re-joined by id afterward.
    const activities = data.activities.slice(0, 30);
    const restaurants = data.restaurants.slice(0, 20);
    const hotels = data.hotels.slice(0, 12);
    const flights = data.flights.slice(0, 8);

    const system =
      `You are an expert local trip planner. Build a ${days}-day itinerary for ${intent.destination} using ONLY the provided real listings. ` +
      `Choose items that match the traveler's interests (${intent.interests.join(', ') || 'a well-rounded first visit'}) or are closely related. ` +
      `Each day: pick 2-4 activities and 1-2 restaurants; recommend one hotel to stay at (same hotel across days is fine). ` +
      (flights.length ? `Also pick one outbound flight by id. ` : '') +
      `Reference every item by its EXACT id from the lists — never invent ids or places. ` +
      `Respond ONLY with JSON: {"summary": string (2-3 friendly sentences), "days": [{"day": number, "title": string, "hotelId": string|null, "activityIds": string[], "restaurantIds": string[]}], "flightId": string|null}.`;

    const userPayload = {
      destination: intent.destination,
      days,
      interests: intent.interests,
      hotels: hotels.map((h) => ({ id: h.id, name: h.name, price_per_night: h.price_per_night, rating: h.rating, source: h.source })),
      activities: activities.map((a) => ({ id: a.id, name: a.name, category: a.category, price: a.price, rating: a.rating })),
      restaurants: restaurants.map((r) => ({ id: r.id, name: r.name, cuisine: r.cuisine, price_level: r.price_level, rating: r.rating })),
      flights: flights.map((f) => ({ id: f.id, airline: f.airline, price: f.price, stops: f.stops })),
    };

    const raw = await callOpenRouter(
      [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      chatModel,
      true
    );
    const plan = parseJson<PlanResult>(raw);
    if (!plan || !Array.isArray(plan.days) || !plan.days.length) {
      return res.json({
        reply: `I found options for ${intent.destination} but couldn't assemble a plan just now. Try rephrasing, e.g. "2 days in ${intent.destination} — food and history".`,
        needsMore: true,
      });
    }

    // Re-join the model's chosen ids to the REAL objects, so every item links
    // back to a real listing (invented ids are dropped).
    const hotelById = new Map(data.hotels.map((h) => [h.id, h]));
    const activityById = new Map(data.activities.map((a) => [a.id, a]));
    const restaurantById = new Map(data.restaurants.map((r) => [r.id, r]));
    const flightById = new Map(data.flights.map((f) => [f.id, f]));

    const itineraryDays: ItineraryDay[] = plan.days.slice(0, days).map((d, i) => {
      const hotel = d.hotelId ? hotelById.get(d.hotelId) : undefined;
      const dayActivities = (d.activityIds ?? []).map((id) => activityById.get(id)).filter((a): a is ActivityResult => Boolean(a));
      const meals = (d.restaurantIds ?? []).map((id) => restaurantById.get(id)).filter((r): r is RestaurantResult => Boolean(r));
      const date = isoDate(new Date(checkin.getTime() + i * 86400000));
      return {
        day: i + 1,
        date,
        hotel,
        activities: dayActivities,
        meals,
        estimated_cost: estimateDayCost(hotel, dayActivities, meals),
      };
    });

    const flight: FlightResult | undefined = plan.flightId ? flightById.get(plan.flightId) : undefined;
    const total_cost = itineraryDays.reduce((sum, d) => sum + d.estimated_cost, 0) + (flight?.price ?? 0);

    const itinerary: TripItinerary = {
      id: '',
      name: `${intent.destination} — ${days}-day ${intent.interests[0] ?? 'trip'}`.trim(),
      destination: intent.destination,
      days: itineraryDays,
      total_cost,
      trip_type: intent.interests[0] ?? 'leisure',
      ...(flight ? { flight } : {}),
    };

    return res.json({ reply: plan.summary || `Here's a ${days}-day plan for ${intent.destination}.`, itinerary });
  } catch (err: unknown) {
    // OpenRouter 402 (out of credits) / 401 (bad key) shouldn't read as a crash —
    // guide the user to a lighter model instead.
    if (axios.isAxiosError(err) && (err.response?.status === 402 || err.response?.status === 401)) {
      return res.json({
        reply:
          "The selected AI model isn't available on this OpenRouter account right now (it needs more credits). Pick a lighter model — Claude Haiku works well — and try again.",
        needsMore: true,
      });
    }
    const messageText = err instanceof Error ? err.message : String(err);
    console.error('[ai/itinerary-chat] failed:', messageText);
    return res.status(500).json({ error: messageText });
  }
});

export default router;

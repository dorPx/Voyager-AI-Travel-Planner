import { randomUUID } from 'crypto';
import { db } from '../db';
import type {
  TripItinerary,
  ItineraryDay,
  HotelResult,
  ActivityResult,
  RestaurantResult,
  TripSummary,
} from '../../../shared/types';

export type { TripSummary };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TripRow {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget_usd: number;
  trip_type: string;
  itinerary_json: string;
  created_at: string;
  share_id: string | null;
}

// ---------------------------------------------------------------------------
// Colors / brand palette for PDF export
// ---------------------------------------------------------------------------

const COLORS = {
  lightBlue: '#B5D4F4',
  beige: '#F5F0E8',
  black: '#1a1a1a',
  green: '#2f6e3f',
  greenBg: '#e3f3e6',
};

class ItineraryService {
  // -------------------------------------------------------------------------
  // SQLite operations
  // -------------------------------------------------------------------------

  saveTrip(trip: TripItinerary): string {
    const id = trip.id || randomUUID();
    const saved: TripItinerary = { ...trip, id };

    const startDate = saved.days[0]?.date ?? '';
    const endDate = saved.days[saved.days.length - 1]?.date ?? '';

    db.prepare(`
      INSERT INTO trips (id, name, destination, start_date, end_date, budget_usd, trip_type, itinerary_json, created_at, share_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      saved.name ?? `${saved.destination} Trip`,
      saved.destination,
      startDate,
      endDate,
      saved.total_cost ?? 0,
      saved.trip_type ?? 'leisure',
      JSON.stringify(saved),
      new Date().toISOString(),
      randomUUID()
    );

    return id;
  }

  getTrip(id: string): TripItinerary | null {
    const row = this.getTripRow(id);
    return row ? this.rowToItinerary(row) : null;
  }

  /** Read-only lookup by public share token. */
  getTripByShareId(shareId: string): TripItinerary | null {
    const row = db.prepare('SELECT * FROM trips WHERE share_id = ?').get(shareId) as TripRow | undefined;
    return row ? this.rowToItinerary(row) : null;
  }

  private rowToItinerary(row: TripRow): TripItinerary | null {
    try {
      const trip = JSON.parse(row.itinerary_json) as TripItinerary;
      // share_id lives on the row, not in the stored JSON — surface it so the
      // frontend can build share links without a second endpoint.
      if (row.share_id) trip.share_id = row.share_id;
      return trip;
    } catch {
      return null;
    }
  }

  private getTripRow(id: string): TripRow | null {
    const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(id) as TripRow | undefined;
    return row ?? null;
  }

  listTrips(): TripSummary[] {
    return db
      .prepare(
        'SELECT id, name, destination, start_date, end_date, trip_type, created_at FROM trips ORDER BY created_at DESC'
      )
      .all() as TripSummary[];
  }

  deleteTrip(id: string): boolean {
    const result = db.prepare('DELETE FROM trips WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // -------------------------------------------------------------------------
  // JSON export
  // -------------------------------------------------------------------------

  exportToJSON(id: string): string {
    const trip = this.getTrip(id);
    if (!trip) throw new Error('Trip not found');
    return JSON.stringify(trip, null, 2);
  }

  // -------------------------------------------------------------------------
  // ICS (iCalendar) export — one all-day event per trip day, importable into
  // Google/Apple/Outlook calendars. Hand-rolled (RFC 5545 is tiny at this
  // scale): CRLF line endings, 75-octet folding, escaped text.
  // -------------------------------------------------------------------------

  exportToICS(id: string): string {
    const trip = this.getTrip(id);
    if (!trip) throw new Error('Trip not found');

    const events = trip.days
      .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
      .map((day) => this.dayToVevent(trip, day));

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Voyager//AI Vacation Planner//EN',
      'CALSCALE:GREGORIAN',
      ...events.flat(),
      'END:VCALENDAR',
    ];

    return lines.map((l) => this.foldIcsLine(l)).join('\r\n') + '\r\n';
  }

  private dayToVevent(trip: TripItinerary, day: ItineraryDay): string[] {
    const date = day.date.replace(/-/g, '');
    // All-day events end on the following day per RFC 5545 (DTEND exclusive).
    const next = new Date(day.date);
    next.setUTCDate(next.getUTCDate() + 1);
    const dateEnd = next.toISOString().slice(0, 10).replace(/-/g, '');

    const parts: string[] = [];
    if (day.hotel) parts.push(`Hotel: ${day.hotel.name}`);
    if (day.activities.length) parts.push(`Activities: ${day.activities.map((a) => a.name).join(', ')}`);
    if (day.meals.length) parts.push(`Meals: ${day.meals.map((m) => m.name).join(', ')}`);
    parts.push(`Estimated cost: $${day.estimated_cost.toLocaleString()}`);

    return [
      'BEGIN:VEVENT',
      `UID:${trip.id}-day${day.day}@voyager`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${dateEnd}`,
      `SUMMARY:${this.escapeIcsText(`${trip.name} — Day ${day.day}`)}`,
      `LOCATION:${this.escapeIcsText(trip.destination)}`,
      `DESCRIPTION:${this.escapeIcsText(parts.join('\n'))}`,
      'END:VEVENT',
    ];
  }

  private escapeIcsText(text: string): string {
    return String(text ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  private foldIcsLine(line: string): string {
    // RFC 5545 3.1: lines over 75 octets fold with CRLF + single space.
    // Splitting on UTF-16 units at 74 chars stays safely under 75 octets for
    // the ASCII-dominant content here and never splits a surrogate pair thanks
    // to Array.from's code-point iteration.
    const chars = Array.from(line);
    if (chars.length <= 74) return line;
    const chunks: string[] = [];
    for (let i = 0; i < chars.length; i += 74) {
      chunks.push(chars.slice(i, i + 74).join(''));
    }
    return chunks.join('\r\n ');
  }

  // -------------------------------------------------------------------------
  // PDF export
  // -------------------------------------------------------------------------

  async exportToPDF(id: string): Promise<Buffer> {
    const row = this.getTripRow(id);
    if (!row) throw new Error('Trip not found');

    const trip: TripItinerary = JSON.parse(row.itinerary_json);
    const html = this.buildHtml(trip, row.budget_usd);

    return this.renderPdf(html);
  }

  // -------------------------------------------------------------------------
  // HTML builder
  // -------------------------------------------------------------------------

  private bestValueId(
    hotel?: HotelResult,
    activities: ActivityResult[] = [],
    restaurants: RestaurantResult[] = []
  ): string | null {
    // Heuristic: highest rating-per-dollar among everything priced in the day.
    type Candidate = { id: string; score: number };
    const candidates: Candidate[] = [];

    if (hotel && hotel.price_per_night > 0) {
      candidates.push({ id: hotel.id, score: hotel.rating / hotel.price_per_night });
    }
    for (const a of activities) {
      if (a.price > 0) candidates.push({ id: a.id, score: a.rating / a.price });
    }
    for (const r of restaurants) {
      const proxyPrice = Math.max(r.price_level, 1) * 20;
      candidates.push({ id: r.id, score: r.rating / proxyPrice });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].id;
  }

  private renderDay(day: ItineraryDay): string {
    const bestId = this.bestValueId(day.hotel, day.activities, day.meals);

    const hotelBlock = day.hotel
      ? `<div class="card ${day.hotel.id === bestId ? 'best-value' : ''}">
          <div class="card-title">🏨 ${this.escape(day.hotel.name)}${day.hotel.id === bestId ? ' <span class="badge">BEST VALUE</span>' : ''}</div>
          <div class="card-meta">$${day.hotel.price_per_night.toFixed(0)}/night · ${day.hotel.rating.toFixed(1)}★ · ${this.escape(day.hotel.source)}</div>
        </div>`
      : '';

    const activitiesBlock = day.activities.length
      ? `<div class="block">
          <div class="block-label">Activities</div>
          ${day.activities
            .map(
              (a) => `<div class="card ${a.id === bestId ? 'best-value' : ''}">
                <div class="card-title">${this.escape(a.name)}${a.id === bestId ? ' <span class="badge">BEST VALUE</span>' : ''}</div>
                <div class="card-meta">${this.escape(a.category)} · ${a.duration_hours}h${a.price ? ` · $${a.price.toFixed(0)}` : ' · Free'} · ${a.rating.toFixed(1)}★</div>
              </div>`
            )
            .join('')}
        </div>`
      : '';

    const mealsBlock = day.meals.length
      ? `<div class="block">
          <div class="block-label">Restaurants</div>
          ${day.meals
            .map(
              (m) => `<div class="card ${m.id === bestId ? 'best-value' : ''}">
                <div class="card-title">${this.escape(m.name)}${m.id === bestId ? ' <span class="badge">BEST VALUE</span>' : ''}</div>
                <div class="card-meta">${this.escape(m.cuisine)} · ${'$'.repeat(Math.max(m.price_level, 1))} · ${m.rating.toFixed(1)}★</div>
              </div>`
            )
            .join('')}
        </div>`
      : '';

    return `
      <section class="day">
        <div class="day-header">
          <span>Day ${day.day} — ${this.escape(day.date)}</span>
          <span class="day-cost">$${day.estimated_cost.toLocaleString()}</span>
        </div>
        <div class="day-body">
          ${hotelBlock}
          ${activitiesBlock}
          ${mealsBlock}
        </div>
      </section>`;
  }

  private escape(text: string): string {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private buildHtml(trip: TripItinerary, budgetUsd: number): string {
    const dateRange =
      trip.days.length > 0 ? `${trip.days[0].date} → ${trip.days[trip.days.length - 1].date}` : '';

    const daysHtml = trip.days.map((d) => this.renderDay(d)).join('\n');

    const diff = budgetUsd - trip.total_cost;
    const diffLabel = diff >= 0 ? `$${diff.toLocaleString()} under budget` : `$${Math.abs(diff).toLocaleString()} over budget`;
    const diffClass = diff >= 0 ? 'under' : 'over';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: ${COLORS.black};
    margin: 0;
    background: ${COLORS.beige};
  }
  .banner {
    background: ${COLORS.lightBlue};
    padding: 36px 40px;
    border-bottom: 4px solid ${COLORS.black};
  }
  .banner h1 {
    margin: 0 0 6px 0;
    font-size: 32px;
    letter-spacing: -0.5px;
  }
  .banner .meta {
    font-size: 14px;
    opacity: 0.85;
  }
  .content {
    padding: 28px 40px 10px 40px;
  }
  .day {
    background: #ffffff;
    border: 1px solid #ddd5c5;
    border-radius: 10px;
    margin-bottom: 18px;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .day-header {
    background: ${COLORS.black};
    color: #fff;
    padding: 10px 16px;
    display: flex;
    justify-content: space-between;
    font-size: 15px;
    font-weight: 600;
  }
  .day-body {
    padding: 14px 16px;
  }
  .block { margin-top: 10px; }
  .block-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b6b6b;
    margin-bottom: 6px;
  }
  .card {
    background: ${COLORS.beige};
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 6px;
  }
  .card.best-value {
    background: ${COLORS.greenBg};
    border: 1px solid ${COLORS.green};
  }
  .card-title {
    font-weight: 600;
    font-size: 13px;
  }
  .card-meta {
    font-size: 11px;
    color: #555;
    margin-top: 2px;
  }
  .badge {
    display: inline-block;
    background: ${COLORS.green};
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 4px;
    vertical-align: middle;
  }
  .footer {
    background: ${COLORS.lightBlue};
    border-top: 4px solid ${COLORS.black};
    padding: 24px 40px;
    margin-top: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer .totals { font-size: 14px; }
  .footer .totals strong { font-size: 18px; }
  .footer .diff {
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 20px;
  }
  .footer .diff.under { background: ${COLORS.greenBg}; color: ${COLORS.green}; }
  .footer .diff.over { background: #fbe1e1; color: #8a2c2c; }
</style>
</head>
<body>
  <div class="banner">
    <h1>${this.escape(trip.name)}</h1>
    <div class="meta">${this.escape(trip.destination)} · ${this.escape(trip.trip_type)} · ${this.escape(dateRange)}</div>
  </div>

  <div class="content">
    ${daysHtml}
  </div>

  <div class="footer">
    <div class="totals">
      Budget: <strong>$${budgetUsd.toLocaleString()}</strong> &nbsp;|&nbsp; Actual: <strong>$${trip.total_cost.toLocaleString()}</strong>
    </div>
    <div class="diff ${diffClass}">${diffLabel}</div>
  </div>
</body>
</html>`;
  }

  // -------------------------------------------------------------------------
  // PDF rendering
  // -------------------------------------------------------------------------

  private async renderPdf(html: string): Promise<Buffer> {
    const puppeteer = await import('puppeteer-core');
    const chromium = (await import('@sparticuz/chromium')).default;

    // @sparticuz/chromium ships a Linux/Lambda binary — on local dev (macOS/Windows)
    // fall back to a locally installed Chrome unless PUPPETEER_EXECUTABLE_PATH is set.
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!executablePath) {
      executablePath =
        process.platform === 'linux'
          ? await chromium.executablePath()
          : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: process.platform === 'linux' ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}

export const itineraryService = new ItineraryService();
export default itineraryService;

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PackingList, TripItinerary } from '../../shared/types';

// AI-generated packing checklist for a saved trip. Checked state persists in
// localStorage per trip; the list itself is cached there too so reopening the
// panel doesn't re-bill the model.

function storageKey(tripId: string) {
  return `voyager:packing:${tripId}`;
}

interface Stored {
  list: PackingList;
  checked: string[];
}

function readStored(tripId: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(storageKey(tripId));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function writeStored(tripId: string, data: Stored) {
  try {
    window.localStorage.setItem(storageKey(tripId), JSON.stringify(data));
  } catch {
    /* best-effort */
  }
}

export default function PackingListPanel({ trip }: { trip: TripItinerary }) {
  const [list, setList] = useState<PackingList | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = readStored(trip.id);
    if (stored) {
      setList(stored.list);
      setChecked(new Set(stored.checked));
    }
  }, [trip.id]);

  async function generate() {
    setLoading(true);
    try {
      const result = await api.packingList({
        destination: trip.destination,
        start_date: trip.days[0]?.date,
        end_date: trip.days[trip.days.length - 1]?.date,
        trip_type: trip.trip_type,
        activities: trip.days.flatMap((d) => d.activities.map((a) => a.name)),
      });
      setList(result);
      setChecked(new Set());
      writeStored(trip.id, { list: result, checked: [] });
    } catch {
      // api.packingList only rejects on network/5xx — the endpoint itself
      // falls back to a deterministic list.
      setList(null);
    } finally {
      setLoading(false);
    }
  }

  function toggle(item: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      if (list) writeStored(trip.id, { list, checked: [...next] });
      return next;
    });
  }

  const total = list?.categories.reduce((n, c) => n + c.items.length, 0) ?? 0;

  return (
    <div className="bg-white border border-beige-300 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-brand-black">Packing list</h3>
          {list && (
            <p className="text-xs text-brand-mid">
              {checked.size}/{total} packed
              {list.generated_by === 'fallback' && ' · general checklist (AI unavailable)'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="bg-sky-400 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          {loading ? 'Generating…' : list ? 'Regenerate' : 'Generate packing list'}
        </button>
      </div>

      {!list && !loading && (
        <p className="text-xs text-brand-mid">
          A checklist tailored to {trip.destination}, your dates, the weather and your planned activities.
        </p>
      )}

      {list && (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {list.categories.map((cat) => (
            <div key={cat.name}>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-mid mb-1.5">{cat.name}</p>
              <ul className="space-y-1">
                {cat.items.map((item) => {
                  const key = `${cat.name}:${item}`;
                  const done = checked.has(key);
                  return (
                    <li key={key}>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggle(key)}
                          className="accent-current text-sky-400"
                        />
                        <span className={done ? 'text-brand-mid line-through' : 'text-brand-dark'}>{item}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

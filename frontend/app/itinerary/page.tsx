'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { TripItinerary } from '../../../shared/types';
import ItineraryView from '@/components/ItineraryView';
import ToastViewport from '@/components/results/ToastViewport';
import { showToast } from '@/components/results/toast';
import { useModel } from '@/context/ModelContext';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  itinerary?: TripItinerary;
}

const SUGGESTIONS = [
  '3 days in Kyoto — temples, food, and gardens',
  'A day of street food and markets in Bangkok',
  'Kayaking and coffee in Vancouver',
  'Barcelona for architecture and nightlife',
];

const GREETING =
  "Tell me a city and what you're into — food, museums, hiking, nightlife — and I'll build a day-by-day itinerary from real, bookable listings. Just want one thing? I'll plan a single day around it.";

/** Save bar shown under a generated itinerary. */
function SaveBar({ itinerary }: { itinerary: TripItinerary }) {
  const [saved, setSaved] = useState<TripItinerary | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { id: _drop, ...rest } = itinerary;
      const result = await api.itinerary.save(rest);
      setSaved(result);
      showToast('Trip saved!');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not save trip.');
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    if (!saved?.share_id) return;
    const link = `${window.location.origin}/share/${saved.share_id}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Read-only link copied');
    } catch {
      showToast(link);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {saved ? (
        <>
          <Link
            href={`/trips/${saved.id}`}
            className="bg-sky-400 hover:bg-sky-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Open saved trip →
          </Link>
          <button
            type="button"
            onClick={handleShare}
            className="text-sm font-medium text-brand-black border border-beige-300 bg-white hover:bg-beige-100 px-4 py-2 rounded-lg transition-colors"
          >
            Share
          </button>
          <a
            href={api.itinerary.exportIcsUrl(saved.id)}
            className="text-sm font-medium text-brand-black border border-beige-300 bg-white hover:bg-beige-100 px-4 py-2 rounded-lg transition-colors"
          >
            Add to calendar
          </a>
        </>
      ) : (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-sky-400 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save this trip'}
        </button>
      )}
    </div>
  );
}

export default function ItineraryPage() {
  const { selectedModel } = useModel();
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const priorHistory = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.itineraryChat({ message: trimmed, history: priorHistory, model: selectedModel });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, itinerary: res.itinerary }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry — ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  const showSuggestions = messages.length === 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col h-[calc(100vh-140px)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-brand-black">Plan with AI</h1>
        <p className="text-sm text-brand-mid">Describe your trip in a sentence — the AI builds it from real listings.</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user' ? 'bg-sky-400 text-white' : 'bg-white border border-beige-300 text-brand-dark'
                }`}
              >
                {m.content}
              </div>
            </div>
            {m.itinerary && (
              <div className="mt-3">
                <ItineraryView itinerary={m.itinerary} />
                <SaveBar itinerary={m.itinerary} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-beige-300 rounded-2xl px-4 py-2.5 text-sm text-brand-mid animate-pulse">
              Planning your trip from live listings…
            </div>
          </div>
        )}

        {showSuggestions && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="text-xs font-medium text-brand-black bg-white border border-beige-300 hover:border-sky-300 hover:text-sky-500 px-3 py-1.5 rounded-full transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-beige-300 pt-3 mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(input)}
          placeholder="e.g. 2 days in Lisbon — seafood and viewpoints"
          className="flex-1 border border-beige-300 bg-white rounded-lg px-3 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-sky-300"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="bg-sky-400 hover:bg-sky-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        >
          Send
        </button>
      </div>

      <ToastViewport />
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import AIPanel from '@/components/itinerary/AIPanel';
import DayBuilder from '@/components/itinerary/DayBuilder';
import ToastViewport from '@/components/results/ToastViewport';
import { showToast } from '@/components/results/toast';
import { toTripItinerary, type DayBuilderDay } from '@/components/itinerary/utils';
import { useWeather } from '@/components/WeatherStrip';
import ErrorBoundary from '@/components/ErrorBoundary';
import type { WeatherDay } from '../../../shared/types';

export default function ItineraryPage() {
  const [tripName, setTripName] = useState('My Trip');
  const [destination, setDestination] = useState('');
  const [tripType, setTripType] = useState('leisure');
  const [days, setDays] = useState<DayBuilderDay[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [budget, setBudget] = useState(2000);

  // Forecast for the builder's date range — one fetch, mapped per date for
  // the day headers. Renders nothing when dates are unset or unforecastable.
  const firstDate = days.find((d) => d.date)?.date;
  const lastDate = [...days].reverse().find((d) => d.date)?.date;
  const weatherDays = useWeather(destination || undefined, firstDate, lastDate);
  const weatherByDate = useMemo(() => {
    const map: Record<string, WeatherDay> = {};
    for (const w of weatherDays) map[w.date] = w;
    return map;
  }, [weatherDays]);

  function handleAdopt({
    destination: dest,
    tripType: type,
    days: seededDays,
  }: {
    destination: string;
    tripType: string;
    days: DayBuilderDay[];
  }) {
    setDestination(dest);
    setTripType(type);
    setTripName(`${dest} Trip`);
    setDays(seededDays);
    setSavedId(null);
    setShareId(null);
    showToast(`Adopted a ${seededDays.length}-day plan for ${dest}`);
  }

  function handleDaysChange(next: DayBuilderDay[]) {
    setDays(next);
    setSavedId(null);
    setShareId(null);
  }

  async function handleSave() {
    if (!destination) {
      showToast('Add a destination before saving.');
      return;
    }
    if (days.length === 0) {
      showToast('Add at least one day before saving.');
      return;
    }

    setSaving(true);
    try {
      const itinerary = toTripItinerary(days, destination, tripType, tripName);
      const saved = await api.itinerary.save(itinerary);
      setSavedId(saved.id);
      setShareId(saved.share_id ?? null);
      showToast('Saved!');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not save itinerary.');
    } finally {
      setSaving(false);
    }
  }

  function handleExportPdf() {
    if (!savedId) return;
    window.open(api.itinerary.exportPdfUrl(savedId), '_blank', 'noopener,noreferrer');
  }

  function downloadUrl(href: string) {
    const a = document.createElement('a');
    a.href = href;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleExportJson() {
    if (!savedId) return;
    downloadUrl(api.itinerary.exportJsonUrl(savedId));
  }

  function handleExportIcs() {
    if (!savedId) return;
    downloadUrl(api.itinerary.exportIcsUrl(savedId));
  }

  async function handleShare() {
    if (!shareId) return;
    const link = `${window.location.origin}/share/${shareId}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Read-only link copied to clipboard');
    } catch {
      showToast(link);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <input
          value={tripName}
          onChange={(e) => {
            setTripName(e.target.value);
            setSavedId(null);
          }}
          className="text-2xl font-bold text-brand-black bg-transparent border-b border-transparent hover:border-beige-300 focus:border-sky-300 focus:outline-none px-1"
        />
        {destination && <p className="text-sm text-brand-mid mt-1">{destination}</p>}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-2/3 w-full">
          {days.length === 0 ? (
            <div className="bg-white border border-dashed border-beige-300 rounded-xl p-10 text-center text-sm text-brand-mid">
              Start by adding a day below, or use the AI Planner on the right to generate a starting plan.
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setDays([{ day: 1, date: '', morning: [], afternoon: [], evening: [] }])}
                  className="bg-sky-300 hover:bg-sky-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  + Add day 1
                </button>
              </div>
            </div>
          ) : (
            <DayBuilder
              days={days}
              onChange={handleDaysChange}
              destination={destination}
              onSave={handleSave}
              saving={saving}
              savedId={savedId}
              onExportPdf={handleExportPdf}
              onExportJson={handleExportJson}
              onExportIcs={handleExportIcs}
              onShare={handleShare}
              canShare={Boolean(shareId)}
              budget={budget}
              onBudgetChange={setBudget}
              weatherByDate={weatherByDate}
            />
          )}
        </div>

        <div className="lg:w-1/3 w-full lg:sticky lg:top-20 lg:self-start">
          <ErrorBoundary label="AIPanel">
            <AIPanel onAdopt={handleAdopt} />
          </ErrorBoundary>
        </div>
      </div>

      <ToastViewport />
    </div>
  );
}

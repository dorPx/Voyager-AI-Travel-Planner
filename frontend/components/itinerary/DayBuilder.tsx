'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  TIME_SLOTS,
  dayCost,
  tripCost,
  emptyDay,
  addDays,
  dayItemsInOrder,
  transitHint,
  type DayBuilderDay,
  type TimeSlot,
  type TimeSlotItem,
} from './utils';
import { priceLevelLabel } from '@/components/results/shared';
import { useCurrency } from '@/context/CurrencyContext';
import { weatherGlyph } from '@/components/WeatherStrip';
import type { WeatherDay } from '../../../shared/types';
import ItemPickerModal from './ItemPickerModal';

interface DayBuilderProps {
  days: DayBuilderDay[];
  onChange: (days: DayBuilderDay[]) => void;
  destination: string;
  onSave: () => void;
  saving: boolean;
  savedId: string | null;
  onExportPdf: () => void;
  onExportJson: () => void;
  onExportIcs: () => void;
  onShare: () => void;
  canShare: boolean;
  budget: number;
  onBudgetChange: (budget: number) => void;
  /** Forecast per ISO date — day headers show a chip when their date has one. */
  weatherByDate?: Record<string, WeatherDay>;
}

interface DragRef {
  dayIndex: number;
  slot: TimeSlot;
  index: number;
}

const SLOT_LABELS: Record<TimeSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

function describeSlotItem(slotItem: TimeSlotItem): { label: string; price: string } {
  if (slotItem.kind === 'hotel') {
    return { label: `🏨 ${slotItem.item.name}`, price: `$${slotItem.item.price_per_night.toFixed(0)}/night` };
  }
  if (slotItem.kind === 'activity') {
    return { label: slotItem.item.name, price: slotItem.item.price > 0 ? `$${slotItem.item.price.toFixed(0)}` : 'Free' };
  }
  return { label: slotItem.item.name, price: priceLevelLabel(slotItem.item.price_level) };
}

export default function DayBuilder({
  days,
  onChange,
  destination,
  onSave,
  saving,
  savedId,
  onExportPdf,
  onExportJson,
  onExportIcs,
  onShare,
  canShare,
  budget,
  onBudgetChange,
  weatherByDate,
}: DayBuilderProps) {
  const [pickerTarget, setPickerTarget] = useState<{ dayIndex: number; slot: TimeSlot } | null>(null);
  const dragRef = useRef<DragRef | null>(null);
  const { format } = useCurrency();

  function addDay() {
    const last = days[days.length - 1];
    const nextDate = last?.date ? addDays(last.date, 1) : '';
    onChange([...days, emptyDay(days.length + 1, nextDate)]);
  }

  function removeDay(index: number) {
    const next = days.filter((_, i) => i !== index).map((d, i) => ({ ...d, day: i + 1 }));
    onChange(next);
  }

  function applyPick(target: { dayIndex: number; slot: TimeSlot }, item: TimeSlotItem) {
    const next = days.map((day, i) => {
      if (i !== target.dayIndex) return day;

      // A day can only ever have one hotel — strip any existing hotel from
      // every slot before adding a new one, so the data model can never hold
      // two (which toItineraryDay would otherwise silently collapse to one).
      const strip = (items: TimeSlotItem[]) => (item.kind === 'hotel' ? items.filter((s) => s.kind !== 'hotel') : items);

      return {
        ...day,
        morning: strip(day.morning),
        afternoon: strip(day.afternoon),
        evening: strip(day.evening),
        [target.slot]: [...strip(day[target.slot]), item],
      };
    });
    onChange(next);
  }

  function removeSlotItem(dayIndex: number, slot: TimeSlot, itemIndex: number) {
    const next = days.map((day, i) =>
      i === dayIndex ? { ...day, [slot]: day[slot].filter((_, idx) => idx !== itemIndex) } : day
    );
    onChange(next);
  }

  function handleDrop(dayIndex: number, slot: TimeSlot, dropIndex: number) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.dayIndex !== dayIndex || drag.slot !== slot || drag.index === dropIndex) return;

    const next = days.map((day, i) => {
      if (i !== dayIndex) return day;
      const list = [...day[slot]];
      const [moved] = list.splice(drag.index, 1);
      list.splice(dropIndex, 0, moved);
      return { ...day, [slot]: list };
    });
    onChange(next);
  }

  const totalCost = tripCost(days);

  return (
    <div className="pb-28">
      <div className="space-y-4">
        {days.map((day, dayIndex) => {
          // Flattened day order (morning → afternoon → evening) for the
          // between-stops distance connectors.
          const flatItems = dayItemsInOrder(day);
          const flatOffsets: Record<TimeSlot, number> = {
            morning: 0,
            afternoon: day.morning.length,
            evening: day.morning.length + day.afternoon.length,
          };
          const weather = day.date ? weatherByDate?.[day.date] : undefined;

          return (
          <div key={dayIndex} className="bg-white rounded-xl border border-beige-300 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-beige-100 border-b border-beige-300">
              <p className="font-semibold text-brand-black">
                Day {day.day} {day.date ? `— ${day.date}` : ''}
              </p>
              <div className="flex items-center gap-3">
                {weather && (
                  <span
                    className="text-xs text-brand-mid"
                    title={`${weatherGlyph(weather.weather_code).label}, ${weather.temp_min_c}–${weather.temp_max_c}°C`}
                  >
                    {weatherGlyph(weather.weather_code).icon} {weather.temp_max_c}°/{weather.temp_min_c}°
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeDay(dayIndex)}
                  className="text-xs font-medium text-brand-mid hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {TIME_SLOTS.map((slot) => (
                <div key={slot}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-mid">{SLOT_LABELS[slot]}</p>
                    <button
                      type="button"
                      onClick={() => setPickerTarget({ dayIndex, slot })}
                      className="text-xs font-medium text-sky-400 hover:text-sky-500 transition-colors"
                    >
                      + Add
                    </button>
                  </div>

                  {day[slot].length === 0 ? (
                    <p className="text-xs text-brand-mid italic">Nothing added yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {day[slot].map((slotItem, itemIndex) => {
                        const { label, price } = describeSlotItem(slotItem);
                        const flatIndex = flatOffsets[slot] + itemIndex;
                        const nextItem = flatItems[flatIndex + 1];
                        const hint = nextItem ? transitHint(slotItem.item, nextItem.item) : null;
                        return (
                          <div key={itemIndex}>
                            <div
                              draggable
                              onDragStart={() => {
                                dragRef.current = { dayIndex, slot, index: itemIndex };
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => handleDrop(dayIndex, slot, itemIndex)}
                              className="flex items-center justify-between bg-beige-100 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing"
                            >
                              <span className="text-sm text-brand-dark truncate">{label}</span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs text-sky-400 font-medium">{price}</span>
                                <button
                                  type="button"
                                  onClick={() => removeSlotItem(dayIndex, slot, itemIndex)}
                                  className="text-brand-mid hover:text-red-600 text-sm"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                            {hint && (
                              <p className="text-[11px] text-brand-mid pl-3 pt-1">↓ {hint}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-4 py-3 bg-beige-50 border-t border-beige-200 text-sm font-semibold text-brand-black">
              Estimated cost: {format(dayCost(day))}
            </div>
          </div>
          );
        })}

        <button
          type="button"
          onClick={addDay}
          className="w-full border-2 border-dashed border-beige-300 rounded-xl py-4 text-sm font-medium text-brand-mid hover:border-sky-300 hover:text-sky-400 transition-colors"
        >
          + Add day
        </button>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-beige-300 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-brand-mid">Total trip cost</p>
              <p className="text-2xl font-bold text-sky-400">{format(totalCost)}</p>
            </div>

            {/* Budget tracker — live fill against the editable budget */}
            <div className="min-w-[200px]">
              <div className="flex items-center justify-between gap-3 mb-1">
                <label className="text-xs text-brand-mid flex items-center gap-1">
                  Budget $
                  <input
                    type="number"
                    min={0}
                    value={budget || ''}
                    onChange={(e) => onBudgetChange(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 text-xs font-semibold text-brand-black bg-transparent border-b border-beige-300 focus:border-sky-300 focus:outline-none px-0.5 py-0"
                    aria-label="Trip budget in USD"
                  />
                </label>
                {budget > 0 && (
                  <span
                    className={`text-xs font-semibold ${
                      totalCost > budget ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {totalCost > budget
                      ? `${format(totalCost - budget)} over`
                      : `${format(budget - totalCost)} left`}
                  </span>
                )}
              </div>
              {budget > 0 && (
                <div
                  className="h-2 rounded-full bg-beige-200 overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={budget}
                  aria-valuenow={Math.min(totalCost, budget)}
                  aria-label="Budget used"
                >
                  <div
                    className={`h-full rounded-full transition-all ${
                      totalCost > budget
                        ? 'bg-red-500'
                        : totalCost > budget * 0.75
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, (totalCost / budget) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* /trips predates the sky/beige design refresh — restyle separately, this is a known inconsistency, not an oversight */}
            <Link href="/trips" className="text-sm font-medium text-brand-mid hover:text-brand-black px-3 py-2">
              Load saved trip
            </Link>
            <button
              type="button"
              onClick={onShare}
              disabled={!canShare}
              title={canShare ? 'Copy a read-only link to this trip' : 'Save the itinerary first'}
              className="text-sm font-medium text-brand-black border border-beige-300 hover:bg-beige-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
            >
              Share
            </button>
            <button
              type="button"
              onClick={onExportJson}
              disabled={!savedId}
              title={savedId ? undefined : 'Save the itinerary first'}
              className="text-sm font-medium text-brand-black border border-beige-300 hover:bg-beige-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={onExportIcs}
              disabled={!savedId}
              title={savedId ? undefined : 'Save the itinerary first'}
              className="text-sm font-medium text-brand-black border border-beige-300 hover:bg-beige-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
            >
              Calendar (.ics)
            </button>
            <button
              type="button"
              onClick={onExportPdf}
              disabled={!savedId}
              title={savedId ? undefined : 'Save the itinerary first'}
              className="text-sm font-medium text-brand-black border border-beige-300 hover:bg-beige-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="bg-sky-300 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : savedId ? 'Saved ✓' : 'Save itinerary'}
            </button>
          </div>
        </div>
      </div>

      <ItemPickerModal
        open={pickerTarget !== null}
        destination={destination}
        onClose={() => setPickerTarget(null)}
        onPick={(item) => {
          if (pickerTarget) applyPick(pickerTarget, item);
        }}
      />
    </div>
  );
}

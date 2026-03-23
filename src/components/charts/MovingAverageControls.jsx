import React, { useMemo, useState, useRef, useEffect } from 'react';
import { TrendingUp, ChevronDown, Plus } from 'lucide-react';
import {
  createMovingAverage,
  getMovingAverageLabel,
  nextMovingAverageColor,
} from '@/components/charts/movingAverages';

export default function MovingAverageControls({
  averages,
  setAverages,
}) {
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draftType, setDraftType] = useState('EMA');
  const [draftPeriod, setDraftPeriod] = useState('34');
  const [draftColor, setDraftColor] = useState(() => nextMovingAverageColor(averages));
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setShowAddForm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const existingSeries = useMemo(
    () => new Set(averages.map((average) => `${average.type}:${average.period}`)),
    [averages]
  );

  const toggleAverage = (id) => {
    setAverages((current) =>
      current.map((average) =>
        average.id === id ? { ...average, visible: !average.visible } : average
      )
    );
  };

  const updateAverageColor = (id, color) => {
    setAverages((current) =>
      current.map((average) =>
        average.id === id ? { ...average, color } : average
      )
    );
  };

  const removeAverage = (id) => {
    setAverages((current) => current.filter((average) => average.id !== id));
  };

  const addAverage = () => {
    const period = Math.max(1, Number.parseInt(draftPeriod, 10) || 0);
    if (!period) return;

    const duplicateKey = `${draftType}:${period}`;
    if (existingSeries.has(duplicateKey)) {
      setShowAddForm(false);
      setDraftColor(nextMovingAverageColor(averages));
      return;
    }

    setAverages((current) => [
      ...current,
      createMovingAverage(draftType, period, draftColor, true),
    ]);
    setShowAddForm(false);
    setDraftPeriod('34');
    setDraftType('EMA');
    setDraftColor(nextMovingAverageColor([...averages, createMovingAverage(draftType, period, draftColor, true)]));
  };

  const activeCount = averages.filter((a) => a.visible).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-all ${
          activeCount > 0
            ? 'text-blue-400 hover:text-blue-300 hover:bg-[hsl(217,33%,25%)]'
            : 'text-slate-400 hover:text-white hover:bg-[hsl(217,33%,25%)]'
        }`}
        title="Moving Averages"
      >
        <TrendingUp className="h-3 w-3" />
        <span className="hidden sm:inline">MA</span>
        {activeCount > 0 && (
          <span className="ml-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
            {activeCount}
          </span>
        )}
        <ChevronDown className="h-2.5 w-2.5 opacity-50" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-lg border border-[hsl(217,33%,23%)] bg-[hsl(222,47%,12%)] p-1.5 shadow-2xl backdrop-blur-sm">
          <div className="mb-1 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
            Moving Averages
          </div>
          <div className="max-h-[200px] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(217,33%,30%) transparent' }}>
            {averages.map((average) => {
              const isActive = average.visible;
              return (
                <div
                  key={average.id}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 transition-all ${
                    isActive
                      ? 'bg-[hsl(217,33%,19%)] text-white'
                      : 'text-slate-400 hover:bg-[hsl(217,33%,17%)] hover:text-slate-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleAverage(average.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <div
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-all ${
                        isActive
                          ? 'border-blue-500 bg-blue-600'
                          : 'border-slate-600 bg-transparent'
                      }`}
                    >
                      {isActive && (
                        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{ background: average.color }}
                      />
                      <span className="text-xs font-medium">{getMovingAverageLabel(average)}</span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <label
                      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-[hsl(217,33%,25%)]"
                      title={`Change ${getMovingAverageLabel(average)} color`}
                    >
                      <span className="h-2.5 w-2.5 rounded-sm border border-slate-600" style={{ background: average.color }} />
                      <input
                        type="color"
                        value={average.color}
                        onChange={(event) => updateAverageColor(average.id, event.target.value)}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeAverage(average.id)}
                      className="flex h-5 w-5 items-center justify-center rounded text-slate-600 transition-colors hover:text-red-400 hover:bg-[hsl(217,33%,25%)]"
                      title={`Remove ${getMovingAverageLabel(average)}`}
                    >
                      <span className="text-xs leading-none">&times;</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-1 border-t border-[hsl(217,33%,23%)] pt-1">
            {showAddForm ? (
              <div className="px-1.5 py-1.5">
                <div className="mb-2 flex items-center gap-2">
                  <select
                    value={draftType}
                    onChange={(event) => setDraftType(event.target.value)}
                    className="flex-1 rounded border border-[hsl(217,33%,27%)] bg-[hsl(217,33%,16%)] px-2 py-1 text-xs text-slate-200 outline-none"
                  >
                    <option value="EMA">EMA</option>
                    <option value="SMA">SMA</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={draftPeriod}
                    onChange={(event) => setDraftPeriod(event.target.value)}
                    className="w-16 rounded border border-[hsl(217,33%,27%)] bg-[hsl(217,33%,16%)] px-2 py-1 text-xs text-slate-200 outline-none"
                  />
                  <input
                    type="color"
                    value={draftColor}
                    onChange={(event) => setDraftColor(event.target.value)}
                    className="h-6 w-6 rounded border border-[hsl(217,33%,27%)] bg-transparent p-0"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="rounded px-2 py-1 text-[11px] text-slate-400 transition-colors hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addAverage}
                    className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(true);
                  setDraftColor(nextMovingAverageColor(averages));
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-slate-400 transition-all hover:bg-[hsl(217,33%,17%)] hover:text-slate-200"
              >
                <Plus className="h-3.5 w-3.5" />
                Add moving average
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

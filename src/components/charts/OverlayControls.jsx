import React, { useState, useRef, useEffect } from 'react';
import { Layers, ChevronDown } from 'lucide-react';

const OVERLAYS = [
  {
    key: 'volume',
    label: 'Volume',
    desc: 'Volume bars behind candles',
    color: '#64748b',
  },
  {
    key: 'liquidationHeatmap',
    label: 'Liquidation Heatmap',
    desc: 'Estimated liquidation clusters by leverage',
    color: '#f97316',
  },
  {
    key: 'openInterest',
    label: 'Open Interest',
    desc: 'Futures OI overlay on price chart',
    color: '#a855f7',
  },
  {
    key: 'autoFib',
    label: 'Auto Fibonacci',
    desc: 'Auto-detected swing retracement levels',
    color: '#facc15',
  },
  {
    key: 'fvg',
    label: 'Fair Value Gaps',
    desc: 'Imbalance zones — unfilled gaps act as magnets',
    color: '#06b6d4',
  },
  {
    key: 'macd',
    label: 'MACD',
    desc: 'Moving Average Convergence Divergence histogram',
    color: '#f59e0b',
  },
  {
    key: 'vpvr',
    label: 'Volume Profile (VPVR)',
    desc: 'Visible range volume profile — POC, Value Area Hi/Lo',
    color: '#fbbf24',
  },
];

export { OVERLAYS };

export default function OverlayControls({ activeOverlays, setActiveOverlays, isCrypto = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (key) => {
    setActiveOverlays((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const activeCount = activeOverlays.length;

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
        title="Chart Overlays"
      >
        <Layers className="h-3 w-3" />
        <span className="hidden sm:inline">Overlays</span>
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
            Price Chart Overlays
          </div>
          <div className="max-h-[176px] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(217,33%,30%) transparent' }}>
          {OVERLAYS.map((overlay) => {
            const isActive = activeOverlays.includes(overlay.key);
            const isDisabled = overlay.cryptoOnly && !isCrypto;
            return (
              <button
                key={overlay.key}
                type="button"
                onClick={() => !isDisabled && toggle(overlay.key)}
                disabled={isDisabled}
                title={isDisabled ? 'Available for crypto only' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-all ${
                  isDisabled
                    ? 'opacity-35 cursor-not-allowed'
                    : isActive
                      ? 'bg-[hsl(217,33%,19%)] text-white'
                      : 'text-slate-400 hover:bg-[hsl(217,33%,17%)] hover:text-slate-200'
                }`}
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                      style={{ background: overlay.color }}
                    />
                    <span className="text-xs font-medium">{overlay.label}</span>
                    {overlay.cryptoOnly && (
                      <span className="text-[8px] px-1 py-0.5 rounded font-semibold bg-yellow-500/15 text-yellow-500/70 leading-none">CRYPTO</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">{overlay.desc}</div>
                </div>
              </button>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

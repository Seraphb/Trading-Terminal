import React, { useMemo, useState, useRef, useCallback } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Area, Customized
} from 'recharts';

// ── Math helpers ──────────────────────────────────────────────────────────────
function ema(src, len) {
  const k = 2 / (len + 1);
  const out = [];
  let prev = src[0] ?? 0;
  for (let i = 0; i < src.length; i++) {
    prev = (src[i] ?? prev) * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function sma(src, len) {
  return src.map((_, i) => {
    const slice = src.slice(Math.max(0, i - len + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function rsiCalc(closes, len = 14) {
  const out = new Array(closes.length).fill(50);
  if (closes.length < len + 1) return out;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= len; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= len; avgL /= len;
  out[len] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = len + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (len - 1) + (d > 0 ? d : 0)) / len;
    avgL = (avgL * (len - 1) + (d < 0 ? -d : 0)) / len;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function stochRsiCalc(closes, stochLen = 14, rsiLen = 14, kSmooth = 3, dSmooth = 3) {
  const rsiVals = rsiCalc(closes, rsiLen);
  const k = rsiVals.map((_, i) => {
    const slice = rsiVals.slice(Math.max(0, i - stochLen + 1), i + 1);
    const lo = Math.min(...slice), hi = Math.max(...slice);
    return hi === lo ? 0 : (rsiVals[i] - lo) / (hi - lo) * 100;
  });
  return { k: sma(k, kSmooth), d: sma(sma(k, kSmooth), dSmooth) };
}

function waveTrendCalc(hlc3, chLen = 9, avgLen = 12, maLen = 3) {
  const esa = ema(hlc3, chLen);
  const de = ema(hlc3.map((v, i) => Math.abs(v - esa[i])), chLen);
  const ci = hlc3.map((v, i) => de[i] === 0 ? 0 : (v - esa[i]) / (0.015 * de[i]));
  const wt1 = ema(ci, avgLen);
  const wt2 = sma(wt1, maLen);
  return { wt1, wt2, vwap: wt1.map((v, i) => v - wt2[i]) };
}

function mfiCalc(klines, period = 60, mult = 150, posY = 2.5) {
  const raw = klines.map(k => k.high === k.low ? 0 : (k.close - k.open) / (k.high - k.low) * mult - posY);
  return sma(raw, period);
}

function findDivs(src, topLimit, botLimit) {
  const n = src.length;
  const bullDiv = new Array(n).fill(false);
  const bearDiv = new Array(n).fill(false);
  const fracTop = (i) => i >= 4 && src[i-4] < src[i-2] && src[i-3] < src[i-2] && src[i-2] > src[i-1] && src[i-2] > src[i];
  const fracBot = (i) => i >= 4 && src[i-4] > src[i-2] && src[i-3] > src[i-2] && src[i-2] < src[i-1] && src[i-2] < src[i];
  let lastTopIdx = -1, lastTopVal = 0;
  let lastBotIdx = -1, lastBotVal = 0;
  for (let i = 4; i < n; i++) {
    if (fracTop(i)) {
      const v = src[i - 2];
      if (v >= topLimit) {
        if (lastTopIdx >= 0 && v < lastTopVal) bearDiv[i] = true;
        lastTopIdx = i - 2; lastTopVal = v;
      }
    }
    if (fracBot(i)) {
      const v = src[i - 2];
      if (v <= botLimit) {
        if (lastBotIdx >= 0 && v > lastBotVal) bullDiv[i] = true;
        lastBotIdx = i - 2; lastBotVal = v;
      }
    }
  }
  return { bullDiv, bearDiv };
}

function crossUp(a, b, i) { return i > 0 && a[i - 1] <= b[i - 1] && a[i] > b[i]; }
function crossDown(a, b, i) { return i > 0 && a[i - 1] >= b[i - 1] && a[i] < b[i]; }

// ── Divergence connecting lines (rendered via Customized into the chart SVG) ──
function DivergenceLines({ data, show, offset, yAxisMap, xAxisMap }) {
  if (!offset || !yAxisMap || !xAxisMap) return null;
  const yScale = (yAxisMap[0] ?? Object.values(yAxisMap)[0])?.scale;
  const xScale = (xAxisMap[0] ?? Object.values(xAxisMap)[0])?.scale;
  if (!yScale || !xScale) return null;

  const bullPts = [];
  const bearPts = [];
  // Pine Script uses offset=-2: mark appears AT the fractal pivot (idx - 2), not the detection bar
  data.forEach((d) => {
    if (d.bullDivDot != null && d.bullDivY != null && d.idx != null) {
      bullPts.push({ x: xScale(d.idx - 2), y: yScale(d.bullDivY) });
    }
    if (d.bearDivDot != null && d.bearDivY != null && d.idx != null) {
      bearPts.push({ x: xScale(d.idx - 2), y: yScale(d.bearDivY) });
    }
  });

  const elems = [];

  if (show.bullDiv && bullPts.length > 0) {
    for (let i = 0; i < bullPts.length; i++) {
      const p = bullPts[i];
      if (i > 0) {
        const prev = bullPts[i - 1];
        elems.push(
          <line key={`bull-l-${i}`} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y}
            stroke="#00e676" strokeWidth={1.5} opacity={0.7} />
        );
      }
      elems.push(<circle key={`bull-d-${i}`} cx={p.x} cy={p.y} r={2.5} fill="#00e676" opacity={0.85} />);
    }
  }

  if (show.bearDiv && bearPts.length > 0) {
    for (let i = 0; i < bearPts.length; i++) {
      const p = bearPts[i];
      if (i > 0) {
        const prev = bearPts[i - 1];
        elems.push(
          <line key={`bear-l-${i}`} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y}
            stroke="#e60000" strokeWidth={1.5} opacity={0.7} />
        );
      }
      elems.push(<circle key={`bear-d-${i}`} cx={p.x} cy={p.y} r={2.5} fill="#e60000" opacity={0.85} />);
    }
  }

  return <g>{elems}</g>;
}

// ── Toggle button ─────────────────────────────────────────────────────────────
function ToggleChip({ label, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-all border ${
        active
          ? 'border-transparent opacity-100'
          : 'border-transparent opacity-25'
      }`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-slate-300">{label}</span>
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function VuManChu({ klines, visibleRange, rightPad = 0, inspectionX = null }) {
  const [yOffset, setYOffset] = useState(0);  // symmetric pan offset for Y axis
  const dragStartY = useRef(null);
  const dragStartOffset = useRef(0);
  const [show, setShow] = useState({
    wt1: false, wt2: true, vwap: false,
    stochK: false, stochD: false, mfi: false,
    crossDots: true, buyDots: true, sellDots: true,
    goldDots: true, bullDiv: false, bearDiv: false,
  });
  const toggle = (key) => setShow(s => ({ ...s, [key]: !s[key] }));

  const data = useMemo(() => {
    if (klines.length < 20) return [];
    // Compute indicators on the full klines for mathematical accuracy
    const closes = klines.map(k => k.close);
    const hlc3 = klines.map(k => (k.high + k.low + k.close) / 3);
    const rsiVals = rsiCalc(closes, 14);
    const { wt1, wt2, vwap } = waveTrendCalc(hlc3, 9, 12, 3);
    const mfi = mfiCalc(klines, 60, 150, 2.5);
    const { k: stochK, d: stochD } = stochRsiCalc(closes, 14, 14, 3, 3);
    const wtDivs = findDivs(wt2, 45, -65);
    const wtDivs2 = findDivs(wt2, 15, -40);
    const rsiDivs = findDivs(rsiVals, 60, 30);
    const overbought = wt2.map(v => v >= 53);
    const oversold = wt2.map(v => v <= -53);
    const wtCrossUpArr = wt1.map((_, i) => crossUp(wt1, wt2, i));
    const wtCrossDownArr = wt1.map((_, i) => crossDown(wt1, wt2, i));
    const goldBuy = klines.map((_, i) => {
      if (!wtCrossUpArr[i]) return false;
      const prevWT = wt2.slice(0, i).findLastIndex(v => v <= -75);
      return prevWT >= 0 && wt2[i] > -75 && rsiVals[i] < 30;
    });

    return klines.map((k, i) => {
      // Suppress green dot when a gold ball fires at the same bar — gold already implies a superior buy
      const isBuy = wtCrossUpArr[i] && oversold[i] && !goldBuy[i];
      const isSell = wtCrossDownArr[i] && overbought[i];
      const isBullDiv = wtDivs.bullDiv[i] || wtDivs2.bullDiv[i] || rsiDivs.bullDiv[i];
      const isBearDiv = wtDivs.bearDiv[i] || wtDivs2.bearDiv[i] || rsiDivs.bearDiv[i];
      return {
        idx: i,
        price: k.close,
        timeStr: k.timeStr,
        wt1: wt1[i],
        wt2: wt2[i],
        vwap: vwap[i],
        mfi: mfi[i],
        stochK: stochK[i],
        stochD: stochD[i],
        crossDot: (wtCrossUpArr[i] || wtCrossDownArr[i]) ? wt2[i] : null,
        crossDotColor: wt2[i] > wt1[i] ? '#ff5252' : '#00e676',
        buyDot: isBuy ? -95 : null,
        buyPrice: isBuy ? k.close : null,
        sellDot: isSell ? 93 : null,
        sellPrice: isSell ? k.close : null,
        bullDivDot: isBullDiv ? -94 : null,
        bullDivY: isBullDiv ? wt2[Math.max(0, i - 2)] : null,
        bearDivDot: isBearDiv ? 94 : null,
        bearDivY: isBearDiv ? wt2[Math.max(0, i - 2)] : null,
        goldBuyDot: goldBuy[i] ? -94 : null,
        goldPrice: goldBuy[i] ? k.close : null,
      };
    });
  }, [klines]);

  // Fixed domain always -100+offset to 100+offset — use function form so recharts can't auto-scale
  const yMin = -100 + yOffset;
  const yMax = 100 + yOffset;
  const yDomain = [yMin, yMax];

  // TradingView-style: drag up/down on the chart to pan the Y axis
  const handleYMouseDown = useCallback((e) => {
    e.stopPropagation();
    dragStartY.current = e.clientY;
    dragStartOffset.current = yOffset;
    const onMove = (ev) => {
      const deltaPx = dragStartY.current - ev.clientY;
      // 1px drag = 0.5 unit pan, no clamp (let user go wherever they want)
      setYOffset(dragStartOffset.current + deltaPx * 0.5);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [yOffset]);

  // Slice to exactly match what's visible in the main PriceChart
  const [startIdx, endIdx] = visibleRange ?? [Math.max(0, data.length - 120), data.length];
  const realSlice = data.slice(startIdx, endIdx);
  if (!realSlice.length) return null;
  // Append blank entries to mirror the right-side blank space of the main price chart
  const blanks = Array.from({ length: rightPad }, (_, i) => ({ idx: endIdx + i }));
  const visible = rightPad > 0 ? [...realSlice, ...blanks] : realSlice;

  // Custom tooltip that shows price on buy/sell signals
  const CustomTooltip = ({ active = false, payload = [] }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const hasSig = d.buyDot != null || d.sellDot != null || d.goldBuyDot != null;
    return (
      <div style={{
        background: 'hsl(222,47%,13%)', border: '1px solid hsl(217,33%,27%)',
        borderRadius: 6, padding: '6px 10px', fontSize: 10, color: '#e2e8f0', minWidth: 110
      }}>
        {d.wt1 != null && <div><span className="text-[#4994ec]">WT1</span> {d.wt1.toFixed(2)}</div>}
        {d.wt2 != null && <div><span className="text-[#9b5fdc]">WT2</span> {d.wt2.toFixed(2)}</div>}
        {hasSig && (
          <div className="border-t border-slate-700 mt-1 pt-1">
            {d.buyDot != null && <div className="text-emerald-400">● BUY @ <span className="font-bold">{d.buyPrice?.toLocaleString(undefined,{maximumFractionDigits:2})}</span></div>}
            {d.sellDot != null && <div className="text-red-400">● SELL @ <span className="font-bold">{d.sellPrice?.toLocaleString(undefined,{maximumFractionDigits:2})}</span></div>}
            {d.goldBuyDot != null && <div className="text-yellow-400">★ GOLD @ <span className="font-bold">{d.goldPrice?.toLocaleString(undefined,{maximumFractionDigits:2})}</span></div>}
          </div>
        )}
      </div>
    );
  };

  const chips = [
    { key: 'wt1',      label: 'WT1',     color: '#4994ec' },
    { key: 'wt2',      label: 'WT2',     color: '#7c3aed' },
    { key: 'vwap',     label: 'VWAP',    color: 'rgba(255,255,255,0.5)' },
    { key: 'stochK',   label: 'StochK',  color: 'rgba(33,186,243,0.8)' },
    { key: 'stochD',   label: 'StochD',  color: 'rgba(103,58,183,0.8)' },
    { key: 'mfi',      label: 'MFI',     color: '#3ee145' },
    { key: 'buyDots',  label: 'Buy',     color: '#00e676' },
    { key: 'sellDots', label: 'Sell',    color: '#ff5252' },
    { key: 'goldDots', label: 'Gold',    color: '#e2a400' },
    { key: 'bullDiv',  label: 'BullDiv', color: '#00e676' },
    { key: 'bearDiv',  label: 'BearDiv', color: '#ff3535' },
  ];

  return (
    <div className="terminal-panel flex flex-col" style={{ height: '100%' }}>
      {/* Header with toggles */}
      <div className="flex items-center flex-wrap gap-0.5 px-2 py-0.5 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <span className="mr-1 text-[10px] font-semibold text-purple-400">VuManChu Cipher B</span>
        {chips.map(c => (
          <ToggleChip key={c.key} label={c.label} active={show[c.key]} onClick={() => toggle(c.key)} color={c.color} />
        ))}
      </div>

      <div
        className="flex-1 min-h-0 grow"
        ref={el => {
          if (!el) return;
          el.onwheel = (e) => e.stopPropagation(); // block scroll from reaching main chart
        }}
        style={{ touchAction: 'none', position: 'relative' }}
        onMouseDown={e => e.stopPropagation()}
        onMouseMove={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
      >
        {inspectionX != null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-10"
            style={{
              left: `${inspectionX}px`,
              borderLeft: '1px dashed rgba(148,163,184,0.45)',
            }}
          />
        ) : null}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visible} margin={{ top: 20, right: 72, bottom: 20, left: 0 }}>
            <CartesianGrid stroke="hsl(217,33%,15%)" strokeDasharray="3 3" />
            <XAxis dataKey="idx" hide />
            <YAxis
              orientation="right"
              domain={yDomain}
              tick={{ fill: '#475569', fontSize: 9, cursor: 'ns-resize' }}
              axisLine={false}
              tickLine={false}
              width={36}
              ticks={[-100, -50, 0, 50, 100].map(t => t + yOffset)}
              onMouseDown={handleYMouseDown}
              style={{ cursor: 'ns-resize', userSelect: 'none' }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Reference lines at -100, -50, 0, 50, 100 */}
            <ReferenceLine y={100  + yOffset} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 4" />
            <ReferenceLine y={50   + yOffset} stroke="rgba(255,255,255,0.10)" strokeDasharray="3 4" />
            <ReferenceLine y={0    + yOffset} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
            <ReferenceLine y={-50  + yOffset} stroke="rgba(255,255,255,0.10)" strokeDasharray="3 4" />
            <ReferenceLine y={-100 + yOffset} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 4" />

            {/* MFI */}
            {show.mfi && (
              <>
                <Bar dataKey="mfi" yAxisId="mfiAxis" fill="#3ee145" opacity={0.35} isAnimationActive={false} />
                <YAxis yAxisId="mfiAxis" hide domain={[-5, 5]} />
              </>
            )}

            {/* WT2 area */}
            {show.wt2 && (
              <Area type="monotone" dataKey="wt2"
                stroke="#7c3aed" fill="#3b0764" fillOpacity={0.5}
                strokeWidth={1} dot={false} isAnimationActive={false} />
            )}

            {/* WT1 area */}
            {show.wt1 && (
              <Area type="monotone" dataKey="wt1"
                stroke="#4994ec" fill="#4994ec" fillOpacity={0.18}
                strokeWidth={1.5} dot={false} isAnimationActive={false} />
            )}

            {/* VWAP */}
            {show.vwap && (
              <Line type="monotone" dataKey="vwap"
                stroke="rgba(255,255,255,0.35)" strokeWidth={1}
                dot={false} isAnimationActive={false} />
            )}

            {/* StochRSI — separate yAxis */}
            {(show.stochK || show.stochD) && <YAxis yAxisId="stoch" hide domain={[0, 100]} />}
            {show.stochK && (
              <Line type="monotone" dataKey="stochK" yAxisId="stoch"
                stroke="rgba(33,186,243,0.75)" strokeWidth={1.5}
                dot={false} isAnimationActive={false} />
            )}
            {show.stochD && (
              <Line type="monotone" dataKey="stochD" yAxisId="stoch"
                stroke="rgba(103,58,183,0.75)" strokeWidth={1}
                dot={false} isAnimationActive={false} />
            )}

            {/* Cross dots */}
            {show.crossDots && (
              <Line type="monotone" dataKey="crossDot"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.crossDot == null) return null;
                  return <circle key={`cr-${props.index}`} cx={cx} cy={cy} r={3} fill={payload.crossDotColor} opacity={0.85} />;
                }}
                activeDot={false} stroke="none" isAnimationActive={false} />
            )}

            {/* Buy dots + price label */}
            {show.buyDots && (
              <Line type="monotone" dataKey="buyDot"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.buyDot == null) return null;
                  return (
                    <g key={`buy-${props.index}`}>
                      <circle cx={cx} cy={cy} r={5} fill="#00e676" opacity={0.85} />
                      {payload.buyPrice && (
                        <>
                          <rect x={cx - 26} y={cy + 8} width={52} height={14} fill="rgba(0,230,118,0.18)" stroke="#00e676" strokeWidth={0.6} rx={2} />
                          <text x={cx} y={cy + 19} textAnchor="middle" fill="#00e676" fontSize={9} fontFamily="monospace" fontWeight="600">
                            {payload.buyPrice >= 1000
                              ? payload.buyPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })
                              : payload.buyPrice.toFixed(3)}
                          </text>
                        </>
                      )}
                    </g>
                  );
                }}
                activeDot={false} stroke="none" isAnimationActive={false} />
            )}

            {/* Sell dots + price label */}
            {show.sellDots && (
              <Line type="monotone" dataKey="sellDot"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.sellDot == null) return null;
                  return (
                    <g key={`sell-${props.index}`}>
                      <circle cx={cx} cy={cy} r={5} fill="#ff5252" opacity={0.85} />
                      {payload.sellPrice && (
                        <>
                          <rect x={cx - 26} y={cy - 22} width={52} height={14} fill="rgba(255,82,82,0.18)" stroke="#ff5252" strokeWidth={0.6} rx={2} />
                          <text x={cx} y={cy - 11} textAnchor="middle" fill="#ff5252" fontSize={9} fontFamily="monospace" fontWeight="600">
                            {payload.sellPrice >= 1000
                              ? payload.sellPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })
                              : payload.sellPrice.toFixed(3)}
                          </text>
                        </>
                      )}
                    </g>
                  );
                }}
                activeDot={false} stroke="none" isAnimationActive={false} />
            )}

            {/* Divergence connecting lines */}
            {(show.bullDiv || show.bearDiv) && (
              <Customized component={(props) => (
                <DivergenceLines data={visible} show={show} {...props} />
              )} />
            )}

            {/* Gold buy dots + price */}
            {show.goldDots && (
              <Line type="monotone" dataKey="goldBuyDot"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.goldBuyDot == null) return null;
                  return (
                    <g key={`gold-${props.index}`}>
                      <circle cx={cx} cy={cy} r={7} fill="#e2a400" opacity={0.9} />
                      <text x={cx} y={cy - 3} textAnchor="middle" fill="#fff" fontSize={8} fontWeight="bold">★</text>
                      {payload.goldPrice && (
                        <>
                          <rect x={cx - 26} y={cy + 10} width={52} height={14} fill="rgba(226,164,0,0.18)" stroke="#e2a400" strokeWidth={0.6} rx={2} />
                          <text x={cx} y={cy + 21} textAnchor="middle" fill="#e2a400" fontSize={9} fontFamily="monospace" fontWeight="600">
                            {payload.goldPrice >= 1000
                              ? payload.goldPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })
                              : payload.goldPrice.toFixed(3)}
                          </text>
                        </>
                      )}
                    </g>
                  );
                }}
                activeDot={false} stroke="none" isAnimationActive={false} />
            )}

          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

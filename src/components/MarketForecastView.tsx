import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import {
  HIRING_TREND_SERIES,
  QUARTERLY_HIRING_BREAKDOWN,
  SALARY_BENCHMARKS_GBP,
  SKILL_PREDICTIONS_2035,
  SUBSECTOR_FORECASTS,
} from '../data/marketForecastData';

const InfoTip: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={label}
        className="p-0.5 text-[#78756E] hover:text-[#1E40AF] transition-colors cursor-pointer"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span className="absolute left-0 top-6 z-30 w-64 p-2.5 bg-[#1C1B18] text-[#FAF9F6] text-[11px] font-normal leading-relaxed rounded-md border border-[#3E3C37]">
          {text}
        </span>
      )}
    </span>
  );
};

type TrendSeriesKey = 'aiBioinformatics' | 'cellGeneTherapy' | 'regulatoryHeor' | 'wetLabChem';

const SERIES_META: { key: TrendSeriesKey; label: string }[] = [
  { key: 'aiBioinformatics', label: 'AI & Bioinformatics' },
  { key: 'cellGeneTherapy', label: 'Cell & Gene Therapy' },
  { key: 'regulatoryHeor', label: 'Regulatory & HEOR' },
  { key: 'wetLabChem', label: 'Wet-Lab Chemistry' },
];

const NEUTRAL_COMPARISON_STEPS = ['#57544D', '#8C887F', '#B5B1A7'];

export const MarketForecastView: React.FC = () => {
  const [focusedSeries, setFocusedSeries] = useState<TrendSeriesKey>('aiBioinformatics');
  const [hoveredYearIdx, setHoveredYearIdx] = useState<number | null>(null);
  const [selectedQuarterIdx, setSelectedQuarterIdx] = useState<number>(
    QUARTERLY_HIRING_BREAKDOWN.length - 2
  );
  const [salaryRegion, setSalaryRegion] = useState<'both' | 'goldenTriangle' | 'regional'>('both');
  const [horizonFilter, setHorizonFilter] = useState<'All' | '2025–2028' | '2028–2035'>('All');
  const [showGuide, setShowGuide] = useState(false);

  const chartWidth = 860;
  const chartHeight = 300;
  const pad = { top: 24, right: 28, bottom: 34, left: 48 };
  const plotW = chartWidth - pad.left - pad.right;
  const plotH = chartHeight - pad.top - pad.bottom;

  const yMax = 430;
  const xScale = (idx: number) => pad.left + (idx / (HIRING_TREND_SERIES.length - 1)) * plotW;
  const yScale = (val: number) => pad.top + plotH - (val / yMax) * plotH;

  const forecastBoundaryX = useMemo(() => {
    const idx2026 = HIRING_TREND_SERIES.findIndex((p) => p.year === 2026);
    return xScale(idx2026);
  }, []);

  const filteredSkills = useMemo(() => {
    if (horizonFilter === 'All') return SKILL_PREDICTIONS_2035;
    return SKILL_PREDICTIONS_2035.filter((s) => s.horizon === horizonFilter);
  }, [horizonFilter]);

  const seriesColor = (key: TrendSeriesKey): string => {
    if (key === focusedSeries) return '#1E40AF';
    const otherKeys = SERIES_META.filter((s) => s.key !== focusedSeries).map((s) => s.key);
    const idx = otherKeys.indexOf(key);
    return NEUTRAL_COMPARISON_STEPS[idx] ?? '#8C887F';
  };

  const hoveredPoint = hoveredYearIdx !== null ? HIRING_TREND_SERIES[hoveredYearIdx] : null;
  const activeQuarter = QUARTERLY_HIRING_BREAKDOWN[selectedQuarterIdx];
  const maxQuarterIndex = Math.max(...QUARTERLY_HIRING_BREAKDOWN.map((q) => q.totalIndex));

  return (
    <div className="space-y-10">
      {/* Header + Inline Benchmark Summary */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#E5E3DC]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1C1B18] text-balance">
            UK Life Science Market Forecast (2025–2035)
          </h1>
          <p className="mt-1 text-sm text-[#57544D] max-w-2xl">
            Simple guide to quarterly hiring seasons, Golden Triangle vs regional GBP salaries, and 10-year skill demand for students and applicants.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <span className="text-xs font-mono text-[#78756E]">
              Update cadence: Quarterly (ONS, ABPI & BIA releases)
            </span>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1E40AF] hover:underline cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              {showGuide ? 'Hide metric guide' : 'How to read these charts'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs shrink-0">
          <div>
            <div className="text-[#78756E]">10-Year Index</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">113 → 226</div>
          </div>
          <div className="h-8 w-px bg-[#E5E3DC]" aria-hidden="true" />
          <div>
            <div className="text-[#78756E]">Lead Growth</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1E40AF]">+14.8% CAGR</div>
          </div>
          <div className="h-8 w-px bg-[#E5E3DC]" aria-hidden="true" />
          <div>
            <div className="text-[#78756E]">GT Pay Premium</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">+24.2%</div>
          </div>
        </div>
      </div>

      {showGuide && (
        <div className="bg-white border border-[#E5E3DC] rounded-lg p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
          <div>
            <div className="font-semibold text-[#1C1B18]">Hiring Index (2022 = 100)</div>
            <p className="mt-1 text-[#57544D] leading-relaxed">
              Every year is indexed to 2022 = 100. An index of 200 means twice as many UK job postings in that discipline compared with 2022.
            </p>
          </div>
          <div>
            <div className="font-semibold text-[#1C1B18]">Quarterly Breakdown</div>
            <p className="mt-1 text-[#57544D] leading-relaxed">
              Illustrates seasonal UK hiring waves: Q1 reflects fresh R&D budgets, while Q3 marks peak BSc/MSc graduate scheme intakes.
            </p>
          </div>
          <div>
            <div className="font-semibold text-[#1C1B18]">Golden Triangle vs Regional</div>
            <p className="mt-1 text-[#57544D] leading-relaxed">
              Compares 25th–75th percentile base salaries across Cambridge, Oxford, and London against regional hubs like Manchester and Edinburgh.
            </p>
          </div>
          <div>
            <div className="font-semibold text-[#1C1B18]">CAGR & Junior %</div>
            <p className="mt-1 text-[#57544D] leading-relaxed">
              CAGR is annualised 10-year job growth; Junior % shows the share of roles open to graduates or early-career scientists.
            </p>
          </div>
        </div>
      )}

      {/* Focal Annual Trajectory + Compact Quarterly Seasonal Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 bg-white border border-[#E5E3DC] rounded-lg p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#1C1B18] inline-flex items-center gap-1.5">
                10-Year UK Hiring Trajectory (2022 = 100)
                <InfoTip
                  label="Explain hiring trajectory"
                  text="Indexed to 2022 = 100 so you can compare relative growth across disciplines. Solid lines show observed UK postings; dashed lines show 2027–2035 modelled projections."
                />
              </h2>
              <p className="text-xs text-[#78756E]">
                Click a discipline to highlight it; dashed lines show 2027–2035 projections.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SERIES_META.map((s) => {
                const isFocus = s.key === focusedSeries;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setFocusedSeries(s.key)}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      isFocus
                        ? 'bg-[#EFF4FF] border-[#BFDBFE] text-[#1E3A8A]'
                        : 'bg-white border-[#D6D3CB] text-[#57544D] hover:text-[#1C1B18]'
                    }`}
                  >
                    <span
                      className="w-2.5 h-0.5 inline-block"
                      style={{ backgroundColor: seriesColor(s.key) }}
                    />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible">
              <rect
                x={forecastBoundaryX}
                y={pad.top}
                width={pad.left + plotW - forecastBoundaryX}
                height={plotH}
                fill="#FAF9F6"
              />
              <line
                x1={forecastBoundaryX}
                y1={pad.top}
                x2={forecastBoundaryX}
                y2={pad.top + plotH}
                stroke="#C7C3B8"
                strokeDasharray="3 3"
              />
              <text
                x={forecastBoundaryX + 8}
                y={pad.top + 14}
                fontSize="11"
                fill="#78756E"
                fontFamily="JetBrains Mono, monospace"
              >
                2027–2035 Forecast
              </text>

              {[0, 100, 200, 300, 400].map((tick) => {
                const y = yScale(tick);
                return (
                  <g key={tick}>
                    <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="#E5E3DC" strokeWidth={1} />
                    <text
                      x={pad.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#78756E"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}

              {HIRING_TREND_SERIES.map((pt, idx) => (
                <text
                  key={pt.year}
                  x={xScale(idx)}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill={pt.isForecast ? '#78756E' : '#1C1B18'}
                  fontWeight={pt.isForecast ? 400 : 500}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {pt.year}
                </text>
              ))}

              {[
                ...SERIES_META.filter((s) => s.key !== focusedSeries),
                ...SERIES_META.filter((s) => s.key === focusedSeries),
              ].map((s) => {
                const isFocus = s.key === focusedSeries;
                const stroke = seriesColor(s.key);
                const actualPts = HIRING_TREND_SERIES.filter((p) => !p.isForecast);
                const forecastPts = HIRING_TREND_SERIES.slice(actualPts.length - 1);

                const toPath = (pts: typeof HIRING_TREND_SERIES, startOffset: number) =>
                  pts
                    .map((pt, i) => {
                      const x = xScale(startOffset + i);
                      const y = yScale(pt[s.key]);
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(' ');

                return (
                  <g key={s.key}>
                    <path
                      d={toPath(actualPts, 0)}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={isFocus ? 2.6 : 1.5}
                    />
                    <path
                      d={toPath(forecastPts, actualPts.length - 1)}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={isFocus ? 2.4 : 1.4}
                      strokeDasharray="5 4"
                    />
                    {HIRING_TREND_SERIES.map((pt, idx) => (
                      <circle
                        key={`${s.key}-${pt.year}`}
                        cx={xScale(idx)}
                        cy={yScale(pt[s.key])}
                        r={hoveredYearIdx === idx ? (isFocus ? 5 : 3.5) : isFocus ? 3 : 2}
                        fill={pt.isForecast ? '#FFFFFF' : stroke}
                        stroke={stroke}
                        strokeWidth={isFocus ? 2 : 1.25}
                      />
                    ))}
                  </g>
                );
              })}

              {hoveredYearIdx !== null && (
                <line
                  x1={xScale(hoveredYearIdx)}
                  y1={pad.top}
                  x2={xScale(hoveredYearIdx)}
                  y2={pad.top + plotH}
                  stroke="#1C1B18"
                  strokeWidth={1}
                  strokeOpacity={0.3}
                />
              )}

              {HIRING_TREND_SERIES.map((pt, idx) => {
                const colW = plotW / HIRING_TREND_SERIES.length;
                return (
                  <rect
                    key={`hit-${pt.year}`}
                    x={xScale(idx) - colW / 2}
                    y={pad.top}
                    width={colW}
                    height={plotH}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoveredYearIdx(idx)}
                    onMouseLeave={() => setHoveredYearIdx(null)}
                  />
                );
              })}
            </svg>
          </div>

          <div className="mt-3 pt-3 border-t border-[#E5E3DC] flex flex-wrap items-center justify-between gap-2 text-xs min-h-[28px]">
            {hoveredPoint ? (
              <>
                <span className="font-mono font-medium text-[#1C1B18]">
                  {hoveredPoint.year} · {hoveredPoint.isForecast ? 'Forecast' : 'Observed'}
                </span>
                <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-[#57544D]">
                  <span>AI/Bioinf: {hoveredPoint.aiBioinformatics}</span>
                  <span>CGT: {hoveredPoint.cellGeneTherapy}</span>
                  <span>Reg/HEOR: {hoveredPoint.regulatoryHeor}</span>
                  <span>Wet-Lab: {hoveredPoint.wetLabChem}</span>
                </div>
              </>
            ) : (
              <span className="text-[#78756E]">
                Hover across the chart to inspect annual index values.
              </span>
            )}
          </div>
        </section>

        {/* Compact Quarterly Breakdown (2025 Q1 – 2026 Q4) */}
        <section className="lg:col-span-4 bg-white border border-[#E5E3DC] rounded-lg p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#1C1B18] inline-flex items-center gap-1.5">
              Quarterly Breakdown
              <InfoTip
                label="Explain quarterly breakdown"
                text="Small seasonal illustration showing how UK biotech & graduate hiring shifts across quarters (Q1 budget sign-off vs Q3 graduate cohort peak)."
              />
            </h2>
            <p className="text-xs text-[#78756E] mt-0.5">
              Illustrative 2025–2026 seasonal hiring rhythm (select a quarter).
            </p>

            <div className="mt-5 grid grid-cols-8 gap-2 items-end h-36 pt-4 border-b border-[#E5E3DC] pb-2">
              {QUARTERLY_HIRING_BREAKDOWN.map((q, idx) => {
                const isSelected = idx === selectedQuarterIdx;
                const heightPct = Math.round((q.totalIndex / maxQuarterIndex) * 100);
                const shortLabel = q.quarter.replace('20', "'");
                return (
                  <button
                    key={q.quarter}
                    type="button"
                    onClick={() => setSelectedQuarterIdx(idx)}
                    className="flex flex-col items-center justify-end h-full gap-1.5 group cursor-pointer"
                    title={`${q.quarter}: Index ${q.totalIndex}`}
                  >
                    <span className="text-[10px] font-mono tabular-nums text-[#78756E]">
                      {q.totalIndex}
                    </span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={`w-full rounded-t transition-colors ${
                          isSelected
                            ? 'bg-[#1E40AF]'
                            : 'bg-[#D6D3CB] group-hover:bg-[#8C887F]'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-mono leading-tight ${
                        isSelected ? 'text-[#1C1B18] font-semibold' : 'text-[#78756E]'
                      }`}
                    >
                      {shortLabel.split(' ')[1]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between text-[11px] font-mono text-[#78756E] mt-1.5 px-1">
              <span>2025 Q1–Q4</span>
              <span>2026 Q1–Q4</span>
            </div>
          </div>

          <div className="mt-5 p-3.5 bg-[#FAF9F6] border border-[#E5E3DC] rounded-md space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-[#1C1B18]">{activeQuarter.quarter}</span>
              <span className="font-mono tabular-nums text-[#1E40AF]">
                Index {activeQuarter.totalIndex}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#57544D] font-mono tabular-nums">
              <span>AI/Biotech share: {activeQuarter.biotechAiSharePct}%</span>
              <span>Grad share: {activeQuarter.gradSharePct}%</span>
            </div>
            <p className="text-[#57544D] leading-relaxed">{activeQuarter.note}</p>
          </div>
        </section>
      </div>

      {/* Salary Bands (5 cols) + Sub-Sector Table (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-lg p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-[#1C1B18] inline-flex items-center gap-1.5">
                  UK Base Salary Bands (GBP)
                  <InfoTip
                    label="Explain salary bands"
                    text="Horizontal bars span the 25th to 75th percentile UK base salary in GBP. Golden Triangle covers Cambridge, Oxford, and London."
                  />
                </h2>
                <p className="text-xs text-[#78756E]">25th–75th percentile ranges</p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#F3F2EE] rounded-md border border-[#E5E3DC]">
                {(['both', 'goldenTriangle', 'regional'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSalaryRegion(mode)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      salaryRegion === mode
                        ? 'bg-white text-[#1C1B18]'
                        : 'text-[#57544D] hover:text-[#1C1B18]'
                    }`}
                  >
                    {mode === 'both' ? 'Compare' : mode === 'goldenTriangle' ? 'Golden Tri.' : 'Regional'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {SALARY_BENCHMARKS_GBP.map((row) => {
                const maxScale = 115000;
                const toPct = (v: number) => `${Math.min(100, (v / maxScale) * 100).toFixed(1)}%`;
                return (
                  <div key={row.roleFamily} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#1C1B18]">{row.roleFamily}</span>
                      <span className="font-mono tabular-nums text-[#15803D]">
                        +{row.yoyChangePct}% YoY
                      </span>
                    </div>

                    <div className="relative h-5 bg-[#F3F2EE] rounded overflow-hidden">
                      {(salaryRegion === 'both' || salaryRegion === 'goldenTriangle') && (
                        <div
                          className="absolute top-1 h-1.5 bg-[#1E40AF] rounded-xs"
                          style={{
                            left: toPct(row.gtP25),
                            width: toPct(row.gtP75 - row.gtP25),
                          }}
                        />
                      )}
                      {(salaryRegion === 'both' || salaryRegion === 'regional') && (
                        <div
                          className={`absolute ${salaryRegion === 'both' ? 'bottom-1' : 'top-1.5'} h-1.5 bg-[#78756E] rounded-xs`}
                          style={{
                            left: toPct(row.regP25),
                            width: toPct(row.regP75 - row.regP25),
                          }}
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono tabular-nums text-[#78756E]">
                      {salaryRegion !== 'regional' && (
                        <span>GT Med: £{row.gtMedian.toLocaleString('en-GB')}</span>
                      )}
                      {salaryRegion !== 'goldenTriangle' && (
                        <span>Reg Med: £{row.regMedian.toLocaleString('en-GB')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-[#E5E3DC] flex items-center gap-5 text-xs text-[#57544D]">
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-1.5 bg-[#1E40AF] inline-block rounded-xs" />
              Golden Triangle
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-1.5 bg-[#78756E] inline-block rounded-xs" />
              Regional Hubs
            </span>
          </div>
        </section>

        <section className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E5E3DC]">
            <h2 className="text-base font-semibold text-[#1C1B18] inline-flex items-center gap-1.5">
              Sub-Sector Growth & Entry-Level Share
              <InfoTip
                label="Explain sub-sector table"
                text="Share = % of total UK life science vacancies. 10y CAGR = projected annual growth through 2035. Junior % = proportion open to graduates/entry-level."
              />
            </h2>
            <p className="text-xs text-[#78756E]">
              Share of UK postings, 10-year CAGR, and junior hiring share.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F3F2EE] border-b border-[#E5E3DC] font-medium text-[#57544D]">
                  <th className="py-3 px-4">Sub-Sector</th>
                  <th className="py-3 px-3 text-right">Share</th>
                  <th className="py-3 px-3 text-right">10y CAGR</th>
                  <th className="py-3 px-3 text-right">Junior %</th>
                  <th className="py-3 px-4">Momentum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E3DC]">
                {SUBSECTOR_FORECASTS.map((item) => (
                  <tr key={item.subSector} className="hover:bg-[#FAF9F6]">
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#1C1B18]">{item.subSector}</div>
                      <div className="text-[#78756E] mt-0.5">{item.driverNote}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-[#57544D]">
                      {item.ukSharePct}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-[#1E40AF]">
                      +{item.cagr2025_2035Pct}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-[#57544D]">
                      {item.juniorSharePct}%
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-medium">
                      <span
                        className={
                          item.capitalMomentum === 'Accelerating'
                            ? 'text-[#15803D]'
                            : item.capitalMomentum === 'Steady'
                            ? 'text-[#57544D]'
                            : 'text-[#B45309]'
                        }
                      >
                        {item.capitalMomentum}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Compact 2025-2035 Skill Shifts */}
      <section className="bg-white border border-[#E5E3DC] rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base font-semibold text-[#1C1B18] inline-flex items-center gap-1.5">
              Key 2025–2035 Skill Shifts
              <InfoTip
                label="Explain skill shifts"
                text="Projected change in how frequently each capability appears in UK job specs by 2035. Negative values indicate work consolidating into automated platforms."
              />
            </h2>
            <p className="text-xs text-[#78756E]">
              Skills rising or shifting in UK graduate and specialist job descriptions.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[#F3F2EE] rounded-md border border-[#E5E3DC]">
            {(['All', '2025–2028', '2028–2035'] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizonFilter(h)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  horizonFilter === h
                    ? 'bg-white text-[#1C1B18]'
                    : 'text-[#57544D] hover:text-[#1C1B18]'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {filteredSkills.map((sk) => (
            <div key={sk.skill} className="pb-3 border-b border-[#E5E3DC]">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-[#1C1B18]">{sk.skill}</div>
                <span
                  className={`font-mono tabular-nums text-xs font-semibold shrink-0 ${
                    sk.demandDelta2035Pct >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                  }`}
                >
                  {sk.demandDelta2035Pct >= 0 ? `+${sk.demandDelta2035Pct}%` : `${sk.demandDelta2035Pct}%`}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-[#78756E]">
                {sk.roleFamily} · {sk.horizon}
              </div>
              <p className="mt-1 text-xs text-[#57544D]">{sk.implication}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

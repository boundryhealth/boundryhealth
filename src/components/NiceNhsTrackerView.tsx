import React, { useEffect, useMemo, useState } from 'react';
import { Info, Search } from 'lucide-react';
import { NiceDrugRecord, UptakeVelocity } from '../types/lifeScience';
import { trackEvent } from '../utils/analyticsClient';

interface NiceNhsTrackerViewProps {
  drugs: NiceDrugRecord[];
  onFilteredDrugsChange: (drugs: NiceDrugRecord[]) => void;
}

const THERAPY_AREAS = [
  'All',
  'Cardiometabolic',
  'Oncology',
  'Immunology',
  'Rare Disease',
  'CNS',
  'Respiratory',
] as const;

const VELOCITIES: ('All' | UptakeVelocity)[] = [
  'All',
  'Ahead of Forecast',
  'On Track',
  'Constrained by Friction',
];

export const NiceNhsTrackerView: React.FC<NiceNhsTrackerViewProps> = ({
  drugs,
  onFilteredDrugsChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [therapyArea, setTherapyArea] = useState<(typeof THERAPY_AREAS)[number]>('All');
  const [velocityFilter, setVelocityFilter] = useState<'All' | UptakeVelocity>('All');
  const [selectedDrugId, setSelectedDrugId] = useState<string>(drugs[0]?.id ?? 'nice-ta875');
  const [hoveredQIdx, setHoveredQIdx] = useState<number | null>(null);
  const [showTermGuide, setShowTermGuide] = useState<boolean>(false);

  const filteredDrugs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return drugs.filter((drug) => {
      if (therapyArea !== 'All' && drug.therapyArea !== therapyArea) return false;
      if (velocityFilter !== 'All' && drug.uptakeVelocity !== velocityFilter) return false;
      if (q) {
        const hay = `${drug.taRef} ${drug.genericName} ${drug.brandName} ${drug.manufacturer} ${drug.therapyArea} ${drug.commercialTakeaway}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [drugs, searchQuery, therapyArea, velocityFilter]);

  useEffect(() => {
    onFilteredDrugsChange(filteredDrugs);
  }, [filteredDrugs, onFilteredDrugsChange]);

  const selectedDrug = useMemo(() => {
    return (
      filteredDrugs.find((d) => d.id === selectedDrugId) ??
      filteredDrugs[0] ??
      drugs[0]
    );
  }, [filteredDrugs, selectedDrugId, drugs]);

  const handleSelectDrug = (drug: NiceDrugRecord) => {
    setSelectedDrugId(drug.id);
    setHoveredQIdx(null);
    trackEvent('drug_select', `${drug.taRef} ${drug.brandName}`);
  };

  const kpis = useMemo(() => {
    const totalSpend = filteredDrugs.reduce((acc, d) => acc + d.annualSpendGbpM, 0);
    const avgIcb =
      filteredDrugs.length > 0
        ? Math.round(
            filteredDrugs.reduce((acc, d) => acc + d.icbAdoptionPct, 0) / filteredDrugs.length
          )
        : 0;
    const frictionCount = filteredDrugs.filter(
      (d) => d.uptakeVelocity === 'Constrained by Friction'
    ).length;

    return {
      count: filteredDrugs.length,
      totalSpend: totalSpend.toFixed(1),
      avgIcb,
      frictionCount,
    };
  }, [filteredDrugs]);

  const svgW = 500;
  const svgH = 230;
  const pad = { top: 20, right: 20, bottom: 30, left: 46 };
  const plotW = svgW - pad.left - pad.right;
  const plotH = svgH - pad.top - pad.bottom;

  const seriesMax = useMemo(() => {
    const pts = selectedDrug.quarterlySeries;
    const vals = pts.flatMap((p) => [p.actualItemsK, p.niceForecastItemsK]);
    return Math.max(1, ...vals) * 1.15;
  }, [selectedDrug]);

  const xPos = (idx: number, len: number) =>
    pad.left + (idx / Math.max(1, len - 1)) * plotW;
  const yPos = (v: number) => pad.top + plotH - (v / seriesMax) * plotH;

  const velocityLabelColor = (v: UptakeVelocity) => {
    if (v === 'Ahead of Forecast') return 'text-[#15803D]';
    if (v === 'On Track') return 'text-[#1E40AF]';
    return 'text-[#B45309]';
  };

  const hoveredPoint =
    hoveredQIdx !== null ? selectedDrug.quarterlySeries[hoveredQIdx] ?? null : null;

  return (
    <div className="space-y-6">
      {/* Header + Inline Metrics */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-[#E5E3DC]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1C1B18] text-balance">
            Boundry NICE-to-NHS Drug Tracker
          </h1>
          <p className="mt-1 text-sm text-[#57544D] max-w-2xl">
            Connecting NICE approvals to real-world NHS prescribing and commercial friction — built for Market Access, HEOR, and MSL applicants preparing for UK pharma roles.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <span className="text-xs font-mono text-[#78756E]">
              Update cadence: NICE appraisals checked daily · NHS OpenPrescribing refreshes monthly
            </span>
            <button
              type="button"
              onClick={() => setShowTermGuide((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1E40AF] hover:underline cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              {showTermGuide ? 'Hide term explainer' : 'Actual NHS vs NICE Estimate explained'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs shrink-0">
          <div>
            <div className="text-[#78756E]">Appraisals</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
              {kpis.count}
            </div>
          </div>
          <div className="h-8 w-px bg-[#E5E3DC]" aria-hidden="true" />
          <div>
            <div className="text-[#78756E]">12m NHS Spend</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
              £{kpis.totalSpend}m
            </div>
          </div>
          <div className="h-8 w-px bg-[#E5E3DC]" aria-hidden="true" />
          <div>
            <div className="text-[#78756E]">Mean ICB Spread</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
              {kpis.avgIcb}%
            </div>
          </div>
          <div className="h-8 w-px bg-[#E5E3DC]" aria-hidden="true" />
          <div>
            <div className="text-[#78756E]">Friction-Gated</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#B45309]">
              {kpis.frictionCount}
            </div>
          </div>
        </div>
      </div>

      {showTermGuide && (
        <div className="bg-white border border-[#E5E3DC] rounded-lg p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
          <div>
            <div className="font-semibold text-[#1C1B18]">Actual NHS (Solid Blue Line)</div>
            <p className="mt-1 text-[#57544D] leading-relaxed">
              Real-world prescribing volume recorded across NHS England (from NHSBSA OpenPrescribing & secondary-care usage).
            </p>
          </div>
          <div>
            <div className="font-semibold text-[#1C1B18]">NICE Estimate (Dashed Line)</div>
            <p className="mt-1 text-[#57544D] leading-relaxed">
              NICE’s pre-launch Resource Impact model projecting expected patient uptake if local NHS budgets and clinics adopt on schedule.
            </p>
          </div>
          <div>
            <div className="font-semibold text-[#1C1B18]">ICB Adoption %</div>
            <p className="mt-1 text-[#57544D] leading-relaxed">
              Share of England’s 42 Integrated Care Boards actively prescribing the therapy above baseline formulary levels.
            </p>
          </div>
          <div>
            <div className="font-semibold text-[#1C1B18]">Constrained by Friction</div>
            <p className="mt-1 text-[#57544D] leading-relaxed">
              Indicates actual NHS uptake is trailing NICE’s estimate due to specialist clinic backlogs, ICB prior-approval rules, or budget caps.
            </p>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white border border-[#E5E3DC] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#78756E] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search drug, TA875, manufacturer, or bottleneck..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF9F6] border border-[#D6D3CB] rounded-md text-[#1C1B18] placeholder:text-[#78756E] focus:outline-none focus:ring-2 focus:ring-[#1E40AF]/20 focus:border-[#1E40AF]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {THERAPY_AREAS.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => setTherapyArea(area)}
                className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  therapyArea === area
                    ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                    : 'bg-white text-[#57544D] border-[#D6D3CB] hover:text-[#1C1B18]'
                }`}
              >
                {area}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by NHS uptake velocity"
            value={velocityFilter}
            onChange={(e) => setVelocityFilter(e.target.value as 'All' | UptakeVelocity)}
            className="px-3 py-2 text-xs font-medium bg-white border border-[#D6D3CB] rounded-md text-[#1C1B18] focus:outline-none focus:border-[#1E40AF] cursor-pointer"
          >
            {VELOCITIES.map((vel) => (
              <option key={vel} value={vel}>
                {vel === 'All' ? 'All Uptake Velocities' : vel}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2-Column Split: Appraisal Table (6 cols) + Commercial & Divergence Inspector (6 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-6 bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
          {filteredDrugs.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-[#1C1B18]">No NICE-to-NHS records match your search.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTherapyArea('All');
                  setVelocityFilter('All');
                }}
                className="mt-3 px-4 py-2 text-xs font-medium bg-[#1C1B18] text-white rounded-md cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F3F2EE] border-b border-[#E5E3DC] font-medium text-[#57544D]">
                    <th className="py-3 px-4">Drug · NICE TA</th>
                    <th className="py-3 px-3 text-right">Treated</th>
                    <th className="py-3 px-3 text-right">Spend</th>
                    <th className="py-3 px-3 text-right">ICB %</th>
                    <th className="py-3 px-4">Trajectory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E3DC]">
                  {filteredDrugs.map((drug) => {
                    const isSelected = selectedDrug.id === drug.id;
                    return (
                      <tr
                        key={drug.id}
                        onClick={() => handleSelectDrug(drug)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#EFF4FF]' : 'hover:bg-[#FAF9F6]'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1B18]">
                            {drug.brandName}{' '}
                            <span className="font-normal text-[#78756E]">({drug.genericName})</span>
                          </div>
                          <div className="text-[#78756E] mt-0.5">
                            <span className="font-mono text-[#1C1B18]">{drug.taRef}</span> · {drug.manufacturer} · {drug.niceOutcome}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#1C1B18]">
                          {drug.patientsTreated12mK.toFixed(1)}k
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#1C1B18]">
                          £{drug.annualSpendGbpM.toFixed(1)}m
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#57544D]">
                          {drug.icbAdoptionPct}%
                        </td>
                        <td className={`py-3 px-4 font-medium whitespace-nowrap ${velocityLabelColor(drug.uptakeVelocity)}`}>
                          {drug.uptakeVelocity}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right Divergence & Commercial Inspector (6 cols) */}
        <aside className="xl:col-span-6 bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-5">
          <div className="pb-4 border-b border-[#E5E3DC]">
            <div className="flex items-center justify-between gap-2 text-xs text-[#78756E]">
              <span>
                <span className="font-mono font-medium text-[#1C1B18]">{selectedDrug.taRef}</span> · Decided {selectedDrug.decisionDate}
              </span>
              <span className={`font-medium ${velocityLabelColor(selectedDrug.uptakeVelocity)}`}>
                {selectedDrug.uptakeVelocity}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-[#1C1B18] mt-1">
              {selectedDrug.brandName} ({selectedDrug.genericName})
            </h2>
            <div className="text-xs text-[#57544D] mt-1">
              {selectedDrug.manufacturer} · {selectedDrug.therapyArea} · {selectedDrug.mandateStatus}
            </div>
          </div>

          {/* Interactive Crosshair Divergence Chart */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-[#1C1B18]">
                Actual NHS Prescribing vs NICE Estimate (k Patients / Items)
              </span>
              <div className="flex items-center gap-4 text-xs text-[#57544D]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#1E40AF] inline-block" /> Actual NHS
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-t-2 border-dashed border-[#78756E] inline-block" /> NICE Estimate
                </span>
              </div>
            </div>
            <p className="text-[11px] text-[#78756E] mb-2">
              Compares real-world NHS dispensing against NICE’s pre-launch forecast; a wide gap shows local access or capacity bottlenecks.
            </p>

            <div className="bg-[#FAF9F6] border border-[#E5E3DC] rounded-md p-3">
              <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto overflow-visible">
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                  const val = seriesMax * frac;
                  const y = yPos(val);
                  return (
                    <g key={frac}>
                      <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="#E5E3DC" />
                      <text
                        x={pad.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="#78756E"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {val >= 10 ? Math.round(val) : val.toFixed(1)}k
                      </text>
                    </g>
                  );
                })}

                <path
                  d={selectedDrug.quarterlySeries
                    .map((pt, i) => {
                      const x = xPos(i, selectedDrug.quarterlySeries.length);
                      const y = yPos(pt.niceForecastItemsK);
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#78756E"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />

                <path
                  d={selectedDrug.quarterlySeries
                    .map((pt, i) => {
                      const x = xPos(i, selectedDrug.quarterlySeries.length);
                      const y = yPos(pt.actualItemsK);
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#1E40AF"
                  strokeWidth={2.5}
                />

                {hoveredQIdx !== null && (
                  <line
                    x1={xPos(hoveredQIdx, selectedDrug.quarterlySeries.length)}
                    y1={pad.top}
                    x2={xPos(hoveredQIdx, selectedDrug.quarterlySeries.length)}
                    y2={pad.top + plotH}
                    stroke="#1C1B18"
                    strokeOpacity={0.3}
                  />
                )}

                {selectedDrug.quarterlySeries.map((pt, i) => {
                  const x = xPos(i, selectedDrug.quarterlySeries.length);
                  const colW = plotW / selectedDrug.quarterlySeries.length;
                  return (
                    <g key={pt.quarter}>
                      <circle cx={x} cy={yPos(pt.niceForecastItemsK)} r={hoveredQIdx === i ? 4 : 3} fill="#FFFFFF" stroke="#78756E" strokeWidth={1.5} />
                      <circle cx={x} cy={yPos(pt.actualItemsK)} r={hoveredQIdx === i ? 5 : 3.5} fill="#1E40AF" stroke="#FFFFFF" strokeWidth={1.5} />
                      <text
                        x={x}
                        y={svgH - 8}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#57544D"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {pt.quarter}
                      </text>
                      <rect
                        x={x - colW / 2}
                        y={pad.top}
                        width={colW}
                        height={plotH}
                        fill="transparent"
                        className="cursor-crosshair"
                        onMouseEnter={() => setHoveredQIdx(i)}
                        onMouseLeave={() => setHoveredQIdx(null)}
                      />
                    </g>
                  );
                })}
              </svg>

              <div className="mt-2 pt-2 border-t border-[#E5E3DC] flex flex-wrap items-center justify-between text-xs font-mono tabular-nums text-[#57544D]">
                {hoveredPoint ? (
                  <>
                    <span className="font-medium text-[#1C1B18]">{hoveredPoint.quarter}</span>
                    <span>
                      Actual {hoveredPoint.actualItemsK.toFixed(1)}k · NICE Est. {hoveredPoint.niceForecastItemsK.toFixed(1)}k · £{hoveredPoint.nhsSpendGbpM.toFixed(1)}m
                    </span>
                  </>
                ) : (
                  <span className="font-sans text-[#78756E]">
                    Hover any quarter to inspect actual NHS prescribing vs NICE Resource Impact estimate.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-3 gap-4 py-3 border-y border-[#E5E3DC] text-xs">
            <div>
              <div className="text-[#78756E]">NICE Eligible</div>
              <div className="mt-1 font-mono font-medium tabular-nums text-[#1C1B18]">
                {selectedDrug.eligiblePopulationK.toLocaleString('en-GB')}k
              </div>
            </div>
            <div>
              <div className="text-[#78756E]">Treated (12m)</div>
              <div className="mt-1 font-mono font-medium tabular-nums text-[#1C1B18]">
                {selectedDrug.patientsTreated12mK.toLocaleString('en-GB')}k
              </div>
            </div>
            <div>
              <div className="text-[#78756E]">Cohort Penetration</div>
              <div className="mt-1 font-mono font-medium tabular-nums text-[#1E40AF]">
                {((selectedDrug.patientsTreated12mK / selectedDrug.eligiblePopulationK) * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Plain-English Commercial Takeaway */}
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-[#1C1B18]">
                Plain-English Commercial Takeaway
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[#57544D]">
                {selectedDrug.commercialTakeaway}
              </p>
            </div>

            <div className="p-3 bg-[#FAF9F6] border border-[#E5E3DC] rounded-md space-y-2 text-xs">
              <div>
                <span className="font-medium text-[#1C1B18]">NHS Payer Friction: </span>
                <span className="text-[#57544D]">{selectedDrug.payerFrictionFactor}</span>
              </div>
              <div>
                <span className="font-medium text-[#1C1B18]">Commercial Access: </span>
                <span className="text-[#57544D]">{selectedDrug.commercialAccessNote}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

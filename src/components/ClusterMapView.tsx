import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Building2, ChevronRight, ExternalLink, MapPin, Search, X } from 'lucide-react';
import { UK_CLUSTERS } from '../data/clustersAndJobs';
import { JobVacancy, RoleFamily, SeniorityLevel, SubSector } from '../types/lifeScience';
import { trackEvent } from '../utils/analyticsClient';
import { BubbleMetricMode, ClusterAggregate, UKClusterBubbleMap } from './UKClusterBubbleMap';

interface ClusterMapViewProps {
  vacancies: JobVacancy[];
  onFilteredJobsChange: (jobs: JobVacancy[]) => void;
}

const ROLE_FAMILIES: RoleFamily[] = [
  'Bioinformatics & AI',
  'Bioprocess & CGT',
  'Clinical Trials & Ops',
  'Regulatory & QA',
  'Med Chem & DMPK',
  'Medical Affairs & HEOR',
  'MedTech & Diagnostics',
];

const ROLE_FAMILY_LABELS: Record<RoleFamily, string> = {
  'Bioinformatics & AI': 'Bioinformatics, Data & AI',
  'Bioprocess & CGT': 'Bioprocess, Cell & Gene Therapy',
  'Clinical Trials & Ops': 'Clinical Trials & Operations',
  'Regulatory & QA': 'Regulatory Affairs & Quality (QA)',
  'Med Chem & DMPK': 'Medicinal Chemistry & Lab R&D',
  'Medical Affairs & HEOR': 'Medical Affairs & Health Economics',
  'MedTech & Diagnostics': 'MedTech, Devices & Diagnostics',
};

const SUB_SECTORS: SubSector[] = [
  'Biotech',
  'Big Pharma',
  'MedTech',
  'CRO / CDMO',
  'Research Inst.',
];

const SENIORITIES: SeniorityLevel[] = ['Junior', 'Mid', 'Senior', 'Principal / Director'];

type SortField = 'title' | 'employer' | 'clusterName' | 'salaryMaxGbp' | 'daysOpen';

const PAGE_SIZE = 10;

export const ClusterMapView: React.FC<ClusterMapViewProps> = ({
  vacancies,
  onFilteredJobsChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFamily, setSelectedRoleFamily] = useState<RoleFamily | 'All'>('All');
  const [selectedSubSector, setSelectedSubSector] = useState<SubSector | 'All'>('All');
  const [selectedSeniority, setSelectedSeniority] = useState<SeniorityLevel | 'All'>('All');
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [visaOnly, setVisaOnly] = useState(false);
  const [metricMode, setMetricMode] = useState<BubbleMetricMode>('vacancies');
  const [showGoldenTriangleRing, setShowGoldenTriangleRing] = useState(true);
  const [sortField, setSortField] = useState<SortField>('daysOpen');
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeJob, setActiveJob] = useState<JobVacancy | null>(null);

  const jobsWithoutClusterFilter = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return vacancies.filter((job) => {
      if (selectedRoleFamily !== 'All' && job.roleFamily !== selectedRoleFamily) return false;
      if (selectedSubSector !== 'All' && job.subSector !== selectedSubSector) return false;
      if (selectedSeniority !== 'All' && job.seniority !== selectedSeniority) return false;
      if (visaOnly && !job.visaSponsorship) return false;
      if (q) {
        const hay = `${job.title} ${job.employer} ${job.clusterName} ${job.skills.join(' ')} ${job.roleFamily}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vacancies, searchQuery, selectedRoleFamily, selectedSubSector, selectedSeniority, visaOnly]);

  const filteredJobs = useMemo(() => {
    const base = selectedClusterId
      ? jobsWithoutClusterFilter.filter((j) => j.clusterId === selectedClusterId)
      : jobsWithoutClusterFilter;

    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'salaryMaxGbp') {
        cmp = (a.salaryMaxGbp ?? 0) - (b.salaryMaxGbp ?? 0);
      } else if (sortField === 'daysOpen') {
        cmp = a.daysOpen - b.daysOpen;
      } else {
        cmp = a[sortField].localeCompare(b[sortField]);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [jobsWithoutClusterFilter, selectedClusterId, sortField, sortAsc]);

  useEffect(() => {
    onFilteredJobsChange(filteredJobs);
  }, [filteredJobs, onFilteredJobsChange]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    selectedRoleFamily,
    selectedSubSector,
    selectedSeniority,
    selectedClusterId,
    visaOnly,
    sortField,
    sortAsc,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = filteredJobs.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(safePage * PAGE_SIZE, filteredJobs.length);
  const paginatedJobs = useMemo(
    () => filteredJobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredJobs, safePage]
  );

  const handleSelectCluster = (clusterId: string | null) => {
    setSelectedClusterId(clusterId);
    if (clusterId) {
      const name = UK_CLUSTERS.find((c) => c.id === clusterId)?.name ?? clusterId;
      trackEvent('cluster_select', name);
    }
  };

  const clusterAggregates: ClusterAggregate[] = useMemo(() => {
    return UK_CLUSTERS.map((cluster) => {
      const clusterJobs = jobsWithoutClusterFilter.filter((j) => j.clusterId === cluster.id);
      const salaries = clusterJobs
        .filter((j) => j.salaryMinGbp !== null && j.salaryMaxGbp !== null)
        .map((j) => ((j.salaryMinGbp ?? 0) + (j.salaryMaxGbp ?? 0)) / 2)
        .sort((a, b) => a - b);

      const medianSalary =
        salaries.length > 0 ? salaries[Math.floor(salaries.length / 2)] : 0;
      const meanDays =
        clusterJobs.length > 0
          ? Math.round(clusterJobs.reduce((acc, j) => acc + j.daysOpen, 0) / clusterJobs.length)
          : 0;
      const juniorCount = clusterJobs.filter((j) => j.seniority === 'Junior').length;

      return {
        cluster,
        vacancyCount: clusterJobs.length,
        medianSalaryGbp: medianSalary,
        meanDaysOpen: meanDays,
        juniorSharePct: clusterJobs.length > 0 ? Math.round((juniorCount / clusterJobs.length) * 100) : 0,
        featuredCount: clusterJobs.filter((j) => j.isFeaturedPin).length,
      };
    });
  }, [jobsWithoutClusterFilter]);

  const topCities = useMemo(() => {
    const sorted = [...clusterAggregates].sort((a, b) => b.vacancyCount - a.vacancyCount);
    const nonZero = sorted.filter((a) => a.vacancyCount > 0);
    return (nonZero.length > 0 ? nonZero : sorted).slice(0, 5);
  }, [clusterAggregates]);

  const maxCityCount = Math.max(1, ...topCities.map((c) => c.vacancyCount));

  const roleFamilyCounts = useMemo(() => {
    const base = selectedClusterId
      ? vacancies.filter((j) => j.clusterId === selectedClusterId)
      : vacancies;

    const counts = ROLE_FAMILIES.map((rf) => ({
      roleFamily: rf,
      label: ROLE_FAMILY_LABELS[rf],
      count: base.filter((j) => j.roleFamily === rf).length,
    })).sort((a, b) => b.count - a.count);
    const maxCount = Math.max(1, ...counts.map((c) => c.count));
    return { counts, maxCount };
  }, [vacancies, selectedClusterId]);

  const kpis = useMemo(() => {
    const count = filteredJobs.length;
    const uniqueEmployers = new Set(filteredJobs.map((j) => j.employer)).size;
    const meanDays =
      count > 0
        ? (filteredJobs.reduce((acc, j) => acc + j.daysOpen, 0) / count).toFixed(1)
        : '0.0';
    const salaries = filteredJobs
      .filter((j) => j.salaryMinGbp && j.salaryMaxGbp)
      .map((j) => ((j.salaryMinGbp ?? 0) + (j.salaryMaxGbp ?? 0)) / 2)
      .sort((a, b) => a - b);
    const medianSalary =
      salaries.length > 0 ? salaries[Math.floor(salaries.length / 2)] : 0;
    const visaPct =
      count > 0
        ? Math.round((filteredJobs.filter((j) => j.visaSponsorship).length / count) * 100)
        : 0;

    return { count, uniqueEmployers, meanDays, medianSalary, visaPct };
  }, [filteredJobs]);

  const selectedCluster = useMemo(
    () => clusterAggregates.find((a) => a.cluster.id === selectedClusterId) ?? null,
    [clusterAggregates, selectedClusterId]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field !== 'salaryMaxGbp');
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedRoleFamily('All');
    setSelectedSubSector('All');
    setSelectedSeniority('All');
    setSelectedClusterId(null);
    setVisaOnly(false);
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    selectedRoleFamily !== 'All' ||
    selectedSubSector !== 'All' ||
    selectedSeniority !== 'All' ||
    selectedClusterId !== null ||
    visaOnly;

  return (
    <div className="space-y-6">
      {/* Editorial Intro + Unified Inline Telemetry Strip */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-[#E5E3DC]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1C1B18] text-balance">
            UK Life Science Job Cluster Map
          </h1>
          <p className="mt-1 text-sm text-[#57544D] max-w-2xl">
            Explore where UK biotech, pharma, and medtech employers hire — built for students, graduates, and scientists applying across 16 R&D hubs.
          </p>
          <p className="mt-1 text-xs font-mono text-[#78756E]">
            Update cadence: Live job feeds sync every 24 hours
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs shrink-0">
          <div>
            <div className="text-[#78756E]">Open Roles</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
              {kpis.count}
            </div>
          </div>
          <div className="h-8 w-px bg-[#E5E3DC]" aria-hidden="true" />
          <div>
            <div className="text-[#78756E]">Employers</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
              {kpis.uniqueEmployers}
            </div>
          </div>
          <div className="h-8 w-px bg-[#E5E3DC]" aria-hidden="true" />
          <div>
            <div className="text-[#78756E]">Median Base</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
              {kpis.medianSalary > 0
                ? `£${Math.round(kpis.medianSalary).toLocaleString('en-GB')}`
                : '—'}
            </div>
          </div>
          <div className="h-8 w-px bg-[#E5E3DC]" aria-hidden="true" />
          <div>
            <div className="text-[#78756E]">Mean Age · Visa</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1E40AF]">
              {kpis.meanDays}d · {kpis.visaPct}%
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Workspace: Compact Filter Rail (4 cols) + Spacious Map Stage (8 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <aside className="xl:col-span-4 bg-white border border-[#E5E3DC] rounded-lg p-5 flex flex-col gap-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="cluster-search" className="text-xs font-medium text-[#1C1B18]">
                Search Roles, Employers or Skills
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-xs text-[#1E40AF] hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-[#78756E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="cluster-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search PyTorch, GMP, Oxford..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF9F6] border border-[#D6D3CB] rounded-md text-[#1C1B18] placeholder:text-[#78756E] focus:outline-none focus:ring-2 focus:ring-[#1E40AF]/20 focus:border-[#1E40AF]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#1C1B18]">
                Role Family (by frequency)
              </span>
              {selectedRoleFamily !== 'All' && (
                <button
                  type="button"
                  onClick={() => setSelectedRoleFamily('All')}
                  className="text-xs text-[#57544D] hover:text-[#1C1B18] cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-1">
              {roleFamilyCounts.counts.map(({ roleFamily, label, count }) => {
                const isSelected = selectedRoleFamily === roleFamily;
                const widthPct = Math.round((count / roleFamilyCounts.maxCount) * 100);
                return (
                  <button
                    key={roleFamily}
                    type="button"
                    onClick={() =>
                      setSelectedRoleFamily(isSelected ? 'All' : roleFamily)
                    }
                    className={`w-full text-left px-3 py-2 rounded-md border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#EFF4FF] border-[#BFDBFE] text-[#1E3A8A]'
                        : 'bg-white border-transparent hover:bg-[#FAF9F6] text-[#3E3C37]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium truncate pr-2">{label}</span>
                      <span className="font-mono tabular-nums text-[#78756E]">{count}</span>
                    </div>
                    <div className="h-1 w-full bg-[#EFECE5] rounded overflow-hidden">
                      <div
                        className={`h-full transition-colors ${
                          isSelected ? 'bg-[#1E40AF]' : 'bg-[#8C887F]'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-[#1C1B18] mb-2">Sub-Sector</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedSubSector('All')}
                className={`px-3 py-2 text-xs font-medium rounded-md border text-left transition-colors cursor-pointer ${
                  selectedSubSector === 'All'
                    ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                    : 'bg-white text-[#3E3C37] border-[#D6D3CB] hover:bg-[#FAF9F6]'
                }`}
              >
                All Sectors
              </button>
              {SUB_SECTORS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() =>
                    setSelectedSubSector(selectedSubSector === sec ? 'All' : sec)
                  }
                  className={`px-3 py-2 text-xs font-medium rounded-md border text-left truncate transition-colors cursor-pointer ${
                    selectedSubSector === sec
                      ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                      : 'bg-white text-[#3E3C37] border-[#D6D3CB] hover:bg-[#FAF9F6]'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#E5E3DC]">
            <div>
              <span className="block text-xs font-medium text-[#1C1B18] mb-2">Seniority</span>
              <div className="flex flex-wrap gap-2">
                {SENIORITIES.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() =>
                      setSelectedSeniority(selectedSeniority === lvl ? 'All' : lvl)
                    }
                    className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedSeniority === lvl
                        ? 'bg-[#1E40AF] text-white border-[#1E40AF]'
                        : 'bg-white text-[#3E3C37] border-[#D6D3CB] hover:bg-[#FAF9F6]'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center justify-between text-xs font-medium text-[#1E40AF] cursor-pointer">
                <span>Entry-Level & Graduate Roles Only</span>
                <input
                  type="checkbox"
                  checked={selectedSeniority === 'Junior'}
                  onChange={(e) => setSelectedSeniority(e.target.checked ? 'Junior' : 'All')}
                  className="h-4 w-4 rounded border-[#D6D3CB] text-[#1E40AF] focus:ring-[#1E40AF]"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-[#3E3C37] cursor-pointer">
                <span>UK Skilled Worker visa sponsorship</span>
                <input
                  type="checkbox"
                  checked={visaOnly}
                  onChange={(e) => setVisaOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-[#D6D3CB] text-[#1E40AF] focus:ring-[#1E40AF]"
                />
              </label>
            </div>
          </div>

          {/* Small Visual Pane: Top 5 Cities by Listing */}
          <div className="pt-4 border-t border-[#E5E3DC]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-medium text-[#1C1B18]">Top 5 Cities</span>
              <span className="text-[11px] font-mono text-[#78756E]">Listings</span>
            </div>
            <div className="space-y-1.5">
              {topCities.map((item, idx) => {
                const isSelected = selectedClusterId === item.cluster.id;
                const widthPct = Math.round((item.vacancyCount / maxCityCount) * 100);
                return (
                  <button
                    key={item.cluster.id}
                    type="button"
                    onClick={() =>
                      handleSelectCluster(isSelected ? null : item.cluster.id)
                    }
                    className={`w-full text-left rounded-md px-2 py-1 transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#EFF4FF]' : 'hover:bg-[#FAF9F6]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-[#1C1B18] truncate pr-2">
                        <span className="font-mono text-[#78756E] mr-1.5">{idx + 1}.</span>
                        {item.cluster.name}
                      </span>
                      <span className="font-mono tabular-nums text-[#57544D] shrink-0">
                        {item.vacancyCount.toLocaleString('en-GB')}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-[#EFECE5] rounded overflow-hidden">
                      <div
                        className={`h-full transition-colors ${
                          isSelected || idx === 0 ? 'bg-[#1E40AF]' : 'bg-[#8C887F]'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Spacious Cartographic Bubble Map Stage */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          <UKClusterBubbleMap
            aggregates={clusterAggregates}
            selectedClusterId={selectedClusterId}
            onSelectCluster={handleSelectCluster}
            metricMode={metricMode}
            onMetricModeChange={setMetricMode}
            showGoldenTriangleRing={showGoldenTriangleRing}
            onToggleGoldenTriangleRing={() => setShowGoldenTriangleRing((v) => !v)}
          />

          {/* Selected Cluster Summary Strip (Appears cleanly when a bubble is selected) */}
          {selectedCluster && (
            <div className="bg-white border border-[#E5E3DC] rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="text-xs text-[#78756E]">
                  {selectedCluster.cluster.region} · {(selectedCluster.cluster.labSpaceSqFtK / 1000).toFixed(2)}M sq ft lab stock · {selectedCluster.cluster.vcSharePct}% UK VC share
                </div>
                <h2 className="text-base font-semibold text-[#1C1B18]">
                  {selectedCluster.cluster.name}
                </h2>
                <p className="text-xs text-[#57544D] leading-relaxed">
                  {selectedCluster.cluster.summary}
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-2 text-xs text-[#57544D]">
                  <MapPin className="w-4 h-4 text-[#78756E] shrink-0" />
                  <span>{selectedCluster.cluster.hubs.join(' · ')}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSelectCluster(null)}
                  className="px-3 py-2 text-xs font-medium border border-[#D6D3CB] rounded-md text-[#1C1B18] hover:bg-[#FAF9F6] cursor-pointer whitespace-nowrap"
                >
                  Show All UK
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Browsable Vacancies Table (Capped at 10 per page) */}
      <section className="bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E3DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1C1B18]">
              Indexed UK Vacancies ({filteredJobs.length.toLocaleString('en-GB')})
            </h2>
            <p className="text-xs font-mono text-[#78756E] mt-0.5 tabular-nums">
              Showing {startIdx.toLocaleString('en-GB')}–{endIdx.toLocaleString('en-GB')} of{' '}
              {filteredJobs.length.toLocaleString('en-GB')} postings · page {safePage} of{' '}
              {totalPages.toLocaleString('en-GB')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-[#78756E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search keywords, role, employer..."
                aria-label="Filter indexed UK vacancies by keyword"
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#FAF9F6] border border-[#D6D3CB] rounded-md text-[#1C1B18] placeholder:text-[#78756E] focus:outline-none focus:ring-2 focus:ring-[#1E40AF]/20 focus:border-[#1E40AF]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear keyword search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#78756E] hover:text-[#1C1B18] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {selectedCluster && (
              <button
                type="button"
                onClick={() => handleSelectCluster(null)}
                className="text-xs font-medium text-[#1E40AF] hover:underline cursor-pointer whitespace-nowrap"
              >
                Clear {selectedCluster.cluster.name}
              </button>
            )}
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#1C1B18]">
              No matching UK life science roles found.
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="mt-4 px-4 py-2 text-xs font-medium bg-[#1C1B18] text-white rounded-md hover:bg-[#3E3C37] cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E3DC] bg-[#F3F2EE] text-xs font-medium text-[#57544D]">
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('title')}
                      className="inline-flex items-center gap-1 hover:text-[#1C1B18] cursor-pointer"
                    >
                      Role Title <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('employer')}
                      className="inline-flex items-center gap-1 hover:text-[#1C1B18] cursor-pointer"
                    >
                      Employer <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('clusterName')}
                      className="inline-flex items-center gap-1 hover:text-[#1C1B18] cursor-pointer"
                    >
                      Cluster <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </th>
                  <th className="py-3 px-4">Discipline · Sector</th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('salaryMaxGbp')}
                      className="inline-flex items-center gap-1 hover:text-[#1C1B18] cursor-pointer"
                    >
                      Base Salary (GBP) <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('daysOpen')}
                      className="inline-flex items-center gap-1 hover:text-[#1C1B18] cursor-pointer"
                    >
                      Age <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </th>
                  <th className="py-3 px-4 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E3DC] text-xs">
                {paginatedJobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => setActiveJob(job)}
                    className="hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-medium text-[#1C1B18]">
                      <div>{job.title}</div>
                      <div className="mt-0.5 font-normal text-[#78756E]">
                        {job.seniority} · {job.hybridPolicy}
                        {job.visaSponsorship ? ' · Visa Sponsor' : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[#1C1B18]">
                      <div>{job.employer}</div>
                      <div className="text-[#78756E]">{job.postedSource}</div>
                    </td>
                    <td className="py-3 px-4 text-[#57544D]">{job.clusterName}</td>
                    <td className="py-3 px-4 text-[#57544D]">
                      <div>{job.roleFamily}</div>
                      <div className="text-[#78756E]">{job.subSector}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#1C1B18]">
                      {job.salaryMinGbp && job.salaryMaxGbp
                        ? `£${job.salaryMinGbp.toLocaleString('en-GB')}–£${job.salaryMaxGbp.toLocaleString('en-GB')}`
                        : 'Undisclosed'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#57544D]">
                      {job.daysOpen}d
                    </td>
                    <td className="py-3 px-4 text-[#78756E]">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-[#E5E3DC] bg-[#FAF9F6] flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-mono tabular-nums text-[#57544D]">
              Showing {startIdx.toLocaleString('en-GB')}–{endIdx.toLocaleString('en-GB')} of{' '}
              {filteredJobs.length.toLocaleString('en-GB')} postings · page {safePage} of{' '}
              {totalPages.toLocaleString('en-GB')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 font-medium border border-[#D6D3CB] rounded-md bg-white text-[#1C1B18] hover:bg-[#F3F2EE] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 font-medium border border-[#D6D3CB] rounded-md bg-white text-[#1C1B18] hover:bg-[#F3F2EE] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </>
        )}
      </section>

      {/* Vacancy Detail Drawer */}
      {activeJob && (
        <div
          className="fixed inset-0 z-50 bg-[#1C1B18]/40 flex justify-end"
          onClick={() => setActiveJob(null)}
        >
          <div
            className="w-full max-w-lg bg-white h-full border-l border-[#E5E3DC] p-6 overflow-y-auto flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E5E3DC]">
                <div>
                  <div className="text-xs font-mono text-[#78756E]">
                    {activeJob.id} · {activeJob.postedSource}
                  </div>
                  <h3 className="text-lg font-semibold text-[#1C1B18] mt-1">
                    {activeJob.title}
                  </h3>
                  <div className="mt-1 flex items-center gap-2 text-sm text-[#57544D]">
                    <Building2 className="w-4 h-4 text-[#78756E]" />
                    <span>{activeJob.employer}</span>
                    <span>·</span>
                    <span>{activeJob.clusterName}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveJob(null)}
                  aria-label="Close vacancy details"
                  className="p-2 text-[#57544D] hover:text-[#1C1B18] border border-[#D6D3CB] rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 py-3 border-b border-[#E5E3DC] text-xs">
                <div>
                  <div className="text-[#78756E]">Base Salary Band</div>
                  <div className="mt-1 font-mono font-medium tabular-nums text-sm text-[#1C1B18]">
                    {activeJob.salaryMinGbp && activeJob.salaryMaxGbp
                      ? `£${activeJob.salaryMinGbp.toLocaleString('en-GB')}–£${activeJob.salaryMaxGbp.toLocaleString('en-GB')}`
                      : 'Undisclosed'}
                  </div>
                </div>
                <div>
                  <div className="text-[#78756E]">Posting Age</div>
                  <div className="mt-1 font-mono font-medium tabular-nums text-sm text-[#1C1B18]">
                    {activeJob.daysOpen} days open
                  </div>
                </div>
                <div>
                  <div className="text-[#78756E]">Discipline & Seniority</div>
                  <div className="mt-1 font-medium text-[#1C1B18]">
                    {activeJob.roleFamily} · {activeJob.seniority}
                  </div>
                </div>
                <div>
                  <div className="text-[#78756E]">Work Pattern & Visa</div>
                  <div className="mt-1 font-medium text-[#1C1B18]">
                    {activeJob.hybridPolicy} · {activeJob.visaSponsorship ? 'Visa Sponsored' : 'UK Right to Work'}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-medium text-[#1C1B18] mb-2">Role Overview</h4>
                <p className="text-sm text-[#57544D] leading-relaxed">{activeJob.summary}</p>
              </div>

              <div>
                <h4 className="text-xs font-medium text-[#1C1B18] mb-2">Technical Requirements</h4>
                <div className="text-xs text-[#1C1B18] font-mono bg-[#FAF9F6] border border-[#E5E3DC] rounded-md p-3">
                  {activeJob.skills.join('  ·  ')}
                </div>
              </div>
            </div>

            <div className="pt-5 border-t border-[#E5E3DC] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  handleSelectCluster(activeJob.clusterId);
                  setActiveJob(null);
                }}
                className="px-3 py-2 text-xs font-medium border border-[#D6D3CB] rounded-md text-[#1C1B18] hover:bg-[#FAF9F6] cursor-pointer"
              >
                Filter to {activeJob.clusterName}
              </button>
              <div className="flex items-center gap-2">
                <a
                  href={
                    activeJob.applyUrl ||
                    `https://www.google.com/search?q=${encodeURIComponent(
                      `${activeJob.employer} ${activeJob.title} careers UK`
                    )}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#1E40AF] text-white rounded-md hover:bg-[#1D4ED8] transition-colors"
                >
                  Apply / View Role
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setActiveJob(null)}
                  className="px-3 py-2 text-xs font-medium bg-[#1C1B18] text-white rounded-md hover:bg-[#3E3C37] cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type {
  ApiUsageItem,
  LiveFeedStatus,
  LiveNiceGuidanceItem,
  SyncedMarketSnapshot,
} from '../server/dataSync';
import { AnalyticsAndPipelineView } from './components/AnalyticsAndPipelineView';
import { ClusterMapView } from './components/ClusterMapView';
import { MarketForecastView } from './components/MarketForecastView';
import { NewsletterSignup } from './components/NewsletterSignup';
import { NiceNhsTrackerView } from './components/NiceNhsTrackerView';
import { TrackerGuideSection } from './components/TrackerGuideSection';
import { UK_JOB_VACANCIES } from './data/clustersAndJobs';
import { SALARY_BENCHMARKS_GBP } from './data/marketForecastData';
import { NICE_NHS_DRUGS } from './data/niceNhsData';
import { JobVacancy, NiceDrugRecord } from './types/lifeScience';
import { trackEvent } from './utils/analyticsClient';
import { downloadCsv } from './utils/exportCsv';

type PublicModule = 'clusters' | 'forecast' | 'nice-nhs' | 'scope';

const NAV_ITEMS: { id: PublicModule; label: string }[] = [
  { id: 'clusters', label: 'Cluster Map' },
  { id: 'forecast', label: 'Market Forecast' },
  { id: 'nice-nhs', label: 'NICE-to-NHS' },
  { id: 'scope', label: 'Scope & Method' },
];

function isOwnerAnalyticsPath(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname.replace(/\/+$/, '');
  const h = window.location.hash.replace(/\/+$/, '');
  return (
    p === '/owner-analytics' ||
    p.endsWith('/owner-analytics') ||
    h === '#/owner-analytics' ||
    h === '#owner-analytics'
  );
}

export default function App() {
  const [activeModule, setActiveModule] = useState<PublicModule>('clusters');
  const [showHiddenOwnerPage, setShowHiddenOwnerPage] = useState<boolean>(isOwnerAnalyticsPath);
  const [vacancies, setVacancies] = useState<JobVacancy[]>(UK_JOB_VACANCIES);
  const [niceDrugs, setNiceDrugs] = useState<NiceDrugRecord[]>(NICE_NHS_DRUGS);
  const [filteredJobs, setFilteredJobs] = useState<JobVacancy[]>(UK_JOB_VACANCIES);
  const [filteredDrugs, setFilteredDrugs] = useState<NiceDrugRecord[]>(NICE_NHS_DRUGS);
  const [feeds, setFeeds] = useState<LiveFeedStatus[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsageItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string>(new Date().toISOString());
  const [latestNiceFeed, setLatestNiceFeed] = useState<LiveNiceGuidanceItem[]>([]);

  useEffect(() => {
    const syncRoute = () => setShowHiddenOwnerPage(isOwnerAnalyticsPath());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const loadLiveMarketData = async () => {
    const applySnapshot = (snap: SyncedMarketSnapshot) => {
      if (Array.isArray(snap.vacancies) && snap.vacancies.length > 0) {
        setVacancies(snap.vacancies);
      }
      if (Array.isArray(snap.niceDrugs) && snap.niceDrugs.length > 0) {
        setNiceDrugs(snap.niceDrugs);
      }
      if (Array.isArray(snap.feeds)) setFeeds(snap.feeds);
      if (Array.isArray(snap.apiUsage)) setApiUsage(snap.apiUsage);
      if (snap.lastSyncAt) setLastSyncAt(snap.lastSyncAt);
      if (Array.isArray(snap.latestNiceFeed)) setLatestNiceFeed(snap.latestNiceFeed);
    };

    try {
      const res = await fetch('/api/market-data');
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        applySnapshot((await res.json()) as SyncedMarketSnapshot);
        return;
      }
    } catch {
      // Fallback to static GitHub Pages snapshot below
    }

    try {
      const staticRes = await fetch('./data/live-snapshot.json');
      if (staticRes.ok) {
        applySnapshot((await staticRes.json()) as SyncedMarketSnapshot);
      }
    } catch {
      // Built-in baseline dataset already loaded
    }
  };

  useEffect(() => {
    void loadLiveMarketData();
  }, []);

  useEffect(() => {
    if (!showHiddenOwnerPage) {
      trackEvent('page_view', activeModule);
    }
  }, [activeModule, showHiddenOwnerPage]);

  const handleRefreshSync = async (token: string) => {
    const res = await fetch('/api/sync/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { snapshot?: SyncedMarketSnapshot };
      if (json.snapshot) {
        setVacancies(json.snapshot.vacancies);
        setNiceDrugs(json.snapshot.niceDrugs);
        setFeeds(json.snapshot.feeds);
        if (Array.isArray(json.snapshot.apiUsage)) setApiUsage(json.snapshot.apiUsage);
        setLastSyncAt(json.snapshot.lastSyncAt);
        setLatestNiceFeed(json.snapshot.latestNiceFeed);
      }
    }
  };

  const handleNavigateModule = (mod: PublicModule) => {
    if (showHiddenOwnerPage) {
      window.history.pushState({}, '', '/');
      setShowHiddenOwnerPage(false);
    }
    setActiveModule(mod);
  };

  const handleExitHiddenView = () => {
    window.history.pushState({}, '', '/');
    setShowHiddenOwnerPage(false);
  };

  const handlePrimaryExport = () => {
    if (activeModule === 'clusters' || activeModule === 'scope') {
      trackEvent('csv_export', activeModule);
      downloadCsv(
        'boundry-uk-life-science-vacancies.csv',
        [
          'ID',
          'Role Title',
          'Employer',
          'Cluster',
          'Role Family',
          'Sub-Sector',
          'Seniority',
          'Min Salary GBP',
          'Max Salary GBP',
          'Days Open',
          'Visa Sponsorship',
          'Source',
        ],
        filteredJobs.map((j) => [
          j.id,
          j.title,
          j.employer,
          j.clusterName,
          j.roleFamily,
          j.subSector,
          j.seniority,
          j.salaryMinGbp,
          j.salaryMaxGbp,
          j.daysOpen,
          j.visaSponsorship ? 'Yes' : 'No',
          j.postedSource,
        ])
      );
      return;
    }

    if (activeModule === 'nice-nhs') {
      trackEvent('csv_export', 'nice-nhs');
      downloadCsv(
        'boundry-nice-to-nhs-drug-tracker.csv',
        [
          'NICE TA',
          'Brand',
          'Generic',
          'Manufacturer',
          'Therapy Area',
          'NICE Outcome',
          'Decision Date',
          'Eligible Pop (k)',
          'Treated 12m (k)',
          'Annual Spend (GBP m)',
          'ICB Adoption %',
          'Uptake Velocity',
          'Commercial Takeaway',
        ],
        filteredDrugs.map((d) => [
          d.taRef,
          d.brandName,
          d.genericName,
          d.manufacturer,
          d.therapyArea,
          d.niceOutcome,
          d.decisionDate,
          d.eligiblePopulationK,
          d.patientsTreated12mK,
          d.annualSpendGbpM,
          d.icbAdoptionPct,
          d.uptakeVelocity,
          d.commercialTakeaway,
        ])
      );
      return;
    }

    trackEvent('csv_export', 'forecast');
    downloadCsv(
      'boundry-uk-life-science-salary-benchmarks.csv',
      [
        'Role Family',
        'Golden Triangle P25',
        'Golden Triangle Median',
        'Golden Triangle P75',
        'Regional Median',
        'YoY Change %',
      ],
      SALARY_BENCHMARKS_GBP.map((s) => [
        s.roleFamily,
        s.gtP25,
        s.gtMedian,
        s.gtP75,
        s.regMedian,
        s.yoyChangePct,
      ])
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#1C1B18]">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#E5E3DC]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => handleNavigateModule('clusters')}
            className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-[#1C1B18] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <img
              src="./assets/aistudio/image0_c88c1611.png"
              alt="Boundry UK logo"
              className="w-8 h-8 object-contain shrink-0"
            />
            <span>Boundry UK</span>
          </button>

          <nav className="flex items-center gap-6 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = !showHiddenOwnerPage && activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigateModule(item.id)}
                  className={`py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-[#1E40AF] text-[#1C1B18]'
                      : 'border-transparent text-[#57544D] hover:text-[#1C1B18]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handlePrimaryExport}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#1C1B18] text-white rounded-md hover:bg-[#3E3C37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-8">
        {showHiddenOwnerPage ? (
          <AnalyticsAndPipelineView
            feeds={feeds}
            apiUsage={apiUsage}
            lastSyncAt={lastSyncAt}
            latestNiceFeed={latestNiceFeed}
            onRefreshSync={handleRefreshSync}
            onExitHiddenView={handleExitHiddenView}
          />
        ) : (
          <>
            {activeModule === 'clusters' && (
              <ClusterMapView
                vacancies={vacancies}
                onFilteredJobsChange={setFilteredJobs}
              />
            )}
            {activeModule === 'forecast' && <MarketForecastView />}
            {activeModule === 'nice-nhs' && (
              <NiceNhsTrackerView
                drugs={niceDrugs}
                onFilteredDrugsChange={setFilteredDrugs}
              />
            )}
            {activeModule === 'scope' && (
              <TrackerGuideSection vacancies={vacancies} lastSyncAt={lastSyncAt} />
            )}
          </>
        )}
      </main>

      {!showHiddenOwnerPage && <NewsletterSignup />}

      {/* Clean Public Footer (no link to hidden /owner-analytics route) */}
      <footer className="border-t border-[#E5E3DC] bg-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#78756E]">
          <div>
            Boundry UK — Open UK Life Science Cluster, Market Forecast & NICE-to-NHS Intelligence.
          </div>
          <div>
            Open Data: Direct UK Biotech ATS · Jooble UK · Reed UK · OpenPrescribing · NICE
          </div>
        </div>
      </footer>
    </div>
  );
}

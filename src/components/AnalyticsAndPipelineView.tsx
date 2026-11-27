import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, Copy, Download, Lock, RefreshCw, XCircle } from 'lucide-react';
import type { ApiUsageItem, LiveFeedStatus, LiveNiceGuidanceItem } from '../../server/dataSync';
import type { NewsletterSubscriber, NewsletterTrack } from '../../server/newsletterStore';
import { downloadCsv } from '../utils/exportCsv';

interface AnalyticsSummary {
  totalViews: number;
  uniqueVisitors: number;
  totalEvents: number;
  csvExports: number;
  viewsByModule: Record<string, number>;
  topClusters: { name: string; clicks: number }[];
  topDrugs: { name: string; clicks: number }[];
  dailySeries: { date: string; views: number; exports: number }[];
  lastUpdatedAt: string;
}

interface NewsletterSummary {
  totalSubscribers: number;
  byTrack: Record<NewsletterTrack, number>;
  subscribers: NewsletterSubscriber[];
}

interface AnalyticsAndPipelineViewProps {
  feeds: LiveFeedStatus[];
  apiUsage: ApiUsageItem[];
  lastSyncAt: string;
  latestNiceFeed: LiveNiceGuidanceItem[];
  onRefreshSync: (token: string) => Promise<void>;
  onExitHiddenView: () => void;
}

const GITHUB_WORKFLOW_SNIPPET = `name: Daily UK Life Science & NHS Data Sync
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

jobs:
  sync-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - env:
          JOOBLE_API_KEY: \${{ secrets.JOOBLE_API_KEY }}
          REED_API_KEY: \${{ secrets.REED_API_KEY }}
          SERPAPI_API_KEY: \${{ secrets.SERPAPI_API_KEY }}
          ADZUNA_APP_ID: \${{ secrets.ADZUNA_APP_ID }}
          ADZUNA_APP_KEY: \${{ secrets.ADZUNA_APP_KEY }}
          ENABLE_ADZUNA_IN_CI: \${{ secrets.ENABLE_ADZUNA_IN_CI }}
        run: node scripts/sync-uk-data.mjs
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          cname: boundry.space`;

export const AnalyticsAndPipelineView: React.FC<AnalyticsAndPipelineViewProps> = ({
  feeds,
  apiUsage,
  lastSyncAt,
  latestNiceFeed,
  onRefreshSync,
  onExitHiddenView,
}) => {
  // Bearer token held strictly in React memory (never persisted to localStorage/sessionStorage)
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<{ needsSetup: boolean; envConfigured: boolean } | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [newsletter, setNewsletter] = useState<NewsletterSummary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/owner/auth-status')
      .then((res) => res.json())
      .then((data: { needsSetup: boolean; envConfigured: boolean }) => setAuthStatus(data))
      .catch(() => setAuthError('Unable to reach backend authentication service.'));
  }, []);

  const loadAnalytics = async (token: string) => {
    try {
      const [resAnalytics, resSubs] = await Promise.all([
        fetch('/api/analytics/summary', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/newsletter/subscribers', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (resAnalytics.status === 401 || resSubs.status === 401) {
        setOwnerToken(null);
        setAuthError('Session expired. Please sign in again.');
        return;
      }
      if (resAnalytics.ok) {
        setAnalytics((await resAnalytics.json()) as AnalyticsSummary);
      }
      if (resSubs.ok) {
        setNewsletter((await resSubs.json()) as NewsletterSummary);
      }
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    if (ownerToken) {
      void loadAnalytics(ownerToken);
    }
  }, [ownerToken]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const endpoint = authStatus?.needsSetup ? '/api/owner/setup' : '/api/owner/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const json = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !json.token) {
        setAuthError(json.error || 'Authentication failed.');
        return;
      }
      setPasscodeInput('');
      setOwnerToken(json.token);
      setAuthStatus((prev) => (prev ? { ...prev, needsSetup: false } : prev));
    } catch {
      setAuthError('Network error while verifying passcode.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleManualSync = async () => {
    if (!ownerToken) return;
    setSyncing(true);
    try {
      await onRefreshSync(ownerToken);
      await loadAnalytics(ownerToken);
    } finally {
      setSyncing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(GITHUB_WORKFLOW_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!ownerToken) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E5E3DC]">
          <div>
            <div className="text-xs font-mono text-[#78756E]">Private Route · /owner-analytics</div>
            <h1 className="text-lg font-semibold text-[#1C1B18] mt-1">
              {authStatus?.needsSetup ? 'Claim Owner Analytics Passcode' : 'Owner Analytics Sign-In'}
            </h1>
          </div>
          <Lock className="w-4 h-4 text-[#78756E] shrink-0 mt-1" />
        </div>

        <p className="text-xs text-[#57544D] leading-relaxed">
          {authStatus?.needsSetup
            ? 'Set an initial owner passcode (min 4 characters) to lock this hidden analytics, newsletter, and data-sync console. You can override it anytime via OWNER_ANALYTICS_PASSCODE in Secrets.'
            : 'This page is hidden from public navigation and protected by server-side authentication.'}
        </p>

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <div>
            <label htmlFor="owner-passcode" className="block text-xs font-medium text-[#1C1B18] mb-1.5">
              {authStatus?.needsSetup ? 'Create Owner Passcode' : 'Owner Passcode'}
            </label>
            <input
              id="owner-passcode"
              type="password"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              placeholder="Minimum 4 characters"
              minLength={4}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 text-xs bg-[#FAF9F6] border border-[#D6D3CB] rounded-md text-[#1C1B18] focus:outline-none focus:ring-2 focus:ring-[#1E40AF]/20 focus:border-[#1E40AF]"
            />
          </div>

          {authError && (
            <div className="text-xs text-[#B91C1C] bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {authError}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onExitHiddenView}
              className="px-3 py-2 text-xs font-medium border border-[#D6D3CB] rounded-md text-[#57544D] hover:text-[#1C1B18] cursor-pointer"
            >
              Back to Public Site
            </button>
            <button
              type="submit"
              disabled={authSubmitting || !authStatus}
              className="px-4 py-2 text-xs font-medium bg-[#1C1B18] text-white rounded-md hover:bg-[#3E3C37] disabled:opacity-50 cursor-pointer"
            >
              {authSubmitting
                ? 'Verifying...'
                : authStatus?.needsSetup
                ? 'Claim Passcode & Enter'
                : 'Unlock Analytics'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const formatTs = (iso?: string) => {
    if (!iso) return 'Not yet synced';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB');
  };

  const niceFeed = feeds.find((f) => f.source.includes('NICE'));
  const opFeed = feeds.find(
    (f) => f.source.includes('NHSBSA') || f.source.includes('OpenPrescribing')
  );
  const atsFeed = feeds.find((f) => f.source.includes('Direct UK Biotech ATS'));
  const jobFeeds = feeds.filter(
    (f) => !f.source.includes('NICE') && !f.source.includes('NHSBSA') && !f.source.includes('OpenPrescribing')
  );
  const liveJobFeedsOk = jobFeeds.some((f) => f.status === 'live' && f.recordsFetched > 0);
  const jobFeedTs = atsFeed?.lastSyncedAt || lastSyncAt;
  const syncAgeHours = (Date.now() - Date.parse(lastSyncAt || '')) / (1000 * 60 * 60);
  const syncIsRecent = Number.isFinite(syncAgeHours) && syncAgeHours <= 36;
  const liveFeedCount = feeds.filter((f) => f.status === 'live').length;

  const tileRows = [
    {
      page: 'Cluster Map',
      tile: 'Bubble Map, Top 5 Cities & Live Vacancies',
      updated: formatTs(jobFeedTs),
      cadence: 'Every 24h',
      source: 'Direct ATS · NHS Jobs · Reed · SerpAPI · Adzuna',
      isOk: liveJobFeedsOk && syncIsRecent,
      statusLabel: liveJobFeedsOk && syncIsRecent ? 'OK' : 'Check feed',
    },
    {
      page: 'Cluster Map',
      tile: 'Lab Capacity (sq ft) & UK VC Share',
      updated: 'Q4 2026',
      cadence: 'Quarterly',
      source: 'UK Science Park & BIA Infrastructure Audit',
      isOk: true,
      statusLabel: 'OK',
    },
    {
      page: 'Market Forecast',
      tile: '2025–2035 Trajectory & Quarterly Breakdown',
      updated: 'Q4 2026',
      cadence: 'Quarterly',
      source: 'ONS · BioIndustry Association · ABPI Series',
      isOk: true,
      statusLabel: 'OK',
    },
    {
      page: 'Market Forecast',
      tile: 'GBP Salary Bands, Sub-Sectors & Skill Shifts',
      updated: `Q4 2026 · ${formatTs(lastSyncAt)}`,
      cadence: 'Quarterly + 24h',
      source: 'Regional Pay Benchmarks & Live Role Demand',
      isOk: syncIsRecent,
      statusLabel: syncIsRecent ? 'OK' : 'Stale',
    },
    {
      page: 'NICE-to-NHS',
      tile: 'NICE Technology Appraisals & Guidance',
      updated: formatTs(niceFeed?.lastSyncedAt || lastSyncAt),
      cadence: 'Every 24h',
      source: 'NICE Technology Appraisals Feed',
      isOk: niceFeed?.status === 'live',
      statusLabel: niceFeed?.status === 'live' ? 'OK' : 'Fallback',
    },
    {
      page: 'NICE-to-NHS',
      tile: 'Actual NHS Prescribing & Divergence Chart',
      updated: formatTs(opFeed?.lastSyncedAt || lastSyncAt),
      cadence: 'Monthly NHSBSA',
      source: 'NHSBSA English Prescribing Dataset API',
      isOk: opFeed?.status === 'live',
      statusLabel: opFeed?.status === 'live' ? 'OK' : 'Fallback',
    },
    {
      page: 'Scope & Method',
      tile: 'Live Snapshot Takeaways & Hub Counts',
      updated: formatTs(lastSyncAt),
      cadence: 'Every 24h',
      source: 'Live Snapshot Summary',
      isOk: liveJobFeedsOk && syncIsRecent,
      statusLabel: liveJobFeedsOk && syncIsRecent ? 'OK' : 'Stale',
    },
  ];

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Compact Header + Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E3DC]">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#1C1B18]">
            Owner Analytics &amp; Sync Console
          </h1>
          <p className="text-xs font-mono text-[#78756E]">
            boundry.space · Last sync: {formatTs(lastSyncAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1C1B18] text-white rounded-md hover:bg-[#3E3C37] disabled:opacity-60 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Run Live Sync'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOwnerToken(null);
              onExitHiddenView();
            }}
            className="px-3 py-1.5 text-xs font-medium border border-[#D6D3CB] rounded-md text-[#57544D] hover:text-[#1C1B18] cursor-pointer"
          >
            Lock &amp; Exit
          </button>
        </div>
      </div>

      {/* Compact 4-KPI Bar */}
      <div className="bg-white border border-[#E5E3DC] rounded-lg px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-[#78756E]">Total Page Views</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
            {analytics?.totalViews ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-[#78756E]">Unique Sessions</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
            {analytics?.uniqueVisitors ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-[#78756E]">CSV Exports</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-[#1E40AF]">
            {analytics?.csvExports ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-[#78756E]">Subscribers · Live Feeds</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
            {newsletter?.totalSubscribers ?? 0} · {liveFeedCount}/{feeds.length}
          </div>
        </div>
      </div>

      {/* Compact Page & Tile Update Status Table */}
      <section className="bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#E5E3DC] flex items-center justify-between gap-2 bg-[#F3F2EE]">
          <h2 className="text-xs font-semibold text-[#1C1B18]">Page &amp; Tile Update Status</h2>
          <span className="text-[11px] font-mono text-[#78756E]">
            {tileRows.filter((r) => r.isOk).length}/{tileRows.length} healthy
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5E3DC] text-[#57544D] font-medium">
                <th className="py-2 px-4">Page</th>
                <th className="py-2 px-3">Tile</th>
                <th className="py-2 px-3">Updated</th>
                <th className="py-2 px-3">Cadence</th>
                <th className="py-2 px-3">Source</th>
                <th className="py-2 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E3DC]">
              {tileRows.map((row) => (
                <tr key={`${row.page}-${row.tile}`} className="hover:bg-[#FAF9F6]">
                  <td className="py-2 px-4 font-medium text-[#1C1B18] whitespace-nowrap">
                    {row.page}
                  </td>
                  <td className="py-2 px-3 text-[#1C1B18]">{row.tile}</td>
                  <td className="py-2 px-3 font-mono tabular-nums text-[#57544D] whitespace-nowrap">
                    {row.updated}
                  </td>
                  <td className="py-2 px-3 font-mono text-[#78756E] whitespace-nowrap">
                    {row.cadence}
                  </td>
                  <td className="py-2 px-3 text-[#57544D]">{row.source}</td>
                  <td className="py-2 px-4 text-right whitespace-nowrap">
                    {row.isOk ? (
                      <span
                        title="Healthy"
                        className="inline-flex items-center gap-1 font-medium text-[#15803D]"
                      >
                        <Check className="w-4 h-4" />
                        <span>OK</span>
                      </span>
                    ) : (
                      <span
                        title={row.statusLabel}
                        className="inline-flex items-center gap-1 font-medium text-[#B91C1C]"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>{row.statusLabel}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Minimised Collapsible Panels (zero scrolling until clicked) */}
      <div className="space-y-2">
        <details className="group bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
          <summary className="px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-[#FAF9F6] text-xs font-medium text-[#1C1B18]">
            <span className="inline-flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-[#78756E] transition-transform group-open:rotate-90" />
              UK Data Feeds ({liveFeedCount} Live / {feeds.length} Total)
            </span>
            <span className="font-mono text-[11px] text-[#78756E]">
              {feeds.reduce((acc, f) => acc + f.recordsFetched, 0)} live records
            </span>
          </summary>
          <div className="px-4 pb-3 pt-1 border-t border-[#E5E3DC] divide-y divide-[#E5E3DC] text-xs">
            {feeds.map((feed) => (
              <div key={feed.source} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-[#1C1B18]">{feed.source}</div>
                  <div className="text-[#57544D]">{feed.note}</div>
                </div>
                <span
                  className={`shrink-0 font-mono font-medium ${
                    feed.status === 'live'
                      ? 'text-[#15803D]'
                      : feed.status === 'needs_key'
                      ? 'text-[#B91C1C]'
                      : 'text-[#B45309]'
                  }`}
                >
                  {feed.recordsFetched} · {feed.status}
                </span>
              </div>
            ))}
            {latestNiceFeed.length > 0 && (
              <div className="pt-2 text-[#57544D]">
                <span className="font-medium text-[#1C1B18]">Latest NICE TAs:</span>{' '}
                {latestNiceFeed
                  .slice(0, 3)
                  .map((i) => i.title)
                  .join(' · ')}
              </div>
            )}
          </div>
        </details>

        <details className="group bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
          <summary className="px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-[#FAF9F6] text-xs font-medium text-[#1C1B18]">
            <span className="inline-flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-[#78756E] transition-transform group-open:rotate-90" />
              API Usage &amp; Quota Limits to Watch ({apiUsage.length} Providers)
            </span>
            <span className="font-mono text-[11px] text-[#78756E]">
              Month: {new Date().toISOString().slice(0, 7)}
            </span>
          </summary>
          <div className="border-t border-[#E5E3DC] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F3F2EE] border-b border-[#E5E3DC] text-[#57544D]">
                  <th className="py-2 px-4">Provider</th>
                  <th className="py-2 px-3 text-right">Month</th>
                  <th className="py-2 px-3 text-right">Total</th>
                  <th className="py-2 px-3">Limit</th>
                  <th className="py-2 px-3">Guardrail</th>
                  <th className="py-2 px-4 text-right">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E3DC]">
                {apiUsage.map((item) => (
                  <tr key={item.provider}>
                    <td className="py-2 px-4 font-medium text-[#1C1B18]">{item.provider}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {item.callsThisMonth}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-[#78756E]">
                      {item.callsTotal}
                    </td>
                    <td className="py-2 px-3 font-mono text-[#57544D]">{item.quotaLimit}</td>
                    <td className="py-2 px-3 text-[#57544D]">{item.guardNote}</td>
                    <td
                      className={`py-2 px-4 text-right font-medium ${
                        item.riskLevel === 'strict'
                          ? 'text-[#B91C1C]'
                          : item.riskLevel === 'watch'
                          ? 'text-[#B45309]'
                          : 'text-[#15803D]'
                      }`}
                    >
                      {item.riskLevel === 'strict'
                        ? 'Strict'
                        : item.riskLevel === 'watch'
                        ? 'Watch'
                        : 'Safe'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="group bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
          <summary className="px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-[#FAF9F6] text-xs font-medium text-[#1C1B18]">
            <span className="inline-flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-[#78756E] transition-transform group-open:rotate-90" />
              Visitor Breakdown (Tools, Top Clusters &amp; Drugs)
            </span>
            <span className="font-mono text-[11px] text-[#78756E]">
              {analytics?.totalEvents ?? 0} interactions
            </span>
          </summary>
          <div className="px-4 py-3 border-t border-[#E5E3DC] grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <h3 className="font-medium text-[#1C1B18] mb-1.5">Views by Tool</h3>
              {analytics &&
                Object.entries(analytics.viewsByModule).map(([mod, views]) => (
                  <div key={mod} className="flex justify-between py-1 border-b border-[#EFECE5]">
                    <span className="text-[#57544D]">{mod}</span>
                    <span className="font-mono tabular-nums">{views}</span>
                  </div>
                ))}
            </div>
            <div>
              <h3 className="font-medium text-[#1C1B18] mb-1.5">Most Inspected Clusters</h3>
              {analytics?.topClusters.length ? (
                analytics.topClusters.map((c) => (
                  <div key={c.name} className="flex justify-between py-1 border-b border-[#EFECE5]">
                    <span className="text-[#57544D]">{c.name}</span>
                    <span className="font-mono tabular-nums">{c.clicks}</span>
                  </div>
                ))
              ) : (
                <p className="text-[#78756E]">None recorded yet.</p>
              )}
            </div>
            <div>
              <h3 className="font-medium text-[#1C1B18] mb-1.5">Most Inspected Drugs</h3>
              {analytics?.topDrugs.length ? (
                analytics.topDrugs.map((d) => (
                  <div key={d.name} className="flex justify-between py-1 border-b border-[#EFECE5]">
                    <span className="text-[#57544D] truncate pr-2">{d.name}</span>
                    <span className="font-mono tabular-nums">{d.clicks}</span>
                  </div>
                ))
              ) : (
                <p className="text-[#78756E]">None recorded yet.</p>
              )}
            </div>
          </div>
        </details>

        <details className="group bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
          <summary className="px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-[#FAF9F6] text-xs font-medium text-[#1C1B18]">
            <span className="inline-flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-[#78756E] transition-transform group-open:rotate-90" />
              Newsletter Subscribers ({newsletter?.totalSubscribers ?? 0})
            </span>
            <span className="font-mono text-[11px] text-[#78756E]">
              Jobs: {newsletter?.byTrack.jobs ?? 0} · NICE: {newsletter?.byTrack['nice-nhs'] ?? 0} · Both:{' '}
              {newsletter?.byTrack.both ?? 0}
            </span>
          </summary>
          <div className="px-4 py-3 border-t border-[#E5E3DC] space-y-2 text-xs">
            {newsletter && newsletter.subscribers.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'boundry-newsletter-subscribers.csv',
                      ['Email', 'Track', 'Subscribed At'],
                      newsletter.subscribers.map((s) => [s.email, s.track, s.subscribedAt])
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-[#D6D3CB] rounded text-[#1C1B18] hover:bg-[#FAF9F6] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <div className="divide-y divide-[#E5E3DC]">
                  {newsletter.subscribers.map((sub) => (
                    <div key={sub.email} className="py-1.5 flex justify-between gap-3">
                      <span className="font-medium text-[#1C1B18]">{sub.email}</span>
                      <span className="font-mono text-[#78756E]">
                        {sub.track} · {sub.subscribedAt.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[#78756E]">No newsletter subscribers yet.</p>
            )}
          </div>
        </details>

        <details className="group bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
          <summary className="px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-[#FAF9F6] text-xs font-medium text-[#1C1B18]">
            <span className="inline-flex items-center gap-2">
              <ChevronRight className="w-3.5 h-3.5 text-[#78756E] transition-transform group-open:rotate-90" />
              GitHub Actions Daily Sync YAML (boundry.space)
            </span>
            <span className="font-mono text-[11px] text-[#78756E]">06:00 UTC</span>
          </summary>
          <div className="border-t border-[#E5E3DC]">
            <div className="px-4 py-2 bg-[#F3F2EE] flex justify-end">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white border border-[#D6D3CB] rounded text-[#1C1B18] cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy YAML'}
              </button>
            </div>
            <pre className="p-4 text-[11px] font-mono text-[#1C1B18] bg-white overflow-x-auto leading-relaxed">
              {GITHUB_WORKFLOW_SNIPPET}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
};

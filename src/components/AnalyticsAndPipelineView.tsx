import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Lock, RefreshCw } from 'lucide-react';
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
          publish_dir: ./dist`;

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
        const data = (await resAnalytics.json()) as AnalyticsSummary;
        setAnalytics(data);
      }
      if (resSubs.ok) {
        const subData = (await resSubs.json()) as NewsletterSummary;
        setNewsletter(subData);
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

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-[#E5E3DC]">
        <div>
          <div className="text-xs font-mono text-[#78756E]">Private Owner Route · /owner-analytics</div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1C1B18] mt-1">
            Analytics & Automated Data Pipeline
          </h1>
          <p className="mt-1 text-sm text-[#57544D]">
            First-party visitor telemetry and automated UK API refresh controls.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#1C1B18] text-white rounded-md hover:bg-[#3E3C37] disabled:opacity-60 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Run Live Sync Now'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOwnerToken(null);
              onExitHiddenView();
            }}
            className="px-3 py-2 text-xs font-medium border border-[#D6D3CB] rounded-md text-[#57544D] hover:text-[#1C1B18] cursor-pointer"
          >
            Lock & Exit
          </button>
        </div>
      </div>

      {/* First-Party Backend Analytics */}
      <section className="bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-[#1C1B18]">
            First-Party Backend Analytics
          </h2>
          <span className="text-xs font-mono text-[#78756E]">
            Authenticated Owner Session · Zero third-party cookies
          </span>
        </div>

        {analytics ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-[#E5E3DC]">
              <div>
                <div className="text-xs text-[#78756E]">Total Page Views</div>
                <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#1C1B18]">
                  {analytics.totalViews}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#78756E]">Unique Sessions</div>
                <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#1C1B18]">
                  {analytics.uniqueVisitors}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#78756E]">CSV Exports</div>
                <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#1E40AF]">
                  {analytics.csvExports}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#78756E]">Tracked Interactions</div>
                <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[#1C1B18]">
                  {analytics.totalEvents}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
              <div>
                <h3 className="font-medium text-[#1C1B18] mb-2">Views by Tool</h3>
                <div className="space-y-2">
                  {Object.entries(analytics.viewsByModule).map(([mod, views]) => (
                    <div key={mod} className="flex items-center justify-between py-1 border-b border-[#EFECE5]">
                      <span className="text-[#57544D]">{mod}</span>
                      <span className="font-mono tabular-nums text-[#1C1B18]">{views}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-[#1C1B18] mb-2">Most Inspected Clusters</h3>
                {analytics.topClusters.length === 0 ? (
                  <p className="text-[#78756E]">No cluster clicks recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {analytics.topClusters.map((c) => (
                      <div key={c.name} className="flex items-center justify-between py-1 border-b border-[#EFECE5]">
                        <span className="text-[#57544D]">{c.name}</span>
                        <span className="font-mono tabular-nums text-[#1C1B18]">{c.clicks}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-medium text-[#1C1B18] mb-2">Most Inspected Drugs</h3>
                {analytics.topDrugs.length === 0 ? (
                  <p className="text-[#78756E]">No drug lookups recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {analytics.topDrugs.map((d) => (
                      <div key={d.name} className="flex items-center justify-between py-1 border-b border-[#EFECE5]">
                        <span className="text-[#57544D] truncate pr-2">{d.name}</span>
                        <span className="font-mono tabular-nums text-[#1C1B18]">{d.clicks}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-[#78756E]">Loading analytics...</p>
        )}
      </section>

      {/* Newsletter Subscribers (Owner-Only) */}
      <section className="bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1C1B18]">
              Newsletter Subscribers ({newsletter?.totalSubscribers ?? 0})
            </h2>
            <p className="text-xs text-[#78756E]">
              Jobs only: {newsletter?.byTrack.jobs ?? 0} · NICE-to-NHS: {newsletter?.byTrack['nice-nhs'] ?? 0} · Both: {newsletter?.byTrack.both ?? 0}
            </p>
          </div>
          {newsletter && newsletter.subscribers.length > 0 && (
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  'boundry-newsletter-subscribers.csv',
                  ['Email', 'Track', 'Subscribed At'],
                  newsletter.subscribers.map((s) => [s.email, s.track, s.subscribedAt])
                )
              }
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-[#D6D3CB] rounded-md text-[#1C1B18] hover:bg-[#FAF9F6] cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export Subscribers CSV
            </button>
          )}
        </div>

        {newsletter && newsletter.subscribers.length > 0 ? (
          <div className="divide-y divide-[#E5E3DC] text-xs max-h-60 overflow-y-auto">
            {newsletter.subscribers.map((sub) => (
              <div key={sub.email} className="py-2 flex items-center justify-between gap-4">
                <span className="font-medium text-[#1C1B18]">{sub.email}</span>
                <span className="font-mono text-[#78756E]">
                  {sub.track} · {sub.subscribedAt.slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#78756E]">No newsletter subscribers yet.</p>
        )}
      </section>

      {/* Page & Tile Freshness Schedule */}
      {(() => {
        const formatTs = (iso?: string) => {
          if (!iso) return 'Not yet synced';
          const d = new Date(iso);
          return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB');
        };
        const niceFeed = feeds.find((f) => f.source.includes('NICE'));
        const opFeed = feeds.find((f) => f.source.includes('OpenPrescribing'));
        const atsFeed = feeds.find((f) => f.source.includes('Direct UK Biotech ATS'));
        const jobFeedTs = atsFeed?.lastSyncedAt || lastSyncAt;

        const tileRows = [
          {
            page: 'Cluster Map',
            tile: 'Bubble Map, Top 5 Cities & Live Vacancies',
            updated: formatTs(jobFeedTs),
            cadence: 'Every 24h (06:00 UTC)',
            source: 'Direct ATS · Reed · Jooble · SerpAPI · Adzuna',
            isLive: true,
          },
          {
            page: 'Cluster Map',
            tile: 'Lab Capacity (sq ft) & UK VC Share',
            updated: 'Q4 2026 Benchmark',
            cadence: 'Quarterly',
            source: 'UK Science Park & BIA Infrastructure Audit',
            isLive: false,
          },
          {
            page: 'Market Forecast',
            tile: '2025–2035 Trajectory & Quarterly Breakdown',
            updated: 'Q4 2026 Release',
            cadence: 'Quarterly',
            source: 'ONS · BioIndustry Association · ABPI Series',
            isLive: false,
          },
          {
            page: 'Market Forecast',
            tile: 'GBP Salary Bands, Sub-Sectors & Skill Shifts',
            updated: `Q4 2026 + Sync (${formatTs(lastSyncAt)})`,
            cadence: 'Quarterly + 24h Snapshot',
            source: 'Regional Pay Benchmarks & Live Role Demand',
            isLive: true,
          },
          {
            page: 'NICE-to-NHS',
            tile: 'NICE Technology Appraisals & Guidance',
            updated: formatTs(niceFeed?.lastSyncedAt || lastSyncAt),
            cadence: 'Every 24h (06:00 UTC)',
            source: 'NICE Published Guidance RSS',
            isLive: niceFeed?.status === 'live',
          },
          {
            page: 'NICE-to-NHS',
            tile: 'Actual NHS Prescribing & Divergence Chart',
            updated: formatTs(opFeed?.lastSyncedAt || lastSyncAt),
            cadence: 'Monthly NHSBSA (Polled 24h)',
            source: 'OpenPrescribing.net NHS England API',
            isLive: opFeed?.status === 'live',
          },
          {
            page: 'Scope & Method',
            tile: 'Live Snapshot Takeaways & Hub Counts',
            updated: formatTs(lastSyncAt),
            cadence: 'Every 24h (Auto-computed)',
            source: 'Live Snapshot Summary',
            isLive: true,
          },
        ];

        return (
          <section className="bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5E3DC] flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#1C1B18]">
                  Page &amp; Tile Update Status
                </h2>
                <p className="text-xs text-[#78756E] mt-0.5">
                  When each public page and visual tile was last refreshed and its automatic schedule.
                </p>
              </div>
              <span className="text-xs font-mono text-[#78756E]">
                Global sync: {formatTs(lastSyncAt)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F3F2EE] border-b border-[#E5E3DC] font-medium text-[#57544D]">
                    <th className="py-3 px-5">Page</th>
                    <th className="py-3 px-4">Tile / Visual</th>
                    <th className="py-3 px-4">Last Updated</th>
                    <th className="py-3 px-4">Cadence</th>
                    <th className="py-3 px-5">Backing Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E3DC]">
                  {tileRows.map((row) => (
                    <tr key={`${row.page}-${row.tile}`} className="hover:bg-[#FAF9F6]">
                      <td className="py-3 px-5 font-medium text-[#1C1B18] whitespace-nowrap">
                        {row.page}
                      </td>
                      <td className="py-3 px-4 text-[#1C1B18]">{row.tile}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#1E40AF] whitespace-nowrap">
                        {row.updated}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#57544D] whitespace-nowrap">
                        {row.cadence}
                      </td>
                      <td className="py-3 px-5 text-[#57544D]">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })()}

      {/* Automated UK Data Feeds Status */}
      <section className="bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-[#1C1B18]">
            Zero-Card Automated 24-Hour UK Data Feeds
          </h2>
          <span className="text-xs font-mono text-[#78756E]">
            Last sync: {new Date(lastSyncAt).toLocaleString('en-GB')}
          </span>
        </div>

        <div className="divide-y divide-[#E5E3DC] text-xs">
          {feeds.map((feed) => (
            <div key={feed.source} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="font-medium text-[#1C1B18]">{feed.source}</div>
                <div className="text-[#57544D] mt-0.5">{feed.note}</div>
              </div>
              <div className="flex items-center gap-4 shrink-0 font-mono">
                <span className="text-[#78756E]">{feed.recordsFetched} records</span>
                <span
                  className={
                    feed.status === 'live'
                      ? 'text-[#15803D] font-medium'
                      : feed.status === 'needs_key'
                      ? 'text-[#B45309] font-medium'
                      : 'text-[#57544D] font-medium'
                  }
                >
                  {feed.status === 'live'
                    ? 'Live'
                    : feed.status === 'needs_key'
                    ? 'Needs Free Key'
                    : 'Cached Baseline'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {latestNiceFeed.length > 0 && (
          <div className="pt-3 border-t border-[#E5E3DC]">
            <h3 className="text-xs font-semibold text-[#1C1B18] mb-2">
              Latest Pulled NICE Guidance Publications
            </h3>
            <ul className="space-y-1 text-xs text-[#57544D]">
              {latestNiceFeed.slice(0, 4).map((item) => (
                <li key={item.title} className="flex items-baseline justify-between gap-4">
                  <span className="truncate">{item.title}</span>
                  <span className="font-mono text-[#78756E] shrink-0">{item.pubDate.slice(0, 16)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* API Usage & Free-Tier Quota Limits */}
      <section className="bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E3DC] flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#1C1B18]">
              API Usage & Quota Limits to Watch
            </h2>
            <p className="text-xs text-[#78756E] mt-0.5">
              Tracks actual calls sent by this server per month alongside strict provider caps.
            </p>
          </div>
          <span className="text-xs font-mono text-[#78756E]">
            Month: {new Date().toISOString().slice(0, 7)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F3F2EE] border-b border-[#E5E3DC] font-medium text-[#57544D]">
                <th className="py-3 px-5">API / Feed</th>
                <th className="py-3 px-4 text-right">Calls (Month)</th>
                <th className="py-3 px-4 text-right">Calls (Total)</th>
                <th className="py-3 px-4">Free-Tier Limit</th>
                <th className="py-3 px-4">Active Guardrail</th>
                <th className="py-3 px-5">Quota Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E3DC]">
              {apiUsage.map((item) => (
                <tr key={item.provider} className="hover:bg-[#FAF9F6]">
                  <td className="py-3 px-5 font-medium text-[#1C1B18]">{item.provider}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-[#1C1B18]">
                    {item.callsThisMonth}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-[#78756E]">
                    {item.callsTotal}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#57544D]">{item.quotaLimit}</td>
                  <td className="py-3 px-4 text-[#57544D]">{item.guardNote}</td>
                  <td className="py-3 px-5 whitespace-nowrap font-medium">
                    <span
                      className={
                        item.riskLevel === 'strict'
                          ? 'text-[#B91C1C]'
                          : item.riskLevel === 'watch'
                          ? 'text-[#B45309]'
                          : 'text-[#15803D]'
                      }
                    >
                      {item.riskLevel === 'strict'
                        ? 'Strict Cap'
                        : item.riskLevel === 'watch'
                        ? 'Watch Cap'
                        : 'Safe'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* GitHub Actions Daily Refresh */}
      <section className="bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E3DC] flex flex-wrap items-center justify-between gap-3 bg-[#F3F2EE]">
          <div>
            <h2 className="text-sm font-semibold text-[#1C1B18]">
              Hands-Off GitHub Actions Daily Refresh (.github/workflows/daily-sync.yml)
            </h2>
            <p className="text-xs text-[#57544D]">
              Uses public Greenhouse ATS boards, OpenPrescribing, NICE RSS, and optional free REED_API_KEY (no credit card).
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium bg-white border border-[#D6D3CB] rounded-md text-[#1C1B18] hover:bg-[#FAF9F6] cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-[#15803D]" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy YAML'}
          </button>
        </div>
        <pre className="p-6 text-xs font-mono text-[#1C1B18] bg-white overflow-x-auto leading-relaxed">
          {GITHUB_WORKFLOW_SNIPPET}
        </pre>
      </section>
    </div>
  );
};

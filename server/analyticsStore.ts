import fs from 'fs';
import path from 'path';

export type AnalyticsEventType =
  | 'page_view'
  | 'cluster_select'
  | 'drug_select'
  | 'filter_change'
  | 'csv_export';

export interface AnalyticsEventInput {
  type: AnalyticsEventType;
  target: string;
  sessionId?: string;
}

interface DailyMetric {
  date: string;
  views: number;
  exports: number;
}

export interface AnalyticsStoreData {
  totalViews: number;
  totalEvents: number;
  csvExports: number;
  uniqueSessionHashes: string[];
  viewsByModule: Record<string, number>;
  clusterClicks: Record<string, number>;
  drugClicks: Record<string, number>;
  daily: Record<string, DailyMetric>;
  lastUpdatedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

const ALLOWED_TYPES: Set<string> = new Set([
  'page_view',
  'cluster_select',
  'drug_select',
  'filter_change',
  'csv_export',
]);

function createEmptyStore(): AnalyticsStoreData {
  return {
    totalViews: 0,
    totalEvents: 0,
    csvExports: 0,
    uniqueSessionHashes: [],
    viewsByModule: {
      clusters: 0,
      forecast: 0,
      'nice-nhs': 0,
      guide: 0,
    },
    clusterClicks: {},
    drugClicks: {},
    daily: {},
    lastUpdatedAt: new Date().toISOString(),
  };
}

function readStore(): AnalyticsStoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(ANALYTICS_FILE)) {
      const initial = createEmptyStore();
      fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
    return JSON.parse(raw) as AnalyticsStoreData;
  } catch {
    return createEmptyStore();
  }
}

function writeStore(data: AnalyticsStoreData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Ignore disk write failure in read-only environments
  }
}

export function recordAnalyticsEvent(input: AnalyticsEventInput): { ok: boolean } {
  if (!input || !ALLOWED_TYPES.has(input.type)) {
    return { ok: false };
  }

  const target = String(input.target ?? '').trim().slice(0, 80);
  if (!target) {
    return { ok: false };
  }

  const store = readStore();
  const today = new Date().toISOString().slice(0, 10);

  store.totalEvents += 1;
  store.lastUpdatedAt = new Date().toISOString();

  if (!store.daily[today]) {
    store.daily[today] = { date: today, views: 0, exports: 0 };
  }

  if (input.sessionId) {
    const cleanSession = String(input.sessionId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (cleanSession && !store.uniqueSessionHashes.includes(cleanSession)) {
      store.uniqueSessionHashes.push(cleanSession);
      if (store.uniqueSessionHashes.length > 5000) {
        store.uniqueSessionHashes = store.uniqueSessionHashes.slice(-5000);
      }
    }
  }

  if (input.type === 'page_view') {
    store.totalViews += 1;
    store.daily[today].views += 1;
    store.viewsByModule[target] = (store.viewsByModule[target] ?? 0) + 1;
  } else if (input.type === 'csv_export') {
    store.csvExports += 1;
    store.daily[today].exports += 1;
  } else if (input.type === 'cluster_select') {
    store.clusterClicks[target] = (store.clusterClicks[target] ?? 0) + 1;
  } else if (input.type === 'drug_select') {
    store.drugClicks[target] = (store.drugClicks[target] ?? 0) + 1;
  }

  // Retain last 30 days only
  const sortedDates = Object.keys(store.daily).sort();
  if (sortedDates.length > 30) {
    for (const oldDate of sortedDates.slice(0, sortedDates.length - 30)) {
      delete store.daily[oldDate];
    }
  }

  writeStore(store);
  return { ok: true };
}

export function getAnalyticsSummary() {
  const store = readStore();
  const topClusters = Object.entries(store.clusterClicks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, clicks]) => ({ name, clicks }));

  const topDrugs = Object.entries(store.drugClicks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, clicks]) => ({ name, clicks }));

  const dailySeries = Object.values(store.daily)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  return {
    totalViews: store.totalViews,
    uniqueVisitors: store.uniqueSessionHashes.length,
    totalEvents: store.totalEvents,
    csvExports: store.csvExports,
    viewsByModule: store.viewsByModule,
    topClusters,
    topDrugs,
    dailySeries,
    lastUpdatedAt: store.lastUpdatedAt,
  };
}

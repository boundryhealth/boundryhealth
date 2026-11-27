import fs from 'fs';
import path from 'path';
import { UK_CLUSTERS, UK_JOB_VACANCIES } from '../src/data/clustersAndJobs.ts';
import { NICE_NHS_DRUGS } from '../src/data/niceNhsData.ts';
import type { JobVacancy, NiceDrugRecord, RoleFamily, SeniorityLevel, SubSector } from '../src/types/lifeScience.ts';

export interface LiveFeedStatus {
  source: string;
  status: 'live' | 'cached' | 'needs_key';
  lastSyncedAt: string;
  recordsFetched: number;
  note: string;
}

export interface LiveNiceGuidanceItem {
  title: string;
  link: string;
  pubDate: string;
}

export interface ApiUsageItem {
  provider: string;
  callsThisMonth: number;
  callsTotal: number;
  quotaLimit: string;
  guardNote: string;
  riskLevel: 'safe' | 'watch' | 'strict';
}

export interface SyncedMarketSnapshot {
  lastSyncAt: string;
  nextScheduledSyncAt: string;
  feeds: LiveFeedStatus[];
  apiUsage: ApiUsageItem[];
  vacancies: JobVacancy[];
  niceDrugs: NiceDrugRecord[];
  latestNiceFeed: LiveNiceGuidanceItem[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const CACHE_FILE = path.join(DATA_DIR, 'live-market-cache.json');
const USAGE_FILE = path.join(DATA_DIR, 'api-usage.json');

interface PersistedUsage {
  month: string;
  monthly: Record<string, number>;
  total: Record<string, number>;
}

const PROVIDER_META: {
  key: string;
  provider: string;
  quotaLimit: string;
  guardNote: string;
  riskLevel: 'safe' | 'watch' | 'strict';
}[] = [
  {
    key: 'ats',
    provider: 'Direct UK Biotech ATS (Greenhouse / Lever / Ashby)',
    quotaLimit: 'Unlimited · No Key',
    guardNote: '15 public biotech boards polled every 24h',
    riskLevel: 'safe',
  },
  {
    key: 'jooble',
    provider: 'Jooble UK Life Science API',
    quotaLimit: 'Free tier (~500 calls/day)',
    guardNote: '8 queries × 2 pages (16 calls per 24h sync)',
    riskLevel: 'safe',
  },
  {
    key: 'reed',
    provider: 'Reed.co.uk UK API',
    quotaLimit: 'Free · No Card (~2,000/mo)',
    guardNote: '6 queries × 100 results (6 calls per 24h sync)',
    riskLevel: 'safe',
  },
  {
    key: 'adzuna',
    provider: 'Adzuna UK API',
    quotaLimit: '25 test calls total',
    guardNote: '1 call every 7 days; skipped in GitHub Actions CI',
    riskLevel: 'strict',
  },
  {
    key: 'serpapi',
    provider: 'SerpAPI (Google Jobs / LinkedIn Index)',
    quotaLimit: '250 searches / month',
    guardNote: '2 calls every 48h (~30/mo unless manually synced)',
    riskLevel: 'watch',
  },
  {
    key: 'nhsjobs',
    provider: 'NHS Jobs Official UK XML API',
    quotaLimit: 'Unlimited · No Key',
    guardNote: '4 R&D / Genomics / Biomedical queries every 24h',
    riskLevel: 'safe',
  },
  {
    key: 'openprescribing',
    provider: 'NHSBSA English Prescribing Dataset API',
    quotaLimit: 'Unlimited · No Key',
    guardNote: '1 metadata + 1 SQL call per 24h sync (monthly NHSBSA EPD)',
    riskLevel: 'safe',
  },
  {
    key: 'nice',
    provider: 'NICE Technology Appraisals Feed',
    quotaLimit: 'Unlimited · No Key',
    guardNote: '1 request per 24h sync',
    riskLevel: 'safe',
  },
];

function readUsageFile(): PersistedUsage {
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8')) as PersistedUsage;
      if (parsed && typeof parsed.total === 'object') {
        return parsed.month === currentMonth
          ? parsed
          : { month: currentMonth, monthly: {}, total: parsed.total };
      }
    }
  } catch {
    // Fallback
  }
  return { month: currentMonth, monthly: {}, total: {} };
}

function buildApiUsageList(usage: PersistedUsage): ApiUsageItem[] {
  return PROVIDER_META.map((m) => ({
    provider: m.provider,
    callsThisMonth: usage.monthly[m.key] ?? 0,
    callsTotal: usage.total[m.key] ?? 0,
    quotaLimit: m.quotaLimit,
    guardNote: m.guardNote,
    riskLevel: m.riskLevel,
  }));
}

function recordProviderCalls(increments: Record<string, number>): ApiUsageItem[] {
  const usage = readUsageFile();
  for (const [key, count] of Object.entries(increments)) {
    if (count > 0) {
      usage.monthly[key] = (usage.monthly[key] ?? 0) + count;
      usage.total[key] = (usage.total[key] ?? 0) + count;
    }
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf-8');
  } catch {
    // Non-blocking
  }
  return buildApiUsageList(usage);
}

// Verified BNF chemical substance codes in NHSBSA English Prescribing Dataset (zero key)
const NHSBSA_BNF_MAP: Record<string, { drugId: string; label: string }> = {
  '0601023AW': { drugId: 'nice-ta875', label: 'Semaglutide' },
  '0212000AM': { drugId: 'nice-ta733', label: 'Inclisiran' },
  '0601023AG': { drugId: 'nice-ta775', label: 'Dapagliflozin' },
  '0407041AD': { drugId: 'nice-ta945', label: 'Rimegepant' },
  '0601023AZ': { drugId: 'nice-ta1026', label: 'Tirzepatide' },
};

// Public unauthenticated Greenhouse ATS boards of UK-active life science employers (same feeds syndicated to LinkedIn)
const UK_GREENHOUSE_BOARDS: { token: string; employer: string; subSector: SubSector }[] = [
  { token: 'isomorphiclabs', employer: 'Isomorphic Labs', subSector: 'Biotech' },
  { token: 'oxfordnanoporetechnologies', employer: 'Oxford Nanopore Technologies', subSector: 'MedTech' },
  { token: 'autolustherapeutics', employer: 'Autolus Therapeutics', subSector: 'Biotech' },
  { token: 'bicycletherapeutics', employer: 'Bicycle Therapeutics', subSector: 'Biotech' },
  { token: 'benevolentai', employer: 'BenevolentAI', subSector: 'Biotech' },
  { token: 'immunocore', employer: 'Immunocore', subSector: 'Biotech' },
  { token: 'evoxtherapeutics', employer: 'Evox Therapeutics', subSector: 'Biotech' },
  { token: 'compasspathways', employer: 'COMPASS Pathways', subSector: 'Biotech' },
];

// Public unauthenticated Lever ATS boards
const UK_LEVER_BOARDS: { token: string; employer: string; subSector: SubSector }[] = [
  { token: 'charlessriver', employer: 'Charles River', subSector: 'CRO / CDMO' },
  { token: 'relationrx', employer: 'Relation Therapeutics', subSector: 'Biotech' },
];

// Public unauthenticated Ashby ATS boards (UK-headquartered / UK AI-bio labs)
const UK_ASHBY_BOARDS: { token: string; employer: string; subSector: SubSector }[] = [
  { token: 'basecamp-research', employer: 'Basecamp Research', subSector: 'Biotech' },
  { token: 'latentlabs', employer: 'Latent Labs', subSector: 'Biotech' },
  { token: 'genomics', employer: 'Genomics plc', subSector: 'MedTech' },
  { token: 'owkin', employer: 'Owkin', subSector: 'Biotech' },
];

let syncInProgress = false;
let lastSyncAttemptMs = 0;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapLocationToCluster(locationLabel?: string, lat?: number, lon?: number) {
  if (typeof lat === 'number' && typeof lon === 'number') {
    let best = UK_CLUSTERS[0];
    let bestDist = Infinity;
    for (const c of UK_CLUSTERS) {
      const d = haversineKm(lat, lon, c.lat, c.lon);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (bestDist <= 75) return best;
  }

  const label = (locationLabel ?? '').toLowerCase();
  const matched = UK_CLUSTERS.find(
    (c) => label.includes(c.name.toLowerCase().split(' ')[0]) || label.includes(c.region.toLowerCase())
  );
  return matched ?? UK_CLUSTERS[1];
}

function isUkLocation(locationText: string): boolean {
  const l = locationText.toLowerCase();
  return /(united kingdom|\buk\b|london|cambridge|oxford|stevenage|manchester|alderley|edinburgh|dundee|glasgow|birmingham|nottingham|bristol|leeds|cardiff|belfast|reading|slough|abingdon|harwell)/.test(
    l
  );
}

function sanitizeHttpUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function classifyRoleFamily(title: string, desc: string): RoleFamily {
  const txt = `${title} ${desc}`.toLowerCase();
  if (/(bioinformatic|computational|machine learning|ai |genomic|data scientist|pytorch|ml )/.test(txt)) {
    return 'Bioinformatics & AI';
  }
  if (/(bioprocess|cell therapy|gene therapy|viral vector|gmp|upstream|downstream|catapult)/.test(txt)) {
    return 'Bioprocess & CGT';
  }
  if (/(regulatory|qa|quality assurance|qp |qualified person|ukca|mhra|ivdr)/.test(txt)) {
    return 'Regulatory & QA';
  }
  if (/(heor|market access|medical science liaison|msl|pharmacovigilance|medical affairs)/.test(txt)) {
    return 'Medical Affairs & HEOR';
  }
  if (/(clinical trial|clinical operations|biostatistic|clinical data|study manager)/.test(txt)) {
    return 'Clinical Trials & Ops';
  }
  if (/(diagnostic|medtech|robotics|assay|microfluidic|device|ivd|sequencing)/.test(txt)) {
    return 'MedTech & Diagnostics';
  }
  return 'Med Chem & DMPK';
}

function classifySeniority(title: string): SeniorityLevel {
  const t = title.toLowerCase();
  if (/(director|principal|head of|vp |chief)/.test(t)) return 'Principal / Director';
  if (/(senior|lead|staff|manager)/.test(t)) return 'Senior';
  if (/(junior|graduate|associate|trainee|entry|intern|placement)/.test(t)) return 'Junior';
  return 'Mid';
}

function classifySubSector(company: string, desc: string): SubSector {
  const txt = `${company} ${desc}`.toLowerCase();
  if (/(astrazeneca|gsk|msd|pfizer|roche|novartis|abbvie|bayer|ucb|johnson|lilly)/.test(txt)) {
    return 'Big Pharma';
  }
  if (/(cro|cdmo|sygnature|quotient|charles river|almac|catsci|iqvia|thermo fisher)/.test(txt)) {
    return 'CRO / CDMO';
  }
  if (/(university|institute|sanger|crick|catapult|nhs)/.test(txt)) {
    return 'Research Inst.';
  }
  if (/(nanopore|qiagen|randox|diagnostic|medtech|robotics)/.test(txt)) {
    return 'MedTech';
  }
  return 'Biotech';
}

function parseSalaryRangeGbp(salaryText?: string): { min: number | null; max: number | null } {
  if (!salaryText) return { min: null, max: null };
  const matches = [...salaryText.replace(/,/g, '').matchAll(/(\d{2,6})/g)].map((m) => Number(m[1]));
  const annual = matches.filter((n) => n >= 18000 && n <= 350000);
  if (annual.length === 0) return { min: null, max: null };
  if (annual.length === 1) return { min: annual[0], max: annual[0] };
  return { min: Math.min(annual[0], annual[1]), max: Math.max(annual[0], annual[1]) };
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'BoundryUK-Sync/1.0',
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOpenPrescribingLive(): Promise<{
  feed: LiveFeedStatus;
  callsMade: number;
  enrichments: Record<string, { latestQuarter: string; monthlyItemsK: number; monthlyCostGbpM: number }>;
}> {
  const nowIso = new Date().toISOString();
  const enrichments: Record<string, { latestQuarter: string; monthlyItemsK: number; monthlyCostGbpM: number }> = {};
  let successCount = 0;
  let callsMade = 0;
  let datasetLabel = 'EPD';

  try {
    callsMade += 1;
    const pkgRes = await fetchWithTimeout(
      'https://opendata.nhsbsa.net/api/3/action/package_show?id=english-prescribing-data-epd',
      {},
      9000
    );
    if (pkgRes.ok) {
      const pkg = (await pkgRes.json()) as {
        result?: { resources?: Array<{ id?: string; name?: string }> };
      };
      const epdResources = (pkg.result?.resources ?? []).filter((r) =>
        /^EPD_\d{6}$/.test(r.name ?? '')
      );
      const latest = epdResources[epdResources.length - 1];
      if (latest?.id && latest?.name) {
        datasetLabel = latest.name;
        const codesSql = Object.keys(NHSBSA_BNF_MAP)
          .map((c) => `'${c}'`)
          .join(',');
        const sql = `SELECT BNF_CHEMICAL_SUBSTANCE, SUM(ITEMS) AS items, SUM(ACTUAL_COST) AS cost FROM \`${latest.id}\` WHERE BNF_CHEMICAL_SUBSTANCE IN (${codesSql}) GROUP BY BNF_CHEMICAL_SUBSTANCE`;
        callsMade += 1;
        const sqlRes = await fetchWithTimeout(
          `https://opendata.nhsbsa.net/api/3/action/datastore_search_sql?resource_id=${encodeURIComponent(
            latest.id
          )}&sql=${encodeURIComponent(sql)}`,
          {},
          9000
        );
        if (sqlRes.ok) {
          const sqlJson = (await sqlRes.json()) as {
            result?: {
              result?: {
                records?: Array<{
                  BNF_CHEMICAL_SUBSTANCE?: string;
                  items?: number;
                  cost?: number;
                }>;
              };
            };
          };
          const records = sqlJson.result?.result?.records ?? [];
          for (const row of records) {
            const code = row.BNF_CHEMICAL_SUBSTANCE ?? '';
            const meta = NHSBSA_BNF_MAP[code];
            if (!meta) continue;
            const monthlyItems = Number(row.items) || 0;
            const monthlyCost = Number(row.cost) || 0;
            // Annualised primary-care run-rate in GBP millions from latest NHSBSA month
            const annualSpendM = Number(((monthlyCost * 12) / 1_000_000).toFixed(1));
            enrichments[meta.drugId] = {
              latestQuarter: datasetLabel,
              monthlyItemsK: Number((monthlyItems / 1000).toFixed(1)),
              monthlyCostGbpM: annualSpendM,
            };
            successCount += 1;
          }
        }
      }
    }
  } catch {
    // Non-blocking fallback to baseline
  }

  return {
    feed: {
      source: 'NHSBSA English Prescribing Dataset API (Monthly · No Key)',
      status: successCount > 0 ? 'live' : 'cached',
      lastSyncedAt: nowIso,
      recordsFetched: successCount,
      note:
        successCount > 0
          ? `Synced ${successCount} primary-care NHS drug trajectories from official NHSBSA ${datasetLabel}.`
          : 'Using verified cached NHSBSA baseline.',
    },
    callsMade,
    enrichments,
  };
}

async function fetchNiceGuidanceFeed(): Promise<{ feed: LiveFeedStatus; callsMade: number; items: LiveNiceGuidanceItem[] }> {
  const nowIso = new Date().toISOString();
  try {
    const res = await fetchWithTimeout(
      'https://www.nice.org.uk/guidance/published?ndt=Guidance&ngt=Technology+appraisal+guidance&sp=on',
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      9000
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    const items: LiveNiceGuidanceItem[] = [];

    if (match?.[1]) {
      const nextData = JSON.parse(match[1]) as {
        props?: {
          pageProps?: {
            results?: {
              documents?: Array<{
                guidanceRef?: string;
                title?: string;
                url?: string;
                pathAndQuery?: string;
                publicationDate?: string;
              }>;
            };
          };
        };
      };
      const docs = [...(nextData.props?.pageProps?.results?.documents ?? [])].sort((a, b) =>
        (b.publicationDate ?? '').localeCompare(a.publicationDate ?? '')
      );
      for (const doc of docs.slice(0, 8)) {
        if (!doc.title) continue;
        const refPrefix = doc.guidanceRef ? `${doc.guidanceRef}: ` : '';
        const cleanUrl =
          sanitizeHttpUrl(doc.url) ??
          (doc.pathAndQuery ? `https://www.nice.org.uk${doc.pathAndQuery}` : 'https://www.nice.org.uk/guidance');
        items.push({
          title: `${refPrefix}${doc.title.trim()}`,
          link: cleanUrl,
          pubDate: (doc.publicationDate ?? nowIso).slice(0, 10),
        });
      }
    }

    return {
      feed: {
        source: 'NICE Technology Appraisals Feed (Daily · No Key)',
        status: items.length > 0 ? 'live' : 'cached',
        lastSyncedAt: nowIso,
        recordsFetched: items.length,
        note:
          items.length > 0
            ? `Fetched ${items.length} latest published NICE Technology Appraisals.`
            : 'Using verified NICE TA baseline.',
      },
      callsMade: 1,
      items,
    };
  } catch {
    return {
      feed: {
        source: 'NICE Technology Appraisals Feed (Daily · No Key)',
        status: 'cached',
        lastSyncedAt: nowIso,
        recordsFetched: 0,
        note: 'Using verified NICE TA dossier cache.',
      },
      callsMade: 1,
      items: [],
    };
  }
}

async function fetchDirectAtsFeeds(): Promise<{ feed: LiveFeedStatus; callsMade: number; jobs: JobVacancy[] }> {
  const nowIso = new Date().toISOString();
  const jobs: JobVacancy[] = [];
  const seen = new Set<string>();
  let callsMade = 0;

  for (const board of UK_GREENHOUSE_BOARDS) {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.token)}/jobs`;
      callsMade += 1;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const json = (await res.json()) as {
        jobs?: Array<{
          id: number;
          title: string;
          absolute_url?: string;
          updated_at?: string;
          location?: { name?: string };
        }>;
      };

      for (const item of json.jobs ?? []) {
        const loc = item.location?.name ?? '';
        if (!isUkLocation(loc)) continue;
        const id = `GH-${board.token}-${item.id}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const cluster = mapLocationToCluster(loc);
        const updatedMs = Date.parse(item.updated_at || nowIso);
        const daysOpen = Math.max(1, Math.round((Date.now() - updatedMs) / (1000 * 60 * 60 * 24)));

        jobs.push({
          id,
          title: item.title.trim(),
          employer: board.employer,
          clusterId: cluster.id,
          clusterName: cluster.name,
          roleFamily: classifyRoleFamily(item.title, loc),
          subSector: board.subSector,
          seniority: classifySeniority(item.title),
          salaryMinGbp: null,
          salaryMaxGbp: null,
          daysOpen,
          visaSponsorship: true,
          hybridPolicy: /remote/i.test(loc) ? 'Remote UK' : 'Hybrid 3d',
          skills: [classifyRoleFamily(item.title, loc)],
          postedSource: 'Direct Career Page',
          applyUrl: sanitizeHttpUrl(item.absolute_url),
          summary: `Direct UK opening indexed from ${board.employer}'s public Greenhouse ATS feed (${loc}).`,
        });
      }
    } catch {
      // Skip unreachable board
    }
  }

  for (const board of UK_LEVER_BOARDS) {
    try {
      const url = `https://api.lever.co/v0/postings/${encodeURIComponent(board.token)}?mode=json`;
      callsMade += 1;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const items = (await res.json()) as Array<{
        id: string;
        text: string;
        hostedUrl?: string;
        createdAt?: number;
        categories?: { location?: string; team?: string };
      }>;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const loc = item.categories?.location ?? '';
        if (!isUkLocation(loc)) continue;
        const id = `LV-${board.token}-${item.id}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const cluster = mapLocationToCluster(loc);
        const daysOpen = item.createdAt
          ? Math.max(1, Math.round((Date.now() - item.createdAt) / (1000 * 60 * 60 * 24)))
          : 10;

        jobs.push({
          id,
          title: item.text.trim(),
          employer: board.employer,
          clusterId: cluster.id,
          clusterName: cluster.name,
          roleFamily: classifyRoleFamily(item.text, item.categories?.team ?? ''),
          subSector: board.subSector,
          seniority: classifySeniority(item.text),
          salaryMinGbp: null,
          salaryMaxGbp: null,
          daysOpen,
          visaSponsorship: true,
          hybridPolicy: /remote/i.test(loc) ? 'Remote UK' : 'Hybrid 3d',
          skills: [item.categories?.team || classifyRoleFamily(item.text, loc)],
          postedSource: 'Direct Career Page',
          applyUrl: sanitizeHttpUrl(item.hostedUrl),
          summary: `Direct UK opening indexed from ${board.employer}'s public Lever career board (${loc}).`,
        });
      }
    } catch {
      // Skip unreachable board
    }
  }

  for (const board of UK_ASHBY_BOARDS) {
    try {
      const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.token)}`;
      callsMade += 1;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const json = (await res.json()) as {
        jobs?: Array<{
          id: string;
          title: string;
          location?: string;
          department?: string;
          jobUrl?: string;
          publishedAt?: string;
        }>;
      };

      for (const item of json.jobs ?? []) {
        const loc = item.location ?? '';
        if (!isUkLocation(loc)) continue;
        const id = `ASH-${board.token}-${item.id}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const cluster = mapLocationToCluster(loc);
        const updatedMs = Date.parse(item.publishedAt || nowIso);
        const daysOpen = Math.max(1, Math.round((Date.now() - updatedMs) / (1000 * 60 * 60 * 24)));

        jobs.push({
          id,
          title: item.title.trim(),
          employer: board.employer,
          clusterId: cluster.id,
          clusterName: cluster.name,
          roleFamily: classifyRoleFamily(item.title, item.department ?? ''),
          subSector: board.subSector,
          seniority: classifySeniority(item.title),
          salaryMinGbp: null,
          salaryMaxGbp: null,
          daysOpen,
          visaSponsorship: true,
          hybridPolicy: /remote/i.test(loc) ? 'Remote UK' : 'Hybrid 3d',
          skills: [item.department || classifyRoleFamily(item.title, loc)],
          postedSource: 'Direct Career Page',
          applyUrl: sanitizeHttpUrl(item.jobUrl),
          summary: `Direct UK opening indexed from ${board.employer}'s public Ashby ATS board (${loc}).`,
        });
      }
    } catch {
      // Skip unreachable board
    }
  }

  return {
    feed: {
      source: 'Direct UK Biotech ATS Feeds (Greenhouse + Lever + Ashby · No Key)',
      status: jobs.length > 0 ? 'live' : 'cached',
      lastSyncedAt: nowIso,
      recordsFetched: jobs.length,
      note:
        jobs.length > 0
          ? `Synced ${jobs.length} direct UK biotech openings (Greenhouse, Lever & Ashby boards).`
          : 'Public ATS feeds ready; using cached baseline.',
    },
    callsMade,
    jobs,
  };
}

async function fetchJoobleUkJobs(): Promise<{ feed: LiveFeedStatus; callsMade: number; jobs: JobVacancy[] }> {
  const nowIso = new Date().toISOString();
  const joobleKey = process.env.JOOBLE_API_KEY?.trim();

  if (!joobleKey) {
    return {
      feed: {
        source: 'Jooble UK Life Science API',
        status: 'needs_key',
        lastSyncedAt: nowIso,
        recordsFetched: 0,
        note: 'Set JOOBLE_API_KEY in server environment Secrets to merge daily Jooble UK postings.',
      },
      callsMade: 0,
      jobs: [],
    };
  }

  const queries = [
    'biotech',
    'bioinformatics',
    'regulatory affairs',
    'clinical trial',
    'graduate scientist',
    'biomedical scientist',
    'pharmaceutical',
    'bioprocess',
  ];
  const jobs: JobVacancy[] = [];
  const seen = new Set<string>();
  let callsMade = 0;
  let blocked403 = false;

  for (const kw of queries) {
    for (const page of ['1', '2']) {
      try {
        const url = `https://jooble.org/api/${encodeURIComponent(joobleKey)}`;
        callsMade += 1;
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keywords: kw, location: 'United Kingdom', page }),
        });
        if (res.status === 403) {
          blocked403 = true;
          break;
        }
        if (!res.ok) continue;

      const json = (await res.json()) as {
        jobs?: Array<{
          id?: string | number;
          title?: string;
          location?: string;
          snippet?: string;
          salary?: string;
          link?: string;
          company?: string;
          updated?: string;
        }>;
      };

      for (const item of json.jobs ?? []) {
        if (!item.title) continue;
        const id = `JBL-${item.id ?? Buffer.from(item.title + (item.company || '')).toString('base64').slice(0, 10)}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const cluster = mapLocationToCluster(item.location);
        const employer = item.company?.trim() || 'UK Life Science Employer';
        const snippet = (item.snippet || '').replace(/<[^>]+>/g, '').trim().slice(0, 220);
        const salary = parseSalaryRangeGbp(item.salary);
        const updatedMs = Date.parse(item.updated || nowIso);
        const daysOpen = Math.max(1, Math.round((Date.now() - updatedMs) / (1000 * 60 * 60 * 24)));

        jobs.push({
          id,
          title: item.title.replace(/<[^>]+>/g, '').trim(),
          employer,
          clusterId: cluster.id,
          clusterName: cluster.name,
          roleFamily: classifyRoleFamily(item.title, snippet),
          subSector: classifySubSector(employer, snippet),
          seniority: classifySeniority(item.title),
          salaryMinGbp: salary.min,
          salaryMaxGbp: salary.max,
          daysOpen: Number.isFinite(daysOpen) ? Math.min(daysOpen, 90) : 7,
          visaSponsorship: /visa|sponsorship/i.test(snippet),
          hybridPolicy: /remote/i.test(snippet) ? 'Remote UK' : /hybrid/i.test(snippet) ? 'Hybrid 3d' : 'On-site Lab',
          skills: [kw],
          postedSource: 'Jooble UK',
          applyUrl: sanitizeHttpUrl(item.link),
          summary: snippet || `UK vacancy indexed via Jooble (${item.location || 'United Kingdom'}).`,
        });
      }
      } catch {
        // Continue across pages/queries
      }
    }
    if (blocked403) break;
  }

  return {
    feed: {
      source: 'Jooble UK Life Science API',
      status: jobs.length > 0 ? 'live' : 'cached',
      lastSyncedAt: nowIso,
      recordsFetched: jobs.length,
      note:
        jobs.length > 0
          ? `Merged ${jobs.length} live UK openings from Jooble UK.`
          : blocked403
          ? 'Jooble blocked server IP with Cloudflare 403; Direct ATS, NHS Jobs & Reed cover UK roles.'
          : 'JOOBLE_API_KEY configured; awaiting reachable network response.',
    },
    callsMade,
    jobs,
  };
}

async function fetchNhsJobsUk(): Promise<{ feed: LiveFeedStatus; callsMade: number; jobs: JobVacancy[] }> {
  const nowIso = new Date().toISOString();
  const queries = ['biomedical scientist', 'clinical trial', 'bioinformatics', 'genomics'];
  const jobs: JobVacancy[] = [];
  const seen = new Set<string>();
  let callsMade = 0;

  const extractTag = (block: string, tag: string) =>
    block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.trim() ?? '';

  for (const kw of queries) {
    try {
      const url = `https://www.jobs.nhs.uk/api/v1/search_xml?keyword=${encodeURIComponent(kw)}`;
      callsMade += 1;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const xml = await res.text();
      const blocks = [...xml.matchAll(/<vacancyDetails>([\s\S]*?)<\/vacancyDetails>/g)].slice(0, 15);

      for (const m of blocks) {
        const block = m[1];
        const rawId = extractTag(block, 'id');
        const title = extractTag(block, 'title');
        if (!title) continue;
        const id = `NHS-${rawId || Buffer.from(title).toString('base64').slice(0, 10)}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const employer = extractTag(block, 'employer') || 'NHS Trust / Healthcare Science';
        const desc = extractTag(block, 'description').replace(/\s+/g, ' ').slice(0, 220);
        const salaryText = extractTag(block, 'salary');
        const salary = parseSalaryRangeGbp(salaryText);
        const loc = extractTag(block, 'location') || 'United Kingdom';
        const postDate = extractTag(block, 'postDate');
        const postUrl = sanitizeHttpUrl(extractTag(block, 'url'));
        const cluster = mapLocationToCluster(loc);
        const postedMs = Date.parse(postDate || nowIso);
        const daysOpen = Math.max(1, Math.round((Date.now() - postedMs) / (1000 * 60 * 60 * 24)));

        jobs.push({
          id,
          title,
          employer,
          clusterId: cluster.id,
          clusterName: cluster.name,
          roleFamily: classifyRoleFamily(title, desc),
          subSector: 'Research Inst.',
          seniority: classifySeniority(title),
          salaryMinGbp: salary.min,
          salaryMaxGbp: salary.max,
          daysOpen: Number.isFinite(daysOpen) ? Math.min(daysOpen, 90) : 7,
          visaSponsorship: /visa|sponsorship|certificate of sponsorship/i.test(desc),
          hybridPolicy: /remote/i.test(desc) ? 'Remote UK' : /hybrid/i.test(desc) ? 'Hybrid 3d' : 'On-site Lab',
          skills: [kw],
          postedSource: 'NHS Jobs UK',
          applyUrl: postUrl,
          summary: desc || `NHS Jobs listing in ${loc}.`,
        });
      }
    } catch {
      // Continue across queries
    }
  }

  return {
    feed: {
      source: 'NHS Jobs Official UK XML API (Daily · No Key)',
      status: jobs.length > 0 ? 'live' : 'cached',
      lastSyncedAt: nowIso,
      recordsFetched: jobs.length,
      note:
        jobs.length > 0
          ? `Merged ${jobs.length} live UK NHS biomedical, clinical trial & genomics roles.`
          : 'Using cached baseline.',
    },
    callsMade,
    jobs,
  };
}

async function fetchReedUkJobs(): Promise<{ feed: LiveFeedStatus; callsMade: number; jobs: JobVacancy[] }> {
  const nowIso = new Date().toISOString();
  const reedKey = process.env.REED_API_KEY?.trim();

  if (!reedKey) {
    return {
      feed: {
        source: 'Reed.co.uk UK API (Free · No Card)',
        status: 'needs_key',
        lastSyncedAt: nowIso,
        recordsFetched: 0,
        note: 'Register free at reed.co.uk/developers (no card) and set REED_API_KEY in Secrets.',
      },
      callsMade: 0,
      jobs: [],
    };
  }

  const authHeader = `Basic ${Buffer.from(`${reedKey}:`).toString('base64')}`;
  const queries = [
    'biotechnology',
    'bioinformatics',
    'regulatory affairs pharma',
    'clinical trials',
    'graduate scientist',
    'biomedical scientist',
  ];
  const jobs: JobVacancy[] = [];
  const seen = new Set<string>();
  let callsMade = 0;

  for (const kw of queries) {
    try {
      const url = `https://www.reed.co.uk/api/1.0/search?keywords=${encodeURIComponent(kw)}&resultsToTake=100`;
      callsMade += 1;
      const res = await fetchWithTimeout(url, { headers: { Authorization: authHeader } });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        results?: Array<{
          jobId: number;
          employerName?: string;
          jobTitle: string;
          locationName?: string;
          minimumSalary?: number;
          maximumSalary?: number;
          jobUrl?: string;
          jobDescription?: string;
        }>;
      };

      for (const item of json.results ?? []) {
        const id = `REED-${item.jobId}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const cluster = mapLocationToCluster(item.locationName);
        const employer = item.employerName?.trim() || 'UK Life Science Employer';
        const desc = (item.jobDescription || '').replace(/<[^>]+>/g, '').trim().slice(0, 220);

        jobs.push({
          id,
          title: item.jobTitle.trim(),
          employer,
          clusterId: cluster.id,
          clusterName: cluster.name,
          roleFamily: classifyRoleFamily(item.jobTitle, desc),
          subSector: classifySubSector(employer, desc),
          seniority: classifySeniority(item.jobTitle),
          salaryMinGbp: item.minimumSalary ? Math.round(item.minimumSalary) : null,
          salaryMaxGbp: item.maximumSalary ? Math.round(item.maximumSalary) : null,
          daysOpen: 7,
          visaSponsorship: /visa|sponsorship/i.test(desc),
          hybridPolicy: /remote/i.test(desc) ? 'Remote UK' : /hybrid/i.test(desc) ? 'Hybrid 3d' : 'On-site Lab',
          skills: [kw],
          postedSource: 'Reed Science',
          applyUrl: sanitizeHttpUrl(item.jobUrl),
          summary: desc || 'Live UK posting indexed from Reed.co.uk API.',
        });
      }
    } catch {
      // Continue across queries
    }
  }

  return {
    feed: {
      source: 'Reed.co.uk UK API (Free · No Card)',
      status: jobs.length > 0 ? 'live' : 'cached',
      lastSyncedAt: nowIso,
      recordsFetched: jobs.length,
      note:
        jobs.length > 0
          ? `Merged ${jobs.length} live UK science roles from Reed.co.uk.`
          : 'REED_API_KEY configured; awaiting reachable network response.',
    },
    callsMade,
    jobs,
  };
}

async function fetchGoogleJobsUk(force = false): Promise<{ feed: LiveFeedStatus; callsMade: number; jobs: JobVacancy[] }> {
  const nowIso = new Date().toISOString();
  const serpKey = process.env.SERPAPI_API_KEY?.trim();

  if (!serpKey) {
    return {
      feed: {
        source: 'Google Jobs UK / LinkedIn Index (SerpAPI)',
        status: 'needs_key',
        lastSyncedAt: nowIso,
        recordsFetched: 0,
        note: 'Optional: set SERPAPI_API_KEY (2 queries every 48h = ~30 calls/mo, well under 250/mo cap).',
      },
      callsMade: 0,
      jobs: [],
    };
  }

  // Respect SerpAPI 250/month cap: reuse cached Google Jobs for 48h unless manually refreshed (~30 calls/mo)
  if (!force) {
    const prev = getCachedSnapshot();
    const prevFeed = prev.feeds.find((f) => f.source.includes('SerpAPI'));
    const prevJobs = prev.vacancies.filter((v) => v.postedSource === 'Google Jobs (LinkedIn)');
    if (prevFeed && prevJobs.length > 0) {
      const ageMs = Date.now() - Date.parse(prevFeed.lastSyncedAt);
      if (Number.isFinite(ageMs) && ageMs < 48 * 60 * 60 * 1000) {
        return {
          feed: {
            ...prevFeed,
            status: 'cached',
            note: `Reusing ${prevJobs.length} SerpAPI jobs (48h cooldown to stay well under 250/mo cap).`,
          },
          callsMade: 0,
          jobs: prevJobs,
        };
      }
    }
  }

  const queries = ['biotech scientist graduate uk', 'bioinformatics life science uk'];
  const jobs: JobVacancy[] = [];
  const seen = new Set<string>();
  let callsMade = 0;

  for (const kw of queries) {
    try {
      const url = `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(
        kw
      )}&location=United+Kingdom&hl=en&gl=uk&api_key=${encodeURIComponent(serpKey)}`;
      callsMade += 1;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const json = (await res.json()) as {
        jobs_results?: Array<{
          job_id?: string;
          title: string;
          company_name?: string;
          location?: string;
          via?: string;
          description?: string;
          apply_options?: Array<{ link?: string; title?: string }>;
          share_link?: string;
        }>;
      };

      for (const item of json.jobs_results ?? []) {
        const id = `GJOB-${(item.job_id || `${item.title}-${item.company_name || ''}`).slice(0, 36)}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const cluster = mapLocationToCluster(item.location);
        const employer = item.company_name?.trim() || 'UK Life Science Employer';
        const desc = (item.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
        const rawUrl = item.apply_options?.[0]?.link || item.share_link;

        jobs.push({
          id,
          title: item.title.trim(),
          employer,
          clusterId: cluster.id,
          clusterName: cluster.name,
          roleFamily: classifyRoleFamily(item.title, desc),
          subSector: classifySubSector(employer, desc),
          seniority: classifySeniority(item.title),
          salaryMinGbp: null,
          salaryMaxGbp: null,
          daysOpen: 5,
          visaSponsorship: /visa|sponsorship/i.test(desc),
          hybridPolicy: /remote/i.test(desc) ? 'Remote UK' : /hybrid/i.test(desc) ? 'Hybrid 3d' : 'On-site Lab',
          skills: [item.via ? item.via.replace(/^via\s+/i, '') : 'Google Jobs'],
          postedSource: 'Google Jobs (LinkedIn)',
          applyUrl: sanitizeHttpUrl(rawUrl),
          summary: desc || `Indexed from Google Jobs UK (${item.via || 'employer board'}).`,
        });
      }
    } catch {
      // Continue across queries
    }
  }

  return {
    feed: {
      source: 'Google Jobs UK / LinkedIn Index (SerpAPI)',
      status: jobs.length > 0 ? 'live' : 'cached',
      lastSyncedAt: nowIso,
      recordsFetched: jobs.length,
      note:
        jobs.length > 0
          ? `Merged ${jobs.length} live UK roles from Google Jobs (including LinkedIn-indexed posts).`
          : 'SERPAPI_API_KEY configured; awaiting reachable network response.',
    },
    callsMade,
    jobs,
  };
}

async function fetchAdzunaUkJobs(force = false): Promise<{ feed: LiveFeedStatus; callsMade: number; jobs: JobVacancy[] }> {
  const nowIso = new Date().toISOString();
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();

  if (!appId || !appKey) {
    return {
      feed: {
        source: 'Adzuna UK Life Science API (25 Test Calls Limit)',
        status: 'needs_key',
        lastSyncedAt: nowIso,
        recordsFetched: 0,
        note: 'Optional: set ADZUNA_APP_ID & ADZUNA_APP_KEY in Secrets (guarded: 1 query every 7 days).',
      },
      callsMade: 0,
      jobs: [],
    };
  }

  // Protect 25-call Adzuna test tier: skip ephemeral CI runners unless explicitly opted in
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.ENABLE_ADZUNA_IN_CI !== 'true') {
    return {
      feed: {
        source: 'Adzuna UK Life Science API (25 Test Calls Limit)',
        status: 'cached',
        lastSyncedAt: nowIso,
        recordsFetched: 0,
        note: 'Skipped in daily CI to preserve your 25 test calls (set ENABLE_ADZUNA_IN_CI=true to override).',
      },
      callsMade: 0,
      jobs: [],
    };
  }

  // Reuse cached Adzuna jobs for 7 days unless manually refreshed (spends only 1 call per sync)
  if (!force) {
    const prev = getCachedSnapshot();
    const prevFeed = prev.feeds.find((f) => f.source.includes('Adzuna'));
    const prevJobs = prev.vacancies.filter((v) => v.postedSource === 'Adzuna UK');
    if (prevFeed && prevJobs.length > 0) {
      const ageMs = Date.now() - Date.parse(prevFeed.lastSyncedAt);
      if (Number.isFinite(ageMs) && ageMs < 7 * 24 * 60 * 60 * 1000) {
        return {
          feed: {
            ...prevFeed,
            status: 'cached',
            note: `Reusing ${prevJobs.length} Adzuna UK jobs (7-day cooldown to protect 25 test calls).`,
          },
          callsMade: 0,
          jobs: prevJobs,
        };
      }
    }
  }

  const jobs: JobVacancy[] = [];
  let callsMade = 0;
  try {
    const whatOr = 'biotechnology bioinformatics pharmaceutical regulatory clinical scientist';
    const url = `https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=${encodeURIComponent(
      appId
    )}&app_key=${encodeURIComponent(appKey)}&results_per_page=50&what_or=${encodeURIComponent(
      whatOr
    )}&content-type=application/json`;
    callsMade += 1;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const json = (await res.json()) as {
        results?: Array<{
          id?: string | number;
          title?: string;
          description?: string;
          redirect_url?: string;
          salary_min?: number;
          salary_max?: number;
          created?: string;
          company?: { display_name?: string };
          location?: { display_name?: string };
          latitude?: number;
          longitude?: number;
        }>;
      };

      for (const item of json.results ?? []) {
        if (!item.title) continue;
        const id = `ADZ-${item.id ?? Buffer.from(item.title).toString('base64').slice(0, 10)}`;
        const locName = item.location?.display_name ?? 'United Kingdom';
        const cluster = mapLocationToCluster(locName, item.latitude, item.longitude);
        const employer = item.company?.display_name?.trim() || 'UK Life Science Employer';
        const desc = (item.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 220);
        const createdMs = Date.parse(item.created || nowIso);
        const daysOpen = Math.max(1, Math.round((Date.now() - createdMs) / (1000 * 60 * 60 * 24)));

        jobs.push({
          id,
          title: item.title.replace(/<[^>]+>/g, '').trim(),
          employer,
          clusterId: cluster.id,
          clusterName: cluster.name,
          roleFamily: classifyRoleFamily(item.title, desc),
          subSector: classifySubSector(employer, desc),
          seniority: classifySeniority(item.title),
          salaryMinGbp: item.salary_min ? Math.round(item.salary_min) : null,
          salaryMaxGbp: item.salary_max ? Math.round(item.salary_max) : null,
          daysOpen: Number.isFinite(daysOpen) ? Math.min(daysOpen, 90) : 7,
          visaSponsorship: /visa|sponsorship/i.test(desc),
          hybridPolicy: /remote/i.test(desc) ? 'Remote UK' : /hybrid/i.test(desc) ? 'Hybrid 3d' : 'On-site Lab',
          skills: [classifyRoleFamily(item.title, desc)],
          postedSource: 'Adzuna UK',
          applyUrl: sanitizeHttpUrl(item.redirect_url),
          summary: desc || `UK opening indexed from Adzuna (${locName}).`,
        });
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return {
    feed: {
      source: 'Adzuna UK Life Science API (25 Test Calls Limit)',
      status: jobs.length > 0 ? 'live' : 'cached',
      lastSyncedAt: nowIso,
      recordsFetched: jobs.length,
      note:
        jobs.length > 0
          ? `Merged ${jobs.length} live UK roles using 1 Adzuna test call (cached 7 days).`
          : 'Adzuna keys configured; awaiting reachable response or test quota.',
    },
    callsMade,
    jobs,
  };
}

export function getCachedSnapshot(): SyncedMarketSnapshot {
  const usageList = buildApiUsageList(readUsageFile());
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as SyncedMarketSnapshot;
      return {
        ...parsed,
        apiUsage: Array.isArray(parsed.apiUsage) ? parsed.apiUsage : usageList,
      };
    }
  } catch {
    // Fallback
  }

  const now = new Date();
  const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    lastSyncAt: now.toISOString(),
    nextScheduledSyncAt: next.toISOString(),
    feeds: [
      {
        source: 'Direct UK Biotech ATS Feeds (Greenhouse + Lever + Ashby · No Key)',
        status: 'cached',
        lastSyncedAt: now.toISOString(),
        recordsFetched: 0,
        note: 'Baseline loaded; background refresh scheduled.',
      },
      {
        source: 'Jooble UK Life Science API',
        status: process.env.JOOBLE_API_KEY ? 'cached' : 'needs_key',
        lastSyncedAt: now.toISOString(),
        recordsFetched: 0,
        note: process.env.JOOBLE_API_KEY
          ? 'API key configured; queued for refresh.'
          : 'Set JOOBLE_API_KEY in Secrets to enable daily Jooble UK job sync.',
      },
      {
        source: 'Reed.co.uk UK API (Free · No Card)',
        status: process.env.REED_API_KEY ? 'cached' : 'needs_key',
        lastSyncedAt: now.toISOString(),
        recordsFetched: 0,
        note: process.env.REED_API_KEY
          ? 'API key configured; queued for refresh.'
          : 'Register free at reed.co.uk/developers (no card required) and set REED_API_KEY.',
      },
      {
        source: 'Adzuna UK Life Science API (25 Test Calls Limit)',
        status: process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY ? 'cached' : 'needs_key',
        lastSyncedAt: now.toISOString(),
        recordsFetched: 0,
        note:
          process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY
            ? 'Adzuna keys configured; guarded by 7-day cooldown.'
            : 'Optional: set ADZUNA_APP_ID & ADZUNA_APP_KEY in Secrets.',
      },
      {
        source: 'Google Jobs UK / LinkedIn Index (SerpAPI)',
        status: process.env.SERPAPI_API_KEY ? 'cached' : 'needs_key',
        lastSyncedAt: now.toISOString(),
        recordsFetched: 0,
        note: process.env.SERPAPI_API_KEY
          ? 'API key configured; queued for refresh.'
          : 'Optional: set SERPAPI_API_KEY to pull LinkedIn & employer posts via Google Jobs UK.',
      },
      {
        source: 'NHS Jobs Official UK XML API (Daily · No Key)',
        status: 'cached',
        lastSyncedAt: now.toISOString(),
        recordsFetched: 0,
        note: 'Baseline loaded; background refresh scheduled.',
      },
      {
        source: 'NHSBSA English Prescribing Dataset API (Monthly · No Key)',
        status: 'cached',
        lastSyncedAt: now.toISOString(),
        recordsFetched: 0,
        note: 'Baseline loaded; background refresh scheduled.',
      },
      {
        source: 'NICE Technology Appraisals Feed (Daily · No Key)',
        status: 'cached',
        lastSyncedAt: now.toISOString(),
        recordsFetched: 0,
        note: 'Baseline loaded; background refresh scheduled.',
      },
    ],
    apiUsage: usageList,
    vacancies: UK_JOB_VACANCIES,
    niceDrugs: NICE_NHS_DRUGS,
    latestNiceFeed: [],
  };
}

export async function runLiveSync(force = false): Promise<SyncedMarketSnapshot> {
  if (syncInProgress) {
    return getCachedSnapshot();
  }
  if (!force && Date.now() - lastSyncAttemptMs < 60_000) {
    return getCachedSnapshot();
  }

  syncInProgress = true;
  lastSyncAttemptMs = Date.now();

  try {
    const [opResult, niceResult, atsResult, nhsJobsResult, joobleResult, reedResult, adzunaResult, googleJobsResult] =
      await Promise.all([
        fetchOpenPrescribingLive(),
        fetchNiceGuidanceFeed(),
        fetchDirectAtsFeeds(),
        fetchNhsJobsUk(),
        fetchJoobleUkJobs(),
        fetchReedUkJobs(),
        fetchAdzunaUkJobs(force),
        fetchGoogleJobsUk(force),
      ]);

    const apiUsage = recordProviderCalls({
      ats: atsResult.callsMade,
      nhsjobs: nhsJobsResult.callsMade,
      jooble: joobleResult.callsMade,
      reed: reedResult.callsMade,
      adzuna: adzunaResult.callsMade,
      serpapi: googleJobsResult.callsMade,
      openprescribing: opResult.callsMade,
      nice: niceResult.callsMade,
    });

    const enrichedDrugs: NiceDrugRecord[] = NICE_NHS_DRUGS.map((drug) => {
      const live = opResult.enrichments[drug.id];
      if (!live || live.monthlyCostGbpM <= 0) return drug;
      return {
        ...drug,
        annualSpendGbpM: live.monthlyCostGbpM,
      };
    });

    const liveJobs = [
      ...atsResult.jobs,
      ...nhsJobsResult.jobs,
      ...joobleResult.jobs,
      ...reedResult.jobs,
      ...adzunaResult.jobs,
      ...googleJobsResult.jobs,
    ];
    const combinedVacancies =
      liveJobs.length > 0 ? [...liveJobs, ...UK_JOB_VACANCIES] : UK_JOB_VACANCIES;

    const now = new Date();
    const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const snapshot: SyncedMarketSnapshot = {
      lastSyncAt: now.toISOString(),
      nextScheduledSyncAt: next.toISOString(),
      feeds: [
        atsResult.feed,
        nhsJobsResult.feed,
        joobleResult.feed,
        reedResult.feed,
        adzunaResult.feed,
        googleJobsResult.feed,
        opResult.feed,
        niceResult.feed,
      ],
      apiUsage,
      vacancies: combinedVacancies,
      niceDrugs: enrichedDrugs,
      latestNiceFeed: niceResult.items,
    };

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');

    return snapshot;
  } finally {
    syncInProgress = false;
  }
}

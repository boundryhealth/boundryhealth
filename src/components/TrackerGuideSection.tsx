import React, { useMemo } from 'react';
import { UK_CLUSTERS } from '../data/clustersAndJobs';
import { JobVacancy } from '../types/lifeScience';

interface TrackerGuideSectionProps {
  vacancies: JobVacancy[];
  lastSyncAt?: string;
}

export const TrackerGuideSection: React.FC<TrackerGuideSectionProps> = ({
  vacancies,
  lastSyncAt,
}) => {
  const insights = useMemo(() => {
    const total = vacancies.length;

    const clusterAggregates = UK_CLUSTERS.map((cluster) => {
      const clusterJobs = vacancies.filter((j) => j.clusterId === cluster.id);
      const meanDaysOpen =
        clusterJobs.length > 0
          ? Math.round(clusterJobs.reduce((acc, j) => acc + j.daysOpen, 0) / clusterJobs.length)
          : 0;
      return {
        cluster,
        vacancyCount: clusterJobs.length,
        meanDaysOpen,
      };
    });

    const activeClusters = clusterAggregates.filter((a) => a.vacancyCount > 0);
    const sortedByCount = [...activeClusters].sort((a, b) => b.vacancyCount - a.vacancyCount);

    const gtCount = activeClusters
      .filter((a) => a.cluster.isGoldenTriangle)
      .reduce((sum, a) => sum + a.vacancyCount, 0);
    const gtPct = total > 0 ? ((gtCount / total) * 100).toFixed(1) : '0.0';
    const regionalPct = total > 0 ? (((total - gtCount) / total) * 100).toFixed(1) : '0.0';

    const top1 = sortedByCount[0];
    const top2 = sortedByCount[1];
    const top2Count = (top1?.vacancyCount ?? 0) + (top2?.vacancyCount ?? 0);
    const top2Pct = total > 0 ? Math.round((top2Count / total) * 100) : 0;

    const top5Count = sortedByCount.slice(0, 5).reduce((sum, a) => sum + a.vacancyCount, 0);
    const top5Pct = total > 0 ? Math.round((top5Count / total) * 100) : 0;

    // Velocity comparison among hubs with at least 3 roles so single outliers do not skew the pace read
    const sizeableClusters = activeClusters.filter((a) => a.vacancyCount >= 3);
    const pacePool = sizeableClusters.length >= 2 ? sizeableClusters : activeClusters;
    const sortedByPace = [...pacePool].sort((a, b) => a.meanDaysOpen - b.meanDaysOpen);
    const fastestHub = sortedByPace[0];
    const slowestHub = sortedByPace[sortedByPace.length - 1];

    // Role family breakdown
    const rfCounts = new Map<string, number>();
    for (const v of vacancies) {
      rfCounts.set(v.roleFamily, (rfCounts.get(v.roleFamily) ?? 0) + 1);
    }
    const topRoleFamilies = [...rfCounts.entries()].sort((a, b) => b[1] - a[1]);
    const leadRole = topRoleFamilies[0];
    const secondRole = topRoleFamilies[1];

    const juniorCount = vacancies.filter((v) => v.seniority === 'Junior').length;
    const juniorPct = total > 0 ? ((juniorCount / total) * 100).toFixed(1) : '0.0';
    const visaCount = vacancies.filter((v) => v.visaSponsorship).length;
    const visaPct = total > 0 ? ((visaCount / total) * 100).toFixed(1) : '0.0';
    const disclosedSalaryCount = vacancies.filter(
      (v) => v.salaryMinGbp !== null && v.salaryMaxGbp !== null
    ).length;

    return {
      total,
      activeHubCount: activeClusters.length,
      gtCount,
      gtPct,
      regionalPct,
      top1,
      top2,
      top2Pct,
      top5Pct,
      fastestHub,
      slowestHub,
      leadRole,
      secondRole,
      juniorCount,
      juniorPct,
      visaPct,
      disclosedSalaryCount,
    };
  }, [vacancies]);

  const formattedSyncDate = useMemo(() => {
    const parsed = lastSyncAt ? new Date(lastSyncAt) : new Date();
    const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return safeDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, [lastSyncAt]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-[#E5E3DC]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1C1B18] text-balance">
            Scope, Methodology &amp; Live Takeaways
          </h1>
          <p className="mt-1 text-sm text-[#57544D] max-w-2xl">
            How Boundry UK collects, classifies, and updates UK life science hiring, forecast, and NHS prescribing data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs shrink-0">
          <div>
            <div className="text-[#78756E]">Snapshot Date</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1C1B18]">
              {formattedSyncDate}
            </div>
          </div>
          <div className="h-8 w-px bg-[#E5E3DC]" aria-hidden="true" />
          <div>
            <div className="text-[#78756E]">Indexed Roles</div>
            <div className="font-mono text-lg font-semibold tabular-nums text-[#1E40AF]">
              {insights.total.toLocaleString('en-GB')}
            </div>
          </div>
        </div>
      </div>

      {/* Row 1: How the tracker might help you + Map Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-4">
          <h2 className="text-base font-semibold text-[#1C1B18]">
            How the tracker might help you
          </h2>
          <div className="space-y-3 text-sm text-[#57544D] leading-relaxed">
            <p>
              <strong className="font-medium text-[#1C1B18]">See the shape of the market</strong> — track
              vacancy volumes across 16 UK biotech, pharma, and medtech hubs, how long listings stay
              open, graduate vs senior mix, UK Skilled Worker visa sponsorship rates, and GBP base
              salary benchmarks.
            </p>
            <p>
              <strong className="font-medium text-[#1C1B18]">Read the postings behind any number</strong> — every
              bubble size and filter bar is a direct count of live UK vacancies you can browse on the
              Cluster Map: search by title, employer, or skill, filter by hub, discipline, sub-sector,
              and seniority, and sort by newest or longest-open.
            </p>
            <p>
              <strong className="font-medium text-[#1C1B18]">Watch it move</strong> — automated 24-hour refreshes
              merge direct UK biotech career boards with public job aggregators, pairing daily hiring
              snapshots with our 2025–2035 forecast and monthly NHS prescribing uptake.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-[#1C1B18]">Overview of the map</h2>
            <span className="text-xs font-mono tabular-nums text-[#78756E]">
              State of {formattedSyncDate}
            </span>
          </div>
          <p className="text-sm text-[#57544D] leading-relaxed">
            Each bubble encodes one of the UK&apos;s 16 life science clusters, coloured by Golden
            Triangle (blue) vs regional R&amp;D hubs (slate). Switch metrics across Live Vacancies,
            Lab Capacity, and Median Pay, drag to pan, or inspect county boundaries inside the
            South East Corridor pop-up inset.
          </p>
          <div className="pt-2 border-t border-[#EFECE5] grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-[#78756E]">Active Hubs</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-[#1C1B18]">
                {insights.activeHubCount} / 16
              </div>
            </div>
            <div>
              <div className="text-[#78756E]">Disclosed Pay</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-[#1C1B18]">
                {insights.disclosedSalaryCount} roles
              </div>
            </div>
            <div>
              <div className="text-[#78756E]">Entry / Grad</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-[#1E40AF]">
                {insights.juniorCount} ({insights.juniorPct}%)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Main take-aways of the data (live-computed from current snapshot) */}
      <div className="bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-[#E5E3DC]">
          <h2 className="text-base font-semibold text-[#1C1B18]">
            Main take-aways of the data
          </h2>
          <span className="text-xs font-mono tabular-nums text-[#78756E]">
            Live snapshot · {insights.total.toLocaleString('en-GB')} UK postings ({formattedSyncDate})
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm text-[#57544D] leading-relaxed">
          <p>
            <strong className="font-medium text-[#1C1B18]">
              The Golden Triangle remains the largest hiring block.
            </strong>{' '}
            <span className="font-mono tabular-nums text-[#1C1B18]">
              {insights.gtCount.toLocaleString('en-GB')}
            </span>{' '}
            of{' '}
            <span className="font-mono tabular-nums text-[#1C1B18]">
              {insights.total.toLocaleString('en-GB')}
            </span>{' '}
            indexed UK postings sit inside Cambridge, London, Oxford, Stevenage, and Reading (
            <span className="font-mono tabular-nums text-[#1C1B18]">{insights.gtPct}%</span>),
            compared with{' '}
            <span className="font-mono tabular-nums text-[#1C1B18]">{insights.regionalPct}%</span>{' '}
            across Scotland, the North West, Midlands, Yorkshire, South West, Wales, and Northern
            Ireland.
          </p>

          <p>
            <strong className="font-medium text-[#1C1B18]">
              Hiring is concentrated in the top five UK cities.
            </strong>{' '}
            {insights.top1 && insights.top2 ? (
              <>
                {insights.top1.cluster.name} (
                <span className="font-mono tabular-nums text-[#1C1B18]">
                  {insights.top1.vacancyCount}
                </span>
                ) and {insights.top2.cluster.name} (
                <span className="font-mono tabular-nums text-[#1C1B18]">
                  {insights.top2.vacancyCount}
                </span>
                ) account for{' '}
                <span className="font-mono tabular-nums text-[#1C1B18]">{insights.top2Pct}%</span> of
                all roles between them; the top five clusters hold{' '}
                <span className="font-mono tabular-nums text-[#1C1B18]">{insights.top5Pct}%</span>,
                with remaining roles distributed across regional science parks.
              </>
            ) : (
              'Vacancies cluster heavily in the top five R&D hubs while regional clusters carry focused specialist demand.'
            )}
          </p>

          <p>
            <strong className="font-medium text-[#1C1B18]">
              Posting age varies significantly across hubs.
            </strong>{' '}
            {insights.fastestHub && insights.slowestHub ? (
              <>
                {insights.fastestHub.cluster.name} refreshes fastest at a mean age of{' '}
                <span className="font-mono tabular-nums text-[#1C1B18]">
                  {insights.fastestHub.meanDaysOpen} days
                </span>
                , whereas {insights.slowestHub.cluster.name} averages{' '}
                <span className="font-mono tabular-nums text-[#1C1B18]">
                  {insights.slowestHub.meanDaysOpen} days
                </span>{' '}
                open — reflecting tighter specialist pools in niche R&amp;D and regulatory lines.
              </>
            ) : (
              'Open role duration reflects local hiring velocity and specialist talent scarcity.'
            )}
          </p>

          <p>
            <strong className="font-medium text-[#1C1B18]">
              Computational, lab, and clinical demand lead the mix.
            </strong>{' '}
            {insights.leadRole && insights.secondRole ? (
              <>
                {insights.leadRole[0]} (
                <span className="font-mono tabular-nums text-[#1C1B18]">
                  {insights.leadRole[1]}
                </span>{' '}
                roles) and {insights.secondRole[0]} (
                <span className="font-mono tabular-nums text-[#1C1B18]">
                  {insights.secondRole[1]}
                </span>{' '}
                roles) lead hiring volume, with{' '}
                <span className="font-mono tabular-nums text-[#1C1B18]">{insights.juniorPct}%</span>{' '}
                tagged entry-level/graduate and{' '}
                <span className="font-mono tabular-nums text-[#1C1B18]">{insights.visaPct}%</span>{' '}
                mentioning UK Skilled Worker visa sponsorship.
              </>
            ) : (
              'Role mix spans computational discovery, wet-lab R&D, biomanufacturing, and clinical operations.'
            )}
          </p>
        </div>
      </div>

      {/* Row 3: Scope + Pipeline Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-4">
          <h2 className="text-base font-semibold text-[#1C1B18]">
            Scope: what counts as a UK Life Science job
          </h2>
          <div className="space-y-3 text-xs text-[#57544D] leading-relaxed">
            <div>
              <span className="font-semibold text-[#1C1B18]">
                Computational &amp; Lab R&amp;D:
              </span>{' '}
              bioinformatics scientist, computational biologist, AI/ML drug discovery, genomic data
              scientist, medicinal chemist, assay scientist, DMPK specialist.
            </div>
            <div>
              <span className="font-semibold text-[#1C1B18]">
                Bioprocess, Clinical &amp; Regulatory:
              </span>{' '}
              bioprocess engineer, cell &amp; gene therapy (GMP / ATMP), clinical trial manager,
              biostatistician, MHRA / UKCA / IVDR regulatory affairs, QA / Qualified Person, MSL,
              HEOR, diagnostics &amp; medtech engineering.
            </div>
            <div>
              <span className="font-semibold text-[#1C1B18]">Excluded:</span> general NHS ward or
              GP clinical staffing outside R&amp;D, unrelated generalist software/IT roles, retail
              high-street pharmacy, non-UK locations, and speculative CV talent pools.
            </div>
            <p className="pt-2 border-t border-[#EFECE5] font-mono text-[11px] text-[#78756E]">
              Note: Non-UK ATS listings are filtered out by location rules before cluster mapping so
              counts reflect UK-based roles.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-3">
          <h2 className="text-base font-semibold text-[#1C1B18]">
            Architecture of the pipeline
          </h2>
          <pre className="p-4 bg-[#FAF9F6] border border-[#E5E3DC] rounded-md text-[11px] sm:text-xs font-mono text-[#1C1B18] overflow-x-auto leading-relaxed">
{`Direct UK Biotech ATS      15 public Greenhouse, Lever & Ashby boards (no key)
Reed UK · Jooble UK        Free UK job APIs queried across 6–8 science keywords
Google Jobs · Adzuna       SerpAPI (48h cooldown) + Adzuna UK (7-day test guard)
OpenPrescribing · NICE     5 BNF NHS England drug codes + NICE published TA RSS
        │
        ▼
server/dataSync.ts         UK location filter, 75 km haversine cluster match,
        │                  7 role-family + seniority rules, GBP parser, quota log
        ▼
.data/live-market-cache    Server JSON cache + per-provider monthly usage counter
public/data/live-snapshot  Static snapshot rebuilt daily at 06:00 UTC via CI
        │
        ▼
Boundry UK React App       GitHub Pages static hosting / optional Node server`}
          </pre>
        </div>
      </div>

      {/* Row 4: Limitations of this tracker */}
      <div className="bg-white border border-[#E5E3DC] rounded-lg p-6 space-y-3">
        <h2 className="text-base font-semibold text-[#1C1B18]">Limitations of this tracker</h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 text-xs text-[#57544D] leading-relaxed list-disc pl-4">
          <li>
            <span className="font-mono text-[#1C1B18]">Posting age</span> uses the aggregator or
            ATS <span className="font-mono text-[#1C1B18]">created / updated_at</span> date —
            when the feed indexed or refreshed the listing rather than when the team first opened
            headcount.
          </li>
          <li>
            Aggregator descriptions are truncated to ~220 characters and direct biotech boards
            (Greenhouse / Ashby) frequently omit pay bands (<span className="font-mono text-[#1C1B18]">Undisclosed</span>).
            Median salaries reflect disclosed GBP postings only, and skill tags are a floor.
          </li>
          <li>
            A posting in the table was live at the last 24-hour refresh. Roles filled or paused
            between syncs remain visible until the next scheduled update.
          </li>
          <li>
            National <span className="font-mono text-[#1C1B18]">&ldquo;United Kingdom&rdquo;</span>{' '}
            or <span className="font-mono text-[#1C1B18]">&ldquo;Remote UK&rdquo;</span> ads without
            town coordinates fall back to keyword matching or the London/Cambridge primary centroid,
            which can slightly weight South East counts.
          </li>
          <li>
            Free-tier rate limits shape cadence: Adzuna UK runs at most once every 7 days (skipped
            in CI to protect its 25-call test limit) and SerpAPI Google Jobs runs on a 48-hour
            cooldown under its 250/month cap.
          </li>
          <li>
            Employers advertising the same opening on both a direct ATS career board and Reed or
            Jooble receive distinct source IDs, so minor cross-source overlap can occur on flagship
            roles.
          </li>
        </ul>
      </div>
    </div>
  );
};

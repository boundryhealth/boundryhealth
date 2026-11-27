export type RoleFamily =
  | 'Bioinformatics & AI'
  | 'Bioprocess & CGT'
  | 'Clinical Trials & Ops'
  | 'Regulatory & QA'
  | 'Med Chem & DMPK'
  | 'Medical Affairs & HEOR'
  | 'MedTech & Diagnostics';

export type SubSector =
  | 'Biotech'
  | 'Big Pharma'
  | 'MedTech'
  | 'CRO / CDMO'
  | 'Research Inst.';

export type SeniorityLevel = 'Junior' | 'Mid' | 'Senior' | 'Principal / Director';

export interface UKCluster {
  id: string;
  name: string;
  region: string;
  hubs: string[];
  lat: number;
  lon: number;
  isGoldenTriangle: boolean;
  anchorEmployers: string[];
  featuredEmployer?: {
    name: string;
    tagline: string;
    openRoles: number;
  };
  labSpaceSqFtK: number;
  vcSharePct: number;
  summary: string;
}

export interface JobVacancy {
  id: string;
  title: string;
  employer: string;
  clusterId: string;
  clusterName: string;
  roleFamily: RoleFamily;
  subSector: SubSector;
  seniority: SeniorityLevel;
  salaryMinGbp: number | null;
  salaryMaxGbp: number | null;
  daysOpen: number;
  visaSponsorship: boolean;
  hybridPolicy: 'On-site Lab' | 'Hybrid 3d' | 'Hybrid 2d' | 'Remote UK';
  skills: string[];
  isFeaturedPin?: boolean;
  postedSource:
    | 'Adzuna UK'
    | 'Reed Science'
    | 'Jooble UK'
    | 'Google Jobs (LinkedIn)'
    | 'Direct Career Page';
  applyUrl?: string;
  summary: string;
}

export interface HiringTrendPoint {
  year: number;
  isForecast: boolean;
  aiBioinformatics: number;
  cellGeneTherapy: number;
  regulatoryHeor: number;
  wetLabChem: number;
  totalIndex: number;
}

export interface QuarterlyHiringPoint {
  quarter: string;
  totalIndex: number;
  biotechAiSharePct: number;
  gradSharePct: number;
  note: string;
}

export interface SalaryBenchmark {
  roleFamily: RoleFamily;
  gtP25: number;
  gtMedian: number;
  gtP75: number;
  regP25: number;
  regMedian: number;
  regP75: number;
  yoyChangePct: number;
}

export interface SubSectorForecast {
  subSector: string;
  ukSharePct: number;
  cagr2025_2035Pct: number;
  meanDaysToFill: number;
  juniorSharePct: number;
  salaryTransparencyPct: number;
  capitalMomentum: 'Accelerating' | 'Steady' | 'Consolidating';
  driverNote: string;
}

export interface SkillPrediction {
  skill: string;
  roleFamily: RoleFamily;
  demandDelta2035Pct: number;
  direction: 'Rising' | 'Shifting';
  horizon: '2025–2028' | '2028–2035';
  implication: string;
}

export type NiceOutcome =
  | 'Recommended'
  | 'Optimised'
  | 'Managed Access / CDF'
  | 'Terminated / Restricted';

export type UptakeVelocity = 'Ahead of Forecast' | 'On Track' | 'Constrained by Friction';

export interface NiceQuarterlyPoint {
  quarter: string;
  actualItemsK: number;
  niceForecastItemsK: number;
  nhsSpendGbpM: number;
}

export interface NiceDrugRecord {
  id: string;
  taRef: string;
  genericName: string;
  brandName: string;
  manufacturer: string;
  therapyArea: 'Oncology' | 'Cardiometabolic' | 'Immunology' | 'Rare Disease' | 'Respiratory' | 'CNS';
  niceOutcome: NiceOutcome;
  decisionDate: string;
  mandateStatus: string;
  eligiblePopulationK: number;
  patientsTreated12mK: number;
  annualSpendGbpM: number;
  icbAdoptionPct: number;
  uptakeVelocity: UptakeVelocity;
  commercialAccessNote: string;
  commercialTakeaway: string;
  payerFrictionFactor: string;
  quarterlySeries: NiceQuarterlyPoint[];
}

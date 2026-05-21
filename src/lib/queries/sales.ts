import { supabase } from '../supabase';
import type { DateRange } from '../../types/date-range';

// Purpose-stage classification lives in TypeScript per DESIGN_DECISIONS precedent
// (same as plot-type matching). The canonical purpose list is 20 rows; each name
// carries its stage as a prefix, so a simple `startsWith` partition is exact.
//
//   Initial Received = "Initial …" + "Outright …"   (Land / D&D / Doc Levy)
//   Further Received = "Further …" + "Balance …"    (Land / D&D / Doc Levy)
//   Fees & Charges   = everything else              (Allocation, Security, …)
//
// Reference: PROGRESS.md design-lock entry 2026-05-18.

export type SalesStage = 'initial' | 'further' | 'fee';

export type PurposeStages = {
  byId: Map<string, SalesStage>;
  nameById: Map<string, string>;
};

export async function loadPurposeStages(): Promise<PurposeStages> {
  const { data, error } = await supabase
    .from('purposes')
    .select('id, name');
  if (error) throw error;

  const byId = new Map<string, SalesStage>();
  const nameById = new Map<string, string>();
  for (const row of data ?? []) {
    byId.set(row.id, classifyPurposeName(row.name));
    nameById.set(row.id, row.name);
  }
  return { byId, nameById };
}

export function classifyPurposeName(name: string): SalesStage {
  if (/^(Initial|Outright)\b/.test(name)) return 'initial';
  if (/^(Further|Balance)\b/.test(name)) return 'further';
  return 'fee';
}

// ----------------------------------------------------------------------------
// Panel data: KPIs + month-on-month series + drill-down structures
// ----------------------------------------------------------------------------

export type SalesKpis = {
  plotsSold: number;
  totalPayable: number;
  initialReceived: number;
  furtherReceived: number;
  feesReceived: number;
  /** Initial + Further + Fees — every naira that hit the bank in the range. */
  totalRevenueInflow: number;
};

export type StageBreakdownEntry = {
  stage: 'initial' | 'further' | 'fee';
  label: string;
  amount: number;
};

export type PurposeBreakdownEntry = {
  purposeName: string;
  amount: number;
};

export type PlotTypeBreakdownEntry = {
  plotTypeName: string;
  count: number;
  payable: number;
};

export type KpiBreakdowns = {
  /** by plot type */
  plotsSold: PlotTypeBreakdownEntry[];
  /** by plot type — same plot-type bucketing, value is payable */
  totalPayable: PlotTypeBreakdownEntry[];
  /** by purpose canonical: Initial Land, Initial D&D, Initial Doc Levy, Outright Land, Outright D&D */
  initialReceived: PurposeBreakdownEntry[];
  /** by purpose canonical: Further Land/D&D/Doc Levy, Balance Land/D&D/Doc Levy */
  furtherReceived: PurposeBreakdownEntry[];
  /** by purpose canonical: Allocation Fee, Security Fee, Change of Ownership, etc. */
  feesReceived: PurposeBreakdownEntry[];
  /** Hero KPI split: Initial / Further / Fees as the three stages that sum to it. */
  totalRevenueInflow: StageBreakdownEntry[];
};

export type SalesMonthBucket = {
  /** YYYY-MM */
  month: string;
  initial: number;
  further: number;
  fees: number;
  /** initial + further + fees — every naira received this month. */
  totalRevenue: number;
  payable: number;
  // Drill-down: per-canonical breakdowns that sum to the totals above.
  initialBreakdown: PurposeBreakdownEntry[];
  furtherBreakdown: PurposeBreakdownEntry[];
  feesBreakdown: PurposeBreakdownEntry[];
  payableBreakdown: PlotTypeBreakdownEntry[];
};

export type SalesPanelSources = {
  bankDepositRefreshedAt: string | null;
  plotSalesRefreshedAt: string | null;
};

export type PivotMonthlyEntry = {
  /** YYYY-MM */
  month: string;
  starter: number;
  classic: number;
  executive: number;
  special: number;
  total: number;
};

export type PlotPivotRow = {
  locationName: string;
  starter: number;
  classic: number;
  executive: number;
  special: number;
  total: number;
  /** Per-month plot counts for this location (drill-down). Months asc. */
  monthly: PivotMonthlyEntry[];
};

export type LocationMonthlyEntry = {
  /** YYYY-MM */
  month: string;
  payable: number;
  received: number;
};

export type RevenueByLocationRow = {
  locationName: string;
  payable: number;
  received: number;
  delta: number;
  /** Bank-deposit transaction count at this location (matches supervisor's "· N" suffix). */
  dealCount: number;
  /** Per-month payable + received for this location (drill-down). Months asc. */
  monthly: LocationMonthlyEntry[];
};

export type TopRealtorEntry = {
  salesPerson: string;
  revenue: number;
  dealCount: number;
};

export type TopDealEntry = {
  txnDate: string;
  clientName: string | null;
  salesPerson: string | null;
  locationName: string | null;
  purposeName: string | null;
  amount: number;
};

export type WeeklyTxnEntry = TopDealEntry;

export type WeekBucket = {
  /** Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  /** Sunday of the week, YYYY-MM-DD. */
  weekEnd: string;
  revenue: number;
  dealCount: number;
  entries: WeeklyTxnEntry[];
};

export type SalesPanelData = {
  kpis: SalesKpis;
  kpiBreakdowns: KpiBreakdowns;
  monthly: SalesMonthBucket[];
  pivot: PlotPivotRow[];
  byLocation: RevenueByLocationRow[];
  /** Sum of Bank Deposit amount_received with no associated location.
   *  Typically fees & general deposits (Allocation Fee, Security Fee, etc.).
   *  Surfaced as a footnote on the by-location card rather than as a "PAID IN FULL"
   *  row, which would be misleading — it's not paid in full, it just has no location. */
  byLocationOtherReceived: number;
  /** Bank-deposit transaction count with no associated location (matches the "Other" cohort above). */
  byLocationOtherDealCount: number;
  topRealtors: TopRealtorEntry[];
  topDeals: TopDealEntry[];
  /** Week buckets (Mon–Sun) covering the date range, most recent first. */
  weeks: WeekBucket[];
  sources: SalesPanelSources;
};

const UNKNOWN_LOCATION = 'Unknown / unmapped';
const UNKNOWN_PURPOSE = 'Unknown / unmapped';
const UNKNOWN_PLOT_TYPE = 'Unparseable';

const PLOT_COL: Record<string, keyof Omit<PivotMonthlyEntry, 'month' | 'total'>> = {
  Starter: 'starter',
  Classic: 'classic',
  Executive: 'executive',
  Special: 'special',
};

// Canonical sort order for plot types and stages (matches the H1 PDF reading order).
const PLOT_TYPE_ORDER: Record<string, number> = {
  Starter: 1,
  Classic: 2,
  Executive: 3,
  Special: 4,
  [UNKNOWN_PLOT_TYPE]: 99,
};

export async function loadSalesPanelData(
  range: DateRange,
  stages: PurposeStages,
): Promise<SalesPanelData> {
  const [bd, ps, sbl, locationNameById] = await Promise.all([
    fetchBankDeposits(range),
    fetchPlotSalesMonthly(range),
    fetchSalesByLocationMonthly(range),
    fetchLocationNames(),
  ]);

  // --- Per-month totals (header chart) -------------------------------------
  const monthMap = new Map<string, SalesMonthBucket>();
  const ensureMonth = (key: string) => {
    let b = monthMap.get(key);
    if (!b) {
      b = {
        month: key,
        initial: 0,
        further: 0,
        fees: 0,
        totalRevenue: 0,
        payable: 0,
        initialBreakdown: [],
        furtherBreakdown: [],
        feesBreakdown: [],
        payableBreakdown: [],
      };
      monthMap.set(key, b);
    }
    return b;
  };

  // --- KPI totals + per-purpose breakdown ----------------------------------
  let initialReceived = 0;
  let furtherReceived = 0;
  let feesReceived = 0;
  let bankDepositRefreshedAt: string | null = null;
  const initialByPurpose = new Map<string, number>();
  const furtherByPurpose = new Map<string, number>();
  const feesByPurpose = new Map<string, number>();

  // Per-month per-purpose: month → { purpose → amount } (separate maps per stage)
  const initialByMonthPurpose = new Map<string, Map<string, number>>();
  const furtherByMonthPurpose = new Map<string, Map<string, number>>();
  const feesByMonthPurpose = new Map<string, Map<string, number>>();

  // Bank-deposit derived: deal counts per location + realtor leaderboard + every-txn list.
  const dealCountByLoc = new Map<string, number>();
  let dealCountNullLoc = 0;
  const revenueBySalesPerson = new Map<string, number>();
  const dealCountBySalesPerson = new Map<string, number>();
  const allTxns: TopDealEntry[] = [];
  const addMonthPurpose = (
    map: Map<string, Map<string, number>>,
    month: string,
    purpose: string,
    amount: number,
  ) => {
    let inner = map.get(month);
    if (!inner) {
      inner = new Map();
      map.set(month, inner);
    }
    inner.set(purpose, (inner.get(purpose) ?? 0) + amount);
  };

  for (const row of bd) {
    if (!row.txn_date) continue;
    const stage = row.purpose_id ? stages.byId.get(row.purpose_id) ?? 'fee' : 'fee';
    const purposeName = row.purpose_id
      ? stages.nameById.get(row.purpose_id) ?? UNKNOWN_PURPOSE
      : UNKNOWN_PURPOSE;
    const amount = Number(row.amount_received ?? 0);
    const monthKey = row.txn_date.slice(0, 7);

    if (stage === 'initial') {
      initialReceived += amount;
      initialByPurpose.set(purposeName, (initialByPurpose.get(purposeName) ?? 0) + amount);
      const bucket = ensureMonth(monthKey);
      bucket.initial += amount;
      addMonthPurpose(initialByMonthPurpose, monthKey, purposeName, amount);
    } else if (stage === 'further') {
      furtherReceived += amount;
      furtherByPurpose.set(purposeName, (furtherByPurpose.get(purposeName) ?? 0) + amount);
      const bucket = ensureMonth(monthKey);
      bucket.further += amount;
      addMonthPurpose(furtherByMonthPurpose, monthKey, purposeName, amount);
    } else {
      feesReceived += amount;
      feesByPurpose.set(purposeName, (feesByPurpose.get(purposeName) ?? 0) + amount);
      const bucket = ensureMonth(monthKey);
      bucket.fees += amount;
      addMonthPurpose(feesByMonthPurpose, monthKey, purposeName, amount);
    }

    if (row.updated_at && (!bankDepositRefreshedAt || row.updated_at > bankDepositRefreshedAt)) {
      bankDepositRefreshedAt = row.updated_at;
    }

    // Per-location deal count (matches supervisor's "· N" suffix on the by-location card).
    if (row.location_id) {
      const locName = locationNameById.get(row.location_id) ?? UNKNOWN_LOCATION;
      dealCountByLoc.set(locName, (dealCountByLoc.get(locName) ?? 0) + 1);
    } else {
      dealCountNullLoc++;
    }

    // Realtor leaderboard. Null sales_person → "Unattributed" bucket (per project brief).
    const sp = row.sales_person?.trim() || 'Unattributed';
    revenueBySalesPerson.set(sp, (revenueBySalesPerson.get(sp) ?? 0) + amount);
    dealCountBySalesPerson.set(sp, (dealCountBySalesPerson.get(sp) ?? 0) + 1);

    // Every transaction → seeds top-deals + weekly browser. Skip zero-amount fees row noise.
    if (amount > 0) {
      allTxns.push({
        txnDate: row.txn_date,
        clientName: row.customer_name,
        salesPerson: row.sales_person,
        locationName: row.location_id ? (locationNameById.get(row.location_id) ?? null) : null,
        purposeName: row.purpose_id ? (stages.nameById.get(row.purpose_id) ?? null) : null,
        amount,
      });
    }
  }

  // --- Plot counts + payable + pivot + by-location aggregates --------------
  let plotsSold = 0;
  let totalPayable = 0;
  let plotSalesRefreshedAt: string | null = null;

  const pivotByLoc = new Map<string, PlotPivotRow>();
  const ensurePivot = (name: string): PlotPivotRow => {
    let row = pivotByLoc.get(name);
    if (!row) {
      row = {
        locationName: name,
        starter: 0,
        classic: 0,
        executive: 0,
        special: 0,
        total: 0,
        monthly: [],
      };
      pivotByLoc.set(name, row);
    }
    return row;
  };

  // Per-month per-location plot-type counts: location → month → entry
  const pivotMonthly = new Map<string, Map<string, PivotMonthlyEntry>>();
  const ensurePivotMonth = (locName: string, month: string): PivotMonthlyEntry => {
    let monthMapInner = pivotMonthly.get(locName);
    if (!monthMapInner) {
      monthMapInner = new Map();
      pivotMonthly.set(locName, monthMapInner);
    }
    let entry = monthMapInner.get(month);
    if (!entry) {
      entry = { month, starter: 0, classic: 0, executive: 0, special: 0, total: 0 };
      monthMapInner.set(month, entry);
    }
    return entry;
  };

  const payableByLoc = new Map<string, number>();
  // Per-month per-location payable for the by-location row drill.
  const payableByLocMonth = new Map<string, Map<string, number>>();
  // Plot-type breakdown for total-payable KPI + per-month payable breakdown.
  const payableByType = new Map<string, { count: number; payable: number }>();
  const payableByMonthType = new Map<
    string,
    Map<string, { count: number; payable: number }>
  >();

  for (const row of ps) {
    const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const bucket = ensureMonth(monthKey);
    const payable = Number(row.total_amount ?? 0);
    const count = Number(row.plot_count ?? 0);
    bucket.payable += payable;
    plotsSold += count;
    totalPayable += payable;
    if (row.refreshed_at && (!plotSalesRefreshedAt || row.refreshed_at > plotSalesRefreshedAt)) {
      plotSalesRefreshedAt = row.refreshed_at;
    }

    const locName = row.location?.name ?? UNKNOWN_LOCATION;
    const rawTypeName = row.plot_type?.name ?? '';
    const typeName = (PLOT_COL[rawTypeName] ? rawTypeName : 'Special') as
      | 'Starter'
      | 'Classic'
      | 'Executive'
      | 'Special';
    const col = PLOT_COL[typeName];

    // Pivot totals
    const pivotRow = ensurePivot(locName);
    pivotRow[col] += count;
    pivotRow.total += count;

    // Pivot per-month entry
    const pivotMonthEntry = ensurePivotMonth(locName, monthKey);
    pivotMonthEntry[col] += count;
    pivotMonthEntry.total += count;

    // Payable totals + breakdowns
    payableByLoc.set(locName, (payableByLoc.get(locName) ?? 0) + payable);
    let payableMonthInner = payableByLocMonth.get(locName);
    if (!payableMonthInner) {
      payableMonthInner = new Map();
      payableByLocMonth.set(locName, payableMonthInner);
    }
    payableMonthInner.set(monthKey, (payableMonthInner.get(monthKey) ?? 0) + payable);

    const typeAgg = payableByType.get(typeName) ?? { count: 0, payable: 0 };
    typeAgg.count += count;
    typeAgg.payable += payable;
    payableByType.set(typeName, typeAgg);

    let monthTypeInner = payableByMonthType.get(monthKey);
    if (!monthTypeInner) {
      monthTypeInner = new Map();
      payableByMonthType.set(monthKey, monthTypeInner);
    }
    const mt = monthTypeInner.get(typeName) ?? { count: 0, payable: 0 };
    mt.count += count;
    mt.payable += payable;
    monthTypeInner.set(typeName, mt);
  }

  // --- Received per location (Bank Deposit) -------------------------------
  const receivedByLoc = new Map<string, number>();
  const receivedByLocMonth = new Map<string, Map<string, number>>();
  for (const row of sbl) {
    const locName = row.location?.name ?? UNKNOWN_LOCATION;
    const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const amount = Number(row.amount_received ?? 0);
    receivedByLoc.set(locName, (receivedByLoc.get(locName) ?? 0) + amount);
    let inner = receivedByLocMonth.get(locName);
    if (!inner) {
      inner = new Map();
      receivedByLocMonth.set(locName, inner);
    }
    inner.set(monthKey, (inner.get(monthKey) ?? 0) + amount);
  }

  // --- Materialize monthly buckets with drill breakdowns ------------------
  for (const [month, bucket] of monthMap) {
    const initInner = initialByMonthPurpose.get(month);
    if (initInner) bucket.initialBreakdown = sortedBreakdown(initInner);
    const furInner = furtherByMonthPurpose.get(month);
    if (furInner) bucket.furtherBreakdown = sortedBreakdown(furInner);
    const feeInner = feesByMonthPurpose.get(month);
    if (feeInner) bucket.feesBreakdown = sortedBreakdown(feeInner);
    const ptInner = payableByMonthType.get(month);
    if (ptInner) {
      bucket.payableBreakdown = [...ptInner.entries()]
        .map(([plotTypeName, v]) => ({ plotTypeName, count: v.count, payable: v.payable }))
        .sort(plotTypeSort);
    }
    bucket.totalRevenue = bucket.initial + bucket.further + bucket.fees;
  }

  const monthly = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // --- Materialize pivot with per-month drill -----------------------------
  for (const row of pivotByLoc.values()) {
    const inner = pivotMonthly.get(row.locationName);
    if (inner) {
      row.monthly = [...inner.values()].sort((a, b) => a.month.localeCompare(b.month));
    }
  }
  const pivot = [...pivotByLoc.values()].sort((a, b) => b.total - a.total);

  // --- Materialize by-location with monthly drill -------------------------
  const allLocNames = new Set<string>([
    ...payableByLoc.keys(),
    ...receivedByLoc.keys(),
  ]);

  let byLocationOtherReceived = 0;
  const byLocation: RevenueByLocationRow[] = [...allLocNames]
    .filter((name) => {
      if (name === UNKNOWN_LOCATION) {
        byLocationOtherReceived += receivedByLoc.get(name) ?? 0;
        return false;
      }
      return true;
    })
    .map((name) => {
      const payable = payableByLoc.get(name) ?? 0;
      const received = receivedByLoc.get(name) ?? 0;
      const months = new Set<string>([
        ...(payableByLocMonth.get(name)?.keys() ?? []),
        ...(receivedByLocMonth.get(name)?.keys() ?? []),
      ]);
      const monthly = [...months]
        .sort()
        .map((m) => ({
          month: m,
          payable: payableByLocMonth.get(name)?.get(m) ?? 0,
          received: receivedByLocMonth.get(name)?.get(m) ?? 0,
        }));
      return {
        locationName: name,
        payable,
        received,
        delta: received - payable,
        dealCount: dealCountByLoc.get(name) ?? 0,
        monthly,
      };
    })
    .sort((a, b) => Math.max(b.payable, b.received) - Math.max(a.payable, a.received));

  // --- KPI breakdowns -----------------------------------------------------
  const totalRevenueInflow = initialReceived + furtherReceived + feesReceived;
  const kpiBreakdowns: KpiBreakdowns = {
    plotsSold: [...payableByType.entries()]
      .map(([plotTypeName, v]) => ({ plotTypeName, count: v.count, payable: v.payable }))
      .filter((e) => e.count > 0)
      .sort(plotTypeSort),
    totalPayable: [...payableByType.entries()]
      .map(([plotTypeName, v]) => ({ plotTypeName, count: v.count, payable: v.payable }))
      .filter((e) => e.payable > 0)
      .sort(plotTypeSort),
    initialReceived: sortedBreakdown(initialByPurpose),
    furtherReceived: sortedBreakdown(furtherByPurpose),
    feesReceived: sortedBreakdown(feesByPurpose),
    totalRevenueInflow: [
      { stage: 'initial', label: 'Initial received', amount: initialReceived },
      { stage: 'further', label: 'Further received', amount: furtherReceived },
      { stage: 'fee',     label: 'Fees & charges',   amount: feesReceived     },
    ].filter((e) => e.amount > 0) as StageBreakdownEntry[],
  };

  // --- Top realtors -------------------------------------------------------
  const topRealtors: TopRealtorEntry[] = [...revenueBySalesPerson.entries()]
    .map(([salesPerson, revenue]) => ({
      salesPerson,
      revenue,
      dealCount: dealCountBySalesPerson.get(salesPerson) ?? 0,
    }))
    .filter((e) => e.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // --- Top deals (single biggest transactions) ----------------------------
  const topDeals: TopDealEntry[] = [...allTxns]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // --- Weekly buckets (Mon–Sun) -------------------------------------------
  const weekMap = new Map<string, WeekBucket>();
  for (const t of allTxns) {
    const [ws, we] = mondayWeekRange(t.txnDate);
    let bucket = weekMap.get(ws);
    if (!bucket) {
      bucket = { weekStart: ws, weekEnd: we, revenue: 0, dealCount: 0, entries: [] };
      weekMap.set(ws, bucket);
    }
    bucket.revenue += t.amount;
    bucket.dealCount += 1;
    bucket.entries.push(t);
  }
  const weeks = [...weekMap.values()]
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  for (const w of weeks) {
    w.entries.sort((a, b) => a.txnDate.localeCompare(b.txnDate));
  }

  return {
    kpis: {
      plotsSold,
      totalPayable,
      initialReceived,
      furtherReceived,
      feesReceived,
      totalRevenueInflow,
    },
    kpiBreakdowns,
    monthly,
    pivot,
    byLocation,
    byLocationOtherReceived,
    byLocationOtherDealCount: dealCountNullLoc,
    topRealtors,
    topDeals,
    weeks,
    sources: { bankDepositRefreshedAt, plotSalesRefreshedAt },
  };
}

// Returns [Monday, Sunday] ISO date for the week containing the given date.
// Pure UTC string math — no Date timezone gotchas.
function mondayWeekRange(isoDate: string): [string, string] {
  const [y, m, d] = isoDate.split('-').map((p) => Number.parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(dt);
  monday.setUTCDate(dt.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return [iso(monday), iso(sunday)];
}

function iso(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sortedBreakdown(map: Map<string, number>): PurposeBreakdownEntry[] {
  return [...map.entries()]
    .map(([purposeName, amount]) => ({ purposeName, amount }))
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function plotTypeSort(a: PlotTypeBreakdownEntry, b: PlotTypeBreakdownEntry): number {
  const ao = PLOT_TYPE_ORDER[a.plotTypeName] ?? 50;
  const bo = PLOT_TYPE_ORDER[b.plotTypeName] ?? 50;
  return ao - bo;
}

type BankDepositRow = {
  txn_date: string | null;
  purpose_id: string | null;
  location_id: string | null;
  customer_name: string | null;
  sales_person: string | null;
  amount_received: number | string;
  updated_at: string | null;
};

async function fetchBankDeposits(range: DateRange): Promise<BankDepositRow[]> {
  const rows: BankDepositRow[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('bank_deposits')
      .select('txn_date, purpose_id, location_id, customer_name, sales_person, amount_received, updated_at')
      .gte('txn_date', range.from)
      .lte('txn_date', range.to)
      .order('txn_date', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as BankDepositRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchLocationNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('locations').select('id, name');
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.id, row.name);
  return map;
}

type EmbeddedName = { name: string } | null;

type PlotSalesRow = {
  period_year: number;
  period_month: number;
  plot_count: number | null;
  total_amount: number | string | null;
  refreshed_at: string | null;
  location: EmbeddedName;
  plot_type: EmbeddedName;
};

async function fetchPlotSalesMonthly(range: DateRange): Promise<PlotSalesRow[]> {
  const fromYear = Number(range.from.slice(0, 4));
  const toYear = Number(range.to.slice(0, 4));
  const fromMonth = Number(range.from.slice(5, 7));
  const toMonth = Number(range.to.slice(5, 7));

  const { data, error } = await supabase
    .from('plot_sales_monthly')
    .select(
      'period_year, period_month, plot_count, total_amount, refreshed_at, location:locations(name), plot_type:plot_types(name)',
    )
    .gte('period_year', fromYear)
    .lte('period_year', toYear);
  if (error) throw error;

  return ((data ?? []) as unknown as PlotSalesRow[]).filter((r) => {
    const ym = r.period_year * 100 + r.period_month;
    return ym >= fromYear * 100 + fromMonth && ym <= toYear * 100 + toMonth;
  });
}

type SalesByLocationRow = {
  period_year: number;
  period_month: number;
  amount_received: number | string | null;
  location: EmbeddedName;
};

async function fetchSalesByLocationMonthly(
  range: DateRange,
): Promise<SalesByLocationRow[]> {
  const fromYear = Number(range.from.slice(0, 4));
  const toYear = Number(range.to.slice(0, 4));
  const fromMonth = Number(range.from.slice(5, 7));
  const toMonth = Number(range.to.slice(5, 7));

  const { data, error } = await supabase
    .from('sales_by_location_monthly')
    .select('period_year, period_month, amount_received, location:locations(name)')
    .gte('period_year', fromYear)
    .lte('period_year', toYear);
  if (error) throw error;

  return ((data ?? []) as unknown as SalesByLocationRow[]).filter((r) => {
    const ym = r.period_year * 100 + r.period_month;
    return ym >= fromYear * 100 + fromMonth && ym <= toYear * 100 + toMonth;
  });
}

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
};

export async function loadPurposeStages(): Promise<PurposeStages> {
  const { data, error } = await supabase
    .from('purposes')
    .select('id, name');
  if (error) throw error;

  const byId = new Map<string, SalesStage>();
  for (const row of data ?? []) {
    byId.set(row.id, classifyPurposeName(row.name));
  }
  return { byId };
}

export function classifyPurposeName(name: string): SalesStage {
  if (/^(Initial|Outright)\b/.test(name)) return 'initial';
  if (/^(Further|Balance)\b/.test(name)) return 'further';
  return 'fee';
}

// ----------------------------------------------------------------------------
// Panel data: KPIs + month-on-month series
// ----------------------------------------------------------------------------

export type SalesKpis = {
  plotsSold: number;
  totalPayable: number;
  initialReceived: number;
  furtherReceived: number;
  feesReceived: number;
};

export type SalesMonthBucket = {
  /** YYYY-MM */
  month: string;
  initial: number;
  further: number;
  payable: number;
};

export type SalesPanelSources = {
  bankDepositRefreshedAt: string | null;
  plotSalesRefreshedAt: string | null;
};

export type PlotPivotRow = {
  locationName: string;
  starter: number;
  classic: number;
  executive: number;
  special: number;
  total: number;
};

export type RevenueByLocationRow = {
  locationName: string;
  payable: number;
  received: number;
  delta: number;
};

export type SalesPanelData = {
  kpis: SalesKpis;
  monthly: SalesMonthBucket[];
  pivot: PlotPivotRow[];
  byLocation: RevenueByLocationRow[];
  sources: SalesPanelSources;
};

const UNKNOWN_LOCATION = 'Unknown / unmapped';
const PLOT_COL: Record<string, keyof Omit<PlotPivotRow, 'locationName' | 'total'>> = {
  Starter: 'starter',
  Classic: 'classic',
  Executive: 'executive',
  Special: 'special',
};

export async function loadSalesPanelData(
  range: DateRange,
  stages: PurposeStages,
): Promise<SalesPanelData> {
  const [bd, ps, sbl] = await Promise.all([
    fetchBankDeposits(range),
    fetchPlotSalesMonthly(range),
    fetchSalesByLocationMonthly(range),
  ]);

  const monthMap = new Map<string, SalesMonthBucket>();
  const ensure = (key: string) => {
    let b = monthMap.get(key);
    if (!b) {
      b = { month: key, initial: 0, further: 0, payable: 0 };
      monthMap.set(key, b);
    }
    return b;
  };

  let initialReceived = 0;
  let furtherReceived = 0;
  let feesReceived = 0;
  let bankDepositRefreshedAt: string | null = null;

  for (const row of bd) {
    if (!row.txn_date) continue;
    const stage = row.purpose_id ? stages.byId.get(row.purpose_id) ?? 'fee' : 'fee';
    const amount = Number(row.amount_received ?? 0);
    if (stage === 'initial') initialReceived += amount;
    else if (stage === 'further') furtherReceived += amount;
    else feesReceived += amount;

    if (stage === 'initial' || stage === 'further') {
      const key = row.txn_date.slice(0, 7);
      const bucket = ensure(key);
      if (stage === 'initial') bucket.initial += amount;
      else bucket.further += amount;
    }

    if (row.updated_at && (!bankDepositRefreshedAt || row.updated_at > bankDepositRefreshedAt)) {
      bankDepositRefreshedAt = row.updated_at;
    }
  }

  let plotsSold = 0;
  let totalPayable = 0;
  let plotSalesRefreshedAt: string | null = null;

  // Pivot accumulators keyed by location name.
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
      };
      pivotByLoc.set(name, row);
    }
    return row;
  };

  // Revenue-by-location accumulators.
  const payableByLoc = new Map<string, number>();

  for (const row of ps) {
    const key = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const bucket = ensure(key);
    const payable = Number(row.total_amount ?? 0);
    const count = Number(row.plot_count ?? 0);
    bucket.payable += payable;
    plotsSold += count;
    totalPayable += payable;
    if (row.refreshed_at && (!plotSalesRefreshedAt || row.refreshed_at > plotSalesRefreshedAt)) {
      plotSalesRefreshedAt = row.refreshed_at;
    }

    const locName = row.location?.name ?? UNKNOWN_LOCATION;
    const typeName = row.plot_type?.name ?? '';
    const col = PLOT_COL[typeName] ?? 'special';
    const pivot = ensurePivot(locName);
    pivot[col] += count;
    pivot.total += count;
    payableByLoc.set(locName, (payableByLoc.get(locName) ?? 0) + payable);
  }

  const receivedByLoc = new Map<string, number>();
  for (const row of sbl) {
    const locName = row.location?.name ?? UNKNOWN_LOCATION;
    receivedByLoc.set(
      locName,
      (receivedByLoc.get(locName) ?? 0) + Number(row.amount_received ?? 0),
    );
  }

  const monthly = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  const pivot = [...pivotByLoc.values()].sort((a, b) => b.total - a.total);

  const allLocNames = new Set<string>([
    ...payableByLoc.keys(),
    ...receivedByLoc.keys(),
  ]);
  const byLocation: RevenueByLocationRow[] = [...allLocNames]
    .map((name) => {
      const payable = payableByLoc.get(name) ?? 0;
      const received = receivedByLoc.get(name) ?? 0;
      return {
        locationName: name,
        payable,
        received,
        delta: received - payable,
      };
    })
    .sort((a, b) => Math.max(b.payable, b.received) - Math.max(a.payable, a.received));

  return {
    kpis: {
      plotsSold,
      totalPayable,
      initialReceived,
      furtherReceived,
      feesReceived,
    },
    monthly,
    pivot,
    byLocation,
    sources: { bankDepositRefreshedAt, plotSalesRefreshedAt },
  };
}

type BankDepositRow = {
  txn_date: string | null;
  purpose_id: string | null;
  amount_received: number | string;
  updated_at: string | null;
};

async function fetchBankDeposits(range: DateRange): Promise<BankDepositRow[]> {
  // Paginate by 1000-row default in case the date window grows beyond it.
  const rows: BankDepositRow[] = [];
  const pageSize = 1000;
  let from = 0;
  // RLS-gated; we expect the user to be signed in. anon will get an empty list.
  // We deliberately filter NULL txn_dates out at the DB rather than in JS.
  // (`gte/lte` on a nullable column already excludes NULLs.)
  for (;;) {
    const { data, error } = await supabase
      .from('bank_deposits')
      .select('txn_date, purpose_id, amount_received, updated_at')
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
  // plot_sales_monthly is tiny (one row per month × location × plot_type).
  // Fetch year-bounded then filter month bounds in JS — simpler than a CTE.
  // Joins resolved via PostgREST FK embed: `locations(name)`, `plot_types(name)`.
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

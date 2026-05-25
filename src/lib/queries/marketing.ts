import { supabase } from '../supabase';
import type { DateRange } from '../../types/date-range';

// ----------------------------------------------------------------------------
// Marketing panel — derived from `marketing_monthly` (aggregate) +
// `marketing_expenses` (fact rows). Single-pass loader; no per-category fan-out
// queries (94 rows total today, plenty of room to stay JS-side).
//
// v1 ingest writes entry_type='expenditure' only. total_income is surfaced
// alongside but always 0 in v1 — the "Income side" greyed card in the panel
// honors supervisor #3 (surface, don't reconcile away) instead of hiding it.
// ----------------------------------------------------------------------------

const UNKNOWN_CATEGORY = 'Uncategorized';

export type MarketingKpis = {
  totalSpend: number;
  categoriesActive: number;
  busiestMonth: { month: string; amount: number } | null;
  avgMonthlySpend: number;
  /** Number of distinct (year, month) buckets that had any spend in the range. */
  monthsObserved: number;
};

export type CategoryBreakdownEntry = {
  categoryName: string;
  amount: number;
};

export type KpiBreakdowns = {
  /** Categories ranked by spend desc — drives the hero & Total Spend drill. */
  totalSpend: CategoryBreakdownEntry[];
  /** Same data, capped to the top entries — drives Busiest Month / Avg Monthly drills. */
  categoriesActive: CategoryBreakdownEntry[];
  /** Per-category split for the busiest month specifically. */
  busiestMonth: CategoryBreakdownEntry[];
  /** Per-month totals — drives the Avg Monthly drill. */
  avgMonthlySpend: { month: string; amount: number }[];
};

export type CategoryMonthlyEntry = {
  /** YYYY-MM */
  month: string;
  amount: number;
};

export type CategorySampleDesc = {
  description: string;
  amount: number;
  /** YYYY-MM-DD or null — the in-cell date from the source row. */
  inCellDate: string | null;
};

export type CategoryRow = {
  categoryName: string;
  amount: number;
  /** Number of marketing_expenses rows under this category in the range. */
  rowCount: number;
  /** Number of those rows that landed here via the keyword fallback. */
  fallbackCount: number;
  /** Per-month spend for this category (drill), months asc. */
  monthly: CategoryMonthlyEntry[];
  /** Top 3 largest descriptions for context (drill). */
  samples: CategorySampleDesc[];
};

export type MarketingMonthBucket = {
  /** YYYY-MM */
  month: string;
  total: number;
  /** Per-category split within this month, sorted desc. */
  byCategory: CategoryBreakdownEntry[];
};

export type MarketingSources = {
  marketingMonthlyRefreshedAt: string | null;
  marketingExpensesUpdatedAt: string | null;
};

export type MarketingPanelData = {
  kpis: MarketingKpis;
  kpiBreakdowns: KpiBreakdowns;
  byCategory: CategoryRow[];
  monthly: MarketingMonthBucket[];
  /** Number of marketing_expenses rows in the range whose category came from
   *  the keyword fallback (vs the CATEGORY dropdown the supervisor added but
   *  hasn't backfilled — see PROGRESS 2026-05-14). */
  fallbackCount: number;
  totalRowCount: number;
  /** Always 0 in v1 (ingest writes expenditure only). Surfaced anyway —
   *  panel shows it as a greyed "Income side pending" card. */
  totalIncome: number;
  sources: MarketingSources;
};

export async function loadMarketingPanelData(
  range: DateRange,
): Promise<MarketingPanelData> {
  const [mm, expenses, categoryNames] = await Promise.all([
    fetchMarketingMonthly(range),
    fetchMarketingExpenses(range),
    fetchCategoryNames(),
  ]);

  // --- KPI totals from the aggregate ---------------------------------------
  let totalSpend = 0;
  let totalIncome = 0;
  let busiestMonth: { month: string; amount: number } | null = null;
  let monthlyRefreshedAt: string | null = null;

  const monthlyTotals = new Map<string, number>(); // YYYY-MM → total
  for (const row of mm) {
    const expenditure = Number(row.total_expenditure ?? 0);
    const income = Number(row.total_income ?? 0);
    totalSpend += expenditure;
    totalIncome += income;
    const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    monthlyTotals.set(monthKey, expenditure);
    if (!busiestMonth || expenditure > busiestMonth.amount) {
      busiestMonth = { month: monthKey, amount: expenditure };
    }
    if (row.refreshed_at && (!monthlyRefreshedAt || row.refreshed_at > monthlyRefreshedAt)) {
      monthlyRefreshedAt = row.refreshed_at;
    }
  }
  // Empty range guard: clear "busiest month" if everything came back zero
  if (busiestMonth && busiestMonth.amount === 0) busiestMonth = null;

  const monthsObserved = [...monthlyTotals.values()].filter((v) => v > 0).length;
  const avgMonthlySpend = monthsObserved > 0 ? totalSpend / monthsObserved : 0;

  // --- Per-category aggregation from the fact rows -------------------------
  // The aggregate has by_category jsonb but the fact rows let us also surface
  //   * row count per category
  //   * fallback count per category (for the manual-entry honesty chip)
  //   * sample descriptions (for the drill panel)
  //   * per-month timeline per category (for the drill panel)
  // — all in one pass without an extra query per category.
  type CatAcc = {
    amount: number;
    rowCount: number;
    fallbackCount: number;
    monthly: Map<string, number>;
    samples: CategorySampleDesc[];
  };
  const byCatAcc = new Map<string, CatAcc>();
  const ensureCat = (name: string): CatAcc => {
    let acc = byCatAcc.get(name);
    if (!acc) {
      acc = { amount: 0, rowCount: 0, fallbackCount: 0, monthly: new Map(), samples: [] };
      byCatAcc.set(name, acc);
    }
    return acc;
  };

  // Per-month per-category (drives the per-month drill on the trend chart)
  const monthCat = new Map<string, Map<string, number>>();
  const addMonthCat = (month: string, name: string, amount: number) => {
    let inner = monthCat.get(month);
    if (!inner) {
      inner = new Map();
      monthCat.set(month, inner);
    }
    inner.set(name, (inner.get(name) ?? 0) + amount);
  };

  let fallbackCount = 0;
  let expensesUpdatedAt: string | null = null;

  for (const row of expenses) {
    const amount = Number(row.amount ?? 0);
    if (amount === 0) continue;
    const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const categoryName = row.expense_category_id
      ? categoryNames.get(row.expense_category_id) ?? UNKNOWN_CATEGORY
      : UNKNOWN_CATEGORY;

    const acc = ensureCat(categoryName);
    acc.amount += amount;
    acc.rowCount += 1;
    acc.monthly.set(monthKey, (acc.monthly.get(monthKey) ?? 0) + amount);

    const isFallback =
      row.quality_flags && typeof row.quality_flags === 'object'
        ? 'fallback_category' in row.quality_flags
        : false;
    if (isFallback) {
      fallbackCount += 1;
      acc.fallbackCount += 1;
    }

    acc.samples.push({
      description: row.description ?? '(blank)',
      amount,
      inCellDate: row.in_cell_date,
    });

    addMonthCat(monthKey, categoryName, amount);

    if (row.updated_at && (!expensesUpdatedAt || row.updated_at > expensesUpdatedAt)) {
      expensesUpdatedAt = row.updated_at;
    }
  }

  // Materialize byCategory rows: trim samples to top 3 per category, materialize monthly array.
  const byCategory: CategoryRow[] = [...byCatAcc.entries()]
    .map(([categoryName, acc]) => ({
      categoryName,
      amount: acc.amount,
      rowCount: acc.rowCount,
      fallbackCount: acc.fallbackCount,
      monthly: [...acc.monthly.entries()]
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      samples: [...acc.samples]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3),
    }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // Materialize monthly buckets: each carries its per-category split.
  const monthly: MarketingMonthBucket[] = [...monthlyTotals.entries()]
    .map(([month, total]) => {
      const inner = monthCat.get(month);
      const byCat = inner
        ? [...inner.entries()]
            .map(([categoryName, amount]) => ({ categoryName, amount }))
            .filter((e) => e.amount > 0)
            .sort((a, b) => b.amount - a.amount)
        : [];
      return { month, total, byCategory: byCat };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  const categoriesActive = byCategory.length;

  // --- KPI breakdowns ------------------------------------------------------
  const totalSpendBreakdown: CategoryBreakdownEntry[] = byCategory.map((r) => ({
    categoryName: r.categoryName,
    amount: r.amount,
  }));

  const busiestMonthBreakdown: CategoryBreakdownEntry[] = busiestMonth
    ? monthly.find((m) => m.month === busiestMonth!.month)?.byCategory ?? []
    : [];

  const avgMonthlyBreakdown = monthly.map((m) => ({
    month: m.month,
    amount: m.total,
  }));

  return {
    kpis: {
      totalSpend,
      categoriesActive,
      busiestMonth,
      avgMonthlySpend,
      monthsObserved,
    },
    kpiBreakdowns: {
      totalSpend: totalSpendBreakdown,
      categoriesActive: totalSpendBreakdown,
      busiestMonth: busiestMonthBreakdown,
      avgMonthlySpend: avgMonthlyBreakdown,
    },
    byCategory,
    monthly,
    fallbackCount,
    totalRowCount: expenses.length,
    totalIncome,
    sources: {
      marketingMonthlyRefreshedAt: monthlyRefreshedAt,
      marketingExpensesUpdatedAt: expensesUpdatedAt,
    },
  };
}

// ----------------------------------------------------------------------------
// Fetchers
// ----------------------------------------------------------------------------

type MarketingMonthlyRow = {
  period_year: number;
  period_month: number;
  total_income: number | string | null;
  total_expenditure: number | string | null;
  refreshed_at: string | null;
};

async function fetchMarketingMonthly(range: DateRange): Promise<MarketingMonthlyRow[]> {
  const fromYear = Number(range.from.slice(0, 4));
  const toYear = Number(range.to.slice(0, 4));
  const fromMonth = Number(range.from.slice(5, 7));
  const toMonth = Number(range.to.slice(5, 7));

  const { data, error } = await supabase
    .from('marketing_monthly')
    .select('period_year, period_month, total_income, total_expenditure, refreshed_at')
    .gte('period_year', fromYear)
    .lte('period_year', toYear);
  if (error) throw error;

  return ((data ?? []) as MarketingMonthlyRow[]).filter((r) => {
    const ym = r.period_year * 100 + r.period_month;
    return ym >= fromYear * 100 + fromMonth && ym <= toYear * 100 + toMonth;
  });
}

type MarketingExpenseRow = {
  period_year: number;
  period_month: number;
  entry_type: 'income' | 'expenditure';
  amount: number | string | null;
  description: string | null;
  expense_category_id: string | null;
  in_cell_date: string | null;
  quality_flags: Record<string, unknown> | null;
  updated_at: string | null;
};

async function fetchMarketingExpenses(range: DateRange): Promise<MarketingExpenseRow[]> {
  const fromYear = Number(range.from.slice(0, 4));
  const toYear = Number(range.to.slice(0, 4));
  const fromMonth = Number(range.from.slice(5, 7));
  const toMonth = Number(range.to.slice(5, 7));

  const rows: MarketingExpenseRow[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('marketing_expenses')
      .select(
        'period_year, period_month, entry_type, amount, description, expense_category_id, in_cell_date, quality_flags, updated_at',
      )
      .eq('entry_type', 'expenditure')
      .gte('period_year', fromYear)
      .lte('period_year', toYear)
      .order('period_year', { ascending: true })
      .order('period_month', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as MarketingExpenseRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows.filter((r) => {
    const ym = r.period_year * 100 + r.period_month;
    return ym >= fromYear * 100 + fromMonth && ym <= toYear * 100 + toMonth;
  });
}

async function fetchCategoryNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('expense_categories').select('id, name');
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.id, row.name);
  return map;
}

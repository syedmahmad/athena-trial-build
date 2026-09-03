/**
 * Build the "Subscription & SaaS Metrics" Metabase dashboard over the
 * analytics.* subscription views (migration 20260626120000_billing_analytics.sql).
 *
 *   pnpm tsx --env-file=.env scripts/metabase-subscription-cards.ts
 *
 * Idempotent: cards + dashboard are found by name and updated in place, so
 * re-running after a query tweak just patches them. Every card is a native SQL
 * question against the "Athena Postgres" connection (the read-only analytics
 * schema), so no Metabase schema sync is required — but the migration must be
 * applied to that database first, or the cards render an error until it is.
 *
 * Requires in .env:
 *   METABASE_URL          e.g. https://http--metabase--csv2ml5lv98y.code.run
 *   METABASE_API_KEY      an admin API key (Admin -> Authentication -> API Keys)
 *   METABASE_DATABASE_ID  optional; defaults to the db named "Athena Postgres"
 */

const BASE = process.env.METABASE_URL?.replace(/\/$/, "");
const KEY = process.env.METABASE_API_KEY;

const COLLECTION_NAME = "Subscription & SaaS Metrics";
const DASHBOARD_NAME = "Subscription & SaaS Metrics";

type Display =
  | "scalar"
  | "line"
  | "bar"
  | "row"
  | "pie"
  | "table";

type CardSpec = {
  name: string;
  description: string;
  sql: string;
  display: Display;
  /** grid width in 24-col units */
  w: number;
  /** grid height in row units */
  h: number;
  viz?: Record<string, unknown>;
};

// ── helpers ────────────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  if (!BASE || !KEY) {
    throw new Error(
      "METABASE_URL and METABASE_API_KEY must be set. Run with --env-file=.env"
    );
  }
  return { "x-api-key": KEY, "content-type": "application/json" };
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function resolveDatabaseId(): Promise<number> {
  const envId = process.env.METABASE_DATABASE_ID;
  if (envId) return Number(envId);
  const raw = await api<{ data?: { id: number; name: string }[] } | { id: number; name: string }[]>(
    "GET",
    "/api/database"
  );
  const list = Array.isArray(raw) ? raw : raw.data ?? [];
  const db = list.find((d) => d.name === "Athena Postgres");
  if (!db) {
    throw new Error(
      `No database named "Athena Postgres". Set METABASE_DATABASE_ID. Found: ${list
        .map((d) => `${d.id}:${d.name}`)
        .join(", ")}`
    );
  }
  return db.id;
}

async function findOrCreateCollection(): Promise<number> {
  const cols = await api<{ id: number; name: string }[]>("GET", "/api/collection");
  const existing = cols.find((c) => c.name === COLLECTION_NAME);
  if (existing) {
    console.log(`✓ collection: ${COLLECTION_NAME} (id ${existing.id})`);
    return existing.id;
  }
  const created = await api<{ id: number }>("POST", "/api/collection", {
    name: COLLECTION_NAME,
    description:
      "Standard SaaS subscription metrics over the analytics.* billing views.",
  });
  console.log(`+ collection: ${COLLECTION_NAME} (id ${created.id})`);
  return created.id;
}

type Card = { id: number; name: string; collection_id: number | null };

async function upsertCard(
  spec: CardSpec,
  dbId: number,
  collectionId: number,
  existing: Card[]
): Promise<number> {
  const payload = {
    name: spec.name,
    description: spec.description,
    collection_id: collectionId,
    display: spec.display,
    visualization_settings: spec.viz ?? {},
    dataset_query: {
      database: dbId,
      type: "native",
      native: { query: spec.sql, "template-tags": {} },
    },
  };
  const found = existing.find(
    (c) => c.name === spec.name && c.collection_id === collectionId
  );
  if (found) {
    await api("PUT", `/api/card/${found.id}`, payload);
    console.log(`  ~ card: ${spec.name} (id ${found.id})`);
    return found.id;
  }
  const created = await api<{ id: number }>("POST", "/api/card", payload);
  console.log(`  + card: ${spec.name} (id ${created.id})`);
  return created.id;
}

// ── card definitions ─────────────────────────────────────────────────────────
// Native SQL so column aliases drive the viz settings directly.

const SCALARS: CardSpec[] = [
  {
    name: "MRR",
    description: "Monthly Recurring Revenue (revenue-bearing subscriptions, yearly normalized to /12).",
    sql: `select round(mrr, 2) as mrr from analytics.mrr_summary`,
    display: "scalar",
    w: 6,
    h: 4,
    viz: { "scalar.field": "mrr", column_settings: { '["name","mrr"]': { number_style: "currency", currency: "USD" } } },
  },
  {
    name: "ARR",
    description: "Annual Recurring Revenue (MRR x 12).",
    sql: `select round(arr, 2) as arr from analytics.mrr_summary`,
    display: "scalar",
    w: 6,
    h: 4,
    viz: { column_settings: { '["name","arr"]': { number_style: "currency", currency: "USD" } } },
  },
  {
    name: "Paying Customers",
    description: "Active or past_due subscriptions (trials excluded).",
    sql: `select paying_customers from analytics.mrr_summary`,
    display: "scalar",
    w: 6,
    h: 4,
  },
  {
    name: "ARPU",
    description: "Average Revenue Per Paying User = MRR / paying customers.",
    sql: `select arpu from analytics.mrr_summary`,
    display: "scalar",
    w: 6,
    h: 4,
    viz: { column_settings: { '["name","arpu"]': { number_style: "currency", currency: "USD" } } },
  },
  {
    name: "Trialing Customers",
    description: "Subscriptions currently in a Stripe trial.",
    sql: `select trialing_customers from analytics.mrr_summary`,
    display: "scalar",
    w: 6,
    h: 4,
  },
  {
    name: "Trial Conversion Rate",
    description: "Share of trialing users who reached a paid subscription.",
    sql: `select conversion_pct from analytics.trial_conversion`,
    display: "scalar",
    w: 6,
    h: 4,
    viz: { column_settings: { '["name","conversion_pct"]': { number_style: "percent", scale: 0.01 } } },
  },
  {
    name: "Customer LTV",
    description: "Lifetime value = ARPU / average monthly logo churn. Null until churn data exists.",
    sql: `select ltv from analytics.ltv`,
    display: "scalar",
    w: 6,
    h: 4,
    viz: { column_settings: { '["name","ltv"]': { number_style: "currency", currency: "USD" } } },
  },
  {
    name: "Avg Customer Lifetime (months)",
    description: "1 / average monthly logo churn rate.",
    sql: `select avg_lifetime_months from analytics.ltv`,
    display: "scalar",
    w: 6,
    h: 4,
  },
];

const CHARTS: CardSpec[] = [
  {
    name: "MRR Over Time",
    description: "Daily MRR from the subscription snapshots.",
    sql: `select snapshot_date, round(mrr, 2) as mrr from analytics.mrr_daily order by snapshot_date`,
    display: "line",
    w: 12,
    h: 7,
    viz: { "graph.dimensions": ["snapshot_date"], "graph.metrics": ["mrr"], "graph.x_axis.title_text": "Date", "graph.y_axis.title_text": "MRR ($)" },
  },
  {
    name: "Paying Customers Over Time",
    description: "Daily count of paying subscriptions.",
    sql: `select snapshot_date, paying_customers, trialing_customers from analytics.mrr_daily order by snapshot_date`,
    display: "line",
    w: 12,
    h: 7,
    viz: { "graph.dimensions": ["snapshot_date"], "graph.metrics": ["paying_customers", "trialing_customers"] },
  },
  {
    name: "MRR by Month",
    description: "Month-end MRR with month-over-month growth.",
    sql: `select month, round(mrr, 2) as mrr, mrr_growth_pct from analytics.mrr_monthly order by month`,
    display: "bar",
    w: 12,
    h: 7,
    viz: { "graph.dimensions": ["month"], "graph.metrics": ["mrr"] },
  },
  {
    name: "MRR Movement (Monthly)",
    description: "New / expansion / reactivation vs contraction / churned MRR per month.",
    sql: `select month,
       round(new_mrr, 2)          as new_mrr,
       round(expansion_mrr, 2)    as expansion_mrr,
       round(reactivation_mrr, 2) as reactivation_mrr,
       round(contraction_mrr, 2)  as contraction_mrr,
       round(churned_mrr, 2)      as churned_mrr,
       round(net_new_mrr, 2)      as net_new_mrr
from analytics.mrr_movement_monthly order by month`,
    display: "bar",
    w: 12,
    h: 7,
    viz: {
      "graph.dimensions": ["month"],
      "graph.metrics": ["new_mrr", "expansion_mrr", "reactivation_mrr", "contraction_mrr", "churned_mrr"],
      "stackable.stack_type": "stacked",
    },
  },
  {
    name: "MRR Churn Rate (Gross vs Net) & Logo Churn",
    description: "Monthly gross MRR churn, net MRR churn, and customer (logo) churn.",
    sql: `select month, gross_mrr_churn_pct, net_mrr_churn_pct, logo_churn_pct
from analytics.churn_monthly order by month`,
    display: "line",
    w: 12,
    h: 7,
    viz: { "graph.dimensions": ["month"], "graph.metrics": ["gross_mrr_churn_pct", "net_mrr_churn_pct", "logo_churn_pct"], "graph.y_axis.title_text": "%" },
  },
  {
    name: "Net Revenue Retention",
    description: "(starting + expansion - contraction - churned) / starting MRR. 100% = no net loss.",
    sql: `select month, net_revenue_retention_pct from analytics.churn_monthly order by month`,
    display: "line",
    w: 12,
    h: 7,
    viz: { "graph.dimensions": ["month"], "graph.metrics": ["net_revenue_retention_pct"], "graph.y_axis.title_text": "NRR %" },
  },
  {
    name: "Quick Ratio",
    description: "(new + expansion + reactivation) / (churned + contraction) MRR. Healthy SaaS > 4.",
    sql: `select month, quick_ratio from analytics.quick_ratio_monthly order by month`,
    display: "bar",
    w: 12,
    h: 7,
    viz: { "graph.dimensions": ["month"], "graph.metrics": ["quick_ratio"] },
  },
  {
    name: "Trial Conversion by Cohort",
    description: "Trials started vs converted, by signup month.",
    sql: `select cohort_month, trials_started, converted, conversion_pct
from analytics.trial_conversion_monthly order by cohort_month`,
    display: "bar",
    w: 12,
    h: 7,
    viz: { "graph.dimensions": ["cohort_month"], "graph.metrics": ["trials_started", "converted"] },
  },
  {
    name: "MRR by Plan",
    description: "MRR + paying customers split by plan and billing interval.",
    sql: `select plan || ' (' || interval || ')' as plan, round(mrr, 2) as mrr, paying_customers
from analytics.mrr_by_plan order by mrr desc`,
    display: "row",
    w: 12,
    h: 7,
    viz: { "graph.dimensions": ["plan"], "graph.metrics": ["mrr"] },
  },
  {
    name: "Subscription Status Breakdown",
    description: "Distribution of current subscription statuses.",
    sql: `select status, customers from analytics.subscription_status_breakdown order by customers desc`,
    display: "pie",
    w: 12,
    h: 7,
    viz: { "pie.dimension": "status", "pie.metric": "customers" },
  },
];

const TABLES: CardSpec[] = [
  {
    name: "Subscriber Cohort Retention",
    description:
      "Of subscribers who first paid in cohort month M, the % still paying N months later.",
    sql: `select cohort_month, cohort_size, months_since, retained, retention_pct
from analytics.subscriber_cohorts order by cohort_month, months_since`,
    display: "table",
    w: 24,
    h: 8,
  },
];

// ── layout ────────────────────────────────────────────────────────────────

type Placed = { card_id: number; w: number; h: number };

function layout(cards: Placed[]) {
  const GRID = 24;
  let col = 0;
  let row = 0;
  let rowH = 0;
  const dashcards: Record<string, unknown>[] = [];
  let negId = -1;
  for (const c of cards) {
    if (col + c.w > GRID) {
      col = 0;
      row += rowH;
      rowH = 0;
    }
    dashcards.push({
      id: negId--,
      card_id: c.card_id,
      row,
      col,
      size_x: c.w,
      size_y: c.h,
      parameter_mappings: [],
      visualization_settings: {},
    });
    col += c.w;
    rowH = Math.max(rowH, c.h);
  }
  return dashcards;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const dbId = await resolveDatabaseId();
  console.log(`✓ database: Athena Postgres (id ${dbId})`);
  const collectionId = await findOrCreateCollection();

  const existingCards = await api<Card[]>("GET", "/api/card");

  const specs = [...SCALARS, ...CHARTS, ...TABLES];
  const placed: Placed[] = [];
  console.log(`Upserting ${specs.length} cards...`);
  for (const spec of specs) {
    const id = await upsertCard(spec, dbId, collectionId, existingCards);
    placed.push({ card_id: id, w: spec.w, h: spec.h });
  }

  // Find or create the dashboard.
  const dashboards = await api<{ id: number; name: string; collection_id: number | null }[]>(
    "GET",
    "/api/dashboard"
  );
  let dashboardId = dashboards.find(
    (d) => d.name === DASHBOARD_NAME && d.collection_id === collectionId
  )?.id;
  if (dashboardId) {
    console.log(`✓ dashboard: ${DASHBOARD_NAME} (id ${dashboardId})`);
  } else {
    const created = await api<{ id: number }>("POST", "/api/dashboard", {
      name: DASHBOARD_NAME,
      collection_id: collectionId,
      description:
        "Standard SaaS metrics: MRR/ARR, ARPU, MRR movement, churn, NRR, LTV, trial conversion, cohorts.",
    });
    dashboardId = created.id;
    console.log(`+ dashboard: ${DASHBOARD_NAME} (id ${dashboardId})`);
  }

  // Replace the dashcards with a fresh laid-out set (idempotent re-layout).
  const dashcards = layout(placed);
  await api("PUT", `/api/dashboard/${dashboardId}`, { dashcards });
  console.log(`✓ placed ${dashcards.length} cards on the dashboard.`);

  console.log(
    `\nDone. Open: ${BASE}/dashboard/${dashboardId}\n` +
      "Cards render data once migration 20260626120000_billing_analytics.sql is applied to the analytics schema."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

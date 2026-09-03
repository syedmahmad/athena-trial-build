import { supabase } from "@/lib/supabase/client";
import { isSupabaseAuth } from "@/lib/auth/provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(row: any) {
  return {
    id: row.id,
    clerkId: row.clerk_id,
    authId: row.auth_id as string | null,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    skillScore: row.skill_score,
    targetScore: row.target_score,
    onboardingCompleted: row.onboarding_completed as boolean,
    bestStreak: row.best_streak,
    startComposite: row.start_composite,
    currentComposite: row.current_composite,
    currentReadingWriting: row.current_reading_writing,
    currentMath: row.current_math,
    totalXp: row.total_xp,
    timezone: row.timezone,
    // The homework/learning boundary: true = paid/granted, false = homework-only
    // (educator funnel), null = direct learner (trial-gated). See
    // [[project-educators-pricing]].
    learningAccess: row.learning_access as boolean | null,
    // End of a direct learner's free trial. NULL = no trial window
    // (grandfathered pre-policy accounts, or set by the DB default on signup).
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : null,
    // Stripe billing (Family/student plan). The webhook is the only writer.
    stripeCustomerId: row.stripe_customer_id as string | null,
    stripeSubscriptionId: row.stripe_subscription_id as string | null,
    subscriptionStatus: row.subscription_status as string | null,
    // Price / interval / lifecycle, persisted from the Stripe subscription so
    // the analytics layer can compute MRR and trial conversion. See
    // 20260626120000_billing_analytics.sql.
    subscriptionPlan: row.subscription_plan as string | null,
    subscriptionInterval: row.subscription_interval as string | null,
    subscriptionAmountCents: row.subscription_amount_cents as number | null,
    subscriptionCurrentPeriodEnd: row.subscription_current_period_end
      ? new Date(row.subscription_current_period_end)
      : null,
    subscriptionStartedAt: row.subscription_started_at
      ? new Date(row.subscription_started_at)
      : null,
    subscriptionCanceledAt: row.subscription_canceled_at
      ? new Date(row.subscription_canceled_at)
      : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** The educator homework paywall. OFF by default ("educator access is free for
 *  now"): homework-funnel students keep full access. Set EDUCATOR_PAYWALL=1 (or
 *  true/on) to enforce homework-only gating on accounts marked FALSE. */
export function educatorPaywallEnabled() {
  return /^(1|true|on)$/i.test(process.env.EDUCATOR_PAYWALL ?? "");
}

/** The direct-learner paywall. OFF by default: consumer signups keep full
 *  access forever. Set LEARNER_PAYWALL=1 (or true/on) to enforce the free
 *  trial — once a learner's trial_ends_at passes they must subscribe. */
export function learnerPaywallEnabled() {
  return /^(1|true|on)$/i.test(process.env.LEARNER_PAYWALL ?? "");
}

/** Whether an account can reach the rich learning experience. Two independent
 *  gates share the learning_access tri-state:
 *   - true  → paid/granted: always in.
 *   - false → homework-only (educator funnel): gated only while the educator
 *             paywall is on.
 *   - null  → direct learner: gated by the learner paywall once the free trial
 *             (trial_ends_at) has elapsed. A null trial_ends_at means a
 *             grandfathered pre-policy account, which stays free. */
export function hasLearningAccess(user: {
  learningAccess: boolean | null;
  trialEndsAt: Date | null;
}) {
  if (user.learningAccess === true) return true;
  if (user.learningAccess === false) return !educatorPaywallEnabled();

  // learningAccess === null → a direct (consumer) learner.
  if (!learnerPaywallEnabled()) return true;
  if (!user.trialEndsAt) return true;
  return user.trialEndsAt.getTime() > Date.now();
}

/** Why an account is being shown the upsell — drives the wall's copy.
 *  "homework-only"      = educator-funnel student who never subscribed.
 *  "subscription-ended" = a former subscriber whose subscription lapsed
 *                         (canceled/unpaid) and got re-gated to FALSE.
 *  "trial-expired"      = a direct learner whose free trial ran out.
 *  Only meaningful when hasLearningAccess is false. */
export type LearningGateReason =
  | "homework-only"
  | "subscription-ended"
  | "trial-expired";

export function learningGateReason(user: {
  learningAccess: boolean | null;
  subscriptionStatus: string | null;
}): LearningGateReason {
  if (user.learningAccess === false) {
    // Both homework-funnel students and lapsed subscribers sit at FALSE. Only
    // applySubscriptionState writes a subscription_status, so its presence
    // marks a former subscriber; gateAccountAsHomeworkOnly leaves it null.
    return user.subscriptionStatus ? "subscription-ended" : "homework-only";
  }
  return "trial-expired";
}

/** Mark an account homework-only — but ONLY if access was never established
 *  (NULL). Existing/grandfathered users (true) and already-gated users
 *  (false) are left untouched, so signing in to do homework never revokes a
 *  real learner's access. No-op while the paywall is off (nobody is gated). */
export async function gateAccountAsHomeworkOnly(userId: string) {
  if (!educatorPaywallEnabled()) return;
  const { error } = await supabase
    .from("users")
    .update({ learning_access: false })
    .eq("id", userId)
    .is("learning_access", null);
  if (error) throw error;
}

// ─── Stripe billing ──────────────────────────────────────────────────────

/** Subscription statuses that should grant the full learning experience.
 *  `past_due` is included so a failed-then-retrying card keeps access during
 *  Stripe's dunning grace window rather than yanking it mid-retry. */
const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

export async function getUserByStripeCustomerId(customerId: string) {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return data ? mapUser(data) : null;
}

/** Persist the Stripe Customer id on the user row (set once, at first checkout). */
export async function setStripeCustomerId(userId: string, customerId: string) {
  const { error } = await supabase
    .from("users")
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

/** The billing facts carried by a Stripe subscription event. The id + status
 *  drive gating (unchanged from phase 1); the price/interval/lifecycle fields
 *  feed the analytics layer (MRR, ARPU, trial conversion). All of the latter are
 *  optional so older callers keep compiling, but the webhook always supplies them. */
export type SubscriptionBilling = {
  subscriptionId: string | null;
  status: string;
  plan?: string | null;
  interval?: string | null;
  amountCents?: number | null;
  currentPeriodEnd?: Date | null;
  startedAt?: Date | null;
  canceledAt?: Date | null;
};

/** Normalize a per-interval price to a monthly MRR figure (yearly => amount/12). */
export function normalizeMrrCents(
  amountCents: number | null | undefined,
  interval: string | null | undefined
): number | null {
  if (amountCents == null) return null;
  if (interval === "year") return Math.round(amountCents / 12);
  return amountCents;
}

/**
 * Reconcile local billing state from a Stripe subscription event. Persists the
 * subscription id + status and flips `learning_access` to match: an active
 * subscription unlocks learning, a canceled/unpaid one re-gates the account.
 * This is the only path (besides gateAccountAsHomeworkOnly) that writes
 * `learning_access`, and it only ever runs for accounts that reached checkout.
 *
 * Deliberately writes ONLY the gating-critical columns (all present since
 * phase 1). The analytics price/interval/lifecycle columns are written
 * separately by recordSubscriptionBilling so that, if this code ships before the
 * billing_analytics migration lands in prod, gating still works and only the
 * analytics enrichment no-ops.
 */
export async function applySubscriptionState(
  customerId: string,
  state: SubscriptionBilling
) {
  const grant = ACTIVE_SUBSCRIPTION_STATUSES.has(state.status);
  const { error } = await supabase
    .from("users")
    .update({
      stripe_subscription_id: state.subscriptionId,
      subscription_status: state.status,
      learning_access: grant,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}

/**
 * Mirror the price / interval / lifecycle fields the analytics layer reads. Kept
 * separate from applySubscriptionState (the gating write) and called best-effort,
 * so a missing column (migration not yet applied) never breaks gating. Stripe's
 * start_date / canceled_at / item.current_period_end are canonical and stable
 * across events, so writing them on every event is idempotent.
 */
export async function recordSubscriptionBilling(
  customerId: string,
  state: SubscriptionBilling
) {
  const { error } = await supabase
    .from("users")
    .update({
      subscription_plan: state.plan ?? null,
      subscription_interval: state.interval ?? null,
      subscription_amount_cents: state.amountCents ?? null,
      subscription_current_period_end:
        state.currentPeriodEnd?.toISOString() ?? null,
      subscription_started_at: state.startedAt?.toISOString() ?? null,
      subscription_canceled_at: state.canceledAt?.toISOString() ?? null,
    })
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}

/**
 * Append a row to the immutable billing_events log. Idempotent on the Stripe
 * event id (Stripe retries deliver the same id), so re-delivery is a no-op.
 * This is the source of truth for MRR movement / churn / cohort analytics; it is
 * never updated or deleted. A failure here must not break gating — the webhook
 * calls this best-effort, after applySubscriptionState.
 */
export async function recordBillingEvent(e: {
  stripeEventId: string;
  customerId: string;
  subscriptionId: string | null;
  eventType: string;
  status: string | null;
  plan: string | null;
  interval: string | null;
  amountCents: number | null;
  occurredAt: Date;
}) {
  const user = await getUserByStripeCustomerId(e.customerId);
  const { error } = await supabase.from("billing_events").upsert(
    {
      stripe_event_id: e.stripeEventId,
      user_id: user?.id ?? null,
      stripe_customer_id: e.customerId,
      stripe_subscription_id: e.subscriptionId,
      event_type: e.eventType,
      status: e.status,
      plan: e.plan,
      interval: e.interval,
      amount_cents: e.amountCents,
      mrr_cents: normalizeMrrCents(e.amountCents, e.interval),
      occurred_at: e.occurredAt.toISOString(),
    },
    { onConflict: "stripe_event_id", ignoreDuplicates: true }
  );
  if (error) throw error;
}

export async function getUserByClerkId(clerkId: string) {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("clerk_id", clerkId)
    .limit(1)
    .single();

  return data ? mapUser(data) : null;
}

/** Resolve the app user from a Supabase auth uid. The provisioning trigger
 *  (handle_new_auth_user) guarantees a row exists for any signed-in account,
 *  but `maybeSingle` keeps this null-safe during the dual-stack transition. */
export async function getUserByAuthId(authId: string) {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", authId)
    .maybeSingle();

  return data ? mapUser(data) : null;
}

export async function createUser(data: {
  clerkId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}) {
  const { data: row } = await supabase
    .from("users")
    .upsert(
      {
        clerk_id: data.clerkId,
        email: data.email,
        display_name: data.displayName ?? null,
        avatar_url: data.avatarUrl ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_id" }
    )
    .select()
    .single();

  return row ? mapUser(row) : null;
}

type UserUpdate = Partial<{
  displayName: string;
  avatarUrl: string;
  skillScore: number;
  onboardingCompleted: boolean;
  bestStreak: number;
  startComposite: number;
  currentComposite: number;
  currentReadingWriting: number;
  currentMath: number;
  totalXp: number;
  timezone: string;
}>;

function buildUserUpdate(data: UserUpdate) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.displayName !== undefined) update.display_name = data.displayName;
  if (data.avatarUrl !== undefined) update.avatar_url = data.avatarUrl;
  if (data.skillScore !== undefined) update.skill_score = data.skillScore;
  if (data.onboardingCompleted !== undefined)
    update.onboarding_completed = data.onboardingCompleted;
  if (data.bestStreak !== undefined) update.best_streak = data.bestStreak;
  if (data.startComposite !== undefined) update.start_composite = data.startComposite;
  if (data.currentComposite !== undefined) update.current_composite = data.currentComposite;
  if (data.currentReadingWriting !== undefined) update.current_reading_writing = data.currentReadingWriting;
  if (data.currentMath !== undefined) update.current_math = data.currentMath;
  if (data.totalXp !== undefined) update.total_xp = data.totalXp;
  if (data.timezone !== undefined) update.timezone = data.timezone;
  return update;
}

/**
 * Update by external auth identity — the value `getAuthIdentity()` returned.
 * Provider-aware, mirroring `getAppUser`: in supabase mode that value is the
 * Supabase auth uid (match `auth_id`), in clerk mode the Clerk user id (match
 * `clerk_id`). Matching `clerk_id` unconditionally silently no-opped every
 * update for Supabase-native users (clerk_id NULL) after the auth cutover.
 */
export async function updateUser(externalId: string, data: UserUpdate) {
  const idColumn = isSupabaseAuth() ? "auth_id" : "clerk_id";

  const { data: row, error } = await supabase
    .from("users")
    .update(buildUserUpdate(data))
    .eq(idColumn, externalId)
    .select()
    .maybeSingle();

  if (!row) {
    // A missed match means the write was dropped — never fail this silently.
    console.error(
      `[users] updateUser matched no row (${idColumn}=${externalId})`,
      error?.message ?? ""
    );
  }

  return row ? mapUser(row) : null;
}

// Keyed on users.id (the app-level primary key) rather than the external auth
// identity, so it works for both Clerk-era and Supabase-native accounts.
export async function updateUserById(id: string, data: UserUpdate) {
  const { data: row } = await supabase
    .from("users")
    .update(buildUserUpdate(data))
    .eq("id", id)
    .select()
    .single();

  return row ? mapUser(row) : null;
}

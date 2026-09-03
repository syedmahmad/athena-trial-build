import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { hasLearningAccess, learningGateReason } from "@/lib/db/queries/users";
import { LearningUpsell } from "@/components/educators/learning-upsell";
import { TrialBanner } from "@/components/billing/trial-banner";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The learning paywall boundary (single chokepoint). Two independent gates
  // share learning_access: educator-funnel students (false) when the educator
  // paywall is on, and direct learners (null) whose free trial has elapsed when
  // the learner paywall is on. Homework always stays free on the public share
  // link. Both paywalls are off by default, so everyone passes through until a
  // flag flips. See [[project-educators-pricing]].
  // Provider-agnostic (Clerk or Supabase) via the AUTH_PROVIDER flag.
  const { userId } = await getAuthIdentity();
  if (userId) {
    const user = await getAppUser(userId);
    if (user && !hasLearningAccess(user)) {
      return <LearningUpsell reason={learningGateReason(user)} />;
    }
  }

  // Top navigation removed — every protected surface owns its own chrome and
  // any back-affordance routes to `/dashboard`.
  return (
    <div className="min-h-screen">
      <TrialBanner />
      <main>{children}</main>
    </div>
  );
}

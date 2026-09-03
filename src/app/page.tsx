import { getAuthIdentity } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { LandingHero } from "./_landing/landing-hero";

export default async function LandingPage() {
  // Provider-agnostic (Clerk or Supabase) so the landing page never calls
  // Clerk's auth() when the middleware is in Supabase mode.
  const { userId } = await getAuthIdentity();
  if (userId) redirect("/dashboard");
  return <LandingHero destination="/sign-up" />;
}

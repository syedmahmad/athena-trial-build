import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { isSupabaseAuth } from "@/lib/auth/provider";
import { SupabaseAuthForm } from "@/components/auth/supabase-auth-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      {isSupabaseAuth() ? (
        <Suspense fallback={null}>
          <SupabaseAuthForm mode="sign-in" />
        </Suspense>
      ) : (
        <SignIn />
      )}
    </div>
  );
}

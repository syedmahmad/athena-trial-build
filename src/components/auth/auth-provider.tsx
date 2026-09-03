import { ClerkProvider } from "@clerk/nextjs";
import { isSupabaseAuth } from "@/lib/auth/provider";
import { ClerkAuthBridge, SupabaseAuthProvider } from "./auth-context";

/**
 * Root auth provider, chosen by the AUTH_PROVIDER flag. Both branches expose
 * the same AuthContext (via their bridge), so every downstream auth shim is
 * provider-agnostic. Replaces the bare <ClerkProvider> in the root layout.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (isSupabaseAuth()) {
    return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
  }
  return (
    <ClerkProvider>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

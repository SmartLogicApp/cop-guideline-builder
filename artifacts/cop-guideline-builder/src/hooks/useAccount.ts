import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { apiFetch } from "@/lib/apiClient";

// Local type definitions — mirrors the DB schema without importing backend packages.
export interface Account {
  id: string;
  ccn: string;
  facilityName: string;
  facilityType: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AccountUser {
  id: string;
  clerkUserId: string;
  accountId: string | null;
  role: string | null;
  email: string | null;
  createdAt: string | null;
}

export interface AccountData {
  account:     Account | null;
  accountUser: AccountUser | null;
  isActive:    boolean;
  isAdminUser: boolean;
  isSuperAdmin: boolean;
}

export function useAccount() {
  const { isSignedIn, isLoaded } = useAuth();
  return useQuery<AccountData>({
    queryKey: ["account", "me"],
    queryFn:  () => apiFetch<AccountData>("/api/accounts/me"),
    enabled:  !!(isLoaded && isSignedIn),
    staleTime: 60_000,
    retry: false,
  });
}

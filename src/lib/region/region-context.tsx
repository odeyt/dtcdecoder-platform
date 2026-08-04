"use client";

// RegionProvider — same shape as this app's other top-of-tree client
// providers (NextIntlClientProvider in the root layouts): the server
// resolves the initial value once (region-resolver.ts, fed by the saved
// user_preferences.region_code / dtc_region_preference cookie / browser
// locale / Vercel's x-vercel-ip-country header), then this component holds
// it in React state so `setRegion` can update it client-side (e.g. the
// settings-page selector, or the geo-detection banner) without a full page
// reload. Persisting a signed-in user's choice back to user_preferences.
// region_code still goes through the existing savePreferencesAction — this
// context is UI state, not the source of truth.
//
// Filename is .tsx, not the literally-specced .ts, because a file
// containing JSX cannot be a .ts file under this project's TypeScript
// config — see docs/REGION_PROFILE_ARCHITECTURE.md.
import { createContext, useContext, useState, type ReactNode } from "react";
import type { RegionProfile, ResolvedRegion, RegionSource } from "./region-types";

export interface RegionContextValue {
  region: RegionProfile;
  source: RegionSource;
  setRegion: (profile: RegionProfile) => void;
}

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({
  initialRegion,
  children,
}: {
  initialRegion: ResolvedRegion;
  children: ReactNode;
}) {
  const [resolved, setResolved] = useState<ResolvedRegion>(initialRegion);

  const value: RegionContextValue = {
    region: resolved.profile,
    source: resolved.source,
    setRegion: (profile) => setResolved({ profile, source: "profile_setting" }),
  };

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegionContext(): RegionContextValue {
  const ctx = useContext(RegionContext);
  if (!ctx) {
    throw new Error("useRegion() (or useRegionContext()) must be used within a RegionProvider.");
  }
  return ctx;
}

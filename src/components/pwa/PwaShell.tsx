"use client";

import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

// Single mount point for the PWA layer — included once in each root layout
// (src/app/(app)/layout.tsx and src/app/[locale]/layout.tsx), the same
// pattern DtcTechnicianShell already uses. Renders nothing itself.
export function PwaShell() {
  return (
    <>
      <ServiceWorkerRegister />
      <InstallPrompt />
    </>
  );
}

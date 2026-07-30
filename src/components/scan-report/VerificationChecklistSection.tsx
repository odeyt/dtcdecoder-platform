"use client";

// Verification Checklist — the fixed 8-item post-repair checklist
// (scan_case_verification, migration 0042). Purely a technician
// self-attestation; it never feeds back into the AI's own conclusions.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateVerification } from "@/lib/scan-diagnostics/workbench-client";
import { useWorkbenchSaveStatus, withSaveStatus } from "@/components/scan-report/WorkbenchSaveStatus";
import type { ScanCaseVerification } from "@/lib/types";

interface VerificationChecklistSectionProps {
  caseId: string;
  initialVerification: ScanCaseVerification | null;
}

type VerificationKey =
  | "concernResolved"
  | "dtcsCleared"
  | "dtcsDidNotReturn"
  | "calibrationCompleted"
  | "roadTestCompleted"
  | "noNewWarningLights"
  | "postRepairScanReviewed"
  | "customerNotesRecorded";

const CHECKLIST_ITEMS: { key: VerificationKey; column: keyof ScanCaseVerification; labelKey: string }[] = [
  { key: "concernResolved", column: "concern_resolved", labelKey: "concernResolved" },
  { key: "dtcsCleared", column: "dtcs_cleared", labelKey: "dtcsCleared" },
  { key: "dtcsDidNotReturn", column: "dtcs_did_not_return", labelKey: "dtcsDidNotReturn" },
  { key: "calibrationCompleted", column: "calibration_completed", labelKey: "calibrationCompleted" },
  { key: "roadTestCompleted", column: "road_test_completed", labelKey: "roadTestCompleted" },
  { key: "noNewWarningLights", column: "no_new_warning_lights", labelKey: "noNewWarningLights" },
  { key: "postRepairScanReviewed", column: "post_repair_scan_reviewed", labelKey: "postRepairScanReviewed" },
  { key: "customerNotesRecorded", column: "customer_notes_recorded", labelKey: "customerNotesRecorded" },
];

export function VerificationChecklistSection({ caseId, initialVerification }: VerificationChecklistSectionProps) {
  const [verification, setVerification] = useState(initialVerification);
  const { report, reportSaving } = useWorkbenchSaveStatus();
  const t = useTranslations("scanReport");

  async function handleToggle(key: VerificationKey, checked: boolean) {
    const updated = await withSaveStatus(report, reportSaving, () => updateVerification(caseId, { [key]: checked }));
    if (updated) setVerification(updated);
  }

  return (
    <ul className="flex flex-col gap-2">
      {CHECKLIST_ITEMS.map(({ key, column, labelKey }) => {
        const checked = verification ? Boolean(verification[column]) : false;
        return (
          <li key={key}>
            <label className="glass-panel flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] p-3 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => handleToggle(key, e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              {t(labelKey)}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

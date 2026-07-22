import { DiagnosticProgress } from "@/components/DiagnosticProgress";

// Next.js renders this automatically while the /dtc server component's
// data fetch (searchDtcCodes) is in flight — a real Suspense boundary, not
// a client-side timer. It disappears the instant the real query resolves.
export default function DtcLoading() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <DiagnosticProgress
        stages={[
          "Parsing diagnostic query",
          "Searching verified DTC database",
          "Preparing results",
        ]}
      />
    </div>
  );
}

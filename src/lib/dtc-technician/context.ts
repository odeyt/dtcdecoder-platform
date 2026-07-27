// Phase 1 placeholder interface for what the persistent DTC Technician
// consultation shell CAN receive about the page it's opened from — case
// id, vehicle, DTCs, symptoms, scan summary, workflow state, locale. Per
// the phase brief: "Do not implement the entire future reasoning
// architecture in Phase 1. Create clear interfaces and placeholders."
//
// Today this context is used for DISPLAY only (a small context pill in the
// shell header, and pre-filling quick-action prompts) — it is NOT yet
// threaded into the actual AI generation request body (POST
// /api/ai/assistant has no vehicle/case-context parameters yet). Wiring
// real case-aware reasoning through this interface is explicit Phase 2
// scope — see docs/PHASE_1_DTC_TECHNICIAN_ARCHITECTURE.md.
export interface DtcTechnicianContext {
  caseId?: string;
  vehicle?: {
    year?: string;
    make?: string;
    model?: string;
    engine?: string;
    vin?: string;
  };
  dtcCodes: string[];
  symptoms?: string;
  complaint?: string;
  scanSummary?: {
    moduleCount?: number;
    dtcCount?: number;
    priorityFindings?: string[];
  };
  workflowState?: {
    workflowId?: string;
    currentNodeId?: string;
  };
  locale: string;
}

export function emptyDtcTechnicianContext(locale: string): DtcTechnicianContext {
  return { dtcCodes: [], locale };
}

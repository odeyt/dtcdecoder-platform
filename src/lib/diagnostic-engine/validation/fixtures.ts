// Phase 2.1 Step 10 — real-case validation fixtures
// (docs/DIAGNOSTIC_ENGINE_VALIDATION.md). No customer-identifying
// information anywhere here — every fixture is a synthetic, generic
// vehicle/complaint scenario representative of a real diagnostic pattern,
// never a specific customer's actual case data.
//
// Each fixture supplies everything the harness (evaluate.ts) needs to
// check the engine's DETERMINISTIC behavior (Question Engine, Safety
// Engine, evidence checklist) without ever calling an AI provider — no
// fixture here asserts what the AI itself must say, since that's
// inherently non-deterministic; it asserts what the deterministic layers
// around the AI must do regardless of the AI's specific wording.
import type { EvidenceItem, EvidenceType, DriveSafetyStatus } from "@/lib/diagnostic-engine/types";

export interface ValidationFixture {
  id: string;
  category: string;
  vehicle: { year: number; make: string; model: string; engine?: string };
  complaint: string;
  dtcs: Array<{ code: string; description: string; status: "current" | "history" | "pending" }>;
  /** Evidence already known at the start of this fixture's scenario. */
  evidenceSequence: Array<{ type: EvidenceType; value: unknown; confidence: EvidenceItem["confidence"] }>;
  knownConfirmedRootCause: string;
  /** A fieldKey from QUESTION_BANK the engine should plausibly ask about next, given evidenceSequence. */
  expectedHighValueQuestionFieldKeys: string[];
  expectedUsefulTests: string[];
  // The FULL-SYSTEM target — what a complete turn (evidence + a real AI
  // assessment's safetyWarnings) should classify this case as. Not
  // automatically enforceable without a real provider call — see
  // docs/DIAGNOSTIC_ENGINE_VALIDATION.md's "manual validation" section.
  expectedSafetyFloor: DriveSafetyStatus;
  // What classifyDriveSafety can determine from THIS fixture's structured
  // evidence alone (no AI safetyWarnings text) — this is what the
  // automated harness (evaluate.ts/evaluateSafetyFloor) actually checks.
  // Several fixtures show a real, confirmed gap here: expectedSafetyFloor
  // requires AI-supplied text to reach (see the validation doc's findings
  // section) — evidence-only classification alone is not yet sufficient
  // for those categories, most notably the EV/high-voltage case, which
  // does not yet deterministically reach immediate_stop from evidence
  // alone.
  expectedSafetyFloorEvidenceOnly: DriveSafetyStatus;
  /** Recommendation patterns that would be unacceptable ("parts roulette") if ever produced verbatim. */
  unacceptableRecommendations: string[];
}

export const VALIDATION_FIXTURES: ValidationFixture[] = [
  {
    id: "no-crank",
    category: "No crank",
    vehicle: { year: 2016, make: "Ford", model: "F-150", engine: "5.0L V8" },
    complaint: "Engine does not crank at all when the key is turned.",
    dtcs: [{ code: "P0562", description: "System Voltage Low", status: "current" }],
    evidenceSequence: [
      { type: "complaint", value: "Engine does not crank at all when the key is turned.", confidence: "high" },
      { type: "dtc_stored", value: { code: "P0562", description: "System Voltage Low" }, confidence: "high" },
    ],
    knownConfirmedRootCause: "Corroded battery ground strap causing insufficient cranking voltage at the starter.",
    expectedHighValueQuestionFieldKeys: ["symptom_onset", "crank_status", "battery_voltage"],
    expectedUsefulTests: ["Battery voltage test", "Ground strap continuity/voltage-drop test"],
    expectedSafetyFloor: "safe_to_drive",
    expectedSafetyFloorEvidenceOnly: "safe_to_drive",
    unacceptableRecommendations: ["Replace starter motor", "Replace PCM"],
  },
  {
    id: "crank-no-start",
    category: "Crank but no start",
    vehicle: { year: 2014, make: "Honda", model: "Civic", engine: "1.8L I4" },
    complaint: "Engine cranks normally but will not start or run.",
    dtcs: [{ code: "P0335", description: "Crankshaft Position Sensor Circuit", status: "current" }],
    evidenceSequence: [
      { type: "complaint", value: "Engine cranks normally but will not start or run.", confidence: "high" },
      { type: "dtc_stored", value: { code: "P0335", description: "Crankshaft Position Sensor Circuit" }, confidence: "high" },
    ],
    knownConfirmedRootCause: "Open circuit at the crankshaft position sensor connector.",
    expectedHighValueQuestionFieldKeys: ["symptom_onset", "crank_status", "start_status"],
    expectedUsefulTests: ["Crank sensor signal scope test", "Crank sensor connector/wiring inspection"],
    expectedSafetyFloor: "tow_recommended",
    expectedSafetyFloorEvidenceOnly: "safe_to_drive",
    unacceptableRecommendations: ["Replace crankshaft position sensor without testing", "Replace ECM"],
  },
  {
    id: "misfire",
    category: "Misfire",
    vehicle: { year: 2018, make: "Toyota", model: "Camry", engine: "2.5L I4" },
    complaint: "Rough idle and intermittent shaking, especially at low RPM.",
    dtcs: [{ code: "P0301", description: "Cylinder 1 Misfire Detected", status: "current" }],
    evidenceSequence: [
      { type: "complaint", value: "Rough idle and intermittent shaking, especially at low RPM.", confidence: "high" },
      { type: "symptom", value: "Rough idle", confidence: "medium" },
      { type: "dtc_stored", value: { code: "P0301", description: "Cylinder 1 Misfire Detected" }, confidence: "high" },
    ],
    knownConfirmedRootCause: "Fouled spark plug on cylinder 1 from a failing ignition coil.",
    expectedHighValueQuestionFieldKeys: ["symptom_onset", "dtc_status"],
    expectedUsefulTests: ["Cylinder 1 coil swap test", "Spark plug inspection", "Fuel injector balance test"],
    expectedSafetyFloor: "drive_with_caution",
    expectedSafetyFloorEvidenceOnly: "safe_to_drive",
    unacceptableRecommendations: ["Replace engine", "Replace all spark plugs and coils without isolating cylinder 1"],
  },
  {
    id: "network-can-fault",
    category: "Network or CAN fault",
    vehicle: { year: 2019, make: "Chevrolet", model: "Silverado", engine: "5.3L V8" },
    complaint: "Multiple warning lights, intermittent loss of gauge cluster function.",
    dtcs: [{ code: "U0100", description: "Lost Communication With ECM/PCM", status: "current" }],
    evidenceSequence: [
      { type: "complaint", value: "Multiple warning lights, intermittent loss of gauge cluster function.", confidence: "high" },
      { type: "dtc_stored", value: { code: "U0100", description: "Lost Communication With ECM/PCM" }, confidence: "high" },
      { type: "safety_issue", value: { code: "U0100", reason: "Flagged as a safety-relevant system fault." }, confidence: "medium" },
    ],
    knownConfirmedRootCause: "Damaged CAN bus wiring causing intermittent network dropout.",
    expectedHighValueQuestionFieldKeys: ["dtc_status", "symptom_onset"],
    expectedUsefulTests: ["CAN bus resistance/termination test", "Wiggle test on harness routing near known chafe points"],
    expectedSafetyFloor: "drive_with_caution",
    expectedSafetyFloorEvidenceOnly: "drive_with_caution",
    unacceptableRecommendations: ["Replace ECM without testing the network first", "Replace instrument cluster"],
  },
  {
    id: "low-voltage-multi-module",
    category: "Low-voltage multi-module fault",
    vehicle: { year: 2015, make: "Nissan", model: "Altima", engine: "2.5L I4" },
    complaint: "Multiple modules throwing codes together, worse in cold weather.",
    dtcs: [
      { code: "P0562", description: "System Voltage Low", status: "current" },
      { code: "U0100", description: "Lost Communication With ECM/PCM", status: "history" },
    ],
    evidenceSequence: [
      { type: "complaint", value: "Multiple modules throwing codes together, worse in cold weather.", confidence: "high" },
      { type: "dtc_stored", value: { code: "P0562", description: "System Voltage Low" }, confidence: "high" },
      { type: "dtc_stored", value: { code: "U0100", description: "Lost Communication With ECM/PCM" }, confidence: "medium" },
    ],
    knownConfirmedRootCause: "Corroded chassis ground point causing a shared low-voltage condition across modules.",
    expectedHighValueQuestionFieldKeys: ["symptom_onset", "battery_voltage", "dtc_status"],
    expectedUsefulTests: ["Battery/charging system test", "Chassis ground point voltage-drop test"],
    expectedSafetyFloor: "drive_with_caution",
    expectedSafetyFloorEvidenceOnly: "safe_to_drive",
    unacceptableRecommendations: ["Replace all affected modules", "Replace battery without testing charging system"],
  },
  {
    id: "sensor-circuit-fault",
    category: "Sensor circuit fault",
    vehicle: { year: 2017, make: "Subaru", model: "Outback", engine: "2.5L I4" },
    complaint: "Check engine light, no noticeable drivability change.",
    dtcs: [{ code: "P0171", description: "System Too Lean (Bank 1)", status: "current" }],
    evidenceSequence: [
      { type: "complaint", value: "Check engine light, no noticeable drivability change.", confidence: "high" },
      { type: "dtc_stored", value: { code: "P0171", description: "System Too Lean (Bank 1)" }, confidence: "high" },
    ],
    knownConfirmedRootCause: "Vacuum leak at the intake manifold gasket skewing the fuel trim.",
    expectedHighValueQuestionFieldKeys: ["dtc_status", "symptom_onset"],
    expectedUsefulTests: ["Smoke test for vacuum leaks", "Fuel trim live-data review", "MAF sensor inspection"],
    expectedSafetyFloor: "safe_to_drive",
    expectedSafetyFloorEvidenceOnly: "safe_to_drive",
    unacceptableRecommendations: ["Replace MAF sensor without testing", "Replace fuel injectors"],
  },
  {
    id: "mechanical-presenting-electrical",
    category: "Mechanical failure presenting as an electrical code",
    vehicle: { year: 2013, make: "Volkswagen", model: "Jetta", engine: "2.0L TDI" },
    complaint: "Check engine light with a timing-related code after a timing belt service.",
    dtcs: [{ code: "P0016", description: "Crankshaft/Camshaft Timing Misalignment", status: "current" }],
    evidenceSequence: [
      { type: "complaint", value: "Check engine light with a timing-related code after a timing belt service.", confidence: "high" },
      { type: "dtc_stored", value: { code: "P0016", description: "Crankshaft/Camshaft Timing Misalignment" }, confidence: "high" },
      { type: "previous_repair", value: "Timing belt replaced 2 weeks ago", confidence: "high" },
    ],
    knownConfirmedRootCause: "Timing belt installed one tooth off during the recent service — a mechanical fault, not a sensor/wiring fault.",
    expectedHighValueQuestionFieldKeys: ["symptom_onset", "previous_repair", "dtc_status"],
    expectedUsefulTests: ["Timing belt/cam-crank timing verification", "Camshaft and crankshaft position sensor signal comparison"],
    expectedSafetyFloor: "tow_recommended",
    expectedSafetyFloorEvidenceOnly: "safe_to_drive",
    unacceptableRecommendations: ["Replace camshaft position sensor", "Replace crankshaft position sensor"],
  },
  {
    id: "incorrectly-replaced-part",
    category: "Incorrectly replaced part",
    vehicle: { year: 2012, make: "Ford", model: "Escape", engine: "2.5L I4" },
    complaint: "Same check engine light returned days after a part was replaced.",
    dtcs: [{ code: "P0455", description: "EVAP System Leak Detected (Large Leak)", status: "current" }],
    evidenceSequence: [
      { type: "complaint", value: "Same check engine light returned days after a part was replaced.", confidence: "high" },
      { type: "dtc_stored", value: { code: "P0455", description: "EVAP System Leak Detected (Large Leak)" }, confidence: "high" },
      { type: "previous_repair", value: "Gas cap replaced last week, code returned", confidence: "high" },
    ],
    knownConfirmedRootCause: "The replaced gas cap was not the actual leak source — a cracked EVAP purge line was the real cause.",
    expectedHighValueQuestionFieldKeys: ["symptom_onset", "previous_repair", "dtc_status"],
    expectedUsefulTests: ["EVAP smoke test", "Visual inspection of EVAP lines and purge valve"],
    expectedSafetyFloor: "safe_to_drive",
    expectedSafetyFloorEvidenceOnly: "safe_to_drive",
    unacceptableRecommendations: ["Replace the gas cap again", "Replace the fuel tank"],
  },
  {
    id: "intermittent-harness-fault",
    category: "Intermittent harness fault",
    vehicle: { year: 2011, make: "Jeep", model: "Grand Cherokee", engine: "3.6L V6" },
    complaint: "Random warning lights that come and go, worse over bumps.",
    dtcs: [{ code: "P0700", description: "Transmission Control System Malfunction", status: "pending" }],
    evidenceSequence: [
      { type: "complaint", value: "Random warning lights that come and go, worse over bumps.", confidence: "high" },
      { type: "dtc_pending", value: { code: "P0700", description: "Transmission Control System Malfunction" }, confidence: "medium" },
    ],
    knownConfirmedRootCause: "Chafed harness section near a suspension mount causing an intermittent short.",
    expectedHighValueQuestionFieldKeys: ["symptom_onset", "dtc_status"],
    expectedUsefulTests: ["Wiggle test while monitoring live data", "Harness routing/chafe-point visual inspection"],
    expectedSafetyFloor: "drive_with_caution",
    expectedSafetyFloorEvidenceOnly: "safe_to_drive",
    unacceptableRecommendations: ["Replace transmission control module without testing wiring", "Replace transmission"],
  },
  {
    id: "ev-high-voltage-safety",
    category: "EV/high-voltage safety case",
    vehicle: { year: 2021, make: "Chevrolet", model: "Bolt EV", engine: "Electric" },
    complaint: "High-voltage system warning light, vehicle will not enter Ready mode.",
    dtcs: [{ code: "P0AA6", description: "Hybrid/EV Battery Isolation Fault", status: "current" }],
    evidenceSequence: [
      { type: "complaint", value: "High-voltage system warning light, vehicle will not enter Ready mode.", confidence: "high" },
      { type: "dtc_stored", value: { code: "P0AA6", description: "Hybrid/EV Battery Isolation Fault" }, confidence: "high" },
      { type: "safety_issue", value: { code: "P0AA6", reason: "Flagged as a safety-relevant system fault." }, confidence: "high" },
    ],
    knownConfirmedRootCause: "High-voltage isolation fault requiring a qualified EV technician with proper PPE and lockout/tagout before any further diagnosis.",
    expectedHighValueQuestionFieldKeys: ["dtc_status", "symptom_onset"],
    expectedUsefulTests: ["High-voltage isolation test by a qualified EV technician with proper PPE"],
    expectedSafetyFloor: "immediate_stop",
    expectedSafetyFloorEvidenceOnly: "drive_with_caution",
    unacceptableRecommendations: [
      "Probe the high-voltage battery pack without PPE",
      "Instruct an unqualified user to open the high-voltage disconnect",
    ],
  },
];

-- Adds representative generic codes across the B/C/U families (only P-codes
-- existed before this — see supabase/seed/seed_starter_dtc_codes.sql) plus
-- one deliberately reserved code, so the reference layer has at least one
-- real example of every state the lookup service (src/lib/dtc-lookup.ts)
-- can return. Original content, written for this project — not copied from
-- Identifix, ALLDATA, Mitchell, or any other subscription source. This is
-- NOT a complete global DTC dataset — see docs/DTC_REFERENCE_ARCHITECTURE.md.
--
-- U1003 is deliberately NOT seeded here — it's a real-world example of a
-- manufacturer-specific code (SAE J2012 second-digit "1") with no universal
-- meaning to publish; the lookup service is what correctly asks for vehicle
-- context for it instead of fabricating a generic definition.
--
-- Safe to re-run: ON CONFLICT targets the same partial unique index
-- (dtc_generic_slug) migration 0003 created for generic-code slugs.

insert into dtc_codes (
  code, make, model, engine_code, slug, title, meta_description, meaning,
  symptoms, causes, diagnostic_steps, common_mistakes, difficulty, severity,
  drive_recommendation, related_makes, faq, is_published,
  normalized_code, family, code_type, generic_definition, manufacturer_specific,
  reserved_code, source_type, source_name, review_status, active
) values (
  'U0100', null, null, null, 'u0100',
  'U0100 - Lost Communication With ECM/PCM',
  $$U0100 lost communication with the engine control module: what it means and where to start.$$,
  $$A module on the vehicle's communication network (commonly the body control module, instrument cluster, or transmission control module) has stopped receiving expected messages from the Engine Control Module / Powertrain Control Module. This is a network-level fault, not a specific sensor failure.$$,
  ARRAY[
    'Check engine light on, often with other unrelated warning lights',
    'Multiple modules showing communication-fault codes at once',
    'Instrument cluster gauges dropping to zero or acting erratically',
    'No-start or stall, in more severe cases'
  ],
  ARRAY[
    'Blown fuse or open circuit powering the ECM/PCM',
    'Corroded or damaged connector at the ECM/PCM',
    'Damaged or shorted CAN bus wiring',
    'ECM/PCM internal failure',
    'Low or intermittent battery/charging voltage disrupting module communication'
  ],
  ARRAY[
    'Check the ECM/PCM power and ground circuits before assuming a bus fault',
    'Verify battery voltage is in spec and stable under load',
    'Inspect the ECM/PCM connector for corrosion or damage',
    'Check CAN bus resistance and look for a shorted or open bus segment',
    'Pull codes from every module — a single module showing this is different from a bus-wide pattern'
  ],
  $$Replacing the ECM/PCM outright without first confirming power, ground, and bus integrity — a wiring or connector fault causes this far more often than the module itself failing.$$,
  'moderate', 'high',
  $$A communication fault affecting the engine control module can appear alongside a stall or no-start condition. If the vehicle stalled or won't restart reliably, have it inspected before continuing to drive.$$,
  ARRAY[]::text[],
  jsonb_build_array(
    jsonb_build_object('q', 'Does U0100 mean the ECM/PCM itself is broken?', 'a', 'Not necessarily. It means another module stopped hearing from it — the actual cause is often wiring, a connector, a fuse, or low voltage rather than the module failing outright.')
  ),
  true,
  'U0100', 'U', 'generic', true, false, false, 'original', 'DTCDecoder original content', 'approved', true
),
(
  'B0001', null, null, null, 'b0001',
  'B0001 - Driver Frontal Deployment Control (Stage 1)',
  $$B0001 driver frontal airbag stage 1 deployment control: what it means and why this is a professional-inspection-only code.$$,
  $$The restraint control module has detected a fault in the stage 1 deployment control circuit for the driver's frontal airbag. This is a safety-restraint-system code — it does not indicate a fault with a comfort or convenience system.$$,
  ARRAY[
    'Airbag warning light illuminated or flashing on the dashboard',
    'No other drivability symptoms in most cases'
  ],
  ARRAY[
    'Damaged, corroded, or disconnected wiring in the driver airbag deployment circuit',
    'Clockspring (steering wheel wiring connector) fault',
    'Restraint control module fault'
  ],
  ARRAY[
    'This code must be diagnosed and cleared by a qualified technician with proper restraint-system training and tools',
    'Never probe or apply voltage/resistance measurements directly to an airbag squib circuit with standard shop meters'
  ],
  $$Attempting to self-diagnose or probe the deployment circuit with a standard multimeter — this can cause unintended deployment and serious injury. Restraint-system diagnosis requires manufacturer-specified procedures and tools.$$,
  'professional', 'critical',
  $$Have this inspected by a qualified technician before driving if possible — a fault in the airbag deployment circuit means the driver frontal airbag may not deploy correctly in a collision.$$,
  ARRAY[]::text[],
  jsonb_build_array(
    jsonb_build_object('q', 'Can I clear this code myself and keep driving?', 'a', 'Clearing the code does not fix the underlying fault. This is a safety-restraint-system issue — have it inspected by a qualified technician rather than just clearing the light.')
  ),
  true,
  'B0001', 'B', 'generic', true, false, false, 'original', 'DTCDecoder original content', 'approved', true
),
(
  'C0035', null, null, null, 'c0035',
  'C0035 - Left Front Wheel Speed Sensor Circuit',
  $$C0035 left front wheel speed sensor circuit: what it means, common causes, and basic checks.$$,
  $$The ABS/stability control module has detected an implausible or missing signal from the left front wheel speed sensor circuit — either no signal, an out-of-range signal, or a signal that doesn't correlate with the other wheel speed sensors.$$,
  ARRAY[
    'ABS warning light on',
    'Traction control / stability control light on',
    'ABS and/or traction control temporarily or permanently disabled',
    'Speedometer acting erratically in some vehicles that share this signal'
  ],
  ARRAY[
    'Damaged, corroded, or disconnected wiring/connector at the left front wheel speed sensor',
    'Failed wheel speed sensor',
    'Damaged or contaminated tone ring/reluctor ring',
    'Excessive wheel bearing play affecting sensor air gap'
  ],
  ARRAY[
    'Inspect the sensor connector and wiring for damage or corrosion',
    'Check the sensor air gap and tone ring condition',
    'Compare live wheel speed sensor data across all four wheels with a scan tool',
    'Check wheel bearing play if the sensor and wiring test normal'
  ],
  $$Replacing the wheel speed sensor before checking the wiring, connector, and tone ring — a damaged tone ring or a wiring fault will cause the new sensor to fail the same way.$$,
  'moderate', 'high',
  $$Reduced or disabled ABS and stability control affects vehicle control during hard braking or on slippery surfaces. Have this diagnosed promptly, particularly before driving in poor weather.$$,
  ARRAY[]::text[],
  jsonb_build_array(
    jsonb_build_object('q', 'Is it safe to drive with this code?', 'a', 'The vehicle will generally still drive and brake normally, but ABS and stability control may be disabled on that wheel — get it diagnosed soon, especially before driving in rain or snow.')
  ),
  true,
  'C0035', 'C', 'generic', true, false, false, 'original', 'DTCDecoder original content', 'approved', true
),
(
  'C0300', null, null, null, 'c0300',
  'C0300 - Reserved',
  $$C0300 is marked reserved in this reference database — see the definition field for what that means.$$,
  $$This code is marked as reserved by the diagnostic standard and does not have an assigned generic definition. A reading of this exact code should be confirmed against the vehicle's own service information, since a code in this shape has not been assigned a published generic meaning here.$$,
  ARRAY[]::text[],
  ARRAY[]::text[],
  ARRAY[]::text[],
  null,
  'moderate', 'low',
  null,
  ARRAY[]::text[],
  '[]'::jsonb,
  true,
  'C0300', 'C', 'reserved', false, false, true, 'original', 'DTCDecoder original content', 'approved', true
)
on conflict (slug) where make is null do nothing;

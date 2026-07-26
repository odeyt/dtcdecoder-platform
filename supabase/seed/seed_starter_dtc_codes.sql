-- One-time content seed, not a schema migration — the dtc_codes table
-- (migration 0003) has been live with zero rows, so there was nothing for
-- the interactive search / basic-search rate limiter (migration 0022) to
-- actually return. These are five genuine, generic (make = null) DTC
-- codes among the most commonly searched fault codes, written the same as
-- any other published dtc_codes row — real content, not test fixtures.
-- Safe to re-run: ON CONFLICT targets the same partial unique index
-- (dtc_generic_slug) migration 0003 created for generic-code slugs.

insert into dtc_codes (
  code, make, model, engine_code, slug, title, meta_description, meaning,
  symptoms, causes, diagnostic_steps, common_mistakes, difficulty, severity,
  drive_recommendation, related_makes, faq, is_published
) values (
  'P0300', null, null, null, 'p0300',
  'P0300 - Random/Multiple Cylinder Misfire Detected',
  $$P0300 random or multiple cylinder misfire: what it means, common causes, and a step-by-step diagnostic path.$$,
  $$The ECU has detected misfires occurring on more than one cylinder, or misfires it cannot attribute to a single cylinder, based on erratic crankshaft speed sensed by the crankshaft position sensor.$$,
  ARRAY[
    'Rough idle',
    'Engine shaking or vibration',
    'Loss of power',
    'Check engine light flashing during an active misfire',
    'Hesitation on acceleration',
    'Reduced fuel economy'
  ],
  ARRAY[
    'Worn or fouled spark plugs',
    'Failing ignition coil(s)',
    'Vacuum leak',
    'Low fuel pressure',
    'Clogged or leaking fuel injector(s)',
    'Low cylinder compression',
    'Faulty mass airflow sensor',
    'Contaminated fuel'
  ],
  ARRAY[
    'Pull codes and check for companion cylinder-specific misfire codes (P0301 to P0308)',
    'Inspect spark plugs and ignition coils',
    'Smoke-test the intake for vacuum leaks',
    'Check fuel trims — positive trims point to a lean condition',
    'Test fuel pressure against spec',
    'Run a compression or leak-down test if a mechanical cause is suspected'
  ],
  $$Replacing every spark plug and coil at once before confirming the misfire pattern — a single failing coil or a vacuum leak is often mistaken for a full ignition system failure.$$,
  'moderate', 'high',
  $$If the check engine light is flashing, stop driving as soon as it is safe to do so — an active misfire can dump unburned fuel into the catalytic converter and destroy it within minutes. A steady, non-flashing light is safer to drive on briefly to get it diagnosed.$$,
  ARRAY[]::text[],
  jsonb_build_array(
    jsonb_build_object('q', 'Is P0300 the same as a single-cylinder misfire code?', 'a', 'No — P0300 means the ECU could not pin the misfire to one cylinder, or it is happening across more than one. Codes P0301 through P0308 point to a specific cylinder instead.'),
    jsonb_build_object('q', 'Can I keep driving with a P0300 code?', 'a', 'It depends on whether the check engine light is flashing. A flashing light means an active misfire that can damage the catalytic converter quickly — stop driving as soon as it is safe. A steady light is safer to drive on briefly.')
  ),
  true
)
on conflict (slug) where make is null do nothing;

insert into dtc_codes (
  code, make, model, engine_code, slug, title, meta_description, meaning,
  symptoms, causes, diagnostic_steps, common_mistakes, difficulty, severity,
  drive_recommendation, related_makes, faq, is_published
) values (
  'P0420', null, null, null, 'p0420',
  'P0420 - Catalyst System Efficiency Below Threshold (Bank 1)',
  $$P0420 catalyst efficiency below threshold: what it means, why it is often misdiagnosed, and how to confirm the actual cause.$$,
  $$The ECU compares oxygen sensor readings from before and after the catalytic converter on Bank 1. When the downstream sensor's readings look too similar to the upstream sensor's, the converter is not cleaning up the exhaust efficiently enough, so the ECU logs P0420.$$,
  ARRAY[
    'Check engine light (usually the only symptom)',
    'Possible failed emissions test',
    'Occasionally a faint sulfur smell',
    'Slightly reduced fuel economy'
  ],
  ARRAY[
    'Aging or worn-out catalytic converter',
    'Failing oxygen sensor giving a false reading',
    'Engine misfire or rich-running condition prematurely damaging the converter',
    'Exhaust leak upstream of the downstream oxygen sensor',
    'Loose oxygen sensor connector'
  ],
  ARRAY[
    'Rule out a misfire or fuel-trim problem masquerading as a converter fault',
    'Inspect the exhaust for leaks between the converter and the downstream sensor',
    'Check both upstream and downstream oxygen sensor waveforms on a scan tool',
    'Compare the two sensors switching activity',
    'Replace the converter only after ruling out an upstream cause'
  ],
  $$Replacing the catalytic converter first without checking for an underlying misfire, rich condition, or failing oxygen sensor — the new converter can fail again quickly if the root cause is not fixed first.$$,
  'moderate', 'moderate',
  $$Generally safe to keep driving in the short term — this code alone does not indicate an immediate mechanical danger — but get it diagnosed soon since it will typically fail an emissions inspection.$$,
  ARRAY[]::text[],
  jsonb_build_array(
    jsonb_build_object('q', 'Does P0420 always mean I need a new catalytic converter?', 'a', 'No. A failing oxygen sensor, an exhaust leak, or an underlying misfire can all trigger P0420 without the converter itself being bad. Confirm the cause with sensor data before replacing the converter.'),
    jsonb_build_object('q', 'Will P0420 make my car fail an emissions test?', 'a', 'In most areas, yes — a stored P0420 typically fails an OBD-II emissions inspection even if the car drives fine.')
  ),
  true
)
on conflict (slug) where make is null do nothing;

insert into dtc_codes (
  code, make, model, engine_code, slug, title, meta_description, meaning,
  symptoms, causes, diagnostic_steps, common_mistakes, difficulty, severity,
  drive_recommendation, related_makes, faq, is_published
) values (
  'P0171', null, null, null, 'p0171',
  'P0171 - System Too Lean (Bank 1)',
  $$P0171 system too lean (Bank 1): common causes like vacuum leaks and a weak fuel pump, and how to diagnose it.$$,
  $$The ECU has determined the air-fuel mixture on Bank 1 is running leaner (more air, less fuel) than it is able to correct for using fuel trim adjustments alone.$$,
  ARRAY[
    'Rough or high idle',
    'Hesitation on acceleration',
    'Occasional misfire',
    'Check engine light',
    'Reduced power',
    'Surging at idle'
  ],
  ARRAY[
    'Vacuum leak (intake boot, PCV hose, brake booster line)',
    'Dirty or failing mass airflow sensor',
    'Weak fuel pump or low fuel pressure',
    'Clogged fuel injector(s)',
    'Exhaust leak upstream of the oxygen sensor'
  ],
  ARRAY[
    'Check long-term and short-term fuel trims on a scan tool',
    'Smoke-test the intake system for vacuum leaks',
    'Inspect and clean the mass airflow sensor',
    'Check fuel pressure against spec',
    'Inspect for exhaust leaks near the upstream oxygen sensor'
  ],
  $$Cleaning or replacing the mass airflow sensor as a first step without smoke-testing for vacuum leaks first — a leaking intake boot or PCV hose is a far more common cause.$$,
  'moderate', 'moderate',
  $$Safe to drive short-term if the engine is running reasonably smoothly, but have it looked at soon — a sustained lean condition can cause a misfire and, over time, damage the catalytic converter.$$,
  ARRAY[]::text[],
  jsonb_build_array(
    jsonb_build_object('q', 'What is the most common cause of P0171?', 'a', 'A vacuum leak — most often a cracked or loose intake boot, PCV hose, or brake booster line — is the single most common cause.'),
    jsonb_build_object('q', 'Is P0171 the same on every car?', 'a', 'The definition (Bank 1 running lean) is standardized across manufacturers, but the most likely cause varies by engine design, so always check the fuel trim numbers and inspect the intake before assuming a specific part is at fault.')
  ),
  true
)
on conflict (slug) where make is null do nothing;

insert into dtc_codes (
  code, make, model, engine_code, slug, title, meta_description, meaning,
  symptoms, causes, diagnostic_steps, common_mistakes, difficulty, severity,
  drive_recommendation, related_makes, faq, is_published
) values (
  'P0128', null, null, null, 'p0128',
  'P0128 - Coolant Thermostat (Coolant Temperature Below Thermostat Regulating Temperature)',
  $$P0128 coolant thermostat code: usually a thermostat stuck open. What it means and how to confirm it.$$,
  $$The engine coolant temperature sensor is reporting that the coolant is not reaching normal operating temperature within the expected time after startup, which usually points to the thermostat being stuck open.$$,
  ARRAY[
    'Check engine light',
    'Engine takes longer than normal to warm up',
    'Weak heater output in cold weather',
    'Temperature gauge reads lower than normal',
    'Slightly reduced fuel economy'
  ],
  ARRAY[
    'Thermostat stuck open or stuck partially open',
    'Faulty coolant temperature sensor',
    'Low coolant level',
    'Wiring issue at the coolant temperature sensor connector'
  ],
  ARRAY[
    'Check coolant level and condition first',
    'Monitor coolant temperature on a scan tool during a warm-up drive and compare time-to-temperature against spec',
    'Inspect the thermostat housing for the thermostat opening prematurely',
    'Test the coolant temperature sensor resistance against its spec chart'
  ],
  $$Replacing the coolant temperature sensor first — the thermostat itself is stuck open far more often than the sensor is actually faulty.$$,
  'easy', 'low',
  $$Safe to keep driving — this code is not an immediate danger to the engine, though a stuck-open thermostat can hurt fuel economy and cabin heat until it is replaced.$$,
  ARRAY[]::text[],
  jsonb_build_array(
    jsonb_build_object('q', 'Can I drive with P0128 for a while before fixing it?', 'a', 'Yes — a stuck-open thermostat is not dangerous, it just means the engine runs cooler than designed, hurting fuel economy and cabin heat.'),
    jsonb_build_object('q', 'How much does a thermostat replacement typically cost?', 'a', 'The part itself is inexpensive; labor varies a lot by vehicle depending on how accessible the thermostat housing is.')
  ),
  true
)
on conflict (slug) where make is null do nothing;

insert into dtc_codes (
  code, make, model, engine_code, slug, title, meta_description, meaning,
  symptoms, causes, diagnostic_steps, common_mistakes, difficulty, severity,
  drive_recommendation, related_makes, faq, is_published
) values (
  'P0455', null, null, null, 'p0455',
  'P0455 - Evaporative Emission Control System Leak Detected (Large Leak)',
  $$P0455 EVAP large leak detected: almost always a loose gas cap or a disconnected hose. How to find it.$$,
  $$The EVAP system, which captures and stores fuel vapor instead of letting it vent to the atmosphere, has failed a leak test badly enough that the ECU considers it a large leak — usually big enough to find by eye or ear.$$,
  ARRAY[
    'Check engine light',
    'Fuel smell around the vehicle',
    'Possible failed emissions test',
    'No other drivability symptoms'
  ],
  ARRAY[
    'Loose or missing gas cap',
    'Cracked or disconnected EVAP hose',
    'Failed purge or vent valve stuck open',
    'Cracked charcoal canister',
    'Damaged fuel filler neck'
  ],
  ARRAY[
    'Check and reseat the gas cap first, then clear the code to see if it returns',
    'Visually inspect all accessible EVAP hoses and connections for cracks or disconnection',
    'Use a smoke machine to pressurize the EVAP system and look for the leak',
    'Test the purge and vent valves for proper operation'
  ],
  $$Assuming the gas cap fixed it just because the light goes off temporarily — the code often will not reset until several drive cycles have passed, so a real leak can look fixed for a while before the light returns.$$,
  'easy', 'low',
  $$Safe to keep driving — this is an emissions issue, not a mechanical or safety concern — but fix it before an emissions test and to stop wasting fuel vapor.$$,
  ARRAY[]::text[],
  jsonb_build_array(
    jsonb_build_object('q', 'I tightened my gas cap and the light is still on — did that not fix it?', 'a', 'It can take several drive cycles for the ECU to re-run the EVAP monitor and clear the code even after the actual leak is fixed, so give it a few days of normal driving before assuming the fix did not work.'),
    jsonb_build_object('q', 'Is P0455 urgent?', 'a', 'No — it is an emissions-system leak, not a safety or drivability issue, though it should be fixed before an emissions inspection.')
  ),
  true
)
on conflict (slug) where make is null do nothing;

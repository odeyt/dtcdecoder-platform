import { describe, expect, it } from "vitest";
import { extractProtectedTokens, verifyTokenPreservation } from "@/lib/ai/token-preservation";

describe("extractProtectedTokens", () => {
  it("extracts DTC codes with and without failure-type suffix", () => {
    const toks = extractProtectedTokens("Codes P0420 and U0101-00 with B1234.");
    expect(toks).toContain("P0420");
    expect(toks).toContain("U0101-00");
    expect(toks).toContain("B1234");
  });

  it("extracts module acronyms and measurements", () => {
    const toks = extractProtectedTokens("The PCM shows 12 V at the DLC pin 6, expect 60 Ω.");
    expect(toks).toContain("PCM");
    expect(toks).toContain("12 V");
    expect(toks).toContain("DLC PIN 6");
    expect(toks).toContain("60 Ω");
  });

  it("extracts Bank/Sensor and CAN High/Low", () => {
    const toks = extractProtectedTokens("Bank 1 Sensor 2 on CAN High / CAN Low");
    expect(toks).toContain("BANK 1 SENSOR 2");
    expect(toks).toContain("CAN HIGH");
    expect(toks).toContain("CAN LOW");
  });

  it("extracts a VIN", () => {
    expect(extractProtectedTokens("VIN 1HGCM82633A004352")).toContain("1HGCM82633A004352");
  });
});

describe("verifyTokenPreservation", () => {
  const english = "P0420 catalyst fault on Bank 1 Sensor 2. Check the PCM ground: expect 12 V, reference 5 V, resistance 60 Ω.";

  it("passes when all protected tokens survive (natural-language translated)", () => {
    // Spanish prose, technical tokens preserved verbatim.
    const es = "Falla del catalizador P0420 en el Bank 1 Sensor 2. Revise la tierra del PCM: se esperan 12 V, referencia 5 V, resistencia 60 Ω.";
    expect(verifyTokenPreservation(english, es)).toEqual({ ok: true, missing: [] });
  });

  it("fails when a DTC code is dropped", () => {
    const bad = "Falla del catalizador en el Bank 1 Sensor 2. Revise la tierra del PCM: 12 V, 5 V, 60 Ω.";
    const r = verifyTokenPreservation(english, bad);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("P0420");
  });

  it("fails when an acronym is translated/altered", () => {
    const bad = "Falla del catalizador P0420 en el Banco 1 Sensor 2. Revise la tierra del módulo: 12 V, 5 V, 60 Ω.";
    const r = verifyTokenPreservation(english, bad);
    expect(r.ok).toBe(false);
    // PCM and the Bank-1-Sensor-2 phrase were altered → reported missing.
    expect(r.missing).toContain("PCM");
  });

  it("fails when a measurement value is changed", () => {
    const bad = "P0420 en Bank 1 Sensor 2. PCM: 14 V, 5 V, 60 Ω.";
    const r = verifyTokenPreservation(english, bad);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("12 V");
  });

  it("is case-insensitive on token identity (does not flag re-casing)", () => {
    const ok = "P0420 en bank 1 sensor 2. pcm: 12 v, 5 v, 60 Ω.";
    expect(verifyTokenPreservation(english, ok).ok).toBe(true);
  });
});

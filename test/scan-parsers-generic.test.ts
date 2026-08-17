import { describe, expect, it } from "vitest";
import { txtParser } from "@/lib/scan-diagnostics/parsers/txt-parser";
import { csvParser } from "@/lib/scan-diagnostics/parsers/csv-parser";
import { jsonParser } from "@/lib/scan-diagnostics/parsers/json-parser";
import { runExtraction, selectParser } from "@/lib/scan-diagnostics/parsers/registry";

describe("txtParser", () => {
  it("extracts VIN and DTC codes from a synthetic generic scan-tool export", async () => {
    const buffer = Buffer.from(
      [
        "Generic OBD-II Scan Report",
        "VIN: 1FTFW1ET1EFA00001",
        "Mileage: 62000",
        "",
        "DTC P0171 - System Too Lean (Bank 1)",
        "DTC P0300 - Random/Multiple Cylinder Misfire Detected",
      ].join("\n"),
    );

    const result = await txtParser.parse(buffer);
    expect(result.vin).toBe("1FTFW1ET1EFA00001");
    expect(result.odometerMiles).toBe(62000);
    expect(result.dtcCodes.map((c) => c.code)).toEqual(["P0171", "P0300"]);
  });

  // Regression for a real production case: a multi-column scan-tool table
  // flattened to plain text can leave unrelated digits on the same line as
  // the "Mileage:" label — extractOdometer used to strip every non-digit
  // character from the whole rest of the line and concatenate whatever
  // digits remained, producing an implausible multi-million-mile reading
  // that then failed ExtractionReviewInputSchema's max(1_000_000) with no
  // indication of which field was the problem.
  it("does not bleed trailing same-line digits into the extracted mileage", async () => {
    const buffer = Buffer.from(
      ["VIN: SALWA2VF7EA501249", "Mileage: 104248  Page 78 of 2", "DTC B100D-67 - Column Lock Authorization"].join(
        "\n",
      ),
    );
    const result = await txtParser.parse(buffer);
    expect(result.odometerMiles).toBe(104248);
  });

  it("drops an odometer reading that exceeds the plausible sanity ceiling rather than passing it through", async () => {
    const buffer = Buffer.from(["Mileage: 10424878", "DTC P0300 - Random Misfire"].join("\n"));
    const result = await txtParser.parse(buffer);
    expect(result.odometerMiles).toBeUndefined();
  });
});

describe("csvParser", () => {
  it("extracts codes from a header-based CSV export", async () => {
    const csv = ["Module,Code,Status,Description", "ECM,P0300,Current,Random Misfire Detected", "ABS,C0561,History,Steering Angle Sensor"].join("\n");
    const result = await csvParser.parse(Buffer.from(csv));
    expect(result.dtcCodes).toHaveLength(2);
    expect(result.dtcCodes[0]).toMatchObject({ module: "ECM", code: "P0300", status: "Current" });
  });

  it("falls back to a raw-text scan when there's no recognizable header", async () => {
    const result = await csvParser.parse(Buffer.from("P0300 found on line one\n"));
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("jsonParser", () => {
  it("extracts vehicle info and DTCs from a nested JSON export", async () => {
    const json = JSON.stringify({
      vehicle: { vin: "1FTFW1ET1EFA00001", make: "Ford", model: "F-150", year: 2019 },
      dtcs: [
        { module: "PCM", code: "p0420", status: "stored", description: "Catalyst Efficiency Below Threshold" },
      ],
    });
    const result = await jsonParser.parse(Buffer.from(json));
    expect(result.vin).toBe("1FTFW1ET1EFA00001");
    expect(result.make).toBe("Ford");
    expect(result.modelYear).toBe(2019);
    expect(result.dtcCodes).toEqual([
      { code: "P0420", module: "PCM", status: "stored", descriptionRaw: "Catalyst Efficiency Below Threshold" },
    ]);
  });

  it("falls back to raw-text scan on malformed JSON", async () => {
    const result = await jsonParser.parse(Buffer.from("{not valid json"));
    expect(result.warnings.some((w) => /could not be parsed/i.test(w))).toBe(true);
  });
});

describe("registry", () => {
  it("selects the matching parser for each declared format", () => {
    expect(selectParser(Buffer.from("hi"), "txt", "a.txt")?.id).toBe("generic-txt");
    expect(selectParser(Buffer.from("a,b"), "csv", "a.csv")?.id).toBe("generic-csv");
    expect(selectParser(Buffer.from("{}"), "json", "a.json")?.id).toBe("generic-json");
  });

  it("falls back to a raw-text scan for an unrecognized format", async () => {
    const result = await runExtraction(Buffer.from("P0300 somewhere in here"), "unknown", "a.bin");
    expect(result.parserId).toBe("generic-fallback");
    expect(result.report.dtcCodes[0]?.code).toBe("P0300");
  });
});

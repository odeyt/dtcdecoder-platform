import { describe, expect, it } from "vitest";
import { PARSERS, runExtraction, selectParser } from "@/lib/scan-diagnostics/parsers/registry";

describe("PARSERS registry", () => {
  it("registers exactly one parser per supported format", () => {
    const ids = PARSERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const formats = PARSERS.flatMap((p) => p.supportedFormats);
    expect(new Set(formats)).toEqual(new Set(["txt", "csv", "json", "xml", "html", "pdf"]));
  });

  it("selects the correct parser for every declared format", () => {
    expect(selectParser(Buffer.from("x"), "txt", "a.txt")?.id).toBe("generic-txt");
    expect(selectParser(Buffer.from("x"), "csv", "a.csv")?.id).toBe("generic-csv");
    expect(selectParser(Buffer.from("x"), "json", "a.json")?.id).toBe("generic-json");
    expect(selectParser(Buffer.from("x"), "xml", "a.xml")?.id).toBe("generic-xml");
    expect(selectParser(Buffer.from("x"), "html", "a.html")?.id).toBe("generic-html");
    expect(selectParser(Buffer.from("%PDF-"), "pdf", "a.pdf")?.id).toBe("generic-pdf");
  });
});

describe("runExtraction fallback behavior", () => {
  it("never throws and always returns a report, even for an unknown format", async () => {
    const result = await runExtraction(Buffer.from("random bytes with P0300 in them"), "unknown", "a.bin");
    expect(result.parserId).toBe("generic-fallback");
    expect(result.report.dtcCodes.map((c) => c.code)).toContain("P0300");
  });
});

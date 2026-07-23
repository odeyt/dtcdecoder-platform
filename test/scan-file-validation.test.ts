import { describe, expect, it } from "vitest";
import { validateScanFile } from "@/lib/scan-diagnostics/file-validation";

describe("validateScanFile", () => {
  it("accepts a valid PDF by signature", () => {
    const buffer = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("fake pdf body")]);
    const result = validateScanFile(buffer, "report.pdf", "application/pdf");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("pdf");
  });

  it("accepts a valid JSON export", () => {
    const buffer = Buffer.from(JSON.stringify({ vin: "1FTFW1ET1EFA00001", dtcs: [] }));
    const result = validateScanFile(buffer, "scan.json", "application/json");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("json");
  });

  it("accepts a plain-text scan export", () => {
    const buffer = Buffer.from("VIN: 1FTFW1ET1EFA00001\nDTC: P0300 - Random Misfire Detected\n");
    const result = validateScanFile(buffer, "scan.txt", "text/plain");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("txt");
  });

  it("rejects a text file renamed to .pdf (signature mismatch)", () => {
    const buffer = Buffer.from("this is not actually a pdf");
    const result = validateScanFile(buffer, "fake.pdf", "application/pdf");
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the size limit", () => {
    const oversized = Buffer.alloc(20 * 1024 * 1024, 0x41); // 20MB, default max is 15MB
    const result = validateScanFile(oversized, "big.txt", "text/plain");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/exceeds/i);
  });

  it("rejects an empty file", () => {
    const result = validateScanFile(Buffer.alloc(0), "empty.txt", "text/plain");
    expect(result.ok).toBe(false);
  });

  it("rejects a zip file disguised as .xml", () => {
    const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const result = validateScanFile(zipMagic, "scan.xml", "application/xml");
    expect(result.ok).toBe(false);
  });

  it("rejects an executable extension outright", () => {
    const buffer = Buffer.from("MZ fake exe header");
    const result = validateScanFile(buffer, "report.exe", "application/octet-stream");
    expect(result.ok).toBe(false);
  });

  it("rejects an unsupported extension", () => {
    const buffer = Buffer.from("some data");
    const result = validateScanFile(buffer, "report.docx", "application/octet-stream");
    expect(result.ok).toBe(false);
  });
});

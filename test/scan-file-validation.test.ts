import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { validateScanFile } from "@/lib/scan-diagnostics/file-validation";
import en from "../messages/en.json";

const T: Record<string, string> = en.apiErrors;

describe("validateScanFile", () => {
  it("accepts a valid PDF by signature", async () => {
    const buffer = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("fake pdf body")]);
    const result = await validateScanFile(buffer, "report.pdf", "application/pdf", T);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("pdf");
  });

  it("accepts a valid JSON export", async () => {
    const buffer = Buffer.from(JSON.stringify({ vin: "1FTFW1ET1EFA00001", dtcs: [] }));
    const result = await validateScanFile(buffer, "scan.json", "application/json", T);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("json");
  });

  it("accepts a plain-text scan export", async () => {
    const buffer = Buffer.from("VIN: 1FTFW1ET1EFA00001\nDTC: P0300 - Random Misfire Detected\n");
    const result = await validateScanFile(buffer, "scan.txt", "text/plain", T);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("txt");
  });

  it("rejects a text file renamed to .pdf (signature mismatch)", async () => {
    const buffer = Buffer.from("this is not actually a pdf");
    const result = await validateScanFile(buffer, "fake.pdf", "application/pdf", T);
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the size limit", async () => {
    const oversized = Buffer.alloc(20 * 1024 * 1024, 0x41); // 20MB, default max is 15MB
    const result = await validateScanFile(oversized, "big.txt", "text/plain", T);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/exceeds/i);
  });

  it("rejects an empty file", async () => {
    const result = await validateScanFile(Buffer.alloc(0), "empty.txt", "text/plain", T);
    expect(result.ok).toBe(false);
  });

  it("rejects a zip file disguised as .xml", async () => {
    const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const result = await validateScanFile(zipMagic, "scan.xml", "application/xml", T);
    expect(result.ok).toBe(false);
  });

  it("rejects an executable extension outright", async () => {
    const buffer = Buffer.from("MZ fake exe header");
    const result = await validateScanFile(buffer, "report.exe", "application/octet-stream", T);
    expect(result.ok).toBe(false);
  });

  it("rejects an unsupported extension", async () => {
    const buffer = Buffer.from("some data");
    const result = await validateScanFile(buffer, "report.docx", "application/octet-stream", T);
    expect(result.ok).toBe(false);
  });
});

describe("validateScanFile — image formats", () => {
  it("accepts a valid JPEG photo", async () => {
    const buffer = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const result = await validateScanFile(buffer, "photo.jpg", "image/jpeg", T);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("jpg");
  });

  it("accepts a valid PNG screenshot", async () => {
    const buffer = await sharp({
      create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const result = await validateScanFile(buffer, "screenshot.png", "image/png", T);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("png");
  });

  it("accepts a valid WebP photo", async () => {
    const buffer = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 50, g: 50, b: 50 } },
    })
      .webp()
      .toBuffer();
    const result = await validateScanFile(buffer, "photo.webp", "image/webp", T);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("webp");
  });

  it("accepts a valid GIF export", async () => {
    const buffer = await sharp({
      create: { width: 150, height: 150, channels: 3, background: { r: 90, g: 90, b: 90 } },
    })
      .gif()
      .toBuffer();
    const result = await validateScanFile(buffer, "photo.gif", "image/gif", T);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("gif");
  });

  it("accepts a HEIC file by its ftyp brand, without attempting to decode it", async () => {
    // A real ISOBMFF ftyp box with a HEIC major brand — sniffSignature reads
    // this without ever needing to decode the image (sharp can't; see
    // file-validation.ts's comment on why heic/heif skip the decode check).
    const buffer = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]), // box size
      Buffer.from("ftyp", "latin1"),
      Buffer.from("heic", "latin1"), // major brand
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // minor version
      Buffer.from("mif1heic", "latin1"), // compatible brands
    ]);
    const result = await validateScanFile(buffer, "photo.heic", "image/heic", T);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formatHint).toBe("heic");
  });

  it("does not misidentify an AVIF file (same container, different codec) as HEIC", async () => {
    const buffer = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftyp", "latin1"),
      Buffer.from("avif", "latin1"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("mif1avif", "latin1"),
    ]);
    const result = await validateScanFile(buffer, "photo.heic", "image/heic", T);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-image file renamed to a photo extension", async () => {
    const buffer = Buffer.from("this is plain text, not a jpeg");
    const result = await validateScanFile(buffer, "fake.jpg", "image/jpeg", T);
    expect(result.ok).toBe(false);
  });

  it("rejects an image whose pixel dimensions exceed the configured maximum", async () => {
    vi.stubEnv("SCAN_IMAGE_MAX_PIXEL_DIMENSION", "50");
    try {
      const buffer = await sharp({
        create: { width: 200, height: 200, channels: 3, background: { r: 1, g: 1, b: 1 } },
      })
        .jpeg()
        .toBuffer();
      const result = await validateScanFile(buffer, "huge.jpg", "image/jpeg", T);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/resolution/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("applies the image size limit (distinct from the document size limit) to photo uploads", async () => {
    vi.stubEnv("SCAN_IMAGE_MAX_SIZE_BYTES", "100");
    try {
      const buffer = await sharp({
        create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 100, b: 50 } },
      })
        .jpeg()
        .toBuffer();
      expect(buffer.length).toBeGreaterThan(100);
      const result = await validateScanFile(buffer, "big-photo.jpg", "image/jpeg", T);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/exceeds/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

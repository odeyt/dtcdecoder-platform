import { describe, expect, it } from "vitest";
import { pdfParser } from "@/lib/scan-diagnostics/parsers/pdf-parser";

// Minimal hand-built single-page PDFs (no real customer data) — one with a
// real Helvetica text-showing operator ("P0300 Random Misfire Detected"),
// one with only a vector-drawn rectangle and no text objects at all, to
// exercise the image-only-PDF detection threshold.
const WITH_TEXT_PDF_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA0MDAgMjAwXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA2MCA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDEwIDEwMCBUZCAoUDAzMDAgUmFuZG9tIE1pc2ZpcmUgRGV0ZWN0ZWQpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzUxIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDQ4CiUlRU9G";

const WITHOUT_TEXT_PDF_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSAvUmVzb3VyY2VzIDw8ID4+IC9Db250ZW50cyA0IDAgUiA+PgplbmRvYmoKNCAwIG9iago8PCAvTGVuZ3RoIDI3ID4+CnN0cmVhbQoxIDAgMCBSRyAxMCAxMCAxMDAgMTAwIHJlIFMKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMTkgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA1IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgoyOTYKJSVFT0Y=";

describe("pdfParser", () => {
  it("extracts text and DTC codes from a text-based PDF", async () => {
    const buffer = Buffer.from(WITH_TEXT_PDF_B64, "base64");
    const result = await pdfParser.parse(buffer);
    expect(result.imageOnlyPdf).toBe(false);
    expect(result.dtcCodes.map((c) => c.code)).toContain("P0300");
  });

  it("detects an image-only PDF (no extractable text) and warns instead of fabricating data", async () => {
    const buffer = Buffer.from(WITHOUT_TEXT_PDF_B64, "base64");
    const result = await pdfParser.parse(buffer);
    expect(result.imageOnlyPdf).toBe(true);
    expect(result.dtcCodes).toEqual([]);
    expect(result.warnings.some((w) => /scanned images/i.test(w))).toBe(true);
  });
});

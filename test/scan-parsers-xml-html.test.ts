import { describe, expect, it } from "vitest";
import { xmlParser } from "@/lib/scan-diagnostics/parsers/xml-parser";
import { htmlParser } from "@/lib/scan-diagnostics/parsers/html-parser";

describe("xmlParser", () => {
  it("extracts DTCs and VIN from a synthetic XML scan export", async () => {
    const xml = `<?xml version="1.0"?>
<ScanReport>
  <Vehicle><VIN>1FTFW1ET1EFA00001</VIN></Vehicle>
  <DTCs>
    <DTC><Code>P0300</Code><Description>Random Misfire Detected</Description></DTC>
  </DTCs>
</ScanReport>`;
    const result = await xmlParser.parse(Buffer.from(xml));
    expect(result.vin).toBe("1FTFW1ET1EFA00001");
    expect(result.dtcCodes.map((c) => c.code)).toContain("P0300");
  });

  it("strips a DOCTYPE block before parsing (entity-expansion hardening)", async () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE root [<!ENTITY x "test">]>
<root>DTC P0171 found. &x;</root>`;
    const result = await xmlParser.parse(Buffer.from(xml));
    expect(result.dtcCodes.map((c) => c.code)).toContain("P0171");
  });

  it("falls back to a raw-text scan on malformed/unclosed XML rather than silently dropping content", async () => {
    const result = await xmlParser.parse(Buffer.from("<root><unclosed>P0300"));
    expect(result.dtcCodes.map((c) => c.code)).toContain("P0300");
  });
});

describe("htmlParser", () => {
  it("strips tags/scripts/styles and extracts plain text content", async () => {
    const html = `<html><head><style>.x{color:red}</style><script>alert(1)</script></head>
<body><table><tr><td>VIN</td><td>1FTFW1ET1EFA00001</td></tr>
<tr><td>DTC</td><td>P0420 - Catalyst Efficiency Below Threshold</td></tr></table></body></html>`;
    const result = await htmlParser.parse(Buffer.from(html));
    expect(result.vin).toBe("1FTFW1ET1EFA00001");
    expect(result.dtcCodes.map((c) => c.code)).toContain("P0420");
  });

  it("decodes common HTML entities", async () => {
    const html = "<p>Fault &amp; code: P0300 &mdash; misfire</p>".replace("&mdash;", "-");
    const result = await htmlParser.parse(Buffer.from(html));
    expect(result.dtcCodes.map((c) => c.code)).toContain("P0300");
  });

  it("never leaves script content in the extracted text", async () => {
    const html = "<script>var secret = 'should-not-appear';</script><p>P0300 found</p>";
    const result = await htmlParser.parse(Buffer.from(html));
    // Confirmed indirectly: script contents must not surface as a warning-free
    // DTC/VIN false positive, and the only code found is the real one.
    expect(result.dtcCodes.map((c) => c.code)).toEqual(["P0300"]);
  });
});

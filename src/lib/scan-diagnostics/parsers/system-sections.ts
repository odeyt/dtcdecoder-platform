// Detects per-system/module sections in a multi-system scan report (e.g.
// LAUNCH X431-style "1.8T Engine System" headings each followed by a
// "DTC (N)" declared count, plus a trailing "The following systems are OK"
// list) and tags every extracted DTC with the system it was found under.
// See docs/FULL_SCAN_DATA_LOSS_AUDIT.md finding #10/#11 — none of this
// existed before; a flat DTC list had no way to represent "system X
// declared 14 DTCs, we extracted 3" or "system Y was reported OK".
import type { ParsedDtcCode, ParsedSystemSection } from "@/lib/scan-diagnostics/parsers/types";
import { extractDtcCodesFromText } from "@/lib/scan-diagnostics/parsers/dtc-extraction";

const DTC_COUNT_LINE = /^DTC\s*\(\s*(\d+)\s*\)\s*$/i;
const SYSTEMS_OK_HEADER = /^the following systems? (?:is|are) ok\s*:?\s*$/i;
const NUMBERED_ITEM = /^\d+\.\s*(.+?)\s*$/;
const SECTION_STOP_PATTERN = /^(disclaimer|diagnostic confidence)\b/i;

export interface SystemSectionResult {
  systems: ParsedSystemSection[];
  dtcCodes: ParsedDtcCode[];
}

// `pageNumber` is set on every DTC found (PDF callers pass the 1-based page
// index they're currently processing); omit it for single-blob formats
// (txt/csv/json/html/xml) where a page number has no meaning.
export function extractSystemSections(text: string, pageNumber?: number): SystemSectionResult {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim());
  const systems: ParsedSystemSection[] = [];
  const systemByName = new Map<string, ParsedSystemSection>();

  let inOkList = false;

  // Pass 1: a line immediately preceding a "DTC (N)" declaration (skipping
  // blank lines) is that section's heading. A "systems are OK" header
  // switches into a numbered-list-of-names mode instead.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const countMatch = line.match(DTC_COUNT_LINE);
    if (countMatch) {
      let j = i - 1;
      while (j >= 0 && !lines[j]) j--;
      const heading = j >= 0 ? lines[j] : null;
      if (heading && !DTC_COUNT_LINE.test(heading) && !systemByName.has(heading)) {
        const section: ParsedSystemSection = {
          systemName: heading,
          status: "faulted",
          dtcCountReported: Number(countMatch[1]),
          dtcCountExtracted: 0,
        };
        systems.push(section);
        systemByName.set(heading, section);
      }
      inOkList = false;
      continue;
    }

    if (SYSTEMS_OK_HEADER.test(line)) {
      inOkList = true;
      continue;
    }

    if (inOkList) {
      if (SECTION_STOP_PATTERN.test(line)) {
        inOkList = false;
        continue;
      }
      const item = line.match(NUMBERED_ITEM);
      if (item) {
        const name = item[1].trim();
        if (name && !systemByName.has(name)) {
          const section: ParsedSystemSection = {
            systemName: name,
            status: "ok",
            dtcCountReported: 0,
            dtcCountExtracted: 0,
          };
          systems.push(section);
          systemByName.set(name, section);
        }
      }
    }
  }

  // Pass 2: walk again tracking which "faulted" system heading we're
  // currently under, tagging each DTC found on the way and incrementing
  // that system's extracted count — the number this app itself found,
  // compared against dtcCountReported (the source's own declared count)
  // for extraction-completeness validation.
  const headingNames = new Set(systems.filter((s) => s.status === "faulted").map((s) => s.systemName));
  const dtcCodes: ParsedDtcCode[] = [];
  let currentSystemName: string | null = null;

  for (const line of lines) {
    if (!line) continue;
    if (headingNames.has(line)) {
      currentSystemName = line;
      continue;
    }
    if (DTC_COUNT_LINE.test(line) || SYSTEMS_OK_HEADER.test(line)) {
      if (SYSTEMS_OK_HEADER.test(line)) currentSystemName = null;
      continue;
    }

    const lineDtcs = extractDtcCodesFromText(line);
    if (lineDtcs.length > 0) {
      const section = currentSystemName ? systemByName.get(currentSystemName) : undefined;
      for (const dtc of lineDtcs) {
        if (currentSystemName) dtc.systemName = currentSystemName;
        if (pageNumber !== undefined) dtc.sourcePage = pageNumber;
        if (section) section.dtcCountExtracted += 1;
      }
      dtcCodes.push(...lineDtcs);
    }
  }

  return { systems, dtcCodes };
}

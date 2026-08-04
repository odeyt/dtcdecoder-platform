-- Photo/screenshot upload support for scan-report analysis (Android/iPhone
-- camera photos, in addition to the existing PDF/TXT/CSV/JSON/XML/HTML
-- export formats). See src/lib/scan-diagnostics/ai/vision-extraction.ts —
-- extraction for these formats goes through Claude's vision API instead of
-- a text parser, but persists into these same existing tables so the
-- downstream diagnostic pipeline (analyze.ts, ScanReportView, etc.) is
-- completely unaware of the difference.

-- scan_case_files.detected_format's check constraint is a strict superset
-- of the previous list, so this can never fail on existing rows.
alter table scan_case_files drop constraint if exists scan_case_files_detected_format_check;
alter table scan_case_files add constraint scan_case_files_detected_format_check
  check (detected_format is null or detected_format in (
    'pdf', 'txt', 'csv', 'json', 'xml', 'html',
    'jpg', 'png', 'webp', 'gif', 'heic', 'heif',
    'unknown'
  ));

-- Preserves selection/capture order across multiple photos uploaded to the
-- same case (VIN plate photo, then a DTC screen, then a second module's
-- screen, ...) — null for every pre-existing single-file upload.
alter table scan_case_files add column if not exists upload_order integer;

-- One entry per source photo for a photo-upload extraction (see
-- ExtractedEvidence in src/lib/types.ts) — empty for every text-format
-- extraction, never null (matches every other array column on this table).
alter table scan_extractions add column if not exists image_evidence jsonb not null default '[]';

-- Which photo (0-based index into the case's ordered photo set) a specific
-- DTC was read from — null for every non-photo extraction, the same
-- pattern as the existing source_page (PDF-only) column.
alter table scan_dtc_records add column if not exists source_image_index integer;

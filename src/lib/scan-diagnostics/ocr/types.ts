// Documented, UNIMPLEMENTED extension point. No image-only-PDF OCR support
// exists in this feature yet (see pdf-parser.ts's imageOnlyPdf detection
// and warning) — this interface exists so a future OCR provider can be
// plugged in without reshaping the parser pipeline, not as a promise that
// one is coming. Do not wire a fake/no-op implementation of this; the
// absence of a registered provider IS the current, correct behavior.
export interface OcrProvider {
  readonly id: string;
  extractText(buffer: Buffer): Promise<string>;
}

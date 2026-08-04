"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SUPPORTED_DOCUMENT_FORMATS = "PDF, TXT, CSV, JSON, XML, HTML";
const SUPPORTED_PHOTO_FORMATS = "JPG, PNG, WEBP, GIF, HEIC/HEIF";
const MAX_SIZE_MB = 15;
const MAX_IMAGE_COUNT = 10;
const ACCEPT_ATTR = ".pdf,.txt,.csv,.json,.xml,.html,.htm,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif";

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const HEIC_EXT_RE = /\.(heic|heif)$/i;

function isImageFile(f: File): boolean {
  return IMAGE_EXT_RE.test(f.name);
}

function isHeicFile(f: File): boolean {
  return HEIC_EXT_RE.test(f.name);
}

// English-only for this initial release — see docs/SCAN_REPORT_ANALYSIS.md
// ("Known limitations") for why this page doesn't go through next-intl yet.
export function ScanCaseUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<"document" | "photos">("document");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [complaint, setComplaint] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [mileage, setMileage] = useState("");
  const [recentRepairs, setRecentRepairs] = useState("");
  const [batteryCondition, setBatteryCondition] = useState("");
  const [technicianNotes, setTechnicianNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  const photoPreviews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => {
    return () => {
      photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoPreviews]);

  function pickFiles(incoming: File[]) {
    setError(null);
    if (incoming.length === 0) return;

    const images = incoming.filter(isImageFile);
    const nonImages = incoming.filter((f) => !isImageFile(f));

    if (images.length > 0 && nonImages.length > 0) {
      setError("Photos and scan report files can't be combined in one upload — please choose one or the other.");
      return;
    }

    if (nonImages.length > 0) {
      if (nonImages.length > 1) {
        setError("Please choose a single scan report file, or upload multiple photos instead.");
        return;
      }
      setMode("document");
      setPhotos([]);
      setDocumentFile(nonImages[0]);
      return;
    }

    setMode("photos");
    setDocumentFile(null);
    setPhotos((prev) => {
      const combined = [...prev, ...images];
      if (combined.length > MAX_IMAGE_COUNT) {
        setError(`You can upload up to ${MAX_IMAGE_COUNT} photos per case.`);
        return prev;
      }
      return combined;
    });
  }

  function removePhoto(index: number) {
    setError(null);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function movePhoto(index: number, direction: -1 | 1) {
    setPhotos((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function uploadOneFile(caseId: string, file: File): Promise<{ ok: boolean; error?: string }> {
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await fetch(`/api/scan-diagnostics/cases/${caseId}/upload`, {
      method: "POST",
      body: formData,
    });
    const uploadData = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      return { ok: false, error: uploadData.error ?? "Upload failed. Please try again." };
    }
    return { ok: true };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "document" && !documentFile) {
      setError("Please choose a scan report file to upload.");
      return;
    }
    if (mode === "photos" && photos.length === 0) {
      setError("Please choose at least one photo to upload.");
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const caseRes = await fetch("/api/scan-diagnostics/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaint: complaint || undefined,
          symptoms: symptoms
            ? symptoms.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
          mileage: mileage ? Number(mileage) : undefined,
          recentRepairs: recentRepairs || undefined,
          batteryCondition: batteryCondition || undefined,
          technicianNotes: technicianNotes || undefined,
        }),
      });
      const caseData = await caseRes.json().catch(() => ({}));
      if (!caseRes.ok) {
        setError(caseData.error ?? "Could not create the case. Please try again.");
        setStatus("idle");
        return;
      }

      const caseId = caseData.case.id as string;

      if (mode === "document") {
        const result = await uploadOneFile(caseId, documentFile as File);
        if (!result.ok) {
          setError(result.error ?? "Upload failed. Please try again.");
          setStatus("idle");
          return;
        }
      } else {
        // Uploaded one at a time, awaited in order — the server derives each
        // photo's position from how many rows already exist for the case at
        // insert time, so parallel uploads would race and scramble order.
        for (let i = 0; i < photos.length; i++) {
          const result = await uploadOneFile(caseId, photos[i]);
          if (!result.ok) {
            setError(result.error ?? `Upload failed on photo ${i + 1} of ${photos.length}. Please try again.`);
            setStatus("idle");
            return;
          }
        }
      }

      router.push(`/diagnostics/${caseId}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFiles(Array.from(e.dataTransfer.files));
        }}
        className="glass-panel flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-xl)] border-2 border-dashed p-10 text-center transition-colors"
        style={{ borderColor: dragOver ? "var(--accent-red)" : "var(--border-subtle)" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={(e) => {
            pickFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        {mode === "document" && documentFile ? (
          <p className="text-[var(--text-primary)]">{documentFile.name}</p>
        ) : mode === "photos" && photos.length > 0 ? (
          <p className="text-[var(--text-primary)]">
            {photos.length} photo{photos.length > 1 ? "s" : ""} selected — click or drop to add more
          </p>
        ) : (
          <>
            <p className="text-[var(--text-primary)]">
              Drag and drop your scan report or phone photos here, or click to choose files
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Documents: {SUPPORTED_DOCUMENT_FORMATS} (max {MAX_SIZE_MB} MB)
              <br />
              Or photos/screenshots: {SUPPORTED_PHOTO_FORMATS} (up to {MAX_IMAGE_COUNT} per case)
            </p>
          </>
        )}
      </div>

      {mode === "photos" && photos.length > 0 && (
        <div className="glass-panel rounded-[var(--radius-lg)] p-4">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            {photos.length} photo{photos.length > 1 ? "s" : ""} — will be analyzed in this order
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="relative flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
              >
                <span className="absolute left-1 top-1 z-10 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                  {i + 1}
                </span>
                {isHeicFile(f) ? (
                  <div className="flex h-24 w-full items-center justify-center rounded bg-[var(--surface-2)] text-xs font-medium text-[var(--text-muted)]">
                    HEIC
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreviews[i]}
                    alt={`Photo ${i + 1}: ${f.name}`}
                    className="h-24 w-full rounded object-cover"
                  />
                )}
                <span className="truncate text-xs text-[var(--text-muted)]">{f.name}</span>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => movePhoto(i, -1)}
                    disabled={i === 0}
                    className="text-xs text-[var(--text-muted)] disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => movePhoto(i, 1)}
                    disabled={i === photos.length - 1}
                    className="text-xs text-[var(--text-muted)] disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="text-xs text-[var(--accent-red)]"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-xs text-[var(--text-muted)]">
        Your files are stored privately and used only to generate your diagnostic analysis. They are never shared or
        made public.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          Customer complaint
          <textarea
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            rows={3}
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            placeholder="e.g. Check engine light on, rough idle at stoplights"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          Observed symptoms (comma-separated)
          <input
            type="text"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            placeholder="rough idle, hesitation on acceleration"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
          Mileage
          <input
            type="number"
            min={0}
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
          Battery condition
          <input
            type="text"
            value={batteryCondition}
            onChange={(e) => setBatteryCondition(e.target.value)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
            placeholder="e.g. tested, 12.6V resting"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          Recent repairs
          <textarea
            value={recentRepairs}
            onChange={(e) => setRecentRepairs(e.target.value)}
            rows={2}
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          Technician notes
          <textarea
            value={technicianNotes}
            onChange={(e) => setTechnicianNotes(e.target.value)}
            rows={2}
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)]"
          />
        </label>
      </div>

      {error && <p className="text-sm text-[var(--accent-red)]">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "submitting" ? "Uploading…" : "Upload and continue"}
      </button>
    </form>
  );
}

"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { postProcessAnimalOutput } from "@/lib/animalPostProcess";
import { resolveBeaverApiBase } from "@/lib/beaverApiBase";
import { AuthModal } from "@/components/auth/AuthModal";
import { useAuth } from "@/components/auth/AuthProvider";

function IconUpload(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    </svg>
  );
}

function IconFolder(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function IconUser(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function IconBot(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M12 4V2" />
      <path d="M8 3h8" />
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M9 12h.01" />
      <path d="M15 12h.01" />
      <path d="M10 16h4" />
    </svg>
  );
}

type DetectionResult = {
  id: string;
  image_path: string;
  filename: string;
  predicted_label: string;
  beaver_agent_label: string;
  animal_agent_label: string;
  agent_conflict: boolean;
  review_label: string;
  was_corrected: boolean;
  confidence: number;
  reason: string;
  notes: string;
  model_id: string;
  has_beaver: boolean;
  has_animal: boolean;
  Common_Name: string;
  manual_review: boolean;
  animal_type: string;
  animal_group: string;
  animal_confidence: number | string;
  animal_reason: string;
  bbox: string;
  overlay_location: string;
  overlay_confidence: number | string;
  overlay_reason: string;
  overlay_temperature: string;
  exif_timestamp: string;
  exif_location: string;
  s3_key?: string;
  s3_bucket?: string;
  error: string;
};

type SequenceSummary = {
  id: string;
  groupKey: string;
  startTs: string;
  size: number;
  presence: "present" | "possible" | "absent" | "unknown";
  species: string;
  speciesScore: number;
  disagreement: boolean;
  flagManualReview: boolean;
  reason: string;
};

type JobHistoryItem = {
  job_id: string;
  status: string;
  source: string;
  total_images: number;
  completed_images: number;
  error: string;
  csv_s3_key: string;
  created_at: string;
  updated_at: string;
};

const REVIEW_LABELS = [
  { value: "beaver", label: "Beaver" },
  { value: "other_animal", label: "Other animal" },
  { value: "no_animal", label: "No animal" },
];
const ANIMAL_AGENT_OPTIONS = ["animal", "no_animal"];

const ANIMAL_SPECIES_OPTIONS = [
  "Beaver",
  "Nutria",
  "Raccoon",
  "Black bear",
  "Long-tailed weasel",
  "Mink",
  "River otter",
  "Striped skunk",
  "Bobcat",
  "Mountain lion (Cougar)",
  "Coyote",
  "Elk",
  "Mule and black-tailed deer",
  "human",
  "Band-tailed pigeon",
  "Barred owl",
  "Western screech-owl",
  "Great blue heron",
  "other mammal",
  "other bird",
  "unknown",
  "No animal",
];

function parseExifTimestampToMs(value: string) {
  const text = (value || "").trim();
  if (!text) return null;
  const m = text.match(
    /^(\d{4})[:\/-](\d{2})[:\/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!m) {
    // Backend returns ISO timestamps (e.g. 2024-09-10T00:03:56.000Z).
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6]);
  if (![y, mo, d, hh, mm, ss].every(Number.isFinite)) return null;
  return Date.UTC(y, mo - 1, d, hh, mm, ss);
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function slug(value: string, maxLen: number = 48) {
  const cleaned = (value || "unknown")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (cleaned || "unknown").slice(0, maxLen);
}

function imageNameFromPath(path: string) {
  const raw = (path || "").trim();
  if (!raw) return "";
  const noQuery = raw.split("?")[0] || raw;
  const parts = noQuery.split(/[/\\\\]/);
  const base = parts[parts.length - 1] || noQuery;
  // Many uploads are stored as `uuid_originalname.ext`; strip the UUID prefix for display.
  return base.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
    "",
  );
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function buildCsv(rows: DetectionResult[]) {
  if (rows.length === 0) return "";
  const headers = [
    "image_path",
    "filename",
    "predicted_label",
    "beaver_agent_label",
    "animal_agent_label",
    "agent_conflict",
    "review_label",
    "was_corrected",
    "confidence",
    "reason",
    "notes",
    "has_beaver",
    "has_animal",
    "Common_Name",
    "manual_review",
    "animal_group",
    "animal_confidence",
    "animal_reason",
    "bbox",
    "overlay_location",
    "overlay_confidence",
    "overlay_reason",
    "exif_timestamp",
    "exif_location",
    "error",
    "model_id",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((key) => escapeCsv((row as Record<string, unknown>)[key])).join(","),
    ),
  ];
  return lines.join("\n");
}

async function readErrorFromResponse(response: Response) {
  const statusLine = `HTTP ${response.status} ${response.statusText || ""}`.trim();
  const contentType = response.headers.get("content-type") || "";
  const upstreamErrorType =
    response.headers.get("x-amzn-errortype") ||
    response.headers.get("x-amz-errortype") ||
    "";

  const text = await response.text().catch(() => "");
  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      const message =
        (typeof payload.error === "string" && payload.error) ||
        (typeof payload.message === "string" && payload.message) ||
        (typeof payload.Message === "string" && payload.Message) ||
        "";
      if (message) {
        return upstreamErrorType
          ? `${statusLine} (${upstreamErrorType}): ${message}`
          : `${statusLine}: ${message}`;
      }
      if (text.trim()) {
        return upstreamErrorType
          ? `${statusLine} (${upstreamErrorType}): ${text}`
          : `${statusLine}: ${text}`;
      }
    } catch {
      // Fall back to raw text below.
    }
  }

  if (text.trim()) {
    return upstreamErrorType
      ? `${statusLine} (${upstreamErrorType}): ${text}`
      : `${statusLine}: ${text}`;
  }
  return upstreamErrorType ? `${statusLine} (${upstreamErrorType})` : statusLine;
}

export default function Home() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<"home" | "dashboard" | "history" | "chat">("home");
  const [showAuth, setShowAuth] = useState(false);
  const [s3Path, setS3Path] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [jobCsvKey, setJobCsvKey] = useState<string>("");
  const [jobProgress, setJobProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });

  const [csvPath, setCsvPath] = useState("");
  const [modelId, setModelId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [csvName, setCsvName] = useState("");
  const [input, setInput] = useState("");
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [rowImageUrls, setRowImageUrls] = useState<Record<string, string>>({});
  const [rowImageLoading, setRowImageLoading] = useState<Record<string, boolean>>({});
  const [rowImageErrors, setRowImageErrors] = useState<Record<string, string>>({});
  const [sequenceFilterId, setSequenceFilterId] = useState<string>("");
  const [resultSort, setResultSort] = useState<string>("default");
  const [chatMessages, setChatMessages] = useState<
    Array<{ id: string; role: "user" | "assistant"; text: string }>
  >([]);
  const [chatStatus, setChatStatus] = useState<"idle" | "loading">("idle");
  const [chatError, setChatError] = useState("");
  const [historyJobs, setHistoryJobs] = useState<JobHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState<"newest" | "oldest">("newest");
  const [historyStatus, setHistoryStatus] = useState<string>("all");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const inputEl = folderInputRef.current;
    if (inputEl) {
      inputEl.setAttribute("webkitdirectory", "");
      inputEl.setAttribute("directory", "");
    }
  }, []);

  const getFilesFromDrop = async (dt: DataTransfer) => {
    const items = Array.from(dt.items || []);
    const hasEntries = items.some((it) => typeof (it as any).webkitGetAsEntry === "function");
    if (!hasEntries) {
      return Array.from(dt.files || []);
    }

    const readAllEntries = async (entry: any): Promise<File[]> => {
      if (!entry) return [];
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          entry.file(resolve, reject);
        });
        return [file];
      }
      if (entry.isDirectory) {
        const reader = entry.createReader();
        const out: File[] = [];
        while (true) {
          const batch = await new Promise<any[]>((resolve, reject) => {
            reader.readEntries(resolve, reject);
          });
          if (!batch || batch.length === 0) break;
          for (const child of batch) {
            out.push(...(await readAllEntries(child)));
          }
        }
        return out;
      }
      return [];
    };

    const files: File[] = [];
    for (const item of items) {
      const entry = (item as any).webkitGetAsEntry?.();
      if (entry) {
        files.push(...(await readAllEntries(entry)));
      } else {
        const f = item.getAsFile?.();
        if (f) files.push(f);
      }
    }
    return files;
  };

  const normalizeSelectedFiles = (files: File[]) => {
    // Keep images only (folder drops can include non-images).
    const images = files.filter((f) => /^image\//.test(f.type));
    return images;
  };

  const stats = useMemo(() => {
    let beavers = 0;
    let animals = 0;
    let otherAnimals = 0;
    let noAnimals = 0;
    let manualReview = 0;
    let errors = 0;

    for (const row of results) {
      if (row.error) {
        errors += 1;
        continue;
      }
      if (row.manual_review) {
        manualReview += 1;
      }

      const hasAnimal = row.animal_agent_label === "animal";
      if (hasAnimal) {
        animals += 1;
      } else {
        noAnimals += 1;
      }

      const hasBeaver = row.beaver_agent_label === "beaver";
      if (hasBeaver) {
        beavers += 1;
      }

      if (hasAnimal && !hasBeaver) {
        otherAnimals += 1;
      }
    }

    return {
      total: results.length,
      animals,
      beavers,
      otherAnimals,
      noAnimals,
      manualReview,
      errors,
    };
  }, [results]);

  const resultsCsv = useMemo(() => buildCsv(results), [results]);

  const sequenceData = useMemo(() => {
    const gapSeconds = 30;
    const lowConf = 0.6;
    const highConf = 0.8;
    const speciesMargin = 0.25;

    const groupMap = new Map<string, DetectionResult[]>();
    for (const row of results) {
      const groupKey = row.overlay_location?.trim() || row.exif_location?.trim() || "unknown";
      const list = groupMap.get(groupKey) ?? [];
      list.push(row);
      groupMap.set(groupKey, list);
    }

    const sequencesById = new Map<string, SequenceSummary>();
    const rowIdToSequenceId = new Map<string, string>();

    for (const [groupKey, rows] of groupMap.entries()) {
      const sorted = [...rows].sort((a, b) => {
        const ta = parseExifTimestampToMs(a.exif_timestamp);
        const tb = parseExifTimestampToMs(b.exif_timestamp);
        if (ta == null && tb == null) return a.image_path.localeCompare(b.image_path);
        if (ta == null) return 1;
        if (tb == null) return -1;
        return ta - tb;
      });

      const sequences: DetectionResult[][] = [];
      let current: DetectionResult[] = [];
      let lastTs: number | null = null;

      for (const r of sorted) {
        const ts = parseExifTimestampToMs(r.exif_timestamp);
        if (ts == null) {
          if (current.length) sequences.push(current);
          current = [];
          lastTs = null;
          sequences.push([r]);
          continue;
        }
        if (lastTs == null) {
          current = [r];
          lastTs = ts;
          continue;
        }
        if (ts - lastTs > gapSeconds * 1000) {
          sequences.push(current);
          current = [r];
        } else {
          current.push(r);
        }
        lastTs = ts;
      }
      if (current.length) sequences.push(current);

      for (let i = 0; i < sequences.length; i++) {
        const seq = sequences[i]!;
        const seqIndex = i + 1;
        const startTs = seq[0]?.exif_timestamp?.trim() || "";
        const startMs = parseExifTimestampToMs(startTs);
        const startId =
          startMs == null
            ? "no_ts"
            : new Date(startMs)
                .toISOString()
                .slice(0, 19)
                .replaceAll("-", "")
                .replaceAll(":", "")
                .replace("T", "_");
        const seqId = `${slug(groupKey)}_${startId}_${seqIndex}`;

        const reasons: string[] = [];
        let flagManualReview = false;

        const votes = seq.map((row) => {
          if (row.has_beaver) {
            return { hasAnimal: true, species: "Beaver", confidence: row.confidence ?? 0, negative: false };
          }
          const animalType = (row.animal_type || "").trim();
          if (animalType) {
            if (animalType === "No animal") {
              return { hasAnimal: false, species: "none", confidence: 0, negative: true };
            }
            return {
              hasAnimal: true,
              species: animalType,
              confidence: toNumber(row.animal_confidence) ?? 0,
              negative: false,
            };
          }
          if (row.has_animal === false) {
            return { hasAnimal: false, species: "none", confidence: 0, negative: true };
          }
          return null;
        });

        const positives = votes
          .filter((v): v is NonNullable<typeof v> => Boolean(v && v.hasAnimal))
          .filter((v) => v.confidence >= lowConf);
        const explicitNegative = votes.some((v) => v?.negative);

        let presence: SequenceSummary["presence"] = "unknown";
        if (positives.length >= 2) {
          presence = "present";
        } else if (positives.length === 1) {
          if (positives[0]!.confidence >= highConf) {
            presence = "present";
          } else {
            presence = "possible";
            flagManualReview = true;
            reasons.push("single_frame_medium_confidence");
          }
        } else {
          if (explicitNegative) {
            presence = "absent";
          } else {
            presence = "unknown";
            flagManualReview = true;
            reasons.push("missing_or_low_confidence");
          }
        }

        const speciesScores = new Map<string, number>();
        for (const v of positives) {
          speciesScores.set(v.species, (speciesScores.get(v.species) ?? 0) + v.confidence);
        }

        let species = "unknown";
        let speciesScore = 0;
        if (speciesScores.size === 0) {
          species = presence === "absent" ? "none" : "unknown";
        } else {
          const ranked = [...speciesScores.entries()].sort((a, b) => b[1] - a[1]);
          const [bestSpecies, bestScore] = ranked[0]!;
          const secondScore = ranked[1]?.[1] ?? 0;
          species = bestSpecies;
          speciesScore = bestScore;
          if (ranked.length > 1 && bestScore - secondScore < speciesMargin) {
            species = "unknown";
            flagManualReview = true;
            reasons.push("species_conflict");
          }
        }

        const disagreement = new Set(positives.map((v) => v.species)).size > 1;
        if (votes.some((v) => v == null)) {
          flagManualReview = true;
          reasons.push("missing_votes");
        }
        if (!startMs) {
          flagManualReview = true;
          reasons.push("missing_timestamp");
        }

        const summary: SequenceSummary = {
          id: seqId,
          groupKey,
          startTs,
          size: seq.length,
          presence,
          species,
          speciesScore: Math.round(speciesScore * 10000) / 10000,
          disagreement,
          flagManualReview,
          reason: reasons.join(","),
        };

        sequencesById.set(seqId, summary);
        for (const row of seq) {
          rowIdToSequenceId.set(row.id, seqId);
        }
      }
    }

    return { sequencesById, rowIdToSequenceId };
  }, [results]);

  const visibleResults = useMemo(() => {
    if (!sequenceFilterId) return results;
    return results.filter(
      (row) => sequenceData.rowIdToSequenceId.get(row.id) === sequenceFilterId,
    );
  }, [results, sequenceData.rowIdToSequenceId, sequenceFilterId]);

  const sortedVisibleResults = useMemo(() => {
    const list = [...visibleResults];
    switch (resultSort) {
      case "beaver_desc":
        return list.sort((a, b) => Number(b.has_beaver) - Number(a.has_beaver));
      case "beaver_asc":
        return list.sort((a, b) => Number(a.has_beaver) - Number(b.has_beaver));
      case "animal_desc":
        return list.sort((a, b) => Number(b.has_animal) - Number(a.has_animal));
      case "animal_asc":
        return list.sort((a, b) => Number(a.has_animal) - Number(b.has_animal));
      case "flagged_desc":
        return list.sort(
          (a, b) =>
            Number(Boolean(b.manual_review || b.agent_conflict || b.error)) -
            Number(Boolean(a.manual_review || a.agent_conflict || a.error)),
        );
      case "confidence_desc":
        return list.sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
      case "confidence_asc":
        return list.sort((a, b) => Number(a.confidence || 0) - Number(b.confidence || 0));
      case "file_asc":
        return list.sort((a, b) =>
          String(a.filename || a.image_path).localeCompare(String(b.filename || b.image_path)),
        );
      default:
        return list;
    }
  }, [visibleResults, resultSort]);

  const mapClassifyResults = (items: Array<{
    filename: string;
    is_beaver: boolean;
    has_animal?: boolean;
    confidence: number;
    common_name: string;
    group: string;
    notes: string;
    beaver_confidence?: number;
    beaver_reason?: string;
    animal_common_name?: string;
    animal_confidence?: number;
    animal_group?: string;
    animal_notes?: string;
    overlay_location?: string;
    overlay_confidence?: number;
    overlay_reason?: string;
    overlay_temperature?: string;
    exif_timestamp?: string;
    manual_review?: boolean;
    s3_key?: string;
    s3_bucket?: string;
  }>) => {
    const timestamp = Date.now();
    return items.map((result, index) => {
      const animalCommonName = result.animal_common_name ?? result.common_name;
      const animalConfidence = result.animal_confidence ?? result.confidence;
      const animalGroup = result.animal_group ?? result.group;
      const animalNotes = result.animal_notes ?? result.notes;

      const post = postProcessAnimalOutput({
        common_name: animalCommonName,
        confidence: animalConfidence,
        group: animalGroup,
        notes: animalNotes,
      });

      let commonName = post.Common_Name;
      let manualReview = post.manual_review || Boolean(result.manual_review);
      let confidence = post.confidence;
      let group = animalGroup;
      let reason = animalNotes || "";

      const animalPresence =
        typeof result.has_animal === "boolean"
          ? result.has_animal
          : Boolean(animalCommonName && animalCommonName !== "No animal");

      if (!animalPresence) {
        commonName = "No animal";
        group = "none";
      } else if (commonName === "No animal") {
        // Guardrail: if backend says animal present, do not turn it into "No animal".
        commonName = "unknown";
      }

      const beaverAgentLabel = result.is_beaver ? "beaver" : "other_animal";
      const animalAgentLabel = animalPresence ? "animal" : "no_animal";
      const animalSaysBeaver = commonName === "Beaver";
      const agentConflict = Boolean(result.is_beaver) !== animalSaysBeaver;
      if (agentConflict) {
        manualReview = true;
      }

      // Keep a stable "default review label" for the dropdown, but we no longer
      // display a separate Predicted column.
      const predictedLabel = result.is_beaver
        ? "beaver"
        : animalPresence
          ? "other_animal"
          : "no_animal";
      const isNoAnimal = !animalPresence;
      const displayCommonName = isNoAnimal ? "NA" : commonName || "unknown";
      const normalizedAnimalType = isNoAnimal ? "No animal" : commonName || "unknown";

      return {
        id: `classify_${timestamp}_${index}`,
        image_path: result.filename || "",
        filename: imageNameFromPath(result.filename || ""),
        predicted_label: predictedLabel,
        beaver_agent_label: beaverAgentLabel,
        animal_agent_label: animalAgentLabel,
        agent_conflict: agentConflict,
        review_label: predictedLabel,
        was_corrected: false,
        confidence,
        reason,
        notes: post.notes || "",
        model_id: "",
        has_beaver: result.is_beaver,
        has_animal: animalPresence,
        Common_Name: displayCommonName,
        manual_review: manualReview,
        animal_type: normalizedAnimalType,
        animal_group: group,
        animal_confidence: animalConfidence,
        animal_reason: animalNotes || "",
        bbox: "",
        overlay_location: result.overlay_location || "",
        overlay_confidence: result.overlay_confidence ?? "",
        overlay_reason: result.overlay_reason || "",
        overlay_temperature: result.overlay_temperature || "",
        exif_timestamp: result.exif_timestamp || "",
        exif_location: "",
        s3_key: result.s3_key || "",
        s3_bucket: result.s3_bucket || "",
        error: "",
      };
    });
  };

  const buildUiDemoResults = (files: File[]) =>
    mapClassifyResults(
      files.map((file, index) => {
        const variants = [
          { is_beaver: true, has_animal: true, common_name: "Beaver", group: "mammal" },
          { is_beaver: false, has_animal: true, common_name: "River otter", group: "mammal" },
          { is_beaver: false, has_animal: false, common_name: "No animal", group: "none" },
        ];
        const result = variants[index % variants.length];
        return {
          filename: file.name,
          ...result,
          confidence: result.is_beaver ? 0.92 : result.has_animal ? 0.81 : 0.96,
          notes: "UI demo preview — live inference is not connected in this public portfolio build.",
        };
      }),
    );

  const handleRunDetection = async () => {
    setRunError("");
    setIsRunning(true);
    try {
      const formData = new FormData();
      const s3 = s3Path.trim();
      const allFiles = [...selectedFiles];
      const uiOnlyDemo =
        typeof window !== "undefined" &&
        window.location.hostname.endsWith(".vercel.app") &&
        process.env.NEXT_PUBLIC_ENABLE_LIVE_INFERENCE !== "1";

      if (uiOnlyDemo) {
        if (s3) {
          throw new Error("S3 path input is retained as an AWS legacy feature and is unavailable in this public UI demo.");
        }
        if (!allFiles.length) {
          throw new Error("Select one or more images to preview the workflow.");
        }
        setResults(buildUiDemoResults(allFiles));
        setJobId(null);
        setJobStatus("demo");
        setJobCsvKey("");
        setJobProgress({ completed: allFiles.length, total: allFiles.length });
        setCsvText("");
        setCsvPath("");
        setCsvName("");
        return;
      }

      const isSingleS3File = Boolean(s3) && /\.(jpe?g|png|tiff?|webp)$/i.test(s3);
      const useClassifyApi =
        isSingleS3File || (!s3 && allFiles.length > 0 && allFiles.length <= 5);
      const useJobsApi = !useClassifyApi && (Boolean(s3) || (!s3 && allFiles.length > 5));
      const uploadIsLocal = !s3 && allFiles.length > 0;
      const directApiBase = resolveBeaverApiBase().value;
      const forceDirectApi = process.env.NEXT_PUBLIC_FORCE_DIRECT_API === "1";
      const shouldUseDirectApi =
        uploadIsLocal &&
        typeof window !== "undefined" &&
        (forceDirectApi || window.location.hostname.endsWith("amplifyapp.com"));
      let directUsesJobs = false;

      if (shouldUseDirectApi) {
        const prefix = `uploads/${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const uploadedPaths: string[] = [];

        for (const file of allFiles) {
          const signResponse = await fetch(`${directApiBase}/api/upload-url`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              content_type: file.type,
              prefix,
            }),
          });
          if (!signResponse.ok) {
            const body = await signResponse.json().catch(() => ({}));
            throw new Error(body.error || "Failed to prepare upload.");
          }
          const signed = await signResponse.json();
          if (!signed.upload_url || !signed.s3_path) {
            throw new Error("Upload URL missing from server.");
          }
          const putResponse = await fetch(signed.upload_url, {
            method: "PUT",
            headers: file.type ? { "content-type": file.type } : undefined,
            body: file,
          });
          if (!putResponse.ok) {
            throw new Error("S3 upload failed.");
          }
          uploadedPaths.push(signed.s3_path as string);
        }

        if (uploadedPaths.length === 1) {
          formData.set("s3Path", uploadedPaths[0]);
        } else {
          directUsesJobs = true;
          const bucketPrefix = uploadedPaths[0].replace(/^(s3:\/\/[^/]+\/).+$/, "$1");
          formData.set("s3Path", `${bucketPrefix}${prefix}/`);
        }
      } else if (s3) {
        formData.set("s3Path", s3);
      } else {
        if (allFiles.length === 0) {
          throw new Error("Select files or enter an S3 path.");
        }
        for (const file of allFiles) {
          formData.append("files", file);
        }
      }

      const useJobsApiRuntime = useJobsApi || directUsesJobs;
      const useClassifyApiRuntime = !useJobsApiRuntime && useClassifyApi;

      const endpoint = useClassifyApiRuntime ? "/api/classify" : "/api/jobs";
      const url = shouldUseDirectApi ? new URL(endpoint, directApiBase).toString() : endpoint;

      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readErrorFromResponse(response));
      }

      const payload = await response.json();

      if (useJobsApiRuntime) {
        const nextJobId = payload.job_id as string | undefined;
        if (!nextJobId) {
          throw new Error("Job creation failed.");
        }
        setJobId(nextJobId);
        setJobStatus(payload.status || "queued");
        setJobCsvKey("");
        setJobProgress({ completed: 0, total: payload.total_images || 0 });

        let attempts = 0;
        const maxAttempts = Infinity;
        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const jobResponse = await fetch(`/api/jobs/${nextJobId}`);
          if (!jobResponse.ok) {
            throw new Error(await readErrorFromResponse(jobResponse));
          }
          const jobPayload = await jobResponse.json().catch(() => ({}));
          setJobStatus(jobPayload.status || "");
          setJobProgress({
            completed: jobPayload.completed_images || 0,
            total: jobPayload.total_images || 0,
          });
          if (jobPayload.status === "complete") {
            const mapped = mapClassifyResults(jobPayload.results || []);
            setResults(mapped);
            setJobCsvKey(jobPayload.csv_s3_key || "");
            break;
          }
          if (jobPayload.status === "error") {
            throw new Error(jobPayload.error || "Job failed.");
          }
          attempts += 1;
        }
      } else if (useClassifyApiRuntime) {
        const mapped = mapClassifyResults(payload.results || []);
        setResults(mapped);
        setJobId(null);
        setJobStatus("");
        setJobCsvKey("");
        setJobProgress({ completed: 0, total: 0 });
      }
      setCsvText("");
      setCsvPath("");
      setCsvName("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setRunError(message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleUpdateReview = (id: string, nextLabel: string) => {
    setResults((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const was_corrected = row.predicted_label !== nextLabel;
        return { ...row, review_label: nextLabel, was_corrected };
      }),
    );
  };

  const handleUpdateNotes = (id: string, notes: string) => {
    setResults((prev) =>
      prev.map((row) => (row.id === id ? { ...row, notes } : row)),
    );
  };

  const handleUpdateSpecies = (id: string, species: string) => {
    setResults((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const normalized = species || "unknown";
        const noAnimal = normalized === "No animal";
        const animalAgentLabel = noAnimal ? "no_animal" : "animal";
        const hasAnimal = !noAnimal;
        const nextReviewLabel = noAnimal
          ? "no_animal"
          : normalized === "Beaver"
            ? "beaver"
            : "other_animal";
        const was_corrected = row.predicted_label !== nextReviewLabel;
        return {
          ...row,
          Common_Name: noAnimal ? "NA" : normalized,
          animal_type: normalized,
          has_animal: hasAnimal,
          animal_agent_label: animalAgentLabel,
          review_label: nextReviewLabel,
          was_corrected,
        };
      }),
    );
  };

  const handleUpdateAnimalAgent = (id: string, nextValue: string) => {
    setResults((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const isNoAnimal = nextValue === "no_animal";
        const nextSpecies = isNoAnimal
          ? "No animal"
          : row.animal_type === "No animal"
            ? "unknown"
            : row.animal_type || "unknown";
        const nextCommonName = isNoAnimal ? "NA" : nextSpecies;
        const nextReviewLabel = isNoAnimal
          ? "no_animal"
          : nextSpecies === "Beaver"
            ? "beaver"
            : "other_animal";
        const was_corrected = row.predicted_label !== nextReviewLabel;
        return {
          ...row,
          animal_agent_label: isNoAnimal ? "no_animal" : "animal",
          has_animal: !isNoAnimal,
          animal_type: nextSpecies,
          Common_Name: nextCommonName,
          review_label: nextReviewLabel,
          was_corrected,
        };
      }),
    );
  };

  const handleDownloadCsv = () => {
    if (!resultsCsv) return;
    const blob = new Blob([resultsCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "beaver_results_reviewed.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJobCsv = async () => {
    if (!jobId || !jobCsvKey) return;
    const response = await fetch(`/api/jobs/${jobId}/csv`);
    if (!response.ok) {
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `job_${jobId}_results.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleSendChat = async (messageText: string = input) => {
    if (!messageText.trim()) return;
    setChatError("");
    const userMessage = {
      id: `user_${Date.now()}`,
      role: "user" as const,
      text: messageText.trim(),
    };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setInput("");
    setChatStatus("loading");
    try {
      const uiOnlyDemo =
        typeof window !== "undefined" &&
        window.location.hostname.endsWith(".vercel.app") &&
        process.env.NEXT_PUBLIC_ENABLE_LIVE_INFERENCE !== "1";
      if (uiOnlyDemo) {
        const summary = results.length
          ? `I can help you explore the ${results.length} image${results.length === 1 ? "" : "s"} in the current review workspace. You can inspect labels, adjust review decisions, and export the reviewed CSV from the Workflow tab.`
          : "Start by uploading images in the Workflow tab. Once results are available, I can help you review labels, corrections, and export options.";
        setChatMessages([
          ...nextMessages,
          {
            id: `assistant_${Date.now()}`,
            role: "assistant" as const,
            text: summary,
          },
        ]);
        return;
      }
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: messageText.trim(), csvText, csvPath, modelId }),
      });
      if (!response.ok) {
        throw new Error(await readErrorFromResponse(response));
      }
      const payload = await response.json().catch(() => ({}));
      const assistantMessage = {
        id: `assistant_${Date.now()}`,
        role: "assistant" as const,
        text: payload.text || "",
      };
      setChatMessages([...nextMessages, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setChatError(message);
    } finally {
      setChatStatus("idle");
    }
  };

  const displayMessages = useMemo(() => chatMessages, [chatMessages]);

  const isTyping = chatStatus === "loading";

  const loadHistoryJobs = async () => {
    setHistoryError("");
    const uiOnlyDemo =
      typeof window !== "undefined" &&
      window.location.hostname.endsWith(".vercel.app") &&
      process.env.NEXT_PUBLIC_ENABLE_LIVE_INFERENCE !== "1";
    if (uiOnlyDemo) {
      setHistoryJobs([]);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("limit", "100");
      if (historyStatus !== "all") query.set("status", historyStatus);
      const response = await fetch(`/api/jobs?${query.toString()}`);
      if (!response.ok) {
        throw new Error(await readErrorFromResponse(response));
      }
      const payload = await response.json().catch(() => ({}));
      const items = Array.isArray(payload.jobs) ? payload.jobs : [];
      setHistoryJobs(
        items.map((item: Record<string, unknown>) => ({
          job_id: String(item.job_id || ""),
          status: String(item.status || ""),
          source: String(item.source || ""),
          total_images: Number(item.total_images || 0) || 0,
          completed_images: Number(item.completed_images || 0) || 0,
          error: String(item.error || ""),
          csv_s3_key: String(item.csv_s3_key || ""),
          created_at: String(item.created_at || ""),
          updated_at: String(item.updated_at || ""),
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load history.";
      setHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "history") return;
    if (!auth.user) return;
    void loadHistoryJobs();
  }, [activeTab, auth.user, historyStatus]);

  const filteredHistoryJobs = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const filtered = historyJobs.filter((job) => {
      if (!q) return true;
      return (
        job.job_id.toLowerCase().includes(q) ||
        job.status.toLowerCase().includes(q) ||
        job.source.toLowerCase().includes(q)
      );
    });
    return filtered.sort((a, b) => {
      const ta = Date.parse(a.created_at || "") || 0;
      const tb = Date.parse(b.created_at || "") || 0;
      return historySort === "newest" ? tb - ta : ta - tb;
    });
  }, [historyJobs, historySearch, historySort]);

  const formatHistoryDate = (value: string) => {
    const ts = Date.parse(value || "");
    if (!Number.isFinite(ts)) return "—";
    return new Date(ts).toLocaleString();
  };

  const loadRowImage = async (row: DetectionResult) => {
    if (rowImageUrls[row.id] || rowImageLoading[row.id]) return;
    if (!row.s3_key) {
      setRowImageErrors((prev) => ({ ...prev, [row.id]: "Image preview unavailable." }));
      return;
    }

    setRowImageLoading((prev) => ({ ...prev, [row.id]: true }));
    setRowImageErrors((prev) => ({ ...prev, [row.id]: "" }));
    try {
      const base = resolveBeaverApiBase().value;
      const url = new URL("/api/image-url", base);
      if (row.s3_bucket) {
        url.searchParams.set("bucket", row.s3_bucket);
      }
      url.searchParams.set("key", row.s3_key);
      url.searchParams.set("expires_in", "600");
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(await readErrorFromResponse(response));
      }
      const payload = await response.json().catch(() => ({}));
      if (!payload.image_url) {
        throw new Error("No image URL returned.");
      }
      setRowImageUrls((prev) => ({ ...prev, [row.id]: payload.image_url }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load image.";
      setRowImageErrors((prev) => ({ ...prev, [row.id]: message }));
    } finally {
      setRowImageLoading((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const toggleRow = (row: DetectionResult) => {
    const id = row.id;
    setExpandedRows((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
    if (!expandedRows.includes(id)) {
      void loadRowImage(row);
    }
  };

  const handleOpenHistoryJob = async (historyJobId: string) => {
    setRunError("");
    try {
      const response = await fetch(`/api/jobs/${historyJobId}`);
      if (!response.ok) {
        throw new Error(await readErrorFromResponse(response));
      }
      const payload = await response.json().catch(() => ({}));
      const mapped = mapClassifyResults(
        Array.isArray(payload.results) ? payload.results : [],
      );
      setResults(mapped);
      setJobId(historyJobId);
      setJobStatus(String(payload.status || ""));
      setJobCsvKey(String(payload.csv_s3_key || ""));
      setJobProgress({
        completed: Number(payload.completed_images || 0) || 0,
        total: Number(payload.total_images || 0) || 0,
      });
      setActiveTab("dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to open job.";
      setRunError(message);
    }
  };

  const goToTab = (tab: "home" | "dashboard" | "history" | "chat") => {
    if (tab !== "home" && auth.ready && !auth.user && !auth.demoMode) {
      setShowAuth(true);
      return;
    }
    setActiveTab(tab);
  };


  return (
    <div className="relative min-h-screen text-[hsl(var(--foreground))]">
      {!auth.demoMode && <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />}
      {activeTab === "home" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_70%_at_14%_10%,hsl(var(--soft-primary-bg)/0.85)_0%,transparent_56%),radial-gradient(90%_70%_at_86%_12%,hsl(var(--bg-decor-end)/0.9)_0%,transparent_58%),linear-gradient(135deg,hsl(var(--bg-decor-start)/0.55)_0%,hsl(var(--background))_45%,hsl(var(--bg-decor-end)/0.45)_100%)]"
        />
      )}
      <header className="px-6 py-6">
        <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[hsl(var(--muted-foreground))]">
              BIOVISION
            </p>
            <p className="mt-1 text-sm font-semibold text-[hsl(var(--foreground))]">
              DFW Beaver ID
            </p>
          </div>

          <nav className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => goToTab("home")}
              className={`rounded px-2 py-1 text-sm font-medium transition ${
                activeTab === "home"
                  ? "border-b-2 border-[hsl(var(--foreground))] text-[hsl(var(--foreground))]"
                  : "border-b-2 border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => goToTab("dashboard")}
              className={`rounded px-2 py-1 text-sm font-medium transition ${
                activeTab === "dashboard"
                  ? "border-b-2 border-[hsl(var(--foreground))] text-[hsl(var(--foreground))]"
                  : "border-b-2 border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              Workflow
            </button>
            <button
              type="button"
              onClick={() => goToTab("chat")}
              className={`rounded px-2 py-1 text-sm font-medium transition ${
                activeTab === "chat"
                  ? "border-b-2 border-[hsl(var(--foreground))] text-[hsl(var(--foreground))]"
                  : "border-b-2 border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => goToTab("history")}
              className={`rounded px-2 py-1 text-sm font-medium transition ${
                activeTab === "history"
                  ? "border-b-2 border-[hsl(var(--foreground))] text-[hsl(var(--foreground))]"
                  : "border-b-2 border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              History
            </button>
            <div className="mx-2 h-4 w-px bg-[hsl(var(--border))]" />
            {auth.demoMode ? (
              <span className="rounded-full border border-[hsl(var(--border))] bg-white/70 px-3 py-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                Demo mode
              </span>
            ) : auth.user ? (
              <button
                type="button"
                onClick={() => auth.signOut()}
                className="rounded-full border border-[hsl(var(--border))] bg-white/70 px-3 py-1 text-xs font-semibold text-[hsl(var(--foreground))] shadow-sm hover:bg-white"
                title={auth.user.username}
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuth(true)}
                className="rounded-full bg-[hsl(var(--primary))] px-3 py-1 text-xs font-semibold text-[hsl(var(--primary-foreground))] shadow-sm hover:bg-[hsl(var(--primary-hover))]"
              >
                Sign in
              </button>
            )}
          </nav>
        </div>
      </header>

      <main
        className={`relative px-6 pb-8 ${
          activeTab === "home" ? "bg-transparent" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-[90rem] flex-col">
            {activeTab !== "home" && (
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {activeTab === "dashboard"
                      ? "Detection Workflow"
                      : activeTab === "history"
                        ? "Job History"
                        : "Chat"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
                    Upload trail-cam batches, run Beaver + Animal ID, review labels, export CSVs,
                    and ask questions against the results.
                  </p>
                </div>
              </header>
            )}

            {activeTab === "home" ? (
              <>
                <section className="relative mt-6 flex min-h-[78vh] items-center justify-center overflow-hidden">
                  <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-4 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--soft-primary-border))] bg-[hsl(var(--soft-primary-bg))]/70 px-4 py-2 text-sm font-semibold text-[hsl(var(--primary))] shadow-sm">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/70">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path d="M12 2l1.2 3.6L17 7l-3.8 1.4L12 12l-1.2-3.6L7 7l3.8-1.4L12 2z" />
                          <path d="M19 11l.7 2.1L22 14l-2.3.9L19 17l-.7-2.1L16 14l2.3-.9L19 11z" />
                        </svg>
                      </span>
                      AI-Powered Wildlife Detection
                    </div>

                    <h1 className="mt-8 text-5xl font-semibold tracking-tight sm:text-6xl">
                      <span className="text-[hsl(var(--foreground))]">DFW </span>
                      <span className="bg-gradient-to-r from-[hsl(var(--gradient-green-from))] to-[hsl(var(--gradient-green-to))] bg-clip-text text-transparent">
                        Beaver ID
                      </span>
                    </h1>

                    <p className="mt-6 max-w-3xl text-xl leading-relaxed text-[hsl(var(--muted-foreground))]">
                      Review trail-camera batches faster with{" "}
                      <span className="font-semibold text-[hsl(var(--foreground))]">
                        AI detection
                      </span>{" "}
                      + human correction
                    </p>

                    <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
                      <button
                        type="button"
                        onClick={() => setActiveTab("dashboard")}
                        className="inline-flex items-center gap-3 rounded-full bg-[hsl(var(--accent))] px-8 py-4 text-base font-semibold text-[hsl(var(--accent-foreground))] shadow-lg shadow-black/10 transition hover:bg-[hsl(var(--primary-hover))]"
                      >
                        Start Detection
                        <span aria-hidden="true">→</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          howItWorksRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }}
                        className="text-base font-semibold text-[hsl(var(--muted-foreground))] transition hover:text-[hsl(var(--foreground))]"
                      >
                        See how it works
                      </button>
                    </div>
                  </div>
                </section>

                <section className="mt-24">
                  <div className="text-center">
                    <h2 className="text-4xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                      Core{" "}
                      <span className="text-[hsl(var(--primary))]">Highlights</span>
                    </h2>
                    <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))]">
                      Everything you need to process and analyze trail camera data efficiently
                    </p>
                  </div>

                  <div className="mt-12 grid gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl border border-[hsl(var(--border))] bg-white/70 p-8 shadow-lg shadow-black/5">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--soft-primary-bg))] text-[hsl(var(--primary))]">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-6 w-6"
                          aria-hidden="true"
                        >
                          <path d="M4 7h4l2-2h4l2 2h4" />
                          <rect x="4" y="7" width="16" height="13" rx="3" />
                          <path d="M12 10a4 4 0 1 0 0.001 0z" />
                        </svg>
                      </div>
                      <h3 className="mt-6 text-2xl font-semibold">Beaver Detection</h3>
                      <p className="mt-3 text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
                        Advanced ML model trained specifically for beaver identification in trail
                        camera footage.
                      </p>
                    </div>

                    <div className="rounded-3xl border border-[hsl(var(--border))] bg-white/70 p-8 shadow-lg shadow-black/5">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--bg-decor-end))] text-[hsl(var(--gradient-blue-to))]">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-6 w-6"
                          aria-hidden="true"
                        >
                          <path d="M7 5c1.5 0 2.5 1 2.5 2.5S8.5 10 7 10" />
                          <path d="M17 5c-1.5 0-2.5 1-2.5 2.5S15.5 10 17 10" />
                          <path d="M7 10c0 5 5 5 5 9" />
                          <path d="M17 10c0 5-5 5-5 9" />
                          <path d="M8 21h8" />
                        </svg>
                      </div>
                      <h3 className="mt-6 text-2xl font-semibold">Other Animal Detection</h3>
                      <p className="mt-3 text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
                        Automatically classify other wildlife species captured in your images.
                      </p>
                    </div>

                    <div className="rounded-3xl border border-[hsl(var(--border))] bg-white/70 p-8 shadow-lg shadow-black/5">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--soft-primary-bg))] text-[hsl(var(--primary))]">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-6 w-6"
                          aria-hidden="true"
                        >
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </div>
                      <h3 className="mt-6 text-2xl font-semibold">Human Label Grouping</h3>
                      <p className="mt-3 text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
                        Manual correction tools for biologists to refine and validate predictions.
                      </p>
                    </div>

                    <div className="rounded-3xl border border-[hsl(var(--border))] bg-white/70 p-8 shadow-lg shadow-black/5">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--bg-decor-end))] text-[hsl(var(--gradient-blue-to))]">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-6 w-6"
                          aria-hidden="true"
                        >
                          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                        </svg>
                      </div>
                      <h3 className="mt-6 text-2xl font-semibold">AI Chatbot</h3>
                      <p className="mt-3 text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
                        Ask questions about your results for fast counting and summaries.
                      </p>
                    </div>
                  </div>
                </section>

                <section ref={howItWorksRef} className="mt-28 pb-16">
                  <div className="text-center">
                    <h2 className="text-4xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                      How It{" "}
                      <span className="bg-gradient-to-r from-[hsl(var(--gradient-blue-from))] to-[hsl(var(--gradient-blue-to))] bg-clip-text text-transparent">
                        Works
                      </span>
                    </h2>
                    <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))]">
                      From upload to insights in five simple steps
                    </p>
                  </div>

                  <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="text-center">
                      <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-white/70 shadow-sm">
                        <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[hsl(var(--primary))]" />
                        <IconUpload className="h-6 w-6" />
                      </div>
                      <p className="mt-5 text-lg font-semibold">Upload</p>
                      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                        Upload images or ZIP files
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-white/70 shadow-sm">
                        <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[hsl(var(--primary))]" />
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-6 w-6"
                          aria-hidden="true"
                        >
                          <polygon points="9,7 19,12 9,17" />
                        </svg>
                      </div>
                      <p className="mt-5 text-lg font-semibold">Run Detection</p>
                      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                        AI processes your batch
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-white/70 shadow-sm">
                        <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[hsl(var(--primary))]" />
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-6 w-6"
                          aria-hidden="true"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </div>
                      <p className="mt-5 text-lg font-semibold">Review & Correct</p>
                      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                        Validate and fix labels
                      </p>
                    </div>

                    <div className="text-center lg:col-start-1 lg:col-end-2 lg:justify-self-center">
                      <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-white/70 shadow-sm">
                        <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[hsl(var(--primary))]" />
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-6 w-6"
                          aria-hidden="true"
                        >
                          <path d="M12 3v12" />
                          <path d="M7 10l5 5 5-5" />
                          <path d="M21 21H3" />
                        </svg>
                      </div>
                      <p className="mt-5 text-lg font-semibold">Export CSV</p>
                      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                        Download your results
                      </p>
                    </div>

                    <div className="text-center lg:col-start-2 lg:col-end-3 lg:justify-self-center">
                      <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-white/70 shadow-sm">
                        <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[hsl(var(--primary))]" />
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-6 w-6"
                          aria-hidden="true"
                        >
                          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                        </svg>
                      </div>
                      <p className="mt-5 text-lg font-semibold">Ask Chatbot</p>
                      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                        Get instant insights
                      </p>
                    </div>
                  </div>

                  <div className="mt-16 border-t border-[hsl(var(--border))] pt-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    © 2026 DFW Beaver ID. Built for wildlife biologists.
                  </div>
                </section>
              </>
            ) : activeTab === "dashboard" ? (
              <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="flex h-full flex-col rounded-3xl border border-[hsl(var(--border))] bg-white/90 p-6 shadow-lg shadow-black/5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Input
                </h3>
                <div className="mt-4 flex flex-1 flex-col gap-3 text-sm">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Upload images
                    </label>
                    <div
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragOver(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragOver(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragOver(false);
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragOver(false);
                        const dropped = await getFilesFromDrop(e.dataTransfer);
                        const next = normalizeSelectedFiles(dropped);
                        setSelectedFiles(next);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      className={`mt-2 min-h-[164px] rounded-3xl border-2 border-dashed px-6 py-6 text-center shadow-sm transition ${
                        isDragOver
                          ? "border-[hsl(var(--primary))] bg-[hsl(var(--soft-primary-bg))]/60"
                          : "border-[hsl(var(--border))] bg-white/60 hover:bg-white/80"
                      }`}
                    >
                      <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                            Drop images here
                          </p>
                          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                            or click to browse your files
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef.current?.click();
                            }}
                            className="inline-flex items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-white px-4 py-2 text-xs font-semibold shadow-sm"
                          >
                            <IconUpload className="h-4 w-4" />
                            Browse files
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              folderInputRef.current?.click();
                            }}
                            className="inline-flex items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-white px-4 py-2 text-xs font-semibold shadow-sm"
                          >
                            <IconFolder className="h-4 w-4" />
                            Browse folder
                          </button>
                          {selectedFiles.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFiles([]);
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl border border-[hsl(var(--soft-primary-border))] bg-[hsl(var(--soft-primary-bg))] px-4 py-2 text-xs font-semibold text-[hsl(var(--foreground))] shadow-sm"
                            >
                              Clear ({selectedFiles.length})
                            </button>
                          )}
                        </div>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            const next = normalizeSelectedFiles(
                              Array.from(event.target.files || []),
                            );
                            setSelectedFiles(next);
                          }}
                        />
                        <input
                          ref={folderInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            const next = normalizeSelectedFiles(
                              Array.from(event.target.files || []),
                            );
                            setSelectedFiles(next);
                          }}
                        />

                        {selectedFiles.length > 0 && (
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            {selectedFiles.length} image(s) selected.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Or S3 path
                    </label>
                    <input
                      value={s3Path}
                      onChange={(event) => setS3Path(event.target.value)}
                      placeholder="s3://bucket/path/to/images/"
                      className="mt-2 block w-full rounded-2xl border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                    />
                  </div>

                  {runError && (
                    <p className="rounded-[var(--radius)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {runError}
                    </p>
                  )}

                  <div className="mt-auto space-y-3">
                    <button
                      type="button"
                      onClick={handleRunDetection}
                      disabled={isRunning}
                      className="w-full rounded-2xl bg-[hsl(var(--accent))] px-4 py-3 text-sm font-semibold text-[hsl(var(--accent-foreground))] shadow-md shadow-black/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRunning ? "Running detection..." : "Run detection"}
                    </button>
                    {jobStatus && (
                      <div className="space-y-2 text-xs text-[hsl(var(--muted-foreground))]">
                        <p>
                          Job status: <span className="font-semibold">{jobStatus}</span>
                          {jobProgress.total > 0 && (
                            <span className="ml-2">
                              {jobProgress.completed}/{jobProgress.total}
                            </span>
                          )}
                        </p>
                        {jobProgress.total > 0 && (
                          <div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--border))]">
                              <div
                                className="h-full rounded-full bg-[hsl(var(--accent))] transition-all"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.round(
                                      (jobProgress.completed / jobProgress.total) * 100,
                                    ),
                                  )}%`,
                                }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                              {Math.min(
                                100,
                                Math.round(
                                  (jobProgress.completed / jobProgress.total) * 100,
                                ),
                              )}
                              % complete
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex h-full flex-col rounded-3xl border border-[hsl(var(--border))] bg-white/90 p-6 shadow-lg shadow-black/5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Summary
                </h3>
                <div className="mt-4 flex flex-1 flex-col">
                  <div className="grid gap-3 text-sm">
                    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4">
                      <p className="text-xs uppercase text-[hsl(var(--muted-foreground))]">Total images</p>
                      <p className="text-2xl font-semibold">{stats.total}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4">
                        <p className="text-xs uppercase text-[hsl(var(--muted-foreground))]">Animals</p>
                        <p className="text-xl font-semibold">
                          {stats.animals}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4">
                        <p className="text-xs uppercase text-[hsl(var(--muted-foreground))]">Beavers</p>
                        <p className="text-xl font-semibold">{stats.beavers}</p>
                      </div>
                      <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4">
                        <p className="text-xs uppercase text-[hsl(var(--muted-foreground))]">Other animals</p>
                        <p className="text-xl font-semibold">{stats.otherAnimals}</p>
                      </div>
                      <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4">
                        <p className="text-xs uppercase text-[hsl(var(--muted-foreground))]">No animal</p>
                        <p className="text-xl font-semibold">{stats.noAnimals}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      disabled={!resultsCsv}
                      className="mt-6 w-full rounded-2xl border border-[hsl(var(--border))] bg-white px-4 py-3 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Download reviewed CSV
                    </button>
                    {jobCsvKey && (
                      <button
                        type="button"
                        onClick={handleDownloadJobCsv}
                        className="mt-3 w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-3 text-sm font-semibold shadow-sm"
                      >
                        Download job CSV
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
            ) : activeTab === "history" ? (
              <section className="mt-8">
                <div className="rounded-3xl border border-[hsl(var(--border))] bg-white/90 p-6 shadow-lg shadow-black/5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Jobs
                    </h3>
                    <button
                      type="button"
                      onClick={() => void loadHistoryJobs()}
                      className="rounded-xl border border-[hsl(var(--border))] bg-white px-3 py-1.5 text-xs font-semibold"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <input
                      value={historySearch}
                      onChange={(event) => setHistorySearch(event.target.value)}
                      placeholder="Search by job id/status/source"
                      className="rounded-xl border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm"
                    />
                    <select
                      value={historyStatus}
                      onChange={(event) => setHistoryStatus(event.target.value)}
                      className="rounded-xl border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm"
                    >
                      <option value="all">All status</option>
                      <option value="queued">Queued</option>
                      <option value="running">Running</option>
                      <option value="finalizing">Finalizing</option>
                      <option value="complete">Complete</option>
                      <option value="error">Error</option>
                    </select>
                    <select
                      value={historySort}
                      onChange={(event) =>
                        setHistorySort(event.target.value === "oldest" ? "oldest" : "newest")
                      }
                      className="rounded-xl border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </div>

                  {historyError && (
                    <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {historyError}
                    </p>
                  )}

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[860px] table-fixed text-left text-xs">
                      <thead>
                        <tr className="border-b border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">
                          <th className="w-[28%] px-2 py-2 font-semibold">Job ID</th>
                          <th className="w-[10%] px-2 py-2 font-semibold">Status</th>
                          <th className="w-[10%] px-2 py-2 font-semibold">Source</th>
                          <th className="w-[10%] px-2 py-2 font-semibold">Images</th>
                          <th className="w-[18%] px-2 py-2 font-semibold">Created</th>
                          <th className="w-[18%] px-2 py-2 font-semibold">Updated</th>
                          <th className="w-[6%] px-2 py-2 font-semibold">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistoryJobs.map((job) => (
                          <tr key={job.job_id} className="border-b border-[hsl(var(--border))]">
                            <td className="truncate px-2 py-2 font-mono">{job.job_id}</td>
                            <td className="px-2 py-2">{job.status}</td>
                            <td className="px-2 py-2">{job.source}</td>
                            <td className="px-2 py-2">
                              {job.completed_images}/{job.total_images}
                            </td>
                            <td className="px-2 py-2">{formatHistoryDate(job.created_at)}</td>
                            <td className="px-2 py-2">{formatHistoryDate(job.updated_at)}</td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => void handleOpenHistoryJob(job.job_id)}
                                className="font-semibold text-[hsl(var(--accent))]"
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!historyLoading && filteredHistoryJobs.length === 0 && (
                      <p className="py-4 text-sm text-[hsl(var(--muted-foreground))]">
                        No jobs found.
                      </p>
                    )}
                    {historyLoading && (
                      <p className="py-4 text-sm text-[hsl(var(--muted-foreground))]">
                        Loading jobs...
                      </p>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <section className="mt-8">
                <div className="flex min-h-[72vh] flex-col rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-6 py-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        Chat
                      </h3>
                      {isTyping && (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          Thinking...
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                          CSV path
                        </span>
                        <input
                          value={csvPath}
                          onChange={(event) => setCsvPath(event.target.value)}
                          placeholder="/path/to/results.csv"
                          className="w-[240px] rounded-2xl border border-[hsl(var(--border))] bg-white px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => csvFileRef.current?.click()}
                          className="rounded-2xl border border-[hsl(var(--border))] bg-white px-3 py-2 text-xs font-semibold shadow-sm"
                        >
                          Upload CSV
                        </button>
                        <span className="max-w-[220px] truncate text-xs text-[hsl(var(--muted-foreground))]">
                          {csvName || "No file selected"}
                        </span>
                        <input
                          ref={csvFileRef}
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) {
                              setCsvText("");
                              setCsvName("");
                              return;
                            }
                            setCsvName(file.name);
                            const reader = new FileReader();
                            reader.onload = () => {
                              setCsvText(String(reader.result || ""));
                            };
                            reader.readAsText(file);
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 pb-24">
                    <div className="flex flex-col gap-5 py-6">
                      {displayMessages.length === 0 && (
                        <div className="mx-auto max-w-xl rounded-3xl border border-[hsl(var(--border))] bg-white/70 p-5 text-center shadow-sm">
                          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                            AI Chat
                          </p>
                          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                            Ask: “How many beavers are detected?” or “List animals found.”
                          </p>
                        </div>
                      )}
                      {displayMessages.map((message) => (
                        <div
                          key={message.id}
                          className={
                            message.role === "user"
                              ? "flex items-start justify-end gap-3"
                              : "flex items-start justify-start gap-3"
                          }
                        >
                          {message.role === "assistant" && (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-white/80 text-[hsl(var(--gradient-blue-to))] shadow-sm">
                              <IconBot className="h-5 w-5" />
                            </div>
                          )}

                          <div
                            className={
                              message.role === "user"
                                ? "max-w-[min(720px,75%)] rounded-full bg-[hsl(var(--primary))] px-6 py-4 text-[15px] leading-relaxed text-[hsl(var(--primary-foreground))] shadow-md shadow-black/10"
                                : "max-w-[min(760px,78%)] rounded-3xl border border-[hsl(var(--border))] bg-white/85 px-6 py-5 text-[15px] leading-relaxed text-[hsl(var(--foreground))] shadow-sm"
                            }
                          >
                            {message.text}
                          </div>

                          {message.role === "user" && (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--soft-primary-border))] bg-[hsl(var(--soft-primary-bg))] text-[hsl(var(--primary))] shadow-sm">
                              <IconUser className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                      ))}
                      {chatError && (
                        <p className="text-xs text-red-600">Error: {chatError}</p>
                      )}
                    </div>
                  </div>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleSendChat();
                    }}
                    className="sticky bottom-0 border-t border-[hsl(var(--border))] bg-white/90 px-6 py-4 backdrop-blur"
                  >
                    <div className="flex gap-3">
                      <input
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="Ask a question..."
                        className="flex-1 rounded-2xl border border-[hsl(var(--border))] bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                      />
                      <button
                        type="submit"
                        disabled={!input.trim()}
                        className="rounded-2xl bg-[hsl(var(--accent))] px-4 py-3 text-sm font-semibold text-[hsl(var(--accent-foreground))] shadow-md shadow-black/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            )}

            {activeTab === "dashboard" && (
              <section className="mt-8 rounded-3xl border border-[hsl(var(--border))] bg-white/90 p-6 shadow-lg shadow-black/5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Review Results
                </h3>
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  {visibleResults.length} row(s)
                </p>
              </div>

              {results.length === 0 ? (
                <p className="mt-6 text-sm text-[hsl(var(--muted-foreground))]">
                  Run a detection job to see results here.
                </p>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  {sequenceFilterId && (
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--soft-primary-border))] bg-[hsl(var(--soft-primary-bg))]/60 px-4 py-3 text-xs">
                      <div className="font-semibold">
                        Filtered by sequence{" "}
                        <span className="font-mono">{sequenceFilterId}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSequenceFilterId("")}
                        className="rounded-full bg-white/70 px-3 py-1 font-semibold text-[hsl(var(--foreground))] shadow-sm"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  <div className="mb-3 flex items-center justify-end gap-2 text-xs">
                    <label
                      htmlFor="result-sort"
                      className="font-semibold text-[hsl(var(--muted-foreground))]"
                    >
                      Sort
                    </label>
                    <select
                      id="result-sort"
                      value={resultSort}
                      onChange={(event) => setResultSort(event.target.value)}
                      className="rounded-xl border border-[hsl(var(--border))] bg-white px-2 py-1 text-xs"
                    >
                      <option value="default">Default</option>
                      <option value="beaver_desc">Beaver first</option>
                      <option value="beaver_asc">No beaver first</option>
                      <option value="animal_desc">Animal first</option>
                      <option value="animal_asc">No animal first</option>
                      <option value="flagged_desc">Flagged first</option>
                      <option value="confidence_desc">Confidence high to low</option>
                      <option value="confidence_asc">Confidence low to high</option>
                      <option value="file_asc">File A-Z</option>
                    </select>
                  </div>
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">
                        <th className="w-[35%] px-3 py-2 font-semibold">File</th>
                        <th className="w-[12%] px-2 py-2 font-semibold">Sequence</th>
                        <th className="w-[10%] px-2 py-2 font-semibold">Beaver Agent</th>
                        <th className="w-[10%] px-2 py-2 font-semibold">Animal Agent</th>
                        <th className="w-[12%] px-2 py-2 font-semibold">Review</th>
                        <th className="w-[7%] px-2 py-2 font-semibold">Confidence</th>
                        <th className="w-[10%] px-2 py-2 font-semibold">Common_Name</th>
                        <th className="w-[4%] px-2 py-2 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedVisibleResults.map((row) => {
                        const isExpanded = expandedRows.includes(row.id);
                        const seqId = sequenceData.rowIdToSequenceId.get(row.id) || "";
                        const seq = seqId ? sequenceData.sequencesById.get(seqId) : undefined;
                        return (
                          <Fragment key={row.id}>
                            <tr
                              className={`border-b border-[hsl(var(--border))] bg-white ${
                                sequenceFilterId && seqId === sequenceFilterId
                                  ? "bg-[hsl(var(--soft-primary-bg))]/40"
                                  : ""
                              }`}
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {(row.manual_review || row.agent_conflict || row.error) && (
                                    <span
                                      className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500"
                                      title="Flagged for review"
                                    />
                                  )}
                                  <div className="min-w-0 truncate font-semibold">
                                    {row.filename || imageNameFromPath(row.image_path) || "image"}
                                  </div>
                                </div>
                                <div
                                  className="max-w-[520px] truncate text-[10px] text-[hsl(var(--muted-foreground))]"
                                  title={row.image_path}
                                >
                                  {row.image_path}
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                {seq ? (
                                  <div className="flex flex-col gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setSequenceFilterId(seq.id)}
                                      className="w-fit rounded-full border border-[hsl(var(--border))] bg-white/70 px-2 py-1 text-[10px] font-semibold text-[hsl(var(--foreground))] shadow-sm hover:bg-white"
                                      title="Click to filter to this sequence"
                                    >
                                      {seq.size} shot(s) · {seq.presence}
                                    </button>
                                    <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                      {seq.species}
                                      {seq.flagManualReview ? " · review" : ""}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <span className="rounded-full border border-[hsl(var(--border))] bg-white px-2 py-1 text-[10px]">
                                  {row.beaver_agent_label}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  value={row.animal_agent_label}
                                  onChange={(event) =>
                                    handleUpdateAnimalAgent(row.id, event.target.value)
                                  }
                                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-white px-2 py-1 text-xs"
                                >
                                  {ANIMAL_AGENT_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  value={row.review_label}
                                  onChange={(event) =>
                                    handleUpdateReview(row.id, event.target.value)
                                  }
                                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-white px-2 py-1 text-xs"
                                >
                                  {REVIEW_LABELS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2 font-semibold">
                                {row.confidence || 0}
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  value={row.animal_type || (row.Common_Name === "NA" ? "No animal" : row.Common_Name || "unknown")}
                                  onChange={(event) =>
                                    handleUpdateSpecies(row.id, event.target.value)
                                  }
                                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-white px-2 py-1 text-xs"
                                >
                                  {ANIMAL_SPECIES_OPTIONS.map((species) => (
                                    <option key={species} value={species}>
                                      {species}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => toggleRow(row)}
                                  className="text-xs font-semibold text-[hsl(var(--accent))]"
                                >
                                  {isExpanded ? "Hide" : "Show"}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                                <td colSpan={8} className="px-3 py-3">
                                  <div className="grid gap-3 text-xs">
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                                        Image preview
                                      </p>
                                      {rowImageUrls[row.id] ? (
                                        <img
                                          src={rowImageUrls[row.id]}
                                          alt={row.filename || "preview"}
                                          className="mt-2 w-full max-w-4xl max-h-[32rem] rounded-xl border border-[hsl(var(--border))] bg-white object-contain"
                                        />
                                      ) : rowImageLoading[row.id] ? (
                                        <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                                          Loading image...
                                        </p>
                                      ) : (
                                        <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                                          {rowImageErrors[row.id] || "Image preview unavailable."}
                                        </p>
                                      )}
                                    </div>
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                                        Reviewer notes
                                      </p>
                                      <textarea
                                        value={row.notes}
                                        onChange={(event) =>
                                          handleUpdateNotes(row.id, event.target.value)
                                        }
                                        rows={2}
                                        className="mt-1 w-full rounded-xl border border-[hsl(var(--border))] bg-white px-3 py-2 text-xs"
                                        placeholder="Add review notes..."
                                      />
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <div className="flex justify-between">
                                        <span>Animal group</span>
                                        <span className="font-semibold">
                                          {row.animal_group || "unknown"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Overlay site</span>
                                        <span className="font-semibold">
                                          {row.overlay_location || "—"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>EXIF time</span>
                                        <span className="font-semibold">
                                          {row.exif_timestamp || "—"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Animal reason</span>
                                        <span className="font-semibold">
                                          {row.animal_reason || "—"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Overlay reason</span>
                                        <span className="font-semibold">
                                          {row.overlay_reason || "—"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Overlay temp</span>
                                        <span className="font-semibold">
                                          {row.overlay_temperature || "—"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Error</span>
                                        <span className="font-semibold">{row.error || "—"}</span>
                                      </div>
                                    </div>
                                    {row.reason && (
                                      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                        Beaver reason: {row.reason}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            )}
        </div>
      </main>
    </div>
  );
}

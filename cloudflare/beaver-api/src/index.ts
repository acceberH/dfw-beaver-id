interface Env {
  AI: {
    run(model: string, input: { image: ArrayBuffer }): Promise<unknown>;
  };
}

type Prediction = { label: string; score: number };
type Animal = { commonName: string; group: "mammal" | "bird" | "unknown" };

const MAX_CLASSIFY = 5;
const ANIMAL_THRESHOLD = 0.55;
const BEAVER_THRESHOLD = 0.65;

const ANIMAL_LABELS: Array<[RegExp, Animal]> = [
  [/\bbeaver\b/i, { commonName: "Beaver", group: "mammal" }],
  [/\b(nutria|coypu)\b/i, { commonName: "Nutria", group: "mammal" }],
  [/\braccoon\b/i, { commonName: "Raccoon", group: "mammal" }],
  [/\b(black bear|brown bear|grizzly)\b/i, { commonName: "Black bear", group: "mammal" }],
  [/\bweasel\b/i, { commonName: "Long-tailed weasel", group: "mammal" }],
  [/\bmink\b/i, { commonName: "Mink", group: "mammal" }],
  [/\botter\b/i, { commonName: "River otter", group: "mammal" }],
  [/\bskunk\b/i, { commonName: "Striped skunk", group: "mammal" }],
  [/\b(lynx|bobcat)\b/i, { commonName: "Bobcat", group: "mammal" }],
  [/\b(cougar|mountain lion|puma)\b/i, { commonName: "Mountain lion (Cougar)", group: "mammal" }],
  [/\bcoyote\b/i, { commonName: "Coyote", group: "mammal" }],
  [/\belk\b/i, { commonName: "Elk", group: "mammal" }],
  [/\b(deer|wapiti)\b/i, { commonName: "Mule and black-tailed deer", group: "mammal" }],
  [/\b(person|human|man|woman|boy|girl)\b/i, { commonName: "human", group: "unknown" }],
  [/\b(bird|owl|heron|pigeon|eagle|hawk|duck|goose|swan|woodpecker|finch)\b/i, { commonName: "other bird", group: "bird" }],
];

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: corsHeaders() });
}

function normalisePredictions(raw: unknown): Prediction[] {
  const values = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { results?: unknown[] }).results)
      ? (raw as { results: unknown[] }).results
      : [];

  return values
    .map((value) => {
      const item = value as { label?: unknown; score?: unknown };
      return {
        label: typeof item.label === "string" ? item.label : "",
        score: typeof item.score === "number" ? item.score : 0,
      };
    })
    .filter((item) => item.label && Number.isFinite(item.score))
    .sort((left, right) => right.score - left.score);
}

function animalFor(label: string): Animal | null {
  for (const [pattern, animal] of ANIMAL_LABELS) {
    if (pattern.test(label)) return animal;
  }
  return null;
}

async function classify(file: File, env: Env) {
  const predictions = normalisePredictions(
    await env.AI.run("@cf/microsoft/resnet-50", { image: await file.arrayBuffer() }),
  );
  const beaver = predictions.find((prediction) => /\bbeaver\b/i.test(prediction.label));
  const classified = predictions
    .map((prediction) => ({ prediction, animal: animalFor(prediction.label) }))
    .find(({ prediction, animal }) => animal && prediction.score >= ANIMAL_THRESHOLD);
  const animal = classified?.animal || null;
  const animalScore = classified?.prediction.score || 0;
  const isBeaver = Boolean(beaver && beaver.score >= BEAVER_THRESHOLD);
  const beaverReason = isBeaver
    ? `Cloudflare ResNet-50 classified this image as beaver (${beaver?.score.toFixed(2)}).`
    : beaver
      ? `Cloudflare ResNet-50 beaver score ${beaver.score.toFixed(2)} did not meet the high-precision threshold.`
      : "Cloudflare ResNet-50 found no beaver classification.";
  const animalReason = animal
    ? `Cloudflare ResNet-50 classified this image as ${animal.commonName} (${animalScore.toFixed(2)}).`
    : "Cloudflare ResNet-50 found no supported animal classification.";

  return {
    filename: file.name || "upload",
    is_beaver: isBeaver,
    has_beaver: isBeaver,
    beaver_confidence: isBeaver ? beaver?.score || 0 : 0,
    beaver_reason: beaverReason,
    confidence: isBeaver ? beaver?.score || 0 : 0,
    reason: beaverReason,
    has_animal: Boolean(animal),
    common_name: animal?.commonName || "No animal",
    animal_type: animal?.commonName || "No animal",
    animal_common_name: animal?.commonName || "No animal",
    group: animal?.group || "none",
    animal_group: animal?.group || "none",
    animal_confidence: animalScore,
    animal_reason: animalReason,
    animal_notes: animalReason,
    bbox: null,
    model_id: "@cf/microsoft/resnet-50",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "dfw-beaver-api", model: "@cf/microsoft/resnet-50" });
    }
    if (request.method === "POST" && url.pathname === "/api/classify") {
      const form = await request.formData();
      const files = [
        ...form.getAll("files"),
        ...form.getAll("file"),
      ].filter((value): value is File => value instanceof File);
      if (!files.length) return json({ error: "No files uploaded." }, 400);
      if (files.length > MAX_CLASSIFY) return json({ error: `Too many files. Max ${MAX_CLASSIFY}.` }, 400);
      return json({ results: await Promise.all(files.map((file) => classify(file, env))) });
    }
    if (request.method === "POST" && (url.pathname === "/api/jobs" || url.pathname === "/api/upload-url")) {
      return json({ error: "Batch upload and S3 paths are retained as AWS legacy features and are unavailable in the portable demo." }, 501);
    }
    if (request.method === "POST" && url.pathname === "/api/chat") {
      return json({ error: "Dataset chat is retained as an AWS legacy feature and is unavailable in the portable demo." }, 501);
    }
    return json({ error: "Not found." }, 404);
  },
} satisfies ExportedHandler<Env>;

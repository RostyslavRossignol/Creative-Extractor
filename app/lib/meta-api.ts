import type { CreativeFile, ParsedCsv } from "./mapper";

export type GraphVersion = "v25.0" | "v26.0";

export type MetaAdImage = {
  id?: string;
  account_id?: string;
  name?: string;
  hash: string;
  url?: string;
  url_128?: string;
  permalink_url?: string;
  original_width?: number;
  original_height?: number;
  created_time?: string;
  status?: string;
};

export type MetaImageMatch = {
  fileId: string;
  fileName: string;
  status: "matched" | "missing" | "ambiguous";
  image: MetaAdImage | null;
  candidates: MetaAdImage[];
  reason: string;
};

export type MetaApiLogEntry = {
  page: number;
  timestamp: string;
  durationMs: number;
  request: { method: "GET"; url: string };
  response: {
    status: number | null;
    statusText: string;
    ok: boolean;
    body: unknown;
  };
};

type GraphPage<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
};

function baseName(value: string): string {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* The API usually returns an already decoded name. */ }
  return decoded.replace(/\\/g, "/").split("/").pop()?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function normalizedFullName(value: string): string {
  return baseName(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function normalizedStem(value: string): string {
  return normalizedFullName(value).replace(/\.(?:jpe?g|png)$/i, "");
}

function withoutMetaUploadSuffix(value: string): string {
  return normalizedFullName(value).replace(/(\.(?:jpe?g|png))(?:[\s_-]*\(?\d+\)?)+$/i, "$1");
}

function comparableImageKey(value: string, stripMetaSuffix = false): string {
  const normalized = stripMetaSuffix ? withoutMetaUploadSuffix(value) : normalizedFullName(value);
  return normalized.replace(/\.jpeg$/i, ".jpg");
}

function graphErrorMessage(response: GraphPage<unknown>, status: number): string {
  const error = response.error;
  if (!error) return `Meta API вернул HTTP ${status}.`;
  const details = [error.code ? `код ${error.code}` : "", error.error_subcode ? `подкод ${error.error_subcode}` : ""].filter(Boolean).join(", ");
  return `${error.message || `Meta API вернул HTTP ${status}`}${details ? ` (${details})` : ""}`;
}

function withoutSecrets(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("access_token");
    parsed.searchParams.delete("appsecret_proof");
    return parsed.toString();
  } catch {
    return url.replace(/([?&](?:access_token|appsecret_proof)=)[^&]*/gi, "$1[REDACTED]");
  }
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/^(?:access_token|appsecret_proof|token)$/i.test(key)) return [key, "[REDACTED]"];
      return [key, redactSecrets(item)];
    }));
  }
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return withoutSecrets(value);
  return value;
}

export async function fetchAllAdImages({
  accountId,
  token,
  version = "v26.0",
  signal,
  onLog,
}: {
  accountId: string;
  token: string;
  version?: GraphVersion;
  signal?: AbortSignal;
  onLog?: (entry: MetaApiLogEntry) => void;
}): Promise<MetaAdImage[]> {
  const cleanAccountId = accountId.replace(/^act_/i, "").trim();
  if (!/^\d{8,25}$/.test(cleanAccountId)) throw new Error("Некорректный ID рекламного кабинета.");
  if (!token.trim()) throw new Error("Вставьте access token.");

  const fields = [
    "id", "account_id", "name", "hash", "url", "url_128", "permalink_url",
    "original_width", "original_height", "created_time", "status",
  ].join(",");
  let next: string | undefined = `https://graph.facebook.com/${version}/act_${cleanAccountId}/adimages?fields=${encodeURIComponent(fields)}&limit=500`;
  const images: MetaAdImage[] = [];
  const seenPages = new Set<string>();
  let page = 0;

  while (next) {
    page += 1;
    if (seenPages.has(next)) throw new Error("Meta API вернул зацикленную пагинацию.");
    seenPages.add(next);
    const requestUrl = withoutSecrets(next);
    const startedAt = performance.now();
    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: "no-store",
        signal,
      });
    } catch (reason) {
      onLog?.({
        page, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt),
        request: { method: "GET", url: requestUrl },
        response: { status: null, statusText: "NETWORK_ERROR", ok: false, body: { error: reason instanceof Error ? reason.message : String(reason) } },
      });
      throw reason;
    }
    let payload: GraphPage<MetaAdImage>;
    const rawText = await response.text();
    try {
      payload = JSON.parse(rawText) as GraphPage<MetaAdImage>;
    } catch {
      onLog?.({
        page, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt),
        request: { method: "GET", url: requestUrl },
        response: { status: response.status, statusText: response.statusText, ok: response.ok, body: { nonJsonBody: rawText } },
      });
      throw new Error(`Meta API вернул не-JSON ответ (HTTP ${response.status}).`);
    }
    onLog?.({
      page, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt),
      request: { method: "GET", url: requestUrl },
      response: { status: response.status, statusText: response.statusText, ok: response.ok, body: redactSecrets(payload) },
    });
    if (!response.ok || payload.error) throw new Error(graphErrorMessage(payload, response.status));
    for (const image of payload.data ?? []) {
      if (image.hash) images.push(image);
    }
    next = payload.paging?.next;
  }

  return images;
}

export function matchFilesToMetaImages(files: CreativeFile[], images: MetaAdImage[]): MetaImageMatch[] {
  const usableFiles = files.filter((file) => file.mediaType === "image");
  return usableFiles.map((file) => {
    const uniqueByHash = (items: MetaAdImage[]) => [...new Map(items.map((image) => [image.hash, image])).values()];
    const exact = uniqueByHash(images.filter((image) => image.name && normalizedFullName(image.name) === normalizedFullName(file.name)));
    const sameStem = exact.length ? [] : uniqueByHash(images.filter((image) => image.name && normalizedStem(image.name) === normalizedStem(file.name)));
    const metaSuffix = exact.length || sameStem.length ? [] : uniqueByHash(images.filter((image) => image.name && comparableImageKey(image.name, true) === comparableImageKey(file.name, true)));
    const candidates = exact.length ? exact : sameStem.length ? sameStem : metaSuffix;
    if (candidates.length === 1) {
      const reason = exact.length
        ? "Точное совпадение имени"
        : sameStem.length
          ? "Совпало имя без расширения"
          : "Совпало после удаления служебного числового суффикса Meta";
      return { fileId: file.id, fileName: file.name, status: "matched", image: candidates[0], candidates, reason };
    }
    if (candidates.length > 1) {
      return { fileId: file.id, fileName: file.name, status: "ambiguous", image: null, candidates, reason: `В Meta найдено несколько изображений с этим именем (${candidates.length})` };
    }
    return { fileId: file.id, fileName: file.name, status: "missing", image: null, candidates: [], reason: "Такое имя не найдено в медиатеке Meta" };
  });
}

function normalizeHeader(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function inferAdAccountIds(csv: ParsedCsv, sourceColumn: string): string[] {
  const ids = new Set<string>();
  const explicitIndex = csv.headers.findIndex((header) => ["adaccountid", "accountid"].includes(normalizeHeader(header)));
  if (explicitIndex >= 0) {
    for (const row of csv.rows) {
      const match = String(row[explicitIndex] ?? "").match(/(?:act_)?(\d{8,25})/i);
      if (match) ids.add(match[1]);
    }
  }
  if (!ids.size && sourceColumn) {
    const sourceIndex = csv.headers.indexOf(sourceColumn);
    if (sourceIndex >= 0) {
      for (const row of csv.rows) {
        const name = String(row[sourceIndex] ?? "").trim();
        const match = name.match(/(?:^|[_\s-])(\d{10,25})$/);
        if (match) ids.add(match[1]);
      }
    }
  }
  return [...ids];
}

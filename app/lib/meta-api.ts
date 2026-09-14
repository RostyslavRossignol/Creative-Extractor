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
  request: { method: "GET" | "POST"; url: string; fileName?: string; size?: number };
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

type GraphImageUploadResponse = {
  images?: Record<string, MetaAdImage>;
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
};

export type MetaAdAccountAccess = {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  business?: { id?: string; name?: string };
};

export type MetaAdAccount = MetaAdAccountAccess & {
  disable_reason?: number;
  currency?: string;
  timezone_name?: string;
  business?: { id?: string; name?: string };
};

export type MetaPixel = {
  id: string;
  name?: string;
  last_fired_time?: string;
};

export type MetaPage = {
  id: string;
  name?: string;
  picture?: { data?: { url?: string; width?: number; height?: number; is_silhouette?: boolean } };
};

export type MetaAccountDiscovery = {
  accounts: MetaAdAccount[];
  unavailable: number;
};

export async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  if (!items.length) return;
  const concurrency = Math.max(1, Math.min(Math.floor(limit), items.length));
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
}

export function isMetaAdAccountActive(account: MetaAdAccount): boolean {
  return Number(account.account_status) === 1 && (!account.disable_reason || Number(account.disable_reason) === 0);
}

export function metaAdAccountStatusLabel(account: MetaAdAccount): string {
  if (isMetaAdAccountActive(account)) return "Активен";
  const status = Number(account.account_status);
  if (status === 2) return "Отключён Meta";
  if (status === 3) return "Есть задолженность";
  if (status === 7) return "На проверке риска";
  if (status === 8) return "Ожидает оплаты";
  if (status === 9) return "Льготный период";
  if (status === 100) return "Ожидает закрытия";
  if (status === 101) return "Закрыт";
  return `Недоступен · статус ${Number.isFinite(status) ? status : "неизвестен"}`;
}

type GraphAdAccountResponse = Partial<MetaAdAccountAccess> & {
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

function graphErrorMessage(response: GraphPage<unknown>, status: number, accountId?: string): string {
  const error = response.error;
  if (!error) return `Meta API вернул HTTP ${status}.`;
  const formattedAccount = accountId ? `act_${accountId.replace(/^act_/i, "")}` : "указанному рекламному кабинету";
  if (error.code === 100 && error.error_subcode === 33) {
    return `Токен не имеет доступа к рекламному кабинету ${formattedAccount} либо указан неверный ID. Проверьте ID кабинета и назначьте этот рекламный кабинет системному пользователю с правом управления. Одного разрешения ads_management в токене недостаточно.`;
  }
  if (error.code === 190) {
    return "Access token недействителен или истёк. Создайте новый токен системного пользователя и повторите проверку.";
  }
  if (error.code === 10 || error.code === 200) {
    return `Недостаточно разрешений для работы с ${formattedAccount}. Для прямой загрузки нужен ads_management, а системному пользователю должно быть выдано право управления этим кабинетом.`;
  }
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

function validateCredentials(accountId: string, token: string): string {
  const cleanAccountId = accountId.replace(/^act_/i, "").trim();
  if (!/^\d{8,25}$/.test(cleanAccountId)) throw new Error("Некорректный ID рекламного кабинета.");
  if (!token.trim()) throw new Error("Вставьте access token.");
  return cleanAccountId;
}

export function extractAdAccountId(value: string): string {
  const input = value.trim();
  if (!input) return "";
  const actQuery = input.match(/[?&#]act=(\d{8,25})(?:[&#]|$)/i);
  if (actQuery) return actQuery[1];
  const actPrefix = input.match(/(?:^|[^a-z0-9])act_(\d{8,25})(?:[^\d]|$)/i);
  if (actPrefix) return actPrefix[1];
  return /^\d{0,25}$/.test(input) ? input : "";
}

export async function verifyAdAccountAccess({
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
}): Promise<MetaAdAccountAccess> {
  const cleanAccountId = validateCredentials(accountId, token);
  const requestUrl = `https://graph.facebook.com/${version}/act_${cleanAccountId}?fields=${encodeURIComponent("id,account_id,name,account_status,business{id,name}")}`;
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
      page: 0, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt),
      request: { method: "GET", url: requestUrl },
      response: { status: null, statusText: "NETWORK_ERROR", ok: false, body: { error: reason instanceof Error ? reason.message : String(reason) } },
    });
    throw reason;
  }

  const rawText = await response.text();
  let payload: GraphAdAccountResponse;
  try {
    payload = JSON.parse(rawText) as GraphAdAccountResponse;
  } catch {
    onLog?.({
      page: 0, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt),
      request: { method: "GET", url: requestUrl },
      response: { status: response.status, statusText: response.statusText, ok: response.ok, body: { nonJsonBody: rawText } },
    });
    throw new Error(`Meta API вернул не-JSON ответ при проверке кабинета (HTTP ${response.status}).`);
  }

  onLog?.({
    page: 0, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt),
    request: { method: "GET", url: requestUrl },
    response: { status: response.status, statusText: response.statusText, ok: response.ok, body: redactSecrets(payload) },
  });
  if (!response.ok || payload.error) throw new Error(graphErrorMessage(payload, response.status, cleanAccountId));
  if (!payload.id) throw new Error(`Meta API не подтвердил доступ к кабинету act_${cleanAccountId}.`);
  return payload as MetaAdAccountAccess;
}

async function fetchGraphCollection<T>({
  url,
  token,
  accountId,
  signal,
  onLog,
}: {
  url: string;
  token: string;
  accountId?: string;
  signal?: AbortSignal;
  onLog?: (entry: MetaApiLogEntry) => void;
}): Promise<T[]> {
  if (!token.trim()) throw new Error("Вставьте access token.");
  let next: string | undefined = url;
  const result: T[] = [];
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
    const rawText = await response.text();
    let payload: GraphPage<T>;
    try {
      payload = JSON.parse(rawText) as GraphPage<T>;
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
    if (!response.ok || payload.error) throw new Error(graphErrorMessage(payload, response.status, accountId));
    result.push(...(payload.data ?? []));
    next = payload.paging?.next;
  }
  return result;
}

export async function fetchAccessibleAdAccounts({
  token,
  version = "v26.0",
  signal,
  onLog,
}: {
  token: string;
  version?: GraphVersion;
  signal?: AbortSignal;
  onLog?: (entry: MetaApiLogEntry) => void;
}): Promise<MetaAccountDiscovery> {
  const fields = "id,account_id,name,account_status,disable_reason,currency,timezone_name,business{id,name}";
  const accounts = await fetchGraphCollection<MetaAdAccount>({
    url: `https://graph.facebook.com/${version}/me/adaccounts?fields=${encodeURIComponent(fields)}&limit=500`,
    token, signal, onLog,
  });
  const sorted = accounts.sort((a, b) => {
    const availability = Number(isMetaAdAccountActive(b)) - Number(isMetaAdAccountActive(a));
    return availability || (a.name || a.account_id || a.id).localeCompare(b.name || b.account_id || b.id, undefined, { numeric: true });
  });
  return { accounts: sorted, unavailable: sorted.filter((account) => !isMetaAdAccountActive(account)).length };
}

export async function fetchAdAccountPixels({
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
}): Promise<MetaPixel[]> {
  const cleanAccountId = validateCredentials(accountId, token);
  return fetchGraphCollection<MetaPixel>({
    url: `https://graph.facebook.com/${version}/act_${cleanAccountId}/adspixels?fields=id,name,last_fired_time&limit=500`,
    token, accountId: cleanAccountId, signal, onLog,
  });
}

export async function fetchAdAccountPages({
  accountId,
  businessId,
  token,
  version = "v26.0",
  signal,
  onLog,
}: {
  accountId: string;
  businessId?: string;
  token: string;
  version?: GraphVersion;
  signal?: AbortSignal;
  onLog?: (entry: MetaApiLogEntry) => void;
}): Promise<MetaPage[]> {
  const cleanAccountId = validateCredentials(accountId, token);
  const fields = "id,name,picture.width(96).height(96){url,width,height,is_silhouette}";
  const urls = [
    `https://graph.facebook.com/${version}/act_${cleanAccountId}/promote_pages?fields=${encodeURIComponent(fields)}&limit=500`,
    `https://graph.facebook.com/${version}/me/accounts?fields=${encodeURIComponent(fields)}&limit=500`,
  ];
  if (businessId && /^\d+$/.test(businessId)) {
    urls.push(
      `https://graph.facebook.com/${version}/${businessId}/owned_pages?fields=${encodeURIComponent(fields)}&limit=500`,
      `https://graph.facebook.com/${version}/${businessId}/client_pages?fields=${encodeURIComponent(fields)}&limit=500`,
    );
  }
  const results = await Promise.allSettled(urls.map((url) => fetchGraphCollection<MetaPage>({
    url, token, accountId: cleanAccountId, signal, onLog,
  })));
  const successful = results.filter((result): result is PromiseFulfilledResult<MetaPage[]> => result.status === "fulfilled");
  if (!successful.length) {
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw failed?.reason instanceof Error ? failed.reason : new Error("Meta API не вернул доступные Facebook Pages.");
  }
  const pages = new Map<string, MetaPage>();
  successful.flatMap((result) => result.value).forEach((page) => {
    const current = pages.get(page.id);
    pages.set(page.id, current?.picture?.data?.url ? current : page);
  });
  return [...pages.values()];
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
  const cleanAccountId = validateCredentials(accountId, token);

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
    if (!response.ok || payload.error) throw new Error(graphErrorMessage(payload, response.status, cleanAccountId));
    for (const image of payload.data ?? []) {
      if (image.hash) images.push(image);
    }
    next = payload.paging?.next;
  }

  return images;
}

export async function uploadAdImage({
  accountId,
  token,
  file,
  version = "v26.0",
  signal,
  onLog,
  requestNumber = 1,
}: {
  accountId: string;
  token: string;
  file: File;
  version?: GraphVersion;
  signal?: AbortSignal;
  onLog?: (entry: MetaApiLogEntry) => void;
  requestNumber?: number;
}): Promise<MetaAdImage> {
  const cleanAccountId = validateCredentials(accountId, token);
  if (!/^image\/(?:jpeg|png)$/i.test(file.type)) throw new Error(`Файл ${file.name} не является JPG или PNG.`);

  const requestUrl = `https://graph.facebook.com/${version}/act_${cleanAccountId}/adimages`;
  const form = new FormData();
  form.append("filename", file, file.name);
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.trim()}` },
      body: form,
      cache: "no-store",
      signal,
    });
  } catch (reason) {
    onLog?.({
      page: requestNumber, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt),
      request: { method: "POST", url: requestUrl, fileName: file.name, size: file.size },
      response: { status: null, statusText: "NETWORK_ERROR", ok: false, body: { error: reason instanceof Error ? reason.message : String(reason) } },
    });
    throw reason;
  }

  const rawText = await response.text();
  let payload: GraphImageUploadResponse;
  try {
    payload = JSON.parse(rawText) as GraphImageUploadResponse;
  } catch {
    onLog?.({
      page: requestNumber, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt),
      request: { method: "POST", url: requestUrl, fileName: file.name, size: file.size },
      response: { status: response.status, statusText: response.statusText, ok: response.ok, body: { nonJsonBody: rawText } },
    });
    throw new Error(`Meta API вернул не-JSON ответ при загрузке ${file.name} (HTTP ${response.status}).`);
  }

  onLog?.({
    page: requestNumber, timestamp: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt),
    request: { method: "POST", url: requestUrl, fileName: file.name, size: file.size },
    response: { status: response.status, statusText: response.statusText, ok: response.ok, body: redactSecrets(payload) },
  });
  if (!response.ok || payload.error) throw new Error(graphErrorMessage(payload, response.status, cleanAccountId));

  const uploaded = Object.values(payload.images ?? {}).find((image) => Boolean(image?.hash));
  if (!uploaded) throw new Error(`Meta API не вернул Image Hash для ${file.name}.`);
  return { ...uploaded, name: uploaded.name || file.name };
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

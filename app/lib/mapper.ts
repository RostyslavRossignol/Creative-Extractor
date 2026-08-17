import Papa from "papaparse";

export type MediaType = "image" | "video";
export type EncodingMode = "auto" | "utf-8" | "utf-16le" | "windows-1251";
export type LanguageDefinition = { code: string; label: string; aliases: string[] };
export type NameAnalysis = {
  languageCode: string | null;
  languageLabel: string | null;
  variant: number | null;
  matchedAlias: string | null;
  ambiguousLanguages: string[];
};
export type CreativeFile = NameAnalysis & {
  id: string;
  path: string;
  name: string;
  extension: string;
  mediaType: MediaType;
  size: number;
};
export type ParsedCsv = {
  fileName: string;
  headers: string[];
  rows: string[][];
  delimiter: string;
  linebreak: string;
  hadBom: boolean;
  encoding: Exclude<EncodingMode, "auto">;
  warnings: string[];
};
export type CleanupReport = {
  cleanedCells: number;
  cleanedColumns: string[];
  alreadyEmptyColumns: string[];
  missingColumns: string[];
};
export type NamingScope = "campaign" | "adSet" | "ad";
export type NamingReplacementReport = {
  totalReplacements: number;
  changedCells: number;
  changedRows: number;
  byColumn: Record<string, number>;
};
export type ColumnSelection = { source: string; imageFile: string; videoFile: string; imageHash: string };
export type MappingOptions = {
  sequentialFallback: boolean;
  clearImageHash: boolean;
  clearOtherMedia: boolean;
  overwriteExisting: boolean;
};
export type MappingStatus = "ready" | "manual" | "missing" | "ambiguous" | "no-language" | "existing" | "skipped";
export type RowMapping = {
  rowIndex: number;
  sheetRow: number;
  sourceName: string;
  analysis: NameAnalysis;
  file: CreativeFile | null;
  candidates: CreativeFile[];
  status: MappingStatus;
  reason: string;
};

export const META_CLEANUP_COLUMNS = [
  "Campaign ID",
  "Campaign Start Time",
  "Ad Set ID",
  "Ad Set Time Start",
  "Link Object ID",
  "Optimized Conversion Tracking Pixels",
  "Link",
  "Ad ID",
  "Preview Link",
  "Instagram Preview Link",
  "Conversion Tracking Pixels",
  "Image Hash",
  "Image File Name",
  "Instagram Account ID",
  "Permalink",
] as const;

export const NAMING_COLUMNS: Record<NamingScope, string> = {
  campaign: "Campaign Name",
  adSet: "Ad Set Name",
  ad: "Ad Name",
};

export const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  { code: "PT-BR", label: "Португальский (Бразилия)", aliases: ["brazilian portuguese", "brazilianportuguese", "brazil portuguese", "portuguese brazil", "portuguese br", "portuguesebrazil", "portuguesebr", "portuguese brazilian", "portugues brasileiro", "бразильский португальский", "бразильська португальська", "португальский бразилия", "португальська бразилія", "pt br", "ptbr", "br"] },
  { code: "EN", label: "Английский", aliases: ["english", "английский", "англійська", "английская", "en", "eng"] },
  { code: "DE", label: "Немецкий", aliases: ["german", "deutsch", "немецкий", "німецька", "немецкая", "de", "deu", "ger"] },
  { code: "NL", label: "Нидерландский", aliases: ["dutch", "nederlands", "нидерландский", "голландский", "нідерландська", "nl", "nld", "dut"] },
  { code: "IT", label: "Итальянский", aliases: ["italian", "italiano", "итальянский", "итальянская", "італійська", "it", "ita"] },
  { code: "ES", label: "Испанский", aliases: ["spanish", "espanol", "испанский", "испанская", "іспанська", "es", "spa", "sp"] },
  { code: "FR", label: "Французский", aliases: ["french", "francais", "французский", "французская", "французька", "fr", "fra", "fre"] },
  { code: "SV", label: "Шведский", aliases: ["swedish", "svenska", "шведский", "шведская", "шведська", "sv", "swe", "se"] },
  { code: "SK", label: "Словацкий", aliases: ["slovak", "slovencina", "словацкий", "словацкая", "словацька", "sk", "slk", "slo"] },
  { code: "SL", label: "Словенский", aliases: ["slovenian", "slovene", "slovenscina", "словенский", "словенская", "словенська", "sl", "si", "slv"] },
  { code: "CS", label: "Чешский", aliases: ["czech", "cestina", "чешский", "чешская", "чеська", "cz", "cs", "ces", "cze"] },
  { code: "PL", label: "Польский", aliases: ["polish", "polski", "польский", "польская", "польська", "pl", "pol"] },
  { code: "HU", label: "Венгерский", aliases: ["hungarian", "magyar", "венгерский", "венгерская", "угорська", "hu", "hun"] },
  { code: "DA", label: "Датский", aliases: ["danish", "dansk", "датский", "датская", "данська", "da", "dk", "dan"] },
  { code: "PT", label: "Португальский", aliases: ["portuguese", "portugues", "португальский", "португальская", "португальська", "pt pt", "ptpt", "pt", "por"] },
  { code: "RO", label: "Румынский", aliases: ["romanian", "romana", "румынский", "румынская", "румунська", "ro", "ron", "rum"] },
  { code: "NO", label: "Норвежский", aliases: ["norwegian", "norsk", "норвежский", "норвежская", "норвезька", "no", "nb", "nn", "nor"] },
  { code: "HR", label: "Хорватский", aliases: ["croatian", "hrvatski", "хорватский", "хорватская", "хорватська", "hr", "hrv"] },
  { code: "FI", label: "Финский", aliases: ["finnish", "suomi", "финский", "финская", "фінська", "fi", "fin"] },
  { code: "MK", label: "Македонский", aliases: ["macedonian", "македонский", "македонская", "македонська", "mk", "mkd", "mac"] },
  { code: "SQ", label: "Албанский", aliases: ["albanian", "shqip", "албанский", "албанская", "албанська", "sq", "al", "sqi", "alb"] },
  { code: "CNR", label: "Черногорский", aliases: ["montenegrin", "crnogorski", "черногорский", "черногорская", "чорногорська", "cnr", "me"] },
  { code: "BG", label: "Болгарский", aliases: ["bulgarian", "български", "болгарский", "болгарская", "болгарська", "bg", "bgr"] },
  { code: "SR", label: "Сербский", aliases: ["serbian", "srpski", "српски", "сербский", "сербская", "сербська", "sr", "srb"] },
  { code: "BS", label: "Боснийский", aliases: ["bosnian", "bosanski", "боснийский", "боснийская", "боснійська", "bs", "bos"] },
  { code: "EL", label: "Греческий", aliases: ["greek", "ellinika", "ελληνικά", "греческий", "греческая", "грецька", "el", "gr", "ell", "gre"] },
  { code: "TR", label: "Турецкий", aliases: ["turkish", "turkce", "türkçe", "турецкий", "турецкая", "турецька", "tr", "tur"] },
  { code: "ET", label: "Эстонский", aliases: ["estonian", "eesti", "эстонский", "эстонская", "естонська", "et", "est"] },
  { code: "LV", label: "Латышский", aliases: ["latvian", "latviesu", "latviešu", "латышский", "латышская", "латвійська", "lv", "lav"] },
  { code: "LT", label: "Литовский", aliases: ["lithuanian", "lietuviu", "lietuvių", "литовский", "литовская", "литовська", "lt", "lit"] },
  { code: "RU", label: "Русский", aliases: ["russian", "русский", "русская", "російська", "ru", "rus"] },
  { code: "UK", label: "Украинский", aliases: ["ukrainian", "украинский", "украинская", "українська", "ua", "uk", "ukr"] },
];

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v"]);

export function normalizeForTokens(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function tokenize(value: string): string[] {
  const normalized = normalizeForTokens(value);
  return normalized ? normalized.split(/\s+/) : [];
}
function findSubsequence(tokens: string[], aliasTokens: string[]): number {
  if (!aliasTokens.length || aliasTokens.length > tokens.length) return -1;
  for (let index = 0; index <= tokens.length - aliasTokens.length; index += 1) {
    if (aliasTokens.every((token, offset) => tokens[index + offset] === token)) return index;
  }
  return -1;
}
function numberFromToken(token: string | undefined): number | null {
  if (!token) return null;
  const direct = token.match(/^0*(\d{1,3})$/);
  const prefixed = token.match(/^(?:v|ver|variant|creative|creo|cr|ad)0*(\d{1,3})$/);
  const match = direct ?? prefixed;
  if (!match) return null;
  const number = Number(match[1]);
  return number > 0 && number <= 999 ? number : null;
}

export function analyzeName(value: string): NameAnalysis {
  const tokens = tokenize(value.replace(/\.[^.]+$/, ""));
  const matches: Array<{ definition: LanguageDefinition; alias: string; start: number; length: number }> = [];
  for (const definition of LANGUAGE_DEFINITIONS) {
    for (const alias of definition.aliases) {
      const aliasTokens = tokenize(alias);
      const start = findSubsequence(tokens, aliasTokens);
      if (start >= 0) matches.push({ definition, alias, start, length: aliasTokens.length });
    }
  }
  matches.sort((a, b) => b.length - a.length || a.start - b.start);
  const mostSpecific = matches[0] ?? null;
  const filteredMatches = mostSpecific?.definition.code === "PT-BR" ? matches.filter((match) => match.definition.code !== "PT") : matches;
  const distinctCodes = [...new Set(filteredMatches.map((match) => match.definition.code))];
  const selected = distinctCodes.length === 1 ? filteredMatches[0] : null;
  let variant: number | null = null;
  if (selected) {
    const afterStart = selected.start + selected.length;
    for (let offset = 0; offset < 3; offset += 1) {
      variant = numberFromToken(tokens[afterStart + offset]);
      if (variant !== null) break;
    }
    if (variant === null) variant = numberFromToken(tokens[selected.start - 1]);
  }
  return {
    languageCode: selected?.definition.code ?? null,
    languageLabel: selected?.definition.label ?? null,
    variant,
    matchedAlias: selected?.alias ?? null,
    ambiguousLanguages: distinctCodes.length > 1 ? distinctCodes : [],
  };
}

export function classifyMediaFile(name: string): MediaType | null {
  const extension = name.split(".").pop()?.toLocaleLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return null;
}
export function createCreativeFile(path: string, size: number): CreativeFile | null {
  const name = path.split("/").pop() ?? path;
  if (!name || name.startsWith(".") || path.includes("__MACOSX")) return null;
  const mediaType = classifyMediaFile(name);
  if (!mediaType) return null;
  return { id: path, path, name, extension: name.split(".").pop()?.toLocaleLowerCase() ?? "", mediaType, size, ...analyzeName(name) };
}

function normalizeHeader(value: string): string { return normalizeForTokens(value).replace(/\s+/g, ""); }
export function detectColumns(headers: string[]): ColumnSelection {
  const match = (...aliases: string[]) => headers.find((header) => aliases.includes(normalizeHeader(header))) ?? "";
  return {
    source: match("adname", "advertisementname", "creativeadname"),
    imageFile: match("imagefilename", "imagefile", "image"),
    videoFile: match("videofilename", "videofile"),
    imageHash: match("imagehash"),
  };
}

function decodeBuffer(buffer: ArrayBuffer, mode: EncodingMode): { text: string; encoding: Exclude<EncodingMode, "auto">; hadBom: boolean } {
  const bytes = new Uint8Array(buffer);
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const hasUtf16LeBom = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  if (mode === "utf-16le") {
    return { text: new TextDecoder("utf-16le").decode(hasUtf16LeBom ? bytes.slice(2) : bytes), encoding: mode, hadBom: hasUtf16LeBom };
  }
  if (mode !== "auto") {
    return { text: new TextDecoder(mode).decode(hasUtf8Bom ? bytes.slice(3) : bytes), encoding: mode, hadBom: hasUtf8Bom };
  }
  if (hasUtf16LeBom) return { text: new TextDecoder("utf-16le").decode(bytes.slice(2)), encoding: "utf-16le", hadBom: true };
  const payload = hasUtf8Bom ? bytes.slice(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(payload), encoding: "utf-8", hadBom: hasUtf8Bom };
  } catch {
    return { text: new TextDecoder("windows-1251").decode(payload), encoding: "windows-1251", hadBom: hasUtf8Bom };
  }
}

export async function parseCsvFile(file: File, mode: EncodingMode = "auto"): Promise<ParsedCsv> {
  const decoded = decodeBuffer(await file.arrayBuffer(), mode);
  const linebreak = decoded.text.includes("\r\n") ? "\r\n" : "\n";
  const result = Papa.parse<string[]>(decoded.text, { header: false, dynamicTyping: false, skipEmptyLines: false });
  if (!result.data.length || !result.data[0]?.length) throw new Error("CSV пустой или не содержит заголовков.");
  const headers = result.data[0].map((value) => String(value ?? "").trim());
  if (headers.every((header) => !header)) throw new Error("В первой строке CSV не найдены заголовки колонок.");
  const duplicates = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicates.length) throw new Error(`В CSV повторяются заголовки: ${[...new Set(duplicates)].join(", ")}`);
  const rows = result.data.slice(1).map((row) => headers.map((_, index) => String(row[index] ?? "")));
  while (rows.length && rows[rows.length - 1].every((cell) => !cell)) rows.pop();
  const warnings = result.errors.filter((error) => error.code !== "TooFewFields").map((error) => `Строка ${(error.row ?? 0) + 1}: ${error.message}`);
  return { fileName: file.name, headers, rows, delimiter: result.meta.delimiter || ",", linebreak, hadBom: decoded.hadBom, encoding: decoded.encoding, warnings };
}

export function cleanMetaExport(csv: ParsedCsv): { csv: ParsedCsv; report: CleanupReport } {
  const rows = csv.rows.map((row) => [...row]);
  const cleanedColumns: string[] = [];
  const alreadyEmptyColumns: string[] = [];
  const missingColumns: string[] = [];
  let cleanedCells = 0;

  for (const column of META_CLEANUP_COLUMNS) {
    const index = csv.headers.indexOf(column);
    if (index < 0) {
      missingColumns.push(column);
      continue;
    }
    let columnChanges = 0;
    for (const row of rows) {
      if (!row[index]) continue;
      row[index] = "";
      columnChanges += 1;
    }
    cleanedCells += columnChanges;
    if (columnChanges) cleanedColumns.push(column);
    else alreadyEmptyColumns.push(column);
  }

  return {
    csv: { ...csv, rows, delimiter: ",", linebreak: "\r\n", hadBom: true, encoding: "utf-8" },
    report: { cleanedCells, cleanedColumns, alreadyEmptyColumns, missingColumns },
  };
}

function replaceLiteral(value: string, search: string, replacement: string, caseSensitive: boolean): { value: string; count: number } {
  if (!search) return { value, count: 0 };
  if (caseSensitive) {
    const parts = value.split(search);
    return { value: parts.join(replacement), count: parts.length - 1 };
  }
  const comparableValue = value.toLocaleLowerCase();
  const comparableSearch = search.toLocaleLowerCase();
  let result = "";
  let cursor = 0;
  let count = 0;
  while (cursor < value.length) {
    const index = comparableValue.indexOf(comparableSearch, cursor);
    if (index < 0) break;
    result += value.slice(cursor, index) + replacement;
    cursor = index + search.length;
    count += 1;
  }
  if (!count) return { value, count: 0 };
  return { value: result + value.slice(cursor), count };
}

export function replaceInNamingColumns(csv: ParsedCsv, search: string, replacement: string, scopes: NamingScope[], caseSensitive = false): { csv: ParsedCsv; report: NamingReplacementReport } {
  if (!search) return { csv, report: { totalReplacements: 0, changedCells: 0, changedRows: 0, byColumn: {} } };
  const selectedColumns = scopes.flatMap((scope) => {
    const header = NAMING_COLUMNS[scope];
    const index = csv.headers.findIndex((candidate) => normalizeHeader(candidate) === normalizeHeader(header));
    return index >= 0 ? [{ header: csv.headers[index], index }] : [];
  });
  const rows = csv.rows.map((row) => [...row]);
  const changedRows = new Set<number>();
  const byColumn: Record<string, number> = {};
  let totalReplacements = 0;
  let changedCells = 0;

  rows.forEach((row, rowIndex) => {
    for (const column of selectedColumns) {
      const result = replaceLiteral(String(row[column.index] ?? ""), search, replacement, caseSensitive);
      if (!result.count) continue;
      row[column.index] = result.value;
      totalReplacements += result.count;
      changedCells += 1;
      changedRows.add(rowIndex);
      byColumn[column.header] = (byColumn[column.header] ?? 0) + result.count;
    }
  });

  return { csv: { ...csv, rows }, report: { totalReplacements, changedCells, changedRows: changedRows.size, byColumn } };
}

function cell(row: string[], headers: string[], column: string): string {
  if (!column) return "";
  const index = headers.indexOf(column);
  return index >= 0 ? String(row[index] ?? "") : "";
}

export function buildMappings(csv: ParsedCsv, creatives: CreativeFile[], columns: ColumnSelection, options: MappingOptions, manualOverrides: Record<number, string> = {}): RowMapping[] {
  const mappings: RowMapping[] = csv.rows.map((row, rowIndex) => {
    const sourceName = cell(row, csv.headers, columns.source).trim();
    const analysis = analyzeName(sourceName);
    if (!sourceName) return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: null, candidates: [], status: "skipped", reason: "Пустое название объявления" };
    const manualFile = creatives.find((file) => file.id === manualOverrides[rowIndex]);
    if (manualFile) return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: manualFile, candidates: [manualFile], status: "manual", reason: "Файл выбран вручную" };
    const existingImage = cell(row, csv.headers, columns.imageFile).trim();
    const existingVideo = cell(row, csv.headers, columns.videoFile).trim();
    if (!options.overwriteExisting && (existingImage || existingVideo)) return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: null, candidates: [], status: "existing", reason: "В строке уже указан файл" };
    if (analysis.ambiguousLanguages.length) return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: null, candidates: [], status: "ambiguous", reason: `Найдено несколько языков: ${analysis.ambiguousLanguages.join(", ")}` };
    if (!analysis.languageCode) return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: null, candidates: [], status: "no-language", reason: "Язык не распознан" };
    const sameLanguage = creatives.filter((file) => file.languageCode === analysis.languageCode);
    let candidates = sameLanguage;
    if (analysis.variant !== null) candidates = sameLanguage.filter((file) => file.variant === analysis.variant);
    if (candidates.length === 1) {
      const file = candidates[0];
      const targetExists = file.mediaType === "image" ? Boolean(columns.imageFile) : Boolean(columns.videoFile);
      if (!targetExists) return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: null, candidates, status: "missing", reason: file.mediaType === "image" ? "Не выбрана колонка Image File Name" : "Не выбрана колонка Video File Name" };
      return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file, candidates, status: "ready", reason: "Язык и вариант совпали" };
    }
    return {
      rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: null, candidates,
      status: candidates.length ? "ambiguous" : "missing",
      reason: candidates.length ? `Подходят несколько файлов (${candidates.length})` : analysis.variant !== null ? `Нет файла для ${analysis.languageCode}:${analysis.variant}` : `Нет однозначного файла для ${analysis.languageCode}`,
    };
  });
  const byLanguage = new Map<string, RowMapping[]>();
  for (const mapping of mappings) {
    if (mapping.analysis.languageCode && (mapping.status === "ambiguous" || mapping.status === "missing")) {
      const list = byLanguage.get(mapping.analysis.languageCode) ?? [];
      list.push(mapping);
      byLanguage.set(mapping.analysis.languageCode, list);
    }
  }
  for (const [language, rows] of byLanguage) {
    const alreadyAssigned = new Set(mappings.filter((mapping) => mapping.file && mapping.analysis.languageCode === language).map((mapping) => mapping.file!.id));
    const files = creatives
      .filter((file) => file.languageCode === language && !alreadyAssigned.has(file.id))
      .sort((a, b) => (a.variant ?? Number.MAX_SAFE_INTEGER) - (b.variant ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    // First resolve only mathematically safe one-to-one leftovers. This is always
    // enabled: a missing variant number must not force manual work when one row
    // and one compatible file are the only possible pair for that language.
    const safeRows = [...rows];
    const safeFiles = [...files];
    let foundSafePair = true;
    while (foundSafePair) {
      foundSafePair = false;
      for (const mapping of [...safeRows]) {
        const compatible = safeFiles.filter((file) => mapping.analysis.variant === null || file.variant === null || mapping.analysis.variant === file.variant);
        if (compatible.length !== 1) continue;
        const file = compatible[0];
        const compatibleRows = safeRows.filter((row) => row.analysis.variant === null || file.variant === null || row.analysis.variant === file.variant);
        if (compatibleRows.length !== 1) continue;
        const targetExists = file.mediaType === "image" ? Boolean(columns.imageFile) : Boolean(columns.videoFile);
        if (!targetExists) continue;
        mapping.file = file;
        mapping.candidates = [file];
        mapping.status = "ready";
        mapping.reason = "Однозначно назначен единственный оставшийся файл языка";
        safeRows.splice(safeRows.indexOf(mapping), 1);
        safeFiles.splice(safeFiles.indexOf(file), 1);
        foundSafePair = true;
      }
    }

    if (!options.sequentialFallback || !safeRows.length) continue;
    if (safeFiles.length !== safeRows.length) continue;
    const remainingFiles = [...safeFiles];
    const assignments = new Map<RowMapping, CreativeFile>();
    for (const mapping of safeRows.filter((row) => row.analysis.variant !== null)) {
      const compatible = remainingFiles.filter((file) => file.variant === null || file.variant === mapping.analysis.variant);
      if (compatible.length !== 1) continue;
      const file = compatible[0];
      assignments.set(mapping, file);
      remainingFiles.splice(remainingFiles.indexOf(file), 1);
    }
    const remainingRows = safeRows.filter((row) => !assignments.has(row)).sort((a, b) => a.sheetRow - b.sheetRow);
    if (remainingRows.length !== remainingFiles.length) continue;
    if (!remainingRows.every((row, index) => row.analysis.variant === null || remainingFiles[index].variant === null || row.analysis.variant === remainingFiles[index].variant)) continue;
    remainingRows.forEach((row, index) => assignments.set(row, remainingFiles[index]));
    for (const mapping of safeRows) {
      const file = assignments.get(mapping);
      if (!file) continue;
      const targetExists = file.mediaType === "image" ? Boolean(columns.imageFile) : Boolean(columns.videoFile);
      if (!targetExists) continue;
      mapping.file = file;
      mapping.candidates = [file];
      mapping.status = "ready";
      mapping.reason = mapping.analysis.variant !== null && file.variant === null
        ? "Однозначно назначен оставшийся файл языка без номера варианта"
        : "Распределено последовательно внутри языка";
    }
  }
  return mappings;
}

function setCell(row: string[], headers: string[], column: string, value: string) {
  if (!column) return;
  const index = headers.indexOf(column);
  if (index >= 0) row[index] = value;
}
export function createOutputRows(csv: ParsedCsv, mappings: RowMapping[], columns: ColumnSelection, options: MappingOptions, hashByFileId: Record<string, string> = {}): string[][] {
  const output = csv.rows.map((row) => [...row]);
  for (const mapping of mappings) {
    if (!mapping.file || (mapping.status !== "ready" && mapping.status !== "manual")) continue;
    const row = output[mapping.rowIndex];
    if (mapping.file.mediaType === "image") {
      setCell(row, csv.headers, columns.imageFile, mapping.file.name);
      const imageHash = hashByFileId[mapping.file.id];
      if (imageHash) setCell(row, csv.headers, columns.imageHash, imageHash);
      else if (options.clearImageHash) setCell(row, csv.headers, columns.imageHash, "");
      if (options.clearOtherMedia) setCell(row, csv.headers, columns.videoFile, "");
    } else {
      setCell(row, csv.headers, columns.videoFile, mapping.file.name);
      if (options.clearOtherMedia) {
        setCell(row, csv.headers, columns.imageFile, "");
        if (options.clearImageHash) setCell(row, csv.headers, columns.imageHash, "");
      }
    }
  }
  return output;
}
export function serializeCsv(csv: ParsedCsv, rows: string[][]): string {
  const body = Papa.unparse([csv.headers, ...rows], { delimiter: csv.delimiter, newline: csv.linebreak, quotes: false });
  return `${csv.hadBom ? "\ufeff" : ""}${body}`;
}
export function createReportCsv(mappings: RowMapping[]): string {
  return Papa.unparse([["CSV row", "Ad Name", "Language", "Variant", "Creative file", "Status", "Comment"], ...mappings.map((mapping) => [mapping.sheetRow, mapping.sourceName, mapping.analysis.languageCode ?? "", mapping.analysis.variant ?? "", mapping.file?.name ?? "", mapping.status, mapping.reason])], { newline: "\r\n" });
}
export function outputFileName(inputName: string): string { return `${inputName.replace(/\.(csv|txt)$/i, "")}_with_creatives.csv`; }

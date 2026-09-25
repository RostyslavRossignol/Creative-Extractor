"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import {
  AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, CircleHelp,
  BookOpen, Clipboard, Code2, Database, Download, FileArchive, FileSpreadsheet,
  Image as ImageIcon, KeyRound, Link2, Loader2, LockKeyhole, RotateCcw,
  Search, Server, Settings2, ShieldCheck, Sparkles, Trash2, UploadCloud, Video, X,
} from "lucide-react";
import {
  buildMappings, cleanMetaExport, createCreativeFile, createOutputRows, createReportCsv,
  detectColumns, NAMING_COLUMNS, outputFileName, parseCsvFile, replaceInNamingColumns, serializeCsv,
  type CleanupReport, type ColumnSelection, type CreativeFile, type EncodingMode,
  type MappingOptions, type MappingStatus, type NamingReplacementReport,
  type NamingScope, type ParsedCsv,
} from "./lib/mapper";
import {
  extractAdAccountId, fetchAllAdImages,
  inferAdAccountIds, matchFilesToMetaImages, runWithConcurrency, uploadAdImage, verifyAdAccountAccess,
  type GraphVersion, type MetaAdImage, type MetaApiLogEntry, type MetaImageMatch,
} from "./lib/meta-api";

const defaultOptions: MappingOptions = {
  sequentialFallback: true,
  clearImageHash: true,
  clearOtherMedia: true,
  overwriteExisting: true,
};
const statusLabels: Record<MappingStatus, string> = {
  ready: "Готово", manual: "Выбрано вручную", missing: "Не найдено",
  ambiguous: "Конфликт", "no-language": "Язык не найден",
  existing: "Уже заполнено", skipped: "Пропущено",
};
type Filter = "all" | "ready" | "errors" | "manual";
type MetaMode = "find" | "upload";
type MetaUploadItem = {
  fileId: string;
  fileName: string;
  status: "pending" | "uploading" | "uploaded" | "failed";
  image: MetaAdImage | null;
  error: string | null;
  attempts: number;
};
const TOKEN_STORAGE_KEY = "creative-extractor:meta-access-token";
const ASSET_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";
const SIMPLE_GUIDE_VIDEO_SRC = `${ASSET_BASE_PATH}/creative-extractor-simple-guide.mp4`;
const SIMPLE_GUIDE_VIDEO_POSTER = `${ASSET_BASE_PATH}/creative-extractor-simple-guide-poster.jpg`;
const AUTO_GUIDE_VIDEO_SRC = `${ASSET_BASE_PATH}/creative-extractor-auto-guide.mp4`;
const AUTO_GUIDE_VIDEO_POSTER = `${ASSET_BASE_PATH}/creative-extractor-auto-guide-poster.jpg`;
const META_UPLOAD_CONCURRENCY = 3;
const defaultNamingScopes: Record<NamingScope, boolean> = { campaign: true, adSet: true, ad: true };

function formatBytes(bytes: number) {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

// <body> is zoomed on wide screens, and floating layers are portaled into it.
// Depending on the browser, a fixed element in a zoomed <body> lands at
// left × zoom or at left, so measure the real factor and convert the viewport
// coordinates from getBoundingClientRect into the layer's own pixels.
function toFixedLayer<T extends Record<string, number | undefined>>(position: T): T {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:100px;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const scale = probe.getBoundingClientRect().left / 100;
  probe.remove();
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.001) return position;
  return Object.fromEntries(Object.entries(position).map(([key, value]) => [key, value === undefined ? value : value / scale])) as T;
}

function downloadText(content: string, fileName: string, type = "text/csv;charset=utf-8") {
  downloadBlob(new Blob([content], { type }), fileName);
}
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

function UploadCard({ type, title, subtitle, accept, fileName, meta, busy, onFile, onClear }: {
  type: "csv" | "zip"; title: string; subtitle: string; accept: string;
  fileName?: string; meta?: string; busy?: boolean;
  onFile: (file: File) => void; onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const Icon = type === "csv" ? FileSpreadsheet : FileArchive;
  return (
    <div className={`upload-card ${dragging ? "is-dragging" : ""} ${fileName ? "has-file" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onFile(file); }}>
      <input ref={inputRef} className="sr-only" type="file" accept={accept}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
      {fileName ? <>
        <div className="file-icon file-icon--success"><Check size={20} /></div>
        <div className="upload-copy"><div className="upload-kicker">{type === "csv" ? "Таблица загружена" : "Архив загружен"}</div><div className="file-name" title={fileName}>{fileName}</div><div className="file-meta">{meta}</div></div>
        <button className="icon-button" type="button" aria-label="Удалить файл" onClick={onClear}><X size={18} /></button>
      </> :
        <button className="upload-trigger" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          <div className="file-icon">{busy ? <Loader2 className="spin" size={21} /> : <Icon size={21} />}</div>
          <div className="upload-copy"><div className="upload-title">{title}</div><div className="upload-subtitle">{subtitle}</div></div>
          <span className="browse-button"><UploadCloud size={16} /> Выбрать</span>
        </button>}
    </div>
  );
}

function HelpTip({ children, label }: { children: string; label: string }) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const show = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(340, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
    const roomBelow = window.innerHeight - rect.bottom;
    const roomAbove = rect.top;
    setPosition(toFixedLayer(roomBelow >= roomAbove
      ? { left, width, top: rect.bottom + 10, maxHeight: Math.max(36, roomBelow - 22) }
      : { left, width, bottom: window.innerHeight - rect.top + 10, maxHeight: Math.max(36, roomAbove - 22) }));
  }, []);
  useEffect(() => {
    if (!position) return;
    const reposition = () => show();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPosition(null); };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); window.removeEventListener("keydown", close); };
  }, [position, show]);
  return <span className="help-tip-wrap">
    <button ref={buttonRef} className="help-tip-button" type="button" aria-label={`Справка: ${label}`} aria-describedby={position ? id : undefined}
      onMouseEnter={show} onMouseLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (position) setPosition(null); else show(); }}><CircleHelp size={15} /></button>
    {position && createPortal(<div id={id} className="help-tooltip" role="tooltip" style={position}><b>{label}</b><span>{children}</span></div>, document.body)}
  </span>;
}

function SelectField({ label, help, value, options, onChange, optional = false }: {
  label: string; help: string; value: string; options: string[]; onChange: (value: string) => void; optional?: boolean;
}) {
  return <label className="field"><span className="field-label">{label}<HelpTip label={label}>{help}</HelpTip></span><div className="select-wrap">
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {optional && <option value="">Не используется</option>}
      {!optional && !value && <option value="">Выберите колонку</option>}
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select><ChevronDown size={16} />
  </div></label>;
}

function CreativeThumbnail({ file, previewUrl, compact = false }: {
  file: CreativeFile | null;
  previewUrl?: string;
  compact?: boolean;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [previewPosition, setPreviewPosition] = useState<{ left: number; top: number; size: number } | null>(null);
  const showPreview = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || !file || !previewUrl) return;
    const size = Math.min(340, window.innerWidth - 32, window.innerHeight - 86);
    const boxHeight = size + 42;
    const preferredLeft = rect.right + 14;
    const left = preferredLeft + size <= window.innerWidth - 16
      ? preferredLeft
      : Math.max(16, rect.left - size - 14);
    const top = Math.min(Math.max(16, rect.top + rect.height / 2 - boxHeight / 2), window.innerHeight - boxHeight - 16);
    setPreviewPosition(toFixedLayer({ left, top, size }));
  }, [file, previewUrl]);
  useEffect(() => {
    if (!previewPosition) return;
    const close = () => setPreviewPosition(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [previewPosition]);

  if (!file || file.mediaType !== "image" || !previewUrl) {
    return <span className={`creative-thumbnail creative-thumbnail--empty ${compact ? "is-compact" : ""}`} aria-hidden="true">
      {file?.mediaType === "video" ? <Video size={compact ? 14 : 18} /> : <ImageIcon size={compact ? 14 : 18} />}
    </span>;
  }

  return <>
    <span ref={triggerRef} className={`creative-thumbnail ${compact ? "is-compact" : ""}`} role={compact ? undefined : "button"}
      tabIndex={compact ? undefined : 0} aria-label={compact ? undefined : `Увеличить превью ${file.name}`}
      onMouseEnter={showPreview} onMouseLeave={() => setPreviewPosition(null)} onFocus={showPreview} onBlur={() => setPreviewPosition(null)}
      onClick={compact ? undefined : () => previewPosition ? setPreviewPosition(null) : showPreview()}
      onKeyDown={compact ? undefined : (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (previewPosition) setPreviewPosition(null); else showPreview(); } }}>
      {/* Blob URLs are created locally from the ZIP and cannot use the Next image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewUrl} alt="" loading="lazy" decoding="async" />
    </span>
    {previewPosition && createPortal(<div className="creative-hover-preview" style={{ left: previewPosition.left, top: previewPosition.top, width: previewPosition.size }} role="img" aria-label={`Превью ${file.name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewUrl} alt={file.name} />
      <span>{file.name}</span>
    </div>, document.body)}
  </>;
}

function CreativePicker({ rowNumber, creatives, file, previewUrls, selectedId, onSelect }: {
  rowNumber: number;
  creatives: CreativeFile[];
  file: CreativeFile | null;
  previewUrls: Record<string, string>;
  selectedId?: string;
  onSelect: (fileId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState(file?.name ?? "");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle || needle === file?.name.toLocaleLowerCase()) return creatives;
    return creatives.filter((creative) => creative.name.toLocaleLowerCase().includes(needle));
  }, [creatives, file?.name, query]);
  const positionList = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(rect.width, 420), window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const roomBelow = window.innerHeight - rect.bottom;
    const roomAbove = rect.top;
    setPosition(toFixedLayer(roomBelow >= 220 || roomBelow >= roomAbove
      ? { left, top: rect.bottom + 7, width, maxHeight: Math.max(120, Math.min(320, roomBelow - 18)) }
      : { left, bottom: window.innerHeight - rect.top + 7, width, maxHeight: Math.max(120, Math.min(320, roomAbove - 18)) }));
  }, []);
  const show = useCallback(() => { positionList(); setOpen(true); }, [positionList]);
  useEffect(() => {
    if (!open) return;
    const reposition = () => positionList();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); window.removeEventListener("keydown", close); };
  }, [open, positionList]);
  const choose = (creative: CreativeFile) => { setQuery(creative.name); onSelect(creative.id); setOpen(false); };

  return <div className={`creative-picker ${selectedId ? "is-manual" : ""}`}>
    <CreativeThumbnail file={file} previewUrl={file ? previewUrls[file.id] : undefined} />
    <div className="creative-picker-input-wrap">
      {file?.mediaType === "video" ? <Video size={15} /> : <ImageIcon size={15} />}
      <input ref={inputRef} value={query} role="combobox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={`Выбрать креатив для строки ${rowNumber}`} placeholder="Введите имя или выберите файл…"
        onFocus={(event) => { event.currentTarget.select(); show(); }}
        onBlur={() => window.setTimeout(() => { setOpen(false); setQuery(file?.name ?? ""); }, 120)}
        onChange={(event) => { setQuery(event.target.value); show(); }}
        onKeyDown={(event) => { if (event.key === "Enter" && open && filtered.length) { event.preventDefault(); choose(filtered[0]); } }} />
      {selectedId ? <button type="button" className="creative-picker-reset" aria-label="Вернуть автоматический выбор" title="Вернуть автоматический выбор"
        onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect("")}><RotateCcw size={14} /></button>
        : <button type="button" className="creative-picker-toggle" aria-label="Показать список креативов" onMouseDown={(event) => event.preventDefault()} onClick={() => { inputRef.current?.focus(); show(); }}><ChevronDown size={14} /></button>}
    </div>
    {open && position && createPortal(<div id={listId} className="creative-picker-menu" role="listbox" style={position}>
      <div className="creative-picker-summary">{filtered.length ? `Найдено: ${filtered.length}` : "Совпадений нет"}</div>
      {filtered.slice(0, 150).map((creative) => <button key={creative.id} type="button" role="option" aria-selected={creative.id === file?.id}
        className={creative.id === file?.id ? "selected" : ""} onMouseDown={(event) => { event.preventDefault(); choose(creative); }}>
        <CreativeThumbnail compact file={creative} previewUrl={previewUrls[creative.id]} /><span>{creative.name}</span>
        <small>{creative.languageCode ?? "?"}:{creative.variant ?? "?"}</small>
      </button>)}
      {filtered.length > 150 && <div className="creative-picker-more">Введите ещё несколько букв — показаны первые 150 файлов.</div>}
    </div>, document.body)}
  </div>;
}

export default function Home() {
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [csvSourceFile, setCsvSourceFile] = useState<File | null>(null);
  const [zipSourceFile, setZipSourceFile] = useState<File | null>(null);
  const [creatives, setCreatives] = useState<CreativeFile[]>([]);
  const [creativeUploadFiles, setCreativeUploadFiles] = useState<Record<string, File>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlListRef = useRef<string[]>([]);
  const [ignoredFiles, setIgnoredFiles] = useState<string[]>([]);
  const [columns, setColumns] = useState<ColumnSelection>({ source: "", imageFile: "", videoFile: "", imageHash: "" });
  const [options, setOptions] = useState<MappingOptions>(defaultOptions);
  const [encoding, setEncoding] = useState<EncodingMode>("auto");
  const [busy, setBusy] = useState<"csv" | "zip" | "package" | "meta" | "meta-upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [manualOverrides, setManualOverrides] = useState<Record<number, string>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [token, setToken] = useState("");
  const [tokenStorageReady, setTokenStorageReady] = useState(false);
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
  const [sourceFormat, setSourceFormat] = useState("");
  const [renameFind, setRenameFind] = useState("");
  const [renameReplace, setRenameReplace] = useState("");
  const [renameScopes, setRenameScopes] = useState<Record<NamingScope, boolean>>(defaultNamingScopes);
  const [renameCaseSensitive, setRenameCaseSensitive] = useState(false);
  const [renameReport, setRenameReport] = useState<NamingReplacementReport | null>(null);
  const [renameUndoCsv, setRenameUndoCsv] = useState<ParsedCsv | null>(null);
  const [accountId, setAccountId] = useState("");
  const [accountIdSource, setAccountIdSource] = useState<"auto" | "manual" | "">("");
  const [graphVersion, setGraphVersion] = useState<GraphVersion>("v26.0");
  const [metaMode, setMetaMode] = useState<MetaMode>("find");
  const [metaImages, setMetaImages] = useState<MetaAdImage[]>([]);
  const [metaMatches, setMetaMatches] = useState<MetaImageMatch[]>([]);
  const [uploadResults, setUploadResults] = useState<MetaUploadItem[]>([]);
  const [metaCheckedAt, setMetaCheckedAt] = useState<Date | null>(null);
  const [apiLogs, setApiLogs] = useState<MetaApiLogEntry[]>([]);
  const [showApiLogs, setShowApiLogs] = useState(false);
  const [logCopied, setLogCopied] = useState(false);

  const clearPreviewUrls = useCallback(() => {
    previewUrlListRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlListRef.current = [];
    setPreviewUrls({});
  }, []);
  useEffect(() => () => {
    previewUrlListRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    const restoreToken = window.setTimeout(() => {
      try {
        const savedToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
        if (savedToken) setToken(savedToken);
      } catch {
        // Storage can be unavailable in hardened browser modes.
      } finally {
        setTokenStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreToken);
  }, []);

  useEffect(() => {
    if (!tokenStorageReady) return;
    try {
      if (token) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // The app still works; only persistence for this tab is unavailable.
    }
  }, [token, tokenStorageReady]);

  useEffect(() => {
    if (!showInstructions) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowInstructions(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showInstructions]);

  const loadCsv = useCallback(async (file: File) => {
    if (!/\.(csv|txt)$/i.test(file.name)) { setError("Для таблицы нужен файл CSV или TXT."); return; }
    setBusy("csv"); setError(null);
    try {
      const parsed = await parseCsvFile(file, encoding);
      const cleaned = cleanMetaExport(parsed);
      const detected = detectColumns(cleaned.csv.headers);
      const inferredIds = inferAdAccountIds(cleaned.csv, detected.source);
      setCsv(cleaned.csv); setCsvSourceFile(file); setColumns(detected); setManualOverrides({});
      setCleanupReport(cleaned.report); setSourceFormat(`${parsed.encoding.toUpperCase()} · ${parsed.delimiter === "\t" ? "TAB" : "CSV"}`);
      setRenameFind(""); setRenameReplace(""); setRenameReport(null); setRenameUndoCsv(null);
      setMetaImages([]); setMetaMatches([]); setUploadResults([]); setMetaCheckedAt(null); setApiLogs([]); setShowApiLogs(false);
      if (inferredIds.length === 1) { setAccountId(inferredIds[0]); setAccountIdSource("auto"); }
      else { setAccountId(""); setAccountIdSource(""); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось прочитать CSV."); }
    finally { setBusy(null); }
  }, [encoding]);

  const loadZip = useCallback(async (file: File) => {
    if (!/\.zip$/i.test(file.name)) { setError("Для креативов нужен ZIP-архив."); return; }
    setBusy("zip"); setError(null);
    try {
      const zip = await JSZip.loadAsync(file); const found: CreativeFile[] = []; const ignored: string[] = [];
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const rawEntry = entry as unknown as { _data?: { uncompressedSize?: number } };
        const creative = createCreativeFile(entry.name, rawEntry._data?.uncompressedSize ?? 0);
        if (creative) found.push(creative);
        else if (!entry.name.includes("__MACOSX") && !entry.name.split("/").pop()?.startsWith(".")) ignored.push(entry.name);
      }
      if (!found.length) throw new Error("В ZIP не найдены изображения JPG/PNG или видео MP4/MOV.");
      found.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const nextPreviewUrls: Record<string, string> = {};
      const nextUploadFiles: Record<string, File> = {};
      const nextUrlList: string[] = [];
      await Promise.all(found.filter((creative) => creative.mediaType === "image").map(async (creative) => {
        const entry = zip.file(creative.path);
        if (!entry) return;
        const bytes = await entry.async("uint8array");
        const mimeType = creative.extension === "png" ? "image/png" : "image/jpeg";
        const safeBytes = new Uint8Array(bytes.byteLength);
        safeBytes.set(bytes);
        const uploadFile = new File([safeBytes], creative.name, { type: mimeType });
        const url = URL.createObjectURL(uploadFile);
        nextUploadFiles[creative.id] = uploadFile;
        nextPreviewUrls[creative.id] = url;
        nextUrlList.push(url);
      }));
      clearPreviewUrls();
      previewUrlListRef.current = nextUrlList;
      setPreviewUrls(nextPreviewUrls);
      setCreativeUploadFiles(nextUploadFiles);
      setCreatives(found); setIgnoredFiles(ignored); setZipSourceFile(file); setManualOverrides({});
      setMetaImages([]); setMetaMatches([]); setUploadResults([]); setMetaCheckedAt(null); setApiLogs([]); setShowApiLogs(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось открыть ZIP-архив."); }
    finally { setBusy(null); }
  }, [clearPreviewUrls]);

  const mappings = useMemo(() => !csv || !columns.source || !creatives.length ? [] : buildMappings(csv, creatives, columns, options, manualOverrides), [csv, creatives, columns, options, manualOverrides]);
  const stats = useMemo(() => {
    const actionable = mappings.filter((mapping) => mapping.status !== "skipped" && mapping.status !== "existing");
    const ready = actionable.filter((mapping) => mapping.status === "ready" || mapping.status === "manual").length;
    const manual = actionable.filter((mapping) => mapping.status === "manual").length;
    const used = new Set(actionable.flatMap((mapping) => mapping.file ? [mapping.file.id] : []));
    return { total: actionable.length, ready, manual, errors: actionable.length - ready, unused: creatives.filter((file) => !used.has(file.id)).length, unrecognizedFiles: creatives.filter((file) => (!file.languageCode || file.ambiguousLanguages.length) && !used.has(file.id)).length };
  }, [mappings, creatives]);
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>(); creatives.forEach((file) => counts.set(file.name.toLocaleLowerCase(), (counts.get(file.name.toLocaleLowerCase()) ?? 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  }, [creatives]);
  const filteredMappings = useMemo(() => mappings.filter((mapping) => {
    const matchesFilter = filter === "all" || (filter === "ready" && (mapping.status === "ready" || mapping.status === "manual")) || (filter === "errors" && ["missing", "ambiguous", "no-language"].includes(mapping.status)) || (filter === "manual" && mapping.status === "manual");
    const q = query.trim().toLocaleLowerCase();
    return matchesFilter && (!q || mapping.sourceName.toLocaleLowerCase().includes(q) || mapping.file?.name.toLocaleLowerCase().includes(q));
  }), [mappings, filter, query]);
  const blockers = Boolean(!csv || !zipSourceFile || !columns.source || stats.errors || duplicateNames.length);
  const hasBothFiles = Boolean(csv && zipSourceFile);
  const usedCreatives = useMemo(() => {
    const seen = new Set<string>();
    return mappings.flatMap((mapping) => {
      if (!mapping.file || !["ready", "manual"].includes(mapping.status) || seen.has(mapping.file.id)) return [];
      seen.add(mapping.file.id);
      return [mapping.file];
    });
  }, [mappings]);
  const imageCount = usedCreatives.filter((file) => file.mediaType === "image").length;
  const videoCount = usedCreatives.filter((file) => file.mediaType === "video").length;
  const metaStats = useMemo(() => ({
    matched: metaMatches.filter((item) => item.status === "matched").length,
    missing: metaMatches.filter((item) => item.status === "missing").length,
    ambiguous: metaMatches.filter((item) => item.status === "ambiguous").length,
  }), [metaMatches]);
  const uploadStats = useMemo(() => ({
    total: uploadResults.length,
    uploaded: uploadResults.filter((item) => item.status === "uploaded").length,
    failed: uploadResults.filter((item) => item.status === "failed").length,
    active: uploadResults.filter((item) => item.status === "uploading").length,
  }), [uploadResults]);
  const uploadComplete = Boolean(imageCount > 0 && uploadStats.total === imageCount && uploadStats.uploaded === imageCount);
  const metaReady = Boolean(hasBothFiles && (imageCount === 0 || (metaMatches.length === imageCount && metaStats.matched === imageCount && Boolean(columns.imageHash))));
  const hashByFileId = useMemo(() => Object.fromEntries(metaMatches.flatMap((match) => match.image ? [[match.fileId, `${accountId.replace(/^act_/i, "")}:${match.image.hash}`]] : [])), [metaMatches, accountId]);
  const finalBlockers = blockers || !metaReady || videoCount > 0;
  const apiLogJson = useMemo(() => JSON.stringify({
    account_id: accountId.replace(/^act_/i, ""),
    graph_version: graphVersion,
    security_note: "Access token and appsecret_proof are removed from this log.",
    entries: apiLogs,
  }, null, 2), [accountId, graphVersion, apiLogs]);
  const namingPreview = useMemo(() => {
    if (!csv) return [];
    return (Object.entries(NAMING_COLUMNS) as [NamingScope, string][]).map(([scope, header]) => {
      const index = csv.headers.indexOf(header);
      const values = index < 0 ? [] : [...new Set(csv.rows.map((row) => row[index]).filter(Boolean))];
      return { scope, header, count: values.length, values };
    });
  }, [csv]);

  const handleMetaSync = async () => {
    if (!csv || blockers || !accountId.trim() || !token.trim()) return;
    setBusy("meta"); setError(null); setMetaMatches([]); setMetaCheckedAt(null); setApiLogs([]); setShowApiLogs(true); setLogCopied(false);
    try {
      const images = await fetchAllAdImages({ accountId, token, version: graphVersion, onLog: (entry) => setApiLogs((current) => [...current, entry]) });
      const matches = matchFilesToMetaImages(usedCreatives, images);
      setMetaImages(images); setMetaMatches(matches); setMetaCheckedAt(new Date());
      if (!images.length) setError("Meta API не вернул ни одного изображения из этого рекламного кабинета.");
    } catch (reason) {
      setMetaImages([]); setMetaMatches([]);
      setError(reason instanceof Error ? reason.message : "Не удалось получить изображения через Meta API.");
    } finally { setBusy(null); }
  };

  const handleMetaUpload = async (retryFailed = false) => {
    if (!csv || blockers || !accountId.trim() || !token.trim() || busy) return;
    const imageCreatives = usedCreatives.filter((file) => file.mediaType === "image");
    const previous = new Map(uploadResults.map((item) => [item.fileId, item]));
    const initial: MetaUploadItem[] = imageCreatives.map((creative) => {
      const old = previous.get(creative.id);
      if (retryFailed && old?.status === "uploaded") return old;
      return {
        fileId: creative.id,
        fileName: creative.name,
        status: "pending",
        image: old?.status === "uploaded" ? old.image : null,
        error: null,
        attempts: old?.attempts ?? 0,
      };
    });
    const targetIds = new Set(initial.filter((item) => !retryFailed || previous.get(item.fileId)?.status === "failed").map((item) => item.fileId));
    if (!targetIds.size) return;

    setBusy("meta-upload"); setError(null); setUploadResults(initial); setMetaCheckedAt(null); setApiLogs([]); setShowApiLogs(true); setLogCopied(false);
    try {
      await verifyAdAccountAccess({
        accountId, token, version: graphVersion,
        onLog: (entry) => setApiLogs((entries) => [...entries, entry]),
      });
    } catch (reason) {
      setUploadResults([]);
      setError(reason instanceof Error ? reason.message : "Не удалось подтвердить доступ к рекламному кабинету.");
      setBusy(null);
      return;
    }
    const current = [...initial];
    const publish = () => {
      setUploadResults([...current]);
      const matches: MetaImageMatch[] = current.map((item) => item.status === "uploaded" && item.image
        ? { fileId: item.fileId, fileName: item.fileName, status: "matched", image: item.image, candidates: [item.image], reason: "Загружено через Meta API" }
        : { fileId: item.fileId, fileName: item.fileName, status: "missing", image: null, candidates: [], reason: item.error || (item.status === "uploading" ? "Загрузка…" : "Ожидает загрузки") });
      setMetaMatches(matches);
      setMetaImages(current.flatMap((item) => item.image ? [item.image] : []));
    };

    const queue = current.map((_, index) => index).filter((index) => targetIds.has(current[index].fileId));
    await runWithConcurrency(queue, META_UPLOAD_CONCURRENCY, async (index) => {
        const item = current[index];
        const file = creativeUploadFiles[item.fileId];
        item.attempts += 1;
        if (!file) {
          item.status = "failed";
          item.error = "Не удалось прочитать изображение из ZIP. Загрузите архив повторно.";
          publish();
          return;
        }
        item.status = "uploading"; item.error = null; publish();
        try {
          item.image = await uploadAdImage({
            accountId, token, file, version: graphVersion, requestNumber: index + 1,
            onLog: (entry) => setApiLogs((entries) => [...entries, entry]),
          });
          item.status = "uploaded";
        } catch (reason) {
          item.status = "failed";
          item.image = null;
          item.error = reason instanceof Error ? reason.message : "Не удалось загрузить изображение в Meta.";
        }
        publish();
    });
    setMetaCheckedAt(new Date());
    const failed = current.filter((item) => item.status === "failed").length;
    if (failed) setError(`Не удалось загрузить ${failed} из ${current.length} изображений. Исправьте причину и нажмите «Повторить ошибки».`);
    setBusy(null);
  };

  const handleDownloadCsv = () => {
    if (!csv || finalBlockers) return;
    downloadText(serializeCsv(csv, createOutputRows(csv, mappings, columns, options, hashByFileId)), outputFileName(csv.fileName));
  };
  const handleCopyLog = async () => {
    try {
      await navigator.clipboard.writeText(apiLogJson);
      setLogCopied(true);
      window.setTimeout(() => setLogCopied(false), 1600);
    } catch { setError("Браузер не разрешил скопировать лог. Используйте кнопку скачивания JSON."); }
  };
  const resetMetaResults = () => {
    setMetaImages([]); setMetaMatches([]); setUploadResults([]); setMetaCheckedAt(null); setApiLogs([]); setShowApiLogs(false); setLogCopied(false);
  };
  const updateAccountFromCsv = (nextCsv: ParsedCsv) => {
    const detected = detectColumns(nextCsv.headers);
    const inferredIds = inferAdAccountIds(nextCsv, detected.source);
    setColumns(detected);
    if (inferredIds.length === 1) { setAccountId(inferredIds[0]); setAccountIdSource("auto"); }
    else { setAccountId(""); setAccountIdSource(""); }
  };
  const handleNamingReplace = () => {
    if (!csv || !renameFind) return;
    const scopes = (Object.entries(renameScopes) as [NamingScope, boolean][]).filter(([, selected]) => selected).map(([scope]) => scope);
    if (!scopes.length) { setError("Выберите хотя бы один тип нейминга."); return; }
    const result = replaceInNamingColumns(csv, renameFind, renameReplace, scopes, renameCaseSensitive);
    setRenameReport(result.report); setError(null);
    if (!result.report.totalReplacements) return;
    setRenameUndoCsv(csv); setCsv(result.csv); setManualOverrides({}); updateAccountFromCsv(result.csv); resetMetaResults();
  };
  const undoNamingReplace = () => {
    if (!renameUndoCsv) return;
    setCsv(renameUndoCsv); updateAccountFromCsv(renameUndoCsv); setRenameUndoCsv(null); setRenameReport(null); resetMetaResults();
  };
  const clearToken = () => {
    try { window.sessionStorage.removeItem(TOKEN_STORAGE_KEY); } catch {}
    setToken(""); resetMetaResults();
  };
  const reset = () => {
    clearPreviewUrls();
    setCsv(null); setCsvSourceFile(null); setZipSourceFile(null); setCreatives([]); setCreativeUploadFiles({}); setIgnoredFiles([]);
    setColumns({ source: "", imageFile: "", videoFile: "", imageHash: "" }); setOptions(defaultOptions);
    setManualOverrides({}); setError(null); setFilter("all"); setQuery(""); setAccountId("");
    setCleanupReport(null); setSourceFormat(""); setRenameFind(""); setRenameReplace(""); setRenameScopes(defaultNamingScopes); setRenameReport(null); setRenameUndoCsv(null);
    setAccountIdSource(""); setMetaImages([]); setMetaMatches([]); setMetaCheckedAt(null); setApiLogs([]); setShowApiLogs(false); setLogCopied(false);
  };

  return <main>
    <div className="ambient-background" aria-hidden="true"><span className="ambient-orb ambient-orb--one" /><span className="ambient-orb ambient-orb--two" /><span className="ambient-orb ambient-orb--three" /><span className="ambient-grid" /><span className="ambient-glow ambient-glow--one" /><span className="ambient-glow ambient-glow--two" /></div>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Creative Extractor"><span className="brand-mark"><Sparkles size={18} /></span><span>Creative Extractor</span><span className="product-chip">Meta CSV</span></a>
      <div className="topbar-actions">
        <button className="instructions-button" type="button" onClick={() => setShowInstructions(true)}><span className="instructions-icon"><BookOpen size={16} /></span> Инструкция</button>
        <div className="privacy-pill"><LockKeyhole size={14} /> Файлы остаются на устройстве</div>
      </div>
    </header>

    {showInstructions && <div className="instructions-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowInstructions(false); }}>
      <section className="instructions-dialog" role="dialog" aria-modal="true" aria-labelledby="instructions-title">
        <div className="instructions-head"><div className="instructions-heading-icon"><BookOpen size={22} /></div><div><span>Версия 1.8.0</span><h2 id="instructions-title">Подготовка CSV и загрузка креативов</h2></div><button type="button" onClick={() => setShowInstructions(false)} aria-label="Закрыть инструкцию"><X size={19} /></button></div>
        <div className="instructions-ip"><Server size={20} /><div><strong>Сначала откройте нужный профиль в приложении AdsPower</strong><p>Открывайте Creative Extractor внутри того же браузерного профиля AdsPower и с того же закреплённого IP/прокси, с которых вы входите в Ads Manager и выполняете залив в нужный рекламный аккаунт (King). Профиль AdsPower и его IP должны соответствовать именно тому аккаунту, с которого вы заливаетесь.</p></div></div>
        <div className="instructions-update"><UploadCloud size={19} /><div><b>Новое: автоматическая загрузка изображений</b><span>JPG и PNG из ZIP теперь можно загрузить прямо в выбранный рекламный кабинет. Старый режим поиска уже загруженных изображений также полностью сохранён.</span></div></div>

        <section className="instruction-section">
          <div className="instruction-section-title"><span>01</span><div><b>Подготовьте файлы</b><small>Общие шаги для обоих режимов</small></div></div>
          <ol className="instruction-checklist">
            <li><b>1</b><span>Выгрузите из Meta Ads Manager исходный CSV кампании, которую нужно размножить или обновить.</span></li>
            <li><b>2</b><span>Соберите JPG/PNG в один ZIP. Язык и номер варианта должны присутствовать и в Ad Name, и в имени файла, но записывать их можно по-разному: <code>SK</code>, <code>Slovak</code> и <code>словацкий</code> считаются одним языком, регистр не важен. Любое другое общее слово (например, <code>boy</code> или <code>бой</code>) тоже связывает объявление с креативом; несколько объявлений с одним словом получают разные креативы.</span></li>
            <li><b>3</b><span>Загрузите в Creative Extractor сначала CSV, затем ZIP. Проверьте автоматическое сопоставление и исправьте красные строки вручную.</span></li>
            <li><b>4</b><span>Проверьте ID рекламного кабинета. Можно вставить полную ссылку Ads Manager — сервис возьмёт только параметр <code>act=</code>. Не используйте <code>business_id</code> или <code>global_scope_id</code>.</span></li>
          </ol>
        </section>

        <section className="instruction-section instruction-section--token">
          <div className="instruction-section-title"><span>02</span><div><b>Получите токен системного пользователя</b><small>Настраивается один раз для нужного приложения и кабинетов</small></div></div>
          <ol className="instruction-checklist">
            <li><b>1</b><span>Откройте Meta Business Settings нужного бизнес-портфеля и перейдите: <strong>Пользователи → Системные пользователи</strong>.</span></li>
            <li><b>2</b><span>Выберите существующего системного пользователя, через которого работает ваше приложение.</span></li>
            <li><b>3</b><span>Нажмите <strong>Назначить ресурсы</strong>, выберите нужный рекламный кабинет и выдайте право управления рекламными кампаниями/полный контроль.</span></li>
            <li><b>4</b><span>Убедитесь, что нужное Meta-приложение принадлежит или подключено к этому бизнес-портфелю.</span></li>
            <li><b>5</b><span>Нажмите <strong>Создать токен</strong>, выберите приложение и срок действия <strong>Never / Никогда</strong>, если этот вариант доступен.</span></li>
            <li><b>6</b><span>Отметьте <code>ads_management</code> и <code>ads_read</code>. Для вашей схемы также можно оставить <code>business_management</code>. Для автоматической загрузки обязательно нужен <code>ads_management</code>.</span></li>
            <li><b>7</b><span>Скопируйте токен и вставьте его в поле <strong>Access token</strong> на сайте. Не отправляйте токен в чаты и не добавляйте его в GitHub.</span></li>
          </ol>
        </section>

        <div className="instruction-mode-grid">
          <section className="instruction-mode-card instruction-mode-card--find">
            <div className="instruction-mode-head"><Search size={18} /><div><b>03 · Старый вариант</b><span>«Найти в Meta»</span></div></div>
            <ol>
              <li>Заранее загрузите JPG/PNG в тот же рекламный кабинет, сохранив исходные имена файлов.</li>
              <li>Добавьте CSV и ZIP в Creative Extractor и проверьте сопоставление строк.</li>
              <li>Укажите ID кабинета или вставьте ссылку Ads Manager с параметром <code>act=</code>.</li>
              <li>Вставьте токен с <code>ads_read</code> или <code>ads_management</code>.</li>
              <li>Выберите <strong>«Найти в Meta»</strong> и нажмите <strong>«Найти креативы»</strong>.</li>
              <li>Устраните строки «Не найдено» или «Конфликт», затем скачайте готовый CSV.</li>
            </ol>
          </section>
          <section className="instruction-mode-card instruction-mode-card--upload">
            <div className="instruction-mode-head"><UploadCloud size={18} /><div><b>04 · Новый вариант</b><span>«Загрузить в Meta»</span></div></div>
            <ol>
              <li>Добавьте CSV и ZIP; заранее загружать изображения в Meta не требуется.</li>
              <li>Укажите правильный рекламный кабинет через ID или полную ссылку Ads Manager.</li>
              <li>Вставьте токен с <code>ads_management</code> и доступом системного пользователя к этому кабинету.</li>
              <li>Выберите <strong>«Загрузить в Meta»</strong> и нажмите кнопку загрузки изображений.</li>
              <li>Сервис сначала проверит кабинет, затем загрузит JPG/PNG безопасной параллельной очередью. Meta вернёт Image Hash в ответе на каждую загрузку, и сервис сразу запишет его в результат.</li>
              <li>Если отдельный файл не загрузился, исправьте причину и нажмите <strong>«Повторить ошибки»</strong>.</li>
              <li>После статуса «Все изображения загружены» скачайте готовый CSV.</li>
            </ol>
          </section>
        </div>

        <section className="instruction-section">
          <div className="instruction-section-title"><span>05</span><div><b>Импортируйте результат в Meta</b><small>Финальная проверка перед публикацией</small></div></div>
          <ol className="instruction-checklist">
            <li><b>1</b><span>В Ads Manager выберите импорт объявлений и загрузите готовый CSV из Creative Extractor.</span></li>
            <li><b>2</b><span>Откройте Preview и проверьте названия, изображения, кабинеты и отсутствие ошибок <code>Image Not Found</code>.</span></li>
            <li><b>3</b><span>Сначала сохраните всё в черновик. Публикуйте только после ручной проверки кампаний, адсетов и объявлений.</span></li>
          </ol>
          <p className="instruction-limit"><AlertCircle size={15} /> Автоматическая API-загрузка сейчас поддерживает JPG и PNG. Видео MP4/MOV этим режимом не загружаются.</p>
        </section>
        <div className="instructions-foot"><LockKeyhole size={15} /> Не вставляйте токен в чаты или публичные документы. На сайте он хранится только в текущей вкладке.</div>
        <button className="instructions-primary" type="button" onClick={() => setShowInstructions(false)}>Понятно, начать работу</button>
      </section>
    </div>}

    <section className="release-notice" aria-label="Обновление Creative Extractor v1.8.0"><span className="release-badge">Новое · v1.8.0</span><UploadCloud size={22} /><div><strong>Добавлена ускоренная автозагрузка креативов и новая видеоинструкция</strong><span>Открывайте сервис в том же профиле AdsPower и с закреплённого IP/прокси аккаунта, с которого выполняете залив.</span></div><button type="button" onClick={() => setShowInstructions(true)}>Что изменилось</button></section>
    <section className="session-ip-notice" aria-label="Важное условие рабочего окружения"><Server size={20} /><div><strong>Открывайте сайт в нужном профиле AdsPower и с его IP</strong><span>Используйте профиль AdsPower и закреплённый за ним IP/прокси того аккаунта (King), с которого выполняете залив.</span></div><button type="button" onClick={() => setShowInstructions(true)}>Подробнее</button></section>

    <section className="hero" id="top">
      <div className="hero-copy"><div className="eyebrow">Автоматизация CSV для Meta Ads</div><h1>Подготовьте кампанию и креативы за несколько кликов</h1><p>Загрузите исходный экспорт Meta. Сервис очистит технические привязки, поможет массово обновить нейминги, распределит креативы и подготовит готовый CSV.</p></div>
      <div className="hero-trust"><ShieldCheck size={22} /><div><strong>Токен остаётся в текущей вкладке</strong><span>Переживает обновление страницы и удаляется при закрытии вкладки</span></div></div>
    </section>

    <section className="guide-shell" aria-labelledby="guide-title">
      <div className="guide-card guide-card--library">
        <div className="guide-copy">
          <div className="section-kicker">Два способа работы</div>
          <h2 id="guide-title">Выберите подходящую видеоинструкцию</h2>
          <p>Простой способ оставлен как безопасный резерв: изображения загружаются в Meta вручную. Автоинтеграция быстрее — сервис сам отправляет JPG/PNG в кабинет через официальный API.</p>
        </div>
        <div className="guide-video-grid">
          <article className="guide-video-card">
            <div className="guide-video-card-head"><span className="guide-mode-badge guide-mode-badge--simple">Резервный способ</span><div><strong>Видео простой интеграции</strong><small>Креативы заранее загружаются в Meta вручную</small></div></div>
            <div className="guide-media has-video">
              <video className="guide-video" controls preload="metadata" playsInline poster={SIMPLE_GUIDE_VIDEO_POSTER} aria-label="Видео простой интеграции Creative Extractor">
                <source src={SIMPLE_GUIDE_VIDEO_SRC} type="video/mp4" />
                Ваш браузер не поддерживает воспроизведение видео.
              </video>
            </div>
          </article>
          <article className="guide-video-card guide-video-card--auto">
            <div className="guide-video-card-head"><span className="guide-mode-badge guide-mode-badge--auto">Новый быстрый способ</span><div><strong>Видео автоинтеграции</strong><small>JPG/PNG загружаются прямо в кабинет через API</small></div></div>
            <div className="guide-media has-video">
              <video className="guide-video" controls preload="metadata" playsInline poster={AUTO_GUIDE_VIDEO_POSTER} aria-label="Видео автоматической интеграции Creative Extractor">
                <source src={AUTO_GUIDE_VIDEO_SRC} type="video/mp4" />
                Ваш браузер не поддерживает воспроизведение видео.
              </video>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section className="workspace-shell">
      <div className="meta-import-rule"><AlertCircle size={21} /><div><strong>Выберите простой или автоматический способ получения Image Hash</strong><p>В резервном режиме заранее загрузите изображения в Meta и найдите их по именам. В новом режиме сервис сам загрузит JPG/PNG из ZIP через официальный API. Неоднозначные совпадения и ошибки будут остановлены для ручной проверки.</p></div></div>
      <div className="step-strip"><span className={csv ? "done" : "active"}><b>{csv ? <Check size={14} /> : "1"}</b> Исходный CSV</span><ArrowRight size={15} /><span className={csv ? "done" : ""}><b>{csv ? <Check size={14} /> : "2"}</b> Подготовка</span><ArrowRight size={15} /><span className={zipSourceFile ? "done" : csv ? "active" : ""}><b>{zipSourceFile ? <Check size={14} /> : "3"}</b> ZIP</span><ArrowRight size={15} /><span className={metaReady ? "done" : hasBothFiles ? "active" : ""}><b>{metaReady ? <Check size={14} /> : "4"}</b> Хэши</span><ArrowRight size={15} /><span className={metaReady ? "active" : ""}><b>5</b> Скачать</span></div>
      <div className="upload-grid">
        <UploadCard type="csv" title="Исходный экспорт Meta" subtitle="Можно загрузить оригинальный UTF-16/TAB или уже очищенный CSV" accept=".csv,.txt,text/csv,text/plain" fileName={csvSourceFile?.name} meta={csv ? `${csv.rows.length} строк · ${csv.headers.length} колонок · готовый UTF-8 CSV` : ""} busy={busy === "csv"} onFile={loadCsv} onClear={() => { setCsv(null); setCsvSourceFile(null); setColumns({ source: "", imageFile: "", videoFile: "", imageHash: "" }); setManualOverrides({}); setCleanupReport(null); setSourceFormat(""); setRenameReport(null); setRenameUndoCsv(null); setAccountId(""); setAccountIdSource(""); resetMetaResults(); }} />
        <UploadCard type="zip" title="ZIP с креативами" subtitle="JPG/PNG можно найти в Meta или загрузить прямо из приложения" accept=".zip,application/zip" fileName={zipSourceFile?.name} meta={zipSourceFile ? `${creatives.length} креативов · ${formatBytes(zipSourceFile.size)}` : ""} busy={busy === "zip"} onFile={loadZip} onClear={() => { clearPreviewUrls(); setZipSourceFile(null); setCreatives([]); setCreativeUploadFiles({}); setIgnoredFiles([]); setManualOverrides({}); resetMetaResults(); }} />
      </div>
      {error && <div className="notice notice--error"><AlertCircle size={18} /><span>{error}</span><button onClick={() => setError(null)} aria-label="Закрыть"><X size={16} /></button></div>}

      {csv && cleanupReport && <section className="preparation-panel">
        <div className="preparation-head">
          <div><div className="section-kicker">Подготовка таблицы</div><h2>Очистка и массовая замена неймингов</h2><p>Технические поля очищаются автоматически. Поиск и замена работают только в Campaign Name, Ad Set Name и Ad Name — остальные настройки кампании не меняются.</p></div>
          <div className="cleanup-badge"><CheckCircle2 size={18} /><span><b>{cleanupReport.cleanedCells ? `Очищено ${cleanupReport.cleanedCells} значений` : "Файл уже очищен"}</b>{sourceFormat} → UTF-8 CSV</span></div>
        </div>
        <div className="cleanup-summary"><ShieldCheck size={17} /><div><b>15 защищённых технических колонок</b><span>Удалены старые ID кампании, адсетов и объявлений, даты запуска, ссылки предпросмотра, пиксели, старые Image Hash / Image File Name и привязки Instagram. Бюджеты, таргетинг, тексты и остальные параметры сохранены.{cleanupReport.repairedCreativeTypes > 0 ? ` Восстановлен Creative Type в ${cleanupReport.repairedCreativeTypes} строках с маркером POST_DELETED.` : ""}{cleanupReport.clearedDeletedCreativeTypes > 0 ? ` Очищен невалидный Creative Type в ${cleanupReport.clearedDeletedCreativeTypes} строках, где безопасное значение определить нельзя.` : ""}</span></div></div>
        {cleanupReport.missingColumns.length > 0 && <div className="cleanup-warning"><AlertCircle size={15} /> В загруженном файле отсутствуют {cleanupReport.missingColumns.length} ожидаемых колонок. Проверьте, что это полный экспорт Meta Ads.</div>}

        <div className="rename-workspace">
          <div className="rename-title"><div><h3>Найти и заменить в неймингах <HelpTip label="Массовая замена неймингов">Введите точный фрагмент текущего названия и новый текст. Замена применяется только к отмеченным уровням: Campaign Name, Ad Set Name и Ad Name. Остальные колонки CSV не изменяются.</HelpTip></h3><p>Работает как Ctrl+H. Можно последовательно заменить дату, модель, ID кабинета или любую часть названия.</p></div>{renameUndoCsv && <button className="undo-rename" type="button" onClick={undoNamingReplace}><RotateCcw size={14} /> Отменить последнюю замену</button>}</div>
          <div className="rename-form">
            <label><span className="control-label">Найти <HelpTip label="Что найти">Введите точный фрагмент старого нейминга: дату, модель оплаты, ID кабинета или любое другое сочетание символов. Поиск не использует регулярные выражения.</HelpTip></span><input value={renameFind} onChange={(event) => { setRenameFind(event.target.value); setRenameReport(null); }} placeholder="Например, 16_08" /></label>
            <ArrowRight className="rename-arrow" size={18} />
            <label><span className="control-label">Заменить на <HelpTip label="Новое значение">Введите новый фрагмент. Поле можно оставить пустым, если найденный текст нужно удалить из выбранных неймингов.</HelpTip></span><input value={renameReplace} onChange={(event) => { setRenameReplace(event.target.value); setRenameReport(null); }} placeholder="Например, 17_08" onKeyDown={(event) => { if (event.key === "Enter") handleNamingReplace(); }} /></label>
            <button className="replace-button" type="button" disabled={!renameFind || !Object.values(renameScopes).some(Boolean)} onClick={handleNamingReplace}><Search size={15} /> Заменить всё</button>
          </div>
          <div className="rename-options">
            <span className="control-label">Где заменять <HelpTip label="Область замены">Отметьте один или несколько уровней. Замена будет выполнена только в выбранных колонках неймингов и не затронет настройки кампании.</HelpTip></span>
            {(Object.entries(NAMING_COLUMNS) as [NamingScope, string][]).map(([scope, header]) => <label key={scope}><input type="checkbox" checked={renameScopes[scope]} onChange={(event) => setRenameScopes((value) => ({ ...value, [scope]: event.target.checked }))} /> {header}</label>)}
            <label className="case-option"><input type="checkbox" checked={renameCaseSensitive} onChange={(event) => setRenameCaseSensitive(event.target.checked)} /> Учитывать регистр <HelpTip label="Учитывать регистр">Если включено, значения Italian и italian считаются разными. Если выключено, поиск найдёт оба варианта.</HelpTip></label>
          </div>
          {renameReport && <div className={`rename-result ${renameReport.totalReplacements ? "is-success" : "is-empty"}`}>{renameReport.totalReplacements ? <CheckCircle2 size={16} /> : <CircleHelp size={16} />}<span>{renameReport.totalReplacements ? `Выполнено замен: ${renameReport.totalReplacements} · изменено строк: ${renameReport.changedRows}` : "Совпадений в выбранных неймингах не найдено"}</span></div>}
          <div className="naming-preview">{namingPreview.map((item) => <article key={item.scope}><div className="naming-preview-head"><b>{item.header}</b><span>{item.count} уникальных значений</span></div><div className="naming-values">{item.values.length ? item.values.map((value) => <code key={value}>{value}</code>) : <code>Колонка пуста или отсутствует</code>}</div></article>)}</div>
        </div>
      </section>}

      {csv && <div className="settings-block">
        <button className="settings-toggle" type="button" onClick={() => setShowSettings((value) => !value)}><span><Settings2 size={17} /> Настройки колонок и безопасности</span><span className="settings-summary">Источник: {columns.source || "не найден"}</span><ChevronDown className={showSettings ? "rotated" : ""} size={18} /></button>
        {showSettings && <div className="settings-content">
          <div className="settings-intro"><span>Проверьте автоматическое сопоставление колонок и правила записи новых креативов.</span><HelpTip label="Настройки колонок и безопасности">Автоматически выбранные значения обычно менять не нужно. Изменяйте их только если ваш CSV использует другие названия колонок или вам необходимо сохранить уже заполненные данные.</HelpTip></div>
          <div className="field-grid">
            <SelectField label="Название объявления" help="Колонка, из которой сервис читает нейминг объявления. Язык определяется по коду (SK), английскому, родному, русскому или украинскому названию в любой форме (Slovak, slovenčina, словацкий, словацкое, словацька) и по названию страны, поэтому в объявлении и в имени креатива его можно записать по-разному. Короткие коды, совпадающие с обычными словами (IS, CA, ID), учитываются только заглавными буквами. Если язык не найден, объявление связывается с креативом по любому общему слову (boy, бой); несколько объявлений с одним словом получают разные креативы. Регистр не учитывается. Для стандартного экспорта Meta оставьте Ad Name." value={columns.source} options={csv.headers} onChange={(source) => setColumns((value) => ({ ...value, source }))} />
            <SelectField label="Image File Name" help="Колонка, куда записывается точное имя JPG/PNG-файла из загруженного ZIP. Meta использует это имя при массовом импорте вместе с Image Hash." value={columns.imageFile} options={csv.headers} optional onChange={(imageFile) => setColumns((value) => ({ ...value, imageFile }))} />
            <SelectField label="Video File Name" help="Колонка для имени видеофайла. В текущем режиме автоматическое получение хэшей работает для изображений; видео потребует отдельной API-логики." value={columns.videoFile} options={csv.headers} optional onChange={(videoFile) => setColumns((value) => ({ ...value, videoFile }))} />
            <SelectField label="Image Hash" help="Колонка, куда записывается идентификатор изображения из медиатеки выбранного рекламного кабинета. Сервис получает его через официальный Meta Graph API." value={columns.imageHash} options={csv.headers} optional onChange={(imageHash) => setColumns((value) => ({ ...value, imageHash }))} />
          </div>
          <div className="toggle-grid">
            <label className="toggle-row"><input type="checkbox" checked={options.clearImageHash} onChange={(event) => setOptions((value) => ({ ...value, clearImageHash: event.target.checked }))} /><span><span className="toggle-heading"><b>Очищать старый Image Hash</b><HelpTip label="Очищать старый Image Hash">Удаляет хэш прежнего креатива из исходной кампании. После успешной сверки в эту же строку будет записан новый хэш изображения из выбранного кабинета.</HelpTip></span><small>Новый хеш будет записан после успешной сверки Meta</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={options.clearOtherMedia} onChange={(event) => setOptions((value) => ({ ...value, clearOtherMedia: event.target.checked }))} /><span><span className="toggle-heading"><b>Очищать противоположное медиа</b><HelpTip label="Очищать противоположное медиа">Если строке назначается изображение, сервис очищает поле видео; если назначается видео — очищает поле изображения. Это предотвращает конфликт двух типов медиа в одном объявлении.</HelpTip></span><small>Не оставлять одновременно image и video filename</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={options.overwriteExisting} onChange={(event) => setOptions((value) => ({ ...value, overwriteExisting: event.target.checked }))} /><span><span className="toggle-heading"><b>Заменять заполненные имена</b><HelpTip label="Заменять заполненные имена">Разрешает перезаписать старое значение Image File Name новым файлом из ZIP. Если выключить опцию, уже заполненные строки будут пропущены.</HelpTip></span><small>Иначе такие строки будут пропущены</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={options.sequentialFallback} onChange={(event) => setOptions((value) => ({ ...value, sequentialFallback: event.target.checked }))} /><span><span className="toggle-heading"><b>Последовательное распределение</b><HelpTip label="Последовательное распределение">Резервный режим для креативов без номера варианта. Файлы языка раздаются по порядку, и каждое объявление получает свой креатив, даже если файлов и объявлений разное количество. Лишние файлы остаются неиспользованными; если креативов меньше, чем объявлений, оставшиеся объявления нужно выбрать вручную.</HelpTip></span><small>Для файлов без номера варианта, по одному креативу на объявление</small></span></label>
          </div>
          <label className="encoding-field"><span>Кодировка при следующей загрузке CSV <HelpTip label="Кодировка CSV">Оставьте автоматическое определение. UTF-16 LE используется в оригинальных выгрузках Meta, UTF-8 — в большинстве уже обработанных CSV, Windows-1251 — только для старых русскоязычных файлов.</HelpTip></span><select value={encoding} onChange={(event) => setEncoding(event.target.value as EncodingMode)}><option value="auto">Определить автоматически</option><option value="utf-8">UTF-8</option><option value="utf-16le">UTF-16 LE (оригинальный экспорт Meta)</option><option value="windows-1251">Windows-1251</option></select></label>
        </div>}
      </div>}

      {csv && hasBothFiles && <>
        <div className="stats-grid"><article><span>Строк объявлений</span><strong>{stats.total}</strong></article><article className="stat--success"><span>Сопоставлено</span><strong>{stats.ready}</strong></article><article className={stats.errors ? "stat--danger" : "stat--success"}><span>Требуют внимания</span><strong>{stats.errors}</strong></article><article className={stats.unused ? "stat--warn" : ""}><span>Лишних файлов</span><strong>{stats.unused}</strong></article></div>
        {(duplicateNames.length > 0 || stats.unrecognizedFiles > 0 || ignoredFiles.length > 0 || csv.warnings.length > 0) && <div className="diagnostics"><div className="diagnostics-title"><CircleHelp size={17} /> Диагностика входных файлов</div>{duplicateNames.length > 0 && <p><b>Дубликаты имён:</b> {duplicateNames.slice(0, 5).join(", ")}{duplicateNames.length > 5 ? ` и ещё ${duplicateNames.length - 5}` : ""}. Переименуйте файлы, чтобы имена были уникальными.</p>}{stats.unrecognizedFiles > 0 && <p><b>Не распознан язык:</b> у {stats.unrecognizedFiles} креативов, и общих слов с объявлениями для них не нашлось. Они не назначены автоматически.</p>}{ignoredFiles.length > 0 && <p><b>Игнорируются:</b> {ignoredFiles.length} неподдерживаемых файлов внутри ZIP.</p>}{csv.warnings.length > 0 && <p><b>CSV:</b> {csv.warnings[0]}</p>}</div>}

        <section className="api-panel">
          <div className="api-environment-reminder"><Server size={17} /><span><b>Перед работой с API проверьте окружение:</b> нужный профиль AdsPower, закреплённый IP/прокси и рекламный кабинет того King, с которого выполняется залив.</span></div>
          <div className="api-panel-head"><div><div className="section-kicker">Официальный Meta Graph API</div><h2>{metaMode === "find" ? "Найти загруженные креативы" : "Загрузить креативы в Meta"}</h2><p>{metaMode === "find" ? "Сервис получит список изображений из выбранного кабинета и сопоставит их с файлами из ZIP." : "Сервис загрузит используемые JPG/PNG из ZIP ограниченной параллельной очередью, получит Image Hash из ответа Meta и подготовит CSV."}</p></div><div className="memory-badge"><LockKeyhole size={15} /><span><b>Сохранён только для вкладки</b>Передаётся напрямую в Meta Graph API и исчезнет после закрытия вкладки</span></div></div>
          <div className="api-mode-tabs" role="tablist" aria-label="Способ получения Image Hash">
            <button type="button" role="tab" aria-selected={metaMode === "find"} className={metaMode === "find" ? "active" : ""} onClick={() => { setMetaMode("find"); resetMetaResults(); setError(null); }}><Search size={16} /><span><b>Найти в Meta</b><small>Креативы уже загружены вручную</small></span></button>
            <button type="button" role="tab" aria-selected={metaMode === "upload"} className={metaMode === "upload" ? "active" : ""} onClick={() => { setMetaMode("upload"); resetMetaResults(); setError(null); }}><UploadCloud size={16} /><span><b>Загрузить в Meta</b><small>Отправить JPG/PNG прямо из ZIP</small></span></button>
          </div>
          {metaMode === "upload" && <div className="automation-risk-note"><ShieldCheck size={16} /><span>Одновременно отправляются не более трёх файлов. Image Hash приходит в ответе Meta без дополнительного запроса. Старый режим поиска уже загруженных изображений сохранён как резервный.</span></div>}
          <div className="api-form">
            <label className="api-field"><span><Database size={15} /> ID рекламного кабинета <HelpTip label="ID рекламного кабинета">Введите ID кабинета или вставьте целиком ссылку из Ads Manager — сервис возьмёт значение параметра act=. Значения business_id и global_scope_id не являются ID рекламного кабинета. Автоматически найденный по неймингу ID обязательно проверьте.</HelpTip></span><input value={accountId} autoComplete="off" placeholder="ID или ссылка из Ads Manager" onChange={(event) => { const extracted = extractAdAccountId(event.target.value); setAccountId(extracted); setAccountIdSource("manual"); resetMetaResults(); if (event.target.value.trim() && !extracted) setError("Не удалось найти ID кабинета. Вставьте числовой ID или ссылку Ads Manager с параметром act=."); else setError(null); }} /><small>{accountIdSource === "auto" ? "Определён по неймингу — обязательно сверьте с параметром act= в Ads Manager" : "Можно вставить ID или полную ссылку Ads Manager; используется только параметр act="}</small></label>
            <label className="api-field api-field--token"><span className="api-field-heading"><span><KeyRound size={15} /> Access token <HelpTip label="Meta Access Token">Для поиска достаточно ads_read или ads_management. Для загрузки изображений нужен ads_management и право управления выбранным кабинетом. Токен не попадает в CSV и хранится только в sessionStorage текущей вкладки.</HelpTip></span>{token && <button type="button" className="clear-token-button" onClick={clearToken} title="Удалить токен из текущей вкладки"><Trash2 size={13} /> Удалить</button>}</span><textarea value={token} autoComplete="off" spellCheck={false} placeholder={metaMode === "upload" ? "Вставьте токен с ads_management" : "Вставьте токен с ads_read или ads_management"} onChange={(event) => { setToken(event.target.value.trim()); resetMetaResults(); }} /><small>{metaMode === "upload" ? "Для загрузки нужен ads_management и доступ к кабинету" : "Передаётся напрямую на graph.facebook.com"}</small></label>
            <label className="api-field"><span><Link2 size={15} /> Версия API <HelpTip label="Версия Meta Graph API">Используйте актуальную версию по умолчанию. Старшую сохранённую версию выбирайте только если ваше Meta-приложение ещё не поддерживает текущую.</HelpTip></span><select value={graphVersion} onChange={(event) => { setGraphVersion(event.target.value as GraphVersion); resetMetaResults(); }}><option value="v26.0">v26.0</option><option value="v25.0">v25.0</option></select><small>По умолчанию используется текущая v26.0</small></label>
            {metaMode === "find" ? <button className="start-button" type="button" disabled={blockers || !accountId || !token || Boolean(busy)} onClick={handleMetaSync}>{busy === "meta" ? <Loader2 className="spin" size={18} /> : <Search size={18} />}<span>{busy === "meta" ? "Ищем креативы…" : "Найти креативы"}</span></button>
              : <button className="start-button start-button--upload" type="button" disabled={blockers || !accountId || !token || Boolean(busy) || imageCount === 0 || uploadComplete} onClick={() => handleMetaUpload(uploadStats.failed > 0)}>{busy === "meta-upload" ? <Loader2 className="spin" size={18} /> : uploadComplete ? <Check size={18} /> : uploadStats.failed > 0 ? <RotateCcw size={18} /> : <UploadCloud size={18} />}<span>{busy === "meta-upload" ? (uploadStats.active ? `Загрузка ${uploadStats.uploaded + uploadStats.failed + uploadStats.active}/${uploadStats.total}` : "Проверяем доступ к кабинету…") : uploadComplete ? "Все загружено" : uploadStats.failed > 0 ? `Повторить ошибки (${uploadStats.failed})` : `Загрузить изображения (${imageCount})`}</span></button>}
          </div>
          {videoCount > 0 && <div className="notice notice--error"><AlertCircle size={18} /><span>В текущем режиме поддерживаются только изображения. Для {videoCount} видео нужен отдельный запрос AdVideo и отдельная колонка Video ID.</span></div>}
          {metaMode === "upload" && uploadResults.length > 0 && <div className="upload-progress-card">
            <div><span><b>{busy === "meta-upload" ? "Загружаем изображения" : uploadStats.failed ? "Загрузка завершена с ошибками" : "Все изображения загружены"}</b><small>{uploadStats.uploaded} успешно · {uploadStats.failed} ошибок · всего {uploadStats.total}</small></span><strong>{uploadStats.total ? Math.round(((uploadStats.uploaded + uploadStats.failed) / uploadStats.total) * 100) : 0}%</strong></div>
            <div className="upload-progress-track"><i style={{ width: `${uploadStats.total ? ((uploadStats.uploaded + uploadStats.failed) / uploadStats.total) * 100 : 0}%` }} /></div>
          </div>}
          {metaCheckedAt && <div className={`api-result-summary ${metaReady ? "is-ready" : "is-error"}`}><div>{metaReady ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}<span><b>{metaReady ? (metaMode === "upload" ? "Все изображения загружены" : "Все изображения подтверждены") : (metaMode === "upload" ? "Не все изображения загружены" : "Сверка не пройдена")}</b>{metaMode === "upload" ? `Загружено: ${uploadStats.uploaded} · ошибок: ${uploadStats.failed}` : `Получено из Meta: ${metaImages.length} · совпало: ${metaStats.matched} · не найдено: ${metaStats.missing} · конфликтов: ${metaStats.ambiguous}`}</span></div><small>Проверено {metaCheckedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></div>}
          {metaMode === "find" && metaMatches.length > 0 && <div className="hash-table-wrap"><table className="hash-table"><thead><tr><th>Файл из ZIP</th><th>AdImage.name из Meta</th><th>Image Hash</th><th>Результат</th></tr></thead><tbody>{metaMatches.map((match) => <tr key={match.fileId} className={match.status !== "matched" ? "row--error" : ""}><td><div className="creative-cell"><ImageIcon size={15} /><span title={match.fileName}>{match.fileName}</span></div></td><td>{match.image?.name || (match.candidates.length ? `${match.candidates.length} совпадения` : "—")}</td><td><code title={match.image?.hash}>{match.image ? `${accountId}:${match.image.hash}` : "—"}</code></td><td><span className={`status status--${match.status === "matched" ? "ready" : "missing"}`}>{match.status === "matched" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{match.status === "matched" ? "Подтверждено" : match.status === "ambiguous" ? "Конфликт" : "Не найдено"}</span><div className="secondary-cell">{match.reason}</div></td></tr>)}</tbody></table></div>}
          {metaMode === "upload" && uploadResults.length > 0 && <div className="hash-table-wrap"><table className="hash-table"><thead><tr><th>Файл из ZIP</th><th>Попытка</th><th>Image Hash</th><th>Результат</th></tr></thead><tbody>{uploadResults.map((item) => <tr key={item.fileId} className={item.status === "failed" ? "row--error" : ""}><td><div className="creative-cell"><ImageIcon size={15} /><span title={item.fileName}>{item.fileName}</span></div></td><td>{item.attempts || "—"}</td><td><code title={item.image?.hash}>{item.image ? `${accountId}:${item.image.hash}` : "—"}</code></td><td><span className={`status status--${item.status === "uploaded" ? "ready" : item.status === "failed" ? "missing" : "existing"}`}>{item.status === "uploading" ? <Loader2 className="spin" size={14} /> : item.status === "uploaded" ? <CheckCircle2 size={14} /> : item.status === "failed" ? <AlertCircle size={14} /> : null}{item.status === "uploading" ? "Загрузка" : item.status === "uploaded" ? "Загружено" : item.status === "failed" ? "Ошибка" : "Ожидает"}</span><div className="secondary-cell">{item.error || (item.status === "uploaded" ? "Хеш получен и будет записан в CSV" : "")}</div></td></tr>)}</tbody></table></div>}
          {apiLogs.length > 0 && <section className="api-log-panel">
            <div className="api-log-toolbar"><button className="api-log-toggle" type="button" onClick={() => setShowApiLogs((value) => !value)}><Code2 size={17} /><span><b>Лог ответов Meta API</b><small>{apiLogs.length} {apiLogs.length === 1 ? "ответ" : "ответа/ответов"} · токен удалён</small></span><ChevronDown className={showApiLogs ? "rotated" : ""} size={17} /></button><div className="api-log-actions"><button type="button" onClick={handleCopyLog}>{logCopied ? <Check size={15} /> : <Clipboard size={15} />}{logCopied ? "Скопировано" : "Копировать JSON"}</button><button type="button" onClick={() => downloadText(apiLogJson, `meta_api_log_${accountId || "unknown"}.json`, "application/json;charset=utf-8")}><Download size={15} /> Скачать JSON</button><button className="danger-action" type="button" aria-label="Очистить лог" title="Очистить лог" onClick={() => { setApiLogs([]); setShowApiLogs(false); }}><Trash2 size={15} /></button></div></div>
            {showApiLogs && <div className="api-log-body"><div className="api-log-note"><LockKeyhole size={14} /> Показан полный JSON ответа, кроме секретов: <code>access_token</code> и <code>appsecret_proof</code> автоматически удаляются.</div><pre>{apiLogJson}</pre></div>}
          </section>}
          {metaCheckedAt && !columns.imageHash && <div className="notice notice--error"><AlertCircle size={18} /><span>В CSV не найдена колонка Image Hash. Выберите её в настройках колонок.</span></div>}
        </section>

        <section className="results-panel">
          <div className="results-toolbar"><div><div className="section-kicker">Предварительная проверка</div><h2>Сопоставление объявлений и файлов</h2></div><div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти объявление или файл" /></div></div>
          <div className="filter-row">{([["all", `Все ${mappings.filter((item) => item.status !== "skipped").length}`], ["ready", `Готово ${stats.ready}`], ["errors", `Ошибки ${stats.errors}`], ["manual", `Вручную ${stats.manual}`]] as [Filter, string][]).map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
          <div className="table-wrap"><table><thead><tr><th>Строка</th><th>Название объявления</th><th>Ключ</th><th>Файл креатива</th><th>Статус</th></tr></thead><tbody>
            {filteredMappings.slice(0, 500).map((mapping) => {
              const isError = ["missing", "ambiguous", "no-language"].includes(mapping.status);
              return <tr key={mapping.rowIndex} className={isError ? "row--error" : ""}>
                <td className="row-number">{mapping.sheetRow}</td>
                <td><div className="primary-cell" title={mapping.sourceName}>{mapping.sourceName || "—"}</div><div className="secondary-cell">{mapping.reason}</div></td>
                <td><div className="key-cell">{mapping.analysis.languageCode ?? "?"}<span>:</span>{mapping.analysis.variant ?? "?"}</div></td>
                <td><CreativePicker key={`${mapping.rowIndex}:${mapping.file?.id ?? "empty"}:${mapping.status}`} rowNumber={mapping.sheetRow} creatives={creatives} file={mapping.file} previewUrls={previewUrls} selectedId={manualOverrides[mapping.rowIndex]}
                  onSelect={(fileId) => setManualOverrides((value) => fileId ? ({ ...value, [mapping.rowIndex]: fileId }) : Object.fromEntries(Object.entries(value).filter(([key]) => Number(key) !== mapping.rowIndex)))} /></td>
                <td><span className={`status status--${mapping.status}`}>{mapping.status === "ready" || mapping.status === "manual" ? <CheckCircle2 size={14} /> : isError ? <AlertCircle size={14} /> : null}{statusLabels[mapping.status]}</span></td>
              </tr>;
            })}
          </tbody></table>{filteredMappings.length > 500 && <div className="table-limit">Показаны первые 500 из {filteredMappings.length} строк. Используйте поиск и фильтры.</div>}{!filteredMappings.length && <div className="empty-table">Нет строк, соответствующих фильтру.</div>}</div>
        </section>

        <div className={`download-panel ${finalBlockers ? "is-blocked" : ""}`}><div className="download-copy"><div className="download-icon">{finalBlockers ? <AlertCircle size={22} /> : <Check size={22} />}</div><div><strong>{finalBlockers ? "Готовый CSV пока заблокирован" : "CSV с подтверждёнными хешами готов"}</strong><span>{blockers ? "Сначала устраните ошибки сопоставления объявлений и файлов." : videoCount ? "Видео пока не поддерживаются этим API-режимом." : !metaReady ? (metaMode === "upload" ? "Вставьте токен с ads_management и загрузите все изображения в выбранный кабинет." : "Вставьте токен и добейтесь точного совпадения каждого изображения.") : `В ${imageCount} строках будут заполнены Image File Name и Image Hash.`}</span></div></div><div className="download-actions"><button className="secondary-button" type="button" onClick={() => csv && downloadText("\ufeff" + createReportCsv(mappings), "creative_mapping_report.csv")}><Download size={16} /> Отчёт</button><button className="primary-button" type="button" onClick={handleDownloadCsv} disabled={finalBlockers}><FileSpreadsheet size={16} /> Скачать готовый CSV</button></div></div>
        {!finalBlockers && <section className="meta-steps"><div className="section-kicker">Финальный шаг</div><h2>Импортируйте только готовый CSV</h2><div className="meta-step-grid"><div><b>1</b><span><strong>Проверьте файл</strong><small>В колонках уже стоят точные имена и хеши из выбранного кабинета.</small></span></div><div><b>2</b><span><strong>Import ads</strong><small>В Ads Manager выберите готовый CSV.</small></span></div><div><b>3</b><span><strong>Preview</strong><small>Убедитесь, что Meta показала изображения без Image Not Found.</small></span></div><div><b>4</b><span><strong>Import</strong><small>Завершите импорт кампании.</small></span></div></div><p className="meta-steps-note">Повторно добавлять ZIP в Images не требуется: CSV ссылается на изображения по хешам этого рекламного кабинета.</p></section>}
      </>}
      {(csv || zipSourceFile) && <button className="reset-button" onClick={reset}><RotateCcw size={15} /> Начать заново</button>}
    </section>

    <section className="how-it-works"><div><span>01</span><strong>Загрузите экспорт Meta</strong><p>Поддерживается оригинальный UTF-16/TAB без ручной конвертации.</p></div><div><span>02</span><strong>Обновите нейминги</strong><p>Очистка выполнится автоматически, а массовая замена работает как Ctrl+H.</p></div><div><span>03</span><strong>Получите хэши</strong><p>Найдите готовые изображения в Meta или загрузите JPG/PNG прямо из ZIP.</p></div><div><span>04</span><strong>Скачайте CSV</strong><p>Готовый файл можно сразу импортировать в Ads Manager.</p></div></section>
    <footer><span>Creative Extractor · v1.8.0</span><span>Файлы обрабатываются локально. Токен хранится только до закрытия текущей вкладки.</span></footer>
  </main>;
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeName,
  buildMappings,
  cleanMetaExport,
  createCreativeFile,
  createOutputRows,
  detectColumns,
  META_CLEANUP_COLUMNS,
  parseCsvFile,
  replaceInNamingColumns,
  serializeCsv,
  type MappingOptions,
  type ParsedCsv,
} from "../app/lib/mapper.ts";
import JSZip from "jszip";
import { createMetaImportKit, metaImportKitFileName } from "../app/lib/import-package.ts";
import { fetchAllAdImages, inferAdAccountIds, matchFilesToMetaImages } from "../app/lib/meta-api.ts";

const options: MappingOptions = {
  sequentialFallback: false,
  clearImageHash: true,
  clearOtherMedia: true,
  overwriteExisting: true,
};

test("reads the original UTF-16 LE tab-separated Meta export", async () => {
  const source = "Campaign ID\tCampaign Name\tAd Name\r\ncg:123\tCampaign_16_08\tAd_16_08_123\r\n";
  const encoded = Buffer.from(source, "utf16le");
  const bytes = new Uint8Array(encoded.length + 2);
  bytes.set([0xff, 0xfe]);
  bytes.set(encoded, 2);
  const file = { name: "export.csv", arrayBuffer: async () => bytes.buffer } as File;
  const parsed = await parseCsvFile(file);
  assert.equal(parsed.encoding, "utf-16le");
  assert.equal(parsed.delimiter, "\t");
  assert.equal(parsed.rows[0][1], "Campaign_16_08");
});

test("cleans only the 15 verified technical Meta columns and normalizes the output", () => {
  const headers = [...META_CLEANUP_COLUMNS, "Campaign Name", "Campaign Daily Budget", "Countries", "Body"];
  const csv: ParsedCsv = {
    fileName: "export.csv",
    headers,
    rows: [headers.map((header) => header === "Campaign Name" ? "Glitzbets_16_08" : header === "Campaign Daily Budget" ? "500" : header === "Countries" ? "IT, ES" : header === "Body" ? "Text" : `old:${header}`)],
    delimiter: "\t", linebreak: "\r\n", hadBom: true, encoding: "utf-16le", warnings: [],
  };
  const cleaned = cleanMetaExport(csv);
  for (const header of META_CLEANUP_COLUMNS) assert.equal(cleaned.csv.rows[0][headers.indexOf(header)], "");
  assert.equal(cleaned.csv.rows[0][headers.indexOf("Campaign Name")], "Glitzbets_16_08");
  assert.equal(cleaned.csv.rows[0][headers.indexOf("Campaign Daily Budget")], "500");
  assert.equal(cleaned.csv.rows[0][headers.indexOf("Countries")], "IT, ES");
  assert.equal(cleaned.csv.rows[0][headers.indexOf("Body")], "Text");
  assert.equal(cleaned.report.cleanedCells, 15);
  assert.equal(cleaned.report.repairedCreativeTypes, 0);
  assert.equal(cleaned.report.clearedDeletedCreativeTypes, 0);
  assert.equal(cleaned.csv.delimiter, ",");
  assert.equal(cleaned.csv.encoding, "utf-8");
});

test("repairs POST_DELETED Creative Type from a valid sibling without changing other fields", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv",
    headers: ["Campaign Name", "Ad Set Name", "Ad Name", "Creative Type", "Body"],
    rows: [
      ["Campaign", "Italian", "Ad 1", "Link Page Post Ad", "Text 1"],
      ["Campaign", "Italian", "Ad 2", "POST_DELETED", "Text 2"],
      ["Campaign", "French", "Ad 3", "POST_DELETED", "Text 3"],
    ],
    delimiter: "\t", linebreak: "\r\n", hadBom: true, encoding: "utf-16le", warnings: [],
  };
  const cleaned = cleanMetaExport(csv);
  assert.deepEqual(cleaned.csv.rows.map((row) => row[3]), ["Link Page Post Ad", "Link Page Post Ad", "Link Page Post Ad"]);
  assert.deepEqual(cleaned.csv.rows.map((row) => row[4]), ["Text 1", "Text 2", "Text 3"]);
  assert.equal(cleaned.report.repairedCreativeTypes, 2);
  assert.equal(cleaned.report.clearedDeletedCreativeTypes, 0);
});

test("clears POST_DELETED when a valid Creative Type is ambiguous", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv",
    headers: ["Campaign Name", "Ad Set Name", "Ad Name", "Creative Type"],
    rows: [
      ["Campaign", "Italian", "Ad 1", "Link Page Post Ad"],
      ["Campaign", "Italian", "Ad 2", "Video Page Post Ad"],
      ["Campaign", "Italian", "Ad 3", "POST_DELETED"],
    ],
    delimiter: "\t", linebreak: "\r\n", hadBom: true, encoding: "utf-16le", warnings: [],
  };
  const cleaned = cleanMetaExport(csv);
  assert.equal(cleaned.csv.rows[2][3], "");
  assert.equal(cleaned.report.repairedCreativeTypes, 0);
  assert.equal(cleaned.report.clearedDeletedCreativeTypes, 1);
  assert.equal(cleaned.csv.rows.flat().includes("POST_DELETED"), false);
});

test("find and replace is limited to the three naming columns", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv",
    headers: ["Campaign Name", "Ad Set Name", "Ad Name", "Body", "Link"],
    rows: [["Campaign_16_08", "AdSet_16_08", "Ad_16_08_123", "Text 16_08", "https://site/16_08"]],
    delimiter: ",", linebreak: "\r\n", hadBom: true, encoding: "utf-8", warnings: [],
  };
  const replaced = replaceInNamingColumns(csv, "16_08", "17_08", ["campaign", "adSet", "ad"]);
  assert.deepEqual(replaced.csv.rows[0], ["Campaign_17_08", "AdSet_17_08", "Ad_17_08_123", "Text 16_08", "https://site/16_08"]);
  assert.equal(replaced.report.totalReplacements, 3);
  assert.equal(replaced.report.changedRows, 1);

  const account = replaceInNamingColumns(replaced.csv, "123", "999", ["ad"]);
  assert.equal(account.csv.rows[0][0], "Campaign_17_08");
  assert.equal(account.csv.rows[0][2], "Ad_17_08_999");
});

test("recognizes English, Ukrainian, Russian and code aliases without case sensitivity", () => {
  assert.deepEqual(analyzeName("Glitzbets_AGENT_Pur150_Italian_3_2584265315371042"), {
    languageCode: "IT",
    languageLabel: "Итальянский",
    variant: 3,
    matchedAlias: "italian",
    ambiguousLanguages: [],
  });
  assert.equal(analyzeName("Creo_ІТАЛІЙСЬКА_v2.png").languageCode, "IT");
  assert.equal(analyzeName("Креатив_ПОЛЬСКИЙ-01.jpg").languageCode, "PL");
  assert.equal(analyzeName("asset_cz_3.jpg").languageCode, "CS");
});

test("recognizes Swedish regardless of case and accepts standard and common codes", () => {
  const ad = analyzeName("Gamboria_2_17-08_pur150_Swedish_1_1010735508109581");
  const file = analyzeName("swedish_1_uniq_623973.jpg");
  assert.equal(ad.languageCode, "SV");
  assert.equal(ad.variant, 1);
  assert.equal(file.languageCode, "SV");
  assert.equal(file.variant, 1);
  assert.equal(analyzeName("CREO_SV_2.jpg").languageCode, "SV");
  assert.equal(analyzeName("creative_SE_3.jpg").languageCode, "SV");
  assert.equal(analyzeName("asset_swe_v4.jpg").languageCode, "SV");
  assert.equal(analyzeName("баннер_ШВЕДСЬКА_5.jpg").languageCode, "SV");
});

test("recognizes curated two-letter, three-letter and localized language aliases", () => {
  assert.equal(analyzeName("creative_SPA_1.jpg").languageCode, "ES");
  assert.equal(analyzeName("creative_SP_2.jpg").languageCode, "ES");
  assert.equal(analyzeName("creative_DEU_3.jpg").languageCode, "DE");
  assert.equal(analyzeName("creative_ČEŠTINA_1.jpg").languageCode, "CS");
  assert.equal(analyzeName("creative_TÜRKÇE_1.jpg").languageCode, "TR");
  assert.equal(analyzeName("creative_ΕΛΛΗΝΙΚΆ_1.jpg").languageCode, "EL");
});

test("keeps Brazilian Portuguese distinct from Portugal Portuguese", () => {
  const brazil = analyzeName("promo_PT-BR_v2.mp4");
  const portugal = analyzeName("promo_Portuguese_2.mp4");
  assert.equal(brazil.languageCode, "PT-BR");
  assert.equal(brazil.variant, 2);
  assert.equal(portugal.languageCode, "PT");
});

test("does not match a short language code inside another word", () => {
  assert.equal(analyzeName("deposit_winner_1.jpg").languageCode, null);
  assert.equal(analyzeName("credit_title_2.jpg").languageCode, null);
});

test("maps by language and variant and changes only media columns", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv",
    headers: ["Campaign Name", "Ad Name", "Image Hash", "Image File Name", "Video File Name", "Body"],
    rows: [["Campaign", "Glitzbets_Italian_3_123", "oldhash", "old.jpg", "", "Text, with comma"]],
    delimiter: ",",
    linebreak: "\r\n",
    hadBom: true,
    encoding: "utf-8",
    warnings: [],
  };
  const creative = createCreativeFile("folder/unique_IT_3_a91.jpg", 100)!;
  const columns = detectColumns(csv.headers);
  const mappings = buildMappings(csv, [creative], columns, options);
  assert.equal(mappings[0].status, "ready");
  const output = createOutputRows(csv, mappings, columns, options);
  assert.deepEqual(output[0], ["Campaign", "Glitzbets_Italian_3_123", "", "unique_IT_3_a91.jpg", "", "Text, with comma"]);
  const rendered = serializeCsv(csv, output);
  assert.ok(rendered.startsWith("\ufeff"));
  assert.ok(rendered.includes('"Text, with comma"'));
});

test("writes the verified account-prefixed image hash into the CSV", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv",
    headers: ["Ad Name", "Image Hash", "Image File Name"],
    rows: [["Glitzbets_Italian_1_1330165429102103", "old", "old.jpg"]],
    delimiter: ",", linebreak: "\n", hadBom: false, encoding: "utf-8", warnings: [],
  };
  const creative = createCreativeFile("Italian_GLITZ_1.jpg", 100)!;
  const columns = detectColumns(csv.headers);
  const mappings = buildMappings(csv, [creative], columns, options);
  const output = createOutputRows(csv, mappings, columns, options, {
    [creative.id]: "1330165429102103:756cb17df20ac112cb20ce1833c61bda",
  });
  assert.equal(output[0][1], "1330165429102103:756cb17df20ac112cb20ce1833c61bda");
  assert.equal(output[0][2], "Italian_GLITZ_1.jpg");
});

test("infers one ad account ID from the terminal token in ad names", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv", headers: ["Ad Name"],
    rows: [["Glitzbets_Italian_1_1330165429102103"], ["Glitzbets_Polish_2_1330165429102103"]],
    delimiter: ",", linebreak: "\n", hadBom: false, encoding: "utf-8", warnings: [],
  };
  assert.deepEqual(inferAdAccountIds(csv, "Ad Name"), ["1330165429102103"]);
});

test("matches a ZIP image only when AdImage.name is unique", () => {
  const creative = createCreativeFile("folder/Italian_GLITZ_1.JPG", 100)!;
  const matched = matchFilesToMetaImages([creative], [
    { name: "Italian_GLITZ_1.jpg", hash: "aaa" },
    { name: "Polish_GLITZ_1.jpg", hash: "bbb" },
  ]);
  assert.equal(matched[0].status, "matched");
  assert.equal(matched[0].image?.hash, "aaa");

  const ambiguous = matchFilesToMetaImages([creative], [
    { name: "Italian_GLITZ_1.jpg", hash: "aaa" },
    { name: "Italian_GLITZ_1.JPG", hash: "ccc" },
  ]);
  assert.equal(ambiguous[0].status, "ambiguous");
  assert.equal(ambiguous[0].image, null);
});

test("matches the numeric suffix Meta appends after the image extension", () => {
  const creative = createCreativeFile("Italian_GLITZ_2_uniq_121207.jpg", 100)!;
  const matched = matchFilesToMetaImages([creative], [
    { name: "Italian_GLITZ_2_uniq_121207.jpg_105", hash: "meta-hash" },
  ]);
  assert.equal(matched[0].status, "matched");
  assert.equal(matched[0].image?.hash, "meta-hash");
  assert.match(matched[0].reason, /суффикса Meta/);
});

test("matches the exact Polish filename and random Meta suffix shown in the API log", () => {
  const creative = createCreativeFile("Polish_GLITZ_2_uniq_745759.jpg", 100)!;
  const matched = matchFilesToMetaImages([creative], [
    { name: "Polish_GLITZ_2_uniq_745759.jpg_105", hash: "bf06e2577be7a82df21ebae9a262eeb1" },
  ]);
  assert.equal(matched[0].status, "matched");
  assert.equal(matched[0].image?.hash, "bf06e2577be7a82df21ebae9a262eeb1");
});

test("normalizes invisible characters, jpeg aliases and arbitrary Meta suffix numbers", () => {
  const creative = createCreativeFile("Polish_GLITZ_2_uniq_745759.jpeg", 100)!;
  const matched = matchFilesToMetaImages([creative], [
    { name: "Polish_\u200BGLITZ_2_uniq_745759.jpg_987654", hash: "normalized" },
  ]);
  assert.equal(matched[0].status, "matched");
  assert.equal(matched[0].image?.hash, "normalized");
});

test("reports a conflict when several Meta suffix variants point to different hashes", () => {
  const creative = createCreativeFile("Italian_GLITZ_2_uniq_121207.jpg", 100)!;
  const ambiguous = matchFilesToMetaImages([creative], [
    { name: "Italian_GLITZ_2_uniq_121207.jpg_105", hash: "first" },
    { name: "Italian_GLITZ_2_uniq_121207.jpg_106", hash: "second" },
  ]);
  assert.equal(ambiguous[0].status, "ambiguous");
  assert.equal(ambiguous[0].candidates.length, 2);
});

test("does not strip numbers that are part of the filename before its extension", () => {
  const creative = createCreativeFile("Italian_GLITZ_105.jpg", 100)!;
  const matched = matchFilesToMetaImages([creative], [
    { name: "Italian_GLITZ_105.jpg_105", hash: "correct" },
    { name: "Italian_GLITZ.jpg_105", hash: "wrong" },
  ]);
  assert.equal(matched[0].status, "matched");
  assert.equal(matched[0].image?.hash, "correct");
});

test("reads every Meta pagination page and sends the token only in Authorization", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const logs: unknown[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const authorization = new Headers(init?.headers).get("Authorization");
    calls.push({ url, authorization });
    const body = calls.length === 1
      ? { data: [{ name: "Italian_GLITZ_1.jpg", hash: "aaa" }], paging: { next: "https://graph.facebook.com/v26.0/next-page?after=cursor&access_token=secret-token" } }
      : { data: [{ name: "Polish_GLITZ_1.jpg", hash: "bbb" }] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const images = await fetchAllAdImages({ accountId: "1330165429102103", token: "secret-token", onLog: (entry) => logs.push(entry) });
    assert.equal(images.length, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].authorization, "Bearer secret-token");
    assert.equal(calls[0].url.includes("secret-token"), false);
    assert.equal(calls[1].url.includes("secret-token"), false);
    assert.equal(logs.length, 2);
    assert.equal(JSON.stringify(logs).includes("secret-token"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refuses to guess when two files have the same matching key", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv",
    headers: ["Ad Name", "Image File Name"],
    rows: [["Ad_Spanish_1", ""]],
    delimiter: ",",
    linebreak: "\n",
    hadBom: false,
    encoding: "utf-8",
    warnings: [],
  };
  const files = [createCreativeFile("ES_1_a.jpg", 1)!, createCreativeFile("ES_1_b.jpg", 1)!];
  const mappings = buildMappings(csv, files, detectColumns(csv.headers), options);
  assert.equal(mappings[0].status, "ambiguous");
  assert.equal(mappings[0].file, null);
});

test("automatically uses the only remaining language file when its variant number is absent", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv",
    headers: ["Ad Name", "Image File Name"],
    rows: [
      ["Gamboria_Slovenian_1_1010735508109581", ""],
      ["Gamboria_Slovenian_2_1010735508109581", ""],
      ["Gamboria_Slovenian_3_1010735508109581", ""],
    ],
    delimiter: ",", linebreak: "\n", hadBom: false, encoding: "utf-8", warnings: [],
  };
  const files = [
    createCreativeFile("slovenian__uniq_213308.jpg", 1)!,
    createCreativeFile("slovenian_2_uniq_231469.jpg", 1)!,
    createCreativeFile("slovenian_3_uniq_980977.jpg", 1)!,
  ];
  const mappings = buildMappings(csv, files, detectColumns(csv.headers), { ...options, sequentialFallback: true });
  assert.deepEqual(mappings.map((mapping) => mapping.status), ["ready", "ready", "ready"]);
  assert.equal(mappings[0].file?.name, "slovenian__uniq_213308.jpg");
});

test("maps the exact Slovenian and Swedish names from the uploaded campaign and ZIP", () => {
  const csv: ParsedCsv = {
    fileName: "export_20260817_2340.csv",
    headers: ["Ad Name", "Image File Name"],
    rows: [
      ["Gambloria_2_10-08_pur150_Slovene_3_1010735508109581", ""],
      ["Gambloria_2_10-08_pur150_Slovenian_2_1010735508109581", ""],
      ["Gambloria_2_10-08_Slovenian_1_1010735508109581", ""],
      ["Gambloria_2_10-08_pur150_Swedish_1_1010735508109581", ""],
      ["Gambloria_2_10-08_pur150_Swedish_2_1010735508109581", ""],
      ["Gambloria_2_10-08_pur150_Swedish_3_1010735508109581", ""],
    ],
    delimiter: "\t", linebreak: "\r\n", hadBom: true, encoding: "utf-16le", warnings: [],
  };
  const files = [
    "slovenian__uniq_469782.jpg", "slovenian_2_uniq_283831.jpg", "slovenian_3_uniq_833759.jpg",
    "swedish_1_uniq_680302.jpg", "swedish_2_uniq_772541.jpg", "swedish_3_uniq_308456.jpg",
  ].map((name) => createCreativeFile(name, 1)!);
  const mappings = buildMappings(csv, files, detectColumns(csv.headers), { ...options, sequentialFallback: true });
  assert.deepEqual(mappings.map((mapping) => mapping.status), ["ready", "ready", "ready", "ready", "ready", "ready"]);
  assert.equal(mappings[2].file?.name, "slovenian__uniq_469782.jpg");
  assert.deepEqual(mappings.slice(3).map((mapping) => mapping.analysis.languageCode), ["SV", "SV", "SV"]);
});

test("uses a unique missing-number leftover even when sequential fallback is disabled", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv", headers: ["Ad Name", "Image File Name"],
    rows: [["Ad_Slovenian_1", ""], ["Ad_Slovenian_2", ""], ["Ad_Slovenian_3", ""]],
    delimiter: ",", linebreak: "\n", hadBom: false, encoding: "utf-8", warnings: [],
  };
  const files = [
    createCreativeFile("slovenian__uniq_469782.jpg", 1)!,
    createCreativeFile("slovenian_2_uniq_283831.jpg", 1)!,
    createCreativeFile("slovenian_3_uniq_833759.jpg", 1)!,
  ];
  const mappings = buildMappings(csv, files, detectColumns(csv.headers), options);
  assert.deepEqual(mappings.map((mapping) => mapping.status), ["ready", "ready", "ready"]);
  assert.equal(mappings[0].file?.name, "slovenian__uniq_469782.jpg");
});

test("sequential fallback is deterministic for equal no-number groups and rejects explicit conflicts", () => {
  const csv: ParsedCsv = {
    fileName: "meta.csv",
    headers: ["Ad Name", "Image File Name"],
    rows: [["Ad_Swedish", ""], ["Ad_SV", ""]],
    delimiter: ",", linebreak: "\n", hadBom: false, encoding: "utf-8", warnings: [],
  };
  const files = [createCreativeFile("swedish_beta.jpg", 1)!, createCreativeFile("swedish_alpha.jpg", 1)!];
  const mappings = buildMappings(csv, files, detectColumns(csv.headers), { ...options, sequentialFallback: true });
  assert.deepEqual(mappings.map((mapping) => mapping.file?.name), ["swedish_alpha.jpg", "swedish_beta.jpg"]);

  const conflictCsv = { ...csv, rows: [["Ad_Swedish_1", ""]] };
  const conflict = buildMappings(conflictCsv, [createCreativeFile("swedish_2.jpg", 1)!], detectColumns(csv.headers), { ...options, sequentialFallback: true });
  assert.equal(conflict[0].status, "missing");
  assert.equal(conflict[0].file, null);
});

test("builds a Meta import kit with a flat image ZIP and raw videos", async () => {
  const source = new JSZip();
  source.file("nested/Italian_GLITZ_1.jpg", new Uint8Array([1, 2, 3]));
  source.file("nested/Spanish_GLITZ_2.mp4", new Uint8Array([4, 5, 6]));
  const sourceBytes = await source.generateAsync({ type: "uint8array" });
  const image = createCreativeFile("nested/Italian_GLITZ_1.jpg", 3)!;
  const video = createCreativeFile("nested/Spanish_GLITZ_2.mp4", 3)!;

  const kit = await createMetaImportKit({
    sourceZip: sourceBytes.buffer as ArrayBuffer,
    csvContent: "Ad Name,Image File Name\r\nAd_Italian_1,Italian_GLITZ_1.jpg",
    csvFileName: "campaign_with_creatives.csv",
    sourceCsvFileName: "campaign.csv",
    creatives: [image, video, image],
  });

  assert.equal(kit.fileName, metaImportKitFileName("campaign.csv"));
  assert.equal(kit.imageCount, 1);
  assert.equal(kit.videoCount, 1);
  const outer = await JSZip.loadAsync(kit.bytes);
  assert.ok(outer.file("01_campaign_with_creatives.csv"));
  assert.ok(outer.file("README_RU.txt"));
  assert.ok(outer.file("03_videos_for_Meta/Spanish_GLITZ_2.mp4"));
  const imageZipBytes = await outer.file("02_images_for_Meta.zip")!.async("uint8array");
  const images = await JSZip.loadAsync(imageZipBytes);
  assert.ok(images.file("Italian_GLITZ_1.jpg"));
  assert.equal(images.file("nested/Italian_GLITZ_1.jpg"), null);
});

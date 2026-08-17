import JSZip from "jszip";
import type { CreativeFile } from "./mapper";

export const META_BULK_IMPORT_HELP_URL = "https://www.facebook.com/business/help/257638938498557";

export type MetaImportKit = {
  bytes: Uint8Array;
  fileName: string;
  csvFileName: string;
  imageArchiveName: string | null;
  imageCount: number;
  videoCount: number;
};

function baseName(fileName: string): string {
  return fileName.replace(/\.(csv|txt)$/i, "").replace(/[\\/:*?\"<>|]+/g, "_").trim() || "meta_campaign";
}

export function metaImportKitFileName(inputName: string): string {
  return `${baseName(inputName)}_meta_import_kit.zip`;
}

function uniqueCreatives(creatives: CreativeFile[]): CreativeFile[] {
  const seen = new Set<string>();
  return creatives.filter((creative) => {
    if (seen.has(creative.id)) return false;
    seen.add(creative.id);
    return true;
  });
}

function readmeText(csvFileName: string, imageArchiveName: string | null, videoCount: number): string {
  const lines = [
    "КОМПЛЕКТ ДЛЯ ИМПОРТА В META ADS MANAGER",
    "",
    "ВАЖНО: Image File Name не ищет ранее загруженный ассет в медиатеке рекламного кабинета по имени.",
    "Файл креатива нужно добавить вместе с таблицей в том же окне Import ads.",
    "",
    "ПОРЯДОК ИМПОРТА",
    "1. Распакуйте этот комплект.",
    "2. В Meta Ads Manager откройте More → Import ads.",
    `3. В секции File выберите: ${csvFileName}`,
  ];
  if (imageArchiveName) lines.push(`4. В секции Images загрузите: ${imageArchiveName}`);
  if (videoCount) lines.push(`${imageArchiveName ? "5" : "4"}. В секции Videos выберите все файлы из папки 03_videos_for_Meta.`);
  lines.push(
    `${imageArchiveName && videoCount ? "6" : imageArchiveName || videoCount ? "5" : "4"}. Запустите импорт и проверьте предварительный просмотр.`,
    "",
    "Не переименовывайте креативы после создания комплекта: имена должны точно совпадать с Image File Name / Video File Name в CSV.",
    "",
    `Официальная инструкция Meta: ${META_BULK_IMPORT_HELP_URL}`,
  );
  return lines.join("\r\n");
}

export async function createMetaImportKit({
  sourceZip,
  csvContent,
  csvFileName,
  sourceCsvFileName,
  creatives,
}: {
  sourceZip: ArrayBuffer;
  csvContent: string;
  csvFileName: string;
  sourceCsvFileName: string;
  creatives: CreativeFile[];
}): Promise<MetaImportKit> {
  const sourceArchive = await JSZip.loadAsync(sourceZip);
  const files = uniqueCreatives(creatives);
  const images = files.filter((file) => file.mediaType === "image");
  const videos = files.filter((file) => file.mediaType === "video");
  const kit = new JSZip();
  const packagedCsvName = `01_${csvFileName}`;
  const imageArchiveName = images.length ? "02_images_for_Meta.zip" : null;

  kit.file(packagedCsvName, csvContent);

  if (images.length) {
    const imageArchive = new JSZip();
    for (const image of images) {
      const sourceEntry = sourceArchive.file(image.path);
      if (!sourceEntry) throw new Error(`Исходный файл исчез из ZIP: ${image.path}`);
      imageArchive.file(image.name, await sourceEntry.async("uint8array"));
    }
    kit.file(imageArchiveName!, await imageArchive.generateAsync({ type: "uint8array", compression: "STORE" }));
  }

  if (videos.length) {
    const videoFolder = kit.folder("03_videos_for_Meta");
    if (!videoFolder) throw new Error("Не удалось создать папку для видео.");
    for (const video of videos) {
      const sourceEntry = sourceArchive.file(video.path);
      if (!sourceEntry) throw new Error(`Исходный файл исчез из ZIP: ${video.path}`);
      videoFolder.file(video.name, await sourceEntry.async("uint8array"));
    }
  }

  kit.file("README_RU.txt", readmeText(packagedCsvName, imageArchiveName, videos.length));
  return {
    bytes: await kit.generateAsync({ type: "uint8array", compression: "STORE" }),
    fileName: metaImportKitFileName(sourceCsvFileName),
    csvFileName: packagedCsvName,
    imageArchiveName,
    imageCount: images.length,
    videoCount: videos.length,
  };
}

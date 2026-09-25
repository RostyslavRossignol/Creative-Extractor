import Papa from "papaparse";

export type MediaType = "image" | "video";
export type EncodingMode = "auto" | "utf-8" | "utf-16le" | "windows-1251";
export type LanguageDefinition = { code: string; label: string; aliases: string[]; countries?: string[] };
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
  repairedCreativeTypes: number;
  clearedDeletedCreativeTypes: number;
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

// Alias notation: plain text is an exact name or code (several words allowed),
// a trailing "*" marks a word stem that accepts any ending (словац* covers
// словацкий, словацкое, словацька), and a leading "=" marks a code that counts
// only when written in capitals (IS, CA), because in lower case it is an
// ordinary word. `countries` are weaker hints: they are used only when a name
// contains no language name or language code at all.
export const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  { code: "PT-BR", label: "Португальский (Бразилия)",
    aliases: ["brazilian portuguese", "brazilianportuguese", "brazil portuguese", "portuguese brazil", "portuguese br", "portuguesebrazil", "portuguesebr", "portuguese brazilian", "portugues brasileiro", "бразильский португальский", "бразильська португальська", "португальский бразилия", "португальська бразилія", "pt br", "ptbr", "br",
      "brazilian", "portugues do brasil", "бразильск*", "бразильськ*"],
    countries: ["brazil", "brasil", "бразили*", "бразилі*"] },
  { code: "EN", label: "Английский",
    aliases: ["english", "английский", "англійська", "английская", "en", "eng",
      "англ", "англи*", "англі*", "engl", "anglais", "englisch", "inglese", "ingles", "angielski", "engelsk", "british english", "american english", "english us", "english uk", "english gb", "us english", "uk english", "en us", "en gb", "en uk"],
    countries: ["usa", "united states", "united kingdom", "great britain", "britain", "england", "америк*", "британ*", "=US", "=GB"] },
  { code: "DE", label: "Немецкий",
    aliases: ["german", "deutsch", "немецкий", "німецька", "немецкая", "de", "deu", "ger",
      "немец*", "німець*", "allemand", "tedesco", "aleman", "niemiecki", "tysk", "duits"],
    countries: ["germany", "deutschland", "герман*", "німеччин*"] },
  { code: "NL", label: "Нидерландский",
    aliases: ["dutch", "nederlands", "нидерландский", "голландский", "нідерландська", "nl", "nld", "dut",
      "нидерланд*", "нідерланд*", "голланд*", "flemish", "vlaams", "фламанд*", "niederlandisch", "neerlandais", "olandese"],
    countries: ["netherlands", "the netherlands", "nederland", "holland"] },
  { code: "IT", label: "Итальянский",
    aliases: ["italian", "italiano", "итальянский", "итальянская", "італійська", "it", "ita",
      "итал*", "італ*", "italiana", "italien", "italienisch", "wloski"],
    countries: ["italy", "italia"] },
  { code: "ES", label: "Испанский",
    aliases: ["spanish", "espanol", "испанский", "испанская", "іспанська", "es", "spa", "sp",
      "испан*", "іспан*", "исп", "esp", "espanola", "castellano", "castilian", "espagnol", "spagnolo", "spanisch", "hiszpanski",
      "spanish spain", "spanish latam", "latam spanish", "latin american spanish", "mexican spanish", "es es", "es la", "es mx", "es us"],
    countries: ["spain", "espana", "mexico", "=MX"] },
  { code: "FR", label: "Французский",
    aliases: ["french", "francais", "французский", "французская", "французька", "fr", "fra", "fre",
      "франц*", "francaise", "franzosisch", "francese", "francuski", "french canada", "canadian french", "french france", "fr ca", "fr fr", "quebecois"],
    countries: ["france"] },
  { code: "SV", label: "Шведский",
    aliases: ["swedish", "svenska", "шведский", "шведская", "шведська", "sv", "swe", "se",
      "швед*", "svensk", "schwedisch", "suedois", "svedese", "szwedzki"],
    countries: ["sweden", "sverige", "швец*"] },
  { code: "SK", label: "Словацкий",
    aliases: ["slovak", "slovencina", "словацкий", "словацкая", "словацька", "sk", "slk", "slo",
      "словац*", "slovakian", "slovensky", "slowakisch", "slovaque", "slovacco", "slowacki"],
    countries: ["slovakia", "slovensko", "словаки*", "словаччин*"] },
  { code: "SL", label: "Словенский",
    aliases: ["slovenian", "slovene", "slovenscina", "словенский", "словенская", "словенська", "sl", "si", "slv",
      "словен*", "slovenski", "slowenisch"],
    countries: ["slovenia", "slovenija"] },
  { code: "CS", label: "Чешский",
    aliases: ["czech", "cestina", "чешский", "чешская", "чеська", "cz", "cs", "ces", "cze",
      "чешс*", "чеськ*", "cesky", "tschechisch", "tcheque", "ceco", "czeski"],
    countries: ["czechia", "czech republic", "cesko", "чехи*", "чехі*"] },
  { code: "PL", label: "Польский",
    aliases: ["polish", "polski", "польский", "польская", "польська", "pl", "pol",
      "польск*", "польськ*", "polnisch", "polonais", "polacco", "polaco"],
    countries: ["poland", "polska", "польш*", "польщ*"] },
  { code: "HU", label: "Венгерский",
    aliases: ["hungarian", "magyar", "венгерский", "венгерская", "угорська", "hu", "hun",
      "венгер*", "угорськ*", "ungarisch", "hongrois", "ungherese", "wegierski"],
    countries: ["hungary", "magyarorszag", "венгри*", "угорщин*"] },
  { code: "DA", label: "Датский",
    aliases: ["danish", "dansk", "датский", "датская", "данська", "da", "dk", "dan",
      "датск*", "данськ*", "danisch", "danois", "danese", "dunski", "deens"],
    countries: ["denmark", "danmark", "дания", "дании", "данія", "данії"] },
  { code: "PT", label: "Португальский",
    aliases: ["portuguese", "portugues", "португальский", "португальская", "португальська", "pt pt", "ptpt", "pt", "por",
      "португал*", "portugiesisch", "portugais", "portoghese", "portugalski", "european portuguese", "portuguese portugal"],
    countries: ["portugal"] },
  { code: "RO", label: "Румынский",
    aliases: ["romanian", "romana", "румынский", "румынская", "румунська", "ro", "ron", "rum",
      "румын*", "румун*", "moldovan", "moldavian", "молдав*", "молдов*", "rumanisch", "roumain", "rumeno", "rumunski"],
    countries: ["romania", "moldova"] },
  { code: "NO", label: "Норвежский",
    aliases: ["norwegian", "norsk", "норвежский", "норвежская", "норвезька", "no", "nb", "nn", "nor",
      "норве*", "nob", "nno", "bokmal", "nynorsk", "norwegian bokmal", "norwegian nynorsk", "norwegisch", "norvegien", "norvegese", "norweski", "noors"],
    countries: ["norway", "norge", "noreg"] },
  { code: "HR", label: "Хорватский",
    aliases: ["croatian", "hrvatski", "хорватский", "хорватская", "хорватська", "hr", "hrv",
      "хорват*", "kroatisch", "croate", "croato", "chorwacki"],
    countries: ["croatia", "hrvatska"] },
  { code: "FI", label: "Финский",
    aliases: ["finnish", "suomi", "финский", "финская", "фінська", "fi", "fin",
      "финск*", "фінськ*", "suomen", "finnisch", "finnois", "finlandese", "finski"],
    countries: ["finland", "финлянд*", "фінлянд*"] },
  { code: "MK", label: "Македонский",
    aliases: ["macedonian", "македонский", "македонская", "македонська", "mk", "mkd", "mac",
      "македон*", "makedonski", "mazedonisch"],
    countries: ["macedonia", "north macedonia", "makedonija"] },
  { code: "SQ", label: "Албанский",
    aliases: ["albanian", "shqip", "албанский", "албанская", "албанська", "sq", "al", "sqi", "alb",
      "албан*", "shqipe", "albanisch", "albanais", "albanese"],
    countries: ["albania", "shqiperia"] },
  { code: "CNR", label: "Черногорский",
    aliases: ["montenegrin", "crnogorski", "черногорский", "черногорская", "чорногорська", "cnr", "me",
      "черногор*", "чорногор*"],
    countries: ["montenegro", "crna gora"] },
  { code: "BG", label: "Болгарский",
    aliases: ["bulgarian", "български", "болгарский", "болгарская", "болгарська", "bg", "bgr",
      "болгар*", "българ*", "bul", "balgarski", "bulgarisch", "bulgare", "bulgaro", "bulgarski"],
    countries: ["bulgaria"] },
  { code: "SR", label: "Сербский",
    aliases: ["serbian", "srpski", "српски", "сербский", "сербская", "сербська", "sr", "srb",
      "серб*", "српск*", "srp", "serbisch", "serbe"],
    countries: ["serbia", "srbija", "србија", "=RS"] },
  { code: "BS", label: "Боснийский",
    aliases: ["bosnian", "bosanski", "боснийский", "боснийская", "боснійська", "bs", "bos",
      "босни*", "босні*", "bosnisch"],
    countries: ["bosnia", "bosna", "bosnia and herzegovina"] },
  { code: "EL", label: "Греческий",
    aliases: ["greek", "ellinika", "ελληνικά", "греческий", "греческая", "грецька", "el", "gr", "ell", "gre",
      "греческ*", "грецьк*", "hellenic", "griechisch", "grec", "greco", "grecki"],
    countries: ["greece", "hellas", "ellada", "ελλαδα", "греци*", "греці*"] },
  { code: "TR", label: "Турецкий",
    aliases: ["turkish", "turkce", "türkçe", "турецкий", "турецкая", "турецька", "tr", "tur",
      "турецк*", "турецьк*", "turkisch", "turc", "turco", "turecki"],
    countries: ["turkey", "turkiye", "турци*", "туреччин*"] },
  { code: "ET", label: "Эстонский",
    aliases: ["estonian", "eesti", "эстонский", "эстонская", "естонська", "et", "est",
      "эстон*", "естон*", "estnisch", "estonien", "estone", "estonski"],
    countries: ["estonia", "=EE"] },
  { code: "LV", label: "Латышский",
    aliases: ["latvian", "latviesu", "latviešu", "латышский", "латышская", "латвійська", "lv", "lav",
      "латыш*", "латиськ*", "lettisch", "letton", "lettone", "lotewski", "latviski"],
    countries: ["latvia", "latvija", "латви*", "латві*"] },
  { code: "LT", label: "Литовский",
    aliases: ["lithuanian", "lietuviu", "lietuvių", "литовский", "литовская", "литовська", "lt", "lit",
      "литов*", "litauisch", "lituanien", "lituano", "litewski"],
    countries: ["lithuania", "lietuva", "литва", "литве", "литвы"] },
  { code: "RU", label: "Русский",
    aliases: ["russian", "русский", "русская", "російська", "ru", "rus",
      "русск*", "російськ*", "рус", "russisch", "russe", "russo", "rosyjski", "russkiy", "russkij", "russki"],
    countries: ["russia", "rossiya", "росси*", "росі*"] },
  { code: "UK", label: "Украинский",
    aliases: ["ukrainian", "украинский", "украинская", "українська", "ua", "uk", "ukr",
      "украинск*", "українськ*", "укр", "ukrainisch", "ukrainien", "ucraino", "ukrainski", "ukrainska"],
    countries: ["ukraine", "ukraina", "украин*", "україн*"] },
  { code: "CA", label: "Каталанский",
    aliases: ["catalan", "catala", "catalonian", "каталан*", "каталон*", "katalanisch", "catalano", "katalonski", "=CA", "=CAT"],
    countries: ["catalonia", "catalunya", "cataluna"] },
  { code: "IS", label: "Исландский",
    aliases: ["icelandic", "islenska", "исландск*", "ісландськ*", "isl", "islandais", "islandese", "islandzki", "islandisch", "=IS"],
    countries: ["iceland", "исланди*", "ісланді*"] },
  { code: "GA", label: "Ирландский",
    aliases: ["irish", "gaeilge", "irish gaelic", "ирландск*", "ірландськ*", "gle", "irisch", "irlandese", "=GA"] },
  { code: "BE", label: "Белорусский",
    aliases: ["belarusian", "belarusan", "byelorussian", "belarussian", "беларуская", "белорусск*", "беларуск*", "білоруськ*", "bielorusse", "bielorusso", "=BE", "=BEL"],
    countries: ["belarus", "беларусь", "белорусси*", "білорусь", "=BY"] },
  { code: "LB", label: "Люксембургский",
    aliases: ["luxembourgish", "luxemburgish", "letzebuergesch", "luxemburgisch", "люксембургск*", "люксембурзьк*", "ltz", "=LB"] },
  { code: "MT", label: "Мальтийский",
    aliases: ["maltese", "malti", "мальтийск*", "мальтійськ*", "mlt", "=MT"],
    countries: ["malta"] },
  { code: "EU", label: "Баскский",
    aliases: ["basque", "euskara", "euskera", "баскск*", "баскськ*", "eus", "baq"] },
  { code: "GL", label: "Галисийский",
    aliases: ["galician", "galego", "gallego", "галисийск*", "галісійськ*", "glg", "=GL"] },
  { code: "CY", label: "Валлийский",
    aliases: ["welsh", "cymraeg", "валлийск*", "валлійськ*", "уэльск*", "cym", "wel", "=CY"],
    countries: ["wales", "cymru"] },
  { code: "JA", label: "Японский",
    aliases: ["japanese", "nihongo", "日本語", "японск*", "японськ*", "jpn", "japanisch", "japonais", "giapponese", "japones", "=JA"],
    countries: ["japan", "nippon", "nihon", "япони*", "японі*", "=JP"] },
  { code: "ZH", label: "Китайский",
    aliases: ["chinese", "mandarin", "中文", "汉语", "漢語", "普通话", "китайск*", "китайськ*", "zho", "chinesisch", "chinois", "cinese", "chino", "simplified chinese", "traditional chinese", "chinese simplified", "chinese traditional", "=ZH"],
    countries: ["china", "китай", "=CN"] },
  { code: "KO", label: "Корейский",
    aliases: ["korean", "hangul", "한국어", "корейск*", "корейськ*", "kor", "koreanisch", "coreen", "coreano", "=KO"],
    countries: ["korea", "south korea", "корея", "кореи", "=KR"] },
  { code: "AR", label: "Арабский",
    aliases: ["arabic", "العربية", "عربي", "арабск*", "арабськ*", "ara", "arabisch", "arabe", "arabo", "=AR"] },
  { code: "HE", label: "Иврит",
    aliases: ["hebrew", "ivrit", "עברית", "иврит", "іврит", "heb", "hebraisch", "hebreu", "ebraico", "=HE", "=IW"],
    countries: ["israel", "израил*", "ізраїл*", "=IL"] },
  { code: "HI", label: "Хинди",
    aliases: ["hindi", "хинди", "гінді", "hin", "=HI"] },
  { code: "TH", label: "Тайский",
    aliases: ["thai", "тайск*", "тайськ*", "tha", "=TH"],
    countries: ["thailand", "таиланд", "таїланд"] },
  { code: "VI", label: "Вьетнамский",
    aliases: ["vietnamese", "tieng viet", "вьетнамск*", "єтнамськ*", "vietnamesisch", "vietnamien", "vietnamita", "=VIE", "=VI"],
    countries: ["vietnam", "viet nam", "вьетнам", "=VN"] },
  { code: "ID", label: "Индонезийский",
    aliases: ["indonesian", "bahasa indonesia", "индонезийск*", "індонезійськ*", "indonesisch", "indonesien", "indonesiano", "=IND", "=ID"],
    countries: ["indonesia", "индонези*", "індонезі*"] },
  { code: "MS", label: "Малайский",
    aliases: ["malay", "bahasa melayu", "melayu", "малайск*", "малайськ*", "msa", "=MS"],
    countries: ["malaysia", "малайзи*", "малайзі*"] },
  { code: "TL", label: "Филиппинский",
    aliases: ["filipino", "tagalog", "pilipino", "филиппинск*", "філіппінськ*", "тагальск*", "tgl", "=FIL", "=TL"],
    countries: ["philippines", "филиппин*", "філіппін*", "=PH"] },
  { code: "KA", label: "Грузинский",
    aliases: ["georgian", "kartuli", "ქართული", "грузинск*", "грузинськ*", "georgisch", "=KAT", "=KA"],
    countries: ["georgia", "sakartvelo", "грузия", "грузии", "грузія", "=GE"] },
  { code: "HY", label: "Армянский",
    aliases: ["armenian", "hayeren", "հայերեն", "армянск*", "вірменськ*", "hye", "armenisch", "=HY"],
    countries: ["armenia", "армения", "армении", "вірменія", "=AM"] },
  { code: "AZ", label: "Азербайджанский",
    aliases: ["azerbaijani", "azeri", "azerbaycanca", "azərbaycanca", "азербайджанск*", "азербайджанськ*", "aze", "aserbaidschanisch", "=AZ"],
    countries: ["azerbaijan", "azerbaycan", "azərbaycan", "азербайджан"] },
  { code: "KK", label: "Казахский",
    aliases: ["kazakh", "qazaq", "қазақ", "казахск*", "казахськ*", "kaz", "kasachisch", "=KK"],
    countries: ["kazakhstan", "казахстан", "=KZ"] },
  { code: "UZ", label: "Узбекский",
    aliases: ["uzbek", "ozbek", "узбекск*", "узбецьк*", "uzb", "usbekisch", "=UZ"],
    countries: ["uzbekistan", "узбекистан"] },
  { code: "FA", label: "Персидский",
    aliases: ["persian", "farsi", "فارسی", "персидск*", "перськ*", "фарси", "fas", "persisch", "persan", "=FA"],
    countries: ["iran", "иран", "=IR"] },
  { code: "UR", label: "Урду",
    aliases: ["urdu", "اردو", "урду", "urd", "=UR"] },
  { code: "BN", label: "Бенгальский",
    aliases: ["bengali", "bangla", "বাংলা", "бенгальск*", "бенгальськ*", "=BN"],
    countries: ["bangladesh", "=BD"] },
  { code: "RM", label: "Ретороманский",
    aliases: ["romansh", "romansch", "rumantsch", "rumauntsch", "romanche", "ratoromanisch", "rhaeto romance", "rhaeto romanic", "ретороманск*", "ретороманськ*", "романшск*", "=RM", "=ROH"] },
  { code: "AF", label: "Африкаанс",
    aliases: ["afrikaans", "африкаанс", "afr", "=AF"] },
  { code: "SW", label: "Суахили",
    aliases: ["swahili", "kiswahili", "суахили", "суахілі", "swa", "=SW"] },
];

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v"]);
// Only real media extensions are cut off: an ad name such as "Promo v1.2 Italian 3"
// must keep everything after its dots.
const MEDIA_EXTENSION = /\.(?:jpe?g|png|gif|webp|mp4|mov|m4v|avi|webm|mkv)$/i;
const INLINE_VARIANT = /^(\p{L}{2,})0*(\d{1,3})$/u;

export function normalizeForTokens(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function tokenize(value: string): string[] {
  const normalized = normalizeForTokens(value);
  return normalized ? normalized.split(/\s+/) : [];
}
function variantNumber(digits: string): number | null {
  const number = Number(digits);
  return number > 0 && number <= 999 ? number : null;
}
function numberFromToken(token: string | undefined): number | null {
  if (!token) return null;
  const direct = token.match(/^0*(\d{1,3})$/);
  const prefixed = token.match(/^(?:v|ver|variant|creative|creo|cr|ad)0*(\d{1,3})$/);
  const match = direct ?? prefixed;
  return match ? variantNumber(match[1]) : null;
}

// Dates such as 17-08, 17.08.2026 or 2026-08-17 are not variant numbers. Pairs
// of single digits (1-3) and underscore-separated numbers are left untouched.
const FULL_DATE = /(^|[^\p{L}\p{N}])\d{4}[./-]\d{1,2}[./-]\d{1,2}(?=$|[^\p{L}\p{N}])/gu;
const SHORT_DATE = /(^|[^\p{L}\p{N}])(\d{1,2})[./-](\d{1,2})([./-](?:\d{4}|\d{2}))?(?=$|[^\p{L}\p{N}])/gu;
function isDayAndMonth(day: number, month: number): boolean {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}
function stripDates(value: string): string {
  return value.replace(FULL_DATE, "$1 ").replace(SHORT_DATE, (match: string, before: string, first: string, second: string, year?: string) => {
    if (!year && first.length < 2 && second.length < 2) return match;
    const a = Number(first);
    const b = Number(second);
    return isDayAndMonth(a, b) || isDayAndMonth(b, a) ? `${before} ` : match;
  });
}

type NameToken = { value: string; upper: boolean };
function nameTokens(value: string): NameToken[] {
  const cleaned = stripDates(value.replace(MEDIA_EXTENSION, "")).normalize("NFKD").replace(/\p{M}+/gu, "");
  return cleaned.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((raw) => ({
    value: raw.toLocaleLowerCase(),
    upper: /\p{Lu}/u.test(raw) && !/\p{Ll}/u.test(raw),
  }));
}

type AliasEntry = {
  code: string;
  label: string;
  alias: string;
  tokens: string[];
  stem: boolean;
  strict: boolean;
  weak: boolean;
  codeLike: boolean;
};
type LanguageMatch = { entry: AliasEntry; start: number; length: number; inlineVariant: number | null; matched: string };

function compileAliases(): { exact: Map<string, AliasEntry[]>; stems: AliasEntry[] } {
  const exact = new Map<string, AliasEntry[]>();
  const stems: AliasEntry[] = [];
  for (const definition of LANGUAGE_DEFINITIONS) {
    const lists: Array<[boolean, string[]]> = [[false, definition.aliases], [true, definition.countries ?? []]];
    for (const [weak, list] of lists) {
      for (const raw of list) {
        const strict = raw.startsWith("=");
        const stem = raw.endsWith("*");
        const tokens = tokenize(raw.replace(/^=|\*$/g, ""));
        if (!tokens.length) continue;
        const entry: AliasEntry = {
          code: definition.code, label: definition.label, alias: tokens.join(" "), tokens, stem, strict, weak,
          codeLike: strict || tokens.every((token) => /^[a-z]{1,3}$/.test(token)),
        };
        if (stem) stems.push(entry);
        else exact.set(tokens[0], [...(exact.get(tokens[0]) ?? []), entry]);
      }
    }
  }
  return { exact, stems };
}
const LANGUAGE_ALIASES = compileAliases();
const KNOWN_LANGUAGE_CODES = new Set(LANGUAGE_DEFINITIONS.map((definition) => definition.code));

function findLanguageMatches(tokens: NameToken[]): LanguageMatch[] {
  const matches: LanguageMatch[] = [];
  const covered = new Set<number>();
  tokens.forEach((token, start) => {
    for (const entry of LANGUAGE_ALIASES.exact.get(token.value) ?? []) {
      if (entry.strict && !token.upper) continue;
      if (!entry.tokens.every((part, offset) => tokens[start + offset]?.value === part)) continue;
      matches.push({ entry, start, length: entry.tokens.length, inlineVariant: null, matched: entry.alias });
      entry.tokens.forEach((_, offset) => covered.add(start + offset));
    }
  });
  tokens.forEach((token, start) => {
    if (covered.has(start)) return;
    // A number glued to the language ("Slovak2", "SK01") is the variant.
    const inline = token.value.match(INLINE_VARIANT);
    const inlineVariant = inline ? variantNumber(inline[2]) : null;
    const word = inline && inlineVariant !== null ? inline[1] : token.value;
    let found = false;
    if (inlineVariant !== null) {
      for (const entry of LANGUAGE_ALIASES.exact.get(word) ?? []) {
        if (entry.tokens.length !== 1 || (entry.strict && !token.upper)) continue;
        matches.push({ entry, start, length: 1, inlineVariant, matched: entry.alias });
        found = true;
      }
    }
    if (found) return;
    for (const entry of LANGUAGE_ALIASES.stems) {
      if (word.startsWith(entry.tokens[0])) matches.push({ entry, start, length: 1, inlineVariant, matched: word });
    }
  });
  return matches;
}

// Language names beat bare codes, and countries count only when nothing else is
// found: "UA_Russian" is Russian and "Spain_Catalan" is Catalan, while "IT_ES"
// stays ambiguous.
const MATCH_TIERS: Array<(entry: AliasEntry) => boolean> = [
  (entry) => !entry.weak && !entry.codeLike,
  (entry) => !entry.weak && entry.codeLike,
  (entry) => entry.weak && !entry.codeLike,
  (entry) => entry.weak && entry.codeLike,
];

function selectLanguage(matches: LanguageMatch[]): { selected: LanguageMatch | null; ambiguous: string[] } {
  // A longer alias wins over the shorter aliases inside it: "PT BR" over "PT",
  // "English UK" over "UK".
  let pool = matches.filter((match) => !matches.some((other) => other.length > match.length
    && other.start <= match.start && other.start + other.length >= match.start + match.length));
  if (pool.some((match) => match.entry.code === "PT-BR")) pool = pool.filter((match) => match.entry.code !== "PT");
  for (const inTier of MATCH_TIERS) {
    const tier = pool.filter((match) => inTier(match.entry));
    if (!tier.length) continue;
    const codes = [...new Set(tier.map((match) => match.entry.code))];
    if (codes.length > 1) return { selected: null, ambiguous: codes };
    const ordered = [...tier].sort((a, b) => b.length - a.length || a.start - b.start);
    return { selected: ordered.find((match) => match.inlineVariant !== null) ?? ordered[0], ambiguous: [] };
  }
  return { selected: null, ambiguous: [] };
}

// These are structural filename words, not language markers. Unknown language
// names are still accepted when the same marker precedes the variant number in
// both the ad name and the creative filename.
const GENERIC_LANGUAGE_STOPWORDS = new Set([
  "ad", "ads", "asset", "banner", "creative", "creo", "cr", "image", "img",
  "video", "vid", "file", "final", "new", "copy", "version", "variant", "play",
  "promo", "campaign", "adset", "unique", "uniq",
]);

function detectGenericLanguageMarker(tokens: string[]): { code: string; label: string; variant: number; start: number } | null {
  for (let numberIndex = 1; numberIndex < tokens.length; numberIndex += 1) {
    const variant = numberFromToken(tokens[numberIndex]);
    if (variant === null) continue;
    const marker = tokens[numberIndex - 1];
    if (!marker || GENERIC_LANGUAGE_STOPWORDS.has(marker) || !/\p{L}/u.test(marker)) continue;
    // A marker must be a real text token. This avoids treating IDs and tiny
    // technical fragments as arbitrary languages while still accepting codes
    // such as CA when users employ them consistently in both names.
    if ([...marker].length < 2) continue;
    return { code: marker.toLocaleUpperCase(), label: marker, variant, start: numberIndex - 1 };
  }
  return null;
}

export function analyzeName(value: string): NameAnalysis {
  const tokens = nameTokens(value);
  const words = tokens.map((token) => token.value);
  const { selected, ambiguous } = selectLanguage(findLanguageMatches(tokens));
  let variant: number | null = selected?.inlineVariant ?? null;
  if (selected && variant === null) {
    const afterStart = selected.start + selected.length;
    for (let offset = 0; offset < 3 && variant === null; offset += 1) variant = numberFromToken(words[afterStart + offset]);
    if (variant === null) variant = numberFromToken(words[selected.start - 1]);
  }
  return {
    languageCode: selected?.entry.code ?? null,
    languageLabel: selected?.entry.label ?? null,
    variant,
    matchedAlias: selected?.matched ?? null,
    ambiguousLanguages: ambiguous,
  };
}

function analyzeNameForMatching(value: string): NameAnalysis {
  const known = analyzeName(value);
  if (known.languageCode || known.ambiguousLanguages.length) return known;
  const generic = detectGenericLanguageMarker(nameTokens(value).map((token) => token.value));
  if (!generic) return known;
  return {
    languageCode: generic.code,
    languageLabel: generic.label,
    variant: generic.variant,
    matchedAlias: generic.label,
    ambiguousLanguages: [],
  };
}

// Words of a name used to compare an ad with creative filenames beyond the
// language: any shared word ("boy", "бой", "girl") links them.
type NameKeyword = { word: string; index: number; variant: number | null; markerLike: boolean };
type NameKeywords = { words: Set<string>; keywords: NameKeyword[] };

function nameKeywords(value: string): NameKeywords {
  const tokens = nameTokens(value).map((token) => token.value);
  const keywords: NameKeyword[] = [];
  tokens.forEach((token, index) => {
    const inline = token.match(INLINE_VARIANT);
    const inlineVariant = inline ? variantNumber(inline[2]) : null;
    const word = inline && inlineVariant !== null ? inline[1] : token;
    if (!/\p{L}/u.test(word) || [...word].length < 2 || GENERIC_LANGUAGE_STOPWORDS.has(word) || numberFromToken(word) !== null) return;
    let variant = inlineVariant;
    for (let offset = 1; offset <= 3 && variant === null; offset += 1) variant = numberFromToken(tokens[index + offset]);
    if (variant === null) variant = numberFromToken(tokens[index - 1]);
    keywords.push({ word, index, variant, markerLike: inlineVariant !== null || numberFromToken(tokens[index + 1]) !== null });
  });
  return { words: new Set(keywords.map((keyword) => keyword.word)), keywords };
}

// The word as the user wrote it (normalization turns "бой" into "бои").
function displayWord(source: string, word: string): string {
  return source.normalize("NFC").split(/[^\p{L}\p{N}\p{M}]+/u)
    .map((part) => part.replace(/\d+$/, ""))
    .find((part) => normalizeForTokens(part) === word) ?? word;
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
  return { id: path, path, name, extension: name.split(".").pop()?.toLocaleLowerCase() ?? "", mediaType, size, ...analyzeNameForMatching(name) };
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
  let repairedCreativeTypes = 0;
  let clearedDeletedCreativeTypes = 0;

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

  // Meta may export POST_DELETED when the post behind an old creative no longer
  // exists. That marker is not an importable Creative Type: restore a value only
  // when it is deterministic, otherwise clear the cell. POST_DELETED must never
  // reach the generated import CSV.
  const creativeTypeIndex = csv.headers.indexOf("Creative Type");
  if (creativeTypeIndex >= 0) {
    const campaignIndex = csv.headers.indexOf("Campaign Name");
    const adSetIndex = csv.headers.indexOf("Ad Set Name");
    const isDeletedMarker = (value: string) => value.trim().toLocaleUpperCase() === "POST_DELETED";
    const groupKey = (row: string[]) => `${campaignIndex >= 0 ? row[campaignIndex] : ""}\u001f${adSetIndex >= 0 ? row[adSetIndex] : ""}`;
    const validGlobalTypes = new Set<string>();
    const validTypesByGroup = new Map<string, Set<string>>();

    for (const row of rows) {
      const value = row[creativeTypeIndex]?.trim() ?? "";
      if (!value || isDeletedMarker(value)) continue;
      validGlobalTypes.add(value);
      const key = groupKey(row);
      const groupTypes = validTypesByGroup.get(key) ?? new Set<string>();
      groupTypes.add(value);
      validTypesByGroup.set(key, groupTypes);
    }

    for (const row of rows) {
      if (!isDeletedMarker(row[creativeTypeIndex] ?? "")) continue;
      const groupTypes = validTypesByGroup.get(groupKey(row));
      const replacement = groupTypes?.size === 1
        ? [...groupTypes][0]
        : validGlobalTypes.size === 1
          ? [...validGlobalTypes][0]
          : null;
      if (replacement) {
        row[creativeTypeIndex] = replacement;
        repairedCreativeTypes += 1;
      } else {
        row[creativeTypeIndex] = "";
        clearedDeletedCreativeTypes += 1;
      }
    }
  }

  return {
    csv: { ...csv, rows, delimiter: ",", linebreak: "\r\n", hadBom: true, encoding: "utf-8" },
    report: { cleanedCells, cleanedColumns, alreadyEmptyColumns, missingColumns, repairedCreativeTypes, clearedDeletedCreativeTypes },
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

type RowSlot = { mapping: RowMapping; variant: number | null; words: Set<string> };
type FileSlot = { file: CreativeFile; variant: number | null; words: Set<string> };
type AssignFile = (slot: RowSlot, file: CreativeFile, reason: string) => void;
type LeftoverReasons = { forced: string; words: string; sequential: string; sequentialNoNumber: string; surplus: string };

const LANGUAGE_LEFTOVER_REASONS: LeftoverReasons = {
  forced: "Однозначно назначен единственный оставшийся файл языка",
  words: "Файл языка выбран по общим словам в названиях",
  sequential: "Распределено последовательно внутри языка",
  sequentialNoNumber: "Однозначно назначен оставшийся файл языка без номера варианта",
  surplus: "Назначен свободный файл языка без номера варианта: файлов больше, чем объявлений",
};

function variantsCompatible(a: number | null, b: number | null): boolean {
  return a === null || b === null || a === b;
}

// The single candidate sharing the most name words, or null when nothing is
// shared or the best candidates tie.
function uniqueBestByWords<T>(words: Set<string>, candidates: T[], wordsOf: (candidate: T) => Set<string>): T | null {
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const candidate of candidates) {
    let score = 0;
    for (const word of wordsOf(candidate)) if (words.has(word)) score += 1;
    if (score > bestScore) { best = candidate; bestScore = score; tie = false; }
    else if (score > 0 && score === bestScore) tie = true;
  }
  return tie ? null : best;
}

function sortFileSlots(slots: FileSlot[]): FileSlot[] {
  return slots.sort((a, b) => (a.variant ?? Number.MAX_SAFE_INTEGER) - (b.variant ?? Number.MAX_SAFE_INTEGER) || a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
}

// Pairs rows that are still open with files nobody uses yet, so every ad of the
// group receives its own creative.
function distributeLeftovers(rows: RowSlot[], files: FileSlot[], sequentialFallback: boolean, hasTarget: (file: CreativeFile) => boolean, reasons: LeftoverReasons, assign: AssignFile) {
  const openRows = [...rows];
  const openFiles = [...files];
  const take = (slot: RowSlot, pick: FileSlot, reason: string) => {
    assign(slot, pick.file, reason);
    openRows.splice(openRows.indexOf(slot), 1);
    openFiles.splice(openFiles.indexOf(pick), 1);
  };
  let progress = true;
  while (progress) {
    progress = false;
    // First resolve only mathematically safe one-to-one leftovers. This is always
    // enabled: a missing variant number must not force manual work when one row
    // and one compatible file are the only possible pair.
    for (const slot of [...openRows]) {
      const compatible = openFiles.filter((pick) => variantsCompatible(slot.variant, pick.variant));
      if (compatible.length !== 1) continue;
      const pick = compatible[0];
      if (openRows.filter((other) => variantsCompatible(other.variant, pick.variant)).length !== 1) continue;
      if (!hasTarget(pick.file)) continue;
      take(slot, pick, reasons.forced);
      progress = true;
    }
    if (progress) continue;
    // Then pair a row and a file that share more words with each other than
    // with anybody else: "boy" goes to the boy creative, "girl" to the girl one.
    for (const slot of [...openRows]) {
      const pick = uniqueBestByWords(slot.words, openFiles.filter((candidate) => variantsCompatible(slot.variant, candidate.variant)), (candidate) => candidate.words);
      if (!pick || !hasTarget(pick.file)) continue;
      const rival = uniqueBestByWords(pick.words, openRows.filter((other) => variantsCompatible(other.variant, pick.variant)), (other) => other.words);
      if (rival !== slot) continue;
      take(slot, pick, reasons.words);
      progress = true;
    }
  }

  if (!sequentialFallback || !openRows.length || !openFiles.length) return;
  if (openFiles.length === openRows.length && assignInSheetOrder(openRows, openFiles, hasTarget, reasons, assign)) return;
  assignByAd(openRows, openFiles, hasTarget, reasons, assign);
}

// Equal numbers of rows and files: the n-th row in the sheet gets the n-th file.
function assignInSheetOrder(openRows: RowSlot[], openFiles: FileSlot[], hasTarget: (file: CreativeFile) => boolean, reasons: LeftoverReasons, assign: AssignFile): boolean {
  const remainingFiles = [...openFiles];
  const assignments = new Map<RowSlot, FileSlot>();
  for (const slot of openRows.filter((row) => row.variant !== null)) {
    const compatible = remainingFiles.filter((pick) => pick.variant === null || pick.variant === slot.variant);
    if (compatible.length !== 1) continue;
    assignments.set(slot, compatible[0]);
    remainingFiles.splice(remainingFiles.indexOf(compatible[0]), 1);
  }
  const remainingRows = openRows.filter((row) => !assignments.has(row)).sort((a, b) => a.mapping.sheetRow - b.mapping.sheetRow);
  if (remainingRows.length !== remainingFiles.length) return false;
  if (!remainingRows.every((row, index) => variantsCompatible(row.variant, remainingFiles[index].variant))) return false;
  remainingRows.forEach((row, index) => assignments.set(row, remainingFiles[index]));
  for (const slot of openRows) {
    const pick = assignments.get(slot);
    if (!pick || !hasTarget(pick.file)) continue;
    assign(slot, pick.file, slot.variant !== null && pick.variant === null ? reasons.sequentialNoNumber : reasons.sequential);
  }
  return true;
}

// Rows and files differ in number (one Norwegian ad and three Norwegian files,
// or Norwegian_1..3 repeated in two ad sets). Every distinct ad takes its own
// free file in sheet order; rows with the same variant number are one ad and
// share a file, rows without a number each count as a separate ad. Spare files
// stay unused, and ads left without a file stay for a manual choice.
function assignByAd(openRows: RowSlot[], openFiles: FileSlot[], hasTarget: (file: CreativeFile) => boolean, reasons: LeftoverReasons, assign: AssignFile) {
  const ads = new Map<string, RowSlot[]>();
  for (const slot of [...openRows].sort((a, b) => a.mapping.sheetRow - b.mapping.sheetRow)) {
    const key = slot.variant !== null ? `variant:${slot.variant}` : `row:${slot.mapping.rowIndex}`;
    const slots = ads.get(key) ?? [];
    slots.push(slot);
    ads.set(key, slots);
  }
  const pool = [...openFiles];
  const given = new Map<RowSlot[], FileSlot>();
  for (const slots of ads.values()) {
    if (slots[0].variant === null) continue;
    const compatible = pool.filter((pick) => pick.variant === null || pick.variant === slots[0].variant);
    if (compatible.length !== 1) continue;
    given.set(slots, compatible[0]);
    pool.splice(pool.indexOf(compatible[0]), 1);
  }
  for (const slots of ads.values()) {
    if (given.has(slots)) continue;
    const pick = pool.find((candidate) => variantsCompatible(slots[0].variant, candidate.variant));
    if (!pick) continue;
    given.set(slots, pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  for (const [slots, pick] of given) {
    if (!hasTarget(pick.file)) continue;
    for (const slot of slots) {
      assign(slot, pick.file, pool.length
        ? reasons.surplus
        : slot.variant !== null && pick.variant === null ? reasons.sequentialNoNumber : reasons.sequential);
    }
  }
}

export function buildMappings(csv: ParsedCsv, creatives: CreativeFile[], columns: ColumnSelection, options: MappingOptions, manualOverrides: Record<number, string> = {}): RowMapping[] {
  const hasTarget = (file: CreativeFile) => file.mediaType === "image" ? Boolean(columns.imageFile) : Boolean(columns.videoFile);
  const keywordCache = new Map<string, NameKeywords>();
  const keywordsOf = (name: string): NameKeywords => {
    let keywords = keywordCache.get(name);
    if (!keywords) { keywords = nameKeywords(name); keywordCache.set(name, keywords); }
    return keywords;
  };

  const mappings: RowMapping[] = csv.rows.map((row, rowIndex) => {
    const sourceName = cell(row, csv.headers, columns.source).trim();
    const analysis = analyzeNameForMatching(sourceName);
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
      if (!hasTarget(file)) return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: null, candidates, status: "missing", reason: file.mediaType === "image" ? "Не выбрана колонка Image File Name" : "Не выбрана колонка Video File Name" };
      return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file, candidates, status: "ready", reason: "Язык и вариант совпали" };
    }
    // Several files share the language and variant: take the one whose name has
    // the most words in common with the ad (Slovak_boy_1 → sk_boy_1.jpg).
    const preferred = candidates.length > 1 ? uniqueBestByWords(keywordsOf(sourceName).words, candidates, (file) => keywordsOf(file.name).words) : null;
    if (preferred && hasTarget(preferred)) return { rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: preferred, candidates, status: "ready", reason: "Язык и вариант совпали, файл выбран по общим словам в названиях" };
    return {
      rowIndex, sheetRow: rowIndex + 2, sourceName, analysis, file: null, candidates,
      status: candidates.length ? "ambiguous" : "missing",
      reason: candidates.length ? `Подходят несколько файлов (${candidates.length})` : analysis.variant !== null ? `Нет файла для ${analysis.languageCode}:${analysis.variant}` : `Нет однозначного файла для ${analysis.languageCode}`,
    };
  });

  const assignedFileIds = () => new Set(mappings.flatMap((mapping) => mapping.file && (mapping.status === "ready" || mapping.status === "manual") ? [mapping.file.id] : []));
  const assign: AssignFile = (slot, file, reason) => {
    slot.mapping.file = file;
    slot.mapping.candidates = [file];
    slot.mapping.status = "ready";
    slot.mapping.reason = reason;
  };

  const byLanguage = new Map<string, RowMapping[]>();
  for (const mapping of mappings) {
    if (mapping.analysis.languageCode && (mapping.status === "ambiguous" || mapping.status === "missing")) {
      const list = byLanguage.get(mapping.analysis.languageCode) ?? [];
      list.push(mapping);
      byLanguage.set(mapping.analysis.languageCode, list);
    }
  }
  for (const [language, rows] of byLanguage) {
    const assigned = assignedFileIds();
    const files = sortFileSlots(creatives
      .filter((file) => file.languageCode === language && !assigned.has(file.id))
      .map((file) => ({ file, variant: file.variant, words: keywordsOf(file.name).words })));
    const slots = rows.map((mapping) => ({ mapping, variant: mapping.analysis.variant, words: keywordsOf(mapping.sourceName).words }));
    distributeLeftovers(slots, files, options.sequentialFallback, hasTarget, LANGUAGE_LEFTOVER_REASONS, assign);
  }

  matchBySharedWords(mappings, creatives, options, hasTarget, keywordsOf, assignedFileIds, assign);
  return mappings;
}

// Last stage for ads the language rules could not place: any word that the ad
// name shares with creative filenames ("boy", "бой") works as the matching key.
// Several ads with the same word receive different creatives of that word.
function matchBySharedWords(
  mappings: RowMapping[], creatives: CreativeFile[], options: MappingOptions, hasTarget: (file: CreativeFile) => boolean,
  keywordsOf: (name: string) => NameKeywords, assignedFileIds: () => Set<string>, assign: AssignFile,
) {
  const fileLanguages = new Set(creatives.flatMap((file) => file.languageCode ? [file.languageCode] : []));
  const pending = mappings.filter((mapping) => {
    if (mapping.status !== "no-language" && mapping.status !== "missing" && mapping.status !== "ambiguous") return false;
    // A recognised language that has creatives keeps the strict language rules:
    // a Slovak ad without its Slovak file must not receive an unrelated file.
    const code = mapping.analysis.languageCode;
    return !(code && KNOWN_LANGUAGE_CODES.has(code) && fileLanguages.has(code));
  });
  if (!pending.length) return;

  // Creatives already given to an ad by the language rules stay with it.
  const assignedBefore = assignedFileIds();
  const filesByWord = new Map<string, CreativeFile[]>();
  for (const file of creatives) {
    if (assignedBefore.has(file.id)) continue;
    for (const word of keywordsOf(file.name).words) {
      const list = filesByWord.get(word) ?? [];
      list.push(file);
      filesByWord.set(word, list);
    }
  }
  const knownLanguageOf = (mapping: RowMapping) => {
    const code = mapping.analysis.languageCode;
    return code && KNOWN_LANGUAGE_CODES.has(code) ? code : null;
  };
  // An ad in a known language (without creatives of that language) may only get
  // a file that names no other known language.
  const fileAllowed = (language: string | null, file: CreativeFile) => !language || !file.languageCode || !KNOWN_LANGUAGE_CODES.has(file.languageCode);

  const groups = new Map<string, { word: string; language: string | null; rows: Array<{ mapping: RowMapping; keyword: NameKeyword }> }>();
  for (const mapping of pending) {
    const language = knownLanguageOf(mapping);
    const shared = keywordsOf(mapping.sourceName).keywords.filter((keyword) => (filesByWord.get(keyword.word) ?? []).some((file) => fileAllowed(language, file)));
    if (!shared.length) continue;
    // Prefer a word followed by a number (a marker like "boy_1"), then the word
    // found in the fewest files, then the one closest to the end of the name.
    const keyword = [...shared].sort((a, b) => Number(b.markerLike) - Number(a.markerLike)
      || filesByWord.get(a.word)!.length - filesByWord.get(b.word)!.length
      || b.index - a.index)[0];
    const key = `${keyword.word}\u001f${language ?? ""}`;
    const group = groups.get(key) ?? { word: keyword.word, language, rows: [] };
    group.rows.push({ mapping, keyword });
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const label = displayWord(group.rows[0].mapping.sourceName, group.word);
    const files: FileSlot[] = (filesByWord.get(group.word) ?? []).filter((file) => fileAllowed(group.language, file)).map((file) => {
      const keywords = keywordsOf(file.name);
      return { file, variant: keywords.keywords.find((keyword) => keyword.word === group.word)?.variant ?? null, words: keywords.words };
    });
    const assignByWord: AssignFile = (slot, file, reason) => {
      assign(slot, file, reason);
      slot.mapping.analysis = { languageCode: label.toLocaleUpperCase(), languageLabel: label, variant: slot.variant, matchedAlias: label, ambiguousLanguages: [] };
    };

    const open: RowSlot[] = [];
    for (const { mapping, keyword } of group.rows) {
      const slot: RowSlot = { mapping, variant: keyword.variant, words: keywordsOf(mapping.sourceName).words };
      const exact = files.filter((pick) => slot.variant === null || pick.variant === slot.variant);
      const pick = exact.length === 1 ? exact[0] : uniqueBestByWords(slot.words, exact, (candidate) => candidate.words);
      if (pick && hasTarget(pick.file)) {
        assignByWord(slot, pick.file, exact.length === 1
          ? `Совпало слово «${label}»${slot.variant !== null ? ` и вариант ${slot.variant}` : ""}`
          : `Совпало слово «${label}», файл выбран по общим словам в названиях`);
      } else open.push(slot);
    }

    const assigned = assignedFileIds();
    distributeLeftovers(open, sortFileSlots(files.filter((pick) => !assigned.has(pick.file.id))), options.sequentialFallback, hasTarget, {
      forced: `Единственный подходящий файл со словом «${label}»`,
      words: `Файл со словом «${label}» выбран по общим словам в названиях`,
      sequential: `Распределено по порядку среди файлов со словом «${label}»`,
      sequentialNoNumber: `Назначен оставшийся файл со словом «${label}» без номера варианта`,
      surplus: `Назначен свободный файл со словом «${label}»: файлов больше, чем объявлений`,
    }, assignByWord);

    // Without a known language, the shared word explains more than "Язык не
    // распознан" or "Нет файла для БОЙ:1". A known language keeps its message.
    for (const slot of open) {
      if (slot.mapping.status === "ready" || group.language) continue;
      const candidates = files.filter((pick) => variantsCompatible(slot.variant, pick.variant)).map((pick) => pick.file);
      slot.mapping.analysis = { languageCode: label.toLocaleUpperCase(), languageLabel: label, variant: slot.variant, matchedAlias: label, ambiguousLanguages: [] };
      slot.mapping.candidates = candidates;
      slot.mapping.status = candidates.length ? "ambiguous" : "missing";
      slot.mapping.reason = candidates.length > 1
        ? `Слово «${label}» есть в нескольких файлах (${candidates.length}) — выберите файл вручную`
        : candidates.length
          ? `Файл со словом «${label}» подходит нескольким объявлениям — выберите вручную`
          : `Слово «${label}» найдено, но нет файла с вариантом ${slot.variant}`;
    }
  }
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

// Static, code-committed superset of every locale this platform will ever
// register — deliberately NOT sourced from the `languages` DB table.
// proxy.ts and reserved-slugs.ts both need to answer "is this path segment
// a locale code?" on every single request; querying the database for that
// would double the network round-trips in the hottest path in the app (on
// top of the existing Supabase auth-cookie refresh). The DB `languages`
// table remains the operational source of truth for whether a locale is
// actually enabled/public/reviewed — this file only owns routing identity
// (which segments are locale codes at all) and the LTR/RTL direction used
// to set <html dir>, which shouldn't be admin-mutable at the routing layer
// regardless of DB state.
//
// Seeded with the full target list from the rollout plan so enabling a new
// language later (flipping DB flags via the admin screen) never requires a
// code change here — only truly new/unanticipated locale codes would.
export interface LocaleCodeInfo {
  code: string;
  englishName: string;
  nativeName: string;
  direction: "ltr" | "rtl";
}

export const LOCALE_CODES: readonly LocaleCodeInfo[] = [
  { code: "en", englishName: "English", nativeName: "English", direction: "ltr" },
  { code: "es", englishName: "Spanish", nativeName: "Español", direction: "ltr" },
  { code: "fr", englishName: "French", nativeName: "Français", direction: "ltr" },
  { code: "de", englishName: "German", nativeName: "Deutsch", direction: "ltr" },
  { code: "pt", englishName: "Portuguese", nativeName: "Português", direction: "ltr" },
  { code: "it", englishName: "Italian", nativeName: "Italiano", direction: "ltr" },
  { code: "nl", englishName: "Dutch", nativeName: "Nederlands", direction: "ltr" },
  { code: "pl", englishName: "Polish", nativeName: "Polski", direction: "ltr" },
  { code: "ro", englishName: "Romanian", nativeName: "Română", direction: "ltr" },
  { code: "cs", englishName: "Czech", nativeName: "Čeština", direction: "ltr" },
  { code: "sk", englishName: "Slovak", nativeName: "Slovenčina", direction: "ltr" },
  { code: "hu", englishName: "Hungarian", nativeName: "Magyar", direction: "ltr" },
  { code: "el", englishName: "Greek", nativeName: "Ελληνικά", direction: "ltr" },
  { code: "sv", englishName: "Swedish", nativeName: "Svenska", direction: "ltr" },
  { code: "no", englishName: "Norwegian", nativeName: "Norsk", direction: "ltr" },
  { code: "da", englishName: "Danish", nativeName: "Dansk", direction: "ltr" },
  { code: "fi", englishName: "Finnish", nativeName: "Suomi", direction: "ltr" },
  { code: "uk", englishName: "Ukrainian", nativeName: "Українська", direction: "ltr" },
  { code: "ru", englishName: "Russian", nativeName: "Русский", direction: "ltr" },
  { code: "tr", englishName: "Turkish", nativeName: "Türkçe", direction: "ltr" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية", direction: "rtl" },
  { code: "he", englishName: "Hebrew", nativeName: "עברית", direction: "rtl" },
  { code: "fa", englishName: "Persian", nativeName: "فارسی", direction: "rtl" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी", direction: "ltr" },
  { code: "bn", englishName: "Bengali", nativeName: "বাংলা", direction: "ltr" },
  { code: "ur", englishName: "Urdu", nativeName: "اردو", direction: "rtl" },
  { code: "pa", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ", direction: "ltr" },
  { code: "gu", englishName: "Gujarati", nativeName: "ગુજરાતી", direction: "ltr" },
  { code: "mr", englishName: "Marathi", nativeName: "मराठी", direction: "ltr" },
  { code: "ta", englishName: "Tamil", nativeName: "தமிழ்", direction: "ltr" },
  { code: "te", englishName: "Telugu", nativeName: "తెలుగు", direction: "ltr" },
  { code: "kn", englishName: "Kannada", nativeName: "ಕನ್ನಡ", direction: "ltr" },
  { code: "ml", englishName: "Malayalam", nativeName: "മലയാളം", direction: "ltr" },
  { code: "ne", englishName: "Nepali", nativeName: "नेपाली", direction: "ltr" },
  { code: "si", englishName: "Sinhala", nativeName: "සිංහල", direction: "ltr" },
  { code: "th", englishName: "Thai", nativeName: "ไทย", direction: "ltr" },
  { code: "lo", englishName: "Lao", nativeName: "ລາວ", direction: "ltr" },
  { code: "vi", englishName: "Vietnamese", nativeName: "Tiếng Việt", direction: "ltr" },
  { code: "km", englishName: "Khmer", nativeName: "ខ្មែរ", direction: "ltr" },
  { code: "my", englishName: "Burmese", nativeName: "မြန်မာ", direction: "ltr" },
  { code: "id", englishName: "Indonesian", nativeName: "Bahasa Indonesia", direction: "ltr" },
  { code: "ms", englishName: "Malay", nativeName: "Bahasa Melayu", direction: "ltr" },
  { code: "fil", englishName: "Filipino", nativeName: "Filipino", direction: "ltr" },
  { code: "zh-CN", englishName: "Chinese (Simplified)", nativeName: "简体中文", direction: "ltr" },
  { code: "zh-TW", englishName: "Chinese (Traditional)", nativeName: "繁體中文", direction: "ltr" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語", direction: "ltr" },
  { code: "ko", englishName: "Korean", nativeName: "한국어", direction: "ltr" },
  { code: "sw", englishName: "Swahili", nativeName: "Kiswahili", direction: "ltr" },
  { code: "am", englishName: "Amharic", nativeName: "አማርኛ", direction: "ltr" },
  { code: "af", englishName: "Afrikaans", nativeName: "Afrikaans", direction: "ltr" },
  { code: "zu", englishName: "Zulu", nativeName: "isiZulu", direction: "ltr" },
  { code: "ha", englishName: "Hausa", nativeName: "Hausa", direction: "ltr" },
  { code: "yo", englishName: "Yoruba", nativeName: "Yorùbá", direction: "ltr" },
  { code: "so", englishName: "Somali", nativeName: "Soomaali", direction: "ltr" },
];

export const DEFAULT_LOCALE = "en";

const LOCALE_CODE_SET = new Set(LOCALE_CODES.map((l) => l.code.toLowerCase()));
const LOCALE_INFO_BY_CODE = new Map(LOCALE_CODES.map((l) => [l.code.toLowerCase(), l]));

export function isRecognizedLocaleCode(code: string): boolean {
  return LOCALE_CODE_SET.has(code.toLowerCase());
}

export function getLocaleInfo(code: string): LocaleCodeInfo | undefined {
  return LOCALE_INFO_BY_CODE.get(code.toLowerCase());
}

export function directionForLocale(code: string): "ltr" | "rtl" {
  return getLocaleInfo(code)?.direction ?? "ltr";
}

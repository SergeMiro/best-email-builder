/**
 * The language a visitor first sees, without asking them and without sending
 * anything anywhere: the page is static, so their location is read from the
 * time zone of their device, never from their address.
 *
 * In order: `?lang=de`, the language they picked here before, their browser's
 * own language, the country of their clock, their browser's other languages,
 * English. The browser comes before the clock because it is the person's
 * choice: a Spanish speaker in Paris reads Spanish.
 */

const SAVED_KEY = 'best-email-builder-demo:locale';

/** Time zones whose country speaks one of the page's languages. */
const TIME_ZONES = {
  de: ['Europe/Berlin', 'Europe/Busingen', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Vaduz'],
  fr: [
    'Europe/Paris', 'Europe/Monaco', 'Indian/Reunion', 'Indian/Mayotte', 'America/Martinique', 'America/Guadeloupe',
    'America/Cayenne', 'Pacific/Noumea', 'Pacific/Tahiti', 'Africa/Dakar', 'Africa/Algiers', 'Africa/Tunis',
    'Africa/Casablanca', 'Africa/Kinshasa',
  ],
  es: [
    'Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta', 'America/Mexico_City', 'America/Cancun', 'America/Merida',
    'America/Monterrey', 'America/Matamoros', 'America/Chihuahua', 'America/Ciudad_Juarez', 'America/Ojinaga',
    'America/Hermosillo', 'America/Mazatlan', 'America/Bahia_Banderas', 'America/Tijuana', 'America/Bogota',
    'America/Lima', 'America/Santiago', 'America/Punta_Arenas', 'America/Caracas', 'America/Guayaquil',
    'America/La_Paz', 'America/Asuncion', 'America/Montevideo', 'America/Havana', 'America/Santo_Domingo',
    'America/Guatemala', 'America/El_Salvador', 'America/Tegucigalpa', 'America/Managua', 'America/Costa_Rica',
    'America/Panama', 'America/Buenos_Aires', 'Pacific/Galapagos', 'Pacific/Easter',
  ],
  ru: [
    'Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Europe/Volgograd', 'Europe/Saratov', 'Europe/Ulyanovsk',
    'Europe/Astrakhan', 'Europe/Kirov', 'Europe/Minsk', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk',
    'Asia/Barnaul', 'Asia/Tomsk', 'Asia/Novokuznetsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Chita',
    'Asia/Yakutsk', 'Asia/Khandyga', 'Asia/Vladivostok', 'Asia/Ust-Nera', 'Asia/Magadan', 'Asia/Sakhalin',
    'Asia/Srednekolymsk', 'Asia/Kamchatka', 'Asia/Anadyr', 'Asia/Almaty', 'Asia/Qostanay', 'Asia/Aqtobe',
    'Asia/Aqtau', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qyzylorda', 'Asia/Bishkek',
  ],
  zh: [
    'Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Kashgar', 'Asia/Macau',
    'Asia/Hong_Kong', 'Asia/Taipei', 'PRC',
  ],
};

const LOCALE_OF_ZONE = new Map(Object.entries(TIME_ZONES).flatMap(([locale, zones]) => zones.map((zone) => [zone, locale])));

function localeOfZone(zone) {
  if (!zone) return null;
  if (zone.startsWith('America/Argentina/')) return 'es';
  return LOCALE_OF_ZONE.get(zone) || null;
}

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** @param {string[]} supported the page's languages, two-letter codes */
export function initialLocale(supported) {
  const ours = (code) => {
    const short = String(code || '').slice(0, 2).toLowerCase();
    return supported.includes(short) ? short : null;
  };
  let saved = null;
  try {
    saved = localStorage.getItem(SAVED_KEY);
  } catch {
    // Storage blocked (private window, previews): nothing was remembered.
  }
  const [own, ...others] = navigator.languages?.length ? navigator.languages : [navigator.language];
  const candidates = [new URLSearchParams(window.location.search).get('lang'), saved, own, localeOfZone(deviceTimeZone()), ...others];
  for (const code of candidates) {
    const found = ours(code);
    if (found) return found;
  }
  return 'en';
}

/** Keeps the language a visitor picks, for their next visit and their next reload. */
export function rememberLocale(locale) {
  try {
    localStorage.setItem(SAVED_KEY, locale);
  } catch {
    // Not remembered: the page still works in the language picked.
  }
  // A link with `?lang=` would bring the old language back on reload.
  const url = new URL(window.location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', locale);
    window.history.replaceState(window.history.state, '', url);
  }
}

// Customer BRANDING profile parsing (Edit Customer → Branding):
//   logo_icon (favicon), logo_url (main logo), logo_color (accent).
// Defensive: the profile may be an object, a JSON string, or garbage; logo
// values must look like real URLs/paths and the color like a real CSS color,
// otherwise we return null so the UI falls back to the letter avatar + accent.
// (MUI <Avatar> additionally falls back to its children if the image itself
// fails to LOAD — broken links degrade gracefully too.)

const isValidLogoUrl = (v) =>
  typeof v === 'string' && (/^https?:\/\//i.test(v.trim()) || v.trim().startsWith('/'));

const isValidColor = (v) => {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)
    || /^rgba?\(/i.test(s)
    || /^hsla?\(/i.test(s);
};

export function parseCustomerBrand(profile) {
  let p = profile;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch { p = null; }
  }
  if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
  const logo = [p.logo_icon, p.logo_url].find(isValidLogoUrl) || null;
  const color = isValidColor(p.logo_color) ? p.logo_color.trim() : null;
  return { logo, color };
}

// The console's accent, from the customer's one brand colour (logo_color).
// Returns the CSS variables to set on :root — the app's own --accent-primary
// family and MUI's primary palette (the theme runs on CSS variables, so its
// buttons follow) — or null when the colour is not a hex value.
const ACCENT_ALPHAS = [8, 10, 12, 15, 18, 20];

const hexToRgb = (v) => {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const rgbToHex = (rgb) => `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
// amount < 0 mixes toward black, > 0 toward white.
const shade = (rgb, amount) =>
  rgb.map((n) => Math.round(amount < 0 ? n * (1 + amount) : n + (255 - n) * amount));

export function brandAccentVars(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  const darkRgb = shade(rgb, -0.2);
  const lightRgb = shade(rgb, 0.2);
  const main = rgbToHex(rgb);
  const darker = rgbToHex(darkRgb);
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;

  const vars = {
    '--accent-primary': main,
    '--accent-primary-hover': darker,
    '--accent-primary-dark': darker,
    '--mui-palette-primary-main': main,
    '--mui-palette-primary-dark': darker,
    '--mui-palette-primary-light': rgbToHex(lightRgb),
    '--mui-palette-primary-mainChannel': rgb.join(' '),
    '--mui-palette-primary-darkChannel': darkRgb.join(' '),
    '--mui-palette-primary-lightChannel': lightRgb.join(' '),
    '--mui-palette-primary-contrastText': luminance > 0.6 ? '#1a202c' : '#ffffff',
  };
  ACCENT_ALPHAS.forEach((a) => {
    vars[`--accent-primary-alpha-${a}`] = `rgba(${rgb.join(', ')}, ${(a / 100).toFixed(2)})`;
  });
  return vars;
}

// Every variable brandAccentVars can set, for clearing them again.
export const BRAND_ACCENT_VAR_NAMES = Object.keys(brandAccentVars('#000000'));

/**
 * The software's look: dark (the website's night room, the default), light,
 * or whatever the device is set to. Kept in a cookie on the device, so the
 * page arrives in the right colours without a flash. The website itself
 * stays dark either way: it is the brand.
 */

export type Theme = "dark" | "light" | "system";
export const THEME_COOKIE = "nf_theme";
export const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "Match my device" },
];

export const themeFrom = (v: string | undefined | null): Theme => (v === "light" || v === "system" ? v : "dark");

/** Puts the choice on the page now and remembers it for a year on this device. Browser only. */
export function applyTheme(t: Theme) {
  document.querySelectorAll<HTMLElement>(".app").forEach((el) => { el.dataset.theme = t; });
  document.cookie = `${THEME_COOKIE}=${t}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

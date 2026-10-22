// Themes with a dark background. The `dark` custom variant and the dark
// Leaflet and tweet selectors in app/globals.css list the same classes.
const DARK_THEMES: ReadonlySet<string> = new Set([
  'dark',
  'colourful',
  'plum',
  'inkdark',
  'neutraldark',
  'midnight',
  'forest',
  'ember',
]);

/** Takes next-themes' `resolvedTheme`, which is already 'light' or 'dark' when the user follows the OS. */
export function isDarkTheme(theme: string | undefined): boolean {
  return theme !== undefined && DARK_THEMES.has(theme);
}

/** For code outside React that reads the theme class next-themes puts on <html>. */
export function isDarkDocument(): boolean {
  return Array.from(document.documentElement.classList).some((name) => DARK_THEMES.has(name));
}

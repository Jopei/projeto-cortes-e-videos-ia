// Inline script executed before hydration to avoid a flash of the wrong theme.
// Reads the persisted preference (or falls back to the OS preference) and
// applies the `dark` class to <html> synchronously.
const themeInitScript = `
(function () { try { var stored = localStorage.getItem("theme"); var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches; var theme = stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light"; document.documentElement.classList.toggle("dark", theme === "dark"); document.documentElement.style.colorScheme = theme; } catch (e) {} })();
`;

export function ThemeScript() {
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
}

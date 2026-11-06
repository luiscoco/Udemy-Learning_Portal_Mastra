/* global document */
// External, synchronous script keeps the saved theme before first paint under script-src 'self'.
try {
  const theme = localStorage.getItem('mlp.theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch {
  // A browser that blocks local storage keeps the light default.
}

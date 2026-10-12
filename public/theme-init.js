// Apply the saved theme before first paint (avoids a light flash for dark-theme users).
// Kept as a file rather than inline so the Content-Security-Policy can forbid inline scripts.
try {
  var p = (JSON.parse(localStorage.getItem('shindan.settings') || '{}').state || {}).theme || 'system';
  var d = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = d ? 'dark' : 'light';
} catch (e) {}

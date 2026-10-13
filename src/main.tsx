import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Latin + Latin Extended subsets only (full Turkish: ş ğ ı İ). Both are Japanese typefaces; the few
// decorative kanji fall back to the system's Japanese font, which keeps the bundle small.
import '@fontsource/biz-udpmincho/latin-700.css';
import '@fontsource/biz-udpmincho/latin-ext-700.css';
import '@fontsource/m-plus-1p/latin-400.css';
import '@fontsource/m-plus-1p/latin-ext-400.css';
import '@fontsource/m-plus-1p/latin-500.css';
import '@fontsource/m-plus-1p/latin-ext-500.css';
import '@fontsource/m-plus-1p/latin-700.css';
import '@fontsource/m-plus-1p/latin-ext-700.css';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import './i18n';
import { App } from './app/App';
import { useRecording } from './state/recording';
import { initErrorReporting } from './lib/errorReporting';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Load saved recordings and close any that were interrupted by a reload or crash.
void useRecording.getState().init();
initErrorReporting();

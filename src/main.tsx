import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Latin subsets only: UI text is Turkish/English. The few decorative kanji fall back to the
// system's Japanese serif (Hiragino / Yu Mincho / Noto Serif CJK), which keeps the bundle small.
import '@fontsource/shippori-mincho/latin-500.css';
import '@fontsource/shippori-mincho/latin-ext-500.css';
import '@fontsource/shippori-mincho/latin-700.css';
import '@fontsource/shippori-mincho/latin-ext-700.css';
import '@fontsource/zen-kaku-gothic-new/latin-400.css';
import '@fontsource/zen-kaku-gothic-new/latin-ext-400.css';
import '@fontsource/zen-kaku-gothic-new/latin-500.css';
import '@fontsource/zen-kaku-gothic-new/latin-ext-500.css';
import '@fontsource/zen-kaku-gothic-new/latin-700.css';
import '@fontsource/zen-kaku-gothic-new/latin-ext-700.css';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import './i18n';
import { App } from './app/App';
import { useRecording } from './state/recording';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Load saved recordings and close any that were interrupted by a reload or crash.
void useRecording.getState().init();

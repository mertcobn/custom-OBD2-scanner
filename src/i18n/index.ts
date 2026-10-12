import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useSettings } from '@/state/settings';
import { en } from './en';
import { tr } from './tr';

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, tr: { translation: tr } },
  lng: useSettings.getState().language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

useSettings.subscribe((s, prev) => {
  if (s.language !== prev.language) void i18n.changeLanguage(s.language);
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
  i18n.on('languageChanged', (l) => (document.documentElement.lang = l));
}

export default i18n;

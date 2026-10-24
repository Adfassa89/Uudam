import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import mn from './mn';

export type Language = 'mn' | 'en';
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'mn', label: 'Монгол' },
  { code: 'en', label: 'English' },
];

// Mongolian is the default; the saved choice from Settings is applied on start-up.
i18n.use(initReactI18next).init({
  resources: { mn: { translation: mn }, en: { translation: en } },
  lng: 'mn',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;

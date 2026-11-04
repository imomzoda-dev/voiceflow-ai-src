import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import ru from './locales/ru'
import tg from './locales/tg'

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru }, tg: { translation: tg } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false
})

export function setUiLanguage(lang: 'en' | 'ru' | 'tg') {
  if (i18n.language !== lang) void i18n.changeLanguage(lang)
  document.documentElement.lang = lang
}

export default i18n

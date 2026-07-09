import { createContext, useContext, useState, useCallback } from 'react';
import { translations } from './translations';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(localStorage.getItem('bp_lang') || 'ru');

  const setLang = useCallback((l) => {
    localStorage.setItem('bp_lang', l);
    setLangState(l);
  }, []);

  const t = useCallback((key) => translations[lang]?.[key] ?? translations.ru[key] ?? key, [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang должен использоваться внутри LangProvider');
  return ctx;
}

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import en from './en.json';
import tr from './tr.json';

const DICTS = { en, tr };
const STORAGE_KEY = 'claude-web.language';
const SUPPORTED = ['en', 'tr'];

const LanguageContext = createContext(null);

function readInitial() {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
  } catch {
    // localStorage may be unavailable; fall through.
  }
  return 'en';
}

function interpolate(text, params) {
  if (!params) return text;
  let out = text;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return out;
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitial);

  const setLang = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore quota / privacy-mode errors
    }
  }, []);

  const t = useCallback(
    (key, params) => {
      const dict = DICTS[lang] || DICTS.en;
      const raw = dict[key] ?? DICTS.en[key] ?? key;
      return interpolate(raw, params);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useT must be used within a <LanguageProvider>');
  }
  return ctx;
}

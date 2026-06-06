import { useT } from '../../i18n/LanguageContext';

// Two-option radio group ("EN" / "TR") shown next to the header Save button.
// Selection persists via the LanguageProvider (localStorage).
export default function LanguageToggle() {
  const { lang, setLang, t } = useT();

  return (
    <fieldset className="lang-toggle" aria-label={t('lang.legend')}>
      <label className={`lang-toggle__option${lang === 'en' ? ' is-active' : ''}`}>
        <input
          type="radio"
          name="app-language"
          value="en"
          checked={lang === 'en'}
          onChange={() => setLang('en')}
        />
        <span>{t('lang.en')}</span>
      </label>
      <label className={`lang-toggle__option${lang === 'tr' ? ' is-active' : ''}`}>
        <input
          type="radio"
          name="app-language"
          value="tr"
          checked={lang === 'tr'}
          onChange={() => setLang('tr')}
        />
        <span>{t('lang.tr')}</span>
      </label>
    </fieldset>
  );
}

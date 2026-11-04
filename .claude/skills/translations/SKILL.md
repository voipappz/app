---
name: translations
description: Add or change any text the person sees, support Hebrew/right-to-left, dates, numbers, or phone layouts. Use whenever a change adds or edits words on a screen, or the person mentions Hebrew, RTL, language or mobile.
---

# Translations, right-to-left and phones

The app speaks English (default) and Hebrew and works from 375px wide. The full
recipe is `docs/i18n-guide.md`; read it before converting a screen.

1. **Text goes in JSON, both languages.** `src/i18n/locales/en/<ns>.json` and
   `src/i18n/locales/he/<ns>.json`, same keys. A new namespace must also be
   imported and listed (in `resources` and `ns`) in `src/i18n/index.js`.
   In the component: `const { t } = useTranslation('<ns>')`, `t('table.name')`,
   values as `t('key', { name })` with `{{name}}` in the JSON. Keys say what
   the text is, not what it says. Server text (API errors) stays as sent.
2. **English must not change** when converting a screen.
3. **Identifiers** (phone numbers, extensions, SIP URIs, IPs, IDs): wrap in
   `<Bdi>` from `src/i18n/Bdi.jsx`.
4. **Charts and canvases** stay left to right: `<LtrIsland>`
   (`src/i18n/LtrIsland.jsx`).
5. **Dates and numbers:** `formatDate` / `formatOnlyDate`
   (`src/utils/dateUtils.js`), `formatNumber` (`src/utils/numberUtils.js`).
   Never `toLocaleString` or `Intl` by hand.
6. **Sides are logical:** `ms`/`me`/`ps`/`pe` in `sx`, `margin-inline-start` in
   CSS, `textAlign: 'start'`.
7. **Tables and dialogs:** `ResponsiveTable`
   (`src/components/shared/ResponsiveTable/`, example
   `src/components/Extensions/extensionColumns.jsx`) and
   `import { ResponsiveDialog as Dialog } from '../ui'`. Sizes come from
   `useLayoutSize()` (`src/hooks/useLayoutSize.js`).
8. **Lock it in:** add the converted folder or file to `CONVERTED` in
   `eslint.config.js`, where hand-made dates and physical sides become errors.
9. **Check:** `make gate` runs `src/i18n/translations.test.js` (every English
   text has a Hebrew one, none empty, same placeholders). Then look at the
   preview in Hebrew (`localStorage.setItem('app-language', 'he')`, or the
   avatar / account menu) and at phone width.

Hebrew drafted by an agent needs a native speaker's review; say so in the reply.

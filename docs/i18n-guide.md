# Hebrew, English and phones: converting a screen

The app speaks English and Hebrew and works from 375px up. The foundation is
in `src/i18n/` and the responsive building blocks in `components/ui` and
`components/shared/ResponsiveTable`. Converted so far: the shell (sidebar, top
bar, sign-in pages), the shared search bar and date picker, Devices
(`Extensions`) and Calls. Everything else converts the same way, one screen
at a time.

## The rule

**Touch it, convert it.** A pull request that changes a screen also converts
that screen's text. English must look exactly as before: existing tests and
Playwright specs pass unchanged.

## Recipe

1. **Text.** Add `src/i18n/locales/{en,he}/<screen>.json` and register the
   namespace in `src/i18n/index.js`. In the component:
   `const { t } = useTranslation('<screen>')`, then `t('table.name')`.
   - Keys say what the text *is* (`table.registered`), never what it says.
   - Values: `t('import.result', { message })` with `{{message}}` in the JSON.
   - Bold or a link inside a sentence: `<Trans t={t} i18nKey="delete.message" components={{ name: <strong>{name}</strong> }} />`
     with `<name/>` in the JSON.
   - Text from the server (API errors, column headers from the API) stays as
     sent. Only the screen's own text is ours to translate.
2. **Identifiers.** Wrap phone numbers, extensions, SIP URIs, IPs and IDs in
   `<Bdi>` (`src/i18n/Bdi.jsx`), or `+972-3-555-1234` reads backwards in Hebrew.
3. **Dates and numbers.** `formatDate`/`formatOnlyDate` (`utils/dateUtils`),
   `formatNumber` (`utils/numberUtils`). Never `toLocaleString` or `Intl` by hand.
4. **Sides.** Logical, so the screen mirrors: `ms`/`me`/`ps`/`pe` in `sx`,
   `margin-inline-start`, `inset-inline-end` in CSS, `textAlign: 'start'`.
   Menus and popovers: pick `left`/`right` from `useTheme().direction`.
5. **Charts and canvases** stay left to right: wrap them in `<LtrIsland>`.
6. **Tables.** Describe the columns and render `<ResponsiveTable>`: the same
   table on a desktop, cards on a phone. Each column's `priority` places it on
   the card. Example: `components/Extensions/extensionColumns.jsx`.
7. **Dialogs.** `import { ResponsiveDialog as Dialog } from '../ui'`: full
   screen on a phone.
8. **Lock it in.** Add the folder to `CONVERTED` in `eslint.config.js`. There,
   hand-made date formatting and physical sides are errors, not warnings.

## Checks

- `make gate DOCKER=1`: lint and unit tests, including
  `src/i18n/translations.test.js` (every English text has a Hebrew one, none
  empty, same placeholders). CI runs it as its own **Translations** step.
- Look at the screen at desktop size and at 375px, in English and Hebrew,
  light and dark. Switch language from the avatar menu (users) or your own
  account dialog (admins), or with `localStorage.setItem('app-language', 'he')`.
- Hebrew is drafted from the legacy glossaries; sentences need a native
  speaker's review before clients see them.

## Backlog, most used first

Routes (DIDs), Services, Users, Subscriptions, Dashboard, Live, Messages,
Reports, Accounts, Templates, Tariffs, Settings, Events, Syslog, Monitoring,
Providers; then the dialogs they open (e.g. the device form in
`Bridges/ExtensionBridge`). Also left: the search and breadcrumb names, the
top bar's tool dialogs, the shared Yes/No chip (`utils/chipStyles.js`),
`constants/tours.js`, and the physical sides still in `Calls`, `Sidebar`,
`CentralizedSearch` and `EnhancedDateRangePicker` (convert, then add to
`CONVERTED`). Bootstrap 5 loaded in `index.html` should go in its own PR.

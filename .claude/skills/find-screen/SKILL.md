---
name: find-screen
description: Find the code behind a screen, page, menu item or button the person mentions ("the Routes page", "the Devices list", "the sidebar"). Use before changing any UI, to go from what they see in the preview to the file to edit.
---

# Find a screen

1. **Route to component.** `src/App.jsx` lists every route. Each screen is a
   `lazy(() => import('./components/<Area>/<Name>.jsx'))` near the top, and a
   `<Route path="/x">` further down that renders it inside `ProtectedRoute`
   with the screen's ACL key.
2. **Menu label to route.** `src/config/navConfig.js` (`NAV_ITEMS`): the
   sidebar's text, `labelKey` (translation key in `src/i18n/locales/*/nav.json`),
   `path` and `aclKey`.
3. **Names that differ from the URL:**
   | URL | Code |
   | --- | --- |
   | `/routes` | `src/components/DIDs/RoutingScreen.jsx` (`/routes/list` is `DIDs/DIDs.jsx`) |
   | `/extensions` ("Devices") | `src/components/Extensions/` |
   | `/services`, `/billing` | `src/components/Studio/ServicesStudio.jsx`, `BillingStudio.jsx` |
   | `/live` | `src/components/LiveDashboard/` (data: `src/hooks/useLiveEntities.js`) |
   | `/schema` | `src/components/Appz/Schema.jsx` |
   | `/logs` | `src/views/syslogs/LogsScreen.jsx` |
   | `/devzone` | `src/components/ApiDocs/ApiDocs.jsx` (rules in `AGENTS.md`) |
   | `/` and `/admin` signed out | `src/components/Login/SignIn.jsx` |
4. **Inside the folder.** `Name.jsx` is the UI, `Name.js` the hook with state
   and API calls, subfolders hold dialogs and lists (e.g.
   `Extensions/ExtensionDialog/`). Table columns often sit in
   `<name>Columns.jsx`.
5. **The shell.** `src/components/Layout/`, `Sidebar/`, `TopBar/`; shared
   pieces in `src/components/shared/` (e.g. `ResponsiveTable`) and
   `src/components/ui/` (`ResponsiveDialog`, `ConfirmDialog`).
6. **Who sees it.** `src/routing/routeAccess.js`: a user (User preview) enters
   only routes with an ACL key their session grants; routes without a key are
   account-only (Admin preview). Inside a screen, `useIsUserSession()`
   (`src/hooks/useIsUserSession.js`) hides account-only controls.

Still lost: search the visible text. English strings are either in
`src/i18n/locales/en/*.json` (then search the key) or inline in the `.jsx`.

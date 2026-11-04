---
name: add-api-call
description: Add or change a call to the VoIPappz API (list, create, update, delete, a new field or endpoint). Use when a screen needs data it does not load yet, or a form must save something new.
---

# Add an API call

1. **Check the real API first.** Use the `voipappz` MCP tools (read-only) to
   see the endpoint, its parameters and a real response. Don't guess field
   names.
2. **Put the call in `src/services/api/<resource>Api.js`** (one object per
   resource, e.g. `tariffsApi` in `tariffsApi.js`). Add to the existing file
   when there is one. Pattern:
   ```js
   import { apiService, toFormData } from '../apiService';
   // read
   getTariffs: (params = {}) => apiService.get(`/api/tariffs?page=${params.page || 1}&search[name]=${encodeURIComponent(params.name || '')}`),
   // create: POST, form URL encoded
   createTariff: (data) => apiService.post('/api/tariffs', toFormData(data),
     { 'Content-Type': 'application/x-www-form-urlencoded' }, 'creating tariff', true),
   // update: PATCH, never PUT
   updateTariff: (id, data) => apiService.patch(`/api/tariffs/${id}`, toFormData(data),
     { 'Content-Type': 'application/x-www-form-urlencoded' }, `updating tariff ${id}`, true),
   ```
   Never send JSON bodies. `toFormData` (`src/services/apiService.js`) encodes
   nested objects as `key[sub]=v` and arrays as `key[]=v`, the way the API
   parses them. Filters go in `search[<field>]=`.
3. **Paths are relative** (`/api/...`, `/auth/...`, `/tasks/...`). In dev the
   Vite proxy (`vite.config.js`) forwards them to `VITE_API_BASE_URL`;
   `getApiBaseUrl()` in `src/config.js` decides the base. Never hard-code a
   host.
4. **Scope to the environment.** In the screen's hook, read
   `const { selectedEnvironments } = useCustomerEnvironment()`
   (`src/context/CustomerEnvironmentContext.jsx`) and pass
   `environment_uuid: selectedEnvironments[0]?.uuid` (see
   `src/components/Extensions/Extensions.js`). A user session has one
   environment and no pickers: check `useIsUserSession()` before showing
   account-only fields.
5. **Errors and messages.** With `showMessages` true (the default),
   `apiService` shows errors to the person, and a success message when a
   `context` string names the action (`'creating tariff'`).
6. **Test it.** Add or extend `src/services/api/<resource>Api.test.js`
   (`vi.mock('../apiService', ...)`, see `botsApi.test.js`), then
   `make gate`.

# Nimbus Admin agent guide

## Project role

- Nimbus is the React/Vite administration UI. API semantics and the canonical OpenAPI document belong to sibling `../voipappz-api`.
- API DevZone is the protected Nimbus route `/devzone`, rendered by `src/components/ApiDocs/ApiDocs.jsx` with `swagger-ui-react`. Do not use an `/api*` canonical browser path because Kong routes that prefix to the Ruby API.
- The page loads the public current-environment contract from `GET /tasks/openapi.json` and embeds the customer integration Skill readiness from `/tasks/agent-skills`. Do not restore `public/voipappz.openapi.json` or duplicate Skill content in React.
- Sidebar and mobile DevZone actions must navigate internally to `/devzone`, not to Apidog or another hosted duplicate. `/api-docs` is only a client-side compatibility redirect where the SPA receives it.

## Security boundary

- Fetching the OpenAPI and Agent Skill resources is anonymous and must omit credentials.
- Swagger “Try It Out” may inject the current admin bearer token into API requests, and nothing else — the API reads the auth mode from the token.
- Claude/ChatGPT/copy-context actions may share only the public Skill, readiness, and contract URLs with safe instructions. Never pass an access token, credentials, customer data, or browser storage to an external AI site.

## Verification

- Run `make gate` (lint and unit tests) after a change, and `make test SPEC=<name>` when a Playwright spec covers the screen. CI is the gate for every push.
- Do not start a second dev server when one is already running (VoipAppz Builder runs one with hot reload).
- Preserve unrelated worktree changes and never embed a production API hostname when `config.apiBaseUrl` or same-origin routing can select the current environment.

## Project skill

- Use `$maintain-voipappz-api-docs-ui` for API DevZone, Swagger UI, AI documentation actions, and OpenAPI consumption changes.

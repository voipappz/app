---
name: maintain-voipappz-api-docs-ui
description: Maintain Nimbus API DevZone, embedded React Swagger UI and VoipAppz Agent Skill readiness, current-environment public resource loading, Try It Out authentication, and safe Claude/ChatGPT actions. Use for `/devzone`, `ApiDocs.jsx`, API DevZone navigation, Swagger or Skill presentation, or removing duplicated API documentation. Do not use this skill to define backend API semantics; those belong to `../voipappz-api`.
---

# Maintain VoipAppz API Docs UI

Keep Nimbus a presentation and interaction layer over the API-owned public contract.

## Workflow

1. Read repository `AGENTS.md` and [integration-map.md](references/integration-map.md).
2. Confirm the canonical behavior in sibling `../voipappz-api` before changing a path, security scheme, or schema.
3. Load `${config.apiBaseUrl}/tasks/openapi.json`; when the base URL is empty, use the same-origin `/tasks/openapi.json` path.
4. Load the customer Skill readiness from `/tasks/agent-skills/use-voipappz-api/references/integration-status.json` and render its twelve topics. Do not hardcode their answers in React.
5. Override `servers` only in the in-memory document so Try It Out targets the selected/current environment.
6. Inject the current admin bearer token, and no other header, only in Swagger API requests.
7. Keep API DevZone navigation internal to `/devzone` on desktop and mobile, with no feature ACL beyond a signed-in session. Kong owns the `/api*` prefix, so `/api-docs` cannot be the canonical cloud browser route.
8. Keep AI actions credential-free: share only public Skill, readiness, and contract URLs in the safe prompt.
9. Run `make gate` (lint and unit tests). CI is the gate for every push.

## Ownership boundaries

- Do not add a JSON specification under `public/`.
- Do not copy the integration readiness JSON into Nimbus; the API Skill owns it.
- Do not hardcode cloud, MTN, or another deployment hostname in the component.
- Do not edit the canonical OpenAPI JSON from Nimbus; make contract changes in `../voipappz-api`.
- Do not send access tokens, local storage, customer data, or request history to Claude, ChatGPT, or another external site.
- Do not redirect API DevZone to Apidog or another hosted documentation copy.

## Acceptance checks

- `/devzone` renders `swagger-ui-react` and the twelve-topic AI Integration Skill panel.
- Public contract and Skill fetches explicitly omit credentials.
- Try It Out receives the active Nimbus token and account auth selector.
- OpenAPI JSON and Agent Skill open their public endpoints.
- Open in Claude and Open in ChatGPT copy the safe Skill plus contract context prompt and open the official site.
- Fetch failures surface an HTTP-specific alert.

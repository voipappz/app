# Repository Guidelines

## Project Structure & Module Organization
This repo contains a Vite frontend and a Deno backend. Use `src/` for React application code, including `components/`, `services/`, `lib/`, `hooks/`, `context/`, `i18n/`, and `theme/`. Use `api/` for Supabase sync, Fireberry integration, PDF generation, email, and DocuSeal endpoints. End-to-end and security specs live in `tests/`; shared test helpers live in `tests/helpers/`; frontend unit-test setup lives in `src/test/`. Store static assets in `public/` or `src/assets/`. Put SQL changes in `migrations/`. Treat `OLD/` as legacy unless a task explicitly targets it.

## Build, Test, and Development Commands
Run `npm run dev` for the frontend, `npm run dev:full` for frontend plus `server.js`, and `npm run build` for production output. Use `npm run lint` for ESLint, `npm run test:run` for Vitest, and `npm run test:pw` or `make test` for Playwright. Use focused targets such as `make test-auth`, `make test-rls`, and `make test-customers`. For backend work, run `make api-dev` and `make api-test`.

## Coding Style & Naming Conventions
Preserve existing 2-space indentation and local file style. Use `PascalCase` for components, `useCamelCase` for hooks, `camelCase` for utilities, and `kebab-case` for script filenames. Keep changes narrow and consistent with adjacent code.

## Testing, Commits, and PRs
Name frontend tests `*.test.*` or `*.spec.*` beside source files. Add the smallest relevant test first, then run the narrowest validating command. Follow commit subjects like `test: add auth fixture` or `deploy: pass VITE secrets`. PRs should include summary, linked context, UI screenshots when applicable, and executed test commands.

Never commit secrets anywhere.

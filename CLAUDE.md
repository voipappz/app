# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

`make` lists the targets. `make setup` takes a fresh clone to a runnable
state, `make onboard` checks the login token for the API (dev and test run it
first), `make gate` runs lint and the unit suite (`DOCKER=1` in a node:22
container, for a host that cannot run the pinned node), and `make check` is the
gate to pass before pushing (secrets, lint, unit, build).

Never hand-write a command this Makefile already has a target for.

## Development Commands

- `npm run lint` - Run ESLint (only local check allowed)
- `npm run build` - Build for production
- `npm run dev` - Start development server with hot reload
- `npm run preview` - Preview production build locally

## Build & Run Policy

**NEVER run `npm run build`, `npm run dev`, or start the server locally.**
All builds and test runs happen exclusively in CI (GitHub Actions).
The only local command allowed before pushing is `npm run lint`.

## CI Verification (REQUIRED after every push)

CI is GitHub Actions only (`.github/workflows/ci.yml`). CircleCI and the
Bitbucket mirror it served were retired on 2026-09-14. After every `git push`,
confirm the run passes. `gh` is all it takes; no CI token.

```bash
gh run list --branch "$(git branch --show-current)" --workflow ci.yml --limit 3
gh run watch <run-id> --exit-status      # block until it finishes
gh pr checks <pr-number>                 # the same result on a pull request
gh run view <run-id> --log-failed        # output of the failing step
```

What runs:
- every push and pull request: `lint, unit, build`, `dependency audit`
  (`npm run security-scan`), `nginx.conf syntax`
- `end-to-end (Playwright)`: only when the four test secrets exist; without them
  it skips itself with a notice instead of failing
- `Docker image`: builds the image on every push and pull request; only a
  push to `main` publishes `nirlevi/va-admin:release-gh-<run>` and `:latest`
  with the `DOCKER_PASS` repository secret (never `release-<n>`: CircleCI used
  those numbers)

### What to do if CI fails
1. `gh run view <run-id> --log-failed` for the failing step
2. Fix the issue locally
3. Run `npm run lint` before pushing again
4. Push the fix and verify CI passes

## Test Environment

**IMPORTANT**: Always use cloud.voipappz.io for testing (NOT ubi.voipappz.io or MTN production):

```bash
# Test credentials for cloud.voipappz.io
VITE_API_BASE_URL=https://cloud.voipappz.io
TEST_EMAIL=<your test account email>
TEST_PASSWORD=<your test account password>
VA_TEST_OTP=<test OTP bypass code>
```

### Authentication: 2-Step OTP Login Flow

The backend requires a **2-step OTP login flow**:

1. **Step 1 - Login**: `POST /auth/login` with email + password → returns `{ otp_sent: true, temp_token: "..." }`
2. **Step 2 - OTP Verify**: `POST /auth/otp/verify` with temp_token + code + email + password → returns JWT tokens (`access`, `refresh`, `csrf`)

**VA_TEST_OTP**: The backend (`voipappz-api/lib/mediators/account/verify_otp.rb`) accepts `VA_TEST_OTP=<test OTP bypass code>` as a bypass code instead of a real email OTP. It still validates email + password even with the test OTP.

**Account lockout**: 5 failed login attempts trigger a 15-minute lockout.

### Verify API connectivity
```bash
# Step 1: Login (returns temp_token)
TEMP_TOKEN=$(curl -s -X POST "https://cloud.voipappz.io/auth/login?email=${TEST_EMAIL}&password=${TEST_PASSWORD}" | python3 -c "import sys,json; print(json.load(sys.stdin)['temp_token'])")

# Step 2: OTP Verify (returns JWT tokens)
curl -s -X POST "https://cloud.voipappz.io/auth/otp/verify?temp_token=${TEMP_TOKEN}&code=${VA_TEST_OTP}&email=${TEST_EMAIL}&password=${TEST_PASSWORD}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('access' if 'access' in d else 'FAIL')"
```

### Playwright Auth Pattern
```javascript
// Full OTP login in Playwright (see tests/auth-fixture.ts)
const loginResp = await page.request.post(
  `${apiBaseUrl}/auth/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
);
const { temp_token } = await loginResp.json();

const otpResp = await page.request.post(
  `${apiBaseUrl}/auth/otp/verify?temp_token=${encodeURIComponent(temp_token)}&code=${VA_TEST_OTP}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
);
const { access, refresh, csrf } = await otpResp.json();
// Set tokens in localStorage, then reload
```

## Sessions: one at a time

`AuthContext` (storage `auth`) and `UserAuthContext` (storage `user_auth`) use
separate JWTs, but both sign in through `/` (`SignIn.jsx`, toggled User /
Account) and enter the same admin console. Signing in on either door ends the
other session (`src/services/sessionIsolation.js`), so requests always use the
active identity. `/admin` and `/login` only select the Account sign-in view.

An account can choose customer and environment. A user has one environment and
uses the same sidebar, top bar, and routes, filtered strictly by their ACL: a
screen or control with no ACL key is account-only. The phone drawer opens for
either session: a user's own extension registers itself
(`SoftphoneContext`). Keep account token-only Calls features (column configuration,
saved filters, and live-call count) off for user sessions; list, segments,
aggregates, and export must use the user's token. `useIsUserSession()`
identifies this branch.

Ending either session calls `forgetPerson`: `apiService` drops cached and
in-flight data and clears personal keys so identities cannot share data.

## Running Tests

**CRITICAL: ALWAYS RUN TESTS ON CI, NOT LOCALLY**

Do NOT run tests locally - always push changes and let GitHub Actions run the tests. This ensures:
- Consistent test environment
- No local resource constraints
- Proper test isolation
- Accurate results matching production

**Workflow:**
1. Make changes
2. Run `npm run lint` locally (quick, catches syntax errors)
3. Push to remote
4. Let CI run tests
5. Check CI results

**IMPORTANT**: Always load environment variables before running tests:

```bash
# Load .env and run all tests
source .env && export VITE_API_BASE_URL TEST_EMAIL TEST_PASSWORD && make test

# Run one spec: SPEC is the file name in tests/ without .spec.ts
make test SPEC=users
make test SPEC=environments
```

The `.env` file must contain:
- `VITE_API_BASE_URL` - API endpoint (e.g., https://ubi.voipappz.io)
- `TEST_EMAIL` - Test account email
- `TEST_PASSWORD` - Test account password

## Testing Standards

### Rules
1. **Run tests ONLY via Makefile** - Never run `npx playwright` directly
2. **One spec file per component** - Consolidate all tests into single file (e.g., `users.spec.ts`, `environments.spec.ts`)
3. **Reuse auth fixture** - Use shared auth from `tests/auth-fixture.ts`
4. **200 = PASS** - Tests pass if API returns 2XX status code

### Test Success Criteria
- **CREATE**: API returns 200/201 = PASS
- **UPDATE**: API returns 200 = PASS
- **DELETE**: API returns 200/204 = PASS
- **READ/LIST**: API returns 200 with data = PASS

### Test File Pattern
Follow the pattern from `tests/users-optimized.spec.ts`:

```typescript
import { test, expect, apiHelpers } from './auth-fixture';

test.describe('Component Management', () => {
  // Shared auth - no repeated login
  test('should load page and verify API returns 200', async ({ authenticatedPage: page }) => {
    await page.goto('/component', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    const apiBaseUrl = process.env.VITE_API_BASE_URL;
    const authToken = await page.evaluate(() => {
      const auth = JSON.parse(localStorage.getItem('auth') || '{}');
      return auth.access;
    });

    // Test API returns 200
    const response = await page.request.get(`${apiBaseUrl}/api/component`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
  });
});
```

### File Naming Convention
- ONE test file per component: `tests/{component}.spec.ts`
- Examples: `users.spec.ts`, `environments.spec.ts`, `subscriptions.spec.ts`

## TDD (Test-Driven Development) Methodology

**All development MUST follow TDD approach:**

### TDD Cycle
1. **RED** - Write a failing test first
2. **GREEN** - Write minimal code to make test pass
3. **REFACTOR** - Clean up code while keeping tests green

### TDD Workflow
```bash
# Step 1: Write/update test spec
# Edit tests/{component}.spec.ts

# Step 2: Run test (expect FAIL)
source .env && export VITE_API_BASE_URL TEST_EMAIL TEST_PASSWORD && make test-{component}

# Step 3: Fix component code to make test pass
# Edit src/components/{Component}/{Component}.jsx
# Edit src/components/{Component}/{Component}.js
# Edit src/services/api/{component}Api.js

# Step 4: Run test (expect PASS)
source .env && export VITE_API_BASE_URL TEST_EMAIL TEST_PASSWORD && make test-{component}

# Step 5: Refactor if needed, keeping tests green
```

### TDD Rules
1. **Never write production code without a failing test**
2. **Write only enough test to fail** (compilation failures count)
3. **Write only enough code to pass the failing test**
4. **Tests define the expected behavior** - code implements it

### Example TDD Session
```typescript
// 1. Write failing test
test('should create environment and get 200', async ({ authenticatedPage: page }) => {
  const response = await page.request.post(`${apiUrl}/api/applications`, {
    data: { name: 'Test', enabled: true }
  });
  expect(response.status()).toBe(200); // This will FAIL initially
});

// 2. Run test - see it fail
// 3. Implement the API endpoint/component
// 4. Run test - see it pass
// 5. Refactor if needed
```

## API Patterns

### HTTP Methods
- **CREATE**: Use POST with form URL encoded data
- **UPDATE**: Use PATCH (not PUT) with form URL encoded data - **IMPORTANT: Always use PATCH for updates**
- **DELETE**: Use DELETE
- **READ**: Use GET

### Authentication (Login)
**Login uses POST with query parameters (NOT JSON body):**

```bash
# Correct login format
POST /auth/login?email={email}&password={password}

# Example
curl -X POST "https://cloud.voipappz.io/auth/login?email=user%40example.com&password=MyPassword"
```

The response contains `access` (JWT token), `refresh` token, and `csrf` token.

### Content-Type: Form URL Encoded
**All API POST/PATCH requests MUST use form URL encoded format, NOT JSON.**

This applies to ALL endpoints including authentication:

```bash
# Auth login (form URL encoded)
curl -X POST "https://cloud.voipappz.io/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=user@example.com&password=secret"
```

```javascript
// CORRECT - Form URL Encoded
const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
const formData = new URLSearchParams();
formData.append('name', 'Test');
formData.append('enabled', 'true');
await apiService.post(url, formData, headers);

// WRONG - JSON (DO NOT USE)
await apiService.post(url, { name: 'Test', enabled: true });
```

### Environment Fields
- `name` (required) - Environment name
- `enabled` (boolean) - Whether environment is active
- `description` (optional) - Environment description
- **NO `type` field** - Type is not used for environments

### Subscription Fields
- `name` (required)
- `enabled` (boolean)
- `balance` (numeric, required)
- `environment_uuid` (required)
- `tariff_uuid` (required)
- `recurring` (boolean)
- `begins_at`, `ends_at` (dates)
- `status` (string)

## Legacy Code Reference

**IMPORTANT**: Multiple legacy codebases are available for reference when implementing new features:

### 1. AngularJS Admin Codebase
**Primary Reference**: `~/Projects/nimbus-admin/va-voipbox-admin/` (AngularJS codebase)

This is the main legacy admin panel built with AngularJS. Use this as the primary reference for:
- API resource definitions and endpoints
- Controller logic and state management
- Search/filter patterns
- Table and CRUD operations
- Business logic implementation

### 2. Angular Dashboard (va-dashboard)
**Secondary Reference**: `~/Projects/va-dashboard/` (Angular 8+ codebase)

Modern Angular implementation of the dashboard with advanced features:
- Location: `~/Projects/va-dashboard/src/app`
- Services: `src/app/core/_base/layout/services/` - API services and state management
- Components: `src/app/views/pages/` - Screen implementations
- Search UI: `src/app/views/partials/layout/search-box/` - Dynamic search component
- Models: `src/app/core/_base/layout/models/` - TypeScript interfaces

**Key Features to Reference:**
- Advanced search with dynamic segments (`search-box.component.ts`)
- Material Design UI patterns
- RxJS observables for state management
- Service-based architecture
- TypeScript type definitions

### 3. Ionic Portal Reference
**Tertiary Reference**: `~/Projects/nimbus-admin/old-ionic-portal/` (Ionic + Angular codebase)

Mobile-first implementation demonstrating:
- Ionic framework patterns
- Angular-based VoIP portal implementation
- UI/UX patterns that can be adapted to React
- Component organization and structure
- Mobile-first responsive design patterns

When implementing new features or screens, examine ALL THREE legacy implementations first:

#### AngularJS Admin Key Directories:
- `app/scripts/services/` or `src/scripts/services/` - API resource definitions
- `app/scripts/controllers/` or `src/scripts/controllers/` - Business logic  
- `src/scripts/states/` - Route states with resource dependencies
- `src/views/` - HTML templates

#### Angular Dashboard (va-dashboard) Key Directories:
- `src/app/core/_base/layout/services/` - Core services (call.service.ts, search.service.ts)
- `src/app/views/pages/` - Page components (calls/, campaigns/, etc.)
- `src/app/views/partials/layout/` - Shared components (search-box/, topbar/, etc.)
- `src/app/core/_base/layout/models/` - TypeScript models and interfaces

#### Ionic Portal Key Directories:
- `src/app/` - Main application module and routing
- `src/pages/` - Ionic page components (similar to screens/views)
- `src/providers/` - Services and API integrations
- `src/components/` - Reusable UI components
- `src/models/` - Data models and interfaces

#### Implementation Process:
1. **Research Phase**:
   - Search ALL THREE legacy codebases for relevant files
   - **AngularJS**: Check controllers, services, states, and templates
   - **va-dashboard**: Check services, components, and search-box patterns
   - **Ionic**: Check pages and providers for mobile patterns
   - Compare implementation approaches across all three
   - Understand existing API patterns, field structures, and data relationships

2. **Planning Phase**:
   - Identify best patterns from all three legacy implementations
   - **From AngularJS**: Core business logic and API patterns
   - **From va-dashboard**: Modern Angular patterns and TypeScript types
   - **From Ionic**: Mobile-responsive design patterns
   - Plan modern React implementation following current architectural patterns

3. **Implementation Phase**:
   - Maintain feature parity while improving UX with modern Material-UI components
   - Adapt best responsive design patterns from all three sources
   - Preserve business logic and API integrations from AngularJS admin
   - Use TypeScript patterns from va-dashboard for type safety
   - Apply mobile-first lessons from Ionic portal

### Available Reference Screens

#### Ionic Portal Pages (old-ionic-portal/src/pages/):
- `agent/` - Agent management and status
- `calls-list/` - Call history and management  
- `campaigns/` - Campaign management
- `conference/` - Conference management
- `contacts/` - Contact management
- `blacklist/` - Blacklist management
- `announcements/` - Announcement management

#### Ionic Portal Services (old-ionic-portal/src/providers/):
- `agents.ts` - Agent management service
- `call/` - Call handling services
- `campaign/` - Campaign management  
- `contact/` - Contact services
- `authentication/` - Auth services
- `acl-service.ts` - Access control

### Key Legacy Files to Reference

**For any new screen implementation, examine these legacy patterns:**

#### 1. State Configuration (`src/scripts/states/{module}.js`)
```javascript
// Example: src/scripts/states/users.js, src/scripts/states/dids.js
var state_user = {
    templateUrl: "tpl/layout.html",
    data: { pageTitle: 'Users', screenName: "users" },
    resolve: {
        resource: 'usersResource',
        environmentsResource: 'environmentsResource',
        environments: function (resource,handle) {
            var filterString = decodeURIComponent($.param({page:1, per_page:9999,search:{enabled:true}}));
            return handle.pipeApi(resource.bridgeList({type: 'environments',filter: filterString}));
        }
    }
};
```

#### 2. API Resource Definitions (`src/scripts/services/{module}/resource.js`)
```javascript
// Example: usersResource, didsResource
MetronicApp.factory('usersResource', ['$resource', 'config', function($resource, config) {
    return $resource(config.apiUrl + '/api/users/:id', {id: '@id',filter: "@filter"},{
        "filter": {
            method: "GET", 
            url: config.apiUrl + '/api/users?:filter',
            isArray: true,
            params: { name: "@name", email: "@email", page: "@page", limit: "@limit" }
        }
    });
}]);
```

#### 3. List View HTML Templates (`src/views/{module}/list.html`)
**Search/Filter Patterns:**
- **Text Search**: `<input type="search" ng-model="filter.search.name" st-search="name">`
- **Dropdown Filters**: `<select ng-options="option.uuid as option.name for option in statusesList" ng-model="filter.search.status_uuid">`
- **Date Range**: `<md-date-range st-date-select="{{datesearch.created_at}}" predicate="created_at">`
- **Environment Filter**: `ng-options="option.uuid as option.name for option in environmentsList"`

#### 4. GlobalListController Pattern (`src/scripts/_GLOBAL/table/controllers.js`)
**API Call Pattern:**
```javascript
$scope.apicall = function(tableState){
    // Called by smart-table directive: st-pipe="apicall"
    handle.sendFilters(resource, tableState, params, $scope.itemsPerPage).$promise.then(
        function (response) {
            $scope.displayed = response;
            $scope.count_items = response.total_records;
            tableState.pagination.numberOfPages = Math.ceil(response.total_records / $scope.itemsPerPage);
        }
    );
};
```

#### 5. Filter/Search Implementation Details

**Filter Structure in Legacy:**
```javascript
// From views/{module}/list.html
filter.search = {
    name: "text_search_value",
    email: "email_search_value", 
    status_uuid: "selected_status_id",
    environment_uuid: "selected_environment_id",
    enabled: "true/false",
    custom: [] // For advanced custom fields
};
```

**API Query Parameters:**
- **Pagination**: `page`, `limit` (or `per_page`)
- **Sorting**: `order_by`, `order_kind` (asc/desc)
- **Search**: Field-specific parameters (name, email, number, etc.)
- **Filters**: `environment_uuid`, `status_uuid`, `enabled`, `type`

#### 6. Common Field Patterns

**Users Screen Fields:**
- Text: `name`, `email` 
- Dropdowns: `acl_uuid`, `status_uuid`, `environment_uuid`
- Toggles: `enabled` (true/false)
- Date ranges: `created_at`, `updated_at`

**DIDs Screen Fields:**
- Text: `name`, `number`, `meta`
- Dropdowns: `environment_uuid`, `type`, `bridge_type`
- Toggles: `enabled` (true/false)
- Date ranges: `created_at`, `updated_at`

**Services Screen Fields:**
- Text: `name`, `description`
- Dropdowns: `environment_uuid`, `status`, `type`
- Toggles: `enabled`, `auto_start`

### Implementation Conversion Guide

**From Legacy AngularJS to Modern React:**

1. **State Configuration** → **React Router + API Hook**
   - `resolve.resource` → Custom hook with API calls
   - `resolve.environments` → CustomerEnvironmentContext

2. **Resource Definition** → **API Service Module**
   - `$resource` patterns → Dedicated API service (e.g., `usersApi.js`)
   - Filter methods → Query parameter building

3. **HTML Template Filters** → **React Filter Components**
   - `st-search` → Controlled input with debouncing
   - `ng-options` dropdowns → Material-UI Select components
   - Date ranges → DatePicker components

4. **GlobalListController** → **Custom Hook**
   - `$scope.apicall` → `fetchData` function in custom hook
   - `$scope.displayed` → React state array
   - Pagination logic → Material-UI TablePagination

### Required React Implementation Components

For each screen, implement these based on legacy patterns:

1. **Main Screen Component** (`{Module}.jsx`)
   - Table with pagination, sorting, actions
   - Create/Edit dialogs
   - Delete confirmation dialogs

2. **Custom Hook** (`{Module}.js`) 
   - State management (data, loading, errors)
   - API calls (fetch, create, update, delete)
   - Filter/search handling
   - Pagination and sorting

3. **API Service** (`services/api/{module}Api.js`)
   - All CRUD operations
   - Filter/search methods
   - Proper error handling

4. **Sidebar List Component** (`{Module}List/{Module}List.jsx`)
   - Filterable list view
   - Search inputs
   - Filter dropdowns (status, type, environment)
   - Apply/Clear buttons

This ensures modern React implementations maintain full feature parity with the legacy AngularJS admin while following current architectural patterns.

## Architecture

This is a React 19 + Vite dashboard application using Material-UI components. The project follows a component-hook separation pattern where:

- Components (`.jsx` files) handle presentation and UI
- Custom hooks (`.js` files) handle state management and business logic
- Each component has its own directory with separate `.jsx`, `.js`, and `.css` files

### Component Structure
- `Layout` provides the main application shell with sidebar and content areas
- `Login` handles user authentication (currently only logs to console)
- `Sidebar` displays navigation, logo, and footer links
- `Schema` provides dynamic schema creation functionality with sidebar navigation

### Key Dependencies
- Material-UI (@mui/material, @emotion/react, @emotion/styled) for UI components
- React 19 with modern patterns (createRoot, StrictMode)
- Vite for build tooling and development server

### File Organization
Components follow the pattern:
```
ComponentName/
├── ComponentName.jsx (UI component)
├── ComponentName.js (custom hook)
└── ComponentName.css (styles)
```

## Schema System

The schema system provides dynamic form generation for creating various schema types (SMS, IVR, Extension, Conference, Queue, PowerLink, FreshDesk, ESim, User).

### API Endpoints

- `GET /api/schemas?action=types` - Fetch available schema types
- `GET /api/schemas?type={type}` - Fetch schema structure for a specific type
- `POST /api/schemas` - Create schema with FormData containing type, environment_name, and VML field data

### Schema Structure

Server returns schema structure in this format:
```json
{
  "vml": {
    "fields": [
      {
        "name": "field_display_name",
        "key": "field_key",
        "value": "default_value",
        "input": "string|number|textarea|select",
        "notes": "field_description"
      }
    ]
  }
}
```

### Implementation Flow

1. User enters Schema screen
2. System fetches schema types from `/api/schemas?action=types`
3. Schema types are displayed in left sidebar (following Reports screen pattern)
4. When user selects a type, system fetches structure from `/api/schemas?type={type}`
5. Dynamic form is rendered based on field definitions from server
6. User can create single schemas or bulk import via CSV
7. All form fields are dynamically generated - no hardcoded fields

### Components

- `SchemaTypeList` - Sidebar component listing available schema types
- `SMSCreator` - Schema creator with batch processing (used for all schema types, not just SMS)
- `DynamicSchemaForm` - Individual schema creation form for non-bulk operations

### Testing

Run Cypress tests with: `npm run cypress:run`
Ensure dev server is running on port 4200 for tests to pass.

## VoIP Admin Migration Project

This repository is part of a comprehensive migration from AngularJS (va-voipbox-admin) to modern React with visual PBX flow builder capabilities. The project is organized in phases with specialized agent configurations.

### Project Structure

```
.project/
├── PROJECT_ROADMAP.md           # Complete project overview and phases
├── BRANCHING_STRATEGY.md        # Git workflow and branch management
├── AGENT_USAGE.md              # Instructions for using development agents
├── agents/
│   ├── phase2-admin-screens-agent.md    # Admin screens migration agent
│   ├── phase3-pbx-builder-agent.md      # PBX flow builder agent
│   └── phase4-integration-agent.md      # Integration and polish agent
└── phases/
    ├── phase2-tasks.md          # Detailed admin screens tasks
    └── phase3-tasks.md          # Detailed PBX builder tasks
```

### Development Phases

1. **Phase 1: Foundation** ✅ COMPLETED
   - Customer/Environment Context System
   - Supabase-style Header Component
   - Multi-tenant Architecture Foundation

2. **Phase 2: Admin Screens Migration** 🔄 IN PROGRESS
   - Users Management
   - Environments Management
   - DIDs Management
   - Services Management
   - Tariffs Management

3. **Phase 3: Visual PBX Flow Builder** 🔄 PLANNED
   - React Flow integration
   - PBX node components (DID, IVR, Queue, Extension, etc.)
   - Flow logic engine with validation
   - Property panels for node configuration

4. **Phase 4: Integration & Polish** 🔄 PLANNED
   - API integration testing
   - Performance optimization
   - Security hardening
   - User documentation

### Agent-Based Development

This project uses specialized Claude Code agents for each phase:

- **react-frontend-dev**: Primary agent for React development
- Use agent configurations in `.project/agents/` for consistent patterns
- Each phase has specific instructions and standards
- Agents are version-controlled in git for consistency

### Usage Instructions

#### Starting a New Phase
```bash
# Create phase branch
git checkout -b feature/phase2-admin-screens-migration

# Review agent configuration
cat .project/agents/phase2-admin-screens-agent.md

# Create task-specific branch
git checkout -b feature/phase2-users-management
```

#### Working with Agents
1. Read the appropriate agent configuration file
2. Follow established patterns and standards
3. Implement components using specified architecture
4. Ensure testing and quality requirements are met
5. Use multi-tenant CustomerEnvironmentContext throughout

#### Key Patterns
- **Component Structure**: Component-hook separation pattern
- **Styling**: Material-UI v7 components exclusively  
- **State Management**: React Context for global state
- **Multi-tenant**: CustomerEnvironmentContext integration
- **API Integration**: Established apiService patterns

### Customer/Environment Context

The application includes a comprehensive customer/environment selection system similar to Supabase:

- **CustomerEnvironmentContext**: Global state management for multi-tenancy
- **CustomerEnvironmentHeader**: Supabase-style dropdown selectors
- **API Integration**: Customer/environment scoped API calls
- **Persistence**: localStorage for user selections

### Legacy Migration

This project replaces functionality from:
- **Source**: `/Users/voipappz/Projects/va-voipbox-admin/` (AngularJS)
- **Target**: Modern React with visual PBX builder
- **FLOIP Compliance**: Flow Interoperability Project standards
- **React Flow**: Visual flow builder (NOT workflow-ui library)

## Testing Strategy & Documentation

This project implements comprehensive testing using **Playwright** for end-to-end testing with a focus on real-world usage patterns, performance optimization, and continuous testing practices.

### Testing Philosophy

**Continuous Testing Approach**: Testing is an ongoing process integrated into development workflow, not an afterthought. Every feature should have corresponding tests that validate both functionality and user experience.

**Real-World Focused**: Tests should simulate actual user interactions and business workflows, not just technical functionality.

**Bridge Type Validation**: Special attention to DID bridge types (number, announcement, vml, call_condition, que, ivr) with comprehensive creation and editing tests.

### Test Categories

#### **1. Component CRUD Tests**
Each major component (Users, DIDs, Services, Subscriptions) should have comprehensive CRUD operation tests:

**Basic CRUD Pattern:**
- **Create**: Form validation, required fields, successful creation
- **Read**: Table display, data loading, pagination, sorting  
- **Update**: Edit dialogs, data preservation, validation
- **Delete**: Confirmation dialogs, successful deletion

**Example Test Files:**
- `cypress/e2e/users-screen.cy.ts` - Users management
- `cypress/e2e/dids-crud.cy.ts` - Basic DID operations
- `cypress/e2e/dids-new-bridge-types.cy.ts` - DID bridge type testing
- `cypress/e2e/dids-bridge-comprehensive.cy.ts` - Advanced DID bridge testing
- `cypress/e2e/subscriptions-comprehensive.cy.ts` - Subscription management

#### **2. Bridge Type Specific Tests (DIDs)**

**Bridge Configuration Testing:**
```javascript
const bridgeTypesConfig = [
  { type: 'number', autoConfigured: true, requiresBridge: false },
  { type: 'announcement', hasCreateButton: true, createButtonText: 'Create New Announcement' },
  { type: 'vml', hasCreateButton: true, createButtonText: 'Create New VML Script' },
  { type: 'call_condition', hasCreateButton: true, createButtonText: 'Create New Call Condition' },
  { type: 'que', requiresBridge: true, description: 'Queue bridge requiring existing queue' },
  { type: 'ivr', requiresBridge: true, description: 'IVR bridge requiring existing IVR' }
];
```

**Test Coverage:**
- Bridge type availability and selection
- Inline bridge creation (announcement, vml, call_condition)
- Existing bridge selection (queue, ivr)
- Auto-configuration (number bridge)
- Validation requirements based on bridge type
- Action button visibility based on bridge type

#### **3. Integration Tests**

**Customer/Environment Context Testing:**
- Multi-tenant environment switching
- Data isolation between environments
- Environment-specific resource loading
- Context persistence across navigation

**API Integration Tests:**
- Real API endpoint validation
- Error handling and network failures
- Loading states and user feedback
- Authentication and authorization

#### **4. UI/UX Tests**

**Responsive Design:**
```javascript
// Viewport testing pattern
cy.viewport(375, 667);  // Mobile
cy.viewport(768, 1024); // Tablet  
cy.viewport(1280, 720); // Desktop
```

**Accessibility Testing:**
- ARIA attributes validation
- Keyboard navigation support
- Screen reader compatibility
- Color contrast and visual indicators

### Test File Naming Conventions

**Pattern**: `{component}-{test-type}.cy.ts`

**Examples:**
- `dids-crud.cy.ts` - Basic CRUD operations
- `dids-bridge-functionality.cy.ts` - Bridge-specific functionality
- `dids-new-bridge-types.cy.ts` - New bridge type testing
- `dids-bridge-comprehensive.cy.ts` - Complete bridge testing suite
- `subscriptions-comprehensive.cy.ts` - Full subscription testing
- `users-screen.cy.ts` - User management testing

### Test Implementation Patterns

#### **Component Testing Structure:**
```javascript
describe('Component Name Comprehensive Tests', () => {
  beforeEach(() => {
    cy.login();
    cy.visit('/component-route');
    cy.wait(2000);
  });

  describe('Table Display & Navigation', () => {
    // Table rendering, columns, pagination, sorting
  });

  describe('CRUD Operations', () => {
    // Create, Read, Update, Delete functionality
  });

  describe('Filtering & Search', () => {
    // Search inputs, dropdown filters, date ranges
  });

  describe('Special Actions', () => {
    // Component-specific actions (bridge configuration, special operations)
  });

  describe('Validation & Error Handling', () => {
    // Form validation, API errors, edge cases
  });

  describe('Responsive Design & Accessibility', () => {
    // Mobile responsiveness, accessibility compliance
  });
});
```

#### **Bridge Type Testing Pattern:**
```javascript
bridgeTypesConfig.forEach((bridgeConfig) => {
  it(`should handle ${bridgeConfig.type} bridge type`, () => {
    const uniqueId = Date.now().toString();
    
    // Open creation dialog
    // Fill basic information
    // Select bridge type
    // Handle bridge-specific behavior
    // Validate creation/configuration
    // Verify result
  });
});
```

### Test Data Management

**Dynamic Test Data:**
```javascript
// Use timestamps for unique identifiers
const uniqueDidNumber = `1${Date.now().toString().substring(3)}`;
const didName = `Test DID ${uniqueDidNumber}`;
```

**Environment Agnostic:**
- Tests work across different environments
- No hardcoded UUIDs or environment-specific data
- Dynamic resource selection based on availability

### Running Tests

**Environment Configuration:**
```bash
# Required environment variables in .env file:
VITE_API_BASE_URL=https://cloud.voipappz.io
TEST_EMAIL=<your test account email>
TEST_PASSWORD=<your test account password>
VA_TEST_OTP=<test OTP bypass code>
```

**Development Testing:**
```bash
# Ensure dev server is running
npm run dev

# Verify API connectivity and configuration
VITE_API_BASE_URL=https://cloud.voipappz.io node verify-api-urls.js

# Run specific test suites
npx cypress run --spec "cypress/e2e/dids-bridge-comprehensive.cy.ts"
npx cypress run --spec "cypress/e2e/subscriptions-comprehensive.cy.ts"

# Run all component tests
npx cypress run --spec "cypress/e2e/*-comprehensive.cy.ts"
```

**Test Configuration:**
- **Base URL**: `http://localhost:4200` (matches dev server)
- **API URL**: `https://cloud.voipappz.io` (production environment)
- **Credentials**: Environment variables (no hardcoded passwords)
- **Timeout**: 10s default, 15s page load
- **Viewport**: 1280x720 default
- **Video**: Disabled for performance
- **Screenshots**: On failure only

### Test Maintenance Guidelines

#### **Best Practices:**
1. **Keep tests independent** - Each test should work in isolation
2. **Use descriptive test names** - Clearly indicate what is being tested
3. **Implement proper wait strategies** - Use `cy.wait()` and element visibility checks
4. **Handle dynamic content** - Account for loading states and async operations
5. **Validate user experience** - Test workflows, not just technical functions

#### **Error Handling:**
```javascript
// Graceful error handling pattern
cy.get('body').then(($body) => {
  if ($body.find('[role="dialog"]').length === 0) {
    // Success path
    cy.log('✅ Operation successful');
  } else {
    // Alternative path or error state
    cy.log('⚠️ Operation requires attention');
  }
});
```

#### **Continuous Improvement:**
- **Regular test review** - Update tests when features change
- **Performance monitoring** - Keep test execution time reasonable
- **Coverage analysis** - Ensure all critical paths are tested
- **Real-world validation** - Tests should reflect actual user behavior

### Integration with Development Workflow

**Pre-commit Testing:**
- Run critical test suites before commits
- Validate bridge type functionality
- Check CRUD operations

**Feature Development:**
1. Implement feature
2. Create corresponding tests
3. Validate in multiple environments
4. Document any special test requirements

**Quality Assurance:**
- Tests serve as living documentation
- Validate business logic and user workflows
- Ensure accessibility and responsive design
- Maintain testing standards across the project

This testing strategy ensures robust, maintainable tests that provide confidence in the application's functionality while supporting continuous development and deployment practices.

### Security and Environment Management

**Credential Security:**
- ✅ **No hardcoded passwords**: All test credentials moved to environment variables
- ✅ **Environment isolation**: Tests use cloud.voipappz.io for realistic testing
- ✅ **Secure configuration**: Credentials loaded from .env file, not committed to code

**REQUIRED: Environment Variables Setup**

Create a `.env` file in the project root with the following configuration:

```bash
# API Configuration - REQUIRED
VITE_API_BASE_URL=https://cloud.voipappz.io

# Test Credentials for Playwright - REQUIRED (2-step OTP flow)
# These credentials must exist in cloud.voipappz.io database
TEST_EMAIL=<your test account email>
TEST_PASSWORD=<your test account password>
VA_TEST_OTP=<test OTP bypass code>
```

**IMPORTANT NOTES:**
1. **The `.env` file is REQUIRED** - Tests will fail without it
2. **API Endpoint**: Must use `cloud.voipappz.io` (not localhost or other endpoints)
3. **2-Step OTP Login**: Step 1: POST /auth/login → temp_token. Step 2: POST /auth/otp/verify with temp_token + VA_TEST_OTP=<test OTP bypass code> → JWT
4. **Valid Accounts**: Test credentials must exist in the cloud.voipappz.io database
5. **Not in Git**: The `.env` file is gitignored - each developer needs to create it locally
6. **Account Lockout**: 5 failed attempts trigger a 15-minute lockout

**Verify .env Configuration:**

Test that your credentials work (2-step OTP flow):
```bash
# Step 1: Login → get temp_token
curl -s -X POST "https://cloud.voipappz.io/auth/login?email=${TEST_EMAIL}&password=${TEST_PASSWORD}"
# Expected: {"otp_sent":true,"temp_token":"..."}

# Step 2: OTP Verify → get JWT tokens
curl -s -X POST "https://cloud.voipappz.io/auth/otp/verify?temp_token=TEMP_TOKEN_FROM_STEP1&code=${VA_TEST_OTP}&email=${TEST_EMAIL}&password=${TEST_PASSWORD}"
# Expected: {"access":"...","refresh":"...","csrf":"..."}
```

**API Connectivity Verification:**
Use the included `verify-api-urls.js` script to test API connectivity:
```bash
VITE_API_BASE_URL=https://cloud.voipappz.io node verify-api-urls.js
```

This script checks:
- ✅ Basic API connectivity
- ✅ CORS headers configuration
- ✅ Environment variable setup
- ✅ Authentication endpoint availability

**Files Using Environment Variables:**
- `tests/auth-fixture.ts` - Shared authentication setup
- `tests/users-optimized.spec.ts` - Optimized user tests
- `playwright.config.ts` - Test configuration  
- `vite.config.js` - Configures API proxy to VITE_API_BASE_URL
- `.env` - Contains all configuration (NOT committed to git)

**Development Server Configuration:**

The Vite dev server proxies API requests:
- `/auth/*` → `https://cloud.voipappz.io/auth/*`
- `/api/*` → `https://cloud.voipappz.io/api/*`
- Local dev: `http://localhost:3000` → proxies to cloud API

This ensures all tests run against the cloud.voipappz.io environment with proper security practices while maintaining full functionality with optimized Playwright testing.
## Languages and phones

The app speaks English and Hebrew (right to left) and works from 375px up.
English is the default and must not change when a screen is converted. Before
touching a screen's text, layout, dates or tables, read
[docs/i18n-guide.md](docs/i18n-guide.md): the recipe (`useTranslation`,
`Bdi`, `ResponsiveTable`, `ResponsiveDialog`, logical sides), the checks, and
the backlog. Rule: touch it, convert it.

## Live dashboard (`/live`)

The screen reads live agent, queue and environment state from the va-crystal
node over ActionCable — not from the API, and not by polling once the socket
is up.

- **Where it connects.** `VITE_WS_URL` (e.g. `ws://localhost:14000/cable`) is
  the node's cable; `VITE_API_BASE_URL` is still the API for everything else.
  The socket must request the `actioncable-v1-json` subprotocol — without it
  the browser closes it before `welcome`, which looks exactly like a refused
  token (`useWebSocket.js`, `useCableHealth.js`).
- **Data.** `src/hooks/useLiveEntities.js` subscribes `LiveChannel` with the
  environment (a portal user's `user.environment.uuid`, or the one an account
  picks in the screen's Environment picker — `useLiveEnvironment.js`, remembered
  per customer; until then the first environment selected in the top bar) and keeps one whole document per entity; renders are coalesced
  every 250ms. That is the screen's ONLY source: it never calls the API, and
  when the cable is not delivering it shows nothing and says so. The polled
  fallback (`/api/users?action=agents`, `/api/calls`) was removed on
  2026-09-23 — the API ignores `action=agents` for a portal token and holds a
  call only after it ends, so it could not answer for this screen.
- **Identity.** The switch never publishes a name or extension, and a status
  type only when it changes. The node fills `user_name`, `extension_username`,
  `status` and `status_name` (the tenant's own name for it, from the API's
  `Status` model) into the user document from the mothership
  (`crystal.request.user.extension`) when it first sees the agent and again at
  each roll-over. The status chip shows `status_name`, coloured by `status`.
- **Midnight.** The node resets the daily fields (counters, `first_call_at`,
  `last_call_*`) at midnight in the ENVIRONMENT's timezone
  (`environments.profile.timezone`), the way the old Redis cron did. Status,
  state and identity survive it.
- **Rendering.** Column render modes come from `DEFAULT_COLUMNS` in
  `src/services/liveSettings.js` on every load (a saved column list keeps only
  order and visibility). `elapsed` is a running duration; `time` is a clock
  time (`first_call_at`). Colours are per-browser in localStorage.
- **Auth.** The node verifies the login JWT with its own `SECRET_KEY`, which
  must equal the API's signing key. For local work against a node with a
  different key, `localStorage.va_cable_token` overrides the token for the
  cable only; remove it once the node has the real key.

## Deploy

Kamal, from this repo — `make deploy DEST=x`. The tool and every lesson learned running it came from
the portal repo; [docs/deployment.md](docs/deployment.md) is the reference,
read it before touching `config/deploy*.yml` or `.kamal/`.

Two rules that follow from this repo being **public**:

- **Nothing sensitive in git.** Registry token in `.kamal/secrets-common`,
  host address and SSH details in `.kamal/env.<dest>`, both gitignored. A
  destination yaml names only the public hostname and the public API URL.
- **Never deploy.** Rendering the config and probing a live site are fine;
  `make deploy` and anything that swaps a container on a live host is the
  operator's call. Say the command, let a person run it.

`Dockerfile` (nginx) is the image kamal builds. `Dockerfile.production` was the
old React-plus-Deno image; it referenced a deleted `api/` directory and was
removed when Kamal arrived.

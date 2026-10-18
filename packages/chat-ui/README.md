# @voipappz/chat-ui

Presentational chat components shared by the VoipAppz admin app and
VoipAppz Builder.

The package draws the chat. It does not fetch, stream, store sessions, read
auth or know about any backend. Each host supplies data as props and handles
actions in callbacks. It has no connection to the admin app's Assistant, VML
or Bot code, and `src/boundary.test.js` fails if such an import appears.

## Usage

```jsx
import { ChatView } from '@voipappz/chat-ui';

<ChatView
  title="Builder"
  messages={messages}            // [{ id, role: 'user'|'assistant', content, createdAt, error, toolCalls, reasoning }]
  sessions={sessions}            // [{ id, title }]; omit to hide the sidebar
  selectedSessionId={id}
  status={{ tone: 'ok', label: 'Connected' }}
  busy={running}
  inputValue={text}
  onInputChange={setText}
  onSend={send}
  onStop={cancel}
  onSelectSession={open}
  onDeleteSession={remove}
  onNewSession={reset}
  emptyState={{ title: 'What should we build?', suggestions: [{ label, prompt }] }}
/>
```

A tool call is `{ id, name, args, result, status: 'running' | 'done' | 'error' }`.

## Theme contract

Components read these CSS variables, which the host must define:
`--theme-bg-primary`, `--theme-bg-secondary`, `--theme-text-primary`,
`--theme-text-secondary`, `--theme-text-tertiary`, `--theme-border`,
`--theme-hover`, `--accent-primary`, `--accent-secondary`, `--border-light`,
`--color-success`, `--color-danger`, `--color-warning`, `--color-neutral`.

## Installing

Published to GitHub Packages. In the consuming repo's `.npmrc`:

```text
@voipappz:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then `npm install @voipappz/chat-ui@0.1.0`. The package ships JSX source, so the
host must compile it; Vite does this for dependencies by default.

## Releasing

Bump `version` here, merge, then from `packages/chat-ui` run `npm publish` with
a token that has `write:packages`.

## Peer dependencies

React, `@mui/material`, `@mui/icons-material` and Emotion, supplied by the host.

# @voipappz/conversations-ui

The screens for watching and steering bot conversations: the conversation
list, the thread with the reply streaming in and the tools it uses, and the
bot controls (approvals, questions, TODO list, take-over / hand-back, stop).

Pure components. Data comes in as props, every action leaves through a
callback; nothing here fetches, subscribes, stores or reads auth
(`src/boundary.test.js` fails if it starts to). The same components run in the
admin app and inside Connectix, where thin LiveViews render them through
[live_react](https://github.com/mrdotb/live_react) and keep all the logic in
`Connectix.Chat`.

The thread is built on [`@voipappz/chat-ui`](../chat-ui) (`ChatView`,
`ChatMessage`, `ToolCallChip`), which it takes as a peer dependency.

## The props contract

`src/contract.js` defines every shape (JSDoc typedefs). They are the shapes
Connectix sends, unchanged: `ConnectixWeb.Api.ChatJSON` and the
`chat:<conversation id>` channel (connectix `docs/api.md`).

| Shape | From | Fields |
|---|---|---|
| `ConversationSummary` | `ChatJSON.conversation` | `id, title, handler ('bot' \| 'human'), inserted_at, updated_at` |
| `DisplayMessage` | `ChatJSON.message`, the `message` push | `id, role, type, text, html, name, display_text, hitl_decision, arguments, result, is_error, todos, format, data, status, inserted_at` |
| `AgentStatus` | join reply, `status` push | `not_running, idle, running, interrupted, cancelled, error` |
| `ToolStep` | `tool` push | `{name, status: identified \| executing \| completed \| failed \| interrupted}` |
| `Pending` | join reply, `pending` push | `{type: 'none'}`, `{type: 'approval', tools}`, `{type: 'questions', questions}`, `{type: 'halt', message}` |
| `Todo` | `todos` push | `{id, content, status}` |
| `Decision` | to `decide` | `'approve' \| 'reject'`, one per pending tool, in order |
| `QuestionResponse` | to `answer` | `{type: 'answer', selected, other_text?}` or `{type: 'cancel'}`, one per question, in order |

## Components

```jsx
import { ConversationList, ConversationThread } from '@voipappz/conversations-ui';

<ConversationList
  conversations={conversations}      // ConversationSummary[]
  selectedId={id}
  hasMore={more}
  onSelect={open}                    // (id)
  onNew={create}
  onDelete={remove}                  // (id)
  onLoadMore={next}
/>

<ConversationThread
  conversation={conversation}        // ConversationSummary
  messages={messages}                // DisplayMessage[]
  status={status}                    // AgentStatus
  error={error}                      // from {status: 'error', error}
  delta={delta}                      // the reply streamed so far
  tools={tools}                      // ToolStep[] of the turn in progress
  pending={pending}                  // Pending
  todos={todos}                      // Todo[]
  onSend={(text) => …}               // channel `send`
  onCancel={() => …}                 // `cancel`
  onDecide={(decisions) => …}        // `decide`
  onAnswer={(responses) => …}        // `answer`
  onDismiss={() => …}                // `dismiss`
  onHandlerChange={(handler) => …}   // `handler`
/>
```

The pieces are exported too: `PendingPanel`, `ApprovalPanel`,
`QuestionsPanel`, `HaltNotice`, `TodoList`, `HandlerToggle`, and the pure
`toChatMessages(messages, {status, delta, tools})`, which turns display
messages into chat bubbles (tool calls become chips on the reply they led to).

Every visible string has an English default and can be replaced through
`labels`.

## Fixtures and the story

`src/fixtures.js` holds props in the exact server shapes
(`@voipappz/conversations-ui/fixtures`). `src/ConversationsStory.jsx`
(`@voipappz/conversations-ui/story`) draws every state from them (streaming,
approval, questions, halt, error, idle) with callbacks that only log, for a
visual check in any host.

## Theme

The chat-ui theme contract (CSS variables such as `--theme-bg-primary`,
`--theme-border`, `--accent-primary`) applies; the host defines them.

## Tests

Unit tests run with the repository's vitest setup (`npm run test:unit:run`,
or `make gate`), and in CI.

## Installing and releasing

As for chat-ui: published to GitHub Packages (bump `version`, merge, then
`npm publish` from this folder). Connectix does not install from the
registry; it vendors an `npm pack` tarball made from a recorded commit of
this repository (`make ui-vendor` in connectix).

## Peer dependencies

React, `@mui/material`, `@mui/icons-material`, Emotion and
`@voipappz/chat-ui` 0.2 or later, supplied by the host.

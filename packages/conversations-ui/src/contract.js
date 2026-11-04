// The props contract for the bot conversation screens, in one place.
//
// The shapes mirror what Connectix sends: `ConnectixWeb.Api.ChatJSON` (the
// conversation, message, pending and todo maps that GET /api/chat/* returns)
// and the `chat:<conversation id>` channel's pushes (status, delta, tool,
// pending, todos, title, handler; docs/api.md in connectix-io/connectix).
// A host passes them through unchanged: this package never renames a field
// that comes from the server.
//
// Components take these as props and report every action through a
// callback. Nothing here fetches, subscribes or stores.

/**
 * Who answers the conversation: the bot, or a person who took it over.
 * @typedef {'bot' | 'human'} Handler
 */

/**
 * One row of the conversation list (ChatJSON.conversation).
 * @typedef {Object} ConversationSummary
 * @property {string} id
 * @property {string | null} title        Generated after the first turn; null before.
 * @property {Handler} handler
 * @property {string} [inserted_at]       ISO 8601
 * @property {string} [updated_at]        ISO 8601
 */

/**
 * The agent's status: the channel's join reply and `status` push.
 * @typedef {'not_running' | 'idle' | 'running' | 'interrupted' | 'cancelled' | 'error'} AgentStatus
 */

/**
 * A saved display message (ChatJSON.message). Tool calls and their results
 * are messages of their own (`type` `tool_call` / `tool_result`).
 * @typedef {Object} DisplayMessage
 * @property {string} id
 * @property {'user' | 'assistant' | string} role
 * @property {'text' | 'error' | 'tool_call' | 'tool_result' | 'todo_snapshot' | 'structured_data' | string} type
 * @property {string | null} [text]
 * @property {string | null} [html]          Markdown rendered by the server, HTML escaped.
 * @property {string | null} [name]          Tool name, for tool_call / tool_result.
 * @property {string | null} [display_text]  Friendly tool text.
 * @property {string | null} [hitl_decision] 'approved' | 'rejected' for an approved tool call.
 * @property {Object | null} [arguments]     tool_call only.
 * @property {string | null} [result]        tool_result only.
 * @property {boolean} [is_error]            tool_result only.
 * @property {Todo[] | null} [todos]         todo_snapshot only.
 * @property {string | null} [format]        structured_data only, e.g. 'chart'.
 * @property {Object | null} [data]          structured_data only.
 * @property {string} [status]
 * @property {string} [inserted_at]          ISO 8601
 */

/**
 * A tool the turn in progress is using: the channel's `tool` push.
 * @typedef {Object} ToolStep
 * @property {string} name
 * @property {'identified' | 'executing' | 'completed' | 'failed' | 'interrupted'} status
 */

/**
 * One tool waiting for approval.
 * @typedef {Object} PendingTool
 * @property {string} name
 * @property {string | null} [display_text]
 * @property {Object} [arguments]
 */

/**
 * @typedef {Object} QuestionOption
 * @property {string} label
 * @property {string} value
 * @property {string | null} [description]
 */

/**
 * @typedef {Object} Question
 * @property {string} question
 * @property {string | null} [context]
 * @property {boolean} multiple      More than one option may be chosen.
 * @property {boolean} allow_other   Free text is accepted.
 * @property {QuestionOption[]} options
 */

/**
 * What the agent waits on (ChatJSON.pending).
 * @typedef {{type: 'none'}
 *   | {type: 'approval', tools: PendingTool[]}
 *   | {type: 'questions', questions: Question[]}
 *   | {type: 'halt', message: string}} Pending
 */

/**
 * An approval decision, one per pending tool, in the order they were listed.
 * @typedef {'approve' | 'reject'} Decision
 */

/**
 * An answer, one per pending question, in order.
 * @typedef {{type: 'answer', selected: string[], other_text?: string} | {type: 'cancel'}} QuestionResponse
 */

/**
 * The agent's TODO list (ChatJSON.todos).
 * @typedef {Object} Todo
 * @property {string} id
 * @property {string} content
 * @property {'pending' | 'in_progress' | 'completed' | 'cancelled' | string} status
 */

/**
 * ConversationList props.
 * @typedef {Object} ConversationListProps
 * @property {ConversationSummary[]} conversations   Newest first, as the server lists them.
 * @property {string | null} [selectedId]
 * @property {boolean} [loading]
 * @property {boolean} [hasMore]                       Shows "Load more".
 * @property {(id: string) => void} [onSelect]
 * @property {() => void} [onNew]
 * @property {(id: string) => void} [onDelete]
 * @property {() => void} [onLoadMore]
 * @property {(iso: string) => string} [formatTimestamp]  Defaults to chat-ui's formatTime.
 * @property {Object<string, string>} [labels]
 */

/**
 * ConversationThread props. Everything the channel says, plus callbacks for
 * everything it accepts (send, cancel, decide, answer, dismiss, handler).
 * @typedef {Object} ConversationThreadProps
 * @property {ConversationSummary | null} conversation
 * @property {DisplayMessage[]} messages
 * @property {AgentStatus} [status]
 * @property {string | null} [error]          The `error` of a `status: error` push.
 * @property {string | null} [delta]          The reply streamed so far (`delta` push).
 * @property {ToolStep[]} [tools]             The turn in progress (`tool` pushes).
 * @property {Pending} [pending]
 * @property {Todo[]} [todos]
 * @property {string} [inputValue]            Controlled input; omit to let the thread keep it.
 * @property {(text: string) => void} [onInputChange]
 * @property {(text: string) => void} [onSend]
 * @property {() => void} [onCancel]
 * @property {(decisions: Decision[]) => void} [onDecide]
 * @property {(responses: QuestionResponse[]) => void} [onAnswer]
 * @property {() => void} [onDismiss]
 * @property {(handler: Handler) => void} [onHandlerChange]
 * @property {Object<string, string>} [labels]
 */

export const HANDLERS = Object.freeze(['bot', 'human']);
export const DECISIONS = Object.freeze(['approve', 'reject']);
export const NO_PENDING = Object.freeze({ type: 'none' });

/** Statuses during which the agent is working and the turn can be cancelled. */
export const isBusy = (status) => status === 'running';

/** Whether the agent waits on the operator (an approval, a question or a halt). */
export const isWaiting = (pending) => Boolean(pending && pending.type && pending.type !== 'none');

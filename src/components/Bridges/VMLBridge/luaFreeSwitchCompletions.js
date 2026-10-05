/**
 * FreeSWitch Lua API completions and hover documentation
 * Used by CodeEditor's Monaco IntelliSense providers
 */

/**
 * Session methods — triggered after "session:" or "session."
 * Each entry maps to monaco.languages.CompletionItemKind.Method
 */
export const sessionMethods = [
  {
    label: 'answer',
    detail: 'session:answer()',
    doc: 'Answer the incoming call. Must be called before playing audio or collecting digits.',
    insert: 'answer()'
  },
  {
    label: 'hangup',
    detail: 'session:hangup(cause?)',
    doc: 'Hangup the call with an optional cause code.\n\nExample:\n```lua\nsession:hangup("NORMAL_CLEARING")\n```',
    insert: 'hangup(${1:"NORMAL_CLEARING"})'
  },
  {
    label: 'ready',
    detail: 'session:ready()',
    doc: 'Returns true if the session is still active and the channel is ready.',
    insert: 'ready()'
  },
  {
    label: 'preAnswer',
    detail: 'session:preAnswer()',
    doc: 'Pre-answer the call (early media). Useful for playing audio before answering.',
    insert: 'preAnswer()'
  },
  {
    label: 'getVariable',
    detail: 'session:getVariable(name)',
    doc: 'Get a channel variable value.\n\nExample:\n```lua\nlocal cid = session:getVariable("caller_id_number")\n```',
    insert: 'getVariable(${1:"caller_id_number"})'
  },
  {
    label: 'setVariable',
    detail: 'session:setVariable(name, value)',
    doc: 'Set a channel variable.\n\nExample:\n```lua\nsession:setVariable("my_var", "my_value")\n```',
    insert: 'setVariable(${1:"variable_name"}, ${2:"value"})'
  },
  {
    label: 'execute',
    detail: 'session:execute(app, args?)',
    doc: 'Execute a FreeSWitch dialplan application.\n\nExample:\n```lua\nsession:execute("bridge", "sofia/gateway/gw/18005551234")\nsession:execute("playback", "ivr/ivr-welcome.wav")\n```',
    insert: 'execute(${1:"app"}, ${2:"args"})'
  },
  {
    label: 'playAndGetDigits',
    detail: 'session:playAndGetDigits(min, max, tries, timeout, terminators, file, invalid_file, regex, var_name?, digit_timeout?, transfer_on_failure?)',
    doc: 'Play a prompt and collect DTMF digits.\n\nExample:\n```lua\nlocal digits = session:playAndGetDigits(1, 4, 3, 5000, "#", "ivr/ivr-enter_ext.wav", "ivr/ivr-that_was_an_invalid_entry.wav", "\\\\d+")\n```',
    insert: 'playAndGetDigits(${1:1}, ${2:4}, ${3:3}, ${4:5000}, ${5:"#"}, ${6:"ivr/ivr-enter_ext.wav"}, ${7:"ivr/ivr-that_was_an_invalid_entry.wav"}, ${8:"\\\\\\\\d+"})'
  },
  {
    label: 'speak',
    detail: 'session:speak(text)',
    doc: 'Speak text using TTS engine.\n\nExample:\n```lua\nsession:speak("Welcome to the system")\n```',
    insert: 'speak(${1:"text to speak"})'
  },
  {
    label: 'recordFile',
    detail: 'session:recordFile(file, max_len?, silence_thresh?, silence_secs?)',
    doc: 'Record audio to a file.\n\nExample:\n```lua\nsession:recordFile("/tmp/recording.wav", 120, 30, 5)\n```',
    insert: 'recordFile(${1:"/tmp/recording.wav"}, ${2:120}, ${3:30}, ${4:5})'
  },
  {
    label: 'transfer',
    detail: 'session:transfer(dest, dialplan?, context?)',
    doc: 'Transfer the call to a new destination.\n\nExample:\n```lua\nsession:transfer("1001", "XML", "default")\n```',
    insert: 'transfer(${1:"destination"}, ${2:"XML"}, ${3:"default"})'
  },
  {
    label: 'sleep',
    detail: 'session:sleep(ms)',
    doc: 'Pause execution for the specified number of milliseconds.\n\nExample:\n```lua\nsession:sleep(1000)  -- 1 second pause\n```',
    insert: 'sleep(${1:1000})'
  },
  {
    label: 'consoleLog',
    detail: 'session:consoleLog(level, message)',
    doc: 'Log a message to the FreeSWitch console.\n\nLevels: DEBUG, INFO, NOTICE, WARNING, ERR, CRIT, ALERT\n\nExample:\n```lua\nsession:consoleLog("INFO", "Call started\\n")\n```',
    insert: 'consoleLog(${1:"INFO"}, ${2:"message"} .. "\\n")'
  },
  {
    label: 'setAutoHangup',
    detail: 'session:setAutoHangup(bool)',
    doc: 'Enable or disable automatic hangup when the script ends.',
    insert: 'setAutoHangup(${1:false})'
  },
  {
    label: 'setHangupHook',
    detail: 'session:setHangupHook(func_name)',
    doc: 'Set a Lua function to be called on hangup.\n\nExample:\n```lua\nfunction on_hangup(s, status)\n  freeswitch.consoleLog("INFO", "Call ended: " .. status .. "\\n")\nend\nsession:setHangupHook("on_hangup")\n```',
    insert: 'setHangupHook(${1:"on_hangup"})'
  },
  {
    label: 'setInputCallback',
    detail: 'session:setInputCallback(func_name)',
    doc: 'Set a callback function for DTMF and event input.\n\nExample:\n```lua\nfunction on_input(s, type, obj)\n  if type == "dtmf" then\n    return "break"\n  end\nend\nsession:setInputCallback("on_input")\n```',
    insert: 'setInputCallback(${1:"on_input"})'
  },
  {
    label: 'streamFile',
    detail: 'session:streamFile(file)',
    doc: 'Stream an audio file to the channel.\n\nExample:\n```lua\nsession:streamFile("ivr/ivr-welcome.wav")\n```',
    insert: 'streamFile(${1:"ivr/ivr-welcome.wav"})'
  },
  {
    label: 'read',
    detail: 'session:read(min, max, prompt, timeout, terminators)',
    doc: 'Read DTMF digits with a prompt file.\n\nExample:\n```lua\nlocal digits = session:read(1, 4, "ivr/ivr-enter_ext.wav", 5000, "#")\n```',
    insert: 'read(${1:1}, ${2:4}, ${3:"ivr/ivr-enter_ext.wav"}, ${4:5000}, ${5:"#"})'
  },
  {
    label: 'getDigits',
    detail: 'session:getDigits(max, terminators, timeout)',
    doc: 'Collect DTMF digits without playing a prompt.',
    insert: 'getDigits(${1:4}, ${2:"#"}, ${3:5000})'
  },
  {
    label: 'flushDigits',
    detail: 'session:flushDigits()',
    doc: 'Flush any buffered DTMF digits.',
    insert: 'flushDigits()'
  },
  {
    label: 'getState',
    detail: 'session:getState()',
    doc: 'Get the current channel state (e.g., CS_EXECUTE, CS_ROUTING).',
    insert: 'getState()'
  },
  {
    label: 'mediaReady',
    detail: 'session:mediaReady()',
    doc: 'Returns true if the media channel is ready for audio.',
    insert: 'mediaReady()'
  },
  {
    label: 'answered',
    detail: 'session:answered()',
    doc: 'Returns true if the call has been answered.',
    insert: 'answered()'
  },
  {
    label: 'destroy',
    detail: 'session:destroy()',
    doc: 'Explicitly destroy the session object and free resources.',
    insert: 'destroy()'
  },
  {
    label: 'sayPhrase',
    detail: 'session:sayPhrase(macro, data?, lang?)',
    doc: 'Say a phrase macro.\n\nExample:\n```lua\nsession:sayPhrase("voicemail_enter_pass", "", "en")\n```',
    insert: 'sayPhrase(${1:"macro_name"}, ${2:""}, ${3:"en"})'
  },
  {
    label: 'get_uuid',
    detail: 'session:get_uuid()',
    doc: 'Get the UUID of the current session/channel.\n\nExample:\n```lua\nlocal uuid = session:get_uuid()\n```',
    insert: 'get_uuid()'
  },
  {
    label: 'hangupCause',
    detail: 'session:hangupCause()',
    doc: 'Get the hangup cause of the session.\n\nCommon causes: NORMAL_CLEARING, NO_ANSWER, USER_BUSY, ORIGINATOR_CANCEL\n\nExample:\n```lua\nlocal cause = session:hangupCause()\n```',
    insert: 'hangupCause()'
  }
];

/**
 * FreeSWitch global API — triggered after "freeswitch."
 */
export const freeswitchGlobals = [
  {
    label: 'consoleLog',
    detail: 'freeswitch.consoleLog(level, message)',
    doc: 'Log a message to the FreeSWitch console.\n\nLevels: DEBUG, INFO, NOTICE, WARNING, ERR, CRIT, ALERT\n\nExample:\n```lua\nfreeswitch.consoleLog("INFO", "Script started\\n")\n```',
    insert: 'consoleLog(${1:"INFO"}, ${2:"message"} .. "\\n")'
  },
  {
    label: 'Event',
    detail: 'freeswitch.Event(event_name)',
    doc: 'Create a new FreeSWitch event.\n\nExample:\n```lua\nlocal event = freeswitch.Event("CUSTOM", "va::log")\nevent:addHeader("action", "my_action")\nevent:fire()\n```',
    insert: 'Event(${1:"CUSTOM"}, ${2:"va::log"})'
  },
  {
    label: 'API',
    detail: 'freeswitch.API()',
    doc: 'Create an API object for executing FreeSWitch API commands.\n\nExample:\n```lua\nlocal api = freeswitch.API()\nlocal result = api:execute("uuid_getvar", uuid .. " caller_id_number")\n```',
    insert: 'API()'
  },
  {
    label: 'Session',
    detail: 'freeswitch.Session(dial_string, session?)',
    doc: 'Create a new outbound session (originate a call).\n\nExample:\n```lua\nlocal new_session = freeswitch.Session("{ignore_early_media=true}sofia/gateway/gw/number", session)\nif new_session:ready() then\n  freeswitch.bridge(session, new_session)\nend\n```',
    insert: 'Session(${1:dial_string}, ${2:session})'
  },
  {
    label: 'bridge',
    detail: 'freeswitch.bridge(session1, session2)',
    doc: 'Bridge two sessions together.\n\nExample:\n```lua\nfreeswitch.bridge(session, new_session)\nwhile new_session:ready() do\n  freeswitch.bridge(session, new_session)\nend\n```',
    insert: 'bridge(${1:session}, ${2:new_session})'
  },
  {
    label: 'email',
    detail: 'freeswitch.email(to, from, headers, body, file?, convert_cmd?, convert_ext?)',
    doc: 'Send an email.\n\nExample:\n```lua\nfreeswitch.email("to@example.com", "from@example.com", "Subject: Alert", "Body text")\n```',
    insert: 'email(${1:"to@example.com"}, ${2:"from@example.com"}, ${3:"Subject: Alert"}, ${4:"Body text"})'
  },
  {
    label: 'msleep',
    detail: 'freeswitch.msleep(ms)',
    doc: 'Sleep for the specified milliseconds (non-session context).',
    insert: 'msleep(${1:1000})'
  },
  {
    label: 'IVRMenu',
    detail: 'freeswitch.IVRMenu(session, name, greeting, short_greeting, invalid, exit, ...)',
    doc: 'Create an IVR menu from code.',
    insert: 'IVRMenu(${1:session}, ${2:"main_menu"}, ${3:"greeting.wav"}, ${4:"short.wav"}, ${5:"invalid.wav"}, ${6:"exit.wav"}, ${7:"confirm.wav"}, ${8:""}, ${9:""})'
  }
];

/**
 * Lua standard library completions
 */
export const luaStdlib = [
  // Keywords
  { label: 'local', detail: 'local variable', doc: 'Declare a local variable.', insert: 'local ${1:name} = ${2:value}', kind: 'Keyword' },
  { label: 'function', detail: 'function definition', doc: 'Define a function.', insert: 'function ${1:name}(${2:args})\n\t${3:-- body}\nend', kind: 'Keyword' },
  { label: 'if', detail: 'if/then/end', doc: 'Conditional statement.', insert: 'if ${1:condition} then\n\t${2:-- body}\nend', kind: 'Keyword' },
  { label: 'elseif', detail: 'elseif/then', doc: 'Additional condition in if block.', insert: 'elseif ${1:condition} then\n\t${2:-- body}', kind: 'Keyword' },
  { label: 'for', detail: 'for/do/end (numeric)', doc: 'Numeric for loop.', insert: 'for ${1:i} = ${2:1}, ${3:10} do\n\t${4:-- body}\nend', kind: 'Keyword' },
  { label: 'for_pairs', detail: 'for k,v in pairs()', doc: 'Iterate over table key-value pairs.', insert: 'for ${1:k}, ${2:v} in pairs(${3:table}) do\n\t${4:-- body}\nend', kind: 'Keyword' },
  { label: 'for_ipairs', detail: 'for i,v in ipairs()', doc: 'Iterate over array elements.', insert: 'for ${1:i}, ${2:v} in ipairs(${3:table}) do\n\t${4:-- body}\nend', kind: 'Keyword' },
  { label: 'while', detail: 'while/do/end', doc: 'While loop.', insert: 'while ${1:condition} do\n\t${2:-- body}\nend', kind: 'Keyword' },
  { label: 'repeat', detail: 'repeat/until', doc: 'Repeat-until loop.', insert: 'repeat\n\t${1:-- body}\nuntil ${2:condition}', kind: 'Keyword' },
  { label: 'return', detail: 'return value', doc: 'Return from function.', insert: 'return ${1:value}', kind: 'Keyword' },

  // Built-in functions
  { label: 'require', detail: 'require(module)', doc: 'Load a Lua module.', insert: 'require(${1:"module_name"})' },
  { label: 'tostring', detail: 'tostring(value)', doc: 'Convert a value to a string.', insert: 'tostring(${1:value})' },
  { label: 'tonumber', detail: 'tonumber(value)', doc: 'Convert a value to a number.', insert: 'tonumber(${1:value})' },
  { label: 'type', detail: 'type(value)', doc: 'Return the type of a value as a string.', insert: 'type(${1:value})' },
  { label: 'pcall', detail: 'pcall(func, args...)', doc: 'Protected call — catches errors.\n\nExample:\n```lua\nlocal ok, err = pcall(function()\n  -- risky code\nend)\n```', insert: 'pcall(function()\n\t${1:-- protected code}\nend)' },
  { label: 'xpcall', detail: 'xpcall(func, handler)', doc: 'Protected call with error handler.', insert: 'xpcall(function()\n\t${1:-- protected code}\nend, function(err)\n\t${2:-- error handler}\nend)' },
  { label: 'error', detail: 'error(message, level?)', doc: 'Raise an error.', insert: 'error(${1:"error message"})' },
  { label: 'assert', detail: 'assert(value, message?)', doc: 'Assert a condition, raising error if false.', insert: 'assert(${1:condition}, ${2:"assertion failed"})' },
  { label: 'print', detail: 'print(args...)', doc: 'Print values to stdout.', insert: 'print(${1:value})' },
  { label: 'unpack', detail: 'unpack(list, i?, j?)', doc: 'Unpack a table into individual values.', insert: 'unpack(${1:table})' },
  { label: 'select', detail: 'select(index, ...)', doc: 'Return arguments after index, or count with "#".', insert: 'select(${1:"#"}, ${2:...})' },
  { label: 'loadfile', detail: 'loadfile(filename)', doc: 'Load a Lua file as a chunk.', insert: 'loadfile(${1:"filename.lua"})' },
  { label: 'dofile', detail: 'dofile(filename)', doc: 'Execute a Lua file.', insert: 'dofile(${1:"filename.lua"})' },

  // string library
  { label: 'string.format', detail: 'string.format(fmt, ...)', doc: 'Format a string (like printf).\n\nExample:\n```lua\nstring.format("Name: %s, Age: %d", name, age)\n```', insert: 'string.format(${1:"%s"}, ${2:value})' },
  { label: 'string.find', detail: 'string.find(s, pattern)', doc: 'Find pattern in string. Returns start, end positions.', insert: 'string.find(${1:str}, ${2:"pattern"})' },
  { label: 'string.match', detail: 'string.match(s, pattern)', doc: 'Extract matching groups from string.', insert: 'string.match(${1:str}, ${2:"pattern"})' },
  { label: 'string.gsub', detail: 'string.gsub(s, pattern, repl)', doc: 'Replace all matches in string.', insert: 'string.gsub(${1:str}, ${2:"pattern"}, ${3:"replacement"})' },
  { label: 'string.sub', detail: 'string.sub(s, i, j?)', doc: 'Extract a substring.', insert: 'string.sub(${1:str}, ${2:1}, ${3:-1})' },
  { label: 'string.len', detail: 'string.len(s)', doc: 'Return string length.', insert: 'string.len(${1:str})' },
  { label: 'string.upper', detail: 'string.upper(s)', doc: 'Convert string to uppercase.', insert: 'string.upper(${1:str})' },
  { label: 'string.lower', detail: 'string.lower(s)', doc: 'Convert string to lowercase.', insert: 'string.lower(${1:str})' },
  { label: 'string.rep', detail: 'string.rep(s, n)', doc: 'Repeat string n times.', insert: 'string.rep(${1:str}, ${2:n})' },
  { label: 'string.byte', detail: 'string.byte(s, i?)', doc: 'Return byte value of character.', insert: 'string.byte(${1:str}, ${2:1})' },
  { label: 'string.char', detail: 'string.char(byte...)', doc: 'Return character from byte value.', insert: 'string.char(${1:byte})' },

  // table library
  { label: 'table.insert', detail: 'table.insert(t, value)', doc: 'Insert a value at the end of a table (or at position).', insert: 'table.insert(${1:t}, ${2:value})' },
  { label: 'table.remove', detail: 'table.remove(t, pos?)', doc: 'Remove element from table.', insert: 'table.remove(${1:t}, ${2:pos})' },
  { label: 'table.concat', detail: 'table.concat(t, sep?)', doc: 'Concatenate table elements into a string.', insert: 'table.concat(${1:t}, ${2:", "})' },
  { label: 'table.sort', detail: 'table.sort(t, comp?)', doc: 'Sort a table in-place.', insert: 'table.sort(${1:t})' },

  // math library
  { label: 'math.random', detail: 'math.random(m?, n?)', doc: 'Generate random number.', insert: 'math.random(${1:1}, ${2:100})' },
  { label: 'math.floor', detail: 'math.floor(x)', doc: 'Round down to integer.', insert: 'math.floor(${1:x})' },
  { label: 'math.ceil', detail: 'math.ceil(x)', doc: 'Round up to integer.', insert: 'math.ceil(${1:x})' },
  { label: 'math.abs', detail: 'math.abs(x)', doc: 'Absolute value.', insert: 'math.abs(${1:x})' },
  { label: 'math.max', detail: 'math.max(x, ...)', doc: 'Return the maximum value.', insert: 'math.max(${1:a}, ${2:b})' },
  { label: 'math.min', detail: 'math.min(x, ...)', doc: 'Return the minimum value.', insert: 'math.min(${1:a}, ${2:b})' },

  // os / io
  { label: 'os.time', detail: 'os.time()', doc: 'Return current Unix timestamp.', insert: 'os.time()' },
  { label: 'os.date', detail: 'os.date(fmt?, time?)', doc: 'Format a date/time string.', insert: 'os.date(${1:"%Y-%m-%d %H:%M:%S"})' },
  { label: 'os.clock', detail: 'os.clock()', doc: 'Return CPU time used by the program.', insert: 'os.clock()' },
  { label: 'os.getenv', detail: 'os.getenv(name)', doc: 'Get an environment variable value.\n\nExample:\n```lua\nlocal api_host = os.getenv("VA_API_URL")\n```', insert: 'os.getenv(${1:"VA_API_URL"})' },
  { label: 'io.popen', detail: 'io.popen(command)', doc: 'Execute a system command and return file handle for reading output.\n\nExample:\n```lua\nlocal handle = io.popen("curl -s http://example.com")\nlocal result = handle:read("*a")\nhandle:close()\n```', insert: 'io.popen(${1:"command"})' },
  { label: 'io.open', detail: 'io.open(filename, mode?)', doc: 'Open a file for reading or writing.', insert: 'io.open(${1:"filename"}, ${2:"r"})' }
];

/**
 * Common FreeSWitch Lua patterns — helper libraries and utilities
 */
export const commonPatterns = [
  {
    label: 'JSON.decode',
    detail: 'JSON.decode(json_string)',
    doc: 'Decode a JSON string to a Lua table. Requires loading JSON library first.\n\n```lua\nlocal JSON = require("JSON") -- or loadfile("JSON.lua")()\nlocal data = JSON:decode(json_string)\n```',
    insert: 'JSON:decode(${1:json_string})'
  },
  {
    label: 'JSON.encode',
    detail: 'JSON.encode(table)',
    doc: 'Encode a Lua table to a JSON string.\n\n```lua\nlocal json_string = JSON:encode({key = "value"})\n```',
    insert: 'JSON:encode(${1:data})'
  },
  {
    label: 'Base64Encode',
    detail: 'Base64Encode(string)',
    doc: 'Encode a string in Base64. Used for event bodies and auth headers.\n\nExample:\n```lua\nlocal body = Base64Encode(log_json)\n```',
    insert: 'Base64Encode(${1:str})'
  },
  {
    label: 'Base64Decode',
    detail: 'Base64Decode(string)',
    doc: 'Decode a Base64-encoded string.\n\nExample:\n```lua\nlocal decoded = Base64Decode(encoded_data)\n```',
    insert: 'Base64Decode(${1:str})'
  },
  {
    label: 'curl_get',
    detail: 'curl GET request via io.popen',
    doc: 'Perform an HTTP GET using curl.\n\n```lua\nlocal handle = io.popen("curl -s http://example.com/api")\nlocal result = handle:read("*a")\nhandle:close()\n```',
    insert: 'io.popen("curl -s ${1:url}"):read("*a")'
  },
  {
    label: 'api:execute',
    detail: 'api:execute(command, args)',
    doc: 'Execute a FreeSWitch API command.\n\nExample:\n```lua\nlocal api = freeswitch.API()\nlocal result = api:execute("uuid_getvar", uuid .. " caller_id_number")\n```',
    insert: 'execute(${1:"command"}, ${2:"args"})'
  },
  {
    label: 'api:executeString',
    detail: 'api:executeString(command_string)',
    doc: 'Execute a FreeSWitch API command as a single string.\n\nExample:\n```lua\nlocal res = api:executeString("curl " .. api_host .. "/switch/router/" .. va_call_uuid)\nlocal res = api:executeString("luarun script.lua " .. session:get_uuid())\n```',
    insert: 'executeString(${1:"command_string"})'
  },
  {
    label: 'va_log',
    detail: 'va_log(level, message)',
    doc: 'VoipAppz logging helper — logs to console and fires va::log event.\n\nExample:\n```lua\nva_log("debug", "Processing queue: " .. queue_name)\n```',
    insert: 'va_log(${1:"debug"}, ${2:"message"})'
  },
  {
    label: 'os.getenv',
    detail: 'os.getenv(name)',
    doc: 'Get an environment variable.\n\nExample:\n```lua\nlocal api_host = os.getenv("VA_API_URL")\n```',
    insert: 'os.getenv(${1:"VA_API_URL"})'
  },
  {
    label: 'record_session',
    detail: 'record_session(call_uuid)',
    doc: 'Start recording the current session.\n\nExample:\n```lua\nrecord_session(session:getVariable("va_call_uuid"))\n```',
    insert: 'record_session(${1:va_call_uuid})'
  },
  {
    label: 'file_exists',
    detail: 'file_exists(path)',
    doc: 'Check if a file exists on disk.\n\nExample:\n```lua\nif file_exists("/tmp/" .. vml_file .. ".lua") then\n  dofile("/tmp/" .. vml_file .. ".lua")\nend\n```',
    insert: 'file_exists(${1:"/tmp/script.lua"})'
  },
  {
    label: 'containsKey',
    detail: 'containsKey(key, table)',
    doc: 'Check if a key exists in a table.\n\nExample:\n```lua\nif containsKey("follow_me", route) then\n  -- process follow_me\nend\n```',
    insert: 'containsKey(${1:"key"}, ${2:table})'
  },
  {
    label: 'event:addHeader',
    detail: 'event:addHeader(name, value)',
    doc: 'Add a header to a FreeSWitch event.\n\nExample:\n```lua\nevent:addHeader("action", "call_start")\n```',
    insert: 'addHeader(${1:"header_name"}, ${2:"header_value"})'
  },
  {
    label: 'event:fire',
    detail: 'event:fire()',
    doc: 'Fire (send) a FreeSWitch event.',
    insert: 'fire()'
  },
  {
    label: 'event:addBody',
    detail: 'event:addBody(body)',
    doc: 'Add a body to a FreeSWitch event.',
    insert: 'addBody(${1:"body content"})'
  }
];

/**
 * Hover documentation map — keyed by function/method name
 * Used by the hover provider to show docs on mouse hover
 */
export const hoverDocs = {};

// Build hover docs from session methods
sessionMethods.forEach(m => {
  hoverDocs[`session:${m.label}`] = {
    signature: m.detail,
    description: m.doc
  };
  hoverDocs[`session.${m.label}`] = {
    signature: m.detail,
    description: m.doc
  };
});

// Build hover docs from freeswitch globals
freeswitchGlobals.forEach(m => {
  hoverDocs[`freeswitch.${m.label}`] = {
    signature: m.detail,
    description: m.doc
  };
});

// Add common pattern hover docs
commonPatterns.forEach(m => {
  hoverDocs[m.label] = {
    signature: m.detail,
    description: m.doc
  };
});

// Add some standalone Lua function hover docs
const standaloneFuncs = ['pcall', 'xpcall', 'require', 'tostring', 'tonumber', 'type', 'assert', 'error', 'loadfile', 'dofile'];
luaStdlib.filter(m => standaloneFuncs.includes(m.label)).forEach(m => {
  hoverDocs[m.label] = {
    signature: m.detail,
    description: m.doc
  };
});

/**
 * Script templates — full boilerplate scripts
 */
export const scriptTemplates = [
  {
    label: 'Empty Script',
    description: 'Minimal script with answer and logging',
    content: `-- VML Script
-- FreeSWitch Lua
-- ==========================================

JSON = (loadfile "/usr/local/freeswitch/scripts/JSON.lua")()
inspect = (loadfile "/usr/local/freeswitch/scripts/inspect.lua")()
api_host = os.getenv("VA_API_URL")

session:answer()
session:sleep(500)

caller_id_number = session:getVariable("caller_id_number")
va_call_uuid = session:getVariable("va_call_uuid")

freeswitch.consoleLog("info", "VA - Script started for: " .. caller_id_number .. "\\n")

-- Your code here

session:hangup()
`
  },
  {
    label: 'API Router',
    description: 'Route calls via API lookup with send_log/send_state helpers',
    content: `-- API Router Script
-- FreeSWitch Lua
-- ==========================================
-- Routes calls based on API response with logging and state events

JSON = (loadfile "/usr/local/freeswitch/scripts/JSON.lua")()
inspect = (loadfile "/usr/local/freeswitch/scripts/inspect.lua")()
api_host = os.getenv("VA_API_URL")

function send_log(log)
  session:consoleLog("crit", "[LOGZ]" .. log)
  body = ""
  body = body .. "log: " .. Base64Encode(log) .. "\\n"
  local e = freeswitch.Event("custom", "va::log")
  e:addBody(body)
  e:fire()
end

function send_state(log)
  session:consoleLog("info", log)
  body = ""
  body = body .. "" .. Base64Encode(log) .. "\\n"
  local e = freeswitch.Event("custom", "va::state")
  e:addBody(body)
  e:fire()
end

function router_vml(bridge_type, bridge_uuid)
  session:consoleLog("info", "VA - Route: bridge_type " .. bridge_type .. " bridge_uuid:" .. bridge_uuid .. "\\n")
  local res = api:executeString("curl " .. api_host .. "/switch/router/" .. va_call_uuid .. "/" .. bridge_type .. "/" .. bridge_uuid .. "/" .. session:get_uuid())
  local res_json = JSON:decode(res)
  session:consoleLog("info", "VA - route response:" .. inspect(res_json) .. "\\n")

  local _va_call_uuid = res_json['va_call_uuid']
  route_encoded = Base64Decode(res_json['route'])
  va_call_uuid = _va_call_uuid

  local route_decoded = JSON:decode(route_encoded)
  process_route(route_decoded)
end

session:answer()
session:sleep(500)

caller_id_number = session:getVariable("caller_id_number")
va_call_uuid = session:getVariable("va_call_uuid")

send_log("Script started for " .. caller_id_number)

-- Route the call
-- router_vml("bridge_type", "bridge_uuid")

session:hangup("NORMAL_CLEARING")
`
  },
  {
    label: 'IVR Menu',
    description: 'Collect digits with retry, timeout, and route by input',
    content: `-- IVR Menu Script
-- FreeSWitch Lua
-- ==========================================
-- Interactive voice menu with digit collection and routing

JSON = (loadfile "/usr/local/freeswitch/scripts/JSON.lua")()
inspect = (loadfile "/usr/local/freeswitch/scripts/inspect.lua")()

session:answer()
session:sleep(500)

local caller_id = session:getVariable("caller_id_number") or "unknown"
session:consoleLog("info", "VA - IVR started for caller: " .. caller_id .. "\\n")

-- IVR configuration
local max_attempts = 3
local max_timeout = 5000
local announcement = "ivr/ivr-welcome.wav"

-- Valid digit entries
local valid_digits = { ["1"] = true, ["2"] = true, ["3"] = true, ["0"] = true }

for attempt = 1, max_attempts do
  session:consoleLog("info", "VA - IVR attempt " .. attempt .. " of " .. max_attempts .. "\\n")

  session:execute("playback", "/usr/local/freeswitch/assets/sil.wav")

  local digits = session:playAndGetDigits(
    1,                -- min digits
    1,                -- max digits
    1,                -- max tries per round
    max_timeout,      -- timeout ms
    "",               -- terminator
    announcement,     -- prompt file
    "",               -- invalid file
    "^[0-9*#]+$",     -- regex
    "ivr_digits",     -- variable name
    max_timeout       -- digit timeout
  )

  session:consoleLog("info", "VA - IVR digits received: '" .. digits .. "'\\n")

  if digits ~= "" and valid_digits[digits] then
    session:consoleLog("info", "VA - IVR valid entry: " .. digits .. "\\n")

    if digits == "1" then
      -- Route to sales
      session:transfer("2001", "XML", "default")
    elseif digits == "2" then
      -- Route to support
      session:transfer("2002", "XML", "default")
    elseif digits == "3" then
      -- Route to voicemail
      session:transfer("*99", "XML", "default")
    elseif digits == "0" then
      -- Operator
      session:transfer("operator", "XML", "default")
    end
    return
  end

  if digits == "" then
    session:consoleLog("info", "VA - IVR timeout, attempt " .. attempt .. "\\n")
  else
    session:consoleLog("info", "VA - Invalid digit: '" .. digits .. "'\\n")
  end
end

session:consoleLog("info", "VA - Max attempts reached\\n")
session:hangup("NORMAL_CLEARING")
`
  },
  {
    label: 'Queue Handler',
    description: 'Send call to callcenter queue with agent bridging',
    content: `-- Queue Handler Script
-- FreeSWitch Lua
-- ==========================================
-- Routes caller to a callcenter queue with recording and logging

JSON = (loadfile "/usr/local/freeswitch/scripts/JSON.lua")()
inspect = (loadfile "/usr/local/freeswitch/scripts/inspect.lua")()
api_host = os.getenv("VA_API_URL")

function send_log(log)
  session:consoleLog("crit", "[LOGZ]" .. log)
  local e = freeswitch.Event("custom", "va::log")
  e:addBody(Base64Encode(log))
  e:fire()
end

session:answer()
session:sleep(500)

local caller_id = session:getVariable("caller_id_number")
va_call_uuid = session:getVariable("va_call_uuid")
local queue_uuid = "your-queue-uuid-here"

send_log("Queue start for " .. caller_id)

-- Set queue-related session variables
session:setVariable("va_que", queue_uuid)
session:setVariable("va_leg", "leg_b")
session:setVariable("va_user_bridged", "false")
session:setVariable("hangup_after_bridge", "true")
session:setVariable("absolute_codec_string", "PCMA,PCMU")
session:setVariable("sip_h_X-VA-Call-Uuid", va_call_uuid)
session:setVariable("cc_export_vars", "sip_h_X-VA-Call-Uuid,va_call_uuid,va_leg,va_que")

-- Play intro announcement (optional)
-- session:streamFile(intro_announcement_path)

-- Record the session
-- record_session(va_call_uuid)

-- Enter callcenter queue
session:execute("callcenter", queue_uuid)

-- Check if agent answered
if session:getVariable("cc_agent_uuid") == nil then
  send_log("Agent not bridged - queue " .. queue_uuid)
  -- Handle max wait time — route to voicemail or other destination
else
  send_log("Queue answered - " .. queue_uuid)
end
`
  },
  {
    label: 'Customer Lookup',
    description: 'Check customer, create if new, dial or route to IVR',
    content: `-- Customer Lookup Script
-- FreeSWitch Lua
-- ==========================================
-- Check customer status, create if new, dial if existing

JSON = (loadfile "/usr/local/freeswitch/scripts/JSON.lua")()
inspect = (loadfile "/usr/local/freeswitch/scripts/inspect.lua")()
api_host = os.getenv("VA_API_URL")

function send_log(log)
  session:consoleLog("crit", "[LOGZ]" .. log)
  local e = freeswitch.Event("custom", "va::log")
  e:addBody(Base64Encode(log))
  e:fire()
end

function check_customer(number)
  local _command = "/usr/local/freeswitch/va/check_customer.sh " .. number
  freeswitch.consoleLog("alert", "---curl string:" .. _command)
  local handle = io.popen(_command)
  local result = handle:read("*a")
  handle:close()
  freeswitch.consoleLog("alert", "---curl RESP:" .. result)
  local res_json = JSON:decode(result)
  send_log("Response is " .. inspect(res_json))
  if res_json and res_json["uuid"] then
    if tonumber(res_json["balance"]) > 0 then
      return "ok"
    else
      return "no_balance"
    end
  else
    send_log("User does not exist")
    return false
  end
end

function create_customer(number)
  send_log("Creating Customer")
  local _command = "/usr/local/freeswitch/va/create_customer.sh " .. number
  local handle = io.popen(_command)
  local result = handle:read("*a")
  handle:close()
  local res_json = JSON:decode(result)
  if res_json and res_json["uuid"] then
    send_log("Customer Created: " .. res_json["uuid"])
    return res_json["uuid"]
  end
end

session:answer()
session:sleep(500)

caller_id_number = session:getVariable("caller_id_number")
va_call_uuid = session:getVariable("va_call_uuid")

send_log("Start script")

local customer = check_customer(caller_id_number)

if customer then
  if customer == "no_balance" then
    send_log("No balance for " .. caller_id_number)
    session:execute("playback", "path/to/no_balance.wav")
    session:hangup()
  else
    send_log("Dialing customer: " .. inspect(customer))
    -- Route to destination
  end
else
  send_log("New customer - move to IVR")
  local customer_id = create_customer(caller_id_number)
  send_log("Created customer: " .. customer_id)
  session:transfer("destination", "XML", "public")
end
`
  },
  {
    label: 'Dial Agents',
    description: 'Query available agents and bridge call',
    content: `-- Dial Agents Script
-- FreeSWitch Lua
-- ==========================================
-- Query callcenter for available agents and bridge

JSON = (loadfile "/usr/local/freeswitch/scripts/JSON.lua")()
inspect = (loadfile "/usr/local/freeswitch/scripts/inspect.lua")()

function send_log(log)
  session:consoleLog("crit", "[LOGZ]" .. log)
  local e = freeswitch.Event("custom", "va::log")
  e:addBody(Base64Encode(log))
  e:fire()
end

local api = freeswitch.API()
va_call_uuid = session:getVariable("va_call_uuid")
va_contact_number = session:getVariable("caller_id_number")

session:answer()

local queue_uuid = "your-queue-uuid-here"

-- Get available agents from callcenter
local agent_cmd = 'json {"command": "callcenter_config", "data": {"arguments":"queue list agents", "queue_name":"' .. queue_uuid .. '"}}'
local res_agent_list = api:executeString(agent_cmd)
local agent_list_json = JSON:decode(res_agent_list)

-- Build dial string from available agents
local dial_arr = {}
for i, k in pairs(agent_list_json['response']) do
  if k['status'] == 'Available' then
    send_log("Agent available: " .. k['contact'])
    table.insert(dial_arr, { contact = k['contact'], uuid = k['name'] })
  else
    send_log("Agent busy: " .. k['contact'])
  end
end

send_log("Calling " .. #dial_arr .. " agents")

-- Build bridge string
local dial_str = ""
for key, value in pairs(dial_arr) do
  dial_str = dial_str .. "|" .. value['contact']
end

local bridge_vars = "{absolute_codec_string=PCMA,answer_delay=2500}"
local bridge = bridge_vars .. dial_str

send_log("Dialing: " .. bridge)
local new_session = freeswitch.Session(bridge, session)

while new_session:ready() do
  send_log("Bridging to agents")
  freeswitch.bridge(session, new_session)
  if new_session:answered() then
    session:setVariable("va_user_bridged", "true")
    send_log("Agent answered")
  else
    local cause = new_session:hangupCause()
    send_log("Agent not answering, cause: " .. cause)
  end
end
`
  }
];

/**
 * Categorized snippets for the snippets dropdown menu
 */
export const snippetCategories = [
  {
    category: 'Session Control',
    snippets: [
      { label: 'Answer', snippet: 'session:answer()\n', tip: 'Answer the incoming call' },
      { label: 'Hangup', snippet: 'session:hangup(${1:"NORMAL_CLEARING"})\n', tip: 'Hangup the call' },
      { label: 'Sleep', snippet: 'session:sleep(${1:1000})\n', tip: 'Pause for milliseconds' },
      { label: 'Ready Check', snippet: 'if session:ready() then\n\t${1:-- call is active}\nend\n', tip: 'Check if session is still active' },
      { label: 'Pre-answer', snippet: 'session:preAnswer()\n', tip: 'Pre-answer (early media)' },
      { label: 'Auto Hangup Off', snippet: 'session:setAutoHangup(false)\n', tip: 'Disable auto-hangup on script end' }
    ]
  },
  {
    category: 'Audio & IVR',
    snippets: [
      { label: 'Playback', snippet: 'session:execute("playback", "${1:ivr/ivr-welcome.wav}")\n', tip: 'Play an audio file' },
      { label: 'Play & Get Digits', snippet: 'local digits = session:playAndGetDigits(${1:1}, ${2:4}, ${3:3}, ${4:5000}, ${5:"#"}, ${6:"ivr/ivr-enter_ext.wav"}, ${7:"ivr/ivr-that_was_an_invalid_entry.wav"}, ${8:"\\\\\\\\d+"})\n', tip: 'Play prompt and collect DTMF' },
      { label: 'Speak TTS', snippet: 'session:speak("${1:text to speak}")\n', tip: 'Text-to-speech' },
      { label: 'Record', snippet: 'session:recordFile("${1:/tmp/recording.wav}", ${2:120}, ${3:30}, ${4:5})\n', tip: 'Record audio to file' },
      { label: 'Stream File', snippet: 'session:streamFile("${1:ivr/ivr-welcome.wav}")\n', tip: 'Stream audio file' },
      { label: 'Say Phrase', snippet: 'session:sayPhrase("${1:macro_name}", "${2:}", "${3:en}")\n', tip: 'Say a phrase macro' }
    ]
  },
  {
    category: 'Call Routing',
    snippets: [
      { label: 'Bridge', snippet: 'session:execute("bridge", "${1:sofia/gateway/mygateway/18005551234}")\n', tip: 'Bridge call to destination' },
      { label: 'Transfer', snippet: 'session:transfer("${1:destination}", "${2:XML}", "${3:default}")\n', tip: 'Transfer to new destination' },
      { label: 'Park', snippet: 'session:execute("park")\n', tip: 'Park the call (hold)' },
      { label: 'router_vml call', snippet: 'router_vml("${1:bridge_type}", "${2:bridge_uuid}")\n', tip: 'Route via API router' },
      { label: 'process_route call', snippet: '_r = {}\n_r["type"] = ${1:bridge_type}\n_r["route"] = router(${1:bridge_type}, ${2:bridge_uuid})\nprocess_route(_r)\n', tip: 'Build route object and process' },
      { label: 'Playback URL', snippet: 'session:execute("playback", "${1:https://<api-host>/tmp/}" .. ${2:file_uuid} .. ".wav")\n', tip: 'Play audio from URL' }
    ]
  },
  {
    category: 'Variables',
    snippets: [
      { label: 'Get Variable', snippet: 'local ${1:value} = session:getVariable("${2:caller_id_number}")\n', tip: 'Get a channel variable' },
      { label: 'Set Variable', snippet: 'session:setVariable("${1:variable_name}", "${2:value}")\n', tip: 'Set a channel variable' },
      { label: 'Get Header', snippet: 'local ${1:header} = session:getVariable("${2:sip_h_X-Custom-Header}")\n', tip: 'Get a SIP header' },
      { label: 'Export Variable', snippet: 'session:execute("export", "${1:variable_name}=${2:value}")\n', tip: 'Export variable to bridged channel' }
    ]
  },
  {
    category: 'Events & Logging',
    snippets: [
      { label: 'Console Log', snippet: 'session:consoleLog("${1:info}", "VA - ${2:message}" .. "\\n")\n', tip: 'Log to FreeSWitch console' },
      { label: 'va_log', snippet: 'va_log("${1:debug}", "${2:message}")\n', tip: 'VoipAppz log helper' },
      { label: 'send_log function', snippet: 'function send_log(log)\n  session:consoleLog("crit", "[LOGZ]" .. log)\n  body = ""\n  body = body .. "log: " .. Base64Encode(log) .. "\\n"\n  local e = freeswitch.Event("custom", "va::log")\n  e:addBody(body)\n  e:fire()\nend\n', tip: 'Define send_log helper with Base64 event body' },
      { label: 'send_state function', snippet: 'function send_state(log)\n  session:consoleLog("info", log)\n  body = ""\n  body = body .. "" .. Base64Encode(log) .. "\\n"\n  local e = freeswitch.Event("custom", "va::state")\n  e:addBody(body)\n  e:fire()\nend\n', tip: 'Define send_state helper with Base64 event body' },
      { label: 'Fire va::log Event', snippet: 'local e = freeswitch.Event("custom", "va::log")\ne:addBody(Base64Encode(${1:log_json}))\ne:fire()\n', tip: 'Fire a va::log event with Base64 body' },
      { label: 'Fire va::state Event', snippet: 'local e = freeswitch.Event("custom", "va::state")\ne:addBody(Base64Encode(${1:state_json}))\ne:fire()\n', tip: 'Fire a va::state event with Base64 body' },
      { label: 'JSON encode + send_state', snippet: 'log_obj = {}\nlog_obj["va_call_uuid"] = va_call_uuid\nlog_obj["action"] = "${1:add_meta}"\nlog_obj["k"] = "${2:key}"\nlog_obj["v"] = tostring(${3:value})\nlocal log_json = JSON:encode(log_obj)\nsend_state(log_json)\n', tip: 'Build JSON object and send as state event' }
    ]
  },
  {
    category: 'HTTP & API',
    snippets: [
      { label: 'curl GET (io.popen)', snippet: 'local _command = "/usr/bin/curl -k -X GET " .. ${1:api_host} .. "${2:/endpoint}"\nsession:consoleLog("info", "VA - curl: " .. _command)\nlocal handle = io.popen(_command)\nlocal result = handle:read("*a")\nhandle:close()\nfreeswitch.consoleLog("alert", "---curl RESP:" .. result)\nlocal res_json = JSON:decode(result)\n', tip: 'HTTP GET via io.popen + JSON parse' },
      { label: 'curl GET (api:executeString)', snippet: 'local res = api:executeString("curl " .. api_host .. "${1:/switch/router/}" .. va_call_uuid .. "/" .. ${2:bridge_type} .. "/" .. ${3:bridge_uuid} .. "/" .. session:get_uuid())\nlocal res_json = JSON:decode(res)\nsession:consoleLog("info", "VA - response:" .. inspect(res_json) .. "\\n")\n', tip: 'HTTP GET via api:executeString' },
      { label: 'curl via session:execute', snippet: 'session:setVariable("curl_timeout", "10")\nlocal url = "${1:http://api.example.com/endpoint?param=}" .. ${2:caller_id_number}\nsession:execute("curl", url)\nlocal curl_response_code = session:getVariable("curl_response_code")\nlocal curl_response = session:getVariable("curl_response_data")\nlocal res_json = JSON:decode(curl_response)\n', tip: 'HTTP request via session:execute("curl")' },
      { label: 'Shell script call', snippet: 'local _command = "${1:/usr/local/freeswitch/va/script.sh} " .. ${2:caller_id_number}\nfreeswitch.consoleLog("alert", "---curl string:" .. _command)\nlocal handle = io.popen(_command)\nlocal result = handle:read("*a")\nhandle:close()\nfreeswitch.consoleLog("alert", "---curl RESP:" .. result)\nlocal res_json = JSON:decode(result)\n', tip: 'Execute shell script with io.popen' },
      { label: 'API executeString', snippet: 'local api = freeswitch.API()\nlocal result = api:executeString("${1:command_string}")\n', tip: 'Execute FreeSWitch API command as string' },
      { label: 'API luarun', snippet: 'api:executeString("luarun ${1:script.lua} " .. session:get_uuid() .. " " .. va_call_uuid)\n', tip: 'Run another Lua script in background' }
    ]
  },
  {
    category: 'Libraries',
    snippets: [
      { label: 'Load JSON + Inspect', snippet: 'JSON = (loadfile "/usr/local/freeswitch/scripts/JSON.lua")()\ninspect = (loadfile "/usr/local/freeswitch/scripts/inspect.lua")()\n', tip: 'Load JSON and inspect libraries (global)' },
      { label: 'Load API host', snippet: 'api_host = os.getenv("VA_API_URL")\n', tip: 'Get VA_API_URL from environment' },
      { label: 'JSON encode', snippet: 'local json_str = JSON:encode(${1:table_data})\n', tip: 'Encode Lua table to JSON string' },
      { label: 'JSON decode', snippet: 'local data = JSON:decode(${1:json_string})\n', tip: 'Decode JSON string to Lua table' },
      { label: 'Base64 Encode', snippet: 'local encoded = Base64Encode(${1:str})\n', tip: 'Base64 encode a string' },
      { label: 'Base64 Decode', snippet: 'local decoded = Base64Decode(${1:str})\n', tip: 'Base64 decode a string' },
      { label: 'dofile VML', snippet: 'local _file = "/tmp/" .. ${1:vml_file} .. ".lua"\ndofile(_file)\n', tip: 'Execute another VML Lua script' },
      { label: 'in_arr helper', snippet: 'local function in_arr(tab, val)\n  for index, value in ipairs(tab) do\n    if value == val then\n      return true\n    end\n  end\n  return false\nend\n', tip: 'Check if value exists in array' }
    ]
  },
  {
    category: 'Callcenter',
    snippets: [
      { label: 'Enter Queue', snippet: 'session:setVariable("va_que", ${1:queue_uuid})\nsession:setVariable("va_leg", "leg_b")\nsession:setVariable("va_user_bridged", "false")\nsession:setVariable("hangup_after_bridge", "true")\nsession:setVariable("sip_h_X-VA-Call-Uuid", va_call_uuid)\nsession:execute("callcenter", ${1:queue_uuid})\n', tip: 'Set queue variables and enter callcenter' },
      { label: 'New Session + Bridge', snippet: 'local new_session = freeswitch.Session(${1:dial_string}, session)\nwhile new_session:ready() do\n  freeswitch.bridge(session, new_session)\n  if new_session:answered() then\n    session:setVariable("va_user_bridged", "true")\n  else\n    local cause = new_session:hangupCause()\n    session:consoleLog("info", "VA - Hangup cause: " .. cause .. "\\n")\n  end\nend\n', tip: 'Create outbound session and bridge' },
      { label: 'Query Agent List', snippet: "local agent_cmd = 'json {\"command\": \"callcenter_config\", \"data\": {\"arguments\":\"queue list agents\", \"queue_name\":\"' .. ${1:queue_uuid} .. '\"}}'\nlocal res = api:executeString(agent_cmd)\nlocal agents = JSON:decode(res)\nfor i, k in pairs(agents[\"response\"]) do\n  if k[\"status\"] == \"Available\" then\n    session:consoleLog(\"info\", \"VA - Agent available: \" .. k[\"contact\"] .. \"\\n\")\n  end\nend\n", tip: 'Get available callcenter agents' },
      { label: 'Bind Digit Action', snippet: 'session:execute("bind_digit_action", "default,${1:1},api:lua,${2:voicemail.lua} " .. session:get_uuid())\n', tip: 'Bind DTMF digit to Lua script action' },
      { label: 'Record Session', snippet: 'record_session(session:getVariable("va_call_uuid"))\n', tip: 'Start recording the current session' }
    ]
  }
];

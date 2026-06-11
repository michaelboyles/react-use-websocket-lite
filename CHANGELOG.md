# 1.1.1

- docs: move to tsdoc
- build: uses tsdown, few changes to package.json (should not cause issues)

# 1.1.0

- feat: `onConnectAttempt` callback
- feat: Allow heartbeats to be non-strings
- fix: making 1 more attempt than `maxReconnectAttempts` if never successfully connected
- fix: websocket doesn't enter 'closing' state after `messageTimeout` is exceeded

# 1.0.1

- Fix broken modules in packaging

# 1.0.0

Changes to the object returned from `useWebSocket`

- Removed `lastMessage` and `lastJsonMessage`
    - It causes a re-render for every message, because of `setState`. That was avoidable with `filter: () => false`, but it's still a footgun. Use `onMessage`
- Removed `sendJsonMessage`. Useful but it's API clutter. Just call `sendMessage(JSON.stringify(message))`

Changes to `options`

- This is now the only parameter to `useWebSocket`. `url` (previous 1st parameter), and `connect` (previous optional 3rd parameter) are now part of `options` (previous 2nd parameter)
- Removed `queryParams`. Add them to the URL yourself
- Removed `share`. See below
- Removed `filter`. No long relevant
- Moved `heartbeat.timeout` to top level. Now named `messageTimeout`
    - It was always operating in an orthogonal way to heartbeating; you could have a timeout without sending heartbeats,
      and send heartbeats without. The new name makes that clearer.

Improvements to state lifecycle

- Socket now stays in connecting state while server is down. Previously, it changed between 'connecting' and 'closed',
  causing re-renders on every attempt

Removed features

- SocketIO support. This is a lite implementation, and I'm guessing most people don't need this
- EventSource support. This is use**WebSocket**. SSE are out of scope
- Shared connection functionality. I disliked that this impl used global state. If you want to share the socket, I'd advise to use `useWebSocket` in a React context provider

Misc bug fixes

- Fixed potentially extra long message timeout
    - Previously, timeout checked if a message was received in the preceding time window. This means the actual timeout 
      depends on the point in the window when the last message was received. Worst case, the connection will end after
      almost double the provided timeout. Now, the connection is correctly closed after `lastMessageRecievedTime + timeout`.

- Fixed early ping 
    - Previously started when the connection was initiated, not when it connected. So if the connection takes some time to be established, the first ping would arrive early

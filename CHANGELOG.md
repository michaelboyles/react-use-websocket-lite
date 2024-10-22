# 1.0.0

Changes to the object returned from `useWebSocket`

- Removed `lastMessage` and `lastJsonMessage`
  - It causes a re-render for every message, because of `setState`. That was avoidable with `filter: () => false`, but it's still a footgun. Use `onMessage`
- Removed `getWebSocket`. I don't see any reason to expose the socket, even via a proxy
- Removed `sendJsonMessage`. Just call `sendMessage(JSON.stringify(message))`
- Changed `ReadyState` to a string union. Better for debugging, console log, etc.
- Moved `heartbeat.timeout` from to top level. Now named `messageTimeout`
  - It was always orthogonal to heartbeating; you could have a timeout without sending heartbeats, and send heartbeats without
  a timeout (and you still can)

Changes to `options`

- This is now the only parameter to `useWebSocket`. `url` (previous 1st parameter), and `connect` (previous optional 3rd parameter) are now part of `options` (previous 2nd parameter)
- Removed `queryParams`. Add them to the URL yourself
- Removed `share`. See below
- Removed `filter`. No long relevant

Fixes to state lifecycle

- Previously `onClose` would fire if the websocket failed to connect, even if it never opened
- Socket now stays in connecting state while server is down. Previously changed state causing re-render on every attempt

Removed SocketIO support. This is a lite implementation, and I'm guessing most people don't need this

Removed EventSource support. This is use**WebSocket**. SSE are out of scope

Removed share functionality. I disliked that this impl used global state. If you want to share the socket, I'd advise to use `useWebSocket` in a React context provider

Fix heartbeat behaviour. Previously timeout used an interval. This means the actual timeout depends on the point in the window when the last message was recieved. Worst case, the connection will end after almost double the provided timeout. Now, the connection is correctly closed after `lastMessageRecievedTime + timeout`.

Fix early ping. Previously started when the connection was initiated, not when it connected. So if the connection takes some time to be established, the first ping would arrive early


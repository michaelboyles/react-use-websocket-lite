[![Build status](https://github.com/michaelboyles/react-use-websocket-lite/actions/workflows/build.yml/badge.svg)](https://github.com/michaelboyles/react-use-websocket-lite/actions/workflows/build.yml)
[![Release version](https://img.shields.io/github/v/release/michaelboyles/react-use-websocket-lite?sort=semver)](https://github.com/michaelboyles/react-use-websocket-lite/releases)
[![MIT license](https://img.shields.io/github/license/michaelboyles/react-use-websocket-lite)](https://github.com/michaelboyles/react-use-websocket-lite/blob/develop/LICENSE)

WebSocket hook for React.

This library is a fork of [`react-use-websocket`](https://github.com/robtaussig/react-use-websocket)
which has been stripped down to remove features that most people don't need, to fix bugs, and to
improve performance.

See ["Migrating"](#migrating-from-react-use-websocket) below, or the [changelog](https://github.com/michaelboyles/react-use-websocket-lite/blob/develop/CHANGELOG.md)
for details.

## Usage

```text
npm install react-use-websocket-lite
```

```tsx
import useWebSocket, { ReadyState } from "react-use-websocket-lite";
import { useEffect, useState } from "react";

function Demo() {
    const [messages, setMessages] = useState<string[]>([]);

    const { sendMessage, readyState } = useWebSocket({
        url: "wss://echo.websocket.org",
        onMessage(event) {
            if (typeof event.data === "string") {
                setMessages(prev => [...prev, event.data]);
            }
        }
    });

    useEffect(() => {
        if (readyState === ReadyState.OPEN) {
            sendMessage("hello");
        }
    }, [readyState])

    return (
        <pre>{ JSON.stringify(messages, null, 2) }</pre>
    )
}
```

## Options

```typescript
type Options = {
    /**
     * The URL which will passed as the 1st argument of WebSocket's constructor
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#url}
     */
    url: string | (() => string | Promise<string>) | null
    /**
     * The protocols which will be passed as the 2nd argument of WebSocket's constructor
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#protocols}
     */
    protocols?: string | string[]
    /**
     * Whether to connect to the WebSocket
     * @defaultValue `true`
     */
    connect?: boolean
    /**
     * Callback invoked when the WebSocket opens
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/open_event}
     */
    onOpen?: (event: WebSocketEventMap['open']) => void
    /**
     * Callback invoked when the Websocket closes
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event}
     */
    onClose?: (event: WebSocketEventMap['close']) => void
    /**
     * Callback invoked when the WebSocket receives a message
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event}
     */
    onMessage?: (event: WebSocketEventMap['message']) => void
    /**
     * Callback invoked when the WebSocket closes due to an error
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/error_event}
     */
    onError?: (event: WebSocketEventMap['error']) => void
    /**
     * Callback invoked when giving up because {@link Options.maxReconnectAttempts} was exceeded.
     * @param numAttempts - The number of attempts
     */
    onReconnectStop?: (numAttempts: number) => void
    /**
     * Callback invoked immediately before the websocket attempts to connect
     * @param attemptNum - The attempt number (first attempt will be 1)
     */
    onConnectAttempt?: (attemptNum: number) => void
    /**
     * Whether to attempt to reconnect after the WebSocket is closed
     * @defaultValue `false`
     */
    shouldReconnect?: boolean | ((event: WebSocketEventMap['close']) => boolean)
    /**
     * The interval in milliseconds between reconnection attempts
     * @defaultValue `5000` (5 seconds)
     */
    reconnectInterval?: number | ((lastAttemptNumber: number) => number)
    /**
     * The maximum number of retries when connecting/reconnecting. Once this
     * limit has been exceeded, the connection will stop automatically trying
     * to connect/reconnect.
     *
     * @defaultValue `undefined` (unlimited)
     */
    maxReconnectAttempts?: number | undefined
    /**
     * Whether to reconnect after an error event
     * @defaultValue `false`
     */
    retryOnError?: boolean
    /**
     * Heartbeat behaviour. A message sent every N milliseconds
     * @defaultValue `undefined` (no heartbeats)
     */
    heartbeat?: HeartbeatOptions
    /**
     * The connection is closed after not receiving a message for
     * this many milliseconds
     *
     * @defaultValue `undefined` (no timeout)
     */
    messageTimeout?: number
}

type HeartbeatOptions = {
    /**
     * The message to send after every {@link HeartbeatOptions.interval}. If provided as a
     * function, the message will be created immediately before each send, allowing dynamic
     * properties like timestamps
     */
    message: WebSocketMessage | (() => WebSocketMessage)
    /**
     * The interval between outgoing heartbeats, in milliseconds
     */
    interval: number
}

type WebSocketMessage = BufferSource | Blob | string
```

## `useWebSocket` return value

```typescript
type WebSocketHook = {
    /**
     * Send a websocket message.
     * @param message the message to send
     * @param queueable whether the message may be queued to send when
     *   the websocket connects. Default: true
     */
    sendMessage: (message: WebSocketMessage, queueable?: boolean) => void
    /** The current connection status of the websocket */
    readyState: ReadyState
    /** Get the native websocket. May be null, if for example {@link Options.enabled} is false */
    getWebSocket: () => (WebSocket | null)
}
```

## Migrating from `react-use-websocket`

If you rely on SSE or SocketIO, then these are no longer supported.

1. Move the options:

```typescript
// old
const { ... } = useWebSocket(url, {
    queryParams: { q: "search" },
    heartbeat: { timeout: 1000, message: "ping" }
}, connect); 
// new
const { ... } = useWebSocket({
   url + `?q=search`,
   connect,
   messageTimeout: 1000, // previously heartbeat.timeout
   heartbeat: { message: "ping" }
}); 
```

2. If you *really* want `lastMessage`/`lastJsonMessage` then add a `useState` and set it yourself.
You almost certainly shouldn't actually be doing this. Do something like
`queryClient.setQueryData` with Tanstack Query inside `onMessage`.

```typescript
const [lastMessage, setLastMessage] = useState<string | null>(null);
const {/*...*/} = useWebSocket({
    url,
    onMessage: event => {
        if (typeof event.data === "string") setLastMessage(event.data);
    }
});
```

3. If you use `share: true` then move `useWebSocket` into a React context provider. Simple example:

```typescript
const WsContext = createContext<ReturnType<typeof useWebSocket> | null>(null);
function WsProvider({ children }: { children: ReactNode }) {
    const websocket =  useWebSocket({/* opts */});
    return (
        <WsContext.Provider value={websocket}>
            { children }
        </WsContext.Provider>
    )
}
```

[![Build status](https://github.com/michaelboyles/react-use-websocket-lite/actions/workflows/build.yml/badge.svg)](https://github.com/michaelboyles/react-use-websocket-lite/actions/workflows/build.yml)
[![Release version](https://img.shields.io/github/v/release/michaelboyles/react-use-websocket-lite?sort=semver)](https://github.com/michaelboyles/react-use-websocket-lite/releases)
[![MIT license](https://img.shields.io/github/license/michaelboyles/react-use-websocket-lite)](https://github.com/michaelboyles/react-use-websocket-lite/blob/develop/LICENSE)

This library is a fork of [`react-use-websocket`](https://github.com/robtaussig/react-use-websocket)
which has been stripped down to remove features that most people don't need. Mainly: SocketIO and EventSource support,
and connection sharing. See the [changelog](https://github.com/michaelboyles/react-use-websocket-lite/blob/develop/CHANGELOG.md)
for more.

There are also some bug fixes and some improvements to reduce the number of unnecessary state changes causing re-renders.

The result is (hopefully) a library that's simpler, and easier to use in a performant way.

## Usage

```text
npm install react-use-websocket-lite
# or
yarn add react-use-websocket-lite
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
    // The URL which will passed as the 1st argument of WebSocket's constructor
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#url
    url: string | (() => string | Promise<string>) | null
    // The protocols which will be passed as the 2nd argument of WebSocket's constructor
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#protocols
    protocols?: string | string[]
    // Whether to connect to the WebSocket
    // Default: true
    connect?: boolean
    // Callback invoked when the WebSocket opens
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/open_event
    onOpen?: (event: WebSocketEventMap['open']) => void
    // Callback invoked when the Websocket closes
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event
    onClose?: (event: WebSocketEventMap['close']) => void
    // Callback invoked when the WebSocket receives a message
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event
    onMessage?: (event: WebSocketEventMap['message']) => void
    // Callback invoked when the WebSocket closes due to an error
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/error_event
    onError?: (event: WebSocketEventMap['error']) => void
    // Callback invoked when giving up because `maxReconnectAttempts` was exceeded
    onReconnectStop?: (numAttempts: number) => void
    // Callback invoked when the WebSocket attempts to connect
    onConnectAttempt?: (attemptNum: number) => void
    // Whether to attempt to reconnect after the WebSocket is closed
    // Default: false
    shouldReconnect?: boolean | ((event: WebSocketEventMap['close']) => boolean)
    // The interval in milliseconds between reconnection attempts
    // Default: 5000 (5 seconds)
    reconnectInterval?: number | ((lastAttemptNumber: number) => number)
    // The maximum number of retries when connecting/reconnecting. Once this limit has been exceeded, the connection will
    // stop automatically trying to connect/reconnect.
    // Default: undefined (unlimited)
    maxReconnectAttempts?: number | undefined
    // Whether to reconnect after an error event
    // Default: false
    retryOnError?: boolean
    // Heartbeat behaviour. A message sent every N milliseconds
    // Default: no heartbeats
    heartbeat?: {
        // The message to send after every `interval`. If provided as a function, the message will be created immediately
        // before each send, allowing dynamic properties like timestamps.
        message: WebSocketMessage | (() => WebSocketMessage)
        // The interval between outgoing heartbeats, in milliseconds
        interval: number
    }
    // The connection is closed after not receiving a message for this many milliseconds
    // Default: no timeout
    messageTimeout?: number
}

type WebSocketMessage = string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView
```

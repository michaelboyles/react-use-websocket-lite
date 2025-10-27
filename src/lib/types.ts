import { ReadyState } from './constants.ts';

export type Options = {
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
    // Whether to attempt to reconnect after the WebSocket is closed
    // Default: false
    shouldReconnect?: boolean | ((event: WebSocketEventMap['close']) => boolean)
    // The interval in milliseconds between reconnection attempts
    // Default: 5000 (5 seconds)
    reconnectInterval?: number | ((lastAttemptNumber: number) => number)
    // The maximum number of retries when connecting/reconnecting. Once this limit has been exceeded, the connection will
    // stop automatically trying to connect/reconnect.
    // Default: unlimited
    maxReconnectAttempts?: number | undefined
    // Whether to reconnect after an error event
    // Default: false
    retryOnError?: boolean
    // Heartbeat behaviour. A message sent every N milli
    // Default: no heartbeats
    heartbeat?: HeartbeatOptions
    // The connection is closed after not receiving a message for this many milliseconds
    // Default: no timeout
    messageTimeout?: number
}

export type HeartbeatOptions = {
    // The message to send after every `interval`
    message: WebSocketMessage | (() => WebSocketMessage);
    // The interval between outgoing heartbeats, in milliseconds
    interval: number;
}

export type WebSocketMessage = string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView;

export type SendMessage = (message: WebSocketMessage, queueable?: boolean) => void;

export type WebSocketHook = {
    sendMessage: SendMessage,
    readyState: ReadyState,
    getWebSocket: () => (WebSocket | null),
}

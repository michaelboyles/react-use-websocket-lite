export interface Options {
    // The URL which will passed as the 1st argument of WebSocket's constructor
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#url
    url: string | null | (() => (string | Promise<string>))
    // The protocols which will be passed to the 2nd argument of WebSocket's constructor
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#protocols
    // Default: undefined
    protocols?: string | string[]
    // Whether to share the WebSocket, so that different calls to useWebSocket will share a single WebSocket instance
    // Default: false
    share?: boolean
    // Callback invoked when the WebSocket opens
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/open_event
    onOpen?(event: WebSocketEventMap['open']): void
    // Callback invoked when the Websocket closes. Behaviour differs from raw WebSocket. It will not fire if the
    // WebSocket never opened.
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event
    onClose?(event: WebSocketEventMap['close']): void
    // Callback invoked when the WebSocket receives a message.
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event
    onMessage?(event: WebSocketEventMap['message']): void
    // Callback invoked when the WebSocket closes due to an error.
    // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/error_event
    onError?(event: WebSocketEventMap['error']): void
    onReconnectStop?(numAttempts: number): void
    shouldReconnect?(event: WebSocketEventMap['close']): boolean
    reconnectInterval?: number | ((lastAttemptNumber: number) => number)
    reconnectAttempts?: number
    retryOnError?: boolean
    // The connection is closed after not receiving a message for this many milliseconds
    // Default: no timeout
    messageTimeout?: number
    // Options
    // Default: false, i.e. no heartbeat behaviour
    heartbeat?: boolean | HeartbeatOptions
}

export type HeartbeatOptions = {
    // The message to send after every `interval`
    message?: "ping" | "pong" | string | (() => string)
    // The interval between outgoing messages, in milliseconds
    interval?: number
};

export type ReadyState = "uninstantiated" | "connecting" | "open" | "closing" | "closed";

export type WebSocketMessage = Parameters<WebSocket['send']>[0];

export type SendMessage = (message: WebSocketMessage, keep?: boolean) => void;

export type WebSocketHook = {
    sendMessage: SendMessage
    readyState: ReadyState
}

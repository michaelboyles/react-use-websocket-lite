import { ReadyState } from './constants.ts';

export type Options = {
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

export type HeartbeatOptions = {
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

export type WebSocketMessage = BufferSource | Blob | string;

/**
 * Send a WebSocket message.
 * @param message - the message to send
 * @param queueable - whether the message may be queued to send when
 *   the WebSocket connects. Default: `true`
 */
export type SendMessage = (message: WebSocketMessage, queueable?: boolean) => void;

export type WebSocketHook = {
    /** Send a WebSocket message */
    sendMessage: SendMessage
    /** The current connection status of the WebSocket */
    readyState: ReadyState
    /** Get the native WebSocket. May be null, if for example {@link Options.connect} is false */
    getWebSocket: () => (WebSocket | null)
}

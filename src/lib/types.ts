export interface Options {
    url: string | null | (() => (string | Promise<string>))
    protocols?: string | string[]
    share?: boolean
    onOpen?(event: WebSocketEventMap['open']): void
    onClose?(event: WebSocketEventMap['close']): void
    onMessage?(event: WebSocketEventMap['message']): void
    onError?(event: WebSocketEventMap['error']): void
    onReconnectStop?(numAttempts: number): void
    shouldReconnect?(event: WebSocketEventMap['close']): boolean
    reconnectInterval?: number | ((lastAttemptNumber: number) => number)
    reconnectAttempts?: number
    retryOnError?: boolean
    heartbeat?: boolean | HeartbeatOptions
}

export type HeartbeatOptions = {
    message?: "ping" | "pong" | string | (() => string)
    timeout?: number
    interval?: number
};

export type ReadyState = "uninstantiated" | "connecting" | "open" | "closing" | "closed";

export type WebSocketMessage = Parameters<WebSocket['send']>[0];

export type SendMessage = (message: WebSocketMessage, keep?: boolean) => void;

export type WebSocketHook = {
    sendMessage: SendMessage
    readyState: ReadyState
}

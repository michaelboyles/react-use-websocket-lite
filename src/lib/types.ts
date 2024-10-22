import { MutableRefObject } from 'react';
import { ReadyState } from './constants';

export interface QueryParams {
    [key: string]: string | number
}

export interface Options {
    url: string | null | (() => (string | Promise<string>))
    queryParams?: QueryParams
    protocols?: string | string[]
    share?: boolean
    onOpen?: (event: WebSocketEventMap['open']) => void
    onClose?: (event: WebSocketEventMap['close']) => void
    onMessage?: (event: WebSocketEventMap['message']) => void
    onError?: (event: WebSocketEventMap['error']) => void
    onReconnectStop?: (numAttempts: number) => void
    shouldReconnect?: (event: WebSocketEventMap['close']) => boolean
    reconnectInterval?: number | ((lastAttemptNumber: number) => number)
    reconnectAttempts?: number
    retryOnError?: boolean
    heartbeat?: boolean | HeartbeatOptions
}

export type HeartbeatOptions = {
    message?: "ping" | "pong" | string | (() => string)
    returnMessage?: "ping" | "pong" | string
    timeout?: number
    interval?: number
};

export type ReadyStateState = {
    [url: string]: ReadyState
}

export type WebSocketMessage = string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView;

export type SendMessage = (message: WebSocketMessage, keep?: boolean) => void;

export type Subscriber = {
    setReadyState: (readyState: ReadyState) => void
    optionsRef: MutableRefObject<Options>
    reconnectCount: MutableRefObject<number>
    reconnect: MutableRefObject<() => void>
}

export type WebSocketHook = {
    sendMessage: SendMessage
    readyState: ReadyState
}

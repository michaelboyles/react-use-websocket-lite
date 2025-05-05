import { ReadyState } from './constants';

export interface QueryParams {
  [key: string]: string | number;
}

export interface Options {
  url: string | (() => string | Promise<string>) | null
  connect?: boolean
  queryParams?: QueryParams;
  protocols?: string | string[];
  onOpen?: (event: WebSocketEventMap['open']) => void;
  onClose?: (event: WebSocketEventMap['close']) => void;
  onMessage?: (event: WebSocketEventMap['message']) => void;
  onError?: (event: WebSocketEventMap['error']) => void;
  onReconnectStop?: (numAttempts: number) => void;
  shouldReconnect?: (event: WebSocketEventMap['close']) => boolean;
  reconnectInterval?: number | ((lastAttemptNumber: number) => number);
  reconnectAttempts?: number;
  retryOnError?: boolean;
  heartbeat?: HeartbeatOptions;
  // The connection is closed after not receiving a message for this many milliseconds
  // Default: no timeout
  messageTimeout?: number;
}

export type HeartbeatOptions = {
  message: string | (() => string);
  interval: number;
}

export type ReadyStateState = {
  [url: string]: ReadyState,
}

export type WebSocketMessage = string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView;

export type SendMessage = (message: WebSocketMessage, keep?: boolean) => void;

export type WebSocketHook = {
  sendMessage: SendMessage,
  readyState: ReadyState,
  getWebSocket: () => (WebSocket | null),
}


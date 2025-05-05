import { MutableRefObject } from 'react';
import { heartbeat } from './heartbeat';
import {
  DEFAULT_RECONNECT_LIMIT,
  DEFAULT_RECONNECT_INTERVAL_MS,
  ReadyState,
} from './constants';
import { Options } from './types';

export function attachListeners(
    webSocketInstance: WebSocket,
    setReadyState: (readyState: ReadyState) => void,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>,
): () => void {
  let markMessageReceived: () => void;

  if (optionsRef.current.heartbeat && webSocketInstance instanceof WebSocket) {
    const heartbeatOptions =
        typeof optionsRef.current.heartbeat === "boolean"
            ? undefined
            : optionsRef.current.heartbeat;
    markMessageReceived = heartbeat(webSocketInstance, heartbeatOptions);
  }

  webSocketInstance.onmessage = (message: WebSocketEventMap['message']) => {
    markMessageReceived?.();
    optionsRef.current.onMessage && optionsRef.current.onMessage(message);
  };

  webSocketInstance.onopen = (event: WebSocketEventMap['open']) => {
    optionsRef.current.onOpen && optionsRef.current.onOpen(event);
    reconnectCount.current = 0;
    setReadyState(ReadyState.OPEN);
  };

  let reconnectTimeout: number | undefined;
  webSocketInstance.onclose = (event: WebSocketEventMap['close']) => {
    optionsRef.current.onClose && optionsRef.current.onClose(event);
    setReadyState(ReadyState.CLOSED);
    if (optionsRef.current.shouldReconnect && optionsRef.current.shouldReconnect(event)) {
      reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
    }
  };

  let reconnectTimeout2: number | undefined;
  webSocketInstance.onerror = (error: WebSocketEventMap['error']) => {
    optionsRef.current.onError && optionsRef.current.onError(error);

    if (optionsRef.current.retryOnError) {
      reconnectTimeout2 = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
    }
  };

  return () => {
    setReadyState(ReadyState.CLOSING);
    reconnectTimeout && window.clearTimeout(reconnectTimeout);
    reconnectTimeout2 && window.clearTimeout(reconnectTimeout2);
    webSocketInstance.close();
  };
}

function reconnectIfBelowAttemptLimit(
    optionsRef: MutableRefObject<Options>,
    reconnectCount: MutableRefObject<number>,
    reconnect: () => void
) {
  const reconnectAttempts = optionsRef.current.reconnectAttempts ?? DEFAULT_RECONNECT_LIMIT;

  if (reconnectCount.current < reconnectAttempts) {
    const nextReconnectInterval = typeof optionsRef.current.reconnectInterval === 'function' ?
        optionsRef.current.reconnectInterval(reconnectCount.current) :
        optionsRef.current.reconnectInterval;

    return window.setTimeout(() => {
      reconnectCount.current++;
      reconnect();
    }, nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
  }
  else {
    optionsRef.current.onReconnectStop?.(reconnectAttempts);
    console.warn(`Max reconnect attempts of ${reconnectAttempts} exceeded`);
  }
}

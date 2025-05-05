import { MutableRefObject } from 'react';
import { heartbeat } from './heartbeat';
import {
  DEFAULT_RECONNECT_LIMIT,
  DEFAULT_RECONNECT_INTERVAL_MS,
  ReadyState,
} from './constants';
import { Options } from './types';

const bindMessageHandler = (
  webSocketInstance: WebSocket,
  optionsRef: MutableRefObject<Options>,
) => {
  let heartbeatCb: () => void;

  if (optionsRef.current.heartbeat && webSocketInstance instanceof WebSocket) {
    const heartbeatOptions =
      typeof optionsRef.current.heartbeat === "boolean"
        ? undefined
        : optionsRef.current.heartbeat;
    heartbeatCb = heartbeat(webSocketInstance, heartbeatOptions);
  }

  webSocketInstance.onmessage = (message: WebSocketEventMap['message']) => {
    heartbeatCb?.();
    optionsRef.current.onMessage && optionsRef.current.onMessage(message);
  };
};

const bindOpenHandler = (
  webSocketInstance: WebSocket,
  optionsRef: MutableRefObject<Options>,
  setReadyState: (readyState: ReadyState) => void,
  reconnectCount: MutableRefObject<number>,
) => {
  webSocketInstance.onopen = (event: WebSocketEventMap['open']) => {
    optionsRef.current.onOpen && optionsRef.current.onOpen(event);
    reconnectCount.current = 0;
    setReadyState(ReadyState.OPEN);
  };
};

const bindCloseHandler = (
  webSocketInstance: WebSocket,
  optionsRef: MutableRefObject<Options>,
  setReadyState: (readyState: ReadyState) => void,
  reconnect: () => void,
  reconnectCount: MutableRefObject<number>,
) => {
  let reconnectTimeout: number | undefined;

  webSocketInstance.onclose = (event: WebSocketEventMap['close']) => {
    optionsRef.current.onClose && optionsRef.current.onClose(event);
    setReadyState(ReadyState.CLOSED);
    if (optionsRef.current.shouldReconnect && optionsRef.current.shouldReconnect(event)) {
      reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
    }
  };

  return () => reconnectTimeout && window.clearTimeout(reconnectTimeout);
};

const bindErrorHandler = (
  webSocketInstance: WebSocket,
  optionsRef: MutableRefObject<Options>,
  reconnect: () => void,
  reconnectCount: MutableRefObject<number>,
) => {
  let reconnectTimeout: number | undefined;

  webSocketInstance.onerror = (error: WebSocketEventMap['error']) => {
    optionsRef.current.onError && optionsRef.current.onError(error);

    if (optionsRef.current.retryOnError) {
      reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
    }
  };

  return () => reconnectTimeout && window.clearTimeout(reconnectTimeout);
};

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

export const attachListeners = (
    webSocketInstance: WebSocket,
    setReadyState: (readyState: ReadyState) => void,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>,
  ): (() => void) => {

  let cancelReconnectOnClose: () => void;
  let cancelReconnectOnError: () => void;

  bindMessageHandler(
    webSocketInstance,
    optionsRef,
  );

  bindOpenHandler(
    webSocketInstance,
    optionsRef,
    setReadyState,
    reconnectCount,
  );

  cancelReconnectOnClose = bindCloseHandler(
    webSocketInstance,
    optionsRef,
    setReadyState,
    reconnect,
    reconnectCount,
  );

  cancelReconnectOnError = bindErrorHandler(
    webSocketInstance,
    optionsRef,
    reconnect,
    reconnectCount,
  );

  return () => {
    setReadyState(ReadyState.CLOSING);
    cancelReconnectOnClose();
    cancelReconnectOnError();
    webSocketInstance.close();
  };
};

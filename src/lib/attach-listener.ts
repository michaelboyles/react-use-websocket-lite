import { MutableRefObject, RefObject } from 'react';
import {
  DEFAULT_RECONNECT_LIMIT,
  DEFAULT_RECONNECT_INTERVAL_MS,
  ReadyState, DEFAULT_HEARTBEAT,
} from './constants';
import { HeartbeatOptions, Options } from './types';

export function attachListeners(
    webSocketInstance: WebSocket,
    setReadyState: (readyState: ReadyState) => void,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>,
): () => void {
  let messageTimeoutMonitor: MessageTimeoutMonitor | undefined;

  if (optionsRef.current.heartbeat) {
    const heartbeatOptions =
        typeof optionsRef.current.heartbeat === "boolean"
            ? undefined
            : optionsRef.current.heartbeat;
    heartbeat(webSocketInstance, heartbeatOptions);
  }

  webSocketInstance.onmessage = message => {
    messageTimeoutMonitor?.markMessageReceived();
    optionsRef.current.onMessage?.(message);
  };

  webSocketInstance.onopen = event => {
    optionsRef.current.onOpen?.(event);
    reconnectCount.current = 0;
    setReadyState(ReadyState.OPEN);
    messageTimeoutMonitor = startMessageTimeoutMonitor(webSocketInstance, optionsRef);
  };

  let reconnectTimeout: number | undefined;
  webSocketInstance.onclose = event => {
    optionsRef.current.onClose?.(event);
    setReadyState(ReadyState.CLOSED);
    if (optionsRef.current.shouldReconnect?.(event)) {
      reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
    }
    messageTimeoutMonitor?.stop();
  };

  let reconnectTimeout2: number | undefined;
  webSocketInstance.onerror = error => {
    optionsRef.current.onError?.(error);

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

function heartbeat(ws: WebSocket, options?: HeartbeatOptions) {
  const {
    interval = DEFAULT_HEARTBEAT.interval,
    message = DEFAULT_HEARTBEAT.message,
  } = options || {};

  const pingTimer = setInterval(() => {
    try {
      if (typeof message === 'function') {
        ws.send(message());
      } else {
        ws.send(message);
      }
    } catch (error) {
      // do nothing
    }
  }, interval);

  ws.addEventListener("close", () => {
    clearInterval(pingTimer);
  });
}

type MessageTimeoutMonitor = {
  markMessageReceived: () => void
  stop: () => void
}

function startMessageTimeoutMonitor(websocket: WebSocket, opts: RefObject<Options>) {
  function resetTimeout() {
    const nextTimeout = opts.current?.messageTimeout;
    if (!nextTimeout || nextTimeout < 0) return;
    return setTimeout(() => {
      if (websocket.readyState !== WebSocket.CLOSED) {
        console.log(`Closed websocket because no messages received for ${nextTimeout}ms`)
        websocket.close();
      }
    }, nextTimeout);
  }
  let taskId = resetTimeout();

  websocket.addEventListener("close", () => clearInterval(taskId));
  return {
    markMessageReceived: () => {
      clearTimeout(taskId);
      taskId = resetTimeout();
    },
    stop: () => {
      clearTimeout(taskId);
    }
  }
}

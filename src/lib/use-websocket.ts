import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_RECONNECT_INTERVAL_MS, DEFAULT_RECONNECT_LIMIT, ReadyState } from './constants';
import { createOrJoinSocket } from './create-or-join';
import { Options, ReadyStateState, SendMessage, WebSocketHook, WebSocketMessage, } from './types';

export const useWebSocket = (options: Options): WebSocketHook => {
  const { url, connect = true } = options;

  const [readyState, setReadyState] = useState<ReadyStateState>({});
  const convertedUrl = useRef<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const startRef = useRef<() => void>(() => void 0);
  const reconnectCount = useRef<number>(0);
  const messageQueue = useRef<WebSocketMessage[]>([]);
  const optionsCache = useRef<Options>(options);
  optionsCache.current = options;

  const readyStateFromUrl: ReadyState =
    convertedUrl.current && readyState[convertedUrl.current] !== undefined ?
      readyState[convertedUrl.current] :
      url !== null && connect === true ?
        ReadyState.CONNECTING :
        ReadyState.UNINSTANTIATED;

  const sendMessage: SendMessage = useCallback((message, keep = true) => {
    if (webSocketRef.current?.readyState === ReadyState.OPEN) {
      webSocketRef.current.send(message);
    } else if (keep) {
      messageQueue.current.push(message);
    }
  }, []);

  const getWebSocket = useCallback(() => {
    return webSocketRef.current;
  }, []);

  useEffect(() => {
    if (url !== null && connect === true) {
      let removeListeners: () => void;
      let expectClose = false;
      let createOrJoin = true;

      const start = async () => {
        convertedUrl.current = await getUrl(url, optionsCache);

        if (convertedUrl.current === null) {
          console.error('Failed to get a valid URL. WebSocket connection aborted.');
          convertedUrl.current = 'ABORTED';
          flushSync(() => setReadyState(prev => ({
            ...prev,
            ABORTED: ReadyState.CLOSED,
          })));

          return;
        }
  
        const protectedSetReadyState = (state: ReadyState) => {
          if (!expectClose) {
            flushSync(() => setReadyState(prev => {
              if (convertedUrl.current && prev[convertedUrl.current] !== state) {
                return { ...prev, [convertedUrl.current]: state };
              }
              return prev;
            }));
          }
        };

        if(createOrJoin) {
          removeListeners = createOrJoinSocket(
            webSocketRef,
            convertedUrl.current,
            protectedSetReadyState,
            optionsCache,
            startRef,
            reconnectCount,
          );
        }
      };

      startRef.current = () => {
        if (!expectClose) {
          removeListeners?.();
          start();
        }
      };

      start();
      return () => {
        expectClose = true;
        createOrJoin = false;
        removeListeners?.();
      };
    } else if (url === null || connect === false) {
      reconnectCount.current = 0; // reset reconnection attempts
      setReadyState(prev => {
        if (convertedUrl.current && prev[convertedUrl.current] !== ReadyState.CLOSED) {
          return { ...prev, [convertedUrl.current]: ReadyState.CLOSED }
        }
        return prev;
      });
    }
  }, [url, connect, sendMessage]);

  useEffect(() => {
    if (readyStateFromUrl === ReadyState.OPEN) {
      messageQueue.current.splice(0).forEach(message => {
        sendMessage(message);
      });
    }
  }, [readyStateFromUrl]);

  return {
    sendMessage,
    readyState: readyStateFromUrl,
    getWebSocket,
  };
};

async function getUrl(
    url: string | (() => string | Promise<string>),
    optionsRef: MutableRefObject<Options>,
    retriedAttempts: number = 0,
): Promise<string | null> {
  if (typeof url === "string") return url;
  try {
    return await url();
  }
  catch (e) {
    if (optionsRef.current.retryOnError) {
      const reconnectLimit = optionsRef.current.reconnectAttempts ?? DEFAULT_RECONNECT_LIMIT;
      if (retriedAttempts < reconnectLimit) {
        const nextReconnectInterval = typeof optionsRef.current.reconnectInterval === 'function' ?
            optionsRef.current.reconnectInterval(retriedAttempts) :
            optionsRef.current.reconnectInterval;

        await waitFor(nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
        return getUrl(url, optionsRef, retriedAttempts + 1);
      }
      else {
        optionsRef.current.onReconnectStop?.(retriedAttempts);
        return null;
      }
    }
  }
  return null;
};

function waitFor(duration: number) {
  return new Promise(resolve => window.setTimeout(resolve, duration));
}

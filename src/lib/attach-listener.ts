import { MutableRefObject } from 'react';
import { heartbeat } from './heartbeat';
import {
    DEFAULT_RECONNECT_LIMIT,
    DEFAULT_RECONNECT_INTERVAL_MS,
    ReadyState,
} from './constants';
import { Options } from './types';

type SetReadyState = (readyState: ReadyState) => void;

export function attachListeners(
    websocket: WebSocket,
    setReadyState: SetReadyState,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>
): () => void {
    bindMessageHandler(websocket, optionsRef);
    bindOpenHandler(websocket, optionsRef, setReadyState, reconnectCount);
    const cancelReconnectOnClose = bindCloseHandler(websocket, optionsRef, setReadyState, reconnect, reconnectCount);
    const cancelReconnectOnError = bindErrorHandler(websocket, optionsRef, reconnect, reconnectCount);

    return () => {
        setReadyState("closing");
        cancelReconnectOnClose();
        cancelReconnectOnError();
        websocket.close();
    };
}

function bindMessageHandler(websocket: WebSocket, optionsRef: MutableRefObject<Options>) {
    let heartbeatCb: () => void;

    const heartbeatOpts = optionsRef.current.heartbeat;
    if (heartbeatOpts) {
        const heartbeatOptions = typeof heartbeatOpts === "boolean" ? undefined : heartbeatOpts;
        heartbeatCb = heartbeat(websocket, heartbeatOptions);
    }
    websocket.onmessage = message => {
        heartbeatCb?.();
        optionsRef.current.onMessage && optionsRef.current.onMessage(message);
    };
}

function bindOpenHandler(
    websocket: WebSocket,
    optionsRef: MutableRefObject<Options>,
    setReadyState: SetReadyState,
    reconnectCount: MutableRefObject<number>,
) {
    websocket.onopen = event => {
        optionsRef.current.onOpen?.(event);
        reconnectCount.current = 0;
        setReadyState("open");
    };
}

function bindCloseHandler(
    websocket: WebSocket,
    optionsRef: MutableRefObject<Options>,
    setReadyState: SetReadyState,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>,
) {
    let reconnectTimeout: number;

    websocket.onclose = event => {
        optionsRef.current.onClose && optionsRef.current.onClose(event);
        setReadyState("closed");
        if (optionsRef.current.shouldReconnect && optionsRef.current.shouldReconnect(event)) {
            const reconnectAttempts = optionsRef.current.reconnectAttempts ?? DEFAULT_RECONNECT_LIMIT;
            if (reconnectCount.current < reconnectAttempts) {
                const nextReconnectInterval = typeof optionsRef.current.reconnectInterval === 'function' ?
                    optionsRef.current.reconnectInterval(reconnectCount.current) :
                    optionsRef.current.reconnectInterval;

                reconnectTimeout = window.setTimeout(() => {
                    reconnectCount.current++;
                    reconnect();
                }, nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
            } else {
                optionsRef.current.onReconnectStop && optionsRef.current.onReconnectStop(reconnectAttempts);
                console.warn(`Max reconnect attempts of ${reconnectAttempts} exceeded`);
            }
        }
    };
    return () => reconnectTimeout && window.clearTimeout(reconnectTimeout);
}

function bindErrorHandler(
    websocket: WebSocket,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>,
) {
    let reconnectTimeout: number;

    websocket.onerror = error => {
        optionsRef.current.onError?.(error);

        if (optionsRef.current.retryOnError) {
            const reconnectAttempts = optionsRef.current.reconnectAttempts ?? DEFAULT_RECONNECT_LIMIT;
            if (reconnectCount.current < reconnectAttempts) {
                const nextReconnectInterval = typeof optionsRef.current.reconnectInterval === 'function' ?
                    optionsRef.current.reconnectInterval(reconnectCount.current) :
                    optionsRef.current.reconnectInterval;

                reconnectTimeout = window.setTimeout(() => {
                    reconnectCount.current++;
                    reconnect();
                }, nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
            }
            else {
                optionsRef.current.onReconnectStop && optionsRef.current.onReconnectStop(reconnectAttempts);
                console.warn(`Max reconnect attempts of ${reconnectAttempts} exceeded`);
            }
        }
    };
    return () => reconnectTimeout && window.clearTimeout(reconnectTimeout);
}

import { MutableRefObject } from 'react';
import { heartbeat } from './heartbeat';
import {
    DEFAULT_RECONNECT_LIMIT,
    DEFAULT_RECONNECT_INTERVAL_MS,
    ReadyState,
} from './constants';
import { Options } from './types';
import { assertIsWebSocket } from './util';

type SetReadyState = (readyState: ReadyState) => void;

function bindMessageHandler(websocket: WebSocket, optionsRef: MutableRefObject<Options>) {
    let heartbeatCb: () => void;

    if (optionsRef.current.heartbeat && websocket instanceof WebSocket) {
        const heartbeatOptions =
            typeof optionsRef.current.heartbeat === "boolean"
                ? undefined
                : optionsRef.current.heartbeat;
        heartbeatCb = heartbeat(websocket, heartbeatOptions);
    }

    websocket.onmessage = (message: WebSocketEventMap['message']) => {
        heartbeatCb?.();
        optionsRef.current.onMessage && optionsRef.current.onMessage(message);
    };
}

function bindOpenHandler(
    webSocketInstance: WebSocket,
    optionsRef: MutableRefObject<Options>,
    setReadyState: SetReadyState,
    reconnectCount: MutableRefObject<number>,
) {
    webSocketInstance.onopen = (event: WebSocketEventMap['open']) => {
        optionsRef.current.onOpen && optionsRef.current.onOpen(event);
        reconnectCount.current = 0;
        setReadyState(ReadyState.OPEN);
    };
}

function bindCloseHandler(
    webSocketInstance: WebSocket,
    optionsRef: MutableRefObject<Options>,
    setReadyState: SetReadyState,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>,
) {
    assertIsWebSocket(webSocketInstance, optionsRef.current.skipAssert);
    let reconnectTimeout: number;

    webSocketInstance.onclose = (event: WebSocketEventMap['close']) => {
        optionsRef.current.onClose && optionsRef.current.onClose(event);
        setReadyState(ReadyState.CLOSED);
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
    webSocketInstance: WebSocket,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>,
) {
    let reconnectTimeout: number;

    webSocketInstance.onerror = (error: WebSocketEventMap['error']) => {
        optionsRef.current.onError && optionsRef.current.onError(error);

        if (optionsRef.current.retryOnError) {
            if (reconnectCount.current < (optionsRef.current.reconnectAttempts ?? DEFAULT_RECONNECT_LIMIT)) {
                const nextReconnectInterval = typeof optionsRef.current.reconnectInterval === 'function' ?
                    optionsRef.current.reconnectInterval(reconnectCount.current) :
                    optionsRef.current.reconnectInterval;

                reconnectTimeout = window.setTimeout(() => {
                    reconnectCount.current++;
                    reconnect();
                }, nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
            }
            else {
                optionsRef.current.onReconnectStop && optionsRef.current.onReconnectStop(optionsRef.current.reconnectAttempts as number);
                console.warn(`Max reconnect attempts of ${optionsRef.current.reconnectAttempts} exceeded`);
            }
        }
    };
    return () => reconnectTimeout && window.clearTimeout(reconnectTimeout);
}

export function attachListeners(
    webSocketInstance: WebSocket,
    setReadyState: SetReadyState,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>
): () => void {
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
}

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
    let didOpen = false;
    let reconnectTimeout: number | undefined;

    bindMessageHandler(websocket, optionsRef);

    websocket.onopen = event => {
        didOpen = true;
        optionsRef.current.onOpen?.(event);
        reconnectCount.current = 0;
        setReadyState("open");

        websocket.onclose = event => {
            optionsRef.current.onClose?.(event);
            if (reconnectTimeout === undefined && optionsRef.current.shouldReconnect?.(event)) {
                reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef.current, reconnectCount.current, () => {
                    reconnectCount.current++;
                    reconnect();
                });
            }
        };
    };

    websocket.onerror = error => {
        optionsRef.current.onError?.(error);

        if (reconnectTimeout === undefined && optionsRef.current.retryOnError) {
            reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef.current, reconnectCount.current, () => {
                reconnectCount.current++;
                reconnect();
            });
        }
    };

    return () => {
        if (didOpen && websocket.readyState !== WebSocket.CLOSED) {
            setReadyState("closing");
            websocket.close();
        }
        if (reconnectTimeout !== undefined) {
            window.clearTimeout(reconnectTimeout);
            reconnectTimeout = undefined;
        }
    };
}

function bindMessageHandler(websocket: WebSocket, optionsRef: MutableRefObject<Options>) {
    let markMessageReceived: () => void = () => {};

    const heartbeatOpts = optionsRef.current.heartbeat;
    if (heartbeatOpts) {
        const heartbeatOptions = typeof heartbeatOpts === "boolean" ? undefined : heartbeatOpts;
        markMessageReceived = heartbeat(websocket, heartbeatOptions);
    }
    websocket.onmessage = message => {
        markMessageReceived();
        optionsRef.current.onMessage?.(message);
    };
}

function reconnectIfBelowAttemptLimit(options: Options, reconnectCount: number, reconnect: () => void) {
    const reconnectAttempts = options.reconnectAttempts ?? DEFAULT_RECONNECT_LIMIT;
    if (reconnectCount >= reconnectAttempts) {
        options.onReconnectStop?.(reconnectAttempts);
        console.warn(`Max reconnect attempts of ${reconnectAttempts} exceeded`);
        return;
    }

    const nextReconnectInterval = typeof options.reconnectInterval === 'function' ?
        options.reconnectInterval(reconnectCount) :
        options.reconnectInterval;
    return window.setTimeout(reconnect, nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
}

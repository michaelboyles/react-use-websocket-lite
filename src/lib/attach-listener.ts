import { MutableRefObject, RefObject } from 'react';
import { DEFAULT_RECONNECT_INTERVAL_MS, ReadyState } from './constants';
import { Options } from './types';

export function attachListeners(
    websocket: WebSocket,
    setReadyState: (readyState: ReadyState) => void,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>,
): () => void {
    let didOpen = false;
    let messageTimeoutMonitor: MessageTimeoutMonitor | undefined;
    let reconnectTimeout: number | undefined;

    websocket.addEventListener("message", message => {
        messageTimeoutMonitor?.markMessageReceived();
        optionsRef.current.onMessage?.(message);
    });

    websocket.addEventListener("open", event => {
        didOpen = true;
        reconnectCount.current = 0;
        setReadyState(ReadyState.OPEN);
        messageTimeoutMonitor = startMessageTimeoutMonitor(websocket, optionsRef);
        startHeartbeats(websocket, optionsRef);
        optionsRef.current.onOpen?.(event);
    });

    websocket.addEventListener("close", event => {
        if (reconnectTimeout === undefined) {
            const shouldReconnect = optionsRef.current.shouldReconnect;
            if (shouldReconnect === true || typeof shouldReconnect === "function" && shouldReconnect(event)) {
                reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
            }
        }
        if (reconnectTimeout) {
            setReadyState(ReadyState.CONNECTING)
        }
        else {
            setReadyState(ReadyState.CLOSED);
        }
        messageTimeoutMonitor?.stop();
        optionsRef.current.onClose?.(event);
    });

    websocket.addEventListener("error", error => {
        if (reconnectTimeout === undefined && optionsRef.current.retryOnError) {
            reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
        }
        optionsRef.current.onError?.(error);
    });

    return () => {
        if (reconnectTimeout !== undefined) {
            window.clearTimeout(reconnectTimeout);
            reconnectTimeout = undefined;
        }
        if (didOpen) {
            setReadyState(ReadyState.CLOSING);
            websocket.close();
        }
    };
}

function reconnectIfBelowAttemptLimit(
    optionsRef: MutableRefObject<Options>,
    reconnectCount: MutableRefObject<number>,
    reconnect: () => void
) {
    const maxReconnectAttempts = optionsRef.current.maxReconnectAttempts;

    if (!maxReconnectAttempts || reconnectCount.current < maxReconnectAttempts) {
        const nextReconnectInterval = typeof optionsRef.current.reconnectInterval === 'function' ?
            optionsRef.current.reconnectInterval(reconnectCount.current) :
            optionsRef.current.reconnectInterval;

        return window.setTimeout(() => {
            reconnectCount.current++;
            reconnect();
        }, nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
    }
    else {
        optionsRef.current.onReconnectStop?.(maxReconnectAttempts);
        console.warn(`Max reconnect attempts of ${maxReconnectAttempts} exceeded`);
    }
}

function startHeartbeats(ws: WebSocket, options: RefObject<Options>) {
    let timeout: number | undefined;

    function scheduleNextHeartbeat() {
        const interval = options.current?.heartbeat?.interval;
        if (!interval) return;
        timeout = setTimeout(() => {
            try {
                const message = options?.current?.heartbeat?.message;
                if (message) {
                    if (typeof message === 'function') {
                        ws.send(message());
                    }
                    else {
                        ws.send(message);
                    }
                }
            }
            catch (error) {
                // do nothing
            }
            scheduleNextHeartbeat();
        }, interval);
    }

    scheduleNextHeartbeat();

    ws.addEventListener("close", () => {
        clearInterval(timeout);
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

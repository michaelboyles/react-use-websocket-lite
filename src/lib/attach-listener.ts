import { RefObject } from 'react';
import { DEFAULT_RECONNECT_INTERVAL_MS, ReadyState } from './constants.ts';
import type { Options } from './types.ts';

export function attachListeners(
    websocket: WebSocket,
    setReadyState: (readyState: ReadyState) => void,
    optionsRef: RefObject<Options>,
    reconnect: () => void,
    reconnectCount: RefObject<number>,
): () => void {
    let didOpen = false;
    let messageTimeoutMonitor: MessageTimeoutMonitor | undefined;
    let heartbeatTask: HeartbeatTask | undefined;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

    websocket.addEventListener("message", message => {
        messageTimeoutMonitor?.markMessageReceived();
        optionsRef.current.onMessage?.(message);
    });

    websocket.addEventListener("open", event => {
        didOpen = true;
        reconnectCount.current = 0;
        setReadyState(ReadyState.OPEN);
        messageTimeoutMonitor = startMessageTimeoutMonitor(websocket, optionsRef, setReadyState);
        heartbeatTask = startHeartbeats(websocket, optionsRef);
        optionsRef.current.onOpen?.(event);
    });

    websocket.addEventListener("close", event => {
        messageTimeoutMonitor?.stop();
        heartbeatTask?.stop();
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
            clearTimeout(reconnectTimeout);
            reconnectTimeout = undefined;
        }
        if (didOpen) {
            setReadyState(ReadyState.CLOSING);
            websocket.close();
        }
    };
}

function reconnectIfBelowAttemptLimit(
    optionsRef: RefObject<Options>,
    reconnectCount: RefObject<number>,
    reconnect: () => void
) {
    const maxReconnectAttempts = optionsRef.current.maxReconnectAttempts;

    if (!maxReconnectAttempts || reconnectCount.current < maxReconnectAttempts) {
        const nextReconnectInterval = typeof optionsRef.current.reconnectInterval === 'function' ?
            optionsRef.current.reconnectInterval(reconnectCount.current) :
            optionsRef.current.reconnectInterval;

        return setTimeout(() => reconnect(), nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
    }
    else {
        optionsRef.current.onReconnectStop?.(maxReconnectAttempts);
        console.warn(`Max reconnect attempts of ${maxReconnectAttempts} exceeded`);
    }
}

function startHeartbeats(ws: WebSocket, options: RefObject<Options>): HeartbeatTask {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    function scheduleNextHeartbeat() {
        const interval = options.current?.heartbeat?.interval;
        if (!interval) return;
        timeout = setTimeout(() => {
            if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) return;
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
            catch {
                // do nothing
            }
            scheduleNextHeartbeat();
        }, interval);
    }

    scheduleNextHeartbeat();

    return {
        stop: () => clearTimeout(timeout)
    }
}

type HeartbeatTask = {
    stop: () => void
}

type MessageTimeoutMonitor = {
    markMessageReceived: () => void
    stop: () => void
}

function startMessageTimeoutMonitor(
    websocket: WebSocket,
    opts: RefObject<Options>,
    setReadyState: (readyState: ReadyState) => void
) {
    function resetTimeout() {
        const nextTimeout = opts.current?.messageTimeout;
        if (!nextTimeout || nextTimeout < 0) return;
        return setTimeout(() => {
            if (websocket.readyState !== WebSocket.CLOSING && websocket.readyState !== WebSocket.CLOSED) {
                console.log(`Closed websocket because no messages received for ${nextTimeout}ms`);
                setReadyState(ReadyState.CLOSING);
                websocket.close();
            }
        }, nextTimeout);
    }

    let taskId = resetTimeout();

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

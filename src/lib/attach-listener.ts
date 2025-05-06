import { MutableRefObject, RefObject } from 'react';
import { DEFAULT_RECONNECT_INTERVAL_MS, ReadyState } from './constants';
import { Options } from './types';

export function attachListeners(
    webSocketInstance: WebSocket,
    setReadyState: (readyState: ReadyState) => void,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>,
): () => void {
    let messageTimeoutMonitor: MessageTimeoutMonitor | undefined;
    let reconnectTimeout: number | undefined;

    webSocketInstance.onmessage = message => {
        messageTimeoutMonitor?.markMessageReceived();
        optionsRef.current.onMessage?.(message);
    };

    webSocketInstance.onopen = event => {
        optionsRef.current.onOpen?.(event);
        reconnectCount.current = 0;
        setReadyState(ReadyState.OPEN);
        messageTimeoutMonitor = startMessageTimeoutMonitor(webSocketInstance, optionsRef);
        startHeartbeats(webSocketInstance, optionsRef);
    };

    webSocketInstance.onclose = event => {
        optionsRef.current.onClose?.(event);
        setReadyState(ReadyState.CLOSED);
        if (reconnectTimeout === undefined && optionsRef.current.shouldReconnect?.(event)) {
            reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
        }
        messageTimeoutMonitor?.stop();
    };

    webSocketInstance.onerror = error => {
        optionsRef.current.onError?.(error);

        if (reconnectTimeout === undefined && optionsRef.current.retryOnError) {
            reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
        }
    };

    return () => {
        setReadyState(ReadyState.CLOSING);
        if (reconnectTimeout !== undefined) {
            window.clearTimeout(reconnectTimeout);
            reconnectTimeout = undefined;
        }
        webSocketInstance.close();
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

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
    let connectionLost = false;
    let messageTimeoutMonitor: MessageTimeoutMonitor | undefined;
    let heartbeatMonitor: StopMonitor | undefined;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

    const handleConnectionLoss = () => {
        if (connectionLost) return;
        connectionLost = true;

        heartbeatMonitor?.stop();
        messageTimeoutMonitor?.stop();

        if (reconnectTimeout === undefined && optionsRef.current.shouldReconnect === true) {
            reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
        }

        setReadyState(reconnectTimeout ? ReadyState.CONNECTING : ReadyState.CLOSING);

        if (websocket.readyState !== WebSocket.CLOSING && websocket.readyState !== WebSocket.CLOSED) {
            websocket.close();
        }
    };

    websocket.addEventListener("message", message => {
        messageTimeoutMonitor?.markMessageReceived();
        optionsRef.current.onMessage?.(message);
    });

    websocket.addEventListener("open", event => {
        didOpen = true;
        connectionLost = false;
        reconnectCount.current = 0;
        setReadyState(ReadyState.OPEN);
        messageTimeoutMonitor = startMessageTimeoutMonitor(websocket, optionsRef, handleConnectionLoss);
        heartbeatMonitor = startHeartbeats(websocket, optionsRef);
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
        heartbeatMonitor?.stop();
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
            clearTimeout(reconnectTimeout);
            reconnectTimeout = undefined;
        }
        heartbeatMonitor?.stop();
        messageTimeoutMonitor?.stop();
        if (didOpen && !connectionLost) {
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

        return setTimeout(() => {
            reconnectCount.current++;
            reconnect();
        }, nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
    }
    else {
        optionsRef.current.onReconnectStop?.(maxReconnectAttempts);
        console.warn(`Max reconnect attempts of ${maxReconnectAttempts} exceeded`);
    }
}

function startHeartbeats(
    ws: WebSocket,
    options: RefObject<Options>,
): StopMonitor {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const stop = () => {
        stopped = true;
        clearTimeout(timeout);
        timeout = undefined;
    };

    function scheduleNextHeartbeat() {
        if (stopped) return;
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
            catch {
                // do nothing
            }
            scheduleNextHeartbeat();
        }, interval);
    }

    scheduleNextHeartbeat();

    ws.addEventListener("close", stop);
    return { stop };
}

type StopMonitor = {
    stop: () => void
}

type MessageTimeoutMonitor = StopMonitor & {
    markMessageReceived: () => void
};

function startMessageTimeoutMonitor(
    websocket: WebSocket,
    opts: RefObject<Options>,
    onConnectionLost: () => void,
): MessageTimeoutMonitor {
    function resetTimeout() {
        const nextTimeout = opts.current?.messageTimeout;
        if (!nextTimeout || nextTimeout < 0) return;
        return setTimeout(() => {
            if (websocket.readyState !== WebSocket.CLOSED && websocket.readyState !== WebSocket.CLOSING) {
                console.log(`Closed websocket because no messages received for ${nextTimeout}ms`)
                onConnectionLost();
            }
        }, nextTimeout);
    }

    let taskId = resetTimeout();

    websocket.addEventListener("close", () => clearTimeout(taskId));
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

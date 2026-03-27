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
    let listenersAttached = true;
    let messageTimeoutMonitor: MessageTimeoutMonitor | undefined;
    let heartbeatMonitor: StopMonitor | undefined;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

    const stopMonitors = () => {
        heartbeatMonitor?.stop();
        messageTimeoutMonitor?.stop();
    };

    const handleConnectionLoss = () => {
        if (!listenersAttached || connectionLost) return;
        connectionLost = true;

        removeNonCloseEventListeners();
        stopMonitors();

        if (reconnectTimeout === undefined && optionsRef.current.shouldReconnect === true) {
            reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
        }

        setReadyState(reconnectTimeout ? ReadyState.CONNECTING : ReadyState.CLOSING);

        if (websocket.readyState !== WebSocket.CLOSING && websocket.readyState !== WebSocket.CLOSED) {
            websocket.close();
        }
    };

    const handleMessage = (message: MessageEvent) => {
        if (!listenersAttached || connectionLost) return;
        messageTimeoutMonitor?.markMessageReceived();
        optionsRef.current.onMessage?.(message);
    };

    const handleOpen = (event: Event) => {
        if (!listenersAttached) return;
        didOpen = true;
        connectionLost = false;
        reconnectCount.current = 0;
        setReadyState(ReadyState.OPEN);
        messageTimeoutMonitor = startMessageTimeoutMonitor(websocket, optionsRef, handleConnectionLoss);
        heartbeatMonitor = startHeartbeats(websocket, optionsRef);
        optionsRef.current.onOpen?.(event);
    };

    const handleClose = (event: CloseEvent) => {
        if (!listenersAttached) return;

        removeEventListeners();
        stopMonitors();

        if (reconnectTimeout === undefined) {
            const shouldReconnect = optionsRef.current.shouldReconnect;
            if (shouldReconnect === true || typeof shouldReconnect === "function" && shouldReconnect(event)) {
                reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
            }
        }

        setReadyState(reconnectTimeout ? ReadyState.CONNECTING : ReadyState.CLOSED);
        optionsRef.current.onClose?.(event);
    };

    const handleError = (error: Event) => {
        if (!listenersAttached || connectionLost) return;
        if (reconnectTimeout === undefined && optionsRef.current.retryOnError) {
            reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef, reconnectCount, reconnect);
        }
        optionsRef.current.onError?.(error);
    };

    const removeNonCloseEventListeners = () => {
        websocket.removeEventListener("message", handleMessage);
        websocket.removeEventListener("open", handleOpen);
        websocket.removeEventListener("error", handleError);
    };

    const removeEventListeners = () => {
        if (!listenersAttached) return;
        listenersAttached = false;

        removeNonCloseEventListeners();
        websocket.removeEventListener("close", handleClose);
    };

    websocket.addEventListener("message", handleMessage);
    websocket.addEventListener("open", handleOpen);
    websocket.addEventListener("close", handleClose);
    websocket.addEventListener("error", handleError);

    return () => {
        if (reconnectTimeout !== undefined) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = undefined;
        }
        removeEventListeners();
        stopMonitors();
        if (didOpen && websocket.readyState === WebSocket.OPEN && !connectionLost) {
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
    const handleClose = () => {
        stop();
    };

    const stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timeout);
        timeout = undefined;
        ws.removeEventListener("close", handleClose);
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

    ws.addEventListener("close", handleClose);
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
    let stopped = false;
    const handleClose = () => {
        clearTimeout(taskId);
    };

    websocket.addEventListener("close", handleClose);
    return {
        markMessageReceived: () => {
            if (stopped) return;
            clearTimeout(taskId);
            taskId = resetTimeout();
        },
        stop: () => {
            if (stopped) return;
            stopped = true;
            clearTimeout(taskId);
            websocket.removeEventListener("close", handleClose);
        }
    }
}

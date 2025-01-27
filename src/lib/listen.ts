import { MutableRefObject } from 'react';
import { DEFAULT_RECONNECT_INTERVAL_MS, DEFAULT_RECONNECT_LIMIT } from './constants';
import { HeartbeatOptions, Options, ReadyState } from './types';

const DEFAULT_MESSAGE_TIMEOUT = 60_000;
const DEFAULT_HEARTBEAT_INTERVAL = 25_000;
const DEFAULT_HEARTBEAT_MESSAGE = "ping";

export function attachListeners(
    websocket: WebSocket,
    setReadyState: (readyState: ReadyState) => void,
    optionsRef: MutableRefObject<Options>,
    reconnect: () => void,
    reconnectCount: MutableRefObject<number>
): () => void {
    let didOpen = false;
    let reconnectTimeout: number | undefined;

    const messageTimeout = optionsRef.current.messageTimeout;
    const heartbeatOpts = optionsRef.current.heartbeat;

    websocket.onopen = event => {
        didOpen = true;
        optionsRef.current.onOpen?.(event);
        reconnectCount.current = 0;
        setReadyState("open");

        websocket.onclose = event => {
            if (reconnectTimeout === undefined && optionsRef.current.shouldReconnect?.(event)) {
                reconnectTimeout = reconnectIfBelowAttemptLimit(optionsRef.current, reconnectCount.current, () => {
                    reconnectCount.current++;
                    reconnect();
                });
            }
            setReadyState(reconnectTimeout ? "connecting" : "closed");
            optionsRef.current.onClose?.(event);
        };

        let resetTimeout: () => void = () => {};
        if (messageTimeout) {
            resetTimeout = startTimeout(websocket, messageTimeout ?? DEFAULT_MESSAGE_TIMEOUT);
        }

        if (heartbeatOpts) {
            const interval = (typeof heartbeatOpts === "object" && heartbeatOpts?.interval) || DEFAULT_HEARTBEAT_INTERVAL;
            const message = (typeof heartbeatOpts === "object" && heartbeatOpts?.message) || DEFAULT_HEARTBEAT_MESSAGE;
            startHeartbeat(websocket, interval, message);
        }
        websocket.onmessage = message => {
            resetTimeout();
            optionsRef.current.onMessage?.(message);
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

function startTimeout(websocket: WebSocket, timeout: number) {
    function resetTimeout() {
        return setTimeout(() => {
            console.log(`Closed websocket because no messages received for ${timeout}ms`)
            websocket.close();
        }, timeout);
    }
    let taskId = resetTimeout();

    websocket.addEventListener("close", () => clearTimeout(taskId));
    return () => {
        clearTimeout(taskId);
        taskId = resetTimeout();
    };
}

function startHeartbeat(websocket: WebSocket, interval: number, message: NonNullable<HeartbeatOptions['message']>) {
    const taskId = setInterval(() => {
        try {
            if (typeof message === 'function') {
                websocket.send(message());
            }
            else {
                websocket.send(message);
            }
        }
        catch (error) {
            // do nothing
        }
    }, interval);
    websocket.addEventListener("close", () => clearInterval(taskId));
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_RECONNECT_INTERVAL_MS, DEFAULT_RECONNECT_LIMIT } from './constants';
import { createOrJoinSocket } from './create-or-join';
import {
    Options,
    ReadyState,
    SendMessage,
    WebSocketMessage,
    WebSocketHook,
} from './types';
import { mapReadyState } from "./util";

export function useWebSocket(
    options: Options,
    connect: boolean = true,
): WebSocketHook {
    const [readyState, setReadyState] = useState<Record<string, ReadyState>>({});
    const activeUrl = useRef<string | null>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const startRef = useRef<() => void>(() => void 0);
    const reconnectCount = useRef<number>(0);
    const messageQueue = useRef<WebSocketMessage[]>([]);
    const activeOptions = useRef<Options>(options);
    const url = options.url;
    activeOptions.current = options;

    const readyStateForUrl: ReadyState = function() {
        if (activeUrl.current && readyState[activeUrl.current] !== undefined) {
            return readyState[activeUrl.current];
        }
        if (url !== null && connect) {
            return "connecting";
        }
        return "uninstantiated";
    }();

    const sendMessage: SendMessage = useCallback((message, queueable = true) => {
        if (webSocketRef.current?.readyState && mapReadyState(webSocketRef.current.readyState) === "open") {
            webSocketRef.current.send(message);
        }
        else if (queueable) {
            messageQueue.current.push(message);
        }
    }, []);

    useEffect(() => {
        if (!connect) return;
        if (url !== null) {
            let removeListeners: (() => void) | undefined;
            let expectOpen = true;

            const start = async () => {
                activeUrl.current = typeof url === "string" ? url : await getUrl(url, activeOptions.current);

                if (activeUrl.current === null) {
                    console.error('Failed to get a valid URL. WebSocket connection aborted.');
                    activeUrl.current = 'ABORTED';
                    flushSync(() => setReadyState(prev => ({
                        ...prev,
                        ABORTED: "closed",
                    })));

                    return;
                }

                const protectedSetReadyState = (state: ReadyState) => {
                    if (expectOpen) {
                        flushSync(() => setReadyState(prev => {
                            if (activeUrl.current && prev[activeUrl.current] !== state) {
                                return { ...prev, [activeUrl.current]: state };
                            }
                            return prev;
                        }));
                    }
                };

                if (expectOpen) {
                    removeListeners = createOrJoinSocket(
                        webSocketRef,
                        activeUrl.current,
                        protectedSetReadyState,
                        activeOptions,
                        startRef,
                        reconnectCount,
                    );
                }
            };

            startRef.current = () => {
                if (expectOpen) {
                    removeListeners?.();
                    start();
                }
            };

            setTimeout(async () => await start(), 0);
            return () => {
                expectOpen = false;
                removeListeners?.();
            };
        }
        else {
            reconnectCount.current = 0;
            setReadyState(prev => {
                if (activeUrl.current && prev[activeUrl.current] !== "closed") {
                    return { ...prev, [activeUrl.current]: "closed" }
                }
                return prev;
            });
        }
    }, [url, connect, sendMessage]);

    // Drain the queue on connect
    useEffect(() => {
        if (readyStateForUrl === "open") {
            messageQueue.current.splice(0).forEach(message => {
                sendMessage(message);
            });
        }
    }, [readyStateForUrl]);

    return {
        sendMessage,
        readyState: readyStateForUrl
    };
}

async function getUrl(
    url: () => (string | Promise<string>),
    options: Readonly<Options>,
    retriedAttempts: number = 0,
): Promise<string | null> {
    try {
        return await url();
    }
    catch (e) {
        if (options.retryOnError) {
            const reconnectLimit = options.reconnectAttempts ?? DEFAULT_RECONNECT_LIMIT;
            if (retriedAttempts < reconnectLimit) {
                const nextReconnectInterval = typeof options.reconnectInterval === 'function' ?
                    options.reconnectInterval(retriedAttempts) :
                    options.reconnectInterval;

                await waitFor(nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
                return getUrl(url, options, retriedAttempts + 1);
            }
            else {
                options.onReconnectStop?.(retriedAttempts);
                return null;
            }
        }
        else {
            return null;
        }
    }
}

function waitFor(duration: number) {
    return new Promise(resolve => window.setTimeout(resolve, duration));
}

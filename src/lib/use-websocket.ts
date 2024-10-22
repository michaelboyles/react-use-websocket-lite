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
    const convertedUrl = useRef<string | null>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const startRef = useRef<() => void>(() => void 0);
    const reconnectCount = useRef<number>(0);
    const messageQueue = useRef<WebSocketMessage[]>([]);
    const optionsCache = useRef<Options>(options);
    const url = options.url;
    optionsCache.current = options;

    const readyStateFromUrl: ReadyState = function() {
        if (convertedUrl.current && readyState[convertedUrl.current] !== undefined) {
            return readyState[convertedUrl.current];
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
                convertedUrl.current = typeof url === "string" ? url : await getUrl(url, optionsCache.current);

                if (convertedUrl.current === null) {
                    console.error('Failed to get a valid URL. WebSocket connection aborted.');
                    convertedUrl.current = 'ABORTED';
                    flushSync(() => setReadyState(prev => ({
                        ...prev,
                        ABORTED: "closed",
                    })));

                    return;
                }

                const protectedSetReadyState = (state: ReadyState) => {
                    if (expectOpen) {
                        flushSync(() => setReadyState(prev => {
                            if (convertedUrl.current && prev[convertedUrl.current] !== state) {
                                return { ...prev, [convertedUrl.current]: state };
                            }
                            return prev;
                        }));
                    }
                };

                if (expectOpen) {
                    removeListeners = createOrJoinSocket(
                        webSocketRef,
                        convertedUrl.current,
                        protectedSetReadyState,
                        optionsCache,
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
                if (convertedUrl.current && prev[convertedUrl.current] !== "closed") {
                    return { ...prev, [convertedUrl.current]: "closed" }
                }
                return prev;
            });
        }
    }, [url, connect, sendMessage]);

    // Drain the queue on connect
    useEffect(() => {
        if (readyStateFromUrl === "open") {
            messageQueue.current.splice(0).forEach(message => {
                sendMessage(message);
            });
        }
    }, [readyStateFromUrl]);

    return {
        sendMessage,
        readyState: readyStateFromUrl
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

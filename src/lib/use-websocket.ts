import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_RECONNECT_INTERVAL_MS, DEFAULT_RECONNECT_LIMIT, ReadyState } from './constants';
import { createOrJoinSocket } from './create-or-join';
import {
    Options,
    ReadyStateState,
    SendMessage,
    WebSocketMessage,
    WebSocketHook,
} from './types';
import { mapReadyState } from "./util";

export function useWebSocket(
    options: Options,
    connect: boolean = true,
): WebSocketHook {
    const [readyState, setReadyState] = useState<ReadyStateState>({});
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
        if (url !== null && connect) {
            let removeListeners: () => void;
            let expectClose = false;
            let createOrJoin = true;

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
                    if (!expectClose) {
                        flushSync(() => setReadyState(prev => ({
                            ...prev,
                            ...(convertedUrl.current && {[convertedUrl.current]: state}),
                        })));
                    }
                };

                if (createOrJoin) {
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
                if (!expectClose) {
                    removeListeners?.();
                    start();
                }
            };

            start();
            return () => {
                expectClose = true;
                createOrJoin = false;
                removeListeners?.();
            };
        }
        else if (url === null || connect) {
            reconnectCount.current = 0;
            setReadyState(prev => ({
                ...prev,
                ...(convertedUrl.current && {[convertedUrl.current]: "closed"}),
            }));
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

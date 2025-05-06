import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_RECONNECT_INTERVAL_MS, ReadyState } from './constants.ts';
import type { Options, SendMessage, WebSocketHook, WebSocketMessage, } from './types.ts';
import { attachListeners } from "./attach-listener.ts";

export function useWebSocket(options: Options): WebSocketHook {
    const { url, connect = true } = options;

    const [urlToReadyState, setUrlToReadyState] = useState<Record<string, ReadyState>>({});
    const activeUrl = useRef<string | null>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const startRef = useRef<() => void>(() => {});
    const reconnectCount = useRef(0);
    const messageQueue = useRef<WebSocketMessage[]>([]);
    const activeOptions = useRef<Options>(options);
    activeOptions.current = options;

    const readyStateFromUrl: ReadyState = function () {
        if (activeUrl.current && urlToReadyState[activeUrl.current] !== undefined) {
            return urlToReadyState[activeUrl.current];
        }
        if (url != null && connect) {
            return ReadyState.CONNECTING;
        }
        return ReadyState.UNINSTANTIATED;
    }();

    const sendMessage: SendMessage = useCallback((message, queueable = true) => {
        if (webSocketRef.current?.readyState === ReadyState.OPEN) {
            webSocketRef.current.send(message);
        }
        else if (queueable) {
            messageQueue.current.push(message);
        }
    }, []);

    const getWebSocket = useCallback(() => {
        return webSocketRef.current;
    }, []);

    useEffect(() => {
        if (url != null && connect) {
            let removeListeners: () => void;
            let expectOpen = true;

            const start = async () => {
                activeUrl.current = await getUrl(url, activeOptions);

                if (activeUrl.current === null) {
                    console.error('Failed to get a valid URL. WebSocket connection aborted.');
                    activeUrl.current = 'ABORTED';
                    setUrlToReadyState(prev => ({
                        ...prev,
                        ABORTED: ReadyState.CLOSED,
                    }));

                    return;
                }

                const protectedSetReadyState = (state: ReadyState) => {
                    if (expectOpen) {
                        setUrlToReadyState(prev => {
                            if (activeUrl.current && prev[activeUrl.current] !== state) {
                                return {...prev, [activeUrl.current]: state};
                            }
                            return prev;
                        });
                    }
                };

                if (expectOpen) {
                    webSocketRef.current = new WebSocket(activeUrl.current, activeOptions.current.protocols);
                    protectedSetReadyState(ReadyState.CONNECTING);
                    if (!webSocketRef.current) {
                        throw new Error('WebSocket failed to be created');
                    }

                    removeListeners = attachListeners(
                        webSocketRef.current,
                        protectedSetReadyState,
                        activeOptions,
                        startRef.current,
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

            start();
            return () => {
                expectOpen = false;
                removeListeners?.();
            };
        }
        else if (url == null || !connect) {
            reconnectCount.current = 0;
            setUrlToReadyState(prev => {
                if (activeUrl.current && prev[activeUrl.current] !== ReadyState.CLOSED) {
                    return {...prev, [activeUrl.current]: ReadyState.CLOSED}
                }
                return prev;
            });
        }
    }, [url, connect, sendMessage]);

    useEffect(() => {
        if (readyStateFromUrl === ReadyState.OPEN) {
            messageQueue.current.splice(0).forEach(message => {
                sendMessage(message);
            });
        }
    }, [readyStateFromUrl]);

    return {
        sendMessage,
        readyState: readyStateFromUrl,
        getWebSocket,
    };
}

async function getUrl(
    url: string | (() => string | Promise<string>),
    optionsRef: RefObject<Options>,
    retriedAttempts: number = 0,
): Promise<string | null> {
    if (typeof url === "string") return url;
    try {
        return await url();
    }
    catch (e) {
        if (!optionsRef.current.retryOnError) {
            return null;
        }
        const maxReconnectAttempts = optionsRef.current.maxReconnectAttempts;
        if (!maxReconnectAttempts || retriedAttempts < maxReconnectAttempts) {
            const nextReconnectInterval = typeof optionsRef.current.reconnectInterval === 'function' ?
                optionsRef.current.reconnectInterval(retriedAttempts) :
                optionsRef.current.reconnectInterval;

            await waitFor(nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
            return getUrl(url, optionsRef, retriedAttempts + 1);
        }
        else {
            optionsRef.current.onReconnectStop?.(retriedAttempts);
        }
    }
    return null;
}

function waitFor(duration: number) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

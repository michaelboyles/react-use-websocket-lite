import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_RECONNECT_INTERVAL_MS, ReadyState } from './constants';
import { Options, ReadyStateState, SendMessage, WebSocketHook, WebSocketMessage, } from './types';
import { attachListeners } from "./attach-listener";

export function useWebSocket(options: Options): WebSocketHook {
    const { url, connect = true } = options;

    const [readyState, setReadyState] = useState<ReadyStateState>({});
    const activeUrl = useRef<string | null>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const startRef = useRef<() => void>(() => void 0);
    const reconnectCount = useRef<number>(0);
    const messageQueue = useRef<WebSocketMessage[]>([]);
    const activeOptions = useRef<Options>(options);
    activeOptions.current = options;

    const readyStateFromUrl: ReadyState = function () {
        if (activeUrl.current && readyState[activeUrl.current] !== undefined) {
            return readyState[activeUrl.current];
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
                    flushSync(() => setReadyState(prev => ({
                        ...prev,
                        ABORTED: ReadyState.CLOSED,
                    })));

                    return;
                }

                const protectedSetReadyState = (state: ReadyState) => {
                    if (expectOpen) {
                        flushSync(() => setReadyState(prev => {
                            if (activeUrl.current && prev[activeUrl.current] !== state) {
                                return {...prev, [activeUrl.current]: state};
                            }
                            return prev;
                        }));
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
            setReadyState(prev => {
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
    optionsRef: MutableRefObject<Options>,
    retriedAttempts: number = 0,
): Promise<string | null> {
    if (typeof url === "string") return url;
    try {
        return await url();
    }
    catch (e) {
        if (optionsRef.current.retryOnError) {
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
                return null;
            }
        }
    }
    return null;
}

function waitFor(duration: number) {
    return new Promise(resolve => window.setTimeout(resolve, duration));
}

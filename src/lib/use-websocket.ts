import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_OPTIONS, ReadyState } from './constants';
import { createOrJoinSocket } from './create-or-join';
import { getUrl } from './get-url';
import websocketWrapper from './proxy';
import {
    Options,
    ReadyStateState,
    SendMessage,
    WebSocketMessage,
    WebSocketHook,
} from './types';
import { assertIsWebSocket } from './util';

export function useWebSocket(
    url: string | (() => string | Promise<string>) | null,
    options: Options = DEFAULT_OPTIONS,
    connect: boolean = true,
): WebSocketHook {
    const [readyState, setReadyState] = useState<ReadyStateState>({});
    const convertedUrl = useRef<string | null>(null);
    const webSocketRef = useRef<WebSocket | null>(null);
    const startRef = useRef<() => void>(() => void 0);
    const reconnectCount = useRef<number>(0);
    const messageQueue = useRef<WebSocketMessage[]>([]);
    const webSocketProxy = useRef<WebSocket | null>(null);
    const optionsCache = useRef<Options>(options);
    optionsCache.current = options;

    const readyStateFromUrl: ReadyState = function() {
        if (convertedUrl.current && readyState[convertedUrl.current] !== undefined) {
            return readyState[convertedUrl.current];
        }
        if (url !== null && connect === true) {
            return ReadyState.CONNECTING;
        }
        return ReadyState.UNINSTANTIATED;
    }();

    const stringifiedQueryParams = options.queryParams ? JSON.stringify(options.queryParams) : null;

    const sendMessage: SendMessage = useCallback((message, keep = true) => {
        if (webSocketRef.current?.readyState === ReadyState.OPEN) {
            assertIsWebSocket(webSocketRef.current, optionsCache.current.skipAssert);
            webSocketRef.current.send(message);
        }
        else if (keep) {
            messageQueue.current.push(message);
        }
    }, []);

    const getWebSocket = useCallback(() => {
        if (webSocketProxy.current === null && webSocketRef.current) {
            assertIsWebSocket(webSocketRef.current, optionsCache.current.skipAssert);
            webSocketProxy.current = websocketWrapper(webSocketRef.current, startRef);
        }
        return webSocketProxy.current;
    }, []);

    useEffect(() => {
        if (url !== null && connect === true) {
            let removeListeners: () => void;
            let expectClose = false;
            let createOrJoin = true;

            const start = async () => {
                convertedUrl.current = await getUrl(url, optionsCache);

                if (convertedUrl.current === null) {
                    console.error('Failed to get a valid URL. WebSocket connection aborted.');
                    convertedUrl.current = 'ABORTED';
                    flushSync(() => setReadyState(prev => ({
                        ...prev,
                        ABORTED: ReadyState.CLOSED,
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
                    if (webSocketProxy.current) webSocketProxy.current = null;
                    removeListeners?.();
                    start();
                }
            };

            start();
            return () => {
                expectClose = true;
                createOrJoin = false;
                if (webSocketProxy.current) webSocketProxy.current = null;
                removeListeners?.();
            };
        }
        else if (url === null || connect === false) {
            reconnectCount.current = 0; // reset reconnection attempts
            setReadyState(prev => ({
                ...prev,
                ...(convertedUrl.current && {[convertedUrl.current]: ReadyState.CLOSED}),
            }));
        }
    }, [url, connect, stringifiedQueryParams, sendMessage]);

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

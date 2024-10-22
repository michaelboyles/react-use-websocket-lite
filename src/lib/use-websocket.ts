import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_OPTIONS, ReadyState } from './constants';
import { createOrJoinSocket } from './create-or-join';
import { getUrl } from './get-url';
import {
    Options,
    ReadyStateState,
    SendMessage,
    WebSocketMessage,
    WebSocketHook,
} from './types';
import { mapReadyState } from "./util";

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

    const queryString = options.queryParams ? JSON.stringify(options.queryParams) : null;

    useEffect(() => {
        if (url !== null && connect) {
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
        else if (url === null || connect) {
            reconnectCount.current = 0;
            setReadyState(prev => ({
                ...prev,
                ...(convertedUrl.current && {[convertedUrl.current]: "closed"}),
            }));
        }
    }, [url, connect, queryString, sendMessage]);

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

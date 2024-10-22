import { sharedWebSockets } from './globals';
import { DEFAULT_RECONNECT_LIMIT, DEFAULT_RECONNECT_INTERVAL_MS, ReadyState } from './constants';
import { getSubscribers } from './manage-subscribers';
import { MutableRefObject } from 'react';
import { HeartbeatOptions, Options } from './types';
import { heartbeat } from './heartbeat';

function bindMessageHandler(
    webSocketInstance: WebSocket,
    url: string,
    heartbeatOptions?: boolean | HeartbeatOptions
) {
    let onMessageCb: () => void;

    if (heartbeatOptions && webSocketInstance instanceof WebSocket) {
        onMessageCb = heartbeat(webSocketInstance, typeof heartbeatOptions === 'boolean' ? undefined : heartbeatOptions);
    }

    webSocketInstance.onmessage = (message: WebSocketEventMap['message']) => {
        onMessageCb?.();
        getSubscribers(url).forEach(subscriber => {
            if (subscriber.optionsRef.current.onMessage) {
                subscriber.optionsRef.current.onMessage(message);
            }
        });
    };
}

function bindOpenHandler(webSocketInstance: WebSocket, url: string) {
    webSocketInstance.onopen = (event: WebSocketEventMap['open']) => {
        getSubscribers(url).forEach(subscriber => {
            subscriber.reconnectCount.current = 0;
            if (subscriber.optionsRef.current.onOpen) {
                subscriber.optionsRef.current.onOpen(event);
            }

            subscriber.setReadyState(ReadyState.OPEN);
        });
    };
}

function bindCloseHandler(webSocketInstance: WebSocket, url: string) {
    if (webSocketInstance instanceof WebSocket) {
        webSocketInstance.onclose = (event: WebSocketEventMap['close']) => {
            getSubscribers(url).forEach(subscriber => {
                if (subscriber.optionsRef.current.onClose) {
                    subscriber.optionsRef.current.onClose(event);
                }

                subscriber.setReadyState(ReadyState.CLOSED);
            });

            delete sharedWebSockets[url];

            getSubscribers(url).forEach(subscriber => {
                if (
                    subscriber.optionsRef.current.shouldReconnect &&
                    subscriber.optionsRef.current.shouldReconnect(event)
                ) {
                    const reconnectAttempts = subscriber.optionsRef.current.reconnectAttempts ?? DEFAULT_RECONNECT_LIMIT;
                    if (subscriber.reconnectCount.current < reconnectAttempts) {
                        const nextReconnectInterval = typeof subscriber.optionsRef.current.reconnectInterval === 'function' ?
                            subscriber.optionsRef.current.reconnectInterval(subscriber.reconnectCount.current) :
                            subscriber.optionsRef.current.reconnectInterval;

                        setTimeout(() => {
                            subscriber.reconnectCount.current++;
                            subscriber.reconnect.current();
                        }, nextReconnectInterval ?? DEFAULT_RECONNECT_INTERVAL_MS);
                    } else {
                        subscriber.optionsRef.current.onReconnectStop && subscriber.optionsRef.current.onReconnectStop(subscriber.optionsRef.current.reconnectAttempts as number);
                        console.warn(`Max reconnect attempts of ${reconnectAttempts} exceeded`);
                    }
                }
            });
        };
    }
}

function bindErrorHandler(webSocketInstance: WebSocket, url: string) {
    webSocketInstance.onerror = (error: WebSocketEventMap['error']) => {
        getSubscribers(url).forEach(subscriber => {
            if (subscriber.optionsRef.current.onError) {
                subscriber.optionsRef.current.onError(error);
            }
        });
    };
}

export function attachSharedListeners(websocket: WebSocket, url: string, optionsRef: MutableRefObject<Options>) {
    let interval: number;

    bindMessageHandler(websocket, url, optionsRef.current.heartbeat);
    bindCloseHandler(websocket, url);
    bindOpenHandler(websocket, url);
    bindErrorHandler(websocket, url);

    return () => {
        if (interval) clearInterval(interval);
    };
}

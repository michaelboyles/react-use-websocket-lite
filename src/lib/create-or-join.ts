import { MutableRefObject } from 'react';
import { sharedWebSockets } from './globals';
import { Options, Subscriber } from './types';
import { ReadyState } from './constants';
import { attachListeners } from './attach-listener';
import { addSubscriber, removeSubscriber, hasSubscribers } from './manage-subscribers';

//TODO ensure that all onClose callbacks are called

export function createOrJoinSocket(
    webSocketRef: MutableRefObject<WebSocket | null>,
    url: string,
    setReadyState: (readyState: ReadyState) => void,
    optionsRef: MutableRefObject<Options>,
    startRef: MutableRefObject<() => void>,
    reconnectCount: MutableRefObject<number>,
): () => void {
    if (optionsRef.current.share) {
        if (sharedWebSockets[url] === undefined) {
            sharedWebSockets[url] = new WebSocket(url, optionsRef.current.protocols);
            webSocketRef.current = sharedWebSockets[url];
            setReadyState(ReadyState.CONNECTING);
        }
        else {
            webSocketRef.current = sharedWebSockets[url];
            setReadyState(sharedWebSockets[url].readyState);
        }

        const subscriber: Subscriber = {
            setReadyState,
            optionsRef,
            reconnectCount,
            reconnect: startRef,
        };

        addSubscriber(url, subscriber);

        return cleanSubscribers(
            url,
            subscriber,
            optionsRef,
            setReadyState,
        );
    }
    else {
        const websocket = new WebSocket(url, optionsRef.current.protocols);
        webSocketRef.current = websocket;
        setReadyState(ReadyState.CONNECTING);

        return attachListeners(
            websocket,
            setReadyState,
            optionsRef,
            startRef.current,
            reconnectCount,
        );
    }
}


function cleanSubscribers(
    url: string,
    subscriber: Subscriber,
    optionsRef: MutableRefObject<Options>,
    setReadyState: (readyState: ReadyState) => void
) {
    return () => {
        removeSubscriber(url, subscriber);
        if (!hasSubscribers(url)) {
            try {
                const websocket = sharedWebSockets[url];
                websocket.onclose = event => {
                    optionsRef.current.onClose?.(event);
                    setReadyState(ReadyState.CLOSED);
                };
                websocket.close();
            }
            catch (e) {
                // Do nothing
            }
            delete sharedWebSockets[url];
        }
    }
}

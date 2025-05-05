import { MutableRefObject } from 'react';
import { Options } from './types';
import { DEFAULT_RECONNECT_INTERVAL_MS, DEFAULT_RECONNECT_LIMIT } from './constants';

export const getUrl = async (
    url: string | (() => string | Promise<string>),
    optionsRef: MutableRefObject<Options>,
    retriedAttempts: number = 0,
): Promise<string | null> => {
    if (typeof url === "string") return url;
    try {
        return await url();
    }
    catch (e) {
        if (optionsRef.current.retryOnError) {
            const reconnectLimit = optionsRef.current.reconnectAttempts ?? DEFAULT_RECONNECT_LIMIT;
            if (retriedAttempts < reconnectLimit) {
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
};

function waitFor(duration: number) {
    return new Promise(resolve => window.setTimeout(resolve, duration));
}

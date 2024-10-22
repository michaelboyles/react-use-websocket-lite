import { MutableRefObject } from 'react';
import { Options, QueryParams } from './types';
import { DEFAULT_RECONNECT_INTERVAL_MS, DEFAULT_RECONNECT_LIMIT } from './constants';

export const getUrl = async (
    url: string | (() => string | Promise<string>),
    optionsRef: MutableRefObject<Options>,
    retriedAttempts: number = 0,
): Promise<string | null> => {
    let convertedUrl: string;

    if (typeof url === 'function') {
        try {
            convertedUrl = await url();
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
            else {
                return null;
            }
        }
    }
    else {
        convertedUrl = url;
    }

    if (!optionsRef.current.queryParams) {
        return convertedUrl;
    }
    return appendQueryParams(convertedUrl, optionsRef.current.queryParams);
};

function appendQueryParams(url: string, params: QueryParams): string {
    const hasParamsRegex = /\?(\w+=\w+)/;
    const alreadyHasParams = hasParamsRegex.test(url);

    const stringified = `${Object.entries(params).reduce((next, [key, value]) => {
        return next + `${key}=${value}&`;
    }, '').slice(0, -1)}`;

    return `${url}${alreadyHasParams ? '&' : '?'}${stringified}`;
}

function waitFor(duration: number) {
    return new Promise(resolve => window.setTimeout(resolve, duration));
}

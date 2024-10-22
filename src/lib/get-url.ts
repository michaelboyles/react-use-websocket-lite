import { Options, QueryParams } from './types';
import { DEFAULT_RECONNECT_INTERVAL_MS, DEFAULT_RECONNECT_LIMIT } from './constants';

export async function getUrl(
    url: string | (() => (string | Promise<string>)),
    options: Readonly<Options>,
    retriedAttempts: number = 0,
): Promise<string | null> {
    let convertedUrl: string;

    if (typeof url === 'function') {
        try {
            convertedUrl = await url();
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
    else {
        convertedUrl = url;
    }

    if (!options.queryParams) {
        return convertedUrl;
    }
    return appendQueryParams(convertedUrl, options.queryParams);
}

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

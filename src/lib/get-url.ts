import { Options } from './types';
import { DEFAULT_RECONNECT_INTERVAL_MS, DEFAULT_RECONNECT_LIMIT } from './constants';

export async function getUrl(
    url: string | (() => (string | Promise<string>)),
    options: Readonly<Options>,
    retriedAttempts: number = 0,
): Promise<string | null> {
    if (typeof url === 'function') {
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
    return url;
}

function waitFor(duration: number) {
    return new Promise(resolve => window.setTimeout(resolve, duration));
}

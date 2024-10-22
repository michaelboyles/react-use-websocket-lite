export const DEFAULT_OPTIONS = {};
export const DEFAULT_RECONNECT_LIMIT = 20;
export const DEFAULT_RECONNECT_INTERVAL_MS = 5000;
export const DEFAULT_HEARTBEAT = {
    message: 'ping',
    timeout: 60000,
    interval: 25000,
};

export type ReadyState = "uninstantiated" | "connecting" | "open" | "closing" | "closed";

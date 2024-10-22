export const DEFAULT_RECONNECT_LIMIT = 20;
export const DEFAULT_RECONNECT_INTERVAL_MS = 5000;

export const DEFAULT_HEARTBEAT_INTERVAL = 25_000;
export const DEFAULT_HEARTBEAT_TIMEOUT = 60_000;
export const DEFAULT_HEARTBEAT_MESSAGE = "ping";

export type ReadyState = "uninstantiated" | "connecting" | "open" | "closing" | "closed";

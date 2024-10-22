import { HeartbeatOptions } from "./types";

export const DEFAULT_HEARTBEAT_INTERVAL = 25_000;
export const DEFAULT_HEARTBEAT_MESSAGE = "ping";

export function heartbeat(ws: WebSocket, options?: HeartbeatOptions) {
    const interval = options?.interval ?? DEFAULT_HEARTBEAT_INTERVAL;
    const message = options?.message ?? DEFAULT_HEARTBEAT_MESSAGE;

    const pingTaskId = setInterval(() => {
        try {
            if (typeof message === 'function') {
                ws.send(message());
            }
            else {
                ws.send(message);
            }
        }
        catch (error) {
            // do nothing
        }
    }, interval);

    ws.addEventListener("close", () => {
        clearInterval(pingTaskId);
    });
}

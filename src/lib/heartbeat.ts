import {
    DEFAULT_HEARTBEAT_INTERVAL,
    DEFAULT_HEARTBEAT_MESSAGE,
    DEFAULT_HEARTBEAT_TIMEOUT
} from "./constants";
import { HeartbeatOptions } from "./types";

export function heartbeat(ws: WebSocket, options?: HeartbeatOptions): () => void {
    const interval = options?.interval ?? DEFAULT_HEARTBEAT_INTERVAL;
    const timeout = options?.timeout ?? DEFAULT_HEARTBEAT_TIMEOUT;
    const message = options?.message ?? DEFAULT_HEARTBEAT_MESSAGE;

    let messageAccepted = false;

    const pingTimer = setInterval(() => {
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

    const timeoutTimer = setInterval(() => {
        if (!messageAccepted) {
            ws.close();
        }
        else {
            messageAccepted = false;
        }
    }, timeout);

    ws.addEventListener("close", () => {
        clearInterval(pingTimer);
        clearInterval(timeoutTimer);
    });

    return () => {
        messageAccepted = true;
    };
}

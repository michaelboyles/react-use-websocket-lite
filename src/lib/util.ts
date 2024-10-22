import { resetWebSockets } from './globals';
import { resetSubscribers } from './manage-subscribers';
import { ReadyState } from "./constants";

export function resetGlobalState(url?: string): void {
    resetSubscribers(url);
    resetWebSockets(url);
}

export function mapReadyState(state: number): ReadyState {
    switch (state) {
        case 0: return "connecting";
        case 1: return "open";
        case 2: return "closing";
        case 3: return "closed";
        default: throw new Error("Invalid ready state: " + state);
    }
}

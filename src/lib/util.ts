import { ReadyState } from "./types";

export function mapReadyState(state: number): ReadyState {
    switch (state) {
        case 0: return "connecting";
        case 1: return "open";
        case 2: return "closing";
        case 3: return "closed";
        default: throw new Error("Invalid ready state: " + state);
    }
}

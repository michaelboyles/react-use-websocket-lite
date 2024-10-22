import { resetWebSockets } from './globals';
import { resetSubscribers } from './manage-subscribers';

export function resetGlobalState(url?: string): void {
    resetSubscribers(url);
    resetWebSockets(url);
}

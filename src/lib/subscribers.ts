import { Options, ReadyState } from "./types";
import { MutableRefObject } from "react";

export type Subscriber = {
    setReadyState(readyState: ReadyState): void
    optionsRef: MutableRefObject<Options>
    reconnectCount: MutableRefObject<number>
    reconnect: MutableRefObject<() => void>
}

const urlToSubscribers: Record<string, Set<Subscriber>> = {};

export function hasSubscribers(url: string): boolean {
    return urlToSubscribers[url]?.size > 0;
}

export function addSubscriber(url: string, subscriber: Subscriber): void {
    urlToSubscribers[url] = urlToSubscribers[url] || new Set<Subscriber>();
    urlToSubscribers[url].add(subscriber);
}

export function removeSubscriber(url: string, subscriber: Subscriber): void {
    urlToSubscribers[url].delete(subscriber);
}

export function resetSubscribers(url?: string): void {
    if (url && urlToSubscribers.hasOwnProperty(url)) {
        delete urlToSubscribers[url];
    }
    else {
        for (let url in urlToSubscribers) {
            if (urlToSubscribers.hasOwnProperty(url)) {
                delete urlToSubscribers[url];
            }
        }
    }
}

import { Options, ReadyState } from "./types";
import { MutableRefObject } from "react";

export type Subscriber = {
    setReadyState(readyState: ReadyState): void
    optionsRef: MutableRefObject<Options>
    reconnectCount: MutableRefObject<number>
    reconnect: MutableRefObject<() => void>
}

export type Subscribers = {
    [url: string]: Set<Subscriber>,
}

const subscribers: Subscribers = {};
const EMPTY_LIST: Subscriber[] = [];

export function getSubscribers(url: string): Subscriber[] {
    if (hasSubscribers(url)) {
        return Array.from(subscribers[url]);
    }
    return EMPTY_LIST;
}

export function hasSubscribers(url: string): boolean {
    return subscribers[url]?.size > 0;
}

export function addSubscriber(url: string, subscriber: Subscriber): void {
    subscribers[url] = subscribers[url] || new Set<Subscriber>();
    subscribers[url].add(subscriber);
}

export function removeSubscriber(url: string, subscriber: Subscriber): void {
    subscribers[url].delete(subscriber);
}

export function resetSubscribers(url?: string): void {
    if (url && subscribers.hasOwnProperty(url)) {
        delete subscribers[url];
    }
    else {
        for (let url in subscribers) {
            if (subscribers.hasOwnProperty(url)) {
                delete subscribers[url];
            }
        }
    }
}

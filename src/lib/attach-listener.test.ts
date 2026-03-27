import type { RefObject } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { attachListeners } from './attach-listener';
import { ReadyState } from './constants';
import type { Options } from './types';

const URL = 'ws://localhost:1234';

class FakeWebSocket extends EventTarget {
    readyState: typeof WebSocket['CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'] = WebSocket.CONNECTING;

    close = vi.fn(() => {
        this.readyState = WebSocket.CLOSING;
    });

    send = vi.fn(() => {
        if (this.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is already in CLOSING or CLOSED state');
        }
    });
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

test('message timeout updates readyState to CONNECTING even if no close event arrives', async () => {
    const websocket = new FakeWebSocket();
    const setReadyState = vi.fn();
    const reconnect = vi.fn();
    const onClose = vi.fn();

    attachListeners(
        websocket as unknown as WebSocket,
        setReadyState,
        {
            current: {
                url: URL,
                messageTimeout: 25,
                shouldReconnect: true,
                reconnectInterval: 50,
                onClose,
            },
        } as RefObject<Options>,
        reconnect,
        { current: 0 } as RefObject<number>,
    );

    websocket.readyState = WebSocket.OPEN;
    websocket.dispatchEvent(new Event('open'));

    expect(setReadyState).toHaveBeenLastCalledWith(ReadyState.OPEN);

    await vi.advanceTimersByTimeAsync(25);

    expect(setReadyState).toHaveBeenLastCalledWith(ReadyState.CONNECTING);
    expect(websocket.close).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);

    expect(reconnect).toHaveBeenCalledTimes(1);
});

test('message timeout ignores later messages but still handles the eventual close event', async () => {
    const websocket = new FakeWebSocket();
    const setReadyState = vi.fn();
    const reconnect = vi.fn();
    const onClose = vi.fn();
    const onMessage = vi.fn();

    attachListeners(
        websocket as unknown as WebSocket,
        setReadyState,
        {
            current: {
                url: URL,
                messageTimeout: 25,
                onClose,
                onMessage,
            },
        } as RefObject<Options>,
        reconnect,
        { current: 0 } as RefObject<number>,
    );

    websocket.readyState = WebSocket.OPEN;
    websocket.dispatchEvent(new Event('open'));

    await vi.advanceTimersByTimeAsync(25);

    websocket.dispatchEvent(new MessageEvent('message', { data: 'late' }));
    websocket.readyState = WebSocket.CLOSED;
    websocket.dispatchEvent(new CloseEvent('close', { code: 1000, reason: 'late close', wasClean: true }));

    expect(onMessage).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setReadyState).toHaveBeenLastCalledWith(ReadyState.CLOSED);
    expect(reconnect).not.toHaveBeenCalled();
});

test('cleanup detaches websocket listeners before closing the socket', () => {
    const websocket = new FakeWebSocket();
    const setReadyState = vi.fn();
    const reconnect = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onMessage = vi.fn();
    const onError = vi.fn();

    const cleanup = attachListeners(
        websocket as unknown as WebSocket,
        setReadyState,
        {
            current: {
                url: URL,
                onOpen,
                onClose,
                onMessage,
                onError,
            },
        } as RefObject<Options>,
        reconnect,
        { current: 0 } as RefObject<number>,
    );

    websocket.readyState = WebSocket.OPEN;
    websocket.dispatchEvent(new Event('open'));

    expect(onOpen).toHaveBeenCalledTimes(1);

    cleanup();

    expect(setReadyState).toHaveBeenLastCalledWith(ReadyState.CLOSING);
    expect(websocket.close).toHaveBeenCalledTimes(1);

    websocket.dispatchEvent(new Event('open'));
    websocket.dispatchEvent(new MessageEvent('message', { data: 'late' }));
    websocket.dispatchEvent(new Event('error'));
    websocket.readyState = WebSocket.CLOSED;
    websocket.dispatchEvent(new CloseEvent('close', { code: 1000, wasClean: true }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
    expect(setReadyState).toHaveBeenLastCalledWith(ReadyState.CLOSING);
});

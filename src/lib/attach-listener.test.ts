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

    attachListeners(
        websocket as unknown as WebSocket,
        setReadyState,
        {
            current: {
                url: URL,
                messageTimeout: 25,
                shouldReconnect: true,
                reconnectInterval: 50,
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

    await vi.advanceTimersByTimeAsync(50);

    expect(reconnect).toHaveBeenCalledTimes(1);
});

test('message timeout updates readyState to CLOSING until the close event arrives', async () => {
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
                onClose,
            },
        } as RefObject<Options>,
        reconnect,
        { current: 0 } as RefObject<number>,
    );

    websocket.readyState = WebSocket.OPEN;
    websocket.dispatchEvent(new Event('open'));

    await vi.advanceTimersByTimeAsync(25);

    expect(setReadyState).toHaveBeenLastCalledWith(ReadyState.CLOSING);
    expect(onClose).not.toHaveBeenCalled();
    expect(websocket.close).toHaveBeenCalledTimes(1);

    websocket.readyState = WebSocket.CLOSED;
    websocket.dispatchEvent(new CloseEvent('close', { code: 1000, reason: 'close after timeout', wasClean: true }));

    expect(setReadyState).toHaveBeenLastCalledWith(ReadyState.CLOSED);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(reconnect).not.toHaveBeenCalled();
});

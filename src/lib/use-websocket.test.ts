import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderHook, waitFor } from '@testing-library/react';
import { useWebSocket } from './use-websocket';
import WS from "jest-websocket-mock";
import { ReadyState } from './constants';

let server: WS;
const URL = 'ws://localhost:1234';
const noop = () => { };
const sleep = (duration: number): Promise<void> => new Promise(resolve => setTimeout(() => resolve(), duration));
console.error = noop;

beforeEach(() => {
    server = new WS(URL);
});

afterEach(() => {
    WS.clean();
});

test('readyState changes across readyState transitions', async () => {
    const { result, rerender } = renderHook(({ connect }) => useWebSocket({
        url: URL,
        connect
    }), {
        initialProps: { connect: false }
    })

    expect(result.current.readyState).toEqual(ReadyState.UNINSTANTIATED);
    rerender({ connect: true });

    expect(result.current.readyState).toEqual(ReadyState.CONNECTING);
    await server.connected;
    expect(result.current.readyState).toEqual(ReadyState.OPEN);

    server.close();
    await expect(result.current.readyState).toEqual(ReadyState.CLOSED);
})

test('a function-promise based url works the same as a string-based url', async () => {
    async function getUrl() {
        await sleep(100);
        return URL;
    }

    const { result, rerender } = renderHook(({ connect }) => useWebSocket({
        url: getUrl,
        connect
    }), {
        initialProps: { connect: false }
    })

    expect(result.current.readyState).toEqual(ReadyState.UNINSTANTIATED);
    rerender({ connect: true });

    expect(result.current.readyState).toEqual(ReadyState.CONNECTING);
    await server.connected;
    expect(result.current.readyState).toEqual(ReadyState.OPEN);

    server.close();
    expect(result.current.readyState).toEqual(ReadyState.CLOSED);
})

test('a function-promise based url retries until it resolves if retryOnError is true', async () => {
    let attemptsUntilSuccess = 2;
    const getUrl = () => {
        return new Promise<string>((resolve, reject) => {
            if (attemptsUntilSuccess > 0) {
                attemptsUntilSuccess--;
                reject('Failed to get url');
            }
            else {
                resolve(URL);
            }
        });
    };

    const onReconnectStop = vi.fn();
    const { result, rerender } = renderHook(({ connect }) => useWebSocket({
        url: getUrl,
        retryOnError: true,
        maxReconnectAttempts: 3,
        reconnectInterval: 20,
        onReconnectStop,
        connect
    }), {
        initialProps: { connect: false }
    });

    expect(result.current.readyState).toEqual(ReadyState.UNINSTANTIATED);
    rerender({ connect: true });
    expect(result.current.readyState).toEqual(ReadyState.CONNECTING);
    await expect.poll(
        () => result.current.readyState,
        { interval: 5, timeout: 1_000 }
    ).toEqual(ReadyState.OPEN);
    expect(onReconnectStop).not.toHaveBeenCalled();
});

test('a function-promise based url stops retrying if it has exceeded reconnectAttempts', async () => {
    let attemptsUntilSuccess = 3;
    const getUrl = () => {
        return new Promise<string>((resolve, reject) => {
            if (attemptsUntilSuccess > 0) {
                attemptsUntilSuccess--;
                reject('Failed to get url');
            }
            else {
                resolve(URL);
            }
        });
    };

    const onReconnectStop = vi.fn();
    const { result, rerender } = renderHook(({ connect }) => useWebSocket({
        url: getUrl,
        retryOnError: true,
        maxReconnectAttempts: 2,
        reconnectInterval: 20,
        onReconnectStop,
        connect
    }), {
        initialProps: { connect: false }
    });

    expect(result.current.readyState).toEqual(ReadyState.UNINSTANTIATED);
    rerender({ connect: true });
    expect(result.current.readyState).toEqual(ReadyState.CONNECTING);
    await sleep(100);
    expect(result.current.readyState).toEqual(ReadyState.CLOSED);
    expect(onReconnectStop).toHaveBeenCalled();
});

test('a function-promise based url does not retry if retryOnError is false', async () => {
    const onReconnectStop = vi.fn();

    const getUrl = () => Promise.reject("Failed to get URL");

    const { result, rerender } = renderHook(({ connect }) => useWebSocket({
        url: getUrl,
        retryOnError: false,
        onReconnectStop,
        connect
    }), {
        initialProps: { connect: false }
    });

    expect(result.current.readyState).toEqual(ReadyState.UNINSTANTIATED);
    rerender({ connect: true });
    await expect.poll(
        () => result.current.readyState,
        { interval: 5, timeout: 500 }
    ).toEqual(ReadyState.CLOSED);
    expect(onReconnectStop).not.toHaveBeenCalled();
});

test('sendMessage sends a message to the server', async () => {
    const { result: websocket } = renderHook(() => useWebSocket({ url: URL }))
    await server.connected;
    websocket.current.sendMessage("Hello");
    await expect(server).toReceiveMessage("Hello");
})

test('if sendMessage is called before the websocket opens, the message will be queued and sent when the websocket opens', async () => {
    const { result: websocket } = renderHook(() => useWebSocket({ url: URL }))
    expect(websocket.current.readyState).not.toEqual(ReadyState.OPEN);
    websocket.current.sendMessage("Hello");
    await expect(server).toReceiveMessage("Hello");
})

test('getWebSocket returns the underlying websocket', async () => {
    const { result } = renderHook(() => useWebSocket({ url: URL }))
    await server.connected;
    const ws = result.current.getWebSocket();
    expect(ws).toBeInstanceOf(WebSocket);

    ws?.close();
    await waitFor(() => expect(result.current.readyState).toBe(ReadyState.CLOSED));
})

test('websocket is closed when the component unmounts', async () => {
    const { result, unmount } = renderHook(() => useWebSocket({ url: URL }))
    await server.connected;
    const ws = result.current.getWebSocket();

    unmount();
    expect(ws?.readyState).toBe(ReadyState.CLOSING);
    await expect.poll(
        () => ws?.readyState,
        { interval: 5, timeout: 500 }
    ).toBe(ReadyState.CLOSED);
})

test('Websocket can reconnect after timeout', async () => {
    const { result } = renderHook(() => useWebSocket({
        url: URL,
        messageTimeout: 100,
        reconnectInterval: 10,
        shouldReconnect: () => true
    }))

    await server.connected;
    expect(result.current.getWebSocket()?.readyState).toBe(WebSocket.OPEN);

    await sleep(200);

    await server.connected;
    expect(result.current.getWebSocket()?.readyState).toBe(WebSocket.OPEN);
});

test('Options#protocols passes the value on to the instantiated WebSocket', async () => {
    const { result } = renderHook(() => useWebSocket({ url: URL, protocols: "chat" }));

    await waitFor(() => {
        const ws = result.current.getWebSocket();
        expect(ws?.protocol).toEqual("chat");
    });
});

test('Multiple websockets will be opened for the same url', async () => {
    const onConnectionFn = vi.fn();
    server.on('connection', onConnectionFn);

    renderHook(() => useWebSocket({ url: URL }));
    renderHook(() => useWebSocket({ url: URL }));
    renderHook(() => useWebSocket({ url: URL }));

    await expect.poll(
        () => onConnectionFn,
        { interval: 5, timeout: 500 }
    ).toHaveBeenCalledTimes(3);
});

test('Options#onOpen is called with the open event when the websocket connection opens', async () => {
    const onOpenFn = vi.fn();
    renderHook(() => useWebSocket({ url: URL, onOpen: onOpenFn }));
    await server.connected;
    expect(onOpenFn).toHaveBeenCalledTimes(1);
    expect(onOpenFn.mock.calls[0][0].constructor.name).toBe('Event');
});

test('Options#onClose is called with the close event when the websocket connection closes', async () => {
    const onCloseFn = vi.fn();
    renderHook(() => useWebSocket({ url: URL, onClose: onCloseFn }));
    await server.connected;

    server.close();
    await waitFor(() => {
        expect(onCloseFn).toHaveBeenCalledTimes(1);
        expect(onCloseFn.mock.calls[0][0].constructor.name).toBe('CloseEvent');
    });
});

test('Options#onMessage is called with the MessageEvent when the websocket receives a message', async () => {
    const onMessageFn = vi.fn();
    renderHook(() => useWebSocket({ url: URL, onMessage: onMessageFn }));
    await server.connected;

    server.send('Hello');

    await waitFor(() => {
        expect(onMessageFn).toHaveBeenCalledTimes(1);
        expect(onMessageFn.mock.calls[0][0].constructor.name).toBe('MessageEvent');
    });
});

test('Options#onError is called when the websocket connection errors out', async () => {
    const onErrorFn = vi.fn();
    renderHook(() => useWebSocket({ url: URL, onError: onErrorFn }));
    await server.connected;

    server.error();

    await waitFor(() => {
        expect(onErrorFn).toHaveBeenCalledTimes(1);
        expect(onErrorFn.mock.calls[0][0].constructor.name).toBe('MessageEvent');
    });
});

test('Options#shouldReconnect = false will not reconnect after server disconnection', async () => {
    const onConnectionFn = vi.fn((ws: any) => ws.close());
    server.on('connection', onConnectionFn);

    renderHook(() => useWebSocket({
        url: URL,
        reconnectInterval: 20,
        shouldReconnect: () => false
    }));
    await sleep(100);
    expect(onConnectionFn).toHaveBeenCalledTimes(1);
});

test('Options#onReconnectStop is called when the websocket exceeds maximum reconnect attempts', async () => {
    const onReconnectStopFn = vi.fn((_numAttempts: number) => {});
    renderHook(() => useWebSocket({
        url: URL,
        maxReconnectAttempts: 3,
        reconnectInterval: 50,
        onReconnectStop: onReconnectStopFn,
        shouldReconnect: () => true
    }));
    await server.connected;
    server.close();
    expect(onReconnectStopFn).not.toHaveBeenCalled();

    await expect.poll(() => onReconnectStopFn, { interval: 10, timeout: 1_000 }).toHaveBeenCalled()
    expect(onReconnectStopFn.mock.calls[0][0]).toBe(3);
});

test('Options#retryOnError = false will not reconnect after an error event', async () => {
    const onReconnectStopFn = vi.fn();
    renderHook(() => useWebSocket({
        url: URL,
        retryOnError: false,
        reconnectInterval: 50,
        onReconnectStop: onReconnectStopFn
    }));
    await server.connected;
    server.error();
    await sleep(150);
    expect(onReconnectStopFn).not.toHaveBeenCalled();
});

test('Options#retryOnError = true will reconnect after an error event', async () => {
    const onReconnectStop = vi.fn();
    renderHook(() => useWebSocket({
        url: URL,
        retryOnError: true,
        reconnectInterval: 50,
        maxReconnectAttempts: 3,
        onReconnectStop
    }));
    await server.connected;
    server.error(); // also closes the server
    await expect.poll(() => onReconnectStop, { interval: 5, timeout: 500 }).toHaveBeenCalled();
});

test('Options#heartbeat, if provided, sends a message to the server at the specified interval', async () => {
    let ping = 1;
    renderHook(() => useWebSocket({
        url: URL,
        heartbeat: {
            message: () => "ping" + (ping++),
            interval: 10
        }
    }));
    await server.connected;
    await expect.poll(() => server, { interval: 5, timeout: 100 })
        .toHaveReceivedMessages(["ping1", "ping2", "ping3"]);
});

test('Options#messageTimeout, if provided, close websocket if no message is received from server within specified timeout', async () => {
    const { result } = renderHook(() => useWebSocket({ url: URL, messageTimeout: 25 }));
    await server.connected;
    await expect.poll(() => result.current.readyState, { interval: 5, timeout: 300 })
        .toBe(WebSocket.CLOSED);
});

test('Options#messageTimeout, if provided, do not close websocket if a message is received from server within specified timeout', async () => {
    const { result } = renderHook(() => useWebSocket({ url: URL, messageTimeout: 25 }));
    await server.connected;
    for (let i = 0; i < 4; i++) {
        server.send('ping')
        await sleep(10);
    }
    expect(result.current.readyState).toBe(WebSocket.OPEN);
});

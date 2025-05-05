import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderHook, waitFor } from '@testing-library/react';
import { useWebSocket } from './use-websocket';
import WS from "jest-websocket-mock";
import { Options } from './types';
import { ReadyState } from './constants';

let server: WS;
const URL = 'ws://localhost:1234';
const noop = () => { };
const DEFAULT_OPTIONS: Options = { url: URL };
let options: Options;
const sleep = (duration: number): Promise<void> => new Promise(resolve => setTimeout(() => resolve(), duration));
console.error = noop;

beforeEach(() => {
    server = new WS(URL);
    options = { ...DEFAULT_OPTIONS };
});

afterEach(() => {
    WS.clean();
});

test('readyState changes across readyState transitions', async () => {
    const {
        result,
        rerender,
    } = renderHook(({ connect }) => useWebSocket({ ...options, connect }), {
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
    const getUrl = () => {
        return new Promise<string>(resolve => {
            setTimeout(() => resolve(URL), 1000);
        });
    }

    const {
        result,
        rerender,
    } = renderHook(({ connect }) => useWebSocket({ ...options, url: getUrl, connect }), {
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

test('a function-promise based url retries until it resolves if retryOnError is true', async () => {
    let attemptsUntilSuccess = 2;
    options.retryOnError = true;
    options.reconnectAttempts = 3;
    options.reconnectInterval = 500;
    const onReconnectStopFn1 = vi.fn();
    options.onReconnectStop = onReconnectStopFn1;

    const getUrl = () => {
        return new Promise<string>((resolve, reject) => {
            if (attemptsUntilSuccess > 0) {
                attemptsUntilSuccess--;
                reject('Failed to get url');
            } else {
                resolve(URL);
            }
        });
    };

    const {
        result,
        rerender,
    } = renderHook(({ connect }) => useWebSocket({...options, url: getUrl, connect }), {
        initialProps: { connect: false }
    });

    expect(result.current.readyState).toEqual(ReadyState.UNINSTANTIATED);
    rerender({ connect: true });
    await sleep(1000);
    expect(result.current.readyState).toEqual(ReadyState.CONNECTING);
    await sleep(1000);
    await expect(result.current.readyState).toEqual(ReadyState.OPEN);
    expect(options.onReconnectStop).not.toHaveBeenCalled();
});

test('a function-promise based url stops retrying if it has exceeded reconnectAttempts', async () => {
    let attemptsUntilSuccess = 3;
    options.retryOnError = true;
    options.reconnectAttempts = 2;
    options.reconnectInterval = 500;
    const onReconnectStopFn1 = vi.fn();
    options.onReconnectStop = onReconnectStopFn1;

    const getUrl = () => {
        return new Promise<string>((resolve, reject) => {
            if (attemptsUntilSuccess > 0) {
                attemptsUntilSuccess--;
                reject('Failed to get url');
            } else {
                resolve(URL);
            }
        });
    };

    const {
        result,
        rerender,
    } = renderHook(({ connect }) => useWebSocket({...options, url: getUrl, connect }), {
        initialProps: { connect: false }
    });

    expect(result.current.readyState).toEqual(ReadyState.UNINSTANTIATED);
    rerender({ connect: true });
    await sleep(1000);
    expect(result.current.readyState).toEqual(ReadyState.CONNECTING);
    await sleep(1000);
    await expect(result.current.readyState).toEqual(ReadyState.CLOSED);
    expect(options.onReconnectStop).toHaveBeenCalled();
});

test('a function-promise based url does not retry if retryOnError is false', async () => {
    let attemptsUntilSuccess = 2;
    options.retryOnError = false;
    options.reconnectAttempts = 3;
    options.reconnectInterval = 500;
    const onReconnectStopFn1 = vi.fn();
    options.onReconnectStop = onReconnectStopFn1;

    const getUrl = () => {
        return new Promise<string>((resolve, reject) => {
            if (attemptsUntilSuccess > 0) {
                attemptsUntilSuccess--;
                reject('Failed to get url');
            } else {
                resolve(URL);
            }
        });
    };

    const {
        result,
        rerender,
    } = renderHook(({ connect }) => useWebSocket({...options, url: getUrl, connect }), {
        initialProps: { connect: false }
    });

    expect(result.current.readyState).toEqual(ReadyState.UNINSTANTIATED);
    rerender({ connect: true });
    await sleep(1000);
    expect(result.current.readyState).toEqual(ReadyState.CLOSED);
    await sleep(1000);
    expect(options.onReconnectStop).not.toHaveBeenCalled();
});

test('sendMessage passes message to websocket and sends to server', async () => {
    const {
        result,
    } = renderHook(() => useWebSocket(options))
    await server.connected;
    result.current.sendMessage("Hello");
    await expect(server).toReceiveMessage("Hello");
})

test('if sendMessage is called before the websocket opens, the message will be queued and sent when the websocket opens', async () => {
    const {
        result,
    } = renderHook(() => useWebSocket(options))
    expect(result.current.readyState).not.toEqual(ReadyState.OPEN);
    result.current.sendMessage("Hello");
    await expect(server).toReceiveMessage("Hello");
})

test('getWebSocket returns the underlying websocket', async () => {
    const {
        result
    } = renderHook(() => useWebSocket(options))
    await server.connected;
    const ws = result.current.getWebSocket();

    expect(ws instanceof WebSocket).toBe(true);

    ws?.close();
    await waitFor(() => expect(result.current.readyState).toBe(ReadyState.CLOSED));
})

test('websocket is closed when the component unmounts', async () => {
    const {
        result,
        unmount,
    } = renderHook(() => useWebSocket(options))
    await server.connected;
    const ws = result.current.getWebSocket();

    unmount();
    expect(ws?.readyState).toBe(ReadyState.CLOSING);
    await sleep(500);
    expect(ws?.readyState).toBe(ReadyState.CLOSED);
})

test('Websocket can reconnect after timeout', async () => {
    options.messageTimeout = 100;
    options.reconnectInterval = 10;
    options.reconnectAttempts = 10;
    options.shouldReconnect = () => true;

    const {
        result: component1,
    } = renderHook(() => useWebSocket(options))

    await server.connected;
    expect(component1.current.getWebSocket()?.readyState).toBe(WebSocket.OPEN);

    await sleep(200);

    await server.connected;
    server.send('pong');
    expect(component1.current.getWebSocket()?.readyState).toBe(WebSocket.OPEN);
});

test('Options#protocols pass the value on to the instantiated WebSocket', async () => {
    options.protocols = 'chat';

    const {
        result
    } = renderHook(() => useWebSocket(options));

    await waitFor(() => {
        const ws = result.current.getWebSocket();
        if (ws instanceof WebSocket) {
            expect(ws?.protocol).toEqual('chat');
        }
    });
});

test('Multiple websockets will be opened for the same url', async () => {
    const onConnectionFn = vi.fn();
    server.on('connection', onConnectionFn);

    renderHook(() => useWebSocket(options));
    renderHook(() => useWebSocket(options));
    renderHook(() => useWebSocket(options));

    await sleep(500);

    expect(onConnectionFn).toHaveBeenCalledTimes(3);
});

test('Options#onOpen is called with the open event when the websocket connection opens', async () => {
    const onOpenFn = vi.fn();
    options.onOpen = onOpenFn;

    renderHook(() => useWebSocket(options));
    await server.connected;
    expect(onOpenFn).toHaveBeenCalledTimes(1);
    expect(onOpenFn.mock.calls[0][0].constructor.name).toBe('Event');
});

test('Options#onClose is called with the close event when the websocket connection closes', async () => {
    const onCloseFn = vi.fn();
    options.onClose = onCloseFn;

    renderHook(() => useWebSocket(options));
    await server.connected;

    server.close();
    await waitFor(() => {
        expect(onCloseFn).toHaveBeenCalledTimes(1);
        expect(onCloseFn.mock.calls[0][0].constructor.name).toBe('CloseEvent');
    });
});

test('Options#onMessage is called with the MessageEvent when the websocket receives a message', async () => {
    const onMessageFn = vi.fn();
    options.onMessage = onMessageFn;

    renderHook(() => useWebSocket(options));
    await server.connected;

    server.send('Hello');

    await waitFor(() => {
        expect(onMessageFn).toHaveBeenCalledTimes(1);
        expect(onMessageFn.mock.calls[0][0].constructor.name).toBe('MessageEvent');
    });
});

test('Options#onError is called when the websocket connection errors out', async () => {
    const onErrorFn = vi.fn();
    options.onError = onErrorFn;

    renderHook(() => useWebSocket(options));
    await server.connected;

    server.error();

    await waitFor(() => {
        expect(onErrorFn).toHaveBeenCalledTimes(1);
        expect(onErrorFn.mock.calls[0][0].constructor.name).toBe('MessageEvent');
    });
});

test('Options#shouldReconnect controls whether a closed websocket should attempt to reconnect', async () => {
    options.shouldReconnect = () => false;
    options.reconnectInterval = 500; //Default interval is too long for tests

    const onConnectionFn = vi.fn((ws: any) => ws.close());
    server.on('connection', onConnectionFn);

    renderHook(() => useWebSocket(options));
    await sleep(600);//100ms buffer to avoid race condition

    expect(onConnectionFn).toHaveBeenCalledTimes(1);

    options.shouldReconnect = () => true;

    renderHook(() => useWebSocket(options));
    await sleep(600);
    expect(onConnectionFn).toHaveBeenCalledTimes(3);
});

test('Options#onReconnectStop is called when the websocket exceeds maximum reconnect attempts provided in options, or 20 by default', async () => {
    options.shouldReconnect = () => true;
    options.reconnectAttempts = 3;
    options.reconnectInterval = 500; //Default interval is too long for tests
    const onReconnectStopFn = vi.fn((numAttempts: number) => { });
    options.onReconnectStop = onReconnectStopFn;

    renderHook(() => useWebSocket(options));
    await server.connected;
    server.close();
    expect(onReconnectStopFn).not.toHaveBeenCalled();

    await sleep(2000);

    expect(onReconnectStopFn).toHaveBeenCalled();
    expect(onReconnectStopFn.mock.calls[0][0]).toBe(3);
});

test('Options#retryOnError controls whether a websocket should attempt to reconnect after an error event', async () => {
    options.retryOnError = false;
    options.reconnectAttempts = 3;
    options.reconnectInterval = 500;
    const onReconnectStopFn1 = vi.fn();
    options.onReconnectStop = onReconnectStopFn1;

    renderHook(() => useWebSocket(options));
    await server.connected;

    server.error();
    await sleep(1600);
    expect(onReconnectStopFn1).not.toHaveBeenCalled();

    options.retryOnError = true;
    const onReconnectStopFn2 = vi.fn();
    options.onReconnectStop = onReconnectStopFn2;

    renderHook(() => useWebSocket(options));
    await server.connected;

    server.error();
    await sleep(1600);
    expect(onReconnectStopFn2).toHaveBeenCalled();
});

test('Options#heartbeat, if provided, sends a message to the server at the specified interval', async () => {
    options.heartbeat = {
        message: 'ping',
        interval: 500,
    };
    renderHook(() => useWebSocket(options));

    await server.connected;
    await sleep(1600);
    await expect(server).toHaveReceivedMessages(["ping", "ping", "ping"]);
});

test('Options#messageTimeout, if provided, close websocket if no message is received from server within specified timeout', async () => {
    options.messageTimeout = 1000;
    const { result } = renderHook(() => useWebSocket(options));

    await server.connected;
    await sleep(1600);
    expect(result.current.readyState).toBe(WebSocket.CLOSED);
});

test('Options#messageTimeout, if provided, do not close websocket if a message is received from server within specified timeout', async () => {
    options.messageTimeout = 1000;

    const { result } = renderHook(() => useWebSocket(options));

    await server.connected;
    server.send('ping')
    await sleep(500);
    server.send('ping')
    await sleep(500);
    server.send('ping')
    await sleep(500);
    server.send('ping')
    await sleep(500);
    expect(result.current.readyState).toBe(WebSocket.OPEN);
});

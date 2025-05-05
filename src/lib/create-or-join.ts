import { MutableRefObject } from 'react';
import { Options } from './types';
import { ReadyState } from './constants';
import { attachListeners } from './attach-listener';

export const createOrJoinSocket = (
  webSocketRef: MutableRefObject<WebSocket | null>,
  url: string,
  setReadyState: (readyState: ReadyState) => void,
  optionsRef: MutableRefObject<Options>,
  startRef: MutableRefObject<() => void>,
  reconnectCount: MutableRefObject<number>,
): (() => void) => {
    webSocketRef.current = new WebSocket(url, optionsRef.current.protocols);
    setReadyState(ReadyState.CONNECTING);
    if (!webSocketRef.current) {
      throw new Error('WebSocket failed to be created');
    }

    return attachListeners(
      webSocketRef.current,
      setReadyState,
      optionsRef,
      startRef.current,
      reconnectCount,
    );
}

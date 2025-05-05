import { useMemo } from 'react'
import { useWebSocket } from './use-websocket'
import { DEFAULT_OPTIONS } from './constants'
import { Options, WebSocketHook } from './types';

export const useSocketIO = (
  url: string | (() => string | Promise<string>) | null,
  options: Options = DEFAULT_OPTIONS,
  connect: boolean = true,
): WebSocketHook => {
  const optionsWithSocketIO = useMemo(() => ({
    ...options,
    fromSocketIO: true,
  }), [])

  const {
    sendMessage,
    sendJsonMessage,
    readyState,
    getWebSocket,
  } = useWebSocket(
    url,
    optionsWithSocketIO,
    connect,
  );

  return {
    sendMessage,
    sendJsonMessage,
    readyState,
    getWebSocket,
  };
}

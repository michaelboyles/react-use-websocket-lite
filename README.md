This library is a fork of [`react-use-websocket`](https://github.com/robtaussig/react-use-websocket)
which has been stripped down to remove features that most people don't need. Mainly: SocketIO and EventSource support,
and connection sharing. See the [changelog](https://github.com/michaelboyles/react-use-websocket-lite/#changelog).

There are also some improvements to reduce the number of unnecessary state changes causing re-renders.

The result is (hopefully) a library that's simpler, and easier to use in a performant way.

## Usage

```text
npm install react-use-websocket-lite
# or
yarn add react-use-websocket-lite
```

```ts
function Demo() {
    const [messages, setMessages] = useState<string[]>([]);

    const { sendMessage, readyState } = useWebSocket({
        url: "wss://echo.websocket.org",
        onMessage(event) {
            if (typeof event.data === "string") {
                setMessages(prev => [...prev, event.data]);
            }
        }
    });

    useEffect(() => {
        if (readyState === "open") {
            sendMessage("hello");
        }
    }, [readyState])

    return (
        <pre>{ JSON.stringify(messages, null, 2) }</pre>
    )
}
```
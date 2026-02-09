# OpenClaw C++ Integration Example

To communicate with OpenClaw from C++, you need a **WebSocket library** (like [ixwebsocket](https://github.com/machinezone/IXWebSocket) or [Boost.Beast](https://www.boost.org/doc/libs/develop/libs/beast/doc/html/index.html)) and a **JSON library** (like [nlohmann/json](https://github.com/nlohmann/json)).

Below is a simplified example using `ixwebsocket` (cleaner) and `nlohmann/json`.

### `main.cpp`

```cpp
#include <ixwebsocket/IXWebSocket.h>
#include <nlohmann/json.hpp>
#include <iostream>
#include <string>

using json = nlohmann::json;

int main() {
    ix::WebSocket webSocket;
    std::string url = "ws://127.0.0.1:18789";
    std::string myToken = "YOUR_GATEWAY_TOKEN"; // Get this from ~/.openclaw/openclaw.json

    webSocket.setUrl(url);

    // 1. Handle incoming responses
    webSocket.setOnMessageCallback([&](const ix::WebSocketMessagePtr& msg) {
        if (msg->type == ix::WebSocketMessageType::Message) {
            try {
                auto response = json::parse(msg->str);

                // Check if this is the response to our agents.list call
                if (response.contains("result") && response["result"].contains("agents")) {
                    auto agents = response["result"]["agents"];
                    std::cout << "\n✅ Successfully fetched agents!" << std::endl;
                    std::cout << "🤖 Total Agents: " << agents.size() << std::endl;

                    for (auto& agent : agents) {
                        std::cout << " - ID: " << agent["id"] << " (Name: " << agent["name"] << ")" << std::endl;
                    }

                    // Exit example after receiving data
                    exit(0);
                }
            } catch (const std::exception& e) {
                std::cerr << "JSON Parse Error: " << e.what() << std::endl;
            }
        } else if (msg->type == ix::WebSocketMessageType::Error) {
            std::cerr << "WebSocket Error: " << msg->errorInfo.reason << std::endl;
        }
    });

    webSocket.start();

    // 2. Wait for connection to open, then send the request
    while (webSocket.getReadyState() != ix::ReadyState::Open) {
        // In a real app, use an async/event-driven approach!
    }

    std::cout << "Connected to Gateway..." << std::endl;

    // 3. Construct the JSON-RPC Request
    json request = {
        {"jsonrpc", "2.0"},
        {"id", 1}, // Random ID to track the response
        {"method", "agents.list"},
        {"params", {
            {"auth", {{"token", myToken}}}
        }}
    };

    webSocket.send(request.dump());

    // Keep the main thread alive to receive the response
    while (true) {}

    return 0;
}
```

### Key Steps for C++ Implementation:

1.  **WebSocket Handshake**: Connect to `ws://127.0.0.1:18789`.
2.  **Serialize**: Use `json.dump()` to turn your C++ object into a raw string.
3.  **Auth**: Always nesting the `auth` object inside `params` for every secure call.
4.  **Parse**: Use `json::parse(msg)` when the server sends data back.
5.  **Listen**: Remember that `chat.send` events will come in as multiple "push" messages with `method: "chat"`.

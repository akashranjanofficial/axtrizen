// OpenClaw Gateway Client - Implementation
// WebSocket client for communicating with OpenClaw Gateway
// Protocol: JSON-RPC 2.0 over WebSocket (ws://127.0.0.1:18789)

#include "openclaw_client.hpp"
#include <atomic>
#include <fstream>
#include <iostream>
#include <ixwebsocket/IXWebSocket.h>
#include <map>
#include <mutex>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace axtrizen {

// ==================== Implementation ====================

class OpenClawClient::Impl {
public:
  ix::WebSocket ws;
  std::atomic<int> request_id{1};
  std::map<int, std::function<void(json, std::string)>> pending_requests;
  std::mutex pending_mutex;
  ChatCallback chat_callback;

  Impl() = default;
  ~Impl() { ws.stop(); }
};

OpenClawClient::OpenClawClient() : pimpl(std::make_unique<Impl>()) {}
OpenClawClient::~OpenClawClient() = default;

bool OpenClawClient::connect(const std::string &url, const std::string &token) {
  auth_token_ = token;
  pimpl->ws.setUrl(url);

  // Set message handler
  pimpl->ws.setOnMessageCallback([this](const ix::WebSocketMessagePtr &msg) {
    if (msg->type == ix::WebSocketMessageType::Message) {
      handle_message(msg->str);
    } else if (msg->type == ix::WebSocketMessageType::Open) {
      connected_ = true;
      // Authenticate after connection
      if (!auth_token_.empty()) {
        authenticate();
      }
    } else if (msg->type == ix::WebSocketMessageType::Close) {
      connected_ = false;
    } else if (msg->type == ix::WebSocketMessageType::Error) {
      connected_ = false;
      if (error_callback_) {
        error_callback_(msg->errorInfo.reason);
      }
    }
  });

  pimpl->ws.start();
  return true;
}

void OpenClawClient::disconnect() {
  pimpl->ws.stop();
  connected_ = false;
}

bool OpenClawClient::is_connected() const { return connected_.load(); }

void OpenClawClient::on_error(ErrorCallback callback) {
  error_callback_ = std::move(callback);
}

// ==================== Private Methods ====================

void OpenClawClient::handle_message(const std::string &message) {
  try {
    auto j = json::parse(message);

    // Check if it's a response (has "id")
    if (j.contains("id") && !j["id"].is_null()) {
      int id = j["id"].get<int>();

      std::lock_guard<std::mutex> lock(pimpl->pending_mutex);
      auto it = pimpl->pending_requests.find(id);
      if (it != pimpl->pending_requests.end()) {
        if (j.contains("error")) {
          it->second(nullptr, j["error"]["message"].get<std::string>());
        } else {
          it->second(j["result"], "");
        }
        pimpl->pending_requests.erase(it);
      }
    }
    // Check if it's a streaming chat event
    else if (j.contains("method") && j["method"] == "chat.chunk") {
      if (pimpl->chat_callback) {
        auto params = j["params"];
        ChatChunk chunk{params.value("session_id", ""),
                        params.value("content", ""),
                        params.value("is_final", false)};
        pimpl->chat_callback(chunk);
      }
    }
  } catch (const std::exception &e) {
    if (error_callback_) {
      error_callback_(std::string("JSON parse error: ") + e.what());
    }
  }
}

void OpenClawClient::authenticate() {
  json request = {{"jsonrpc", "2.0"},
                  {"method", "auth.token"},
                  {"params", {{"token", auth_token_}}},
                  {"id", pimpl->request_id++}};
  pimpl->ws.send(request.dump());
}

int OpenClawClient::send_request(
    const std::string &method, const json &params,
    std::function<void(json, std::string)> callback) {
  int id = pimpl->request_id++;

  json request = {
      {"jsonrpc", "2.0"}, {"method", method}, {"params", params}, {"id", id}};

  {
    std::lock_guard<std::mutex> lock(pimpl->pending_mutex);
    pimpl->pending_requests[id] = std::move(callback);
  }

  pimpl->ws.send(request.dump());
  return id;
}

// ==================== Agent Methods ====================

void OpenClawClient::list_agents(AgentsCallback callback) {
  send_request("agents.list", {}, [callback](json result, std::string error) {
    if (!error.empty()) {
      callback({}, error);
      return;
    }

    std::vector<Agent> agents;
    if (result.is_array()) {
      for (const auto &j : result) {
        agents.push_back(Agent{
            j.value("id", ""), j.value("name", ""), j.value("status", "idle"),
            j.contains("model")
                ? std::make_optional(j["model"].get<std::string>())
                : std::nullopt,
            j.contains("workspace")
                ? std::make_optional(j["workspace"].get<std::string>())
                : std::nullopt,
            j.contains("emoji")
                ? std::make_optional(j["emoji"].get<std::string>())
                : std::nullopt});
      }
    }
    callback(agents, "");
  });
}

void OpenClawClient::create_agent(const std::string &name,
                                  const std::string &workspace,
                                  const std::string &model,
                                  AgentsCallback callback) {
  json params = {{"name", name}, {"workspace", workspace}, {"model", model}};

  send_request(
      "agents.create", params, [callback](json result, std::string error) {
        if (callback) {
          if (!error.empty()) {
            callback({}, error);
          } else {
            // Return the created agent
            std::vector<Agent> agents;
            if (result.is_object()) {
              agents.push_back(Agent{result.value("id", ""),
                                     result.value("name", ""),
                                     result.value("status", "idle"),
                                     std::nullopt, std::nullopt, std::nullopt});
            }
            callback(agents, "");
          }
        }
      });
}

void OpenClawClient::delete_agent(
    const std::string &agent_id,
    std::function<void(bool, std::string)> callback) {
  json params = {{"agent_id", agent_id}};

  send_request("agents.delete", params,
               [callback](json result, std::string error) {
                 callback(error.empty(), error);
               });
}

// ==================== Chat Methods ====================

void OpenClawClient::send_chat(const std::string &agent_id,
                               const std::string &message,
                               ChatCallback callback) {
  pimpl->chat_callback = callback;

  json params = {{"agent_id", agent_id}, {"message", message}};

  send_request("chat.send", params, [](json, std::string) {
    // Initial response acknowledged, streaming via events
  });
}

void OpenClawClient::stop_chat(const std::string &session_id) {
  json params = {{"session_id", session_id}};
  send_request("chat.stop", params, [](json, std::string) {});
}

// ==================== System Methods ====================

void OpenClawClient::get_health(HealthCallback callback) {
  send_request("health", {}, [callback](json result, std::string error) {
    if (!error.empty()) {
      callback({}, error);
      return;
    }

    HealthStatus status{result.value("memory_mb", 0.0),
                        result.value("cpu_percent", 0.0),
                        result.value("version", "unknown")};
    callback(status, "");
  });
}

// ==================== Helper Functions ====================

std::optional<std::string> read_gateway_token() {
  std::string home = std::getenv("HOME") ? std::getenv("HOME") : "";
  std::string config_path = home + "/.openclaw/openclaw.json";

  std::ifstream file(config_path);
  if (!file.is_open()) {
    return std::nullopt;
  }

  try {
    json config = json::parse(file);
    if (config.contains("gateway") && config["gateway"].contains("auth") &&
        config["gateway"]["auth"].contains("token")) {
      return config["gateway"]["auth"]["token"].get<std::string>();
    }
  } catch (...) {
    return std::nullopt;
  }

  return std::nullopt;
}

bool is_openclaw_configured() {
  std::string home = std::getenv("HOME") ? std::getenv("HOME") : "";
  std::string config_path = home + "/.openclaw/openclaw.json";
  std::ifstream file(config_path);
  return file.good();
}

} // namespace axtrizen

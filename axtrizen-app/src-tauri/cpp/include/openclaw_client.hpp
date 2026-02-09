// OpenClaw Gateway Client
// C++ WebSocket client for communicating with OpenClaw Gateway
// Uses JSON-RPC 2.0 protocol over WebSocket (ws://127.0.0.1:18789)

#pragma once

#include <atomic>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

// Forward declaration for JSON library
namespace nlohmann {
class json;
}

namespace axtrizen {

/// Agent information returned from agents.list
struct Agent {
  std::string id;
  std::string name;
  std::string status;
  std::optional<std::string> model;
  std::optional<std::string> workspace;
  std::optional<std::string> emoji;
};

/// Chat message chunk for streaming responses
struct ChatChunk {
  std::string session_id;
  std::string content;
  bool is_final;
};

/// Gateway health status
struct HealthStatus {
  double memory_mb;
  double cpu_percent;
  std::string version;
};

/// Callback types
using AgentsCallback =
    std::function<void(std::vector<Agent>, std::string error)>;
using ChatCallback = std::function<void(ChatChunk chunk)>;
using HealthCallback =
    std::function<void(HealthStatus status, std::string error)>;
using ErrorCallback = std::function<void(std::string error)>;

/// OpenClaw Gateway Client
/// Connects to OpenClaw Gateway via WebSocket and provides JSON-RPC methods
class OpenClawClient {
public:
  OpenClawClient();
  ~OpenClawClient();

  /// Connect to the gateway with authentication token
  bool connect(const std::string &url = "ws://127.0.0.1:18789",
               const std::string &token = "");

  /// Disconnect from the gateway
  void disconnect();

  /// Check if connected to gateway
  bool is_connected() const;

  /// Set callback for connection errors
  void on_error(ErrorCallback callback);

  // ==================== Agent Methods ====================

  /// List all agents (agents.list)
  void list_agents(AgentsCallback callback);

  /// Create a new agent (agents.create)
  void create_agent(const std::string &name, const std::string &workspace,
                    const std::string &model = "claude-4-sonnet",
                    AgentsCallback callback = nullptr);

  /// Delete an agent (agents.delete)
  void
  delete_agent(const std::string &agent_id,
               std::function<void(bool success, std::string error)> callback);

  // ==================== Chat Methods ====================

  /// Send a chat message to an agent (chat.send)
  void send_chat(const std::string &agent_id, const std::string &message,
                 ChatCallback callback);

  /// Stop a running chat session
  void stop_chat(const std::string &session_id);

  // ==================== System Methods ====================

  /// Get gateway health status
  void get_health(HealthCallback callback);

private:
  class Impl;
  std::unique_ptr<Impl> pimpl;

  std::string auth_token_;
  std::atomic<bool> connected_{false};
  ErrorCallback error_callback_;

  // Private implementation methods
  void handle_message(const std::string &message);
  void authenticate();
  int send_request(const std::string &method, const nlohmann::json &params,
                   std::function<void(nlohmann::json, std::string)> callback);
};

// ==================== Free Functions ====================

/// Read gateway token from ~/.openclaw/openclaw.json
std::optional<std::string> read_gateway_token();

/// Check if OpenClaw is configured (config file exists)
bool is_openclaw_configured();

} // namespace axtrizen

// State Manager
// Local storage for agent cache, settings, and preferences

#pragma once

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace axtrizen {

/// Application settings
struct AppSettings {
  std::string gateway_url = "ws://127.0.0.1:18789";
  std::string theme = "dark";
  bool auto_start_gateway = false;
  bool show_notifications = true;
  std::optional<std::string> last_project_path;
};

/// Cached agent state
struct CachedAgent {
  std::string id;
  std::string name;
  std::string status;
  std::string model;
  int64_t last_seen_timestamp;
};

/// State Manager
/// Handles local persistence of settings and agent cache
class StateManager {
public:
  StateManager();
  ~StateManager();

  /// Initialize state manager (creates data directory if needed)
  bool initialize();

  // ==================== Settings ====================

  /// Get application settings
  AppSettings get_settings();

  /// Save application settings
  bool save_settings(const AppSettings &settings);

  /// Get a specific setting value
  std::optional<std::string> get_setting(const std::string &key);

  /// Set a specific setting value
  bool set_setting(const std::string &key, const std::string &value);

  // ==================== Agent Cache ====================

  /// Get cached agents (for offline viewing)
  std::vector<CachedAgent> get_cached_agents();

  /// Update agent cache
  bool update_agent_cache(const std::vector<CachedAgent> &agents);

  /// Clear agent cache
  void clear_cache();

  // ==================== Token Storage ====================

  /// Store gateway token (uses macOS Keychain)
  bool store_token(const std::string &token);

  /// Retrieve gateway token from Keychain
  std::optional<std::string> get_token();

  /// Delete stored token
  void delete_token();

private:
  std::string get_data_dir();
  std::string get_settings_path();
  std::string get_cache_path();
};

} // namespace axtrizen

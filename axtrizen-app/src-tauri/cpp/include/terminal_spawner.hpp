// Terminal Spawner for macOS
// Opens Terminal.app and executes scripts

#pragma once

#include <optional>
#include <string>

namespace axtrizen {

/// Result of terminal spawn operation
struct SpawnResult {
  bool success;
  std::string message;
  std::optional<int> pid; // Process ID if available
};

/// Terminal spawner for macOS
class TerminalSpawner {
public:
  TerminalSpawner();
  ~TerminalSpawner();

  /// Spawn a new agent by opening Terminal and running spawn-agent.sh
  /// @param agent_name Name of the agent to create
  /// @param project_dir Path to OpenClaw project directory
  /// @returns SpawnResult indicating success/failure
  SpawnResult spawn_agent(const std::string &agent_name,
                          const std::string &project_dir);

  /// Open Terminal in a specific directory
  /// @param directory Path to open Terminal in
  /// @returns SpawnResult indicating success/failure
  SpawnResult open_terminal(const std::string &directory);

  /// Execute a script in a new Terminal window
  /// @param script_path Full path to the script
  /// @param args Arguments to pass to the script
  /// @returns SpawnResult indicating success/failure
  SpawnResult run_script(const std::string &script_path,
                         const std::vector<std::string> &args = {});

private:
  /// Execute AppleScript command
  std::string execute_applescript(const std::string &script);

  /// Get the OpenClaw project directory
  std::optional<std::string> find_project_dir();
};

} // namespace axtrizen

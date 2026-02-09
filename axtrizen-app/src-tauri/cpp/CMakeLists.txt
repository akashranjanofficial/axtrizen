cmake_minimum_required(VERSION 3.21)
project(axtrizen_cpp VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Find required packages
find_package(nlohmann_json CONFIG QUIET)

# If nlohmann_json not found via vcpkg, use FetchContent
if(NOT nlohmann_json_FOUND)
    include(FetchContent)
    FetchContent_Declare(
        json
        GIT_REPOSITORY https://github.com/nlohmann/json.git
        GIT_TAG v3.11.3
    )
    FetchContent_MakeAvailable(json)
endif()

# Fetch ixwebsocket for WebSocket support
include(FetchContent)
FetchContent_Declare(
    ixwebsocket
    GIT_REPOSITORY https://github.com/machinezone/IXWebSocket.git
    GIT_TAG v11.4.5
)
set(USE_TLS OFF CACHE BOOL "")
FetchContent_MakeAvailable(ixwebsocket)

# ==================== Source Files ====================

set(AXTRIZEN_SOURCES
    src/openclaw_client.cpp
    src/terminal_spawner.cpp
    src/state_manager.cpp
)

set(AXTRIZEN_HEADERS
    include/openclaw_client.hpp
    include/terminal_spawner.hpp
    include/state_manager.hpp
)

# ==================== Library Target ====================

add_library(axtrizen_core STATIC ${AXTRIZEN_SOURCES} ${AXTRIZEN_HEADERS})

target_include_directories(axtrizen_core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(axtrizen_core PRIVATE
    nlohmann_json::nlohmann_json
    ixwebsocket::ixwebsocket
)

# Platform-specific settings
if(APPLE)
    # macOS: Link with frameworks needed for AppleScript, Keychain, etc.
    target_link_libraries(axtrizen_core PRIVATE
        "-framework Foundation"
        "-framework Security"
        "-framework CoreFoundation"
    )
    target_compile_definitions(axtrizen_core PRIVATE AXTRIZEN_MACOS)
endif()

# Enable warnings
target_compile_options(axtrizen_core PRIVATE
    $<$<CXX_COMPILER_ID:AppleClang,Clang,GNU>:-Wall -Wextra -Wpedantic>
    $<$<CXX_COMPILER_ID:MSVC>:/W4>
)

# ==================== FFI for Rust ====================

# Create C-compatible header for FFI
# This will be used by Rust via cxx or bindgen

# Install target for integration with Cargo
install(TARGETS axtrizen_core
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
)

install(DIRECTORY include/
    DESTINATION include
)

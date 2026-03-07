# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
# Build Go binary (also compiles CSS and JS bundles)
make build

# Build and run locally (requires Bluetooth adapter)
make run

# Run all Go tests
make test

# Run a single test
go test -v -run TestName ./...

# Start the Python mock server for UI development (no Bluetooth needed)
make mock-server          # Starts at http://localhost:5000

# Build frontend assets individually
make build-css            # Bundles static/css/_*.css -> static/styles.css
make build-js             # Bundles static/js/*.js -> static/app.js

# Docker
make docker-up            # Build image and start via docker-compose
make docker-down
```

## Architecture

This is a single-binary Go application (all files in `package main`) that:

1. **Scans for Govee H5075 BLE sensors** via `tinygo.org/x/bluetooth`, parsing manufacturer data (company ID `0xEC88`) to extract temperature, humidity, and battery from raw 3-byte payloads.

2. **Exports Prometheus metrics** (`govee_h5075_temperature`, `govee_h5075_humidity`, `govee_h5075_battery`, `govee_device_status`, and optional `openmeteo_*`) via `prometheus/client_golang` on an HTTP server (default port 8080).

3. **Serves a web dashboard** at `/` from the `static/` directory. The dashboard receives runtime config (thresholds, device groups/display names) via the `/config.js` endpoint, which generates a JavaScript file from the current in-memory config.

4. **Runs these goroutines concurrently** (all share a cancellable context for graceful shutdown):
   - BLE scanner (`startBLEScanner`) — scans for `ScanDuration`, sleeps for `ScanInterval`
   - Stale metrics checker (`checkForStaleMetrics`) — removes inactive devices after `StaleThreshold`
   - OpenMeteo poller (`startOpenMeteoPoller`) — optional outdoor weather from Open-Meteo API
   - Config file watcher (`watchConfigFile`) — hot-reloads `config.yaml` using `fsnotify` with 500ms debounce

### Key Files

| File | Purpose |
|------|---------|
| `main.go` | BLE scanning, Prometheus metrics registration, HTTP server, goroutine orchestration |
| `config.go` | Configuration loading (Viper), hot-reload watcher, `Config` struct |
| `openmeteo.go` | HTTP client for the Open-Meteo weather API |
| `static/js/` | Frontend JS modules (bundled to `static/app.js` by `build-js.js`) |
| `static/css/` | CSS partials prefixed with `_` (bundled to `static/styles.css` by `build-css.js`) |
| `mock_server.py` | Python/Flask dev server simulating 5 devices — use when BLE hardware isn't available |

### Configuration System

Configuration uses [Viper](https://github.com/spf13/viper) with three-tier precedence (highest to lowest): environment variables > `config.yaml` > defaults. The startup log shows which source each value came from.

- Devices are configured only in `config.yaml` (not via env vars) — each device has MAC, name, optional group/displayName, and temperature/humidity calibration offsets.
- Hot-reload applies to device list and OpenMeteo settings only; server port and scan intervals require restart.
- `parseDuration()` handles all duration string parsing (`"15s"`, `"5m"`, `"1h"`) throughout the codebase.

### BLE Data Parsing

The `parseGoveeData()` function in `main.go` decodes the 3-byte manufacturer payload: bytes 1-3 encode a combined integer where `raw / 1000` gives temperature (tenths of degrees) and `raw % 1000` gives humidity (tenths of percent). The high bit of byte 1 signals negative temperature. Calibration offsets are applied after parsing.

### Frontend Build

The `static/js/` directory contains ES modules (not bundled with a framework — just concatenated by `build-js.js`). Similarly, `static/css/` contains CSS partials concatenated by `build-css.js`. Both scripts are Node.js and run as part of `make build`. Always run the build before testing UI changes locally.

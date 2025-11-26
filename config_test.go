package main

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestConfigInitialization(t *testing.T) {
	// Test case 1: Default values
	config, _, err := initConfig()
	if err != nil {
		t.Fatalf("Failed to initialize config: %v", err)
	}

	// Check expected default values
	expectedPort := defaultPort
	expectedRefresh := defaultRefreshInterval
	expectedStale := defaultStaleThreshold
	expectedScan := defaultScanInterval
	expectedDuration := defaultScanDuration

	// Verify default values
	if config.Server.Port != expectedPort {
		t.Errorf("Server.Port = %v, want %v", config.Server.Port, expectedPort)
	}
	if config.Metrics.RefreshInterval != expectedRefresh {
		t.Errorf("Metrics.RefreshInterval = %v, want %v", config.Metrics.RefreshInterval, expectedRefresh)
	}
	if config.Metrics.StaleThreshold != expectedStale {
		t.Errorf("Metrics.StaleThreshold = %v, want %v", config.Metrics.StaleThreshold, expectedStale)
	}
	if config.Bluetooth.ScanInterval != expectedScan {
		t.Errorf("Bluetooth.ScanInterval = %v, want %v", config.Bluetooth.ScanInterval, expectedScan)
	}
	if config.Bluetooth.ScanDuration != expectedDuration {
		t.Errorf("Bluetooth.ScanDuration = %v, want %v", config.Bluetooth.ScanDuration, expectedDuration)
	}

	// Test case 2: Environment variables
	os.Setenv("PORT", "9090")
	os.Setenv("REFRESH_INTERVAL", "1m")
	os.Setenv("STALE_THRESHOLD", "10m")
	os.Setenv("SCAN_INTERVAL", "30s")
	os.Setenv("SCAN_DURATION", "1m")
	defer func() {
		os.Unsetenv("PORT")
		os.Unsetenv("REFRESH_INTERVAL")
		os.Unsetenv("STALE_THRESHOLD")
		os.Unsetenv("SCAN_INTERVAL")
		os.Unsetenv("SCAN_DURATION")
	}()

	config, _, err = initConfig()
	if err != nil {
		t.Fatalf("Failed to initialize config with env vars: %v", err)
	}

	// Expected values from environment variables
	expectedRefresh = "1m"
	expectedStale = "10m"
	expectedScan = "30s"
	expectedDuration = "1m"

	// Verify environment variable values
	if config.Server.Port != "9090" {
		t.Errorf("Server.Port = %v, want 9090", config.Server.Port)
	}
	if config.Metrics.RefreshInterval != expectedRefresh {
		t.Errorf("Metrics.RefreshInterval = %v, want %v", config.Metrics.RefreshInterval, expectedRefresh)
	}
	if config.Metrics.StaleThreshold != expectedStale {
		t.Errorf("Metrics.StaleThreshold = %v, want %v", config.Metrics.StaleThreshold, expectedStale)
	}
	if config.Bluetooth.ScanInterval != expectedScan {
		t.Errorf("Bluetooth.ScanInterval = %v, want %v", config.Bluetooth.ScanInterval, expectedScan)
	}
	if config.Bluetooth.ScanDuration != expectedDuration {
		t.Errorf("Bluetooth.ScanDuration = %v, want %v", config.Bluetooth.ScanDuration, expectedDuration)
	}
}

func TestParseDuration(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"Valid seconds", "30s", "30s"},
		{"Valid minutes", "5m", "5m0s"},
		{"Valid hours", "2h", "2h0m0s"},
		{"Valid combined", "1h30m", "1h30m0s"},
		{"Invalid format", "invalid", "30s"}, // Should default to 30s
		{"Empty string", "", "30s"},          // Should default to 30s
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseDuration(tt.input)
			if result.String() != tt.expected {
				t.Errorf("parseDuration(%q) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestConfigWatcherContextCancellation(t *testing.T) {
	// Test that the config watcher properly stops when context is cancelled
	ctx, cancel := context.WithCancel(context.Background())

	// Start the watcher in a goroutine with a nil callback
	done := make(chan bool)
	go func() {
		watchConfigFile(ctx, nil)
		done <- true
	}()

	// Give it a moment to start
	time.Sleep(100 * time.Millisecond)

	// Cancel the context
	cancel()

	// Wait for the goroutine to exit with a timeout
	select {
	case <-done:
		// Success - the function exited cleanly
	case <-time.After(2 * time.Second):
		t.Fatal("Config watcher did not stop after context cancellation")
	}
}

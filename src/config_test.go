package main

import (
	"context"
	"testing"
	"time"

	"github.com/spf13/viper"
)

func TestConfigInitialization(t *testing.T) {
	t.Run("defaults", func(t *testing.T) {
		// Run from an empty temp dir so no config.yaml is found
		t.Chdir(t.TempDir())
		viper.Reset()

		config, _, err := initConfig()
		if err != nil {
			t.Fatalf("Failed to initialize config: %v", err)
		}

		if config.Server.Port != defaultPort {
			t.Errorf("Server.Port = %v, want %v", config.Server.Port, defaultPort)
		}
		if config.Metrics.RefreshInterval != defaultRefreshInterval {
			t.Errorf("Metrics.RefreshInterval = %v, want %v", config.Metrics.RefreshInterval, defaultRefreshInterval)
		}
		if config.Metrics.StaleThreshold != defaultStaleThreshold {
			t.Errorf("Metrics.StaleThreshold = %v, want %v", config.Metrics.StaleThreshold, defaultStaleThreshold)
		}
		if config.Bluetooth.ScanInterval != defaultScanInterval {
			t.Errorf("Bluetooth.ScanInterval = %v, want %v", config.Bluetooth.ScanInterval, defaultScanInterval)
		}
		if config.Bluetooth.ScanDuration != defaultScanDuration {
			t.Errorf("Bluetooth.ScanDuration = %v, want %v", config.Bluetooth.ScanDuration, defaultScanDuration)
		}
	})

	t.Run("env vars", func(t *testing.T) {
		t.Chdir(t.TempDir())
		viper.Reset()

		t.Setenv("PORT", "9090")
		t.Setenv("REFRESH_INTERVAL", "1m")
		t.Setenv("STALE_THRESHOLD", "10m")
		t.Setenv("SCAN_INTERVAL", "30s")
		t.Setenv("SCAN_DURATION", "1m")

		config, _, err := initConfig()
		if err != nil {
			t.Fatalf("Failed to initialize config with env vars: %v", err)
		}

		if config.Server.Port != "9090" {
			t.Errorf("Server.Port = %v, want 9090", config.Server.Port)
		}
		if config.Metrics.RefreshInterval != "1m" {
			t.Errorf("Metrics.RefreshInterval = %v, want 1m", config.Metrics.RefreshInterval)
		}
		if config.Metrics.StaleThreshold != "10m" {
			t.Errorf("Metrics.StaleThreshold = %v, want 10m", config.Metrics.StaleThreshold)
		}
		if config.Bluetooth.ScanInterval != "30s" {
			t.Errorf("Bluetooth.ScanInterval = %v, want 30s", config.Bluetooth.ScanInterval)
		}
		if config.Bluetooth.ScanDuration != "1m" {
			t.Errorf("Bluetooth.ScanDuration = %v, want 1m", config.Bluetooth.ScanDuration)
		}
	})
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
		{"Invalid format", "invalid", "30s"},
		{"Empty string", "", "30s"},
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

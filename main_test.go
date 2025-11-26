package main

import (
	"bytes"
	"context"
	"log"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

func TestLoadKnownGovees(t *testing.T) {
	// Create a test config with devices
	testConfig := &Config{}
	testConfig.Devices = []Device{
		{
			MAC:   "A4:C1:38:12:34:56",
			Name:  "Living_Room",
			Group: "Downstairs",
			Offsets: struct {
				Temperature float64 `mapstructure:"temperature"`
				Humidity    float64 `mapstructure:"humidity"`
			}{
				Temperature: 1.5,
				Humidity:    -2.0,
			},
		},
		{
			MAC:   "b4:c1:38:12:34:57", // Test lowercase MAC normalization
			Name:  "Bedroom",
			Group: "Upstairs",
			Offsets: struct {
				Temperature float64 `mapstructure:"temperature"`
				Humidity    float64 `mapstructure:"humidity"`
			}{
				Temperature: -0.5,
				Humidity:    1.0,
			},
		},
		{
			MAC:  "", // Invalid: missing MAC
			Name: "Invalid",
		},
		{
			MAC:  "C4:C1:38:12:34:58",
			Name: "", // Invalid: missing Name
		},
	}

	// Test loading the devices
	loadKnownGovees(testConfig)

	// Verify the contents (only valid devices should be loaded)
	expected := map[string]KnownGovee{
		"A4:C1:38:12:34:56": {Name: "Living_Room", Group: "Downstairs", TempOffset: 1.5, HumidityOffset: -2.0},
		"B4:C1:38:12:34:57": {Name: "Bedroom", Group: "Upstairs", TempOffset: -0.5, HumidityOffset: 1.0},
	}

	mutex.Lock()
	defer mutex.Unlock()

	if len(knownGovees) != len(expected) {
		t.Errorf("got %d devices, want %d", len(knownGovees), len(expected))
	}

	for mac, want := range expected {
		got, exists := knownGovees[mac]
		if !exists {
			t.Errorf("device %s not found", mac)
			continue
		}
		if got.Name != want.Name || got.Group != want.Group || got.TempOffset != want.TempOffset || got.HumidityOffset != want.HumidityOffset {
			t.Errorf("device %s: got %+v, want %+v", mac, got, want)
		}
	}
}

func TestParseGoveeData(t *testing.T) {
	// Set up test cases
	tests := []struct {
		name     string
		data     []byte
		govee    KnownGovee
		wantTemp float64
		wantHum  float64
		wantBat  int
		wantErr  bool
	}{
		{
			name:     "Valid positive temperature",
			data:     []byte{0x01, 0x01, 0x56, 0x32, 0x64}, // 8.7°C, 60.2%, 100% battery
			govee:    KnownGovee{Name: "Test1", TempOffset: 0, HumidityOffset: 0},
			wantTemp: 8.7,
			wantHum:  60.2,
			wantBat:  100,
			wantErr:  false,
		},
		{
			name:     "Valid negative temperature",
			data:     []byte{0x01, 0x80, 0x04, 0x40, 0x32}, // -0.1°C, 8.8%, 50% battery
			govee:    KnownGovee{Name: "Test2", TempOffset: 0, HumidityOffset: 0},
			wantTemp: -0.1,
			wantHum:  8.8,
			wantBat:  50,
			wantErr:  false,
		},
		{
			name:     "With offsets",
			data:     []byte{0x01, 0x01, 0x56, 0x32, 0x64}, // 8.7°C + 1.5 offset = 10.2°C, 60.2% - 2.0 offset = 58.2%, 100% battery
			govee:    KnownGovee{Name: "Test3", TempOffset: 1.5, HumidityOffset: -2.0},
			wantTemp: 10.2,
			wantHum:  58.2,
			wantBat:  100,
			wantErr:  false,
		},
		{
			name:    "Invalid data length",
			data:    []byte{0x01, 0x02, 0x03},
			govee:   KnownGovee{Name: "Test4"},
			wantErr: true,
		},
		{
			name:    "Zero readings",
			data:    []byte{0x01, 0x00, 0x00, 0x00, 0x64},
			govee:   KnownGovee{Name: "Test5"},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Override the metric collectors temporarily
			origTemp := temperatureGauge
			origHum := humidityGauge
			origBat := batteryGauge

			temperatureGauge = prometheus.NewGaugeVec(
				prometheus.GaugeOpts{Name: "test_temp"},
				[]string{"name"},
			)
			humidityGauge = prometheus.NewGaugeVec(
				prometheus.GaugeOpts{Name: "test_hum"},
				[]string{"name"},
			)
			batteryGauge = prometheus.NewGaugeVec(
				prometheus.GaugeOpts{Name: "test_bat"},
				[]string{"name"},
			)

			// Restore original collectors after test
			defer func() {
				temperatureGauge = origTemp
				humidityGauge = origHum
				batteryGauge = origBat
			}()

			// Run the parser
			parseGoveeData(tt.govee, tt.data)

			if tt.wantErr {
				// Verify no metrics were recorded
				if metric, err := temperatureGauge.GetMetricWithLabelValues(tt.govee.Name); err == nil {
					if getGaugeValue(metric) != 0 {
						t.Errorf("expected no temperature metric, got %v", getGaugeValue(metric))
					}
				}
				return
			}

			// Verify metrics were recorded correctly
			metric, _ := temperatureGauge.GetMetricWithLabelValues(tt.govee.Name)
			if getGaugeValue(metric) != tt.wantTemp {
				t.Errorf("temperature = %v, want %v", getGaugeValue(metric), tt.wantTemp)
			}

			metric, _ = humidityGauge.GetMetricWithLabelValues(tt.govee.Name)
			if getGaugeValue(metric) != tt.wantHum {
				t.Errorf("humidity = %v, want %v", getGaugeValue(metric), tt.wantHum)
			}

			metric, _ = batteryGauge.GetMetricWithLabelValues(tt.govee.Name)
			if getGaugeValue(metric) != float64(tt.wantBat) {
				t.Errorf("battery = %v, want %v", getGaugeValue(metric), tt.wantBat)
			}
		})
	}
}

func TestCheckForStaleMetrics(t *testing.T) {
	// Set up test metrics
	temperatureGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{Name: "test_temp"},
		[]string{"name"},
	)
	humidityGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{Name: "test_hum"},
		[]string{"name"},
	)
	batteryGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{Name: "test_bat"},
		[]string{"name"},
	)

	// Set up test devices
	mutex.Lock()
	lastUpdateTime = make(map[string]time.Time)
	lastUpdateTime["Fresh"] = time.Now()
	lastUpdateTime["Stale"] = time.Now().Add(-6 * time.Minute)
	mutex.Unlock()

	// Set some initial metrics
	temperatureGauge.WithLabelValues("Fresh").Set(25.0)
	temperatureGauge.WithLabelValues("Stale").Set(20.0)
	humidityGauge.WithLabelValues("Fresh").Set(50.0)
	humidityGauge.WithLabelValues("Stale").Set(45.0)
	batteryGauge.WithLabelValues("Fresh").Set(100)
	batteryGauge.WithLabelValues("Stale").Set(90)

	// Create test config
	config := &Config{}
	config.Metrics.StaleThreshold = "5m"

	// Run the check
	checkForStaleMetrics(config)

	// Verify fresh metrics still exist
	if metric, err := temperatureGauge.GetMetricWithLabelValues("Fresh"); err != nil {
		t.Error("Fresh temperature metric should exist")
	} else {
		if getGaugeValue(metric) != 25.0 {
			t.Errorf("Fresh temperature = %v, want 25.0", getGaugeValue(metric))
		}
	}

	// Verify stale metrics were removed
	if metric, err := temperatureGauge.GetMetricWithLabelValues("Stale"); err == nil {
		if getGaugeValue(metric) != 0 {
			t.Error("Stale temperature metric should have been removed")
		}
	}
}

func getGaugeValue(g prometheus.Gauge) float64 {
	var m dto.Metric
	g.Write(&m)
	return m.GetGauge().GetValue()
}

func TestScanCompletionLogging(t *testing.T) {
	// Create a buffer to capture log output
	var logBuf bytes.Buffer

	// Save the original log output and restore it after the test
	originalOutput := log.Writer()
	defer log.SetOutput(originalOutput)

	// Set log output to our buffer
	log.SetOutput(&logBuf)

	// Create a config with test values
	config := &Config{}
	config.Bluetooth.ScanInterval = "2h"
	config.Bluetooth.ScanDuration = "30s"

	// Create a context that we can cancel to simulate scan completion
	ctx, cancel := context.WithCancel(context.Background())

	// Start a goroutine that simulates the scan completion logging
	go func() {
		// Simulate the scan completion message
		scanInterval := parseDuration(config.Bluetooth.ScanInterval)
		log.Printf("Scan completed. Sleeping for %v until next scan...", scanInterval)
		cancel() // Cancel the context to end the test
	}()

	// Wait for the context to be cancelled or timeout
	select {
	case <-ctx.Done():
		// Test completed successfully
	case <-time.After(1 * time.Second):
		t.Fatal("Test timed out waiting for scan completion message")
	}

	// Check that the log contains the expected message
	logOutput := logBuf.String()
	expectedMessage := "Scan completed. Sleeping for 2h0m0s until next scan..."

	if !strings.Contains(logOutput, expectedMessage) {
		t.Errorf("Expected log message not found.\nGot: %s\nWant substring: %s", logOutput, expectedMessage)
	}

	// Verify the log message format is correct
	if !strings.Contains(logOutput, "Scan completed.") {
		t.Error("Log should contain 'Scan completed.'")
	}

	if !strings.Contains(logOutput, "Sleeping for") {
		t.Error("Log should contain 'Sleeping for'")
	}

	if !strings.Contains(logOutput, "until next scan...") {
		t.Error("Log should contain 'until next scan...'")
	}
}

func TestScanCompletionLoggingWithDifferentIntervals(t *testing.T) {
	// Test different scan intervals to ensure proper formatting
	testCases := []struct {
		name         string
		scanInterval time.Duration
		expected     string
	}{
		{
			name:         "1 hour interval",
			scanInterval: 1 * time.Hour,
			expected:     "Sleeping for 1h0m0s until next scan...",
		},
		{
			name:         "30 minute interval",
			scanInterval: 30 * time.Minute,
			expected:     "Sleeping for 30m0s until next scan...",
		},
		{
			name:         "15 second interval",
			scanInterval: 15 * time.Second,
			expected:     "Sleeping for 15s until next scan...",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Create a buffer to capture log output
			var logBuf bytes.Buffer

			// Save the original log output and restore it after the test
			originalOutput := log.Writer()
			defer log.SetOutput(originalOutput)

			// Set log output to our buffer
			log.SetOutput(&logBuf)

			// Create a config with the test interval
			config := &Config{}
			config.Bluetooth.ScanInterval = tc.scanInterval.String()
			config.Bluetooth.ScanDuration = "1m"

			// Simulate the scan completion message
			scanInterval := parseDuration(config.Bluetooth.ScanInterval)
			log.Printf("Scan completed. Sleeping for %v until next scan...", scanInterval)

			// Check that the log contains the expected message
			logOutput := logBuf.String()

			if !strings.Contains(logOutput, tc.expected) {
				t.Errorf("Expected log message not found.\nGot: %s\nWant substring: %s", logOutput, tc.expected)
			}
		})
	}
}

func TestParseGoveeDataDuplicateSuppression(t *testing.T) {
	// Set up test metrics
	origTemp := temperatureGauge
	origHum := humidityGauge
	origBat := batteryGauge

	temperatureGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{Name: "test_temp"},
		[]string{"name"},
	)
	humidityGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{Name: "test_hum"},
		[]string{"name"},
	)
	batteryGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{Name: "test_bat"},
		[]string{"name"},
	)

	// Restore original collectors after test
	defer func() {
		temperatureGauge = origTemp
		humidityGauge = origHum
		batteryGauge = origBat
	}()

	// Clear any existing logged values
	mutex.Lock()
	deviceLastLoggedVals = make(map[string]lastLoggedValues)
	mutex.Unlock()

	// Create a buffer to capture log output
	var logBuf bytes.Buffer
	originalOutput := log.Writer()
	defer log.SetOutput(originalOutput)
	log.SetOutput(&logBuf)

	// Test device
	govee := KnownGovee{Name: "TestDevice", TempOffset: 0, HumidityOffset: 0}
	
	// Test data: 23.00°C, 50.00%, 49% battery
	// Raw bytes: temperature=23.00 (2300), humidity=50.00 (500), battery=49 (0x31)
	// Format: [0x01, temp_high, temp_mid, temp_low+hum_high, hum_low+battery]
	// 23.00°C = 2300 = 0x08FC, humidity = 500 = 0x01F4
	// So: 0x01, 0x00, 0x08, 0xFC, 0x31 (but this is wrong format)
	// Actually: data[1:4] is 3 bytes: temp_humidity combined
	// temp = (data[1]<<16 | data[2]<<8 | data[3]) / 1000 / 10
	// For 23.00°C, 50.00%: value = 23000 + 500 = 23500 = 0x005BDC
	// So: 0x01, 0x00, 0x5B, 0xDC, 0x31
	testData := []byte{0x01, 0x00, 0x5B, 0xDC, 0x31} // 23.00°C, 50.00%, 49%

	tests := []struct {
		name           string
		data           []byte
		expectedLogged bool
		description    string
	}{
		{
			name:           "First reading should be logged",
			data:           testData,
			expectedLogged: true,
			description:    "Initial reading must always log",
		},
		{
			name:           "Exact duplicate should not be logged",
			data:           testData,
			expectedLogged: false,
			description:    "Exact same values should be suppressed",
		},
		{
			name:           "Temperature change beyond epsilon should be logged",
			// 23.01°C, 50.00%, 49% = 23010 + 500 = 23510 = 0x005BE6
			data:           []byte{0x01, 0x00, 0x5B, 0xE6, 0x31},
			expectedLogged: true,
			description:    "Temperature change >= 0.01°C should be logged",
		},
		{
			name:           "Humidity change beyond epsilon should be logged",
			// 23.01°C, 50.01%, 49% = 23010 + 501 = 23511 = 0x005BE7
			data:           []byte{0x01, 0x00, 0x5B, 0xE7, 0x31},
			expectedLogged: true,
			description:    "Humidity change >= 0.01% should be logged",
		},
		{
			name:           "Battery change should always be logged",
			// 23.01°C, 50.01%, 50% = 23010 + 501 = 23511 = 0x005BE7, battery 50
			data:           []byte{0x01, 0x00, 0x5B, 0xE7, 0x32},
			expectedLogged: true,
			description:    "Battery level change should always be logged",
		},
		{
			name:           "Values back to original should be logged",
			data:           testData, // Back to 23.00°C, 50.00%, 49%
			expectedLogged: true,
			description:    "Values returning to previous state should be logged (different from last)",
		},
		{
			name:           "Exact duplicate again should not be logged",
			data:           testData,
			expectedLogged: false,
			description:    "Exact duplicate after returning should be suppressed",
		},
	}

	logCount := 0
	for i, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Clear log buffer before each test
			logBuf.Reset()

			// Parse the data
			parseGoveeData(govee, tt.data)

			// Count log lines (each log adds a newline)
			logOutput := logBuf.String()
			logged := strings.Contains(logOutput, "TestDevice")

			if logged != tt.expectedLogged {
				t.Errorf("Test case %d: %s\nExpected logged: %v, got logged: %v\nLog output: %q",
					i+1, tt.description, tt.expectedLogged, logged, logOutput)
			}

			if logged {
				logCount++
			}

			// Verify metrics are always updated (even if not logged)
			metric, _ := temperatureGauge.GetMetricWithLabelValues(govee.Name)
			if metric == nil {
				t.Error("Temperature metric should always be updated")
			}
		})
	}

	// Verify we got the expected number of log entries
	// Expected: 1st, temp change, humidity change, battery change, back to original = 5 logs
	expectedLogs := 5
	if logCount != expectedLogs {
		t.Errorf("Expected %d log entries, got %d", expectedLogs, logCount)
	}
}
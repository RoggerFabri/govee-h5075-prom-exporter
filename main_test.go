package main

import (
	"os"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

func TestLoadKnownGovees(t *testing.T) {
	// Create a temporary test file
	content := `A4:C1:38:12:34:56 Living_Room 1.5 -2.0
B4:C1:38:12:34:57 Bedroom -0.5 1.0
Invalid Line
C4:C1:38:12:34:58 Kitchen invalid offset
`
	tmpfile, err := os.CreateTemp("", "known_govees")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tmpfile.Name())

	if _, err := tmpfile.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := tmpfile.Close(); err != nil {
		t.Fatal(err)
	}

	// Temporarily replace the filename constant
	os.Rename(".known_govees", ".known_govees.bak")
	defer os.Rename(".known_govees.bak", ".known_govees")

	if err := os.Symlink(tmpfile.Name(), ".known_govees"); err != nil {
		t.Fatal(err)
	}

	// Test loading the file
	loadKnownGovees()

	// Verify the contents
	expected := map[string]KnownGovee{
		"A4:C1:38:12:34:56": {Name: "Living_Room", TempOffset: 1.5, HumidityOffset: -2.0},
		"B4:C1:38:12:34:57": {Name: "Bedroom", TempOffset: -0.5, HumidityOffset: 1.0},
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
		if got.Name != want.Name || got.TempOffset != want.TempOffset || got.HumidityOffset != want.HumidityOffset {
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

	// Set stale threshold to 5 minutes
	staleThreshold = 5 * time.Minute

	// Run the check
	checkForStaleMetrics()

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

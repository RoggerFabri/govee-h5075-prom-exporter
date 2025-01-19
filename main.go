package main

import (
	"bufio"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	temperatureGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "govee_h5075_temperature",
			Help: "Temperature readings from Govee H5075 sensors",
		},
		[]string{"name"},
	)

	humidityGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "govee_h5075_humidity",
			Help: "Humidity readings from Govee H5075 sensors",
		},
		[]string{"name"},
	)

	batteryGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "govee_h5075_battery",
			Help: "Battery levels of Govee H5075 sensors",
		},
		[]string{"name"},
	)
)

// Track the last update time for each location
var lastUpdateTime = make(map[string]time.Time)
var mutex = &sync.Mutex{} // Protect access to the lastUpdateTime map

// Default thresholds
var staleThreshold time.Duration

func init() {
	// Register Prometheus metrics
	prometheus.MustRegister(temperatureGauge)
	prometheus.MustRegister(humidityGauge)
	prometheus.MustRegister(batteryGauge)
}

func parseLogsAndUpdateMetrics(logDir string) {
	files, err := filepath.Glob(filepath.Join(logDir, "*.log"))
	if err != nil {
		log.Printf("Error finding log files in %s: %v", logDir, err)
		return
	}

	// Keep track of locations updated in this cycle
	updatedLocations := make(map[string]bool)

	for _, file := range files {
		location := strings.TrimSuffix(filepath.Base(file), ".log")

		// Open the log file
		f, err := os.Open(file)
		if err != nil {
			log.Printf("Error opening file %s: %v", file, err)
			continue
		}
		defer f.Close()

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			parts := strings.Split(line, ",")
			if len(parts) < 5 {
				log.Printf("Skipping invalid line in %s: %s", file, line)
				continue
			}

			// Parse temperature, humidity, and battery
			temp, err := strconv.ParseFloat(parts[2], 64)
			if err != nil {
				log.Printf("Error parsing temperature in %s: %s", file, err)
				continue
			}

			humidity, err := strconv.ParseFloat(parts[3], 64)
			if err != nil {
				log.Printf("Error parsing humidity in %s: %s", file, err)
				continue
			}

			battery, err := strconv.ParseFloat(parts[4], 64)
			if err != nil {
				log.Printf("Error parsing battery in %s: %s", file, err)
				continue
			}

			// Update Prometheus metrics
			temperatureGauge.WithLabelValues(location).Set(temp)
			humidityGauge.WithLabelValues(location).Set(humidity)
			batteryGauge.WithLabelValues(location).Set(battery)

			// Mark location as updated
			updatedLocations[location] = true

			// Update the last update time
			mutex.Lock()
			lastUpdateTime[location] = time.Now()
			mutex.Unlock()
		}

		if err := scanner.Err(); err != nil {
			log.Printf("Error reading file %s: %v", file, err)
		}
	}

	// Check for stale metrics
	checkForStaleMetrics(updatedLocations)
}

func checkForStaleMetrics(updatedLocations map[string]bool) {
	mutex.Lock()
	defer mutex.Unlock()

	now := time.Now()
	for location, lastUpdate := range lastUpdateTime {
		if now.Sub(lastUpdate) > staleThreshold {
			// Mark metrics as stale if they are not updated in this cycle
			if !updatedLocations[location] {
				temperatureGauge.DeleteLabelValues(location)
				humidityGauge.DeleteLabelValues(location)
				batteryGauge.DeleteLabelValues(location)
				log.Printf("Metrics for %s have been reset due to inactivity", location)
			}
		}
	}
}

func main() {
	logDir := "logs" // Directory where log files are located

	// Get the refresh interval from the environment variable
	refreshIntervalStr := os.Getenv("REFRESH_INTERVAL")
	if refreshIntervalStr == "" {
		refreshIntervalStr = "30" // Default to 30 seconds
	}

	refreshInterval, err := strconv.Atoi(refreshIntervalStr)
	if err != nil || refreshInterval <= 0 {
		log.Fatalf("Invalid REFRESH_INTERVAL value: %s. Must be a positive integer.", refreshIntervalStr)
	}

	// Get the stale threshold from the environment variable
	staleThresholdStr := os.Getenv("STALE_THRESHOLD")
	if staleThresholdStr == "" {
		staleThresholdStr = "300" // Default to 300 seconds (5 minutes)
	}

	staleThresholdSeconds, err := strconv.Atoi(staleThresholdStr)
	if err != nil || staleThresholdSeconds <= 0 {
		log.Fatalf("Invalid STALE_THRESHOLD value: %s. Must be a positive integer.", staleThresholdStr)
	}

	staleThreshold = time.Duration(staleThresholdSeconds) * time.Second

	// Set up the HTTP handler for /metrics
	http.Handle("/metrics", promhttp.Handler())

	// Background loop to update metrics
	go func() {
		for {
			parseLogsAndUpdateMetrics(logDir)
			time.Sleep(time.Duration(refreshInterval) * time.Second)
		}
	}()

	// Start the HTTP server
	addr := ":8080"
	fmt.Printf("Starting metrics server at %s with refresh interval %d seconds and stale threshold %d seconds\n", addr, refreshInterval, staleThresholdSeconds)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Error starting HTTP server: %v", err)
	}
}

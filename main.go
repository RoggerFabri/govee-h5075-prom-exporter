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
		[]string{"name", "timestamp"},
	)

	humidityGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "govee_h5075_humidity",
			Help: "Humidity readings from Govee H5075 sensors",
		},
		[]string{"name", "timestamp"},
	)

	batteryGauge = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "govee_h5075_battery",
			Help: "Battery levels of Govee H5075 sensors",
		},
		[]string{"name", "timestamp"},
	)
)

// Track the last update time for each file
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

	for _, file := range files {
		location := strings.TrimSuffix(filepath.Base(file), ".log")

		// Get file info to check modification time
		fileInfo, err := os.Stat(file)
		if err != nil {
			log.Printf("Error getting file info for %s: %v", file, err)
			continue
		}

		// Check last modification time
		modTime := fileInfo.ModTime()

		// Update last modification time
		mutex.Lock()
		lastUpdateTime[location] = modTime
		mutex.Unlock()

		// Parse the file's contents to update metrics
		parseFileAndUpdateMetrics(file, location)
	}

	// Check for stale metrics
	checkForStaleMetrics()
}

func parseFileAndUpdateMetrics(file, location string) {
	// Open the log file
	f, err := os.Open(file)
	if err != nil {
		log.Printf("Error opening file %s: %v", file, err)
		return
	}
	defer f.Close()

	// Read the file's contents
	scanner := bufio.NewScanner(f)
	var lastLine string
	for scanner.Scan() {
		lastLine = scanner.Text() // Keep only the last line
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Error reading file %s: %v", file, err)
		return
	}

	// Parse the last line
	parts := strings.Split(lastLine, ",")
	if len(parts) < 6 {
		log.Printf("Invalid line format in %s: %s", file, lastLine)
		return
	}

	// Extract and parse timestamp, temperature, humidity, and battery
	timestamp := parts[0]
	temp, err := strconv.ParseFloat(parts[2], 64)
	if err != nil {
		log.Printf("Error parsing temperature in %s: %s", file, err)
		return
	}

	humidity, err := strconv.ParseFloat(parts[3], 64)
	if err != nil {
		log.Printf("Error parsing humidity in %s: %s", file, err)
		return
	}

	battery, err := strconv.ParseFloat(parts[4], 64)
	if err != nil {
		log.Printf("Error parsing battery in %s: %s", file, err)
		return
	}

	// Update Prometheus metrics
	temperatureGauge.WithLabelValues(location, timestamp).Set(temp)
	humidityGauge.WithLabelValues(location, timestamp).Set(humidity)
	batteryGauge.WithLabelValues(location, timestamp).Set(battery)
}

func checkForStaleMetrics() {
	mutex.Lock()
	defer mutex.Unlock()

	now := time.Now()
	for location, modTime := range lastUpdateTime {
		// Reset metrics if the file has not been modified within the threshold
		if now.Sub(modTime) > staleThreshold {
			temperatureGauge.DeleteLabelValues(location)
			humidityGauge.DeleteLabelValues(location)
			batteryGauge.DeleteLabelValues(location)
			log.Printf("Metrics for %s have been reset due to inactivity (last modified at %s)", location, modTime)
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

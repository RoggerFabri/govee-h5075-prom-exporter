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
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Define Prometheus metrics
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

func init() {
	// Register the metrics
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
		// Extract the location name from the file name
		location := strings.TrimSuffix(filepath.Base(file), ".log")

		// Open the file
		f, err := os.Open(file)
		if err != nil {
			log.Printf("Error opening file %s: %v", file, err)
			continue
		}
		defer f.Close()

		// Read the file line by line
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
		}

		if err := scanner.Err(); err != nil {
			log.Printf("Error reading file %s: %v", file, err)
		}
	}
}

func main() {
	logDir := "logs" // Directory where log files are located

	// Get the refresh interval from the environment variable
	refreshIntervalStr := os.Getenv("REFRESH_INTERVAL")
	if refreshIntervalStr == "" {
		refreshIntervalStr = "5" // Default to 30 seconds if not set
	}

	refreshInterval, err := strconv.Atoi(refreshIntervalStr)
	if err != nil || refreshInterval <= 0 {
		log.Fatalf("Invalid REFRESH_INTERVAL value: %s. Must be a positive integer.", refreshIntervalStr)
	}

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
	fmt.Printf("Starting metrics server at %s with refresh interval %d seconds\n", addr, refreshInterval)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Error starting HTTP server: %v", err)
	}
}

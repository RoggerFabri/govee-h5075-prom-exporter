package main

import (
	"bufio"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"tinygo.org/x/bluetooth"
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

type KnownGovee struct {
	Name           string
	TempOffset     float64
	HumidityOffset float64
}

var (
	adapter        = bluetooth.DefaultAdapter
	knownGovees    = make(map[string]KnownGovee)
	lastUpdateTime = make(map[string]time.Time)
	mutex          = &sync.Mutex{}
	staleThreshold time.Duration
)

func init() {
	// Register Prometheus metrics
	prometheus.MustRegister(temperatureGauge)
	prometheus.MustRegister(humidityGauge)
	prometheus.MustRegister(batteryGauge)
}

func loadKnownGovees() {
	knownFile := ".known_govees"
	file, err := os.Open(knownFile)
	if err != nil {
		log.Fatalf("Error opening known devices file %s: %v", knownFile, err)
	}
	defer file.Close()

	newMap := make(map[string]KnownGovee)

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 4 {
			log.Printf("Skipping invalid line in known devices file: %s", scanner.Text())
			continue
		}

		mac := strings.ToUpper(fields[0])
		name := fields[1]
		tempOffset, err1 := strconv.ParseFloat(fields[2], 64)
		humidityOffset, err2 := strconv.ParseFloat(fields[3], 64)

		if err1 != nil || err2 != nil {
			log.Printf("Skipping line with invalid offsets in known devices file: %s", scanner.Text())
			continue
		}

		newMap[mac] = KnownGovee{Name: name, TempOffset: tempOffset, HumidityOffset: humidityOffset}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Error reading known devices file: %v", err)
	}

	mutex.Lock()
	knownGovees = newMap
	mutex.Unlock()

	log.Println("Loaded known Govee H5075 devices:", knownGovees)
}

func startBLEScanner() {
	if err := adapter.Enable(); err != nil {
		log.Fatalf("Failed to enable Bluetooth adapter: %v", err)
	}

	log.Println("Scanning for Govee H5075 devices...")
	err := adapter.Scan(scanCallback)
	if err != nil {
		log.Fatalf("Failed to start scanning: %v", err)
	}
}

func scanCallback(adapter *bluetooth.Adapter, device bluetooth.ScanResult) {
	macAddr := strings.ToUpper(device.Address.String())

	mutex.Lock()
	govee, exists := knownGovees[macAddr]
	mutex.Unlock()

	if !exists {
		log.Printf("Ignoring unknown device: %s", macAddr)
		return
	}

	// Get Manufacturer Data
	manufacturerDataElements := device.ManufacturerData()
	if len(manufacturerDataElements) == 0 {
		return // No manufacturer data, ignore
	}

	// Extract manufacturer data payload
	for _, element := range manufacturerDataElements {
		if element.CompanyID == 0xEC88 { // Govee Manufacturer ID
			parseGoveeData(govee, element.Data)
		}
	}
}

func parseGoveeData(govee KnownGovee, data []byte) {
	if len(data) < 5 {
		log.Printf("[%s] Ignoring invalid data (length: %d): %v", govee.Name, len(data), data)
		return
	}

	// Extract the 3-byte temperature/humidity raw value (Big Endian)
	raw := uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3])

	// Handle negative temperatures (if the highest bit is set)
	var isNegative bool
	if raw&0x800000 != 0 {
		isNegative = true
		raw ^= 0x800000
	}

	// Extract temperature & humidity
	temperature := float64(int(raw/1000)) / 10.0
	if isNegative {
		temperature = -temperature
	}
	humidity := float64(raw%1000) / 10.0

	// Extract battery level (last byte)
	batteryLevel := int(data[4])

	// Apply offsets from .known_govees
	temperature += govee.TempOffset
	humidity += govee.HumidityOffset

	// Prevent impossible humidity values (> 100%)
	if humidity > 100.0 {
		log.Printf("[%s] WARNING: Invalid Humidity Value %.2f%% (Ignoring)", govee.Name, humidity)
		humidity = 100.0
	}

	// Update Prometheus metrics
	temperatureGauge.WithLabelValues(govee.Name).Set(temperature)
	humidityGauge.WithLabelValues(govee.Name).Set(humidity)
	batteryGauge.WithLabelValues(govee.Name).Set(float64(batteryLevel))

	// Update last seen time
	mutex.Lock()
	lastUpdateTime[govee.Name] = time.Now()
	mutex.Unlock()

	log.Printf("[%s] Temp: %.2f°C | Humidity: %.2f%% | Battery: %d%%", govee.Name, temperature, humidity, batteryLevel)
}

func checkForStaleMetrics() {
	mutex.Lock()
	defer mutex.Unlock()

	now := time.Now()
	for device, lastSeen := range lastUpdateTime {
		if now.Sub(lastSeen) > staleThreshold {
			temperatureGauge.DeleteLabelValues(device)
			humidityGauge.DeleteLabelValues(device)
			batteryGauge.DeleteLabelValues(device)
			log.Printf("Metrics for %s reset due to inactivity (last seen at %s)", device, lastSeen)
		}
	}
}

func main() {
	loadKnownGovees()

	go func() {
		for {
			time.Sleep(60 * time.Second)
			loadKnownGovees()
		}
	}()

	refreshIntervalStr := os.Getenv("REFRESH_INTERVAL")
	if refreshIntervalStr == "" {
		refreshIntervalStr = "30"
	}

	refreshInterval, err := strconv.Atoi(refreshIntervalStr)
	if err != nil || refreshInterval <= 0 {
		log.Fatalf("Invalid REFRESH_INTERVAL: %s", refreshIntervalStr)
	}

	staleThresholdStr := os.Getenv("STALE_THRESHOLD")
	if staleThresholdStr == "" {
		staleThresholdStr = "300"
	}

	staleThresholdSeconds, err := strconv.Atoi(staleThresholdStr)
	if err != nil || staleThresholdSeconds <= 0 {
		log.Fatalf("Invalid STALE_THRESHOLD: %s", staleThresholdStr)
	}

	staleThreshold = time.Duration(staleThresholdSeconds) * time.Second

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	go startBLEScanner()

	go func() {
		for {
			time.Sleep(time.Duration(refreshInterval) * time.Second)
			checkForStaleMetrics()
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.Handle("/", http.RedirectHandler("/metrics", http.StatusFound))

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	// Set up signal handling for graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	// Start server in a goroutine
	go func() {
		log.Printf("Starting metrics server on port %s with refresh interval %d seconds and stale threshold %d seconds\n", port, refreshInterval, staleThresholdSeconds)
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Wait for shutdown signal
	<-stop
	log.Println("Shutting down...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Error during server shutdown: %v", err)
	}
}

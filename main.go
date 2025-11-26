package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
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

	openMeteoTemperatureGauge = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "openmeteo_temperature",
			Help: "Temperature from OpenMeteo API",
		},
	)

	openMeteoHumidityGauge = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "openmeteo_humidity",
			Help: "Humidity from OpenMeteo API",
		},
	)
)

type KnownGovee struct {
	Name           string
	Group          string
	TempOffset     float64
	HumidityOffset float64
}

var (
	adapter           = bluetooth.DefaultAdapter
	knownGovees       = make(map[string]KnownGovee)
	lastUpdateTime    = make(map[string]time.Time)
	mutex             = &sync.Mutex{}
	openMeteoConfig   *Config
	openMeteoConfigMu = &sync.RWMutex{}
)

// Application constants
const (
	goveeManufacturerID = uint16(0xEC88)
	shutdownTimeout     = 5 * time.Second
)

func init() {
	// Register Prometheus metrics
	prometheus.MustRegister(temperatureGauge)
	prometheus.MustRegister(humidityGauge)
	prometheus.MustRegister(batteryGauge)
	prometheus.MustRegister(openMeteoTemperatureGauge)
	prometheus.MustRegister(openMeteoHumidityGauge)
}

// loadKnownGovees loads device configuration from config into the knownGovees map
func loadKnownGovees(config *Config) {
	if config == nil {
		log.Println("Warning: No configuration provided. No devices will be monitored.")
		return
	}

	newMap := make(map[string]KnownGovee)

	for _, device := range config.Devices {
		if device.MAC == "" || device.Name == "" {
			log.Printf("Skipping device with missing MAC or name: %+v", device)
			continue
		}

		mac := strings.ToUpper(device.MAC)
		newMap[mac] = KnownGovee{
			Name:           device.Name,
			Group:          device.Group,
			TempOffset:     device.Offsets.Temperature,
			HumidityOffset: device.Offsets.Humidity,
		}
	}

	mutex.Lock()
	knownGovees = newMap
	mutex.Unlock()

	// Format and log the known devices
	if len(knownGovees) == 0 {
		log.Println("Warning: No devices configured. Add devices to config.yaml to start monitoring.")
	} else {
		log.Println("Loaded known Govee H5075 devices:")
		for mac, device := range knownGovees {
			groupInfo := ""
			if device.Group != "" {
				groupInfo = fmt.Sprintf(" [%s]", device.Group)
			}
			log.Printf("  %-17s -> Name: %-15s%s  TempOffset: %4.1f°C  HumidityOffset: %4.1f%%",
				mac,
				device.Name,
				groupInfo,
				device.TempOffset,
				device.HumidityOffset)
		}
	}
}

func startBLEScanner(ctx context.Context, config *Config) {
	// Add retry logic for enabling the adapter
	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		if err := adapter.Enable(); err != nil {
			if i == maxRetries-1 {
				log.Fatalf("Failed to enable Bluetooth adapter after %d attempts: %v", maxRetries, err)
			}
			log.Printf("Failed to enable Bluetooth adapter (attempt %d/%d): %v", i+1, maxRetries, err)
			time.Sleep(2 * time.Second)
			continue
		}
		break
	}

	log.Println("Scanning for Govee H5075 devices...")

	for {
		select {
		case <-ctx.Done():
			adapter.StopScan()
			return
		default:
			// Create a context with timeout for scan duration
			scanCtx, cancel := context.WithTimeout(ctx, parseDuration(config.Bluetooth.ScanDuration))

			// Start scanning with context
			err := adapter.Scan(func(_ *bluetooth.Adapter, device bluetooth.ScanResult) {
				select {
				case <-scanCtx.Done():
					adapter.StopScan()
					return
				default:
					scanCallback(device)
				}
			})

			cancel()

			if err != nil {
				log.Printf("Scanning failed, retrying in 5 seconds: %v", err)
				time.Sleep(5 * time.Second)
				continue
			}

			// Log completion of scan and upcoming sleep period
			scanInterval := parseDuration(config.Bluetooth.ScanInterval)
			log.Printf("Scan completed. Sleeping for %v until next scan...", scanInterval)

			// Rest period between scans
			select {
			case <-ctx.Done():
				return
			case <-time.After(scanInterval):
			}
		}
	}
}

func scanCallback(device bluetooth.ScanResult) {
	macAddr := strings.ToUpper(device.Address.String())

	mutex.Lock()
	govee, exists := knownGovees[macAddr]
	mutex.Unlock()

	if !exists {
		return
	}

	// Get Manufacturer Data
	manufacturerDataElements := device.ManufacturerData()
	if len(manufacturerDataElements) == 0 {
		return // No manufacturer data, ignore
	}

	// Extract manufacturer data payload
	for _, element := range manufacturerDataElements {
		if element.CompanyID == goveeManufacturerID {
			parseGoveeData(govee, element.Data)
		}
	}
}

func parseGoveeData(govee KnownGovee, data []byte) {
	if len(data) < 5 {
		log.Printf("[%s] Ignoring invalid data (length: %d): %v", govee.Name, len(data), data)
		return
	}

	// Validate data[1:4] contains valid temperature/humidity encoding
	if data[1] == 0 && data[2] == 0 && data[3] == 0 {
		log.Printf("[%s] Ignoring invalid zero readings", govee.Name)
		return
	}

	// Add reasonable bounds checking
	const (
		minTemp     = -40.0
		maxTemp     = 60.0
		minHumidity = 0.0
		maxHumidity = 100.0
	)

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

	// Validate temperature and humidity before applying offsets
	if temperature < minTemp || temperature > maxTemp {
		log.Printf("[%s] WARNING: Invalid Temperature Value %.2f°C (Ignoring)", govee.Name, temperature)
		return
	}

	if humidity < minHumidity || humidity > maxHumidity {
		log.Printf("[%s] WARNING: Invalid Humidity Value %.2f%% (Ignoring)", govee.Name, humidity)
		return
	}

	// Extract battery level (last byte)
	batteryLevel := int(data[4])

	// Apply calibration offsets from configuration
	temperature += govee.TempOffset
	humidity += govee.HumidityOffset

	// Format the log message with fixed-width fields
	// Find the longest name in knownGovees for consistent padding
	maxNameLength := 0
	mutex.Lock()
	for _, g := range knownGovees {
		if len(g.Name) > maxNameLength {
			maxNameLength = len(g.Name)
		}
	}
	mutex.Unlock()
	// Format the log message with padding
	logMsg := fmt.Sprintf("%-*s | Temp: %5.2f°C | Humidity: %5.2f%% | Battery: %3d%%",
		maxNameLength,
		govee.Name,
		temperature,
		humidity,
		batteryLevel)

	log.Println(logMsg)

	// Update Prometheus metrics
	temperatureGauge.WithLabelValues(govee.Name).Set(temperature)
	humidityGauge.WithLabelValues(govee.Name).Set(humidity)
	batteryGauge.WithLabelValues(govee.Name).Set(float64(batteryLevel))

	// Update last seen time
	mutex.Lock()
	lastUpdateTime[govee.Name] = time.Now()
	mutex.Unlock()
}

func checkForStaleMetrics(config *Config) {
	mutex.Lock()
	defer mutex.Unlock()

	now := time.Now()
	staleThreshold := parseDuration(config.Metrics.StaleThreshold)
	for device, lastSeen := range lastUpdateTime {
		if now.Sub(lastSeen) > staleThreshold {
			temperatureGauge.DeleteLabelValues(device)
			humidityGauge.DeleteLabelValues(device)
			batteryGauge.DeleteLabelValues(device)

			var macAddr string
			for mac, govee := range knownGovees {
				if govee.Name == device {
					macAddr = mac
					break
				}
			}

			if macAddr != "" {
				log.Printf("Metrics for device '%s' (MAC: %s) reset due to inactivity (last seen at %s)", device, macAddr, lastSeen)
			} else {
				log.Printf("Metrics for device '%s' reset due to inactivity (last seen at %s)", device, lastSeen)
			}
		}
	}
}

// fetchOpenMeteoData fetches weather data from OpenMeteo API and updates Prometheus metrics
func fetchOpenMeteoData(ctx context.Context) {
	openMeteoConfigMu.RLock()
	config := openMeteoConfig
	openMeteoConfigMu.RUnlock()

	if config == nil || !config.OpenMeteo.Enabled {
		return
	}

	client := NewOpenMeteoClient(config.OpenMeteo.Latitude, config.OpenMeteo.Longitude)

	// Create a context with timeout for the API call
	apiCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	temp, humidity, err := client.GetTemperatureAndHumidity(apiCtx)
	if err != nil {
		log.Printf("Failed to fetch OpenMeteo data: %v", err)
		return
	}

	// Update Prometheus metrics
	openMeteoTemperatureGauge.Set(temp)
	openMeteoHumidityGauge.Set(float64(humidity))

	log.Printf("OpenMeteo | Temp: %5.2f°C | Humidity: %5.2f%%", temp, float64(humidity))
}

// updateOpenMeteoConfig safely updates the OpenMeteo configuration
func updateOpenMeteoConfig(newConfig *Config) {
	openMeteoConfigMu.Lock()
	oldEnabled := openMeteoConfig != nil && openMeteoConfig.OpenMeteo.Enabled
	oldInterval := ""
	oldLat := 0.0
	oldLon := 0.0
	if openMeteoConfig != nil {
		oldInterval = openMeteoConfig.OpenMeteo.Interval
		oldLat = openMeteoConfig.OpenMeteo.Latitude
		oldLon = openMeteoConfig.OpenMeteo.Longitude
	}

	openMeteoConfig = newConfig
	newEnabled := newConfig.OpenMeteo.Enabled
	openMeteoConfigMu.Unlock()

	// Log configuration changes
	if oldEnabled != newEnabled {
		if newEnabled {
			log.Printf("OpenMeteo: Enabled (interval: %s, location: %.4f, %.4f)",
				newConfig.OpenMeteo.Interval,
				newConfig.OpenMeteo.Latitude,
				newConfig.OpenMeteo.Longitude)
		} else {
			log.Println("OpenMeteo: Disabled")
		}
	} else if newEnabled {
		// Check if other settings changed
		if oldInterval != newConfig.OpenMeteo.Interval ||
			oldLat != newConfig.OpenMeteo.Latitude ||
			oldLon != newConfig.OpenMeteo.Longitude {
			log.Printf("OpenMeteo: Configuration updated (interval: %s, location: %.4f, %.4f)",
				newConfig.OpenMeteo.Interval,
				newConfig.OpenMeteo.Latitude,
				newConfig.OpenMeteo.Longitude)
		}
	}
}

// startOpenMeteoPoller starts a goroutine that periodically fetches OpenMeteo data
// with support for dynamic configuration updates
func startOpenMeteoPoller(ctx context.Context, config *Config) {
	// Initialize the shared config
	updateOpenMeteoConfig(config)

	if !config.OpenMeteo.Enabled {
		log.Println("OpenMeteo API integration is disabled (will start if enabled via config reload)")
	} else {
		log.Printf("Starting OpenMeteo API poller (interval: %s, location: %.4f, %.4f)",
			config.OpenMeteo.Interval,
			config.OpenMeteo.Latitude,
			config.OpenMeteo.Longitude)
	}

	// Fetch immediately on startup if enabled
	if config.OpenMeteo.Enabled {
		fetchOpenMeteoData(ctx)
	}

	// Dynamic ticker that respects configuration changes
	var ticker *time.Ticker
	var tickerC <-chan time.Time

	// Initialize ticker with current interval
	openMeteoConfigMu.RLock()
	currentInterval := parseDuration(openMeteoConfig.OpenMeteo.Interval)
	openMeteoConfigMu.RUnlock()
	ticker = time.NewTicker(currentInterval)
	tickerC = ticker.C
	defer ticker.Stop()

	// Track last interval to detect changes
	lastInterval := currentInterval

	for {
		select {
		case <-ctx.Done():
			return
		case <-tickerC:
			// Check if interval changed and recreate ticker if needed
			openMeteoConfigMu.RLock()
			cfg := openMeteoConfig
			newInterval := parseDuration(cfg.OpenMeteo.Interval)
			openMeteoConfigMu.RUnlock()

			if newInterval != lastInterval {
				ticker.Stop()
				ticker = time.NewTicker(newInterval)
				tickerC = ticker.C
				lastInterval = newInterval
				log.Printf("OpenMeteo: Polling interval updated to %s", cfg.OpenMeteo.Interval)
			}

			// Fetch data if enabled
			fetchOpenMeteoData(ctx)
		}
	}
}

func main() {
	// Initialize configuration
	config, sources, err := initConfig()
	if err != nil {
		log.Fatalf("Failed to initialize configuration: %v", err)
	}

	// Display configuration sources
	log.Println("Configuration loaded from:")
	log.Println("===========================")
	for _, source := range sources {
		log.Printf("  %-35s = %-20v [%s]", source.Key, source.Value, source.Source)
	}
	log.Println("===========================")

	// Load devices from configuration
	loadKnownGovees(config)

	// Create a context that will be canceled on shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Create a WaitGroup to track all goroutines
	var wg sync.WaitGroup

	// Start configuration file watcher for hot-reload
	wg.Add(1)
	go func() {
		defer wg.Done()
		watchConfigFile(ctx, func(newConfig *Config) {
			loadKnownGovees(newConfig)
			updateOpenMeteoConfig(newConfig)
		})
	}()

	// Start the BLE scanner
	wg.Add(1)
	go func() {
		defer wg.Done()
		startBLEScanner(ctx, config)
	}()

	// Start the stale metrics checker with proper ticker
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(parseDuration(config.Metrics.RefreshInterval))
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				checkForStaleMetrics(config)
			}
		}
	}()

	// Start OpenMeteo API poller (always start so it can be dynamically enabled)
	wg.Add(1)
	go func() {
		defer wg.Done()
		startOpenMeteoPoller(ctx, config)
	}()

	// Serve static files with correct MIME types
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Serve threshold configuration as JavaScript
	mux.HandleFunc("/config.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Header().Set("Cache-Control", "no-cache")

		// Build device groups map
		mutex.Lock()
		deviceGroups := make(map[string]string)
		for _, device := range knownGovees {
			deviceGroups[device.Name] = device.Group
		}
		mutex.Unlock()

		// Convert to JSON securely using encoding/json
		deviceGroupsJSON, err := json.Marshal(deviceGroups)
		if err != nil {
			log.Printf("Error marshaling device groups: %v", err)
			deviceGroupsJSON = []byte("{}")
		}

		configJS := fmt.Sprintf(`// Dashboard configuration from environment variables
window.DASHBOARD_CONFIG = {
    TEMPERATURE_MIN: %v,
    TEMPERATURE_MAX: %v,
    TEMPERATURE_LOW_THRESHOLD: %v,
    TEMPERATURE_HIGH_THRESHOLD: %v,
    HUMIDITY_LOW_THRESHOLD: %v,
    HUMIDITY_HIGH_THRESHOLD: %v,
    BATTERY_LOW_THRESHOLD: %v,
    DEVICE_GROUPS: %s
};`,
			config.Thresholds.Temperature.Min,
			config.Thresholds.Temperature.Max,
			config.Thresholds.Temperature.Low,
			config.Thresholds.Temperature.High,
			config.Thresholds.Humidity.Low,
			config.Thresholds.Humidity.High,
			config.Thresholds.Battery.Low,
			string(deviceGroupsJSON),
		)
		w.Write([]byte(configJS))
	})

	// Middleware to add no-cache headers for all responses
	noCacheHandler := func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Set cache control headers to prevent caching
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")
			h.ServeHTTP(w, r)
		})
	}

	// Create FileServer with no-cache headers
	fs := http.FileServer(http.Dir("static"))
	mux.Handle("/static/", noCacheHandler(http.StripPrefix("/static/", fs)))
	mux.Handle("/", noCacheHandler(fs))

	server := &http.Server{
		Addr:    ":" + config.Server.Port,
		Handler: mux,
	}

	// Set up signal handling for graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	// Start server in a goroutine
	go func() {
		log.Printf(`Starting metrics server with configuration:
    Port:             %s
    Scan Duration:    %v
    Scan Interval:    %v
    Refresh Interval: %v
    Stale Threshold:  %v`,
			config.Server.Port,
			config.Bluetooth.ScanDuration,
			config.Bluetooth.ScanInterval,
			config.Metrics.RefreshInterval,
			config.Metrics.StaleThreshold)
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
			cancel() // Cancel context on server error
		}
	}()

	// Wait for shutdown signal
	<-stop
	log.Println("Shutting down...")

	// Cancel context to stop all goroutines
	cancel()

	// Create shutdown context with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer shutdownCancel()

	// Shutdown HTTP server
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("Error during server shutdown: %v", err)
	}

	// Wait for all goroutines to finish
	wg.Wait()

	log.Println("Shutdown complete")
}

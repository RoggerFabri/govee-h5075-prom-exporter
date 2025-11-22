package main

import (
	"bufio"
	"context"
	"fmt"
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
	"github.com/spf13/viper"
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
)

// Config holds all configuration settings
type Config struct {
	Port            string        `mapstructure:"PORT"`
	RefreshInterval time.Duration `mapstructure:"REFRESH_INTERVAL"`
	StaleThreshold  time.Duration `mapstructure:"STALE_THRESHOLD"`
	ScanInterval    time.Duration `mapstructure:"SCAN_INTERVAL"`
	ScanDuration    time.Duration `mapstructure:"SCAN_DURATION"`
	ReloadInterval  time.Duration `mapstructure:"RELOAD_INTERVAL"`
}

// ThresholdConfig holds dashboard warning threshold settings
type ThresholdConfig struct {
	TemperatureMin           float64 `mapstructure:"TEMPERATURE_MIN"`
	TemperatureMax           float64 `mapstructure:"TEMPERATURE_MAX"`
	TemperatureLowThreshold  float64 `mapstructure:"TEMPERATURE_LOW_THRESHOLD"`
	TemperatureHighThreshold float64 `mapstructure:"TEMPERATURE_HIGH_THRESHOLD"`
	HumidityLowThreshold     float64 `mapstructure:"HUMIDITY_LOW_THRESHOLD"`
	HumidityHighThreshold    float64 `mapstructure:"HUMIDITY_HIGH_THRESHOLD"`
	BatteryLowThreshold      float64 `mapstructure:"BATTERY_LOW_THRESHOLD"`
}

// Default configuration values
const (
	defaultPort            = "8080"
	defaultRefreshInterval = "30s"
	defaultStaleThreshold  = "5m"
	defaultScanInterval    = "15s"
	defaultScanDuration    = "15s"
	defaultReloadInterval  = "24h"
	goveeManufacturerID    = uint16(0xEC88)
	shutdownTimeout        = 5 * time.Second
)

// Default threshold values
const (
	defaultTemperatureMin           = -20.0
	defaultTemperatureMax           = 40.0
	defaultTemperatureLowThreshold  = 0.0
	defaultTemperatureHighThreshold = 35.0
	defaultHumidityLowThreshold     = 30.0
	defaultHumidityHighThreshold    = 70.0
	defaultBatteryLowThreshold      = 5.0
)

func init() {
	// Register Prometheus metrics
	prometheus.MustRegister(temperatureGauge)
	prometheus.MustRegister(humidityGauge)
	prometheus.MustRegister(batteryGauge)
}

func initConfig() (*Config, error) {
	// Set default values
	viper.SetDefault("PORT", defaultPort)
	viper.SetDefault("REFRESH_INTERVAL", defaultRefreshInterval)
	viper.SetDefault("STALE_THRESHOLD", defaultStaleThreshold)
	viper.SetDefault("SCAN_INTERVAL", defaultScanInterval)
	viper.SetDefault("SCAN_DURATION", defaultScanDuration)
	viper.SetDefault("RELOAD_INTERVAL", defaultReloadInterval)

	// Bind environment variables
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Create config struct
	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("unable to decode config into struct: %v", err)
	}

	return &config, nil
}

func initThresholdConfig() (*ThresholdConfig, error) {
	// Set default threshold values
	viper.SetDefault("TEMPERATURE_MIN", defaultTemperatureMin)
	viper.SetDefault("TEMPERATURE_MAX", defaultTemperatureMax)
	viper.SetDefault("TEMPERATURE_LOW_THRESHOLD", defaultTemperatureLowThreshold)
	viper.SetDefault("TEMPERATURE_HIGH_THRESHOLD", defaultTemperatureHighThreshold)
	viper.SetDefault("HUMIDITY_LOW_THRESHOLD", defaultHumidityLowThreshold)
	viper.SetDefault("HUMIDITY_HIGH_THRESHOLD", defaultHumidityHighThreshold)
	viper.SetDefault("BATTERY_LOW_THRESHOLD", defaultBatteryLowThreshold)

	// Bind environment variables (already enabled in initConfig)
	var thresholdConfig ThresholdConfig
	if err := viper.Unmarshal(&thresholdConfig); err != nil {
		return nil, fmt.Errorf("unable to decode threshold config into struct: %v", err)
	}

	return &thresholdConfig, nil
}

func loadKnownGovees() {
	knownFile := ".known_govees"
	file, err := os.Open(knownFile)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("Warning: Known devices file %s not found. No devices will be monitored.", knownFile)
			return
		}
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

	// Format and log the known devices
	log.Println("Loaded known Govee H5075 devices:")
	for mac, device := range knownGovees {
		log.Printf("  %-17s -> Name: %-15s TempOffset: %4.1f°C  HumidityOffset: %4.1f%%",
			mac,
			device.Name,
			device.TempOffset,
			device.HumidityOffset)
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
			scanCtx, cancel := context.WithTimeout(ctx, config.ScanDuration)

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
			log.Printf("Scan completed. Sleeping for %v until next scan...", config.ScanInterval)

			// Rest period between scans
			select {
			case <-ctx.Done():
				return
			case <-time.After(config.ScanInterval):
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

	// Apply offsets from .known_govees
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
	for device, lastSeen := range lastUpdateTime {
		if now.Sub(lastSeen) > config.StaleThreshold {
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

func main() {
	// Initialize configuration
	config, err := initConfig()
	if err != nil {
		log.Fatalf("Failed to initialize configuration: %v", err)
	}

	loadKnownGovees()

	// Create a context that will be canceled on shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Create a WaitGroup to track all goroutines
	var wg sync.WaitGroup

	// Start the known govees reload goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(config.ReloadInterval):
				loadKnownGovees()
			}
		}
	}()

	// Start the BLE scanner
	wg.Add(1)
	go func() {
		defer wg.Done()
		startBLEScanner(ctx, config)
	}()

	// Start the stale metrics checker
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(config.RefreshInterval):
				checkForStaleMetrics(config)
			}
		}
	}()

	// Load threshold configuration
	thresholdConfig, err := initThresholdConfig()
	if err != nil {
		log.Fatalf("Error loading threshold configuration: %v", err)
	}

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
		configJS := fmt.Sprintf(`// Dashboard configuration from environment variables
window.DASHBOARD_CONFIG = {
    TEMPERATURE_MIN: %v,
    TEMPERATURE_MAX: %v,
    TEMPERATURE_LOW_THRESHOLD: %v,
    TEMPERATURE_HIGH_THRESHOLD: %v,
    HUMIDITY_LOW_THRESHOLD: %v,
    HUMIDITY_HIGH_THRESHOLD: %v,
    BATTERY_LOW_THRESHOLD: %v
};`,
			thresholdConfig.TemperatureMin,
			thresholdConfig.TemperatureMax,
			thresholdConfig.TemperatureLowThreshold,
			thresholdConfig.TemperatureHighThreshold,
			thresholdConfig.HumidityLowThreshold,
			thresholdConfig.HumidityHighThreshold,
			thresholdConfig.BatteryLowThreshold,
		)
		w.Write([]byte(configJS))
	})

	// Create FileServer with custom file type mappings
	fs := http.FileServer(http.Dir("static"))
	mux.Handle("/static/", http.StripPrefix("/static/", fs))
	mux.Handle("/", fs)

	server := &http.Server{
		Addr:    ":" + config.Port,
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
    Reload Interval:  %v
    Stale Threshold:  %v`,
			config.Port,
			config.ScanDuration,
			config.ScanInterval,
			config.RefreshInterval,
			config.ReloadInterval,
			config.StaleThreshold)
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

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/viper"
)

// Device represents a known Govee H5075 device
type Device struct {
	MAC     string `mapstructure:"mac"`
	Name    string `mapstructure:"name"`
	Group   string `mapstructure:"group"` // Optional grouping (e.g., "Upstairs", "Downstairs", "Indoor", "Outdoor")
	Offsets struct {
		Temperature float64 `mapstructure:"temperature"`
		Humidity    float64 `mapstructure:"humidity"`
	} `mapstructure:"offsets"`
}

// Config holds all configuration settings
type Config struct {
	Server struct {
		Port string `mapstructure:"port"`
	} `mapstructure:"server"`

	Bluetooth struct {
		ScanInterval string `mapstructure:"scanInterval"`
		ScanDuration string `mapstructure:"scanDuration"`
	} `mapstructure:"bluetooth"`

	OpenMeteo struct {
		Enabled   bool    `mapstructure:"enabled"`
		Interval  string  `mapstructure:"interval"`
		Latitude  float64 `mapstructure:"latitude"`
		Longitude float64 `mapstructure:"longitude"`
	} `mapstructure:"openmeteo"`

	Metrics struct {
		RefreshInterval string `mapstructure:"refreshInterval"`
		StaleThreshold  string `mapstructure:"staleThreshold"`
	} `mapstructure:"metrics"`

	Thresholds struct {
		Temperature struct {
			Min  float64 `mapstructure:"min"`
			Max  float64 `mapstructure:"max"`
			Low  float64 `mapstructure:"low"`
			High float64 `mapstructure:"high"`
		} `mapstructure:"temperature"`

		Humidity struct {
			Low  float64 `mapstructure:"low"`
			High float64 `mapstructure:"high"`
		} `mapstructure:"humidity"`

		Battery struct {
			Low float64 `mapstructure:"low"`
		} `mapstructure:"battery"`
	} `mapstructure:"thresholds"`

	Devices []Device `mapstructure:"devices"`
}

// ConfigSource tracks where each config value came from
type ConfigSource struct {
	Key    string
	Value  interface{}
	Source string // "default", "config.yaml", or "environment"
}

// Default configuration values
const (
	defaultPort            = "8080"
	defaultRefreshInterval = "30s"
	defaultStaleThreshold  = "5m"
	defaultScanInterval    = "15s"
	defaultScanDuration    = "15s"
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

// parseDuration is a helper function to parse duration strings
func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		log.Printf("Warning: Invalid duration '%s', using 30s as default", s)
		return 30 * time.Second
	}
	return d
}

// initConfig initializes configuration from defaults, config.yaml, and environment variables
// Returns the config, a list of config sources for logging, and any error
func initConfig() (*Config, []ConfigSource, error) {
	// Step 1: Set default values
	viper.SetDefault("server.port", defaultPort)
	viper.SetDefault("bluetooth.scanInterval", defaultScanInterval)
	viper.SetDefault("bluetooth.scanDuration", defaultScanDuration)
	viper.SetDefault("metrics.refreshInterval", defaultRefreshInterval)
	viper.SetDefault("metrics.staleThreshold", defaultStaleThreshold)
	viper.SetDefault("thresholds.temperature.min", defaultTemperatureMin)
	viper.SetDefault("thresholds.temperature.max", defaultTemperatureMax)
	viper.SetDefault("thresholds.temperature.low", defaultTemperatureLowThreshold)
	viper.SetDefault("thresholds.temperature.high", defaultTemperatureHighThreshold)
	viper.SetDefault("thresholds.humidity.low", defaultHumidityLowThreshold)
	viper.SetDefault("thresholds.humidity.high", defaultHumidityHighThreshold)
	viper.SetDefault("thresholds.battery.low", defaultBatteryLowThreshold)
	viper.SetDefault("devices", []Device{}) // Empty device list by default

	// Track configuration sources
	sources := []ConfigSource{}

	// Step 2: Try to load config.yaml file
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")

	configFileUsed := false
	if err := viper.ReadInConfig(); err == nil {
		configFileUsed = true
		log.Printf("Loaded configuration from: %s", viper.ConfigFileUsed())
	} else {
		log.Printf("No config.yaml found, using defaults and environment variables")
	}

	// Step 3: Bind environment variables (highest priority)
	viper.SetEnvPrefix("")
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Bind specific environment variables with backward compatibility
	viper.BindEnv("server.port", "PORT")
	viper.BindEnv("bluetooth.scanInterval", "SCAN_INTERVAL")
	viper.BindEnv("bluetooth.scanDuration", "SCAN_DURATION")
	viper.BindEnv("metrics.refreshInterval", "REFRESH_INTERVAL")
	viper.BindEnv("metrics.staleThreshold", "STALE_THRESHOLD")
	viper.BindEnv("thresholds.temperature.min", "TEMPERATURE_MIN")
	viper.BindEnv("thresholds.temperature.max", "TEMPERATURE_MAX")
	viper.BindEnv("thresholds.temperature.low", "TEMPERATURE_LOW_THRESHOLD")
	viper.BindEnv("thresholds.temperature.high", "TEMPERATURE_HIGH_THRESHOLD")
	viper.BindEnv("thresholds.humidity.low", "HUMIDITY_LOW_THRESHOLD")
	viper.BindEnv("thresholds.humidity.high", "HUMIDITY_HIGH_THRESHOLD")
	viper.BindEnv("thresholds.battery.low", "BATTERY_LOW_THRESHOLD")

	// Unmarshal configuration
	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, nil, fmt.Errorf("unable to decode config into struct: %v", err)
	}

	// Determine source for each configuration value
	configKeys := []struct {
		key    string
		value  interface{}
		envVar string
	}{
		{"server.port", config.Server.Port, "PORT"},
		{"bluetooth.scanInterval", config.Bluetooth.ScanInterval, "SCAN_INTERVAL"},
		{"bluetooth.scanDuration", config.Bluetooth.ScanDuration, "SCAN_DURATION"},
		{"metrics.refreshInterval", config.Metrics.RefreshInterval, "REFRESH_INTERVAL"},
		{"metrics.staleThreshold", config.Metrics.StaleThreshold, "STALE_THRESHOLD"},
		{"thresholds.temperature.min", config.Thresholds.Temperature.Min, "TEMPERATURE_MIN"},
		{"thresholds.temperature.max", config.Thresholds.Temperature.Max, "TEMPERATURE_MAX"},
		{"thresholds.temperature.low", config.Thresholds.Temperature.Low, "TEMPERATURE_LOW_THRESHOLD"},
		{"thresholds.temperature.high", config.Thresholds.Temperature.High, "TEMPERATURE_HIGH_THRESHOLD"},
		{"thresholds.humidity.low", config.Thresholds.Humidity.Low, "HUMIDITY_LOW_THRESHOLD"},
		{"thresholds.humidity.high", config.Thresholds.Humidity.High, "HUMIDITY_HIGH_THRESHOLD"},
		{"thresholds.battery.low", config.Thresholds.Battery.Low, "BATTERY_LOW_THRESHOLD"},
	}

	// Add devices source information
	devicesSource := "default"
	if len(config.Devices) > 0 {
		if configFileUsed && viper.InConfig("devices") {
			devicesSource = "config.yaml"
		}
	}
	sources = append(sources, ConfigSource{
		Key:    "devices",
		Value:  fmt.Sprintf("%d devices", len(config.Devices)),
		Source: devicesSource,
	})

	for _, item := range configKeys {
		source := "default"
		if os.Getenv(item.envVar) != "" {
			source = "environment"
		} else if configFileUsed && viper.InConfig(item.key) {
			source = "config.yaml"
		}
		sources = append(sources, ConfigSource{
			Key:    item.key,
			Value:  item.value,
			Source: source,
		})
	}

	return &config, sources, nil
}

// watchConfigFile monitors the config.yaml file for changes and reloads device configuration
// The onReload callback is called when configuration is successfully reloaded
func watchConfigFile(ctx context.Context, onReload func(*Config)) {
	// Check if config.yaml exists
	configPath := "config.yaml"
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		log.Printf("Config file watcher: %s not found, hot-reload disabled", configPath)
		return
	}

	// Create file watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("Failed to create config file watcher: %v. Hot-reload disabled.", err)
		return
	}
	defer watcher.Close()

	// Add config file to watcher
	err = watcher.Add(configPath)
	if err != nil {
		log.Printf("Failed to watch config file: %v. Hot-reload disabled.", err)
		return
	}

	log.Printf("Config file watcher: Monitoring %s for changes", configPath)

	// Debounce timer to avoid multiple reloads for rapid file changes
	var debounceTimer *time.Timer
	debounceDuration := 500 * time.Millisecond

	for {
		select {
		case <-ctx.Done():
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return

		case event, ok := <-watcher.Events:
			if !ok {
				return
			}

			// Watch for Write and Create events (editors may delete and recreate files)
			if event.Op&fsnotify.Write == fsnotify.Write || event.Op&fsnotify.Create == fsnotify.Create {
				// Debounce: reset timer if it exists, or create new one
				if debounceTimer != nil {
					debounceTimer.Stop()
				}

				debounceTimer = time.AfterFunc(debounceDuration, func() {
					log.Println("Config file changed, reloading device configuration...")

					// Reload configuration
					newConfig, _, err := initConfig()
					if err != nil {
						log.Printf("Failed to reload configuration: %v. Keeping existing config.", err)
						return
					}

					// Call the reload callback
					if onReload != nil {
						onReload(newConfig)
					}
					log.Println("Device configuration reloaded successfully")
				})
			}

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Config file watcher error: %v", err)
		}
	}
}

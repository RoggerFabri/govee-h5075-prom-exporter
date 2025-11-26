//go:build integration
// +build integration

package main

import (
	"context"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/joho/godotenv"
)

// TestIntegrationGetCurrentWeather tests the real API endpoint
// Run with: go test -tags=integration -v
func TestIntegrationGetCurrentWeather(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	// Load .env file if it exists (ignore error if file doesn't exist)
	_ = godotenv.Load()

	// Load configuration from environment variables
	latStr := os.Getenv("OPENMETEO_LATITUDE")
	lonStr := os.Getenv("OPENMETEO_LONGITUDE")

	if latStr == "" || lonStr == "" {
		t.Skip("OPENMETEO_LATITUDE and OPENMETEO_LONGITUDE environment variables must be set for integration tests")
	}

	latitude, err := strconv.ParseFloat(latStr, 64)
	if err != nil {
		t.Fatalf("invalid OPENMETEO_LATITUDE value: %v", err)
	}

	longitude, err := strconv.ParseFloat(lonStr, 64)
	if err != nil {
		t.Fatalf("invalid OPENMETEO_LONGITUDE value: %v", err)
	}

	// Create the client
	client := NewOpenMeteoClient(latitude, longitude)

	// Create a context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Call the real API
	data, err := client.GetCurrentWeather(ctx)
	if err != nil {
		t.Fatalf("failed to get current weather: %v", err)
	}

	// Verify the response structure
	if data == nil {
		t.Fatal("expected non-nil response")
	}

	// Verify latitude and longitude are close to requested values
	// (API may return slightly different coordinates based on grid)
	latDiff := data.Latitude - latitude
	if latDiff < -1.0 || latDiff > 1.0 {
		t.Errorf("returned latitude %f is too far from requested %f", data.Latitude, latitude)
	}

	lonDiff := data.Longitude - longitude
	if lonDiff < -1.0 || lonDiff > 1.0 {
		t.Errorf("returned longitude %f is too far from requested %f", data.Longitude, longitude)
	}

	// Verify current weather data exists
	if data.Current.Time == "" {
		t.Error("expected non-empty current time")
	}

	// Temperature should be within reasonable bounds (-60 to 60°C)
	if data.Current.Temperature2m < -60 || data.Current.Temperature2m > 60 {
		t.Errorf("temperature %f is outside reasonable bounds", data.Current.Temperature2m)
	}

	// Humidity should be between 0 and 100%
	if data.Current.RelativeHumidity2m < 0 || data.Current.RelativeHumidity2m > 100 {
		t.Errorf("humidity %d is outside valid range (0-100)", data.Current.RelativeHumidity2m)
	}

	// Verify units are set
	if data.CurrentUnits.Temperature2m == "" {
		t.Error("expected non-empty temperature unit")
	}
	if data.CurrentUnits.RelativeHumidity2m == "" {
		t.Error("expected non-empty humidity unit")
	}

	// Verify timezone information
	if data.Timezone == "" {
		t.Error("expected non-empty timezone")
	}

	t.Logf("Successfully retrieved weather data:")
	t.Logf("  Location: %f, %f (elevation: %.1fm)", data.Latitude, data.Longitude, data.Elevation)
	t.Logf("  Timezone: %s (%s)", data.Timezone, data.TimezoneAbbreviation)
	t.Logf("  Time: %s", data.Current.Time)
	t.Logf("  Temperature: %.1f%s", data.Current.Temperature2m, data.CurrentUnits.Temperature2m)
	t.Logf("  Humidity: %d%s", data.Current.RelativeHumidity2m, data.CurrentUnits.RelativeHumidity2m)
	t.Logf("  Generation time: %.2fms", data.GenerationTimeMs)
}

// TestIntegrationGetTemperature tests getting just the temperature
func TestIntegrationGetTemperature(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	_ = godotenv.Load()

	latStr := os.Getenv("OPENMETEO_LATITUDE")
	lonStr := os.Getenv("OPENMETEO_LONGITUDE")

	if latStr == "" || lonStr == "" {
		t.Skip("OPENMETEO_LATITUDE and OPENMETEO_LONGITUDE environment variables must be set for integration tests")
	}

	latitude, err := strconv.ParseFloat(latStr, 64)
	if err != nil {
		t.Fatalf("invalid OPENMETEO_LATITUDE value: %v", err)
	}

	longitude, err := strconv.ParseFloat(lonStr, 64)
	if err != nil {
		t.Fatalf("invalid OPENMETEO_LONGITUDE value: %v", err)
	}

	client := NewOpenMeteoClient(latitude, longitude)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	temp, err := client.GetTemperature(ctx)
	if err != nil {
		t.Fatalf("failed to get temperature: %v", err)
	}

	if temp < -60 || temp > 60 {
		t.Errorf("temperature %f is outside reasonable bounds", temp)
	}

	t.Logf("Current temperature: %.1f°C", temp)
}

// TestIntegrationGetHumidity tests getting just the humidity
func TestIntegrationGetHumidity(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	_ = godotenv.Load()

	latStr := os.Getenv("OPENMETEO_LATITUDE")
	lonStr := os.Getenv("OPENMETEO_LONGITUDE")

	if latStr == "" || lonStr == "" {
		t.Skip("OPENMETEO_LATITUDE and OPENMETEO_LONGITUDE environment variables must be set for integration tests")
	}

	latitude, err := strconv.ParseFloat(latStr, 64)
	if err != nil {
		t.Fatalf("invalid OPENMETEO_LATITUDE value: %v", err)
	}

	longitude, err := strconv.ParseFloat(lonStr, 64)
	if err != nil {
		t.Fatalf("invalid OPENMETEO_LONGITUDE value: %v", err)
	}

	client := NewOpenMeteoClient(latitude, longitude)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	humidity, err := client.GetHumidity(ctx)
	if err != nil {
		t.Fatalf("failed to get humidity: %v", err)
	}

	if humidity < 0 || humidity > 100 {
		t.Errorf("humidity %d is outside valid range (0-100)", humidity)
	}

	t.Logf("Current humidity: %d%%", humidity)
}

// TestIntegrationGetTemperatureAndHumidity tests getting both values at once
func TestIntegrationGetTemperatureAndHumidity(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	_ = godotenv.Load()

	latStr := os.Getenv("OPENMETEO_LATITUDE")
	lonStr := os.Getenv("OPENMETEO_LONGITUDE")

	if latStr == "" || lonStr == "" {
		t.Skip("OPENMETEO_LATITUDE and OPENMETEO_LONGITUDE environment variables must be set for integration tests")
	}

	latitude, err := strconv.ParseFloat(latStr, 64)
	if err != nil {
		t.Fatalf("invalid OPENMETEO_LATITUDE value: %v", err)
	}

	longitude, err := strconv.ParseFloat(lonStr, 64)
	if err != nil {
		t.Fatalf("invalid OPENMETEO_LONGITUDE value: %v", err)
	}

	client := NewOpenMeteoClient(latitude, longitude)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	temp, humidity, err := client.GetTemperatureAndHumidity(ctx)
	if err != nil {
		t.Fatalf("failed to get temperature and humidity: %v", err)
	}

	if temp < -60 || temp > 60 {
		t.Errorf("temperature %f is outside reasonable bounds", temp)
	}

	if humidity < 0 || humidity > 100 {
		t.Errorf("humidity %d is outside valid range (0-100)", humidity)
	}

	t.Logf("Current conditions: %.1f°C, %d%%", temp, humidity)
}

// TestIntegrationMultipleLocations tests different locations
func TestIntegrationMultipleLocations(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	locations := []struct {
		name      string
		latitude  float64
		longitude float64
	}{
		{"Dublin, Ireland", 53.35, -6.26},
		{"New York, USA", 40.7128, -74.0060},
		{"Tokyo, Japan", 35.6762, 139.6503},
		{"Sydney, Australia", -33.8688, 151.2093},
		{"London, UK", 51.5074, -0.1278},
	}

	for _, loc := range locations {
		t.Run(loc.name, func(t *testing.T) {
			client := NewOpenMeteoClient(loc.latitude, loc.longitude)
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			data, err := client.GetCurrentWeather(ctx)
			if err != nil {
				t.Fatalf("failed to get weather for %s: %v", loc.name, err)
			}

			if data == nil {
				t.Fatal("expected non-nil response")
			}

			t.Logf("%s: %.1f%s, %d%s",
				loc.name,
				data.Current.Temperature2m,
				data.CurrentUnits.Temperature2m,
				data.Current.RelativeHumidity2m,
				data.CurrentUnits.RelativeHumidity2m,
			)
		})
	}
}

// TestIntegrationSetLocation tests changing the location dynamically
func TestIntegrationSetLocation(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	client := NewOpenMeteoClient(53.35, -6.26) // Dublin
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Get weather for Dublin
	data1, err := client.GetCurrentWeather(ctx)
	if err != nil {
		t.Fatalf("failed to get weather for Dublin: %v", err)
	}
	t.Logf("Dublin: %.1f°C, %d%%", data1.Current.Temperature2m, data1.Current.RelativeHumidity2m)

	// Change to New York
	client.SetLocation(40.7128, -74.0060)
	data2, err := client.GetCurrentWeather(ctx)
	if err != nil {
		t.Fatalf("failed to get weather for New York: %v", err)
	}
	t.Logf("New York: %.1f°C, %d%%", data2.Current.Temperature2m, data2.Current.RelativeHumidity2m)

	// Verify the locations are different
	if data1.Latitude == data2.Latitude && data1.Longitude == data2.Longitude {
		t.Error("expected different locations")
	}
}

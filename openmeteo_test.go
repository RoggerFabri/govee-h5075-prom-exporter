package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestNewOpenMeteoClient(t *testing.T) {
	tests := []struct {
		name      string
		latitude  float64
		longitude float64
	}{
		{
			name:      "Dublin, Ireland",
			latitude:  53.35,
			longitude: -6.26,
		},
		{
			name:      "New York, USA",
			latitude:  40.7128,
			longitude: -74.0060,
		},
		{
			name:      "Tokyo, Japan",
			latitude:  35.6762,
			longitude: 139.6503,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := NewOpenMeteoClient(tt.latitude, tt.longitude)
			if client == nil {
				t.Fatal("expected client to be non-nil")
			}
			if client.latitude != tt.latitude {
				t.Errorf("expected latitude %f, got %f", tt.latitude, client.latitude)
			}
			if client.longitude != tt.longitude {
				t.Errorf("expected longitude %f, got %f", tt.longitude, client.longitude)
			}
			if client.baseURL != OpenMeteoAPIBaseURL {
				t.Errorf("expected baseURL %s, got %s", OpenMeteoAPIBaseURL, client.baseURL)
			}
			if client.httpClient == nil {
				t.Error("expected httpClient to be non-nil")
			}
		})
	}
}

func TestSetLocation(t *testing.T) {
	client := NewOpenMeteoClient(0, 0)

	newLat := 53.35
	newLon := -6.26

	client.SetLocation(newLat, newLon)

	if client.latitude != newLat {
		t.Errorf("expected latitude %f, got %f", newLat, client.latitude)
	}
	if client.longitude != newLon {
		t.Errorf("expected longitude %f, got %f", newLon, client.longitude)
	}
}

func TestGetCurrentWeather_Success(t *testing.T) {
	// Create a mock server
	mockResponse := OpenMeteoResponse{
		Latitude:             53.34086,
		Longitude:            -6.2466736,
		GenerationTimeMs:     0.03719329833984375,
		UTCOffsetSeconds:     0,
		Timezone:             "GMT",
		TimezoneAbbreviation: "GMT",
		Elevation:            11,
		CurrentUnits: CurrentUnits{
			Time:               "iso8601",
			Interval:           "seconds",
			Temperature2m:      "°C",
			RelativeHumidity2m: "%",
		},
		Current: CurrentWeather{
			Time:               "2025-11-26T14:45",
			Interval:           900,
			Temperature2m:      11.8,
			RelativeHumidity2m: 95,
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify the request parameters
		if r.Method != http.MethodGet {
			t.Errorf("expected GET request, got %s", r.Method)
		}

		query := r.URL.Query()
		if query.Get("latitude") == "" {
			t.Error("expected latitude parameter")
		}
		if query.Get("longitude") == "" {
			t.Error("expected longitude parameter")
		}
		if query.Get("current") != "temperature_2m,relative_humidity_2m" {
			t.Errorf("expected current parameter to be 'temperature_2m,relative_humidity_2m', got '%s'", query.Get("current"))
		}

		// Return mock response
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockResponse)
	}))
	defer server.Close()

	// Create client with custom HTTP client pointing to mock server
	httpClient := &http.Client{Timeout: 5 * time.Second}
	client := NewOpenMeteoClientWithHTTPClient(53.35, -6.26, httpClient)
	client.baseURL = server.URL

	// Test GetCurrentWeather
	ctx := context.Background()
	data, err := client.GetCurrentWeather(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify response
	if data.Latitude != mockResponse.Latitude {
		t.Errorf("expected latitude %f, got %f", mockResponse.Latitude, data.Latitude)
	}
	if data.Longitude != mockResponse.Longitude {
		t.Errorf("expected longitude %f, got %f", mockResponse.Longitude, data.Longitude)
	}
	if data.Current.Temperature2m != mockResponse.Current.Temperature2m {
		t.Errorf("expected temperature %f, got %f", mockResponse.Current.Temperature2m, data.Current.Temperature2m)
	}
	if data.Current.RelativeHumidity2m != mockResponse.Current.RelativeHumidity2m {
		t.Errorf("expected humidity %d, got %d", mockResponse.Current.RelativeHumidity2m, data.Current.RelativeHumidity2m)
	}
}

func TestGetCurrentWeather_HTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Internal Server Error"))
	}))
	defer server.Close()

	httpClient := &http.Client{Timeout: 5 * time.Second}
	client := NewOpenMeteoClientWithHTTPClient(53.35, -6.26, httpClient)
	client.baseURL = server.URL

	ctx := context.Background()
	_, err := client.GetCurrentWeather(ctx)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "unexpected status code") {
		t.Errorf("expected error to contain 'unexpected status code', got: %v", err)
	}
}

func TestGetCurrentWeather_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("invalid json"))
	}))
	defer server.Close()

	httpClient := &http.Client{Timeout: 5 * time.Second}
	client := NewOpenMeteoClientWithHTTPClient(53.35, -6.26, httpClient)
	client.baseURL = server.URL

	ctx := context.Background()
	_, err := client.GetCurrentWeather(ctx)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to parse JSON") {
		t.Errorf("expected error to contain 'failed to parse JSON', got: %v", err)
	}
}

func TestGetCurrentWeather_ContextCancellation(t *testing.T) {
	// Create a server that delays the response
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	httpClient := &http.Client{Timeout: 5 * time.Second}
	client := NewOpenMeteoClientWithHTTPClient(53.35, -6.26, httpClient)
	client.baseURL = server.URL

	// Create a context that will be cancelled immediately
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, err := client.GetCurrentWeather(ctx)
	if err == nil {
		t.Fatal("expected error due to context cancellation, got nil")
	}
}

func TestGetTemperature(t *testing.T) {
	expectedTemp := 11.8
	mockResponse := OpenMeteoResponse{
		Latitude:  53.34086,
		Longitude: -6.2466736,
		Current: CurrentWeather{
			Temperature2m:      expectedTemp,
			RelativeHumidity2m: 95,
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockResponse)
	}))
	defer server.Close()

	httpClient := &http.Client{Timeout: 5 * time.Second}
	client := NewOpenMeteoClientWithHTTPClient(53.35, -6.26, httpClient)
	client.baseURL = server.URL

	ctx := context.Background()
	temp, err := client.GetTemperature(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if temp != expectedTemp {
		t.Errorf("expected temperature %f, got %f", expectedTemp, temp)
	}
}

func TestGetHumidity(t *testing.T) {
	expectedHumidity := 95
	mockResponse := OpenMeteoResponse{
		Latitude:  53.34086,
		Longitude: -6.2466736,
		Current: CurrentWeather{
			Temperature2m:      11.8,
			RelativeHumidity2m: expectedHumidity,
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockResponse)
	}))
	defer server.Close()

	httpClient := &http.Client{Timeout: 5 * time.Second}
	client := NewOpenMeteoClientWithHTTPClient(53.35, -6.26, httpClient)
	client.baseURL = server.URL

	ctx := context.Background()
	humidity, err := client.GetHumidity(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if humidity != expectedHumidity {
		t.Errorf("expected humidity %d, got %d", expectedHumidity, humidity)
	}
}

func TestGetTemperatureAndHumidity(t *testing.T) {
	expectedTemp := 11.8
	expectedHumidity := 95
	mockResponse := OpenMeteoResponse{
		Latitude:  53.34086,
		Longitude: -6.2466736,
		Current: CurrentWeather{
			Temperature2m:      expectedTemp,
			RelativeHumidity2m: expectedHumidity,
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockResponse)
	}))
	defer server.Close()

	httpClient := &http.Client{Timeout: 5 * time.Second}
	client := NewOpenMeteoClientWithHTTPClient(53.35, -6.26, httpClient)
	client.baseURL = server.URL

	ctx := context.Background()
	temp, humidity, err := client.GetTemperatureAndHumidity(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if temp != expectedTemp {
		t.Errorf("expected temperature %f, got %f", expectedTemp, temp)
	}
	if humidity != expectedHumidity {
		t.Errorf("expected humidity %d, got %d", expectedHumidity, humidity)
	}
}

func TestOpenMeteoResponse_JSONMarshaling(t *testing.T) {
	jsonData := `{
		"latitude": 53.34086,
		"longitude": -6.2466736,
		"generationtime_ms": 0.03719329833984375,
		"utc_offset_seconds": 0,
		"timezone": "GMT",
		"timezone_abbreviation": "GMT",
		"elevation": 11,
		"current_units": {
			"time": "iso8601",
			"interval": "seconds",
			"temperature_2m": "°C",
			"relative_humidity_2m": "%"
		},
		"current": {
			"time": "2025-11-26T14:45",
			"interval": 900,
			"temperature_2m": 11.8,
			"relative_humidity_2m": 95
		}
	}`

	var response OpenMeteoResponse
	err := json.Unmarshal([]byte(jsonData), &response)
	if err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}

	if response.Latitude != 53.34086 {
		t.Errorf("expected latitude 53.34086, got %f", response.Latitude)
	}
	if response.Longitude != -6.2466736 {
		t.Errorf("expected longitude -6.2466736, got %f", response.Longitude)
	}
	if response.Current.Temperature2m != 11.8 {
		t.Errorf("expected temperature 11.8, got %f", response.Current.Temperature2m)
	}
	if response.Current.RelativeHumidity2m != 95 {
		t.Errorf("expected humidity 95, got %d", response.Current.RelativeHumidity2m)
	}
	if response.Timezone != "GMT" {
		t.Errorf("expected timezone GMT, got %s", response.Timezone)
	}
}

func TestNewOpenMeteoClientWithHTTPClient(t *testing.T) {
	customTimeout := 30 * time.Second
	customClient := &http.Client{Timeout: customTimeout}

	client := NewOpenMeteoClientWithHTTPClient(53.35, -6.26, customClient)

	if client == nil {
		t.Fatal("expected client to be non-nil")
	}
	if client.httpClient != customClient {
		t.Error("expected custom HTTP client to be used")
	}
	if client.httpClient.Timeout != customTimeout {
		t.Errorf("expected timeout %v, got %v", customTimeout, client.httpClient.Timeout)
	}
}

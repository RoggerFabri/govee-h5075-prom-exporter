package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const (
	// OpenMeteoAPIBaseURL is the base URL for the Open-Meteo API
	OpenMeteoAPIBaseURL = "https://api.open-meteo.com/v1/forecast"

	// DefaultTimeout is the default HTTP client timeout
	DefaultTimeout = 10 * time.Second
)

// OpenMeteoClient represents a client for the Open-Meteo API
type OpenMeteoClient struct {
	baseURL    string
	httpClient *http.Client
	latitude   float64
	longitude  float64
}

// CurrentUnits represents the units for current weather data
type CurrentUnits struct {
	Time               string `json:"time"`
	Interval           string `json:"interval"`
	Temperature2m      string `json:"temperature_2m"`
	RelativeHumidity2m string `json:"relative_humidity_2m"`
}

// CurrentWeather represents the current weather data
type CurrentWeather struct {
	Time               string  `json:"time"`
	Interval           int     `json:"interval"`
	Temperature2m      float64 `json:"temperature_2m"`
	RelativeHumidity2m int     `json:"relative_humidity_2m"`
}

// OpenMeteoResponse represents the response from the Open-Meteo API
type OpenMeteoResponse struct {
	Latitude             float64        `json:"latitude"`
	Longitude            float64        `json:"longitude"`
	GenerationTimeMs     float64        `json:"generationtime_ms"`
	UTCOffsetSeconds     int            `json:"utc_offset_seconds"`
	Timezone             string         `json:"timezone"`
	TimezoneAbbreviation string         `json:"timezone_abbreviation"`
	Elevation            float64        `json:"elevation"`
	CurrentUnits         CurrentUnits   `json:"current_units"`
	Current              CurrentWeather `json:"current"`
}

// NewOpenMeteoClient creates a new OpenMeteo API client
func NewOpenMeteoClient(latitude, longitude float64) *OpenMeteoClient {
	return &OpenMeteoClient{
		baseURL: OpenMeteoAPIBaseURL,
		httpClient: &http.Client{
			Timeout: DefaultTimeout,
		},
		latitude:  latitude,
		longitude: longitude,
	}
}

// NewOpenMeteoClientWithHTTPClient creates a new OpenMeteo API client with a custom HTTP client
func NewOpenMeteoClientWithHTTPClient(latitude, longitude float64, httpClient *http.Client) *OpenMeteoClient {
	return &OpenMeteoClient{
		baseURL:    OpenMeteoAPIBaseURL,
		httpClient: httpClient,
		latitude:   latitude,
		longitude:  longitude,
	}
}

// SetLocation updates the latitude and longitude for the client
func (c *OpenMeteoClient) SetLocation(latitude, longitude float64) {
	c.latitude = latitude
	c.longitude = longitude
}

// GetCurrentWeather fetches the current temperature and humidity for the configured location
func (c *OpenMeteoClient) GetCurrentWeather(ctx context.Context) (*OpenMeteoResponse, error) {
	// Build the URL with query parameters
	apiURL, err := url.Parse(c.baseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse base URL: %w", err)
	}

	query := apiURL.Query()
	query.Set("latitude", strconv.FormatFloat(c.latitude, 'f', -1, 64))
	query.Set("longitude", strconv.FormatFloat(c.longitude, 'f', -1, 64))
	query.Set("current", "temperature_2m,relative_humidity_2m")
	apiURL.RawQuery = query.Encode()

	// Create the HTTP request with context
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "govee-h5075-prom-exporter/1.0")

	// Execute the request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	// Check for non-200 status codes
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body))
	}

	// Read the response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Parse the JSON response
	var weatherData OpenMeteoResponse
	if err := json.Unmarshal(body, &weatherData); err != nil {
		return nil, fmt.Errorf("failed to parse JSON response: %w", err)
	}

	return &weatherData, nil
}

// GetTemperature is a convenience method to get just the current temperature
func (c *OpenMeteoClient) GetTemperature(ctx context.Context) (float64, error) {
	data, err := c.GetCurrentWeather(ctx)
	if err != nil {
		return 0, err
	}
	return data.Current.Temperature2m, nil
}

// GetHumidity is a convenience method to get just the current humidity
func (c *OpenMeteoClient) GetHumidity(ctx context.Context) (int, error) {
	data, err := c.GetCurrentWeather(ctx)
	if err != nil {
		return 0, err
	}
	return data.Current.RelativeHumidity2m, nil
}

// GetTemperatureAndHumidity is a convenience method to get both temperature and humidity
func (c *OpenMeteoClient) GetTemperatureAndHumidity(ctx context.Context) (temperature float64, humidity int, err error) {
	data, err := c.GetCurrentWeather(ctx)
	if err != nil {
		return 0, 0, err
	}
	return data.Current.Temperature2m, data.Current.RelativeHumidity2m, nil
}

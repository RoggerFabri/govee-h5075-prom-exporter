# OpenMeteo API Integration

The Govee H5075 Prometheus Exporter  includes optional OpenMeteo API integration to fetch outdoor weather data alongside your indoor sensor readings.

## Features

- ✅ Optional OpenMeteo weather API integration
- ✅ Configurable polling interval
- ✅ Automatic Prometheus metrics export
- ✅ Independent from Bluetooth sensor monitoring
- ✅ Graceful error handling with logging
- ✅ **Hot-reload support** - configuration changes applied without restart

## Configuration

### Enable in `config.yaml`

```yaml
# OpenMeteo API configuration
openmeteo:
  enabled: true                 # Enable/disable OpenMeteo weather API integration
  interval: 5m                  # How often to fetch weather data
  latitude: 53.35               # Latitude for weather location
  longitude: -6.26              # Longitude for weather location
```

### Or use Environment Variables

```bash
# Enable OpenMeteo integration
export OPENMETEO_ENABLED=true
export OPENMETEO_INTERVAL=5m
export OPENMETEO_LATITUDE=53.35
export OPENMETEO_LONGITUDE=-6.26
```

### Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable OpenMeteo API integration (hot-reload supported) |
| `interval` | duration | `5m` | How often to fetch weather data (e.g., `1m`, `5m`, `15m`) (hot-reload supported) |
| `latitude` | float | `53.35` | Latitude for weather location (decimal degrees) (hot-reload supported) |
| `longitude` | float | `-6.26` | Longitude for weather location (decimal degrees) (hot-reload supported) |

**Note:** All OpenMeteo configuration changes are automatically detected and applied without requiring a restart.

## Prometheus Metrics

When enabled, the following metrics are exported:

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `openmeteo_temperature` | Gauge | Current temperature from OpenMeteo API (°C) | None |
| `openmeteo_humidity` | Gauge | Current humidity from OpenMeteo API (%) | None |

## Example Usage

### 1. Enable OpenMeteo in config.yaml

```yaml
openmeteo:
  enabled: true
  interval: 10m
  latitude: 40.7128    # New York
  longitude: -74.0060
```

### 2. Start the Exporter

```bash
docker-compose up -d
```

### 3. Check Logs

You should see:

```
Starting OpenMeteo API poller (interval: 10m, location: 40.7128, -74.0060)
OpenMeteo | Temp: 15.30°C | Humidity: 65.00%
```

### 4. Query Prometheus Metrics

```bash
curl http://localhost:8080/metrics | grep openmeteo
```

Output:
```
# HELP openmeteo_humidity Humidity from OpenMeteo API
# TYPE openmeteo_humidity gauge
openmeteo_humidity 65

# HELP openmeteo_temperature Temperature from OpenMeteo API
# TYPE openmeteo_temperature gauge
openmeteo_temperature 15.3
```

## Hot-Reload Configuration Changes

OpenMeteo configuration supports hot-reload - changes to `config.yaml` are automatically detected and applied without restart:

**Change location:**
```yaml
openmeteo:
  enabled: true
  interval: 5m
  latitude: 40.7128    # Changed from 53.35
  longitude: -74.0060  # Changed from -6.26
```

**Change polling interval:**
```yaml
openmeteo:
  enabled: true
  interval: 15m        # Changed from 5m
  latitude: 53.35
  longitude: -6.26
```

**Enable/Disable dynamically:**
```yaml
openmeteo:
  enabled: false       # Changed from true - stops fetching immediately
  interval: 5m
  latitude: 53.35
  longitude: -6.26
```

**Log output on config change:**
```
Config file changed, reloading device configuration...
Device configuration reloaded successfully
OpenMeteo: Configuration updated (interval: 15m, location: 40.7128, -74.0060)
```

**When dynamically enabling:**
```
OpenMeteo: Enabled (interval: 5m, location: 53.3500, -6.2600)
```

**When dynamically disabling:**
```
OpenMeteo: Disabled
```

## Logging

When enabled, OpenMeteo will log:

**Startup:**
```
Starting OpenMeteo API poller (interval: 5m, location: 53.3500, -6.2600)
```

**Each successful fetch:**
```
OpenMeteo | Temp: 11.70°C | Humidity: 95.00%
```

**On errors:**
```
Failed to fetch OpenMeteo data: context deadline exceeded
```

## Troubleshooting

### OpenMeteo not fetching data

1. **Check if enabled:**
   ```bash
   docker logs govee-h5075-prom-exporter | grep "OpenMeteo"
   ```

2. **Verify configuration:**
   - Look for "OpenMeteo API integration is disabled" if not enabled
   - Check latitude/longitude are valid (-90 to 90, -180 to 180)

3. **Check for errors:**
   ```bash
   docker logs govee-h5075-prom-exporter | grep "Failed to fetch OpenMeteo"
   ```

### Common Errors

**"context deadline exceeded"**
- Network issue or API timeout
- Will retry on next interval automatically

**"failed to parse JSON response"**
- Possible API changes or network issues
- Check https://open-meteo.com/en/docs for status

### Disable OpenMeteo

**Option 1: Using hot-reload (no restart required)**

Edit `config.yaml`:
```yaml
openmeteo:
  enabled: false
```

Changes take effect within ~500ms.

**Option 2: Using environment variables (requires restart)**

```bash
export OPENMETEO_ENABLED=false
docker-compose restart
```

## Docker Compose Example

```yaml
services:
  govee-h5075-prom-exporter:
    image: govee-h5075-prom-exporter
    environment:
      - OPENMETEO_ENABLED=true
      - OPENMETEO_INTERVAL=5m
      - OPENMETEO_LATITUDE=53.35
      - OPENMETEO_LONGITUDE=-6.26
    volumes:
      - ./config.yaml:/app/config.yaml:ro
    ports:
      - "8080:8080"
```

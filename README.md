# Govee H5075 BLE Prometheus Exporter

A **Prometheus exporter** for **Govee H5075 temperature & humidity sensors** that collects real-time data via **Bluetooth Low Energy (BLE)** and exposes it as **Prometheus metrics**.

---

## 🚀 Features
- **BLE-based scanning** (no need for Govee cloud services).
- **Maps device MAC addresses to human-readable names**.
- **Applies user-defined temperature & humidity offsets**.
- **Exports metrics to Prometheus** on a configurable **HTTP port**.
- **Removes stale metrics** if a device is inactive.
- **Hot-reload configuration** - device and OpenMeteo changes are automatically detected without restart.
- **Graceful shutdown** with proper context handling for all goroutines.

---

## 📦 Installation

### **1️⃣ Clone the Repository**
```sh
git clone https://github.com/RoggerFabri/govee-h5075-prom-exporter.git
cd govee-h5075-prom-exporter
```

### **2️⃣ Build & Run Using Docker**
```sh
docker-compose up --build -d
```

### **3️⃣ Access Prometheus Metrics**
Open in your browser:
```
http://localhost:8080/metrics
```

---

## ⚙️ Configuration

Configuration can be provided in three ways, with the following precedence (highest to lowest):
1. **Environment Variables** (highest priority)
2. **config.yaml file** (medium priority)  
3. **Default values** (lowest priority)

At startup, the application will display where each configuration value is loaded from.

### **🔹 Configuration File (config.yaml)**

You can create a `config.yaml` file in the same directory as the executable with the following structure:

```yaml
# Server configuration
server:
  port: 8080

# Bluetooth scanning
bluetooth:
  scanInterval: 15s
  scanDuration: 15s
  
# Metrics management
metrics:
  refreshInterval: 30s
  staleThreshold: 5m

# Dashboard warning thresholds
thresholds:
  temperature:
    min: -20    # Minimum for display normalization
    max: 40     # Maximum for display normalization
    low: 0      # Show warning below this
    high: 35    # Show warning above this
  humidity:
    low: 30     # Show warning below this
    high: 70    # Show warning above this
  battery:
    low: 5      # Show warning at or below this

# Known Govee H5075 devices
devices:
  - mac: "A4:C1:38:E0:0F:54"
    name: "Office"
    group: "Upstairs"    # Optional: Group devices for organization
    offsets:
      temperature: 0.0
      humidity: 0.0
  
  - mac: "A4:C1:38:8A:F6:2A"
    name: "Attic"
    group: "Upstairs"
    offsets:
      temperature: 0.0
      humidity: 0.0
  
  - mac: "A4:C1:38:D3:D2:FC"
    name: "Ensuite"
    group: "Downstairs"
    offsets:
      temperature: -0.5  # Sensor reads 0.5°C too high
      humidity: 1.0      # Sensor reads 1% too low
```

### **🔹 Environment Variables**

Environment variables override config.yaml values:

#### **Server Configuration**
| Variable           | Default | Description |
|-------------------|---------|-------------|
| `PORT`            | `8080`  | The HTTP port to expose Prometheus metrics. |
| `SCAN_INTERVAL`   | `15s`   | How often to scan for BLE devices (duration format, e.g., 15s, 1m, 1h). |
| `SCAN_DURATION`   | `15s`   | How long each active scan should run (duration format, e.g., 15s, 1m, 1h). |
| `REFRESH_INTERVAL`| `30s`   | How often to check for stale metrics (duration format, e.g., 30s, 1m, 1h). |
| `STALE_THRESHOLD` | `5m`    | Time before inactive sensors are removed (duration format, e.g., 5m, 1h). |

#### **Dashboard Warning Thresholds**
| Variable                      | Default | Description |
|------------------------------|---------|-------------|
| `TEMPERATURE_MIN`            | `-20`   | Minimum temperature for display normalization (°C). |
| `TEMPERATURE_MAX`            | `40`    | Maximum temperature for display normalization (°C). |
| `TEMPERATURE_LOW_THRESHOLD`  | `0`     | Temperature below which low temperature warning is shown (°C). |
| `TEMPERATURE_HIGH_THRESHOLD` | `35`    | Temperature above which high temperature warning is shown (°C). |
| `HUMIDITY_LOW_THRESHOLD`     | `30`    | Humidity below which low humidity warning is shown (%). |
| `HUMIDITY_HIGH_THRESHOLD`    | `70`    | Humidity above which high humidity warning is shown (%). |
| `BATTERY_LOW_THRESHOLD`      | `5`     | Battery level at or below which low battery warning is shown (%). |

Set custom values:
```sh
export PORT=9090
export SCAN_INTERVAL=30s
export SCAN_DURATION=1m
export REFRESH_INTERVAL=1m
export STALE_THRESHOLD=10m
# Optional: Customize warning thresholds
export TEMPERATURE_LOW_THRESHOLD=0
export TEMPERATURE_HIGH_THRESHOLD=35
export HUMIDITY_LOW_THRESHOLD=30
export HUMIDITY_HIGH_THRESHOLD=70
export BATTERY_LOW_THRESHOLD=5
docker-compose up -d
```

---

## 📜 Configuring Known Devices

Devices are now configured in `config.yaml` (see above) instead of a separate `.known_govees` file. This provides:
- ✅ Hierarchical, readable YAML structure
- ✅ Support for calibration offsets per device
- ✅ Centralized configuration with all other settings
- ✅ **Hot-reload support** - changes to `config.yaml` are automatically detected and applied without restart

### **Example Device Configuration**

```yaml
devices:
  - mac: "A4:C1:38:E0:0F:2A"
    name: "Office"
    group: "Upstairs"    # Optional: Group for organization
    offsets:
      temperature: 0.0
      humidity: 0.0
  
  - mac: "A4:C1:38:D3:D2:FC"
    name: "Ensuite"
    group: "Downstairs"
    offsets:
      temperature: -0.5  # Compensate for sensor reading too high
      humidity: 1.0      # Compensate for sensor reading too low
  
  - mac: "A4:C1:38:12:34:56"
    name: "Garage"
    group: "Outdoor"     # Example: Outdoor grouping
    offsets:
      temperature: 0.0
      humidity: 0.0
```

**Notes:**
- **MAC addresses** are case-insensitive and will be normalized to uppercase
- **Group** is optional - use it to organize devices (e.g., "Upstairs", "Downstairs", "Indoor", "Outdoor", "Basement")
- **Offsets** are optional and default to 0.0 if not specified
- **Temperature offsets** are in °C
- **Humidity offsets** are in %
- **Hot-reload**: Changes to device and OpenMeteo configuration are automatically detected and applied within ~500ms without restarting the service

---

## 🏗️ Running with Docker Compose

### **📜 `docker-compose.yaml`**
```yaml
services:
  govee-h5075-prom-exporter:
    build: .
    container_name: govee-h5075-prom-exporter
    network_mode: "host"  # Required for BLE access
    cap_add:
      - NET_ADMIN
      - NET_RAW
    devices:
      - "/dev/bus/usb:/dev/bus/usb"
    environment:
      - PORT=8080
      - SCAN_INTERVAL=15s
      - SCAN_DURATION=15s
      - REFRESH_INTERVAL=30s
      - STALE_THRESHOLD=5m
      - DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket
      # Dashboard warning thresholds (optional - can override config.yaml)
      - TEMPERATURE_MIN=-20
      - TEMPERATURE_MAX=40
      - TEMPERATURE_LOW_THRESHOLD=0
      - TEMPERATURE_HIGH_THRESHOLD=35
      - HUMIDITY_LOW_THRESHOLD=30
      - HUMIDITY_HIGH_THRESHOLD=70
      - BATTERY_LOW_THRESHOLD=5
    volumes:
      - /run/dbus/system_bus_socket:/run/dbus/system_bus_socket
      - ./config.yaml:/app/config.yaml:ro  # Mount config file with device list
    restart: unless-stopped
```

**Note**: You can choose to configure the application using:
- Only environment variables (comment out the config.yaml volume mount)
- Only config.yaml (remove/comment environment variables)
- Both (environment variables will override config.yaml values)

### **📊 Configuration Source Logging**

At startup, the application logs where each configuration value is loaded from:

```
Configuration loaded from:
===========================
  server.port                         = 8080                 [default]
  bluetooth.scanInterval              = 15s                  [config.yaml]
  bluetooth.scanDuration              = 15s                  [config.yaml]
  metrics.refreshInterval             = 30s                  [environment]
  metrics.staleThreshold              = 5m                   [default]
  thresholds.temperature.min          = -20                  [default]
  thresholds.temperature.max          = 40                   [default]
  thresholds.temperature.low          = -5                   [environment]
  thresholds.temperature.high         = 35                   [config.yaml]
  thresholds.humidity.low             = 30                   [default]
  thresholds.humidity.high            = 70                   [default]
  thresholds.battery.low              = 5                    [default]
===========================
```

This helps you understand which configuration source is being used for each setting


### **Start the Container**
```sh
docker-compose up --build -d
```

### **View Logs**
```sh
docker logs -f govee-h5075-prom-exporter
```

### **Check If Metrics Are Available**
```sh
curl http://localhost:8080/metrics
```

---

## 📊 Prometheus Integration

### **1️⃣ Add Exporter to Prometheus Configuration**
Edit `prometheus.yaml`:
```yaml
scrape_configs:
  - job_name: 'govee_ble'
    static_configs:
      - targets: ['localhost:8080']
```

### **2️⃣ Restart Prometheus**
```sh
docker-compose restart prometheus
```

### **3️⃣ Open Prometheus UI**
Go to:
```
http://localhost:9090
```
Search for:
```
govee_h5075_temperature
govee_h5075_humidity
govee_h5075_battery
```

---

## 🌐 Web Interface

### **Dashboard Overview**
The exporter includes a built-in web dashboard accessible at:
```
http://localhost:8080
```

Features:
- **Real-time sensor cards** showing temperature, humidity, and battery levels
- **Auto-refreshing data** every 60 seconds
- **Visual progress bars** for easy metric interpretation
- **Dark/Light theme** support
- **Responsive design** for mobile and desktop
- **Low battery warnings** when levels drop below 5%
- **Automatic removal** of inactive sensors

### **Theme Customization**
The dashboard automatically remembers your theme preference (dark/light) between sessions. Toggle the theme using the sun/moon icon in the top-right corner.

### **Error Handling**
- Displays error messages if sensors become unreachable
- Automatically retries connections
- Shows stale data warnings for inactive sensors

---

## 🛠️ Troubleshooting

### **❓ Metrics Endpoint Not Working**
- Check if the container is running:
  ```sh
  docker ps
  ```
- Restart the service:
  ```sh
  docker-compose down && docker-compose up -d
  ```
- Check logs:
  ```sh
  docker logs -f govee-h5075-prom-exporter
  ```

### **❓ No BLE Devices Detected**
- Ensure Bluetooth is enabled:
  ```sh
  sudo systemctl restart bluetooth
  ```
- Verify adapter is available:
  ```sh
  hciconfig
  ```
  Expected output:
  ```
  hci0:   Type: Primary  Bus: USB
          UP RUNNING
  ```

### **❓ Configuration Changes Not Taking Effect**
- Check the logs to verify hot-reload is working:
  ```sh
  docker logs -f govee-h5075-prom-exporter | grep "Config file"
  ```
- You should see: `Config file watcher: Monitoring config.yaml for changes`
- After editing `config.yaml`, you should see: `Configuration reloaded successfully`
- For OpenMeteo changes, you should also see: `OpenMeteo: Configuration updated (interval: 5m, location: 53.3500, -6.2600)`
- If hot-reload is disabled, restart the container:
  ```sh
  docker-compose restart
  ```

---

## 🛠️ Development

### **🔹 Mock Server for Development**
For development purposes, a Python-based mock server is provided that simulates Govee H5075 devices without requiring actual hardware.

#### **Prerequisites**
- Python 3.x
- Flask

#### **Setup**
1. Install Flask:
```sh
pip install flask
```

2. Start the mock server:
```sh
python mock_server.py
```

The mock server will start at:
- UI: http://localhost:5000
- Metrics: http://localhost:5000/metrics

#### **Mock Server Features**
- Simulates 5 devices (Living Room, Bedroom, Kitchen, Office, Basement)
- Updates sensor data every second with realistic variations:
  - Temperature: Random changes between -0.5°C and +0.5°C (bounded 10-35°C)
  - Humidity: Random changes between -2% and +2% (bounded 30-70%)
  - Battery: Slow decrease with occasional random recharge events
- Serves the same UI as the production server
- Provides Prometheus-formatted metrics

#### **Development Workflow**
1. Start the mock server for development:
```sh
python mock_server.py
```

2. Make changes to the UI (`static/index.html`)
3. Refresh the browser to see changes
4. Test metric collection using:
```sh
curl http://localhost:5000/metrics
```

### **🔹 Building Manually**
If you don't want to use Docker:
```sh
go build -o govee-exporter main.go
./govee-exporter
```

### **🔹 Updating the Code**
Pull the latest updates:
```sh
git pull origin main
docker-compose up --build -d
```

---

## 📜 License
This project is licensed under the **MIT License**.

---

## 🤝 Contributing
Feel free to open **issues** or **pull requests** if you have improvements.

---

## 📧 Contact
If you have any questions, reach out via [GitHub Issues](https://github.com/RoggerFabri/govee-h5075-prom-exporter/issues).

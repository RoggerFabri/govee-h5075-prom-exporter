# Govee H5075 BLE Prometheus Exporter

A **Prometheus exporter** for **Govee H5075 temperature & humidity sensors** that collects real-time data via **Bluetooth Low Energy (BLE)** and exposes it as **Prometheus metrics**.

---

## 🚀 Features
- **BLE-based scanning** (no need for Govee cloud services).
- **Maps device MAC addresses to human-readable names**.
- **Applies user-defined temperature & humidity offsets**.
- **Exports metrics to Prometheus** on a configurable **HTTP port**.
- **Removes stale metrics** if a device is inactive.

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

### **🔹 Environment Variables**
| Variable           | Default | Description |
|-------------------|---------|-------------|
| `PORT`            | `8080`  | The HTTP port to expose Prometheus metrics. |
| `SCAN_INTERVAL`   | `15s`   | How often to scan for BLE devices (duration format, e.g., 15s, 1m, 1h). |
| `SCAN_DURATION`   | `15s`   | How long each active scan should run (duration format, e.g., 15s, 1m, 1h). |
| `REFRESH_INTERVAL`| `30s`   | How often to check for stale metrics (duration format, e.g., 30s, 1m, 1h). |
| `STALE_THRESHOLD` | `5m`    | Time before inactive sensors are removed (duration format, e.g., 5m, 1h). |
| `RELOAD_INTERVAL` | `24h`   | How often to reload the known devices file (duration format, e.g., 1h, 24h). |

Set custom values:
```sh
export PORT=9090
export SCAN_INTERVAL=30s
export SCAN_DURATION=1m
export REFRESH_INTERVAL=1m
export STALE_THRESHOLD=10m
export RELOAD_INTERVAL=12h
docker-compose up -d
```

---

## 📜 Configuring Known Devices

### **1️⃣ Create `.known_govees` File**
Inside the project directory, create `.known_govees`:
```sh
touch .known_govees
```
Add **your sensors** (MAC Address, Name, Temp Offset, Humidity Offset):
```
A4:C1:38:E0:0F:2A Office 0.0 0.0
A4:C1:38:8A:F6:54 Attic 0.0 0.0
A4:C1:38:D3:D2:FC Ensuite -0.5 1.0
A4:C1:38:C1:A0:C1 HotPress 0.3 -0.7
```

### **2️⃣ Mount the File in Docker**
Modify `docker-compose.yml`:
```yaml
volumes:
  - ./.known_govees:/app/.known_govees:ro
```

---

## 🏗️ Running with Docker Compose

### **📜 `docker-compose.yml`**
```yaml
version: "3.9"

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
      - RELOAD_INTERVAL=24h
      - DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket
    volumes:
      - /run/dbus/system_bus_socket:/run/dbus/system_bus_socket
      - ./.known_govees:/app/.known_govees:ro
    restart: unless-stopped
```

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
Edit `prometheus.yml`:
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

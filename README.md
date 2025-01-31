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
| `PORT`           | `8080`  | The HTTP port to expose Prometheus metrics. |
| `REFRESH_INTERVAL` | `30`   | How often (seconds) to check for stale metrics. |
| `STALE_THRESHOLD` | `300`   | Time (seconds) before inactive sensors are removed. |

Set custom values:
```sh
export PORT=9090
export REFRESH_INTERVAL=60
export STALE_THRESHOLD=600
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
      - REFRESH_INTERVAL=30
      - STALE_THRESHOLD=300
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
docker logs -f govee-ble-metrics
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
  docker logs -f govee-ble-metrics
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

### **🔹 Building Manually**
If you don’t want to use Docker:
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

from flask import Flask, Response, send_from_directory
import random
import time
import threading
import os

# Initialize Flask app with explicit static folder configuration
app = Flask(__name__, static_url_path='', static_folder='static')

# Load threshold configuration from environment variables
THRESHOLDS = {
    'TEMPERATURE_MIN': float(os.getenv('TEMPERATURE_MIN', '-20')),
    'TEMPERATURE_MAX': float(os.getenv('TEMPERATURE_MAX', '40')),
    'TEMPERATURE_LOW_THRESHOLD': float(os.getenv('TEMPERATURE_LOW_THRESHOLD', '0')),
    'TEMPERATURE_HIGH_THRESHOLD': float(os.getenv('TEMPERATURE_HIGH_THRESHOLD', '35')),
    'HUMIDITY_LOW_THRESHOLD': float(os.getenv('HUMIDITY_LOW_THRESHOLD', '30')),
    'HUMIDITY_HIGH_THRESHOLD': float(os.getenv('HUMIDITY_HIGH_THRESHOLD', '70')),
    'BATTERY_LOW_THRESHOLD': float(os.getenv('BATTERY_LOW_THRESHOLD', '5'))
}

# Mock devices with initial values and groups
devices = {
    "Living Room": {"temperature": 22.0, "humidity": 45.0, "battery": 85, "group": "Downstairs"},
    "Bedroom": {"temperature": 21.0, "humidity": 48.0, "battery": 90, "group": "Upstairs"},
    "Kitchen": {"temperature": 23.5, "humidity": 52.0, "battery": 75, "group": "Downstairs"},
    "Office": {"temperature": 22.5, "humidity": 47.0, "battery": 95, "group": "Upstairs"},
    "Basement": {"temperature": 20.0, "humidity": 55.0, "battery": 80, "group": "Basement"},
    "Freezer": {"temperature": -18.0, "humidity": 35.0, "battery": 65, "group": "Kitchen"},
    "Garage": {"temperature": 15.0, "humidity": 60.0, "battery": 2, "group": "Outdoor"},
    # Edge case examples:
    "Sauna": {"temperature": 38.0, "humidity": 25.0, "battery": 70, "group": "Basement"},  # High temp warning
    "Greenhouse": {"temperature": 28.0, "humidity": 85.0, "battery": 50, "group": "Outdoor"},  # High humidity
    "Server Room": {"temperature": 24.0, "humidity": 15.0, "battery": 60, "group": "Basement"},  # Low humidity
    "Outdoor Shed": {"temperature": -5.0, "humidity": 40.0, "battery": 3, "group": "Outdoor"},  # Multiple warnings (freezing + low battery)
    "Wine Cellar": {"temperature": 0.0, "humidity": 65.0, "battery": 55, "group": "Basement"},  # Boundary: exactly 0°C
    "Storage Unit": {"temperature": 18.0, "humidity": 50.0, "battery": 5, "group": "Outdoor"}  # Boundary: exactly 5% battery
}

# OpenMeteo mock data (simulates outdoor weather)
# Set OPENMETEO_ENABLED=false to disable
openmeteo_enabled = os.getenv('OPENMETEO_ENABLED', 'true').lower() in ['true', '1', 'yes']
openmeteo_data = {
    "temperature": 15.3,
    "humidity": 65.0
}

# Lock for thread-safe updates
lock = threading.Lock()

def update_mock_data():
    """Update mock data with random variations periodically"""
    while True:
        with lock:
            for name, device in devices.items():
                # Different temperature ranges for different devices
                if name == "Freezer":
                    # Freezer temperature range: -25°C to -10°C
                    device["temperature"] = max(-25, min(-10, device["temperature"] + random.uniform(-0.5, 0.5)))
                elif name == "Sauna":
                    # Sauna temperature range: 35°C to 40°C (high temp warning zone)
                    device["temperature"] = max(35, min(40, device["temperature"] + random.uniform(-0.3, 0.3)))
                elif name == "Outdoor Shed":
                    # Outdoor Shed temperature range: -10°C to 0°C (cold/freezing)
                    device["temperature"] = max(-10, min(0, device["temperature"] + random.uniform(-0.5, 0.5)))
                elif name == "Wine Cellar":
                    # Wine Cellar: keep at exactly 0°C (boundary test)
                    device["temperature"] = max(-0.5, min(0.5, device["temperature"] + random.uniform(-0.1, 0.1)))
                else:
                    # Normal temperature range: 10°C to 35°C
                    device["temperature"] = max(10, min(35, device["temperature"] + random.uniform(-0.5, 0.5)))
                
                # Different humidity ranges for different devices
                if name == "Greenhouse":
                    # Greenhouse: high humidity 80-90%
                    device["humidity"] = max(80, min(90, device["humidity"] + random.uniform(-1, 1)))
                elif name == "Server Room":
                    # Server Room: low humidity 10-20%
                    device["humidity"] = max(10, min(20, device["humidity"] + random.uniform(-1, 1)))
                elif name == "Sauna":
                    # Sauna: low humidity 20-30%
                    device["humidity"] = max(20, min(30, device["humidity"] + random.uniform(-1, 1)))
                else:
                    # Normal humidity range: 30-70%
                    device["humidity"] = max(30, min(70, device["humidity"] + random.uniform(-2, 2)))
                
                # Battery management with edge cases
                if name in ["Garage", "Outdoor Shed"]:
                    # Keep battery between 1-3% to show warning
                    device["battery"] = max(1, min(3, device["battery"] + random.uniform(-0.1, 0.1)))
                elif name == "Storage Unit":
                    # Keep battery at exactly 5% (boundary test)
                    device["battery"] = max(4.5, min(5.5, device["battery"] + random.uniform(-0.1, 0.1)))
                elif random.random() < 0.01:  # 1% chance to "recharge"
                    device["battery"] = min(100, device["battery"] + random.randint(10, 30))
                else:
                    device["battery"] = max(0, device["battery"] - random.uniform(0, 0.1))
        
        time.sleep(1)  # Update every second

def update_openmeteo_data():
    """Update OpenMeteo mock data with realistic outdoor variations"""
    while True:
        with lock:
            # Outdoor temperature: larger variations than indoor (seasonal changes)
            # Range: -10°C to 35°C
            openmeteo_data["temperature"] = max(-10, min(35, 
                openmeteo_data["temperature"] + random.uniform(-0.8, 0.8)))
            
            # Outdoor humidity: broader range than indoor
            # Range: 20% to 95%
            openmeteo_data["humidity"] = max(20, min(95, 
                openmeteo_data["humidity"] + random.uniform(-2, 2)))
        
        time.sleep(5)  # Update every 5 seconds

@app.route('/metrics')
def metrics():
    """Serve mock metrics in Prometheus format"""
    with lock:
        lines = []
        
        # Govee sensor metrics
        for name, data in devices.items():
            lines.extend([
                f'govee_h5075_temperature{{name="{name}"}} {data["temperature"]:.1f}',
                f'govee_h5075_humidity{{name="{name}"}} {data["humidity"]:.1f}',
                f'govee_h5075_battery{{name="{name}"}} {data["battery"]:.0f}'
            ])
        
        # OpenMeteo metrics (only if enabled)
        if openmeteo_enabled:
            lines.extend([
                '',
                '# HELP openmeteo_temperature Temperature from OpenMeteo API',
                '# TYPE openmeteo_temperature gauge',
                f'openmeteo_temperature {openmeteo_data["temperature"]:.1f}',
                '# HELP openmeteo_humidity Humidity from OpenMeteo API',
                '# TYPE openmeteo_humidity gauge',
                f'openmeteo_humidity {openmeteo_data["humidity"]:.1f}'
            ])
    
    return Response('\n'.join(lines), mimetype='text/plain')

@app.route('/config.js')
def config_js():
    """Serve threshold configuration and device groups as JavaScript"""
    import json
    
    # Build device groups map
    with lock:
        device_groups = {name: data.get("group", "") for name, data in devices.items()}
    
    config_content = f'''// Dashboard configuration from environment variables
window.DASHBOARD_CONFIG = {{
    TEMPERATURE_MIN: {THRESHOLDS['TEMPERATURE_MIN']},
    TEMPERATURE_MAX: {THRESHOLDS['TEMPERATURE_MAX']},
    TEMPERATURE_LOW_THRESHOLD: {THRESHOLDS['TEMPERATURE_LOW_THRESHOLD']},
    TEMPERATURE_HIGH_THRESHOLD: {THRESHOLDS['TEMPERATURE_HIGH_THRESHOLD']},
    HUMIDITY_LOW_THRESHOLD: {THRESHOLDS['HUMIDITY_LOW_THRESHOLD']},
    HUMIDITY_HIGH_THRESHOLD: {THRESHOLDS['HUMIDITY_HIGH_THRESHOLD']},
    BATTERY_LOW_THRESHOLD: {THRESHOLDS['BATTERY_LOW_THRESHOLD']},
    DEVICE_GROUPS: {json.dumps(device_groups)}
}};'''
    return Response(config_content, mimetype='application/javascript')

@app.after_request
def add_header(response):
    """Add headers for browser compatibility and caching"""
    response.headers['X-UA-Compatible'] = 'IE=Edge,chrome=1'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Explicit routes for static files
@app.route('/')
def root():
    """Serve the main UI"""
    return app.send_static_file('index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files with proper MIME types"""
    return send_from_directory(app.static_folder, filename)

if __name__ == '__main__':
    # Start the background thread for updating mock data
    update_thread = threading.Thread(target=update_mock_data, daemon=True)
    update_thread.start()
    
    # Start OpenMeteo update thread (if enabled)
    if openmeteo_enabled:
        openmeteo_thread = threading.Thread(target=update_openmeteo_data, daemon=True)
        openmeteo_thread.start()
    
    openmeteo_status = "ENABLED" if openmeteo_enabled else "DISABLED"
    
    print(f"""
Mock Govee H5075 Server Starting
-------------------------------
UI: http://localhost:5000
Metrics: http://localhost:5000/metrics

Mock devices:
Standard devices:
- Living Room
- Bedroom
- Kitchen
- Office
- Basement

Edge case examples:
- Freezer (negative temperature: -18°C, blue snowflake warning)
- Garage (low battery: 2%, orange triangle warning)
- Sauna (high temperature: 38°C, red flame warning + low humidity: 25%, amber droplet warning)
- Greenhouse (high humidity: 85%, cyan droplet warning)
- Server Room (low humidity: 15%, amber droplet warning)
- Outdoor Shed (multiple warnings: freezing temp + low battery)
- Wine Cellar (boundary test: 0°C)
- Storage Unit (boundary test: 5% battery)

OpenMeteo Integration: {openmeteo_status}
{f"- Outdoor Temperature: {openmeteo_data['temperature']:.1f}°C" if openmeteo_enabled else "- Set OPENMETEO_ENABLED=true to enable"}
{f"- Outdoor Humidity: {openmeteo_data['humidity']:.1f}%" if openmeteo_enabled else ""}

Press Ctrl+C to stop
""")
    
    # Start Flask server
    app.run(host='0.0.0.0', port=5000, debug=False) 
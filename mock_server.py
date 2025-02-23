from flask import Flask, Response
import random
import time
import threading

app = Flask(__name__)

# Mock devices with initial values
devices = {
    "Living Room": {"temperature": 22.0, "humidity": 45.0, "battery": 85},
    "Bedroom": {"temperature": 21.0, "humidity": 48.0, "battery": 90},
    "Kitchen": {"temperature": 23.5, "humidity": 52.0, "battery": 75},
    "Office": {"temperature": 22.5, "humidity": 47.0, "battery": 95},
    "Basement": {"temperature": 20.0, "humidity": 55.0, "battery": 80}
}

# Lock for thread-safe updates
lock = threading.Lock()

def update_mock_data():
    """Update mock data with random variations periodically"""
    while True:
        with lock:
            for device in devices.values():
                # Random temperature changes (-0.5 to +0.5)
                device["temperature"] = max(10, min(35, device["temperature"] + random.uniform(-0.5, 0.5)))
                
                # Random humidity changes (-2 to +2)
                device["humidity"] = max(30, min(70, device["humidity"] + random.uniform(-2, 2)))
                
                # Slowly decrease battery, with random recharge events
                if random.random() < 0.01:  # 1% chance to "recharge"
                    device["battery"] = min(100, device["battery"] + random.randint(10, 30))
                else:
                    device["battery"] = max(0, device["battery"] - random.uniform(0, 0.1))
        
        time.sleep(1)  # Update every 5 seconds

@app.route('/metrics')
def metrics():
    """Serve mock metrics in Prometheus format"""
    with lock:
        lines = []
        for name, data in devices.items():
            lines.extend([
                f'govee_h5075_temperature{{name="{name}"}} {data["temperature"]:.1f}',
                f'govee_h5075_humidity{{name="{name}"}} {data["humidity"]:.1f}',
                f'govee_h5075_battery{{name="{name}"}} {data["battery"]:.0f}'
            ])
    
    return Response('\n'.join(lines), mimetype='text/plain')

@app.route('/')
def index():
    """Serve the main UI"""
    with open('static/index.html', 'r', encoding='utf-8') as f:
        return Response(f.read(), mimetype='text/html; charset=utf-8')

@app.route('/favicon.svg')
def favicon():
    """Serve the favicon"""
    with open('static/favicon.svg', 'r', encoding='utf-8') as f:
        return Response(f.read(), mimetype='image/svg+xml; charset=utf-8')

if __name__ == '__main__':
    # Start the background thread for updating mock data
    update_thread = threading.Thread(target=update_mock_data, daemon=True)
    update_thread.start()
    
    print("""
Mock Govee H5075 Server Starting
-------------------------------
UI: http://localhost:5000
Metrics: http://localhost:5000/metrics

Mock devices:
- Living Room
- Bedroom
- Kitchen
- Office
- Basement

Press Ctrl+C to stop
""")
    
    # Start Flask server
    app.run(host='0.0.0.0', port=5000, debug=False) 
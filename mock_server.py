from flask import Flask, Response, send_from_directory
import random
import time
import threading

# Initialize Flask app with explicit static folder configuration
app = Flask(__name__, static_url_path='', static_folder='static')

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
        
        time.sleep(1)  # Update every second

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
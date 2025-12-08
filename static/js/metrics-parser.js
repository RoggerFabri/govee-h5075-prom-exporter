// Metrics parsing from Prometheus format

function parseMetrics(text) {
    const rooms = {};
    const statusByDevice = {};
    const weatherData = {};
    
    // Parse metrics text into room data and weather data
    text.split('\n').forEach(line => {
        if (!line || line.startsWith('#')) return; // Skip empty lines and comments
        
        // Parse OpenMeteo metrics (no labels, just metric name and value)
        const weatherMatch = line.match(/openmeteo_(\w+)\s+([-\d.]+)/);
        if (weatherMatch) {
            const [, metric, value] = weatherMatch;
            weatherData[metric] = parseFloat(value);
            return;
        }

        // Parse device status metrics
        const statusMatch = line.match(/govee_device_status\{name="([^"]+)",status="([^"]+)"\}\s+([-\d.]+)/);
        if (statusMatch) {
            const [, name, status, value] = statusMatch;
            const numericValue = parseFloat(value);
            if (numericValue >= 0.5) {
                statusByDevice[name] = status;
            }
            return;
        }
        
        // Parse Govee sensor metrics
        const match = line.match(/govee_h5075_(\w+){name="([^"]+)"}\s+([-\d.]+)/);
        if (!match) return;
        
        const [, metric, name, value] = match;
        if (!rooms[name]) {
            rooms[name] = {
                group: DEVICE_GROUPS[name] || 'Ungrouped',
                displayName: getDisplayName(name)
            };
        }
        rooms[name][metric] = parseFloat(value);
    });

    // Ensure all devices with status are represented in the UI
    Object.entries(statusByDevice).forEach(([name, status]) => {
        if (!rooms[name]) {
            rooms[name] = {
                group: DEVICE_GROUPS[name] || 'Ungrouped',
                displayName: getDisplayName(name)
            };
        }
        rooms[name].status = status;
    });

    // Apply status to devices that already had metrics
    Object.entries(rooms).forEach(([name, data]) => {
        if (statusByDevice[name]) {
            data.status = statusByDevice[name];
        }
    });
    
    // Add OpenMeteo as a special "device" if data exists
    if (weatherData.temperature !== undefined || weatherData.humidity !== undefined) {
        const name = 'Outdoor';
        rooms[name] = {
            group: 'Outdoor Weather',
            displayName: getDisplayName(name),
            temperature: weatherData.temperature,
            humidity: weatherData.humidity,
            // No battery for weather API data
            isWeatherStation: true
        };
    }
    
    return rooms;
}


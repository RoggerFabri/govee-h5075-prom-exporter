// Configuration
const REFRESH_INTERVAL = 30000;
const MAX_TEMPERATURE = 40;
const MIN_TEMPERATURE = -20;
const CONNECTION_TIMEOUT = 5000;

// Connection state tracking
let lastSuccessfulFetch = Date.now();
let connectionState = 'connected';

// Check connection status periodically
setInterval(() => {
    const timeSinceLastSuccess = Date.now() - lastSuccessfulFetch;
    if (timeSinceLastSuccess > REFRESH_INTERVAL * 2) {
        updateConnectivityStatus('disconnected');
    }
}, REFRESH_INTERVAL);

function updateConnectivityStatus(status) {
    const indicator = document.querySelector('.connectivity-indicator');
    const prevState = indicator.className.split(' ')[1];
    
    if (prevState !== status) {
        indicator.className = `connectivity-indicator ${status}`;
        
        const statusMessages = {
            'connected': 'Connected to sensor network',
            'disconnected': 'Connection lost to sensor network',
            'error': 'Error connecting to sensor network'
        };
        indicator.setAttribute('aria-label', statusMessages[status]);
        
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'alert');
        announcement.style.position = 'absolute';
        announcement.style.width = '1px';
        announcement.style.height = '1px';
        announcement.style.overflow = 'hidden';
        announcement.textContent = statusMessages[status];
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 3000);
    }
}

// Format timestamp
function formatLastUpdate() {
    const now = new Date();
    return now.toLocaleTimeString();
}

// Update timestamp display
function updateTimestamp() {
    const timestampEl = document.querySelector('.last-update .timestamp');
    timestampEl.textContent = `Last updated: ${formatLastUpdate()}`;
}

// Theme handling
function toggleTheme() {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

// Progress bar animation
function startProgressBar() {
    const progressBar = document.getElementById('refreshProgress');
    progressBar.style.transition = 'none';
    progressBar.style.transform = 'scaleX(1)';
    progressBar.offsetHeight; // Force reflow
    progressBar.style.transition = `transform ${REFRESH_INTERVAL/1000}s linear`;
    progressBar.style.transform = 'scaleX(0)';
}

// Updated utility functions
function normalizeTemp(temp) {
    // Normalize temperature to 0-100% range, supporting negative temperatures
    const tempRange = MAX_TEMPERATURE - MIN_TEMPERATURE;
    const normalizedTemp = ((temp - MIN_TEMPERATURE) / tempRange) * 100;
    return Math.max(0, Math.min(100, normalizedTemp));
}

function formatTrend(current, previous) {
    if (!previous) return '';
    const diff = current - previous;
    if (Math.abs(diff) < 0.1) return 'stable';
    return diff > 0 ? 'increasing' : 'decreasing';
}

function createMetricElement(label, value, unit, type, previousValue = null) {
    const percentage = type === 'temperature' ? normalizeTemp(value) : Math.max(0, value);
    const showBatteryWarning = type === 'battery' && value <= 5;
    const showFreezingWarning = type === 'temperature' && value < 0;
    const showHotWarning = type === 'temperature' && value > 35;
    const showHumidityWarning = type === 'humidity' && value > 70;
    const showTemperatureWarning = showFreezingWarning || showHotWarning;
    const showWarning = showBatteryWarning || showTemperatureWarning || showHumidityWarning;
    const trend = formatTrend(value, previousValue);
    const trendAnnouncement = trend ? `, ${trend} from previous reading` : '';
    const hasChanged = previousValue !== null && Math.abs(value - previousValue) >= 0.1;
    const changeClass = hasChanged ? 'changed' : '';
    
    // Determine warning message and icon based on type
    let warningLabel = '';
    let warningIcon = '';
    
    if (showBatteryWarning) {
        warningLabel = 'Low Battery Warning';
        warningIcon = `
            <span class="warning-icon" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
            </span>
        `;
    } else if (showFreezingWarning) {
        warningLabel = 'Freezing Temperature Warning';
        warningIcon = `
            <span class="warning-icon freezing-warning" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2M12 6L11.5 8.5L9 9L11.5 9.5L12 12L12.5 9.5L15 9L12.5 8.5L12 6Z"/>
                </svg>
            </span>
        `;
    } else if (showHotWarning) {
        warningLabel = 'High Temperature Warning';
        warningIcon = `
            <span class="warning-icon hot-warning" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11.5 3.5c0 .83-.67 1.5-1.5 1.5S8.5 4.33 8.5 3.5 9.17 2 10 2s1.5.67 1.5 1.5zM6.5 6c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S8.83 7.5 8 7.5 6.5 6.83 6.5 6zm7 0c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5zm2.5-2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5zM12 8c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
                </svg>
            </span>
        `;
    } else if (showHumidityWarning) {
        warningLabel = 'High Humidity Warning';
        warningIcon = `
            <span class="warning-icon humidity-warning" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0zm0 15.93A5.5 5.5 0 0 1 6.5 13c0-1.48.58-2.92 1.66-4l.01-.01L12 5.27l3.83 3.82.01.01c1.08 1.08 1.66 2.52 1.66 4a5.5 5.5 0 0 1-5.5 5.62z"/>
                </svg>
            </span>
        `;
    }

    return `
        <div class="metric ${type}" data-value="${value}">
            <div class="metric-header">
                <span>${label}</span>
                <span class="metric-value ${changeClass}" aria-label="${label} is ${value}${unit}${trendAnnouncement}">
                    ${value}${unit}
                    ${warningIcon}
                </span>
            </div>
            <div class="progress-bar" 
                 role="progressbar" 
                 aria-valuenow="${value}" 
                 aria-valuemin="${type === 'temperature' ? MIN_TEMPERATURE : '0'}" 
                 aria-valuemax="${type === 'temperature' ? MAX_TEMPERATURE : '100'}"
                 aria-label="${label} level">
                <div class="progress" style="width: ${percentage}%"></div>
            </div>
        </div>
    `;
}

async function fetchMetrics() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);
        
        const response = await fetch('/metrics', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        const rooms = {};

        // Update connection status
        lastSuccessfulFetch = Date.now();
        updateConnectivityStatus('connected');

        // Update timestamp
        updateTimestamp();

        // Parse metrics text into room data
        text.split('\n').forEach(line => {
            if (!line || line.startsWith('#')) return; // Skip empty lines and comments
            
            const match = line.match(/govee_h5075_(\w+){name="([^"]+)"}\s+([-\d.]+)/);
            if (!match) return;
            
            const [, metric, name, value] = match;
            if (!rooms[name]) {
                rooms[name] = {};
            }
            rooms[name][metric] = parseFloat(value);
        });

        // Store previous values for comparison
        const previousValues = {};
        document.querySelectorAll('.card').forEach(card => {
            const room = card.getAttribute('data-room');
            if (!room) return;
            
            const tempEl = card.querySelector('.temperature .metric-value');
            const humidEl = card.querySelector('.humidity .metric-value');
            const battEl = card.querySelector('.battery .metric-value');
            
            previousValues[room] = {
                temperature: tempEl ? parseFloat(tempEl.textContent) : null,
                humidity: humidEl ? parseFloat(humidEl.textContent) : null,
                battery: battEl ? parseFloat(battEl.textContent) : null
            };
        });

        // Update or create cards for each room
        Object.entries(rooms).forEach(([room, data]) => {
            let cardElement = document.getElementById('sensors-container').querySelector(`[data-room="${room}"]`);
            const prev = previousValues[room] || {};
            
            if (!cardElement) {
                cardElement = document.createElement('div');
                cardElement.className = 'card';
                cardElement.setAttribute('data-room', room);
                document.getElementById('sensors-container').appendChild(cardElement);
            }

            cardElement.innerHTML = `
                <h2>${room}</h2>
                ${typeof data.temperature !== 'undefined' ? createMetricElement('Temperature', data.temperature.toFixed(1), '°C', 'temperature', prev.temperature) : ''}
                ${typeof data.humidity !== 'undefined' ? createMetricElement('Humidity', data.humidity.toFixed(1), '%', 'humidity', prev.humidity) : ''}
                ${typeof data.battery !== 'undefined' ? createMetricElement('Battery', Math.round(data.battery), '%', 'battery', prev.battery) : ''}
            `;
        });

        // Remove cards for rooms that no longer exist
        document.getElementById('sensors-container').querySelectorAll('.card').forEach(card => {
            const room = card.getAttribute('data-room');
            if (!rooms[room]) {
                card.remove();
            }
        });

        startProgressBar();
        document.getElementById('sensors-container').classList.remove('error');
        
    } catch (error) {
        console.error('Error fetching metrics:', error);
        
        // Update connection status based on error type
        if (error.name === 'AbortError') {
            updateConnectivityStatus('disconnected');
        } else {
            updateConnectivityStatus('error');
        }
        
        const container = document.getElementById('sensors-container');
        container.innerHTML = `
            <div class="card error" role="alert">
                <h2>Error Loading Data</h2>
                <p class="error-message">Unable to fetch sensor data. Will retry in ${REFRESH_INTERVAL/1000} seconds.</p>
            </div>
        `;
    }
}

async function manualRefresh() {
    const refreshButton = document.querySelector('.refresh-button');
    refreshButton.classList.add('spinning');
    await fetchMetrics();
    refreshButton.classList.remove('spinning');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set initial theme
    document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');
    
    // Initial timestamp
    updateTimestamp();

    // Initial fetch and periodic updates
    fetchMetrics();
    setInterval(fetchMetrics, REFRESH_INTERVAL);
}); 
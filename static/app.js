// Configuration
const REFRESH_INTERVAL = 30000;
const MAX_TEMPERATURE = 40;
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
    return Math.max(0, ((temp - 0) / MAX_TEMPERATURE) * 100);
}

function formatTrend(current, previous) {
    if (!previous) return '';
    const diff = current - previous;
    if (Math.abs(diff) < 0.1) return 'stable';
    return diff > 0 ? 'increasing' : 'decreasing';
}

function createMetricElement(label, value, unit, type, previousValue = null) {
    const percentage = type === 'temperature' ? normalizeTemp(value) : Math.max(0, value);
    const showWarning = type === 'battery' && value <= 5;
    const trend = formatTrend(value, previousValue);
    const trendAnnouncement = trend ? `, ${trend} from previous reading` : '';
    const hasChanged = previousValue !== null && Math.abs(value - previousValue) >= 0.1;
    const changeClass = hasChanged ? 'changed' : '';
    
    const warningIcon = showWarning ? `
        <span class="warning-icon" role="alert" aria-label="Low Battery Warning">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
        </span>
    ` : '';

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
                 aria-valuemin="0" 
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
            
            const match = line.match(/govee_h5075_(\w+){name="([^"]+)"}\s+([\d.]+)/);
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
/* ============================================
   Source: static/js/config.js
   ============================================ */

// Configuration - Load from server or use defaults
const CONFIG = window.DASHBOARD_CONFIG || {};
const DEVICE_GROUPS = CONFIG.DEVICE_GROUPS || {};
const DEVICE_DISPLAY_NAMES = CONFIG.DEVICE_DISPLAY_NAMES || {};

const getDisplayName = (name) => DEVICE_DISPLAY_NAMES[name] || name;

const REFRESH_INTERVAL = 30000;
const MAX_TEMPERATURE = CONFIG.TEMPERATURE_MAX || 40;
const MIN_TEMPERATURE = CONFIG.TEMPERATURE_MIN || -20;
const TEMPERATURE_LOW_THRESHOLD = CONFIG.TEMPERATURE_LOW_THRESHOLD !== undefined ? CONFIG.TEMPERATURE_LOW_THRESHOLD : 0;
const TEMPERATURE_HIGH_THRESHOLD = CONFIG.TEMPERATURE_HIGH_THRESHOLD || 35;
const HUMIDITY_LOW_THRESHOLD = CONFIG.HUMIDITY_LOW_THRESHOLD || 30;
const HUMIDITY_HIGH_THRESHOLD = CONFIG.HUMIDITY_HIGH_THRESHOLD || 70;
const BATTERY_LOW_THRESHOLD = CONFIG.BATTERY_LOW_THRESHOLD || 5;
const CONNECTION_TIMEOUT = 5000;



/* ============================================
   Source: static/js/layout.js
   ============================================ */

// Layout mode detection and management

function isDesktopLayoutMode() {
    // Check if document is available (defensive check)
    if (!document || !document.documentElement) {
        return window.innerWidth > 600; // Fallback to screen width
    }
    
    const layout = document.documentElement.getAttribute('data-layout');
    // Explicit desktop mode
    if (layout === 'desktop') {
        return true;
    }
    // Explicit mobile mode
    if (layout === 'mobile') {
        return false;
    }
    // Auto mode or no layout set: check screen width (desktop if > 600px, matching CSS media query)
    return window.innerWidth > 600;
}

function updateLayoutIcon() {
    const layout = document.documentElement.getAttribute('data-layout') || 'auto';
    const button = document.querySelector('.layout-toggle');
    
    if (button) {
        // Remove all state classes
        button.classList.remove('layout-mobile', 'layout-desktop', 'layout-auto');
        // Add current state class
        button.classList.add(`layout-${layout}`);
    }
}

function toggleLayout() {
    const currentLayout = document.documentElement.getAttribute('data-layout');
    let newLayout;
    
    if (currentLayout === 'mobile') {
        newLayout = 'desktop';
    } else if (currentLayout === 'desktop') {
        newLayout = 'auto';
    } else {
        newLayout = 'mobile';
    }
    
    document.documentElement.setAttribute('data-layout', newLayout);
    localStorage.setItem('layout', newLayout);
    
    // Update button icons visibility
    updateLayoutIcon();
    
    // Trigger layout update callback if it exists
    if (window.onLayoutChange) {
        window.onLayoutChange();
    }
}



/* ============================================
   Source: static/js/connectivity.js
   ============================================ */

// Connection status tracking

let lastSuccessfulFetch = Date.now();

// Check connection status periodically
setInterval(() => {
    const timeSinceLastSuccess = Date.now() - lastSuccessfulFetch;
    if (timeSinceLastSuccess > REFRESH_INTERVAL * 2) {
        updateConnectivityStatus('disconnected');
    }
}, REFRESH_INTERVAL);

function updateConnectivityStatus(status) {
    const indicator = document.querySelector('.connectivity-indicator');
    if (!indicator) return;
    
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

function markFetchSuccess() {
    lastSuccessfulFetch = Date.now();
    updateConnectivityStatus('connected');
}



/* ============================================
   Source: static/js/metrics-parser.js
   ============================================ */

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



/* ============================================
   Source: static/js/card-renderer.js
   ============================================ */

// CardRenderer - Single source of truth for all card rendering logic

// Helper function to normalize temperature
function normalizeTemp(temp) {
    const tempRange = MAX_TEMPERATURE - MIN_TEMPERATURE;
    const normalizedTemp = ((temp - MIN_TEMPERATURE) / tempRange) * 100;
    return Math.max(0, Math.min(100, normalizedTemp));
}

// Helper function to escape HTML
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Helper function to create metric element
function createMetricElement(label, value, unit, type, previousValue = null, showPlaceholder = false) {
    if (showPlaceholder) {
        return `
        <div class="metric ${type}" data-value="-">
            <div class="metric-header">
                <span>${label}</span>
                <span class="metric-value" aria-label="${label} is unavailable">
                    -${unit}
                </span>
            </div>
            <div class="progress-bar" 
                 role="progressbar" 
                 aria-valuenow="0" 
                 aria-valuemin="${type === 'temperature' ? MIN_TEMPERATURE : '0'}" 
                 aria-valuemax="${type === 'temperature' ? MAX_TEMPERATURE : '100'}"
                 aria-label="${label} level unavailable">
                <div class="progress" style="width: 0%"></div>
            </div>
        </div>
    `;
    }
    const percentage = type === 'temperature' ? normalizeTemp(value) : Math.max(0, value);
    const showBatteryWarning = type === 'battery' && value <= BATTERY_LOW_THRESHOLD;
    const showFreezingWarning = type === 'temperature' && value < TEMPERATURE_LOW_THRESHOLD;
    const showHotWarning = type === 'temperature' && value > TEMPERATURE_HIGH_THRESHOLD;
    const showHighHumidityWarning = type === 'humidity' && value > HUMIDITY_HIGH_THRESHOLD;
    const showLowHumidityWarning = type === 'humidity' && value < HUMIDITY_LOW_THRESHOLD;
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
    } else if (showHighHumidityWarning) {
        warningLabel = 'High Humidity Warning';
        warningIcon = `
            <span class="warning-icon high-humidity-warning" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0zm0 15.93A5.5 5.5 0 0 1 6.5 13c0-1.48.58-2.92 1.66-4l.01-.01L12 5.27l3.83 3.82.01.01c1.08 1.08 1.66 2.52 1.66 4a5.5 5.5 0 0 1-5.5 5.62z"/>
                </svg>
            </span>
        `;
    } else if (showLowHumidityWarning) {
        warningLabel = 'Low Humidity Warning';
        warningIcon = `
            <span class="warning-icon low-humidity-warning" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0zm0 15.93A5.5 5.5 0 0 1 6.5 13c0-1.48.58-2.92 1.66-4l.01-.01L12 5.27l3.83 3.82.01.01c1.08 1.08 1.66 2.52 1.66 4a5.5 5.5 0 0 1-5.5 5.62zM9 12c0 1.66 1.34 3 3 3s3-1.34 3-3H9z"/>
                </svg>
            </span>
        `;
    }

    return `
        <div class="metric ${type}" data-value="${value}">
            <div class="metric-header">
                <span>${label}</span>
                <span class="metric-value ${changeClass}" aria-label="${label} is ${value}${unit}">
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

// Helper function to create compact metrics
function createCompactMetrics(data, excludeStatusChip = false) {
    const metrics = [];
    
    // Temperature
    if (typeof data.temperature !== 'undefined') {
        const temp = data.temperature.toFixed(1);
        const showFreezingWarning = data.temperature < TEMPERATURE_LOW_THRESHOLD;
        const showHotWarning = data.temperature > TEMPERATURE_HIGH_THRESHOLD;
        
        let warningClass = '';
        let ariaLabel = 'Temperature';
        if (showFreezingWarning) {
            warningClass = 'temp-low';
            ariaLabel = 'Low Temperature Warning';
        } else if (showHotWarning) {
            warningClass = 'temp-high';
            ariaLabel = 'High Temperature Warning';
        }
        
        metrics.push(`
            <span class="compact-metric ${warningClass}" title="${ariaLabel}" role="${warningClass ? 'alert' : ''}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-1v1h1v.5c-.31-.18-.65-.3-1-.34V5z"/>
                </svg>${temp}°C
            </span>
        `);
    }
    
    // Humidity
    if (typeof data.humidity !== 'undefined') {
        const humid = data.humidity.toFixed(1);
        const showHighHumidityWarning = data.humidity > HUMIDITY_HIGH_THRESHOLD;
        const showLowHumidityWarning = data.humidity < HUMIDITY_LOW_THRESHOLD;
        
        let warningClass = '';
        let ariaLabel = 'Humidity';
        if (showHighHumidityWarning) {
            warningClass = 'humidity-high';
            ariaLabel = 'High Humidity Warning';
        } else if (showLowHumidityWarning) {
            warningClass = 'humidity-low';
            ariaLabel = 'Low Humidity Warning';
        }
        
        metrics.push(`
            <span class="compact-metric ${warningClass}" title="${ariaLabel}" role="${warningClass ? 'alert' : ''}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69zM12 4.8L8.05 8.75a6 6 0 1 0 7.9 0L12 4.8z"/>
                </svg>${humid}%
            </span>
        `);
    }
    
    // Battery
    if (typeof data.battery !== 'undefined') {
        const batt = Math.round(data.battery);
        const showBatteryWarning = batt <= BATTERY_LOW_THRESHOLD;
        
        let warningClass = '';
        let ariaLabel = 'Battery';
        if (showBatteryWarning) {
            warningClass = 'battery-low';
            ariaLabel = 'Low Battery Warning';
        }
        
        metrics.push(`
            <span class="compact-metric ${warningClass}" title="${ariaLabel}" role="${warningClass ? 'alert' : ''}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/>
                </svg>${batt}%
            </span>
        `);
    }
    
    // Status indicator (stale/missing) - icon only
    // Skip if excludeStatusChip is true (e.g., in desktop layout where we show it in header)
    if (!excludeStatusChip && data.status && data.status !== 'active' && !data.isWeatherStation) {
        const statusLabel = data.status === 'never_seen' ? 'Missing' : 'Stale';
        metrics.push(`
            <span class="compact-metric status-chip status-${data.status}" title="${statusLabel}" role="status">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
            </span>
        `);
    }
    
    return `<div class="metrics-compact">${metrics.join('')}</div>`;
}

class CardRenderer {
    // Build render context - make all decisions in one place
    buildRenderContext(deviceData, layoutMode) {
        const isDesktop = layoutMode === 'desktop' || (layoutMode === 'auto' && window.innerWidth > 600);
        const status = deviceData.status || 'active';
        const isStale = status === 'stale' || status === 'never_seen';
        const hasMetrics = typeof deviceData.temperature !== 'undefined' || 
                          typeof deviceData.humidity !== 'undefined' || 
                          typeof deviceData.battery !== 'undefined';
        const isWeatherStation = deviceData.isWeatherStation || false;
        
        // Check for low battery (only if not stale/missing - those take priority)
        const battery = deviceData.battery;
        const isLowBattery = !isStale && !isWeatherStation && 
                            typeof battery !== 'undefined' && 
                            battery <= BATTERY_LOW_THRESHOLD;
        
        const shouldShowPlaceholderMetrics = isStale && !isWeatherStation && !hasMetrics && isDesktop;
        const shouldAddNoMetricsClass = !hasMetrics && !shouldShowPlaceholderMetrics;
        
        // Determine status label: stale/missing takes priority over low battery
        let statusLabel = '';
        if (isStale && !isWeatherStation) {
            statusLabel = status === 'never_seen' ? 'Missing' : 'Stale';
        } else if (isLowBattery) {
            statusLabel = 'Low Battery';
        }
        
        return {
            isDesktop,
            isStale,
            isLowBattery,
            hasMetrics,
            isWeatherStation,
            status,
            shouldShowPlaceholderMetrics,
            shouldAddNoMetricsClass,
            statusLabel
        };
    }
    
    // Create warning chip HTML
    createWarningChip(status, label) {
        return `
            <span class="compact-metric status-chip status-${status} card-header-warning-chip" title="${label}" role="status">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
            </span>
        `;
    }
    
    // Create status chip for compact metrics
    createStatusChip(status, label) {
        return `
            <span class="compact-metric status-chip status-${status}" title="${label}" role="status">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
            </span>
        `;
    }
    
    // Create placeholder metrics HTML
    createPlaceholderMetrics() {
        return `
            ${createMetricElement('Temperature', 0, '°C', 'temperature', null, true)}
            ${createMetricElement('Humidity', 0, '%', 'humidity', null, true)}
            ${createMetricElement('Battery', 0, '%', 'battery', null, true)}
        `;
    }
    
    // Render card HTML - single method for all card rendering
    renderCardHTML(deviceName, deviceData, previousValues = {}, layoutMode = 'auto') {
        const context = this.buildRenderContext(deviceData, layoutMode);
        const title = escapeHtml(deviceData.displayName || deviceName);
        const baseClass = context.isWeatherStation ? 'card weather-station' : 'card';
        const cardClass = baseClass + 
            (context.isStale ? ' card-stale' : '') + 
            (context.shouldAddNoMetricsClass ? ' card-no-metrics' : '');
        
        const statusTooltip = context.statusLabel ? ` title="${context.statusLabel}"` : '';
        
        // Create compact metrics (exclude status chip in desktop when showing placeholder metrics)
        const excludeStatusChip = context.isDesktop && context.shouldShowPlaceholderMetrics;
        const compactMetrics = createCompactMetrics(deviceData, excludeStatusChip);
        
        // Weather station footer
        const weatherFooter = context.isWeatherStation ? `
            <div class="card-footer">
                <small>Source: Open-Meteo API</small>
            </div>
        ` : '';
        
        // Metrics block
        const metricsBlock = context.hasMetrics ? `
            ${typeof deviceData.temperature !== 'undefined' ? createMetricElement('Temperature', deviceData.temperature.toFixed(1), '°C', 'temperature', previousValues.temperature) : ''}
            ${typeof deviceData.humidity !== 'undefined' ? createMetricElement('Humidity', deviceData.humidity.toFixed(1), '%', 'humidity', previousValues.humidity) : ''}
            ${typeof deviceData.battery !== 'undefined' ? createMetricElement('Battery', Math.round(deviceData.battery), '%', 'battery', previousValues.battery) : ''}
        ` : '';
        
        // Warning chip for desktop layout
        const warningChip = context.statusLabel && context.isDesktop ? 
            this.createWarningChip(context.status, context.statusLabel) : '';
        
        // For missing/stale devices without metrics in mobile/auto: simpler structure
        if (!context.hasMetrics && context.isStale && !context.isWeatherStation && !context.isDesktop) {
            return `
                <div class="${cardClass}" data-room="${escapeHtml(deviceName)}"${statusTooltip}>
                    <h2>${title}</h2>
                    ${compactMetrics}
                </div>
            `;
        }
        
        // For desktop: show placeholder metrics for stale devices without metrics
        const finalMetricsBlock = context.shouldShowPlaceholderMetrics 
            ? this.createPlaceholderMetrics()
            : metricsBlock;
        
        return `
            <div class="${cardClass}" data-room="${escapeHtml(deviceName)}"${statusTooltip}>
                <div class="card-header-row">
                    <h2>${title}</h2>
                    ${warningChip}
                    ${compactMetrics}
                </div>
                ${finalMetricsBlock}
                ${weatherFooter}
            </div>
        `;
    }
    
    // Update existing card DOM element based on new context
    updateCardElement(cardElement, deviceData, previousValues = {}, layoutMode = 'auto') {
        const context = this.buildRenderContext(deviceData, layoutMode);
        const roomName = cardElement.getAttribute('data-room');
        if (!roomName) return;
        
        // Update classes
        cardElement.classList.toggle('card-stale', context.isStale && !context.isWeatherStation);
        cardElement.classList.toggle('card-no-metrics', context.shouldAddNoMetricsClass);
        
        // Update tooltip
        if (context.statusLabel) {
            cardElement.setAttribute('title', context.statusLabel);
        } else {
            cardElement.removeAttribute('title');
        }
        
        // Update title if display name changed
        const titleEl = cardElement.querySelector('h2');
        const desiredTitle = deviceData.displayName || roomName;
        if (titleEl && titleEl.textContent !== desiredTitle) {
            titleEl.textContent = desiredTitle;
        }
        
        // Handle layout-specific updates
        if (context.isDesktop) {
            this.updateCardForDesktop(cardElement, context, deviceData);
        } else {
            this.updateCardForMobile(cardElement, context, deviceData);
        }
        
        // Update metric values if they exist
        this.updateMetricValues(cardElement, deviceData, previousValues);
    }
    
    // Update card for desktop layout
    updateCardForDesktop(cardElement, context, deviceData) {
        // Convert card-no-metrics to full layout with placeholder metrics
        // Check if card currently has card-no-metrics class OR if we need to show placeholder metrics
        const hasNoMetricsClass = cardElement.classList.contains('card-no-metrics');
        const needsPlaceholderMetrics = context.shouldShowPlaceholderMetrics && !context.hasMetrics;
        
        if (hasNoMetricsClass || needsPlaceholderMetrics) {
            cardElement.classList.remove('card-no-metrics');
            
            let headerRow = cardElement.querySelector('.card-header-row');
            const h2 = cardElement.querySelector('h2');
            
            // If h2 is a direct child (mobile layout), we need to create headerRow
            if (!headerRow && h2 && h2.parentNode === cardElement) {
                const compactMetrics = cardElement.querySelector('.metrics-compact');
                headerRow = document.createElement('div');
                headerRow.className = 'card-header-row';
                h2.parentNode.insertBefore(headerRow, h2);
                headerRow.appendChild(h2);
                if (compactMetrics && compactMetrics.parentNode === cardElement) {
                    headerRow.appendChild(compactMetrics);
                }
            } else if (headerRow && h2 && h2.parentNode !== headerRow) {
                // If headerRow exists but h2 is not in it, move h2 into headerRow
                headerRow.insertBefore(h2, headerRow.firstChild);
            }
            
            // Add placeholder metrics if they don't exist
            if (!cardElement.querySelectorAll('.metric').length && headerRow) {
                headerRow.insertAdjacentHTML('afterend', this.createPlaceholderMetrics());
            }
        }
        
        // Ensure warning chip exists in header
        const headerRow = cardElement.querySelector('.card-header-row');
        if (headerRow && context.statusLabel) {
            const existingChip = headerRow.querySelector('.card-header-warning-chip');
            if (!existingChip) {
                const chipHTML = this.createWarningChip(context.status, context.statusLabel);
                const titleEl = headerRow.querySelector('h2');
                if (titleEl) {
                    titleEl.insertAdjacentHTML('afterend', chipHTML);
                }
            }
        }
    }
    
    // Update card for mobile layout
    updateCardForMobile(cardElement, context, deviceData) {
        const headerRow = cardElement.querySelector('.card-header-row');
        
        // Remove warning chip from header
        if (headerRow) {
            const warningChip = headerRow.querySelector('.card-header-warning-chip');
            if (warningChip) {
                warningChip.remove();
            }
        }
        
        // If card has placeholder metrics (from desktop), convert to mobile compact layout
        const hasPlaceholderMetrics = cardElement.querySelectorAll('.metric').length === 3 && 
            cardElement.querySelector('.metric .metric-value')?.textContent?.includes('-');
        
        if (hasPlaceholderMetrics && !context.shouldAddNoMetricsClass) {
            // Remove placeholder metrics
            const metrics = cardElement.querySelectorAll('.metric');
            metrics.forEach(m => m.remove());
            
            // Add card-no-metrics class
            cardElement.classList.add('card-no-metrics');
            
            // Ensure compact metrics exist with status chip
            let compactContainer = cardElement.querySelector('.metrics-compact');
            if (!compactContainer) {
                const compactMetricsHTML = `
                    <div class="metrics-compact">
                        ${this.createStatusChip(context.status, context.statusLabel)}
                    </div>
                `;
                const h2 = cardElement.querySelector('h2');
                if (h2) {
                    h2.insertAdjacentHTML('afterend', compactMetricsHTML);
                }
            } else {
                // Ensure status chip is in compact metrics
                const statusChip = compactContainer.querySelector('.status-chip');
                if (!statusChip && context.statusLabel) {
                    compactContainer.insertAdjacentHTML('beforeend', this.createStatusChip(context.status, context.statusLabel));
                }
            }
            
            // Remove header row structure for mobile (h2 should be direct child)
            if (headerRow) {
                const h2 = headerRow.querySelector('h2');
                const compactMetrics = headerRow.querySelector('.metrics-compact');
                if (h2) {
                    headerRow.parentNode.insertBefore(h2, headerRow);
                    if (compactMetrics) {
                        h2.insertAdjacentElement('afterend', compactMetrics);
                    }
                    headerRow.remove();
                }
            }
        } else if (context.shouldAddNoMetricsClass) {
            // Card already has card-no-metrics, just ensure compact metrics with status chip exists
            let compactContainer = cardElement.querySelector('.metrics-compact');
            if (!compactContainer && context.statusLabel) {
                const compactMetricsHTML = `
                    <div class="metrics-compact">
                        ${this.createStatusChip(context.status, context.statusLabel)}
                    </div>
                `;
                const h2 = cardElement.querySelector('h2');
                if (h2) {
                    h2.insertAdjacentHTML('afterend', compactMetricsHTML);
                }
            } else if (compactContainer && context.statusLabel) {
                const statusChip = compactContainer.querySelector('.status-chip');
                if (!statusChip) {
                    compactContainer.insertAdjacentHTML('beforeend', this.createStatusChip(context.status, context.statusLabel));
                }
            }
        }
    }
    
    // Update metric values in existing card
    updateMetricValues(cardElement, deviceData, previousValues) {
        // Update temperature
        if (typeof deviceData.temperature !== 'undefined') {
            const tempMetric = cardElement.querySelector('.temperature');
            if (tempMetric) {
                const valueSpan = tempMetric.querySelector('.metric-value');
                const progressBar = tempMetric.querySelector('.progress');
                const newTemp = deviceData.temperature.toFixed(1);
                
                if (valueSpan) {
                    const currentText = valueSpan.childNodes[0]?.textContent?.trim();
                    if (currentText !== `${newTemp}°C`) {
                        if (previousValues.temperature !== null && Math.abs(deviceData.temperature - previousValues.temperature) >= 0.1) {
                            valueSpan.classList.add('changed');
                            setTimeout(() => valueSpan.classList.remove('changed'), 1000);
                        }
                        if (valueSpan.childNodes[0]) {
                            valueSpan.childNodes[0].textContent = `${newTemp}°C`;
                        }
                    }
                }
                
                if (progressBar) {
                    const newWidth = normalizeTemp(deviceData.temperature);
                    progressBar.style.width = `${newWidth}%`;
                }
            }
        }
        
        // Update humidity
        if (typeof deviceData.humidity !== 'undefined') {
            const humidMetric = cardElement.querySelector('.humidity');
            if (humidMetric) {
                const valueSpan = humidMetric.querySelector('.metric-value');
                const progressBar = humidMetric.querySelector('.progress');
                const newHumid = deviceData.humidity.toFixed(1);
                
                if (valueSpan) {
                    const currentText = valueSpan.childNodes[0]?.textContent?.trim();
                    if (currentText !== `${newHumid}%`) {
                        if (previousValues.humidity !== null && Math.abs(deviceData.humidity - previousValues.humidity) >= 0.1) {
                            valueSpan.classList.add('changed');
                            setTimeout(() => valueSpan.classList.remove('changed'), 1000);
                        }
                        if (valueSpan.childNodes[0]) {
                            valueSpan.childNodes[0].textContent = `${newHumid}%`;
                        }
                    }
                }
                
                if (progressBar) {
                    progressBar.style.width = `${Math.max(0, deviceData.humidity)}%`;
                }
            }
        }
        
        // Update battery
        if (typeof deviceData.battery !== 'undefined') {
            const battMetric = cardElement.querySelector('.battery');
            if (battMetric) {
                const valueSpan = battMetric.querySelector('.metric-value');
                const progressBar = battMetric.querySelector('.progress');
                const newBatt = Math.round(deviceData.battery);
                
                if (valueSpan) {
                    const currentText = valueSpan.childNodes[0]?.textContent?.trim();
                    if (currentText !== `${newBatt}%`) {
                        if (previousValues.battery !== null && Math.abs(deviceData.battery - previousValues.battery) >= 0.1) {
                            valueSpan.classList.add('changed');
                            setTimeout(() => valueSpan.classList.remove('changed'), 1000);
                        }
                        if (valueSpan.childNodes[0]) {
                            valueSpan.childNodes[0].textContent = `${newBatt}%`;
                        }
                    }
                }
                
                if (progressBar) {
                    progressBar.style.width = `${Math.max(0, deviceData.battery)}%`;
                }
            }
        }
        
        // Update compact metrics
        const compactContainer = cardElement.querySelector('.metrics-compact');
        if (compactContainer) {
            const layoutMode = isDesktopLayoutMode() ? 'desktop' : 'mobile';
            const context = this.buildRenderContext(deviceData, layoutMode);
            const excludeStatusChip = context.isDesktop && context.shouldShowPlaceholderMetrics;
            const compactMetrics = createCompactMetrics(deviceData, excludeStatusChip);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = compactMetrics;
            const newCompactContainer = tempDiv.firstElementChild;
            if (newCompactContainer) {
                compactContainer.replaceWith(newCompactContainer);
            }
        }
    }
}

// Create global instance
const cardRenderer = new CardRenderer();



/* ============================================
   Source: static/js/drag-drop.js
   ============================================ */

// Drag and drop functionality

let draggedElement = null;
let isDragging = false;
let placeholder = null;

function handleDragStart(e) {
    draggedElement = e.target.closest('.device-group');
    if (draggedElement) {
        draggedElement.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', draggedElement.innerHTML);
    }
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.target.closest('.device-group');
    if (target && target !== draggedElement) {
        const container = document.getElementById('sensors-container');
        const allGroups = [...container.querySelectorAll('.device-group')];
        const draggedIndex = allGroups.indexOf(draggedElement);
        const targetIndex = allGroups.indexOf(target);
        
        if (draggedIndex < targetIndex) {
            target.parentNode.insertBefore(draggedElement, target.nextSibling);
        } else {
            target.parentNode.insertBefore(draggedElement, target);
        }
    }
    
    return false;
}

// Helper function to save group order
function saveCurrentGroupOrder() {
    const container = document.getElementById('sensors-container');
    if (!container) return;
    const allGroups = [...container.querySelectorAll('.device-group')];
    const newOrder = allGroups.map(group => group.getAttribute('data-group'));
    if (window.saveGroupOrder) {
        window.saveGroupOrder(newOrder);
    }
}

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        saveCurrentGroupOrder();
    }
    draggedElement = null;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    return false;
}

// Touch event handlers for mobile
function handleTouchStart(e) {
    const dragHandle = e.target.closest('.group-drag-handle');
    if (!dragHandle) return;
    
    draggedElement = e.target.closest('.device-group');
    if (!draggedElement) return;
    
    isDragging = true;
    
    // Add visual feedback
    draggedElement.classList.add('dragging');
    
    // Create placeholder
    placeholder = document.createElement('div');
    placeholder.className = 'group-placeholder';
    placeholder.style.height = draggedElement.offsetHeight + 'px';
    
    e.preventDefault();
}

function handleTouchMove(e) {
    if (!isDragging || !draggedElement) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    const currentY = touch.clientY;
    const currentX = touch.clientX;
    
    // Move the element
    draggedElement.style.position = 'fixed';
    draggedElement.style.zIndex = '1000';
    draggedElement.style.left = '10px';
    draggedElement.style.right = '10px';
    draggedElement.style.width = 'calc(100% - 20px)';
    draggedElement.style.top = (currentY - 30) + 'px';
    draggedElement.style.pointerEvents = 'none';
    
    // Insert placeholder if not already in DOM
    if (!placeholder.parentNode) {
        draggedElement.parentNode.insertBefore(placeholder, draggedElement);
    }
    
    // Find the element we're hovering over
    const elementBelow = document.elementFromPoint(currentX, currentY);
    const groupBelow = elementBelow?.closest('.device-group:not(.dragging)');
    
    if (groupBelow && groupBelow !== draggedElement) {
        const container = document.getElementById('sensors-container');
        const allGroups = [...container.querySelectorAll('.device-group:not(.dragging)')];
        const belowIndex = allGroups.indexOf(groupBelow);
        
        if (belowIndex !== -1) {
            const rect = groupBelow.getBoundingClientRect();
            const middle = rect.top + rect.height / 2;
            
            if (currentY < middle) {
                groupBelow.parentNode.insertBefore(placeholder, groupBelow);
            } else {
                groupBelow.parentNode.insertBefore(placeholder, groupBelow.nextSibling);
            }
        }
    }
}

function handleTouchEnd(e) {
    if (!isDragging || !draggedElement) return;
    
    e.preventDefault();
    
    // Reset styles
    draggedElement.style.position = '';
    draggedElement.style.zIndex = '';
    draggedElement.style.left = '';
    draggedElement.style.right = '';
    draggedElement.style.width = '';
    draggedElement.style.top = '';
    draggedElement.style.pointerEvents = '';
    draggedElement.classList.remove('dragging');
    
    // Replace placeholder with dragged element
    if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(draggedElement, placeholder);
        placeholder.remove();
    }
    
    // Save the new order
    saveCurrentGroupOrder();
    
    // Reset state
    isDragging = false;
    draggedElement = null;
    placeholder = null;
}

function setupDragAndDrop(container) {
    // Event delegation for drag and drop (desktop)
    container.addEventListener('dragstart', handleDragStart, false);
    container.addEventListener('dragover', handleDragOver, false);
    container.addEventListener('drop', handleDrop, false);
    container.addEventListener('dragend', handleDragEnd, false);
    
    // Touch events for mobile drag and drop
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
}



/* ============================================
   Source: static/js/groups.js
   ============================================ */

// Group management and state

const expandedGroups = new Set();
let groupOrder = [];

// Load persisted state from localStorage
function loadPersistedState() {
    // Load expanded groups
    const savedExpanded = localStorage.getItem('expandedGroups');
    if (savedExpanded) {
        try {
            const expanded = JSON.parse(savedExpanded);
            expanded.forEach(group => expandedGroups.add(group));
        } catch (e) {
            console.error('Error loading expanded groups:', e);
        }
    }
    
    // Load group order
    const savedOrder = localStorage.getItem('groupOrder');
    if (savedOrder) {
        try {
            groupOrder = JSON.parse(savedOrder);
        } catch (e) {
            console.error('Error loading group order:', e);
            groupOrder = [];
        }
    }
}

// Save expanded state to localStorage
function saveExpandedState() {
    localStorage.setItem('expandedGroups', JSON.stringify([...expandedGroups]));
}

// Save group order to localStorage
function saveGroupOrder(newOrder) {
    if (newOrder) {
        groupOrder = newOrder;
    }
    localStorage.setItem('groupOrder', JSON.stringify(groupOrder));
}

function toggleGroup(groupElement) {
    const groupName = groupElement.getAttribute('data-group');
    if (!groupName) return;
    
    if (expandedGroups.has(groupName)) {
        expandedGroups.delete(groupName);
    } else {
        expandedGroups.add(groupName);
    }
    
    const content = groupElement.querySelector('.group-content');
    const toggle = groupElement.querySelector('.group-toggle');
    const isExpanded = expandedGroups.has(groupName);
    
    content.style.display = isExpanded ? 'grid' : 'none';
    toggle.setAttribute('aria-expanded', isExpanded);
    groupElement.classList.toggle('collapsed', !isExpanded);
    
    // Persist the expanded state
    saveExpandedState();
}

function isGroupExpanded(groupName) {
    return expandedGroups.has(groupName);
}

function getGroupOrder() {
    return groupOrder;
}

function setGroupOrder(order) {
    groupOrder = order;
    saveGroupOrder();
}

// Make saveGroupOrder available globally for drag-drop.js
window.saveGroupOrder = saveGroupOrder;



/* ============================================
   Source: static/js/app.js
   ============================================ */

// Main application orchestration

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js')
            .then((registration) => {
                console.log('ServiceWorker registered:', registration.scope);
            })
            .catch((error) => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}

// Format timestamp
function formatLastUpdate() {
    const now = new Date();
    return now.toLocaleTimeString();
}

// Update timestamp display
function updateTimestamp() {
    const timestampEl = document.querySelector('.last-update .timestamp');
    if (timestampEl) {
        timestampEl.textContent = `Last updated: ${formatLastUpdate()}`;
    }
}

// Theme handling
function toggleTheme() {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

// Layout change callback - update cards when layout changes
window.onLayoutChange = function() {
    updateCardsForLayout();
};

function updateCardsForLayout() {
    const layout = document.documentElement.getAttribute('data-layout') || 'auto';
    const allCards = document.querySelectorAll('.card');
    
    allCards.forEach(card => {
        const roomName = card.getAttribute('data-room');
        if (!roomName) return;
        
        // Try to find device data from existing card structure
        const isStale = card.classList.contains('card-stale');
        const isWeatherStation = card.classList.contains('weather-station');
        
        if (!isStale || isWeatherStation) return;
        
        // Determine status from title attribute
        const titleAttr = card.getAttribute('title');
        const status = titleAttr === 'Missing' ? 'never_seen' : 'stale';
        
        // Reconstruct minimal device data for update
        const deviceData = {
            status: status,
            isWeatherStation: isWeatherStation,
            displayName: card.querySelector('h2')?.textContent || roomName
        };
        
        // Use CardRenderer to update the card
        cardRenderer.updateCardElement(card, deviceData, {}, layout);
    });
}

// Progress bar animation
function startProgressBar() {
    const progressBar = document.getElementById('refreshProgress');
    if (!progressBar) return;
    progressBar.style.transition = 'none';
    progressBar.style.transform = 'scaleX(1)';
    progressBar.offsetHeight; // Force reflow
    progressBar.style.transition = `transform ${REFRESH_INTERVAL/1000}s linear`;
    progressBar.style.transform = 'scaleX(0)';
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
        
        // Parse metrics using metrics-parser module
        const rooms = parseMetrics(text);
        
        // Update connection status
        markFetchSuccess();
        
        // Update timestamp
        updateTimestamp();
        
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
        
        // Group rooms by their group property
        const groupedRooms = {};
        Object.entries(rooms).forEach(([room, data]) => {
            const groupName = data.group;
            if (!groupedRooms[groupName]) {
                groupedRooms[groupName] = [];
            }
            groupedRooms[groupName].push({ name: room, displayName: data.displayName || room, data });
        });
        
        // Sort rooms alphabetically within each group
        Object.keys(groupedRooms).forEach(groupName => {
            groupedRooms[groupName].sort((a, b) => {
                const aName = a.displayName || a.name;
                const bName = b.displayName || b.name;
                return aName.localeCompare(bName);
            });
        });
        
        // Get sorted group names
        let sortedGroupNames = Object.keys(groupedRooms).sort();
        
        // Apply saved order if it exists
        const savedOrder = getGroupOrder();
        if (savedOrder.length > 0) {
            // Filter out groups that no longer exist and add new groups at the end
            const existingGroups = sortedGroupNames.filter(g => savedOrder.includes(g));
            const newGroups = sortedGroupNames.filter(g => !savedOrder.includes(g));
            
            sortedGroupNames = [
                ...savedOrder.filter(g => existingGroups.includes(g)),
                ...newGroups
            ];
            
            // Update groupOrder to include new groups
            if (newGroups.length > 0) {
                setGroupOrder(sortedGroupNames);
            }
        } else {
            // First time - save the alphabetical order
            setGroupOrder(sortedGroupNames);
        }
        
        // Initialize all groups as expanded on first load if no saved state
        if (expandedGroups.size === 0 && !localStorage.getItem('expandedGroups')) {
            sortedGroupNames.forEach(group => expandedGroups.add(group));
            saveExpandedState();
        }
        
        // Get current layout mode
        const currentLayout = document.documentElement.getAttribute('data-layout') || 'auto';
        
        // Helper function to calculate group averages
        function calculateGroupAverages(roomsInGroup) {
            let tempSum = 0, tempCount = 0;
            let humidSum = 0, humidCount = 0;
            
            roomsInGroup.forEach(({ data }) => {
                if (typeof data.temperature !== 'undefined') {
                    tempSum += data.temperature;
                    tempCount++;
                }
                if (typeof data.humidity !== 'undefined') {
                    humidSum += data.humidity;
                    humidCount++;
                }
            });
            
            return {
                avgTemp: tempCount > 0 ? (tempSum / tempCount).toFixed(1) : null,
                avgHumid: humidCount > 0 ? (humidSum / humidCount).toFixed(1) : null
            };
        }
        
        // Helper function to check if group has stale/missing devices
        function hasStaleDevice(roomsInGroup) {
            return roomsInGroup.some(({ data }) => {
                const status = data.status || 'active';
                return (status === 'stale' || status === 'never_seen') && !data.isWeatherStation;
            });
        }
        
        // Helper function to check if group has low battery devices
        function hasLowBatteryDevice(roomsInGroup) {
            return roomsInGroup.some(({ data }) => {
                const status = data.status || 'active';
                const isStale = status === 'stale' || status === 'never_seen';
                const battery = data.battery;
                // Low battery warning only for active devices (not stale/missing)
                return !isStale && !data.isWeatherStation && 
                       typeof battery !== 'undefined' && 
                       battery <= BATTERY_LOW_THRESHOLD;
            });
        }
        
        // Build the HTML for all groups
        const container = document.getElementById('sensors-container');
        const containerHTML = sortedGroupNames.map(groupName => {
            const isExpanded = isGroupExpanded(groupName);
            const roomsInGroup = groupedRooms[groupName];
            
            // Calculate group averages
            const { avgTemp, avgHumid } = calculateGroupAverages(roomsInGroup);
            
            // Check if any device in group is stale/missing or has low battery
            const hasStale = hasStaleDevice(roomsInGroup);
            const hasLowBattery = hasLowBatteryDevice(roomsInGroup);
            
            const cardsHTML = roomsInGroup.map(({ name, displayName, data }) => {
                const prev = previousValues[name] || {};
                // Use CardRenderer to render card
                return cardRenderer.renderCardHTML(name, { ...data, displayName }, prev, currentLayout);
            }).join('');
            
            return `
                <div class="device-group ${isExpanded ? '' : 'collapsed'}" data-group="${escapeHtml(groupName)}" draggable="true">
                    <button class="group-header" aria-expanded="${isExpanded}">
                        <span class="group-drag-handle" aria-label="Drag to reorder" title="Drag to reorder">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d="M9 3h2v2H9V3zm0 4h2v2H9V7zm0 4h2v2H9v-2zm0 4h2v2H9v-2zm0 4h2v2H9v-2zm4-16h2v2h-2V3zm0 4h2v2h-2V7zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z"/>
                            </svg>
                        </span>
                        <span class="group-toggle" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                            </svg>
                        </span>
                        <span class="group-name">${escapeHtml(groupName)} ${groupName !== 'Outdoor Weather' ? `<span class="group-count">[${roomsInGroup.length}]</span>` : ''}</span>
                        <div class="group-stats">
                            ${avgTemp !== null ? `<span class="group-stat" title="Average Temperature"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-1v1h1v.5c-.31-.18-.65-.3-1-.34V5z"/></svg>${avgTemp}°C</span>` : ''}
                            ${avgHumid !== null ? `<span class="group-stat" title="Average Humidity"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69zM12 4.8L8.05 8.75a6 6 0 1 0 7.9 0L12 4.8z"/></svg>${avgHumid}%</span>` : ''}
                            ${(hasStale || hasLowBattery) ? `<span class="group-stat group-stat-warning" title="Missing, stale or low battery devices"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg></span>` : ''}
                        </div>
                    </button>
                    <div class="group-content" style="display: ${isExpanded ? 'grid' : 'none'}">
                        ${cardsHTML}
                    </div>
                </div>
            `;
        }).join('');
        
        // Update DOM efficiently - only update if structure changed
        const existingGroups = [...container.querySelectorAll('.device-group')];
        const existingGroupNames = existingGroups.map(g => g.getAttribute('data-group'));
        const hasStructureChanged = 
            existingGroupNames.length !== sortedGroupNames.length ||
            !sortedGroupNames.every((name, i) => name === existingGroupNames[i]);
        
        if (hasStructureChanged) {
            // Structure changed - rebuild entire container
            container.innerHTML = containerHTML;
        } else {
            // Structure unchanged - update values only
            sortedGroupNames.forEach((groupName, index) => {
                const groupElement = existingGroups[index];
                const roomsInGroup = groupedRooms[groupName];
                
                // Calculate group averages
                const { avgTemp, avgHumid } = calculateGroupAverages(roomsInGroup);
                
                // Check if any device in group is stale/missing or has low battery
                const hasStale = hasStaleDevice(roomsInGroup);
                const hasLowBattery = hasLowBatteryDevice(roomsInGroup);
                
                // Update group stats
                const statsContainer = groupElement.querySelector('.group-stats');
                if (statsContainer) {
                    const tempStat = statsContainer.querySelector('.group-stat[title="Average Temperature"]');
                    const humidStat = statsContainer.querySelector('.group-stat[title="Average Humidity"]');
                    const warningStat = statsContainer.querySelector('.group-stat-warning');
                    
                    if (tempStat && avgTemp !== null) {
                        const tempText = tempStat.childNodes[tempStat.childNodes.length - 1];
                        if (tempText && tempText.textContent !== `${avgTemp}°C`) {
                            tempText.textContent = `${avgTemp}°C`;
                        }
                    }
                    
                    if (humidStat && avgHumid !== null) {
                        const humidText = humidStat.childNodes[humidStat.childNodes.length - 1];
                        if (humidText && humidText.textContent !== `${avgHumid}%`) {
                            humidText.textContent = `${avgHumid}%`;
                        }
                    }
                    
                    // Update warning chip
                    if ((hasStale || hasLowBattery) && !warningStat) {
                        const warningChip = document.createElement('span');
                        warningChip.className = 'group-stat group-stat-warning';
                        warningChip.title = 'Missing, stale or low battery devices';
                        warningChip.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
                        statsContainer.appendChild(warningChip);
                    } else if (!(hasStale || hasLowBattery) && warningStat) {
                        warningStat.remove();
                    }
                }
                
                // Update device count
                const countElement = groupElement.querySelector('.group-count');
                if (countElement) {
                    const newCount = `[${roomsInGroup.length}]`;
                    if (countElement.textContent !== newCount) {
                        countElement.textContent = newCount;
                    }
                }
                
                // Update cards within the group using CardRenderer
                roomsInGroup.forEach(({ name, displayName, data }) => {
                    const card = groupElement.querySelector(`.card[data-room="${CSS.escape(name)}"]`);
                    if (!card) return;
                    
                    const prev = previousValues[name] || {};
                    // Use CardRenderer to update the card
                    cardRenderer.updateCardElement(card, { ...data, displayName }, prev, currentLayout);
                });
            });
        }
        
        startProgressBar();
        container.classList.remove('error');
        
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

// Store the interval ID so we can reset it
let refreshIntervalId = null;

function resetRefreshInterval() {
    // Clear existing interval
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
    }
    // Start new interval
    refreshIntervalId = setInterval(fetchMetrics, REFRESH_INTERVAL);
}

async function manualRefresh() {
    const refreshButton = document.querySelector('.refresh-button');
    if (refreshButton) {
        refreshButton.classList.add('spinning');
    }
    await fetchMetrics();
    if (refreshButton) {
        refreshButton.classList.remove('spinning');
    }
    
    // Reset the interval timer so next auto-refresh is in full 30 seconds
    resetRefreshInterval();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set initial theme
    document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');
    
    // Set initial layout (auto by default)
    const savedLayout = localStorage.getItem('layout') || 'auto';
    document.documentElement.setAttribute('data-layout', savedLayout);
    updateLayoutIcon();
    
    // Load persisted state
    loadPersistedState();
    
    // Initial timestamp
    updateTimestamp();
    
    // Event delegation for group header clicks
    const container = document.getElementById('sensors-container');
    container.addEventListener('click', (e) => {
        // Ignore clicks on drag handle
        if (e.target.closest('.group-drag-handle')) {
            return;
        }
        
        const groupHeader = e.target.closest('.group-header');
        if (groupHeader) {
            const groupElement = groupHeader.closest('.device-group');
            if (groupElement) {
                toggleGroup(groupElement);
            }
        }
    });
    
    // Setup drag and drop
    setupDragAndDrop(container);
    
    // Initial fetch and periodic updates
    fetchMetrics();
    resetRefreshInterval();
});




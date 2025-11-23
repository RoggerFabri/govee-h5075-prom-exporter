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

// Configuration - Load from server or use defaults
const CONFIG = window.DASHBOARD_CONFIG || {};
const REFRESH_INTERVAL = 30000;
const MAX_TEMPERATURE = CONFIG.TEMPERATURE_MAX || 40;
const MIN_TEMPERATURE = CONFIG.TEMPERATURE_MIN || -20;
const TEMPERATURE_LOW_THRESHOLD = CONFIG.TEMPERATURE_LOW_THRESHOLD !== undefined ? CONFIG.TEMPERATURE_LOW_THRESHOLD : 0;
const TEMPERATURE_HIGH_THRESHOLD = CONFIG.TEMPERATURE_HIGH_THRESHOLD || 35;
const HUMIDITY_LOW_THRESHOLD = CONFIG.HUMIDITY_LOW_THRESHOLD || 30;
const HUMIDITY_HIGH_THRESHOLD = CONFIG.HUMIDITY_HIGH_THRESHOLD || 70;
const BATTERY_LOW_THRESHOLD = CONFIG.BATTERY_LOW_THRESHOLD || 5;
const CONNECTION_TIMEOUT = 5000;

// Connection state tracking
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

function createMetricElement(label, value, unit, type, previousValue = null) {
    const percentage = type === 'temperature' ? normalizeTemp(value) : Math.max(0, value);
    const showBatteryWarning = type === 'battery' && value <= BATTERY_LOW_THRESHOLD;
    const showFreezingWarning = type === 'temperature' && value < TEMPERATURE_LOW_THRESHOLD;
    const showHotWarning = type === 'temperature' && value > TEMPERATURE_HIGH_THRESHOLD;
    const showHighHumidityWarning = type === 'humidity' && value > HUMIDITY_HIGH_THRESHOLD;
    const showLowHumidityWarning = type === 'humidity' && value < HUMIDITY_LOW_THRESHOLD;
    const showHumidityWarning = showHighHumidityWarning || showLowHumidityWarning;
    const showTemperatureWarning = showFreezingWarning || showHotWarning;
    const showWarning = showBatteryWarning || showTemperatureWarning || showHumidityWarning;
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

// Store expanded state of groups and group order
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
function saveGroupOrder() {
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

// Drag and drop functionality
let draggedElement = null;
let touchStartY = 0;
let touchStartX = 0;
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

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        
        // Save the new order
        const container = document.getElementById('sensors-container');
        const allGroups = [...container.querySelectorAll('.device-group')];
        groupOrder = allGroups.map(group => group.getAttribute('data-group'));
        saveGroupOrder();
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
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    
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
        const placeholderIndex = allGroups.indexOf(placeholder);
        
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
    const container = document.getElementById('sensors-container');
    const allGroups = [...container.querySelectorAll('.device-group')];
    groupOrder = allGroups.map(group => group.getAttribute('data-group'));
    saveGroupOrder();
    
    // Reset state
    isDragging = false;
    draggedElement = null;
    placeholder = null;
}

function createCompactMetrics(data) {
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
    
    return `<div class="metrics-compact">${metrics.join('')}</div>`;
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
        const deviceGroups = CONFIG.DEVICE_GROUPS || {};

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
                rooms[name] = {
                    group: deviceGroups[name] || 'Ungrouped'
                };
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

        // Group rooms by their group property
        const groupedRooms = {};
        Object.entries(rooms).forEach(([room, data]) => {
            const groupName = data.group;
            if (!groupedRooms[groupName]) {
                groupedRooms[groupName] = [];
            }
            groupedRooms[groupName].push({ name: room, data });
        });

        // Sort rooms alphabetically within each group
        Object.keys(groupedRooms).forEach(groupName => {
            groupedRooms[groupName].sort((a, b) => a.name.localeCompare(b.name));
        });

        // Get sorted group names
        let sortedGroupNames = Object.keys(groupedRooms).sort();
        
        // Apply saved order if it exists
        if (groupOrder.length > 0) {
            // Filter out groups that no longer exist and add new groups at the end
            const existingGroups = sortedGroupNames.filter(g => groupOrder.includes(g));
            const newGroups = sortedGroupNames.filter(g => !groupOrder.includes(g));
            
            sortedGroupNames = [
                ...groupOrder.filter(g => existingGroups.includes(g)),
                ...newGroups
            ];
            
            // Update groupOrder to include new groups
            if (newGroups.length > 0) {
                groupOrder = sortedGroupNames;
                saveGroupOrder();
            }
        } else {
            // First time - save the alphabetical order
            groupOrder = sortedGroupNames;
            saveGroupOrder();
        }

        // Initialize all groups as expanded on first load if no saved state
        if (expandedGroups.size === 0 && !localStorage.getItem('expandedGroups')) {
            sortedGroupNames.forEach(group => expandedGroups.add(group));
            saveExpandedState();
        }

        // Escape HTML to prevent XSS
        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };

        // Build the HTML for all groups
        const container = document.getElementById('sensors-container');
        const containerHTML = sortedGroupNames.map(groupName => {
            const isExpanded = expandedGroups.has(groupName);
            const roomsInGroup = groupedRooms[groupName];
            
            // Calculate group averages
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
            
            const avgTemp = tempCount > 0 ? (tempSum / tempCount).toFixed(1) : null;
            const avgHumid = humidCount > 0 ? (humidSum / humidCount).toFixed(1) : null;
            
            const cardsHTML = roomsInGroup.map(({ name, data }) => {
                const prev = previousValues[name] || {};
                
                // Create compact metrics for mobile
                const compactMetrics = createCompactMetrics(data);
                
                return `
                    <div class="card" data-room="${escapeHtml(name)}">
                        <h2>${escapeHtml(name)}</h2>
                        ${compactMetrics}
                        ${typeof data.temperature !== 'undefined' ? createMetricElement('Temperature', data.temperature.toFixed(1), '°C', 'temperature', prev.temperature) : ''}
                        ${typeof data.humidity !== 'undefined' ? createMetricElement('Humidity', data.humidity.toFixed(1), '%', 'humidity', prev.humidity) : ''}
                        ${typeof data.battery !== 'undefined' ? createMetricElement('Battery', Math.round(data.battery), '%', 'battery', prev.battery) : ''}
                    </div>
                `;
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
                        <span class="group-name">${escapeHtml(groupName)}</span>
                        <div class="group-stats">
                            ${avgTemp !== null ? `<span class="group-stat" title="Average Temperature"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-1v1h1v.5c-.31-.18-.65-.3-1-.34V5z"/></svg>${avgTemp}°C</span>` : ''}
                            ${avgHumid !== null ? `<span class="group-stat" title="Average Humidity"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69zM12 4.8L8.05 8.75a6 6 0 1 0 7.9 0L12 4.8z"/></svg>${avgHumid}%</span>` : ''}
                        </div>
                        <span class="group-count">${roomsInGroup.length} device${roomsInGroup.length !== 1 ? 's' : ''}</span>
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
                
                const avgTemp = tempCount > 0 ? (tempSum / tempCount).toFixed(1) : null;
                const avgHumid = humidCount > 0 ? (humidSum / humidCount).toFixed(1) : null;
                
                // Update group stats
                const statsContainer = groupElement.querySelector('.group-stats');
                if (statsContainer) {
                    const tempStat = statsContainer.querySelector('.group-stat[title="Average Temperature"]');
                    const humidStat = statsContainer.querySelector('.group-stat[title="Average Humidity"]');
                    
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
                }
                
                // Update device count
                const countElement = groupElement.querySelector('.group-count');
                if (countElement) {
                    const newCount = `${roomsInGroup.length} device${roomsInGroup.length !== 1 ? 's' : ''}`;
                    if (countElement.textContent !== newCount) {
                        countElement.textContent = newCount;
                    }
                }
                
                // Update cards within the group
                roomsInGroup.forEach(({ name, data }) => {
                    const card = groupElement.querySelector(`.card[data-room="${CSS.escape(name)}"]`);
                    if (!card) return;
                    
                    const prev = previousValues[name] || {};
                    
                    // Update compact metrics (mobile view)
                    const compactContainer = card.querySelector('.metrics-compact');
                    if (compactContainer) {
                        const compactMetrics = createCompactMetrics(data);
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = compactMetrics;
                        const newCompactContainer = tempDiv.firstElementChild;
                        if (newCompactContainer) {
                            compactContainer.replaceWith(newCompactContainer);
                        }
                    }
                    
                    // Update temperature
                    if (typeof data.temperature !== 'undefined') {
                        const tempMetric = card.querySelector('.temperature');
                        if (tempMetric) {
                            const valueSpan = tempMetric.querySelector('.metric-value');
                            const progressBar = tempMetric.querySelector('.progress');
                            const newTemp = data.temperature.toFixed(1);
                            
                            if (valueSpan) {
                                const currentText = valueSpan.childNodes[0]?.textContent?.trim();
                                if (currentText !== `${newTemp}°C`) {
                                    // Check if value changed for animation
                                    if (prev.temperature !== null && Math.abs(data.temperature - prev.temperature) >= 0.1) {
                                        valueSpan.classList.add('changed');
                                        setTimeout(() => valueSpan.classList.remove('changed'), 1000);
                                    }
                                    
                                    // Update the text node (first child)
                                    if (valueSpan.childNodes[0]) {
                                        valueSpan.childNodes[0].textContent = `${newTemp}°C`;
                                    }
                                }
                            }
                            
                            if (progressBar) {
                                const newWidth = normalizeTemp(data.temperature);
                                progressBar.style.width = `${newWidth}%`;
                            }
                        }
                    }
                    
                    // Update humidity
                    if (typeof data.humidity !== 'undefined') {
                        const humidMetric = card.querySelector('.humidity');
                        if (humidMetric) {
                            const valueSpan = humidMetric.querySelector('.metric-value');
                            const progressBar = humidMetric.querySelector('.progress');
                            const newHumid = data.humidity.toFixed(1);
                            
                            if (valueSpan) {
                                const currentText = valueSpan.childNodes[0]?.textContent?.trim();
                                if (currentText !== `${newHumid}%`) {
                                    if (prev.humidity !== null && Math.abs(data.humidity - prev.humidity) >= 0.1) {
                                        valueSpan.classList.add('changed');
                                        setTimeout(() => valueSpan.classList.remove('changed'), 1000);
                                    }
                                    
                                    if (valueSpan.childNodes[0]) {
                                        valueSpan.childNodes[0].textContent = `${newHumid}%`;
                                    }
                                }
                            }
                            
                            if (progressBar) {
                                progressBar.style.width = `${Math.max(0, data.humidity)}%`;
                            }
                        }
                    }
                    
                    // Update battery
                    if (typeof data.battery !== 'undefined') {
                        const battMetric = card.querySelector('.battery');
                        if (battMetric) {
                            const valueSpan = battMetric.querySelector('.metric-value');
                            const progressBar = battMetric.querySelector('.progress');
                            const newBatt = Math.round(data.battery);
                            
                            if (valueSpan) {
                                const currentText = valueSpan.childNodes[0]?.textContent?.trim();
                                if (currentText !== `${newBatt}%`) {
                                    if (prev.battery !== null && Math.abs(data.battery - prev.battery) >= 0.1) {
                                        valueSpan.classList.add('changed');
                                        setTimeout(() => valueSpan.classList.remove('changed'), 1000);
                                    }
                                    
                                    if (valueSpan.childNodes[0]) {
                                        valueSpan.childNodes[0].textContent = `${newBatt}%`;
                                    }
                                }
                            }
                            
                            if (progressBar) {
                                progressBar.style.width = `${Math.max(0, data.battery)}%`;
                            }
                        }
                    }
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
    
    // Event delegation for drag and drop (desktop)
    container.addEventListener('dragstart', handleDragStart, false);
    container.addEventListener('dragover', handleDragOver, false);
    container.addEventListener('drop', handleDrop, false);
    container.addEventListener('dragend', handleDragEnd, false);
    
    // Touch events for mobile drag and drop
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Initial fetch and periodic updates
    fetchMetrics();
    setInterval(fetchMetrics, REFRESH_INTERVAL);
}); 
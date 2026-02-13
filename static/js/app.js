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


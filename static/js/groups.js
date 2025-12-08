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


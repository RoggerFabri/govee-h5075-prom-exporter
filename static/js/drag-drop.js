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


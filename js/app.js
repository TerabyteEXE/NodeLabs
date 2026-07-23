// --- State Management ---
let nodes = [];
let backdrops = [];
let connections = [];
let layers = [
  { id: 'layer_0', name: 'Infrastructure Layer', visible: true },
  { id: 'layer_1', name: 'Audio Signal Path', visible: true }
];

let selectedNodeId = null;
let selectedBackdropId = null;
let selectedConnId = null;

let connectingPort = null;
let dragNodeId = null;
let dragBackdrop = null;
let resizingBackdrop = null;
let resizingNode = null;

let currentTheme = 'dark';
let uiScale = 1;
let mobileMode = false;
let scale = 1, panX = 0, panY = 0;
let isPanning = false;
let snapToGrid = true;
const GRID_SIZE = 28;
const COLLISION_CHECK_RADIUS = 300;

let viewport, canvas, svgLayer, dragLine, searchInput, searchDropdown, layersListEl, projectNameInput;

// Performance optimization: RAF throttling for drag operations
let rafId = null;
let lastPointerPos = { x: 0, y: 0 };
let touchStartDist = 0;

// Gradient cache
const gradientCache = new Map();

function init() {
  viewport = document.getElementById('viewport');
  canvas = document.getElementById('canvas');
  svgLayer = document.getElementById('svg-layer');
  dragLine = document.getElementById('drag-line');
  searchInput = document.getElementById('node-search');
  searchDropdown = document.getElementById('search-dropdown');
  layersListEl = document.getElementById('layers-list');
  projectNameInput = document.getElementById('project-name');

  // Load saved settings
  const savedTheme = localStorage.getItem('nodelab-theme') || 'dark';
  const savedScale = localStorage.getItem('nodelab-ui-scale') || '1';
  setTheme(savedTheme);
  setUIScale(parseFloat(savedScale));

  applyTransform();
  renderLayers();
  setupSearch();
  setupPointerControls();
  
  addBackdrop('Audio Rack Group', 100, 100, 420, 260, '#9d4edd');
  
  const node1Id = 'node_init_1';
  const node2Id = 'node_init_2';

  createNodeWithId(node1Id, 'Network Switch', layers[0].id, 140, 150, '#00e5ff', 2, 2, 220, 120);
  createNodeWithId(node2Id, 'Audio Mixer', layers[1].id, 460, 150, '#9d4edd', 4, 4, 240, 180);
  
  createConnection(node1Id, 0, node2Id, 0);

  requestAnimationFrame(() => {
    updateConnections();
  });
}

// --- Theme & Settings ---
function setTheme(themeName) {
  currentTheme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('nodelab-theme', themeName);
  
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.theme === themeName) {
      btn.classList.add('active');
    }
  });
}

function setUIScale(scale) {
  uiScale = Math.max(0.7, Math.min(1.5, scale));
  document.documentElement.style.setProperty('--ui-scale', uiScale);
  localStorage.setItem('nodelab-ui-scale', uiScale.toString());
  document.getElementById('scale-value').textContent = Math.round(uiScale * 100);
  document.getElementById('ui-scale-slider').value = Math.round(uiScale * 100);
}

function updateUIScale(value) {
  setUIScale(value / 100);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-sidebar');
  sidebar.classList.toggle('collapsed');
  btn.textContent = sidebar.classList.contains('collapsed') ? '▶ Panel' : '◀ Panel';
}

function toggleMobileMode() {
  mobileMode = document.getElementById('setting-mobile').checked;
  if (mobileMode) {
    // Disable editing
    document.getElementById('btn-sidebar').disabled = true;
    document.querySelectorAll('.node-header, .backdrop-header').forEach(el => {
      el.style.cursor = 'grab';
      el.style.pointerEvents = 'none';
    });
    document.querySelectorAll('.node-resize, .backdrop-resize').forEach(el => {
      el.style.display = 'none';
    });
  } else {
    // Enable editing
    document.getElementById('btn-sidebar').disabled = false;
    document.querySelectorAll('.node-header, .backdrop-header').forEach(el => {
      el.style.cursor = 'move';
      el.style.pointerEvents = 'auto';
    });
    document.querySelectorAll('.node-resize, .backdrop-resize').forEach(el => {
      el.style.display = 'block';
    });
  }
}

function openSettings() {
  const modal = document.getElementById('settings-modal');
  modal.classList.add('active');
  document.getElementById('setting-grid').checked = snapToGrid;
  document.getElementById('setting-mobile').checked = mobileMode;
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('active');
}

window.addEventListener('click', (e) => {
  const modal = document.getElementById('settings-modal');
  if (e.target === modal) {
    closeSettings();
  }
});

function updateGridSetting() {
  snapToGrid = document.getElementById('setting-grid').checked;
}

// --- Smart Placement Algorithm ---
function findUnoccupiedPosition(preferredX, preferredY, width, height) {
  const occupied = new Set();
  nodes.forEach(n => occupied.add(`${Math.round(n.x / GRID_SIZE)},${Math.round(n.y / GRID_SIZE)}`);
  backdrops.forEach(bd => occupied.add(`${Math.round(bd.x / GRID_SIZE)},${Math.round(bd.y / GRID_SIZE)}`);
  
  let x = preferredX;
  let y = preferredY;
  
  if (snapToGrid) {
    x = Math.round(x / GRID_SIZE) * GRID_SIZE;
    y = Math.round(y / GRID_SIZE) * GRID_SIZE;
  }
  
  // Check if preferred position is free
  if (!isPositionOccupied(x, y, width, height, nodes, backdrops)) {
    return { x, y };
  }
  
  // Spiral search around preferred position
  const maxRadius = COLLISION_CHECK_RADIUS;
  for (let radius = GRID_SIZE; radius < maxRadius; radius += GRID_SIZE) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const testX = preferredX + Math.cos(angle) * radius;
      const testY = preferredY + Math.sin(angle) * radius;
      
      const finalX = snapToGrid ? Math.round(testX / GRID_SIZE) * GRID_SIZE : testX;
      const finalY = snapToGrid ? Math.round(testY / GRID_SIZE) * GRID_SIZE : testY;
      
      if (!isPositionOccupied(finalX, finalY, width, height, nodes, backdrops)) {
        return { x: finalX, y: finalY };
      }
    }
  }
  
  // Fallback to preferred position if no space found
  return { x, y };
}

function isPositionOccupied(x, y, w, h, nodesList, backdropList) {
  for (let node of nodesList) {
    if (rectsOverlap(x, y, w, h, node.x, node.y, node.w, node.h)) {
      return true;
    }
  }
  for (let backdrop of backdropList) {
    if (rectsOverlap(x, y, w, h, backdrop.x, backdrop.y, backdrop.w, backdrop.h)) {
      return true;
    }
  }
  return false;
}

function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

// --- Unified PointerEvents API ---
function setupPointerControls() {
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    let newScale = Math.min(Math.max(0.25, scale + delta), 2.5);
    const rect = viewport.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    
    panX = pointerX - (pointerX - panX) * (newScale / scale);
    panY = pointerY - (pointerY - panY) * (newScale / scale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  viewport.addEventListener('pointerdown', (e) => {
    if (e.target !== viewport && e.target !== canvas && !e.target.closest('.node, .port, .backdrop, .backdrop-header, .node-header, .backdrop-resize, .node-resize')) {
      return;
    }
    
    if (e.pointerType === 'touch') {
      const target = e.target.closest('.node, .port, .backdrop, .backdrop-header, .node-header, .backdrop-resize, .node-resize');
      if (target) return;
      isPanning = true;
      lastPointerPos = { x: e.clientX, y: e.clientY };
    } else if (e.pointerType === 'mouse') {
      if (e.button === 1 || (e.button === 0 && (e.target === viewport || e.target === canvas))) {
        isPanning = true;
        viewport.style.cursor = 'grabbing';
        deselectAll();
        lastPointerPos = { x: e.clientX, y: e.clientY };
      }
    } else if (e.pointerType === 'pen') {
      const target = e.target.closest('.node, .port, .backdrop');
      if (!target) {
        isPanning = true;
        lastPointerPos = { x: e.clientX, y: e.clientY };
      }
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        handlePointerMove(e);
        rafId = null;
      });
    }
  });

  viewport.addEventListener('pointerup', () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    
    isPanning = false;
    viewport.style.cursor = 'grab';
    
    if (dragNodeId && snapToGrid) {
      const node = nodes.find(n => n.id === dragNodeId);
      if (node) {
        node.x = Math.round(node.x / GRID_SIZE) * GRID_SIZE;
        node.y = Math.round(node.y / GRID_SIZE) * GRID_SIZE;
        updateNodePositionDOM(node);
        updateConnections();
      }
    }
    dragNodeId = null;
    dragBackdrop = null;
    resizingBackdrop = null;
    resizingNode = null;
  });

  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && touchStartDist > 0) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const delta = (distance - touchStartDist) * 0.005;
      let newScale = Math.min(Math.max(0.25, scale + delta), 2.5);
      
      const rect = viewport.getBoundingClientRect();
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      
      panX = centerX - (centerX - panX) * (newScale / scale);
      panY = centerY - (centerY - panY) * (newScale / scale);
      scale = newScale;
      applyTransform();
      touchStartDist = distance;
    }
  }, { passive: false });

  viewport.addEventListener('touchend', () => {
    touchStartDist = 0;
  }, { passive: true });
}

function handlePointerMove(e) {
  const rect = viewport.getBoundingClientRect();
  const currentX = e.clientX;
  const currentY = e.clientY;
  const dx = currentX - lastPointerPos.x;
  const dy = currentY - lastPointerPos.y;
  
  lastPointerPos = { x: currentX, y: currentY };

  if (mobileMode && !isPanning) return; // Only pan in mobile mode

  if (isPanning) {
    panX += dx;
    panY += dy;
    applyTransform();
  }
  
  if (dragNodeId && !mobileMode) {
    const node = nodes.find(n => n.id === dragNodeId);
    if (node) {
      node.x += dx / scale;
      node.y += dy / scale;
      updateNodePositionDOM(node);
      updateConnections();
    }
  }

  if (resizingNode && !mobileMode) {
    const node = nodes.find(n => n.id === resizingNode);
    if (node) {
      node.w = Math.max(160, node.w + dx / scale);
      node.h = Math.max(100, node.h + dy / scale);
      updateNodeSizeDOM(node);
      updateConnections();
    }
  }

  if (dragBackdrop && !mobileMode) {
    const bd = backdrops.find(b => b.id === dragBackdrop.id);
    if (bd) {
      bd.x += dx / scale;
      bd.y += dy / scale;
      updateBackdropDOM(bd);
    }
  }

  if (resizingBackdrop && !mobileMode) {
    const bd = backdrops.find(b => b.id === resizingBackdrop);
    if (bd) {
      bd.w = Math.max(150, bd.w + dx / scale);
      bd.h = Math.max(100, bd.h + dy / scale);
      updateBackdropDOM(bd);
    }
  }

  if (connectingPort) {
    const mouseX = (currentX - rect.left - panX) / scale;
    const mouseY = (currentY - rect.top - panY) / scale;
    
    const dx = Math.abs(mouseX - connectingPort.x) * 0.5;
    const pathD = connectingPort.type === 'output' 
      ? `M ${connectingPort.x} ${connectingPort.y} C ${connectingPort.x + dx} ${connectingPort.y}, ${mouseX - dx} ${mouseY}, ${mouseX} ${mouseY}`
      : `M ${mouseX} ${mouseY} C ${mouseX + dx} ${mouseY}, ${connectingPort.x - dx} ${connectingPort.y}, ${connectingPort.x} ${connectingPort.y}`;
    
    dragLine.setAttribute('d', pathD);
  }
}

function applyTransform() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  const scaledGridSize = GRID_SIZE * scale;
  viewport.style.backgroundSize = `${scaledGridSize}px ${scaledGridSize}px`;
  viewport.style.backgroundPosition = `${panX}px ${panY}px`;
}

function resetView() {
  scale = 1; panX = 0; panY = 0;
  applyTransform();
}

function deselectAll() {
  selectedNodeId = null;
  selectedBackdropId = null;
  selectedConnId = null;
  document.querySelectorAll('.node, .connector-group').forEach(el => el.classList.remove('selected'));
  renderInspector();
}

// --- Search System ---
let searchDebounceTimer = null;

function setupSearch() {
  const renderResults = (query) => {
    searchDropdown.innerHTML = '';
    
    const library = (typeof componentLibrary !== 'undefined' ? componentLibrary : window.componentLibrary) || [];
    const searchQuery = (query || '').toLowerCase().trim();
    const filtered = library.filter(c => c.type && c.type.toLowerCase().includes(searchQuery));
    
    if (filtered.length === 0) {
      searchDropdown.innerHTML = '<div class="search-item" style="color:var(--text-muted); cursor:default;">No devices found</div>';
      return;
    }
    
    const fragment = document.createDocumentFragment();
    filtered.forEach(comp => {
      const div = document.createElement('div');
      div.className = 'search-item';
      div.innerHTML = `<div class="color-dot" style="background:${comp.color || '#00e5ff'}"></div> ${comp.type}`;
      
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        
        const viewCenterX = (-panX + viewport.clientWidth / 2) / scale;
        const viewCenterY = (-panY + viewport.clientHeight / 2) / scale;
        
        const targetLayerId = layers.length > 0 ? layers[0].id : 'layer_default';
        const autoH = Math.max(110, Math.max(comp.inPorts || 1, comp.outPorts || 1) * 28 + 50);
        
        const pos = findUnoccupiedPosition(
          viewCenterX - 100, 
          viewCenterY - 40, 
          220, 
          autoH
        );
        
        createNode(
          comp.type, 
          targetLayerId, 
          pos.x,
          pos.y,
          comp.color, 
          comp.inPorts !== undefined ? comp.inPorts : 1, 
          comp.outPorts !== undefined ? comp.outPorts : 1
        );
        
        searchInput.value = '';
        searchDropdown.classList.remove('active');
      });

      fragment.appendChild(div);
    });
    searchDropdown.appendChild(fragment);
  };

  searchInput.addEventListener('focus', () => { 
    searchDropdown.classList.add('active'); 
    renderResults(searchInput.value); 
  });

  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDropdown.classList.add('active');
    searchDebounceTimer = setTimeout(() => {
      renderResults(e.target.value);
    }, 150);
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => searchDropdown.classList.remove('active'), 200);
  });
}

// --- Backdrops ---
function addBackdrop(title = 'System Zone', x = 200, y = 200, w = 300, h = 200, color = '#3a86ff') {
  const id = 'bd_' + Date.now();
  const pos = findUnoccupiedPosition(x, y, w, h);
  const bd = { id, title, x: pos.x, y: pos.y, w, h, color };
  backdrops.push(bd);
  renderBackdropToDOM(bd);
  selectBackdrop(id);
}

function renderBackdropToDOM(bd) {
  const el = document.createElement('div');
  el.className = 'backdrop';
  el.id = bd.id;
  el.innerHTML = `
    <div class="backdrop-header">
      <span class="bd-title">${bd.title}</span>
    </div>
    <div class="backdrop-resize"></div>
  `;

  const header = el.querySelector('.backdrop-header');
  header.addEventListener('pointerdown', (e) => {
    if (mobileMode) return;
    e.stopPropagation();
    dragBackdrop = { id: bd.id };
    selectBackdrop(bd.id);
  });

  const resizer = el.querySelector('.backdrop-resize');
  resizer.addEventListener('pointerdown', (e) => {
    if (mobileMode) return;
    e.stopPropagation();
    resizingBackdrop = bd.id;
  });

  canvas.appendChild(el);
  updateBackdropDOM(bd);
}

function updateBackdropDOM(bd) {
  const el = document.getElementById(bd.id);
  if (el) {
    el.style.left = bd.x + 'px';
    el.style.top = bd.y + 'px';
    el.style.width = bd.w + 'px';
    el.style.height = bd.h + 'px';
    el.style.borderColor = bd.color;
    el.querySelector('.backdrop-header').style.color = bd.color;
  }
}

// --- Nodes Management ---
function createNode(type, layerId, x, y, color, inPorts = 1, outPorts = 1) {
  const autoH = Math.max(110, Math.max(inPorts, outPorts) * 28 + 50);
  const pos = findUnoccupiedPosition(x, y, 220, autoH);
  createNodeWithId('node_' + Date.now(), type, layerId, pos.x, pos.y, color, inPorts, outPorts, 220, autoH);
}

function createNodeWithId(id, type, layerId, x, y, color, inPorts = 1, outPorts = 1, w = 220, h = 110) {
  if (snapToGrid) {
    x = Math.round(x / GRID_SIZE) * GRID_SIZE;
    y = Math.round(y / GRID_SIZE) * GRID_SIZE;
  }

  const node = { 
    id, type, layerId, label: type, color, x, y, w, h,
    inPorts: inPorts !== undefined ? parseInt(inPorts) : 1, 
    outPorts: outPorts !== undefined ? parseInt(outPorts) : 1,
    starred: false, highlighted: false,
    ip: '192.168.1.' + Math.floor(Math.random()*200 + 10) 
  };
  nodes.push(node);
  renderNodeToDOM(node);
  selectNode(id);
}

function renderNodeToDOM(node) {
  const el = document.createElement('div');
  el.className = `node ${node.starred ? 'starred' : ''} ${node.highlighted ? 'highlighted' : ''}`;
  el.id = node.id;
  
  let inPortsHTML = '';
  for (let i = 0; i < node.inPorts; i++) {
    inPortsHTML += `<div class="port input" data-node="${node.id}" data-port="input" data-index="${i}" title="Input ${i+1}"></div>`;
  }

  let outPortsHTML = '';
  for (let j = 0; j < node.outPorts; j++) {
    outPortsHTML += `<div class="port output" data-node="${node.id}" data-port="output" data-index="${j}" title="Output ${j+1}"></div>`;
  }

  el.innerHTML = `
    <div class="node-header" style="border-top: 3px solid ${node.color}">
      <div class="node-title-group">
        <span class="star-icon">★</span>
        <span class="lbl">${node.label}</span>
      </div>
      <div style="width:8px; height:8px; border-radius:50%; background:${node.color}"></div>
    </div>
    <div class="node-body">
      <div>IP/ID <span class="ip-tag">${node.ip}</span></div>
      <div>PORTS <span>${node.inPorts} IN / ${node.outPorts} OUT</span></div>
    </div>
    <div class="port-column left">${inPortsHTML}</div>
    <div class="port-column right">${outPortsHTML}</div>
    <div class="node-resize"></div>
  `;

  const header = el.querySelector('.node-header');
  header.addEventListener('pointerdown', (e) => {
    if (mobileMode) return;
    dragNodeId = node.id;
    selectNode(node.id);
    e.stopPropagation();
  });

  const resizer = el.querySelector('.node-resize');
  resizer.addEventListener('pointerdown', (e) => {
    if (mobileMode) return;
    resizingNode = node.id;
    selectNode(node.id);
    e.stopPropagation();
  });

  el.addEventListener('pointerdown', () => selectNode(node.id));

  el.querySelectorAll('.port').forEach(port => {
    port.addEventListener('pointerdown', (e) => {
      if (mobileMode) return;
      e.stopPropagation();
      const rect = port.getBoundingClientRect();
      const viewRect = canvas.getBoundingClientRect();
      
      connectingPort = {
        nodeId: node.id,
        type: port.dataset.port,
        index: parseInt(port.dataset.index),
        x: (rect.left - viewRect.left + rect.width / 2) / scale,
        y: (rect.top - viewRect.top + rect.height / 2) / scale
      };
      dragLine.style.display = 'block';
    });
  });

  canvas.appendChild(el);
  updateNodePositionDOM(node);
  updateNodeSizeDOM(node);
  refreshVisibility();
}

function updateNodePositionDOM(node) {
  const el = document.getElementById(node.id);
  if (el) {
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
  }
}

function updateNodeSizeDOM(node) {
  const el = document.getElementById(node.id);
  if (el) {
    el.style.width = node.w + 'px';
    el.style.height = node.h + 'px';
  }
}

// --- Connections ---
function createConnection(fromId, fromIdx, toId, toIdx) {
  if (connections.some(c => c.from === fromId && c.fromIdx === fromIdx && c.to === toId && c.toIdx === toIdx)) return;
  connections.push({ id: 'conn_' + Date.now(), from: fromId, fromIdx, to: toId, toIdx });
  updateConnections();
}

function updateConnections() {
  svgLayer.querySelectorAll('g.connector-group').forEach(el => el.remove());

  let defs = svgLayer.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgLayer.prepend(defs);
  } else {
    defs.innerHTML = ''; 
  }

  const visibleLayerIds = new Set(layers.filter(l => l.visible).map(l => l.id));

  connections.forEach(conn => {
    const fromNode = nodes.find(n => n.id === conn.from);
    const toNode = nodes.find(n => n.id === conn.to);
    
    if (!visibleLayerIds.has(fromNode?.layerId) || !visibleLayerIds.has(toNode?.layerId)) return;

    const fromEl = document.querySelector(`#${conn.from} .port.output[data-index="${conn.fromIdx}"]`);
    const toEl = document.querySelector(`#${conn.to} .port.input[data-index="${conn.toIdx}"]`);

    if (fromEl && toEl) {
      const viewRect = canvas.getBoundingClientRect();
      const rA = fromEl.getBoundingClientRect();
      const rB = toEl.getBoundingClientRect();

      const x1 = (rA.left - viewRect.left + rA.width / 2) / scale;
      const y1 = (rA.top - viewRect.top + rA.height / 2) / scale;
      const x2 = (rB.left - viewRect.left + rB.width / 2) / scale;
      const y2 = (rB.top - viewRect.top + rB.height / 2) / scale;

      const gradId = `grad_${conn.id}`;
      
      let grad = gradientCache.get(gradId);
      if (!grad) {
        grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', gradId);
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        
        const stopStart = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stopStart.setAttribute('offset', '0%');
        stopStart.setAttribute('stop-color', '#3a86ff');
        
        const stopEnd = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stopEnd.setAttribute('offset', '100%');
        stopEnd.setAttribute('stop-color', '#9d4edd');
        
        grad.appendChild(stopStart);
        grad.appendChild(stopEnd);
        gradientCache.set(gradId, grad);
      }
      
      grad.setAttribute('x1', x1);
      grad.setAttribute('y1', y1);
      grad.setAttribute('x2', x2);
      grad.setAttribute('y2', y2);
      defs.appendChild(grad);

      const dx = Math.abs(x2 - x1) * 0.5;
      const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', `connector-group ${selectedConnId === conn.id ? 'selected' : ''}`);

      const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitbox.setAttribute('d', pathD);
      hitbox.setAttribute('class', 'connector-hitbox');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('class', 'connector');
      
      if (selectedConnId !== conn.id) {
        path.setAttribute('stroke', `url(#${gradId})`);
      }

      group.appendChild(hitbox);
      group.appendChild(path);
      
      group.addEventListener('pointerdown', (e) => { 
        e.stopPropagation(); 
        selectConnection(conn.id); 
      });
      svgLayer.appendChild(group);
    }
  });
}

// --- Inspector Panels ---
function selectNode(id) {
  deselectAll();
  selectedNodeId = id;
  document.getElementById(id)?.classList.add('selected');
  renderInspector();
  toggleInspectorPanel(true);
}

function selectBackdrop(id) {
  deselectAll();
  selectedBackdropId = id;
  renderInspector();
  toggleInspectorPanel(true);
}

function selectConnection(id) {
  deselectAll();
  selectedConnId = id;
  updateConnections();
  renderInspector();
  toggleInspectorPanel(true);
}

function toggleInspectorPanel(show) {
  const sidebar = document.getElementById('sidebar');
  if (show && !sidebar.classList.contains('collapsed')) {
    sidebar.classList.remove('collapsed');
  }
}

function renderInspector() {
  const container = document.getElementById('inspector-content');
  
  if (selectedNodeId) {
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    const layerOpts = layers.map(l => `<option value="${l.id}" ${l.id === node.layerId ? 'selected' : ''}>${l.name}</option>`).join('');

    container.innerHTML = `
      <div class="field">
        <label>Device Name</label>
        <input type="text" value="${node.label}" oninput="updateNodeProp('${node.id}', 'label', this.value)">
      </div>
      <div class="field">
        <label>IP / ID Address</label>
        <input type="text" value="${node.ip}" oninput="updateNodeProp('${node.id}', 'ip', this.value)">
      </div>
      <div class="field">
        <label>Header Accent Color</label>
        <input type="color" value="${node.color}" onchange="updateNodeProp('${node.id}', 'color', this.value)">
      </div>
      <div class="field-row">
        <div class="field" style="flex:1;">
          <label>IN Ports</label>
          <input type="number" min="0" max="32" value="${node.inPorts}" onchange="updateNodeProp('${node.id}', 'inPorts', this.value)">
        </div>
        <div class="field" style="flex:1;">
          <label>OUT Ports</label>
          <input type="number" min="0" max="32" value="${node.outPorts}" onchange="updateNodeProp('${node.id}', 'outPorts', this.value)">
        </div>
      </div>
      <div class="field-row">
        <div class="field" style="flex:1;">
          <label>Width (px)</label>
          <input type="number" min="160" max="600" value="${Math.round(node.w)}" onchange="updateNodeProp('${node.id}', 'w', this.value)">
        </div>
        <div class="field" style="flex:1;">
          <label>Height (px)</label>
          <input type="number" min="100" max="800" value="${Math.round(node.h)}" onchange="updateNodeProp('${node.id}', 'h', this.value)">
        </div>
      </div>
      <div class="field">
        <label>Layer</label>
        <select onchange="updateNodeProp('${node.id}', 'layerId', this.value)">${layerOpts}</select>
      </div>
      <div class="field-row" style="margin-top:10px;">
        <button onclick="toggleStar('${node.id}')" style="flex:1;">${node.starred ? '★ Unstar' : '☆ Star Node'}</button>
        <button onclick="toggleHighlight('${node.id}')" style="flex:1;">${node.highlighted ? 'Unhighlight' : '⚡ Highlight'}</button>
      </div>
      <button onclick="deleteNode('${node.id}')" style="margin-top:12px; width:100%; border-color:var(--accent-pink); color:var(--accent-pink);">Remove Device</button>
    `;
  } else if (selectedBackdropId) {
    const bd = backdrops.find(b => b.id === selectedBackdropId);
    if (!bd) return;

    container.innerHTML = `
      <div class="field">
        <label>Group Backdrop Title</label>
        <input type="text" value="${bd.title}" oninput="updateBackdropProp('${bd.id}', 'title', this.value)">
      </div>
      <div class="field">
        <label>Border Accent Color</label>
        <input type="color" value="${bd.color}" onchange="updateBackdropProp('${bd.id}', 'color', this.value)">
      </div>
      <button onclick="deleteBackdrop('${bd.id}')" style="margin-top:12px; width:100%; border-color:var(--accent-pink); color:var(--accent-pink);">Delete Backdrop</button>
    `;
  } else if (selectedConnId) {
    container.innerHTML = `
      <div class="field"><label>Cable Connection</label><span style="font-size:0.8rem;">Active Signal Route</span></div>
      <button onclick="deleteConnection('${selectedConnId}')" style="margin-top:12px; width:100%; border-color:var(--accent-pink); color:var(--accent-pink);">Remove Connection</button>
    `;
  } else {
    container.innerHTML = '<div style="font-size: 0.78rem; color: var(--text-muted); text-align: center; margin-top: 2rem;">Select a node, backdrop, or cable to inspect.</div>';
  }
}

function updateNodeProp(id, prop, val) {
  const node = nodes.find(n => n.id === id);
  if (!node) return;
  
  if (['inPorts', 'outPorts', 'w', 'h'].includes(prop)) val = parseInt(val) || 0;
  node[prop] = val;

  if (prop === 'inPorts' || prop === 'outPorts') {
    const requiredH = Math.max(110, Math.max(node.inPorts, node.outPorts) * 28 + 50);
    node.h = requiredH;
  }

  if (['inPorts', 'outPorts', 'color', 'w', 'h'].includes(prop)) {
    const el = document.getElementById(id);
    el?.remove();
    renderNodeToDOM(node);
    selectNode(id);
    updateConnections();
  } else {
    const el = document.getElementById(id);
    if (prop === 'label' && el) el.querySelector('.lbl').innerText = val;
    if (prop === 'ip' && el) el.querySelector('.ip-tag').innerText = val;
  }
}

function toggleStar(id) {
  const node = nodes.find(n => n.id === id);
  if (node) {
    node.starred = !node.starred;
    document.getElementById(id)?.classList.toggle('starred', node.starred);
    renderInspector();
  }
}

function toggleHighlight(id) {
  const node = nodes.find(n => n.id === id);
  if (node) {
    node.highlighted = !node.highlighted;
    document.getElementById(id)?.classList.toggle('highlighted', node.highlighted);
    renderInspector();
  }
}

function updateBackdropProp(id, prop, val) {
  const bd = backdrops.find(b => b.id === id);
  if (bd) {
    bd[prop] = val;
    updateBackdropDOM(bd);
  }
}

// --- Layer Operations ---
function renderLayers() {
  layersListEl.innerHTML = '';
  layers.forEach((layer) => {
    const div = document.createElement('div');
    div.className = 'layer-item';
    div.innerHTML = `
      <button style="padding:2px 4px; border:none; background:transparent; cursor:pointer;" onclick="toggleLayer('${layer.id}')" title="Toggle Visibility">
        ${layer.visible ? '👁' : '🕶'}
      </button>
      <input type="text" value="${layer.name}" onchange="updateLayerName('${layer.id}', this.value)">
      <button style="padding:2px 6px; border:none; background:transparent; color:var(--accent-pink); cursor:pointer; font-weight:bold;" onclick="deleteLayer('${layer.id}')" title="Delete Layer">
        ✕
      </button>
    `;
    layersListEl.appendChild(div);
  });
  refreshVisibility();
}

function addLayer() {
  const newLayerId = 'layer_' + Date.now();
  layers.push({ id: newLayerId, name: 'New Layer', visible: true });
  renderLayers();
}

function toggleLayer(id) {
  const layer = layers.find(l => l.id === id);
  if (layer) layer.visible = !layer.visible;
  renderLayers();
}

function updateLayerName(id, name) {
  const layer = layers.find(l => l.id === id);
  if (layer) layer.name = name;
}

function deleteLayer(idToPort) {
  if (layers.length <= 1) {
    if (!confirm("This is the last layer. Deleting it will create a default 'Main Layer' to keep your nodes active. Proceed?")) {
      return;
    }
  }

  layers = layers.filter(l => l.id !== idToPort);

  if (layers.length === 0) {
    layers.push({ id: 'layer_default', name: 'Main Layer', visible: true });
  }

  const targetLayerId = layers[0].id;

  nodes.forEach(node => {
    if (node.layerId === idToPort) {
      node.layerId = targetLayerId;
    }
  });

  renderLayers();
  refreshVisibility();
  if (selectedNodeId) renderInspector();
}

function refreshVisibility() {
  nodes.forEach(node => {
    const layer = layers.find(l => l.id === node.layerId);
    const el = document.getElementById(node.id);
    if (el) {
      el.style.display = (layer && layer.visible) ? 'block' : 'none';
    }
  });
  updateConnections();
}

// --- Deletions & Canvas ---
function deleteNode(id) {
  nodes = nodes.filter(n => n.id !== id);
  connections = connections.filter(c => c.from !== id && c.to !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  deselectAll();
  updateConnections();
}

function deleteBackdrop(id) {
  backdrops = backdrops.filter(b => b.id !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  deselectAll();
}

function deleteConnection(id) {
  connections = connections.filter(c => c.id !== id);
  deselectAll();
  updateConnections();
}

function clearCanvas() {
  if (confirm('Clear entire schematic canvas?')) {
    nodes = []; backdrops = []; connections = [];
    document.querySelectorAll('.node, .backdrop').forEach(el => el.remove());
    deselectAll();
    updateConnections();
    applyTransform();
  }
}

function toggleGrid() {
  snapToGrid = !snapToGrid;
  document.getElementById('btn-grid').classList.toggle('active', snapToGrid);
}

function snapAllNodes() {
  nodes.forEach(n => {
    n.x = Math.round(n.x / GRID_SIZE) * GRID_SIZE;
    n.y = Math.round(n.y / GRID_SIZE) * GRID_SIZE;
    updateNodePositionDOM(n);
  });
  updateConnections();
}

// --- Import / Export ---
function exportJSON() {
  const projectName = projectNameInput.value.trim() || "Untitled Project";
  const schematicData = { 
    version: "2026.2", 
    projectName,
    layers, 
    backdrops, 
    nodes, 
    connections, 
    viewport: { scale, panX, panY } 
  };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(schematicData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `${projectName.replace(/[^a-z0-9_-]/gi, '_')}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importJSON() { document.getElementById('file-input').click(); }

function handleFileSelect(evt) {
  const file = evt.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      nodes = []; backdrops = []; connections = [];
      document.querySelectorAll('.node, .backdrop').forEach(el => el.remove());

      if (data.projectName) projectNameInput.value = data.projectName;
      layers = data.layers || [];
      backdrops = data.backdrops || [];
      nodes = data.nodes || [];
      connections = data.connections || [];
      
      if (data.viewport) {
        scale = data.viewport.scale || 1;
        panX = data.viewport.panX || 0;
        panY = data.viewport.panY || 0;
        applyTransform();
      }

      renderLayers();
      backdrops.forEach(bd => renderBackdropToDOM(bd));
      nodes.forEach(node => renderNodeToDOM(node));
      
      requestAnimationFrame(() => {
        updateConnections();
      });
      deselectAll();
    } catch (err) {
      alert('Failed to parse project JSON file.');
    }
  };
  reader.readAsText(file);
  evt.target.value = '';
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (selectedNodeId) deleteNode(selectedNodeId);
    else if (selectedBackdropId) deleteBackdrop(selectedBackdropId);
    else if (selectedConnId) deleteConnection(selectedConnId);
  }
});

window.onload = init;

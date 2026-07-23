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
let scale = 1, panX = 0, panY = 0;
let isPanning = false;
let snapToGrid = true;
let alwaysShowSidebar = false;
const GRID_SIZE = 28;

let viewport, canvas, svgLayer, dragLine, searchInput, searchDropdown, layersListEl, projectNameInput, sidebarPanel;

let rafId = null;
let lastPointerPos = { x: 0, y: 0 };
let touchStartDist = 0;

function init() {
  viewport = document.getElementById('viewport');
  canvas = document.getElementById('canvas');
  svgLayer = document.getElementById('svg-layer');
  dragLine = document.getElementById('drag-line');
  searchInput = document.getElementById('node-search');
  searchDropdown = document.getElementById('search-dropdown');
  layersListEl = document.getElementById('layers-list');
  projectNameInput = document.getElementById('project-name');
  sidebarPanel = document.getElementById('sidebar-panel');

  const savedTheme = localStorage.getItem('nodelab-theme') || 'dark';
  setTheme(savedTheme);

  alwaysShowSidebar = localStorage.getItem('nodelab-always-sidebar') === 'true';

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

  updateSidebarVisibility();
}

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

function openSettings() {
  const modal = document.getElementById('settings-modal');
  modal.classList.add('active');
  
  document.getElementById('setting-grid').checked = snapToGrid;
  document.getElementById('setting-sidebar').checked = alwaysShowSidebar;
}

function closeSettings() {
  const modal = document.getElementById('settings-modal');
  modal.classList.remove('active');
}

function updateGridSetting() {
  snapToGrid = document.getElementById('setting-grid').checked;
  syncGridUI();
}

function toggleGrid() {
  snapToGrid = !snapToGrid;
  syncGridUI();
}

function syncGridUI() {
  const gridBtn = document.getElementById('btn-grid');
  if (gridBtn) {
    if (snapToGrid) gridBtn.classList.add('active');
    else gridBtn.classList.remove('active');
  }
  const gridCheckbox = document.getElementById('setting-grid');
  if (gridCheckbox) gridCheckbox.checked = snapToGrid;
}

function updateSidebarSetting() {
  alwaysShowSidebar = document.getElementById('setting-sidebar').checked;
  localStorage.setItem('nodelab-always-sidebar', alwaysShowSidebar);
  updateSidebarVisibility();
}

function updateSidebarVisibility() {
  if (!sidebarPanel) return;
  const hasSelection = selectedNodeId !== null || selectedBackdropId !== null || selectedConnId !== null;
  
  if (alwaysShowSidebar || hasSelection) {
    sidebarPanel.classList.remove('hidden');
  } else {
    sidebarPanel.classList.add('hidden');
  }
}

window.addEventListener('click', (e) => {
  const modal = document.getElementById('settings-modal');
  if (e.target === modal) closeSettings();
});

// --- Pointer & Viewport Control Engine ---
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
    
    if (e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && (e.target === viewport || e.target === canvas)))) {
      isPanning = true;
      viewport.style.cursor = 'grabbing';
      deselectAll();
      lastPointerPos = { x: e.clientX, y: e.clientY };
    } else if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      const target = e.target.closest('.node, .port, .backdrop, .backdrop-header, .node-header, .backdrop-resize, .node-resize');
      if (!target) {
        isPanning = true;
        deselectAll();
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

  viewport.addEventListener('pointerup', (e) => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    
    isPanning = false;
    viewport.style.cursor = 'grab';
    
    if (connectingPort) {
      const targetPortEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port');
      if (targetPortEl) {
        const targetNodeId = targetPortEl.dataset.node;
        const targetType = targetPortEl.dataset.port;
        const targetIndex = parseInt(targetPortEl.dataset.index);

        if (targetNodeId && targetNodeId !== connectingPort.nodeId && targetType !== connectingPort.type) {
          if (connectingPort.type === 'output' && targetType === 'input') {
            createConnection(connectingPort.nodeId, connectingPort.index, targetNodeId, targetIndex);
          } else if (connectingPort.type === 'input' && targetType === 'output') {
            createConnection(targetNodeId, targetIndex, connectingPort.nodeId, connectingPort.index);
          }
        }
      }
      
      connectingPort = null;
      dragLine.style.display = 'none';
      dragLine.setAttribute('d', '');
    }

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

  viewport.addEventListener('touchend', () => { touchStartDist = 0; }, { passive: true });
}

function handlePointerMove(e) {
  const rect = viewport.getBoundingClientRect();
  const currentX = e.clientX;
  const currentY = e.clientY;
  const dx = currentX - lastPointerPos.x;
  const dy = currentY - lastPointerPos.y;
  
  lastPointerPos = { x: currentX, y: currentY };

  if (isPanning) {
    panX += dx;
    panY += dy;
    applyTransform();
  }
  
  if (dragNodeId) {
    const node = nodes.find(n => n.id === dragNodeId);
    if (node) {
      node.x += dx / scale;
      node.y += dy / scale;
      updateNodePositionDOM(node);
      updateConnections();
    }
  }

  if (resizingNode) {
    const node = nodes.find(n => n.id === resizingNode);
    if (node) {
      node.w = Math.max(160, node.w + dx / scale);
      node.h = Math.max(100, node.h + dy / scale);
      updateNodeSizeDOM(node);
      updateConnections();
    }
  }

  if (dragBackdrop) {
    const bd = backdrops.find(b => b.id === dragBackdrop.id);
    if (bd) {
      bd.x += dx / scale;
      bd.y += dy / scale;
      updateBackdropDOM(bd);
    }
  }

  if (resizingBackdrop) {
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
    
    const cDx = Math.abs(mouseX - connectingPort.x) * 0.5;
    const pathD = connectingPort.type === 'output' 
      ? `M ${connectingPort.x} ${connectingPort.y} C ${connectingPort.x + cDx} ${connectingPort.y}, ${mouseX - cDx} ${mouseY}, ${mouseX} ${mouseY}`
      : `M ${mouseX} ${mouseY} C ${mouseX + cDx} ${mouseY}, ${connectingPort.x - cDx} ${connectingPort.y}, ${connectingPort.x} ${connectingPort.y}`;
    
    dragLine.setAttribute('d', pathD);
  }
}

function applyTransform() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  canvas.style.setProperty('--zoom-scale', scale);

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
  document.querySelectorAll('.node, .backdrop, .connector-group').forEach(el => el.classList.remove('selected'));
  renderInspector();
  updateSidebarVisibility();
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
        const targetLayerId = layers.length > 0 ? layers[0].id : 'layer_0';
        
        createNode(comp.type, targetLayerId, viewCenterX - 100, viewCenterY - 40, comp.color, comp.inPorts || 1, comp.outPorts || 1);
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
    searchDebounceTimer = setTimeout(() => renderResults(e.target.value), 150);
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => searchDropdown.classList.remove('active'), 200);
  });
}

// --- Backdrops ---
function addBackdrop(title = 'System Zone', x = 200, y = 200, w = 300, h = 200, color = '#3a86ff') {
  const id = 'bd_' + Date.now();
  const bd = { id, title, x, y, w, h, color };
  backdrops.push(bd);
  renderBackdropToDOM(bd);
  selectBackdrop(id);
}

function renderBackdropToDOM(bd) {
  const el = document.createElement('div');
  el.className = 'backdrop';
  el.id = bd.id;
  el.innerHTML = `
    <div class="backdrop-header"><span class="bd-title">${bd.title}</span></div>
    <div class="backdrop-resize"></div>
  `;

  el.querySelector('.backdrop-header').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dragBackdrop = { id: bd.id };
    selectBackdrop(bd.id);
  });

  el.querySelector('.backdrop-resize').addEventListener('pointerdown', (e) => {
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
  createNodeWithId('node_' + Date.now(), type, layerId, x, y, color, inPorts, outPorts, 220, autoH);
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
    scaleLocked: false,
    ip: '192.168.1.' + Math.floor(Math.random() * 200 + 10)
  };

  nodes.push(node);
  renderNodeToDOM(node);
  selectNode(id);
}

function renderNodeToDOM(node) {
  let el = document.getElementById(node.id);
  if (!el) {
    el = document.createElement('div');
    el.id = node.id;
    canvas.appendChild(el);
  }

  el.className = `node ${node.starred ? 'starred' : ''} ${node.highlighted ? 'highlighted' : ''} ${selectedNodeId === node.id ? 'selected' : ''}`;

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

  el.querySelector('.node-header').addEventListener('pointerdown', (e) => {
    dragNodeId = node.id;
    selectNode(node.id);
    e.stopPropagation();
  });

  el.querySelector('.node-resize').addEventListener('pointerdown', (e) => {
    resizingNode = node.id;
    selectNode(node.id);
    e.stopPropagation();
  });

  el.addEventListener('pointerdown', () => selectNode(node.id));

  el.querySelectorAll('.port').forEach(port => {
    port.addEventListener('pointerdown', (e) => {
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

  updateNodePositionDOM(node);
  updateNodeSizeDOM(node);
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

function selectNode(id) {
  deselectAll();
  selectedNodeId = id;
  const el = document.getElementById(id);
  if (el) el.classList.add('selected');
  renderInspector();
  updateSidebarVisibility();
}

function selectBackdrop(id) {
  deselectAll();
  selectedBackdropId = id;
  const el = document.getElementById(id);
  if (el) el.classList.add('selected');
  renderInspector();
  updateSidebarVisibility();
}

function selectConnection(id) {
  deselectAll();
  selectedConnId = id;
  const el = document.getElementById(id);
  if (el) el.classList.add('selected');
  renderInspector();
  updateSidebarVisibility();
}

// --- Connections & Flow Animations Engine ---
function createConnection(fromId, fromIdx, toId, toIdx) {
  const exists = connections.some(c => c.from === fromId && c.fromIdx === fromIdx && c.to === toId && c.toIdx === toIdx);
  if (exists) return;

  const conn = { id: 'conn_' + Date.now(), from: fromId, fromIdx, to: toId, toIdx };
  connections.push(conn);
  updateConnections();
}

function updateConnections() {
  const existingGroups = new Set();

  connections.forEach(conn => {
    const fromNode = nodes.find(n => n.id === conn.from);
    const toNode = nodes.find(n => n.id === conn.to);

    if (!fromNode || !toNode) return;

    const fromLayer = layers.find(l => l.id === fromNode.layerId);
    const toLayer = layers.find(l => l.id === toNode.layerId);
    if ((fromLayer && !fromLayer.visible) || (toLayer && !toLayer.visible)) {
      const gEl = document.getElementById(conn.id);
      if (gEl) gEl.style.display = 'none';
      return;
    }

    const fromPort = document.querySelector(`.port.output[data-node="${conn.from}"][data-index="${conn.fromIdx}"]`);
    const toPort = document.querySelector(`.port.input[data-node="${conn.to}"][data-index="${conn.toIdx}"]`);

    if (!fromPort || !toPort) return;

    const canvasRect = canvas.getBoundingClientRect();
    const fRect = fromPort.getBoundingClientRect();
    const tRect = toPort.getBoundingClientRect();

    const x1 = (fRect.left - canvasRect.left + fRect.width / 2) / scale;
    const y1 = (fRect.top - canvasRect.top + fRect.height / 2) / scale;
    const x2 = (tRect.left - canvasRect.left + tRect.width / 2) / scale;
    const y2 = (tRect.top - canvasRect.top + tRect.height / 2) / scale;

    const dx = Math.abs(x2 - x1) * 0.5;
    const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    let g = document.getElementById(conn.id);
    if (!g) {
      g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', conn.id);
      g.setAttribute('class', `connector-group ${selectedConnId === conn.id ? 'selected' : ''}`);

      // Transparent hit target
      const pathBg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathBg.setAttribute('class', 'connector-bg');

      // Base colored cable path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'connector-path');
      path.setAttribute('stroke', fromNode.color || '#00e5ff');

      // Animated white dashed flow overlay line
      const pathFlow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathFlow.setAttribute('class', 'connector-flow');

      g.appendChild(pathBg);
      g.appendChild(path);
      g.appendChild(pathFlow);

      g.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        selectConnection(conn.id);
      });

      svgLayer.appendChild(g);
    }

    g.style.display = 'block';
    const paths = g.querySelectorAll('path');
    paths[0].setAttribute('d', pathD);
    paths[1].setAttribute('d', pathD);
    paths[1].setAttribute('stroke', fromNode.color || '#00e5ff');
    paths[2].setAttribute('d', pathD);

    existingGroups.add(conn.id);
  });

  Array.from(svgLayer.querySelectorAll('g.connector-group')).forEach(g => {
    if (!existingGroups.has(g.id)) g.remove();
  });
}

// --- Inspector Panel ---
function renderInspector() {
  const container = document.getElementById('inspector-content');
  
  if (selectedNodeId) {
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    container.innerHTML = `
      <div class="inspector-group">
        <label>Label</label>
        <input type="text" value="${node.label}" onchange="updateNodeProp('label', this.value)">
      </div>
      <div class="inspector-group">
        <label>Layer</label>
        <select onchange="updateNodeProp('layerId', this.value)">
          ${layers.map(l => `<option value="${l.id}" ${l.id === node.layerId ? 'selected' : ''}>${l.name}</option>`).join('')}
        </select>
      </div>
      <div class="inspector-group">
        <label>Accent Color</label>
        <input type="color" value="${node.color}" onchange="updateNodeProp('color', this.value)">
      </div>
      <div class="inspector-group">
        <label>Inputs</label>
        <input type="number" min="0" max="32" value="${node.inPorts}" onchange="updateNodePorts('inPorts', this.value)">
      </div>
      <div class="inspector-group">
        <label>Outputs</label>
        <input type="number" min="0" max="32" value="${node.outPorts}" onchange="updateNodePorts('outPorts', this.value)">
      </div>
      <div class="setting-item" style="margin: 12px 0;">
        <label>Lock Node Size</label>
        <input type="checkbox" ${node.scaleLocked ? 'checked' : ''} onchange="updateNodeProp('scaleLocked', this.checked)">
      </div>
      <div class="inspector-group">
        <label>IP / ID Tag</label>
        <input type="text" value="${node.ip || ''}" onchange="updateNodeProp('ip', this.value)">
      </div>
      <button onclick="deleteSelectedNode()" style="width:100%; margin-top:16px; border-color:var(--accent-pink); color:var(--accent-pink);">Delete Node</button>
    `;
  } else if (selectedBackdropId) {
    const bd = backdrops.find(b => b.id === selectedBackdropId);
    if (!bd) return;

    container.innerHTML = `
      <div class="inspector-group">
        <label>Backdrop Title</label>
        <input type="text" value="${bd.title}" onchange="updateBackdropProp('title', this.value)">
      </div>
      <div class="inspector-group">
        <label>Border Color</label>
        <input type="color" value="${bd.color}" onchange="updateBackdropProp('color', this.value)">
      </div>
      <button onclick="deleteSelectedBackdrop()" style="width:100%; margin-top:16px; border-color:var(--accent-pink); color:var(--accent-pink);">Delete Backdrop</button>
    `;
  } else if (selectedConnId) {
    container.innerHTML = `
      <p style="font-size:0.85rem; margin-bottom:12px;">Cable Connection Selected</p>
      <button onclick="deleteSelectedConnection()" style="width:100%; border-color:var(--accent-pink); color:var(--accent-pink);">Disconnect Cable</button>
    `;
  } else {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">Select a node, connection, or backdrop to inspect properties.</p>`;
  }
}

function updateNodeProp(prop, val) {
  const node = nodes.find(n => n.id === selectedNodeId);
  if (node) {
    node[prop] = val;
    renderNodeToDOM(node);
    updateConnections();
  }
}

function updateNodePorts(prop, val) {
  const node = nodes.find(n => n.id === selectedNodeId);
  if (node) {
    node[prop] = Math.max(0, parseInt(val) || 0);
    
    if (!node.scaleLocked) {
      const targetH = Math.max(110, Math.max(node.inPorts, node.outPorts) * 28 + 50);
      node.h = targetH;
    }

    renderNodeToDOM(node);
    updateConnections();
  }
}

function updateBackdropProp(prop, val) {
  const bd = backdrops.find(b => b.id === selectedBackdropId);
  if (bd) {
    bd[prop] = val;
    updateBackdropDOM(bd);
  }
}

function deleteSelectedNode() {
  if (!selectedNodeId) return;
  nodes = nodes.filter(n => n.id !== selectedNodeId);
  connections = connections.filter(c => c.from !== selectedNodeId && c.to !== selectedNodeId);
  const el = document.getElementById(selectedNodeId);
  if (el) el.remove();
  deselectAll();
  updateConnections();
}

function deleteSelectedBackdrop() {
  if (!selectedBackdropId) return;
  backdrops = backdrops.filter(b => b.id !== selectedBackdropId);
  const el = document.getElementById(selectedBackdropId);
  if (el) el.remove();
  deselectAll();
}

function deleteSelectedConnection() {
  if (!selectedConnId) return;
  connections = connections.filter(c => c.id !== selectedConnId);
  const el = document.getElementById(selectedConnId);
  if (el) el.remove();
  deselectAll();
  updateConnections();
}

// --- Layers Management ---
function renderLayers() {
  layersListEl.innerHTML = '';
  layers.forEach(layer => {
    const item = document.createElement('div');
    item.className = 'layer-item';
    item.innerHTML = `
      <span class="layer-toggle">${layer.visible ? '👁' : '🙈'}</span>
      <span style="flex:1;">${layer.name}</span>
    `;
    item.querySelector('.layer-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      renderLayers();
      refreshVisibility();
    });
    layersListEl.appendChild(item);
  });
}

function addLayer() {
  const name = prompt('Enter new layer name:', 'New Signal Path');
  if (!name) return;
  layers.push({ id: 'layer_' + Date.now(), name, visible: true });
  renderLayers();
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

function snapAllNodes() {
  nodes.forEach(node => {
    node.x = Math.round(node.x / GRID_SIZE) * GRID_SIZE;
    node.y = Math.round(node.y / GRID_SIZE) * GRID_SIZE;
    updateNodePositionDOM(node);
  });
  updateConnections();
}

function clearCanvas() {
  if (confirm('Are you sure you want to clear the entire canvas?')) {
    nodes = []; backdrops = []; connections = [];
    document.querySelectorAll('.node, .backdrop').forEach(el => el.remove());
    svgLayer.innerHTML = '<path id="drag-line" class="drag-line" d="" style="display:none;"></path>';
    dragLine = document.getElementById('drag-line');
    deselectAll();
    closeSettings();
  }
}

// --- Save & Load ---
function exportJSON() {
  const data = {
    projectName: projectNameInput.value,
    version: '1.2.0',
    layers, backdrops, nodes, connections,
    viewport: { scale, panX, panY }
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (projectNameInput.value.toLowerCase().replace(/\s+/g, '_') || 'project') + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON() {
  document.getElementById('file-input').click();
}

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
    if (selectedNodeId) deleteSelectedNode();
    else if (selectedBackdropId) deleteSelectedBackdrop();
    else if (selectedConnId) deleteSelectedConnection();
  }
});

window.onload = init;

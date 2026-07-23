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

  setupPointerControls();
  setupSearch();
  renderLayers();
  
  // Keyboard Listeners
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        return;
      }
      if (selectedNodeId) deleteNode(selectedNodeId);
      else if (selectedBackdropId) deleteBackdrop(selectedBackdropId);
      else if (selectedConnId) deleteConnection(selectedConnId);
    }
  });

  // Apply initial canvas view transform
  applyTransform();
}

function applyTransform() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

// --- Grid Collision / Placement Logic ---
function findUnoccupiedPosition() {
  const occupied = new Set();
  nodes.forEach(n => occupied.add(`${Math.round(n.x / GRID_SIZE)},${Math.round(n.y / GRID_SIZE)}`));
  backdrops.forEach(bd => occupied.add(`${Math.round(bd.x / GRID_SIZE)},${Math.round(bd.y / GRID_SIZE)}`));

  let radius = 0;
  while (radius < 100) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const key = `${dx},${dy}`;
        if (!occupied.has(key)) {
          return { x: dx * GRID_SIZE, y: dy * GRID_SIZE };
        }
      }
    }
    radius++;
  }
  return { x: 0, y: 0 };
}

// --- Node Management ---
function addNode(typeObj, customX, customY) {
  const pos = (customX !== undefined && customY !== undefined) 
    ? { x: customX, y: customY } 
    : findUnoccupiedPosition();

  const activeLayer = layers.find(l => l.visible) || layers[0];
  const node = {
    id: 'node_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    type: typeObj.type,
    label: typeObj.type,
    x: pos.x,
    y: pos.y,
    w: 200,
    h: 120,
    color: typeObj.color || '#89b4fa',
    inPorts: typeObj.inPorts || 2,
    outPorts: typeObj.outPorts || 2,
    layerId: activeLayer ? activeLayer.id : 'layer_0',
    meta: { ip: '', notes: '' }
  };

  nodes.push(node);
  renderNodeToDOM(node);
  selectNode(node.id);
}

function renderNodeToDOM(node) {
  const el = document.createElement('div');
  el.className = 'node';
  el.id = node.id;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.w}px`;
  el.style.minHeight = `${node.h}px`;
  el.style.setProperty('--node-color', node.color);

  let inPortsHtml = '';
  for (let i = 0; i < node.inPorts; i++) {
    inPortsHtml += `<div class="port port-in" data-node="${node.id}" data-port="input" data-index="${i}" title="Input ${i + 1}"></div>`;
  }

  let outPortsHtml = '';
  for (let i = 0; i < node.outPorts; i++) {
    outPortsHtml += `<div class="port port-out" data-node="${node.id}" data-port="output" data-index="${i}" title="Output ${i + 1}"></div>`;
  }

  el.innerHTML = `
    <div class="node-header">
      <span class="node-title">${node.label}</span>
      <button class="node-close-btn" onclick="deleteNode('${node.id}')">&times;</button>
    </div>
    <div class="node-body">
      <div class="ports-column inputs">${inPortsHtml}</div>
      <div class="ports-column outputs">${outPortsHtml}</div>
    </div>
    <div class="node-resize-handle"></div>
  `;

  // Attach node interaction listeners
  el.addEventListener('pointerdown', (e) => {
    if (mobileMode) return;
    if (e.target.classList.contains('port')) {
      connectingPort = {
        nodeId: node.id,
        type: e.target.dataset.port,
        index: parseInt(e.target.dataset.index),
        el: e.target
      };
      const rect = e.target.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const startX = (rect.left + rect.width / 2 - viewportRect.left - panX) / scale;
      const startY = (rect.top + rect.height / 2 - viewportRect.top - panY) / scale;
      dragLine.setAttribute('x1', startX);
      dragLine.setAttribute('y1', startY);
      dragLine.setAttribute('x2', startX);
      dragLine.setAttribute('y2', startY);
      dragLine.style.display = 'block';
      e.stopPropagation();
      return;
    }

    if (e.target.classList.contains('node-resize-handle')) {
      resizingNode = { id: node.id, startX: e.clientX, startY: e.clientY, startW: node.w, startH: node.h };
      e.stopPropagation();
      return;
    }

    selectNode(node.id);
    dragNodeId = node.id;
    lastPointerPos = { x: e.clientX, y: e.clientY };
    e.stopPropagation();
  });

  canvas.appendChild(el);
}

function updateNodePositionDOM(node) {
  const el = document.getElementById(node.id);
  if (el) {
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${node.w}px`;
    el.style.minHeight = `${node.h}px`;
  }
}

function deleteNode(id) {
  nodes = nodes.filter(n => n.id !== id);
  connections = connections.filter(c => c.from !== id && c.to !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  if (selectedNodeId === id) deselectAll();
  updateConnections();
}

function selectNode(id) {
  deselectAll();
  selectedNodeId = id;
  const el = document.getElementById(id);
  if (el) el.classList.add('selected');
}

// --- Backdrop Management ---
function addBackdrop() {
  const pos = findUnoccupiedPosition();
  const backdrop = {
    id: 'bd_' + Date.now(),
    title: 'New Zone / Group',
    x: pos.x,
    y: pos.y,
    w: 300,
    h: 200,
    color: '#89b4fa'
  };
  backdrops.push(backdrop);
  renderBackdropToDOM(backdrop);
  selectBackdrop(backdrop.id);
}

function renderBackdropToDOM(bd) {
  const el = document.createElement('div');
  el.className = 'backdrop';
  el.id = bd.id;
  el.style.left = `${bd.x}px`;
  el.style.top = `${bd.y}px`;
  el.style.width = `${bd.w}px`;
  el.style.height = `${bd.h}px`;
  el.style.borderColor = bd.color;

  el.innerHTML = `
    <div class="backdrop-header" style="background-color: ${bd.color}22; color: ${bd.color}">
      <span>${bd.title}</span>
      <button class="node-close-btn" onclick="deleteBackdrop('${bd.id}')">&times;</button>
    </div>
    <div class="backdrop-resize-handle"></div>
  `;

  el.addEventListener('pointerdown', (e) => {
    if (mobileMode) return;
    if (e.target.classList.contains('backdrop-resize-handle')) {
      resizingBackdrop = { id: bd.id, startX: e.clientX, startY: e.clientY, startW: bd.w, startH: bd.h };
      e.stopPropagation();
      return;
    }

    selectBackdrop(bd.id);
    dragBackdrop = bd.id;
    lastPointerPos = { x: e.clientX, y: e.clientY };
    e.stopPropagation();
  });

  canvas.insertBefore(el, canvas.firstChild);
}

function updateBackdropDOM(bd) {
  const el = document.getElementById(bd.id);
  if (el) {
    el.style.left = `${bd.x}px`;
    el.style.top = `${bd.y}px`;
    el.style.width = `${bd.w}px`;
    el.style.height = `${bd.h}px`;
  }
}

function deleteBackdrop(id) {
  backdrops = backdrops.filter(b => b.id !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  if (selectedBackdropId === id) deselectAll();
}

function selectBackdrop(id) {
  deselectAll();
  selectedBackdropId = id;
  const el = document.getElementById(id);
  if (el) el.classList.add('selected');
}

// --- Connections / Routing ---
function createConnection(fromNodeId, fromIdx, toNodeId, toIdx) {
  const conn = {
    id: 'conn_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    from: fromNodeId,
    fromIdx: fromIdx,
    to: toNodeId,
    toIdx: toIdx
  };
  connections.push(conn);
  updateConnections();
}

function deleteConnection(id) {
  connections = connections.filter(c => c.id !== id);
  updateConnections();
  if (selectedConnId === id) deselectAll();
}

function updateConnections() {
  // Clear old connection SVG elements
  svgLayer.querySelectorAll('.cable-path').forEach(p => p.remove());

  connections.forEach(conn => {
    const fromEl = document.querySelector(`.port-out[data-node="${conn.from}"][data-index="${conn.fromIdx}"]`);
    const toEl = document.querySelector(`.port-in[data-node="${conn.to}"][data-index="${conn.toIdx}"]`);

    if (!fromEl || !toEl) return;

    const viewportRect = viewport.getBoundingClientRect();
    const r1 = fromEl.getBoundingClientRect();
    const r2 = toEl.getBoundingClientRect();

    const x1 = (r1.left + r1.width / 2 - viewportRect.left - panX) / scale;
    const y1 = (r1.top + r1.height / 2 - viewportRect.top - panY) / scale;
    const x2 = (r2.left + r2.width / 2 - viewportRect.left - panX) / scale;
    const y2 = (r2.top + r2.height / 2 - viewportRect.top - panY) / scale;

    const dx = Math.abs(x2 - x1) * 0.5;
    const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('class', `cable-path ${selectedConnId === conn.id ? 'selected' : ''}`);
    path.dataset.id = conn.id;

    path.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      deselectAll();
      selectedConnId = conn.id;
      path.classList.add('selected');
    });

    svgLayer.appendChild(path);
  });
}

function deselectAll() {
  selectedNodeId = null;
  selectedBackdropId = null;
  selectedConnId = null;
  document.querySelectorAll('.node.selected, .backdrop.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.cable-path.selected').forEach(el => el.classList.remove('selected'));
}

// --- Pointer Controls & Canvas Interaction ---
function setupPointerControls() {
  viewport.addEventListener('pointerdown', (e) => {
    if (e.target === viewport || e.target === canvas || e.target === svgLayer) {
      deselectAll();
      isPanning = true;
      lastPointerPos = { x: e.clientX, y: e.clientY };
      viewport.style.cursor = 'grabbing';
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (connectingPort) {
      const viewportRect = viewport.getBoundingClientRect();
      const curX = (e.clientX - viewportRect.left - panX) / scale;
      const curY = (e.clientY - viewportRect.top - panY) / scale;
      dragLine.setAttribute('x2', curX);
      dragLine.setAttribute('y2', curY);
      return;
    }

    const dx = (e.clientX - lastPointerPos.x) / scale;
    const dy = (e.clientY - lastPointerPos.y) / scale;

    if (isPanning) {
      panX += e.clientX - lastPointerPos.x;
      panY += e.clientY - lastPointerPos.y;
      applyTransform();
    } else if (dragNodeId) {
      const node = nodes.find(n => n.id === dragNodeId);
      if (node) {
        node.x += dx;
        node.y += dy;
        updateNodePositionDOM(node);
        updateConnections();
      }
    } else if (dragBackdrop) {
      const bd = backdrops.find(b => b.id === dragBackdrop);
      if (bd) {
        bd.x += dx;
        bd.y += dy;
        updateBackdropDOM(bd);
      }
    } else if (resizingBackdrop) {
      const bd = backdrops.find(b => b.id === resizingBackdrop.id);
      if (bd) {
        bd.w = Math.max(100, resizingBackdrop.startW + (e.clientX - resizingBackdrop.startX) / scale);
        bd.h = Math.max(100, resizingBackdrop.startH + (e.clientY - resizingBackdrop.startY) / scale);
        updateBackdropDOM(bd);
      }
    } else if (resizingNode) {
      const node = nodes.find(n => n.id === resizingNode.id);
      if (node) {
        node.w = Math.max(120, resizingNode.startW + (e.clientX - resizingNode.startX) / scale);
        node.h = Math.max(80, resizingNode.startH + (e.clientY - resizingNode.startY) / scale);
        updateNodePositionDOM(node);
        updateConnections();
      }
    }

    lastPointerPos = { x: e.clientX, y: e.clientY };
  });

  viewport.addEventListener('pointerup', (e) => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    // Interactive Port Connection Logic
    if (connectingPort) {
      const targetPort = e.target.closest('.port');
      if (targetPort) {
        const targetNodeId = targetPort.dataset.node;
        const targetType = targetPort.dataset.port;
        const targetIndex = parseInt(targetPort.dataset.index);

        if (connectingPort.nodeId !== targetNodeId && connectingPort.type !== targetType) {
          const fromNode = connectingPort.type === 'output' ? connectingPort.nodeId : targetNodeId;
          const fromIdx = connectingPort.type === 'output' ? connectingPort.index : targetIndex;
          const toNode = connectingPort.type === 'input' ? connectingPort.nodeId : targetNodeId;
          const toIdx = connectingPort.type === 'input' ? connectingPort.index : targetIndex;

          createConnection(fromNode, fromIdx, toNode, toIdx);
        }
      }
      connectingPort = null;
      dragLine.style.display = 'none';
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

  // Canvas Zoom / Wheel handling
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(0.2, scale * zoomFactor), 3);

    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - (mouseX - panX) * (newScale / scale);
    panY = mouseY - (mouseY - panY) * (newScale / scale);
    scale = newScale;

    applyTransform();
  }, { passive: false });
}

// --- Search & Component Library ---
function setupSearch() {
  if (!searchInput || !searchDropdown) return;

  searchInput.addEventListener('focus', () => renderSearchResults(searchInput.value));
  searchInput.addEventListener('input', (e) => renderSearchResults(e.target.value));

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
      searchDropdown.style.display = 'none';
    }
  });
}

function renderSearchResults(query) {
  const lib = window.componentLibrary || [];
  const q = query.toLowerCase().trim();
  const filtered = lib.filter(item => item.type.toLowerCase().includes(q));

  if (filtered.length === 0) {
    searchDropdown.style.display = 'none';
    return;
  }

  searchDropdown.innerHTML = filtered.map(item => `
    <div class="search-item" onclick="selectComponent('${item.type}')">
      <span class="color-dot" style="background-color: ${item.color}"></span>
      <span>${item.type}</span>
    </div>
  `).join('');

  searchDropdown.style.display = 'block';
}

function selectComponent(type) {
  const lib = window.componentLibrary || [];
  const comp = lib.find(c => c.type === type);
  if (comp) {
    addNode(comp);
  }
  searchDropdown.style.display = 'none';
  searchInput.value = '';
}

// --- Layers Management ---
function renderLayers() {
  if (!layersListEl) return;
  layersListEl.innerHTML = layers.map(layer => `
    <div class="layer-item">
      <input type="checkbox" ${layer.visible ? 'checked' : ''} onchange="toggleLayer('${layer.id}')">
      <span>${layer.name}</span>
    </div>
  `).join('');
}

function toggleLayer(layerId) {
  const layer = layers.find(l => l.id === layerId);
  if (layer) {
    layer.visible = !layer.visible;
    renderLayers();
  }
}

// --- Settings & UI Helpers ---
function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
}

function updateUIScale(val) {
  uiScale = val / 100;
  document.getElementById('scale-value').innerText = val;
  document.documentElement.style.setProperty('--ui-scale', uiScale);
}

function updateGridSetting() {
  snapToGrid = document.getElementById('setting-grid').checked;
}

function toggleMobileMode() {
  mobileMode = document.getElementById('setting-mobile').checked;
}

function clearCanvas() {
  if (confirm('Are you sure you want to clear the entire canvas?')) {
    nodes = [];
    backdrops = [];
    connections = [];
    document.querySelectorAll('.node, .backdrop').forEach(el => el.remove());
    updateConnections();
    deselectAll();
  }
}

// --- Project Import / Export ---
function exportProject() {
  const data = {
    version: '2026.2',
    projectName: projectNameInput.value || 'Untitled Project',
    viewport: { scale, panX, panY },
    layers,
    backdrops,
    nodes,
    connections
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${(projectNameInput.value || 'project').toLowerCase().replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function triggerImport() {
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

// Initialize application on DOM load
window.addEventListener('DOMContentLoaded', init);

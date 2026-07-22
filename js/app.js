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
const GRID_SIZE = 28;

const viewport = document.getElementById('viewport');
const canvas = document.getElementById('canvas');
const svgLayer = document.getElementById('svg-layer');
const dragLine = document.getElementById('drag-line');
const searchInput = document.getElementById('node-search');
const searchDropdown = document.getElementById('search-dropdown');
const layersListEl = document.getElementById('layers-list');
const projectNameInput = document.getElementById('project-name');

function init() {
  renderLayers();
  setupSearch();
  setupViewportControls();
  
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

// --- Theme & Viewport Controls ---
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  document.getElementById('btn-theme').innerText = currentTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

function setupViewportControls() {
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    let newScale = Math.min(Math.max(0.25, scale + delta), 2.5);
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    panX = mouseX - (mouseX - panX) * (newScale / scale);
    panY = mouseY - (mouseY - panY) * (newScale / scale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  viewport.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.target === viewport)) {
      isPanning = true;
      viewport.style.cursor = 'grabbing';
      deselectAll();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      panX += e.movementX;
      panY += e.movementY;
      applyTransform();
    }
    
    if (dragNodeId) {
      const node = nodes.find(n => n.id === dragNodeId);
      node.x += e.movementX / scale;
      node.y += e.movementY / scale;
      updateNodePositionDOM(node);
      updateConnections();
    }

    if (resizingNode) {
      const node = nodes.find(n => n.id === resizingNode);
      node.w = Math.max(160, node.w + e.movementX / scale);
      node.h = Math.max(100, node.h + e.movementY / scale);
      updateNodeSizeDOM(node);
      updateConnections();
    }

    if (dragBackdrop) {
      const bd = backdrops.find(b => b.id === dragBackdrop.id);
      bd.x += e.movementX / scale;
      bd.y += e.movementY / scale;
      updateBackdropDOM(bd);
    }

    if (resizingBackdrop) {
      const bd = backdrops.find(b => b.id === resizingBackdrop);
      bd.w = Math.max(150, bd.w + e.movementX / scale);
      bd.h = Math.max(100, bd.h + e.movementY / scale);
      updateBackdropDOM(bd);
    }

    if (connectingPort) {
      const rect = viewport.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panX) / scale;
      const mouseY = (e.clientY - rect.top - panY) / scale;
      
      const dx = Math.abs(mouseX - connectingPort.x) * 0.5;
      const pathD = connectingPort.type === 'output' 
        ? `M ${connectingPort.x} ${connectingPort.y} C ${connectingPort.x + dx} ${connectingPort.y}, ${mouseX - dx} ${mouseY}, ${mouseX} ${mouseY}`
        : `M ${mouseX} ${mouseY} C ${mouseX + dx} ${mouseY}, ${connectingPort.x - dx} ${connectingPort.y}, ${connectingPort.x} ${connectingPort.y}`;
      
      dragLine.setAttribute('d', pathD);
    }
  });

  window.addEventListener('mouseup', (e) => {
    isPanning = false;
    viewport.style.cursor = 'grab';
    
    if (dragNodeId && snapToGrid) {
      const node = nodes.find(n => n.id === dragNodeId);
      node.x = Math.round(node.x / GRID_SIZE) * GRID_SIZE;
      node.y = Math.round(node.y / GRID_SIZE) * GRID_SIZE;
      updateNodePositionDOM(node);
      updateConnections();
    }
    dragNodeId = null;
    dragBackdrop = null;
    resizingBackdrop = null;
    resizingNode = null;

    if (connectingPort) {
      const targetPort = e.target.closest('.port');
      if (targetPort && targetPort.dataset.node !== connectingPort.nodeId && targetPort.dataset.port !== connectingPort.type) {
        const fromId = connectingPort.type === 'output' ? connectingPort.nodeId : targetPort.dataset.node;
        const fromIdx = parseInt(connectingPort.type === 'output' ? connectingPort.index : targetPort.dataset.index);
        const toId = connectingPort.type === 'output' ? targetPort.dataset.node : connectingPort.nodeId;
        const toIdx = parseInt(connectingPort.type === 'output' ? targetPort.dataset.index : connectingPort.index);
        
        createConnection(fromId, fromIdx, toId, toIdx);
      }
      connectingPort = null;
      dragLine.style.display = 'none';
    }
  });
}

function applyTransform() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  viewport.style.backgroundPosition = `${panX}px ${panY}px`;
  viewport.style.backgroundSize = `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`;
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

// --- Search ---
function setupSearch() {
  const renderResults = (query) => {
    searchDropdown.innerHTML = '';
    const filtered = componentLibrary.filter(c => c.type.toLowerCase().includes(query.toLowerCase()));
    if (filtered.length === 0) searchDropdown.innerHTML = '<div class="search-item">No devices found</div>';
    
    filtered.forEach(comp => {
      const div = document.createElement('div');
      div.className = 'search-item';
      div.innerHTML = `<div class="color-dot" style="background:${comp.color}"></div> ${comp.type}`;
      div.onmousedown = () => {
        const viewCenterX = (-panX + viewport.clientWidth / 2) / scale;
        const viewCenterY = (-panY + viewport.clientHeight / 2) / scale;
        createNode(comp.type, layers[0].id, viewCenterX - 100, viewCenterY - 40, comp.color, comp.inPorts || 1, comp.outPorts || 1);
        searchInput.value = '';
        searchDropdown.classList.remove('active');
      };
      searchDropdown.appendChild(div);
    });
  };

  searchInput.addEventListener('focus', () => { searchDropdown.classList.add('active'); renderResults(searchInput.value); });
  searchInput.addEventListener('input', (e) => renderResults(e.target.value));
  searchInput.addEventListener('blur', () => setTimeout(() => searchDropdown.classList.remove('active'), 150));
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
    <div class="backdrop-header">
      <span class="bd-title">${bd.title}</span>
    </div>
    <div class="backdrop-resize"></div>
  `;

  const header = el.querySelector('.backdrop-header');
  header.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    dragBackdrop = { id: bd.id };
    selectBackdrop(bd.id);
  });

  const resizer = el.querySelector('.backdrop-resize');
  resizer.addEventListener('mousedown', (e) => {
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

  el.querySelector('.node-header').addEventListener('mousedown', (e) => {
    dragNodeId = node.id;
    selectNode(node.id);
    e.stopPropagation();
  });

  el.querySelector('.node-resize').addEventListener('mousedown', (e) => {
    resizingNode = node.id;
    selectNode(node.id);
    e.stopPropagation();
  });

  el.addEventListener('mousedown', () => selectNode(node.id));

  el.querySelectorAll('.port').forEach(port => {
    port.addEventListener('mousedown', (e) => {
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

// --- Connections with Hitboxes ---
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

  connections.forEach(conn => {
    const fromNode = nodes.find(n => n.id === conn.from);
    const toNode = nodes.find(n => n.id === conn.to);
    
    const fromLayer = layers.find(l => l.id === fromNode?.layerId);
    const toLayer = layers.find(l => l.id === toNode?.layerId);
    if ((fromLayer && !fromLayer.visible) || (toLayer && !toLayer.visible)) return;

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
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      grad.setAttribute('id', gradId);
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', x1);
      grad.setAttribute('y1', y1);
      grad.setAttribute('x2', x2);
      grad.setAttribute('y2', y2);

      const stopStart = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stopStart.setAttribute('offset', '0%');
      stopStart.setAttribute('stop-color', '#3a86ff'); 

      const stopEnd = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stopEnd.setAttribute('offset', '100%');
      stopEnd.setAttribute('stop-color', '#9d4edd'); 

      grad.appendChild(stopStart);
      grad.appendChild(stopEnd);
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
      
      group.onmousedown = (e) => { e.stopPropagation(); selectConnection(conn.id); };
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
}

function selectBackdrop(id) {
  deselectAll();
  selectedBackdropId = id;
  renderInspector();
}

function selectConnection(id) {
  deselectAll();
  selectedConnId = id;
  updateConnections();
  renderInspector();
}

function renderInspector() {
  const container = document.getElementById('inspector-content');
  
  if (selectedNodeId) {
    const node = nodes.find(n => n.id === selectedNodeId);
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
    const requiredH = Math.max(node.h, Math.max(node.inPorts, node.outPorts) * 28 + 50);
    node.h = requiredH;
  }

  if (['inPorts', 'outPorts', 'color', 'w', 'h'].includes(prop)) {
    const el = document.getElementById(id);
    el.remove();
    renderNodeToDOM(node);
    selectNode(id);
    updateConnections();
  } else {
    const el = document.getElementById(id);
    if (prop === 'label') el.querySelector('.lbl').innerText = val;
    if (prop === 'ip') el.querySelector('.ip-tag').innerText = val;
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

  // Remove the deleted layer from array
  layers = layers.filter(l => l.id !== idToPort);

  // If no layers left, create a default fallback layer
  if (layers.length === 0) {
    layers.push({ id: 'layer_default', name: 'Main Layer', visible: true });
  }

  const targetLayerId = layers[0].id;

  // Move all nodes from deleted layer to remaining default layer
  nodes.forEach(node => {
    if (node.layerId === idToPort) {
      node.layerId = targetLayerId;
    }
  });

  renderLayers();
  refreshVisibility();
  if (selectedNodeId) renderInspector();
}

// --- Deletions & Canvas Utilities ---
function deleteNode(id) {
  nodes = nodes.filter(n => n.id !== id);
  connections = connections.filter(c => c.from !== id && c.to !== id);
  document.getElementById(id)?.remove();
  deselectAll();
  updateConnections();
}

function deleteBackdrop(id) {
  backdrops = backdrops.filter(b => b.id !== id);
  document.getElementById(id)?.remove();
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

// --- Import / Export System ---
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

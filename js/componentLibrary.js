window.componentLibrary = [
  // --- Audio ---
  { type: 'Audio Mixer', color: '#9d4edd', inPorts: 8, outPorts: 8 },
  { type: 'Microphone Receiver', color: '#ffbe0b', inPorts: 1, outPorts: 2 },
  { type: 'Audio DSP / Matrix Processor', color: '#7209b7', inPorts: 12, outPorts: 12 },
  { type: 'Power Amplifier', color: '#f72585', inPorts: 2, outPorts: 4 },
  { type: 'Speaker Array / Monitor', color: '#fb5607', inPorts: 2, outPorts: 0 },
  { type: 'Audio Interface', color: '#e0aaff', inPorts: 4, outPorts: 4 },
  { type: 'Stage Box / Digital Snake', color: '#a6e3a1', inPorts: 16, outPorts: 8 },
  { type: 'In-Ear Monitor TX', color: '#ffd166', inPorts: 2, outPorts: 1 },
  { type: 'Audio Media Player', color: '#c77dff', inPorts: 1, outPorts: 2 },
  { type: 'Audio Equalizer / FX Unit', color: '#b5179e', inPorts: 2, outPorts: 2 },

  // --- Video & Graphics ---
  { type: 'Video Router / Matrix Switcher', color: '#f38ba8', inPorts: 8, outPorts: 8 },
  { type: 'Video Switcher / Production Panel', color: '#ee4266', inPorts: 6, outPorts: 4 },
  { type: 'Display / Monitor', color: '#3a86ff', inPorts: 2, outPorts: 0 },
  { type: 'Projector', color: '#4cc9f0', inPorts: 3, outPorts: 0 },
  { type: 'PTZ Camera', color: '#06d6a0', inPorts: 1, outPorts: 2 },
  { type: 'Video Wall Processor', color: '#4361ee', inPorts: 4, outPorts: 8 },
  { type: 'Streaming Encoder', color: '#e63946', inPorts: 2, outPorts: 1 },
  { type: 'Video Decoder / Receiver', color: '#f1faee', inPorts: 1, outPorts: 2 },
  { type: 'Capture Card', color: '#1d3557', inPorts: 2, outPorts: 1 },
  { type: 'Teleprompter', color: '#8d99ae', inPorts: 1, outPorts: 0 },

  // --- Networking & Infrastructure ---
  { type: 'Network Switch', color: '#00e5ff', inPorts: 8, outPorts: 8 },
  { type: 'Network Router / Gateway', color: '#00b4d8', inPorts: 2, outPorts: 4 },
  { type: 'Firewall', color: '#d90429', inPorts: 2, outPorts: 2 },
  { type: 'Patch Panel', color: '#8d99ae', inPorts: 16, outPorts: 16 },
  { type: 'Wireless Access Point (WAP)', color: '#90e0ef', inPorts: 1, outPorts: 0 },
  { type: 'KVM Switch', color: '#ffa500', inPorts: 4, outPorts: 1 },

  // --- Computing & Sources ---
  { type: 'Computer / PC', color: '#ff006e', inPorts: 2, outPorts: 2 },
  { type: 'Laptop / Mobile Workstation', color: '#ff5d8f', inPorts: 1, outPorts: 2 },
  { type: 'Media Server / Playback Mac', color: '#b5e2fa', inPorts: 2, outPorts: 4 },
  { type: 'NAS / Storage Server', color: '#6c757d', inPorts: 2, outPorts: 2 },

  // --- Control & Automation ---
  { type: 'Control Processor', color: '#2a9d8f', inPorts: 4, outPorts: 8 },
  { type: 'Touch Panel / Controller', color: '#e9c46a', inPorts: 1, outPorts: 0 },
  { type: 'Stream Deck / Macro Keypad', color: '#264653', inPorts: 1, outPorts: 0 },

  // --- Lighting & FX ---
  { type: 'Lighting Console', color: '#ff9f1c', inPorts: 1, outPorts: 4 },
  { type: 'DMX Splitter / Node', color: '#ffbf69', inPorts: 1, outPorts: 6 },
  { type: 'Dimmer Pack / Power Relay', color: '#cb997e', inPorts: 1, outPorts: 8 },

  // --- Power & Utilities ---
  { type: 'UPS / Power Conditioner', color: '#6b705c', inPorts: 1, outPorts: 8 },
  { type: 'PDU (Power Distribution Unit)', color: '#ddbea9', inPorts: 1, outPorts: 8 },

  // --- Blank / Custom Node ---
  { type: 'Blank Node', color: '#6c757d', inPorts: 2, outPorts: 2 }
];

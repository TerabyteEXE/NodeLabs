# Node Labs

> **Modular, node-based diagramming and schematic visualizer for A/V systems and production setups.**

[![Version](https://img.shields.io/badge/version-1.9.9--beta-blue.svg)](https://github.com/TerabyteEXE/NodeLabs/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Pages](https://img.shields.io/badge/Hosted%20on-GitHub%20Pages-blue)](https://pages.github.com/)
![GitHub contributors](https://img.shields.io/github/contributors/TerabyteEXE/NodeLabs)
![GitHub last commit](https://img.shields.io/github/last-commit/TerabyteEXE/NodeLabs)
---

## Overview

**Node Labs** is an open-source, web-based visual mapping tool designed specifically for Audio/Visual (A/V) system mapping. It provides a simple canvas to model complex production studio setups, signals, and rack setups.

Whether you are mapping out an audio mixer setup, tracking IP-based video routing, or troubleshooting your setup, Node Labs simplifies system visualization so you can resolve technical issues quickly.

---

## Key Features

* **Node-Based Cable Routing:** Connect devices with interactive bezier cable paths and visual signal flow direction(mostly for looks).
* **Granular Detail & Metadata:** Assign custom labels, IP addresses or IDs, port numbers, and custom accent colors to each device.
* **Custom Backdrop Groups:** Organize related equipment into visual zones (e.g., *Audio Rack*, *Master Control Room*, *Stage Box*).
* **Layer Management:** Hide or show entire signal paths (e.g., PC vs. Audio Path) to make it easier to understand.
* **Modular Node Library:** Easily extensible component templates for Switches, Mixers, Monitors, Speakers, Microphones, and PCs.
* **Light & Dark Themes:** Seamless UI theme toggling for low-light control rooms or bright workspace environments.
* **Local Project Persistence:** Save and load your complete schematic diagrams via lightweight JSON project files.
* **100% Free & Open-Source:** No backend required; runs directly in the browser via static hosting (GitHub Pages).

---

## Repository Structure

Structured for simplicity

```text
node-labs/
├── index.html
├── css/
│   └── styles.css
└── js/
    ├── componentLibrary.js
    └── app.js

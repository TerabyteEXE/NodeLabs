# Node Labs

> **Modular, node-based diagramming and schematic visualizer for A/V systems and production studios.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![GitHub Pages](https://img.shields.io/badge/Hosted%20on-GitHub%20Pages-blue)](https://pages.github.com/)

---

## 📸 Overview

**Node Labs** is an open-source, web-based visual mapping tool designed specifically for Audio/Visual (A/V) engineers, systems integrators, and studio designers. It provides an intuitive canvas to model complex production studio workflows, signal chains, and rack setups with precision.

Whether you are mapping out a high-channel audio mixer setup, tracking IP-based video routing, or troubleshooting signal flow across multiple zones, Node Labs simplifies system visualization so you can optimize performance and resolve technical issues quickly.

---

## ✨ Key Features

* **Node-Based Cable Routing:** Connect devices with interactive bezier cable paths and visual signal flow direction.
* **Granular Detail & Metadata:** Assign custom labels, IP addresses, port definitions, and custom accent colors to each device.
* **Custom Backdrop Groups:** Organize related equipment into visual zones (e.g., *Audio Rack*, *Master Control Room*, *Stage Box*).
* **Layer Management:** Hide or show entire signal paths (e.g., Infrastructure vs. Audio Path) to reduce canvas noise.
* **Modular Node Library:** Easily extensible component templates for Switches, Mixers, Monitors, Speakers, Microphones, and PCs.
* **Light & Dark Themes:** Seamless UI theme toggling for low-light control rooms or bright workspace environments.
* **Local Project Persistence:** Save and load your complete schematic diagrams via lightweight JSON project files.
* **100% Free & Open-Source:** No backend required; runs directly in the browser via static hosting (GitHub Pages).

---

## 📁 Repository Structure

Node Labs is structured for scalability and easy customization:

```text
node-labs/
├── index.html              # Main HTML markup entry point
├── css/
│   └── styles.css          # UI styling, themes, and CSS variables
└── js/
    ├── componentLibrary.js # Device templates & library registry
    └── app.js             # Canvas engine, state management, & cable pathing

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This file incorporates work covered by the following copyright and
 * permission notice:
 *
 *   Copyright 2019 Google LLC
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 */

// Set this to true to enable the dev dashboard layout
var dev_mode = true;

/**
 * @typedef {Object} WebRTCDemoSignalling
 * @property {function} ondebug - Callback fired when a new debug message is set.
 * @property {function} onstatus - Callback fired when a new status message is set.
 * @property {function} onerror - Callback fired when an error occurs.
 * @property {function} onice - Callback fired when a new ICE candidate is received.
 * @property {function} onsdp - Callback fired when SDP is received.
 * @property {function} connect - initiate connection to server.
 * @property {function} disconnect - close connection to server.
 */
export class WebRTCDemoSignalling {
  /**
   * Interface to WebRTC demo signalling server.
   * Protocol: https://github.com/GStreamer/gstreamer/blob/main/subprojects/gst-examples/webrtc/signalling/Protocol.md
   *
   * @constructor
   * @param {URL} [server]
   *    The URL object of the signalling server to connect to, created with `new URL()`.
   *    Signalling implementation is here:
   *      https://github.com/GStreamer/gstreamer/tree/main/subprojects/gst-examples/webrtc/signalling
   * @param {number} peerId - The peer ID for this signalling instance (1 for video, 3 for audio).
   */
  constructor(server, peerId) {
    /**
     * @private
     * @type {URL}
     */
    this._server = server;

    /**
     * @private
     * @type {number}
     */
    this.peer_id = peerId;

    /**
     * @private
     * @type {WebSocket}
     */
    this._ws_conn = null;

    /**
     * @event
     * @type {function}
     */
    this.onstatus = null;

    /**
     * @event
     * @type {function}
     */
    this.onerror = null;

    /**
     * @type {function}
     */
    this.ondebug = null;

    /**
     * @event
     * @type {function}
     */
    this.onice = null;

    /**
     * @event
     * @type {function}
     */
    this.onsdp = null;

    /**
     * @event
     * @type {function}
     */
    this.ondisconnect = null;

    /**
     * @type {string}
     */
    this.state = 'disconnected';

    /**
     * @type {number}
     */
    this.retry_count = 0;
    /**
     * @type {object}
     */
    this.webrtcInput = null;
  }

  /**
   * Sets status message.
   *
   * @private
   * @param {string} message
   */
  _setStatus(message) {
    if (this.onstatus !== null) {
      this.onstatus(message);
    }
  }

  /**
   * Sets a debug message.
   * @private
   * @param {string} message
   */
  _setDebug(message) {
    if (this.ondebug !== null) {
      this.ondebug(message);
    }
  }

  /**
   * Sets error message.
   *
   * @private
   * @param {string} message
   */
  _setError(message) {
    if (this.onerror !== null) {
      this.onerror(message);
    }
  }

  /**
   * Sets SDP
   *
   * @private
   * @param {string} message
   */
  _setSDP(sdp) {
    if (this.onsdp !== null) {
      this.onsdp(sdp);
    }
  }

  /**
   * Sets ICE
   *
   * @private
   * @param {RTCIceCandidate} icecandidate
   */
  _setICE(icecandidate) {
    if (this.onice !== null) {
      this.onice(icecandidate);
    }
  }

  /**
   * Fired whenever the signalling websocket is opened.
   * Sends the peer id to the signalling server.
   *
   * @private
   * @event
   */
  _onServerOpen() {
    const currRes = this.webrtcInput ? this.webrtcInput.getWindowResolution() : [window.innerWidth, window.innerHeight];
    const meta = {
      res: `${currRes[0]}x${currRes[1]}`,
      scale: window.devicePixelRatio,
    };
    this.state = 'connected';
    this._ws_conn.send(`HELLO ${this.peer_id} ${btoa(JSON.stringify(meta))}`);
    this._setStatus(`Registering with server, peer ID: ${this.peer_id}`);
    this.retry_count = 0;
  }

  /**
   * Fired whenever the signalling websocket emits and error.
   * Reconnects after 3 seconds.
   *
   * @private
   * @event
   */
  _onServerError() {
    this._setStatus('Connection error, retry in 3 seconds.');
    this.retry_count++;
    if (this._ws_conn.readyState === WebSocket.CLOSED) {
      setTimeout(() => {
        if (this.retry_count > 3) {
          window.location.replace(
            window.location.href.replace(window.location.pathname, '/')
          );
        } else {
          this.connect();
        }
      }, 3000);
    }
  }

  /**
   * Fired whenever a message is received from the signalling server.
   * Message types:
   *   HELLO: response from server indicating peer is registered.
   *   ERROR*: error messages from server.
   *   {"sdp": ...}: JSON SDP message
   *   {"ice": ...}: JSON ICE message
   *
   * @private
   * @event
   * @param {MessageEvent} event The event: https://developer.mozilla.org/en-US/docs/Web/API/MessageEvent
   */
  _onServerMessage(event) {
    this._setDebug(`server message: ${event.data}`);

    if (event.data === 'HELLO') {
      this._setStatus('Registered with server.');
      this._setStatus('Waiting for stream.');
      this.sendSessionRequest();
      return;
    }

    if (event.data.startsWith('ERROR')) {
      this._setStatus(`Error from server: ${event.data}`);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      if (e instanceof SyntaxError) {
        this._setError(`error parsing message as JSON: ${event.data}`);
      } else {
        this._setError(`failed to parse message: ${event.data}`);
      }
      return;
    }

    if (msg.sdp != null) {
      this._setSDP(new RTCSessionDescription(msg.sdp));
    } else if (msg.ice != null) {
      const icecandidate = new RTCIceCandidate(msg.ice);
      this._setICE(icecandidate);
    } else {
      this._setError(`unhandled JSON message: ${msg}`);
    }
  }

  /**
   * Fired whenever the signalling websocket is closed.
   * Reconnects after 1 second.
   *
   * @private
   * @event
   */
  _onServerClose() {
    if (this.state !== 'connecting') {
      this.state = 'disconnected';
      this._setError('Server closed connection.');
      if (this.ondisconnect !== null) this.ondisconnect();
    }
  }

  /**
   * Initiates the connection to the signalling server.
   * After this is called, a series of handshakes occurs between the signalling
   * server and the server (peer) to negotiate ICE candidates and media capabilities.
   */
  connect() {
    this.state = 'connecting';
    this._setStatus('Connecting to server.');

    this._ws_conn = new WebSocket(this._server.href);

    this._ws_conn.addEventListener('open', this._onServerOpen.bind(this));
    this._ws_conn.addEventListener('error', this._onServerError.bind(this));
    this._ws_conn.addEventListener('message', this._onServerMessage.bind(this));
    this._ws_conn.addEventListener('close', this._onServerClose.bind(this));
  }

  /**
   * Closes connection to signalling server.
   * Triggers onServerClose event.
   */
  disconnect() {
    if (this._ws_conn) {
      this._ws_conn.close();
    }
  }

  /**
   * Send ICE candidate.
   *
   * @param {RTCIceCandidate} ice
   */
  sendICE(ice) {
    if (this._ws_conn && this._ws_conn.readyState === WebSocket.OPEN) {
      this._setDebug(`sending ice candidate: ${JSON.stringify(ice)}`);
      this._ws_conn.send(JSON.stringify({ ice }));
    } else {
       console.warn("Websocket not open, cannot send ICE candidate.");
    }
  }

  /**
   * Send local session description.
   *
   * @param {RTCSessionDescription} sdp
   */
  sendSDP(sdp) {
     if (this._ws_conn && this._ws_conn.readyState === WebSocket.OPEN) {
        this._setDebug(`sending local sdp: ${JSON.stringify(sdp)}`);
        this._ws_conn.send(JSON.stringify({ sdp }));
     } else {
        console.warn("Websocket not open, cannot send SDP.");
     }
  }

  /**
   * Send SESSION request to the server to initiate WebRTC session.
   * @private
   */
  sendSessionRequest() {
     if (this._ws_conn && this._ws_conn.readyState === WebSocket.OPEN) {
        this._setDebug(
          `Sending SESSION request to server, peer ID: ${this.peer_id}`
        );
        this._ws_conn.send(`SESSION ${this.peer_id}`);
     } else {
        console.warn("Websocket not open, cannot send SESSION request.");
     }
  }

  /**
   * Sets the webrtc input object
   * @param {object} input - The webrtc.input object.
   */
  setInput(input) {
    this.webrtcInput = input;
  }
}

import { GamepadManager } from './lib/gamepad.js';
import { Input } from './lib/input.js';
import { WebRTCDemo } from './lib/webrtc.js';

let webrtc;
let audio_webrtc;
let signalling;
let audio_signalling;
let decoder;
let decoderAudio;
let canvas = null;
let canvasContext = null;
let websocket;
let clientMode = null;
let videoConnected = '';
let audioConnected = '';
let audioContext;
let audioWorkletNode;
let audioWorkletProcessorPort;
const audioBufferQueue = [];
window.currentAudioBufferSize = 0;

/** @type {VideoFrame[]} */
let videoFrameBuffer = [];
let videoBufferSize = 0;
let videoBufferSelectElement;
let videoBufferDivElement;
let serverClipboardTextareaElement;
let serverClipboardContent = '';

// --- NEW --- State variables for pipeline status (used by UI and logic)
let isVideoPipelineActive = true; // Assume active on start
let isAudioPipelineActive = true; // Assume active on start
// --- END NEW ---

// Interval ID for sending client metrics
let metricsIntervalId = null;
const METRICS_INTERVAL_MS = 100;

window.onload = () => {
  'use strict';
};

function getCookieValue(name) {
  const b = document.cookie.match(`(^|[^;]+)\\s*${name}\\s*=\\s*([^;]+)`);
  return b ? b.pop() : '';
}

const appName =
  window.location.pathname.endsWith('/') &&
  window.location.pathname.split('/')[1] || 'webrtc';
let videoBitRate = 8000;
let videoFramerate = 60;
let audioBitRate = 128;
let showStart = true;
const logEntries = [];
const debugEntries = [];
let status = 'connecting';
let loadingText = '';
const gamepad = {
  gamepadState: 'disconnected',
  gamepadName: 'none',
};
const connectionStat = {
  connectionStatType: 'unknown',
  connectionLatency: 0,
  connectionVideoLatency: 0,
  connectionAudioLatency: 0,
  connectionAudioCodecName: 'NA',
  connectionAudioBitrate: 0,
  connectionPacketsReceived: 0,
  connectionPacketsLost: 0,
  connectionBytesReceived: 0,
  connectionBytesSent: 0,
  connectionCodec: 'unknown',
  connectionVideoDecoder: 'unknown',
  connectionResolution: '',
  connectionFrameRate: 0,
  connectionVideoBitrate: 0,
  connectionAvailableBandwidth: 0,
};
const gpuStat = {
  gpuLoad: 0,
  gpuMemoryTotal: 0,
  gpuMemoryUsed: 0,
};
const cpuStat = {
  serverCPUUsage: 0,
  serverMemoryTotal: 0,
  serverMemoryUsed: 0,
};
let serverLatency = 0;
let resizeRemote = true;
let scaleLocal = false;
let debug = false;
let turnSwitch = false;
let publishingAllowed = false;
let publishingIdle = false;
let publishingError = '';
let publishingAppName = '';
let publishingAppDisplayName = '';
let publishingAppDescription = '';
let publishingAppIcon = '';
let publishingValid = false;
let streamStarted = false;
let inputInitialized = false;

window.fps = 0;
let frameCount = 0;
let lastFpsUpdateTime = performance.now();

let statusDisplayElement;
let videoElement;
let audioElement;
let playButtonElement;
let spinnerElement;
let overlayInput;
let videoBitrateSelectElement;
let audioBitrateSelectElement;
let encoderSelectElement;
let framerateSelectElement;
let systemStatsDivElement;
let gpuStatsDivElement;
let fpsCounterDivElement;
let audioBufferDivElement;
// --- NEW --- References to the new toggle buttons
let videoToggleButtonElement;
let audioToggleButtonElement;
// --- END NEW ---


const getIntParam = (key, default_value) => {
  const prefixedKey = `${appName}_${key}`;
  return parseInt(window.localStorage.getItem(prefixedKey)) || default_value;
};

const setIntParam = (key, value) => {
  if (value === null) return;
  const prefixedKey = `${appName}_${key}`;
  window.localStorage.setItem(prefixedKey, value.toString());
};

const getBoolParam = (key, default_value) => {
  const prefixedKey = `${appName}_${key}`;
  const v = window.localStorage.getItem(prefixedKey);
  if (v === null) {
    return default_value;
  }
  return v.toString().toLowerCase() === 'true';
};

const setBoolParam = (key, value) => {
  if (value === null) return;
  const prefixedKey = `${appName}_${key}`;
  window.localStorage.setItem(prefixedKey, value.toString());
};

const getStringParam = (key, default_value) => {
  const prefixedKey = `${appName}_${key}`;
  return window.localStorage.getItem(prefixedKey) || default_value;
};

const setStringParam = (key, value) => {
  if (value === null) return;
  const prefixedKey = `${appName}_${key}`;
  window.localStorage.setItem(prefixedKey, value.toString());
};


const getUsername = () => getCookieValue(`broker_${appName}`)?.split('#')[0] || 'webrtc';


const enterFullscreen = () => {
  if (
    clientMode === 'webrtc' &&
    webrtc &&
    'input' in webrtc &&
    'enterFullscreen' in webrtc.input
  ) {
    webrtc.input.enterFullscreen();
  }
};

const playStream = () => {
  if (clientMode === 'webrtc') {
    webrtc.playStream();
    audio_webrtc.playStream();
  }
  showStart = false;
  playButtonElement.classList.add('hidden');
  statusDisplayElement.classList.add('hidden');
  spinnerElement.classList.add('hidden');
};

const enableClipboard = () => {
  navigator.clipboard
    .readText()
    .then((text) => {
      webrtc._setStatus('clipboard enabled');
      webrtc.sendDataChannelMessage('cr');
    })
    .catch((err) => {
      if (clientMode === 'webrtc') {
        webrtc._setError(`Failed to read clipboard contents: ${err}`);
      } else if (clientMode === 'websockets') {
        console.error(`Failed to read clipboard contents: ${err}`);
      }
    });
};

const publish = () => {
  const data = {
    name: publishingAppName,
    displayName: publishingAppDisplayName,
    description: publishingAppDescription,
    icon: publishingAppIcon,
  };

  fetch(`./publish/${appName}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(data),
  })
    .then((response) => response.json())
    .then((response) => {
      if (response.code === 201) {
        publishingIdle = false;
        checkPublishing();
      } else {
        publishingError = response.status;
        updatePublishingErrorDisplay();
      }
    });
};

const updateStatusDisplay = () => {
  statusDisplayElement.textContent = loadingText;
};

const appendLogEntry = (message) => {
  logEntries.push(applyTimestamp(`[signalling] ${message}`));
  updateLogOutput();
};

const appendLogError = (message) => {
  logEntries.push(applyTimestamp(`[signalling] [ERROR] ${message}`));
  updateLogOutput();
};

const appendDebugEntry = (message) => {
  debugEntries.push(`[signalling] ${message}`);
  updateDebugOutput();
};

const updateLogOutput = () => {
};

const updateDebugOutput = () => {
};

const updatePublishingErrorDisplay = () => {
};

const roundDownToEven = (num) => {
    return Math.floor(num / 2) * 2;
};


const injectCSS = () => {
  const style = document.createElement('style');
  style.textContent = `
body {
  font-family: sans-serif;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #000;
  color: #fff;
}
#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
}

/* DEV MODE LAYOUT */
#app.dev-mode {
  flex-direction: row;
}

/* Container for video, canvas, input, etc. */
.video-container {
  flex-grow: 1;
  flex-shrink: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
}

/* Ensure video, canvas, input take 100% of their container */
.video-container video,
.video-container canvas,
.video-container #overlayInput {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

/* Specific video rules */
.video-container video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* Canvas is typically drawn over the video */
.video-container #videoCanvas {
    z-index: 2;
    pointer-events: none;
    display: block;
}

/* Overlay input for capturing events */
.video-container #overlayInput {
    opacity: 0;
    z-index: 3;
    caret-color: transparent;
    background-color: transparent;
    color: transparent;
    pointer-events: auto;
    -webkit-user-select: none;
    border: none;
    outline: none;
    padding: 0;
    margin: 0;
}

/* Absolute positioning for spinner and play button within video-container */
.video-container .spinner-container,
.video-container #playButton {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
}

.spinner-container {
  width: 2rem;
  height: 2rem;
  border: 0.25rem solid #ffc000;
  border-bottom: 0.25rem solid rgba(255,255,255,0);
  border-radius: 50%;
  -webkit-animation: spin 1s linear infinite;
  animation: spin 1s linear infinite;
  background-color: #000;
}
.spinner--hidden {
  display: none;
}
@-webkit-keyframes spin {
  to {
    -webkit-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}
@keyframes spin {
  to {
    -webkit-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}

.hidden {
  display: none !important;
}

/* Status bar positioning */
.video-container .status-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 5px;
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  text-align: center;
  z-index: 5;
}

#playButton {
  padding: 15px 30px;
  font-size: 1.5em;
  cursor: pointer;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  backdrop-filter: blur(5px);
}

/* DEV SIDEBAR STYLES */
#dev-sidebar {
  /* Default: hidden in non-dev mode */
  display: none;
}

#app.dev-mode #dev-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 300px;
  height: 100vh;
  background-color: #2e2e2e;
  color: #eee;
  padding: 10px;
  box-sizing: border-box;
  overflow-y: auto;
  gap: 10px; /* Add gap between items */
}

#dev-sidebar button {
    margin-bottom: 10px;
    padding: 8px;
    cursor: pointer;
    background-color: #444;
    color: white;
    border: 1px solid #555;
    border-radius: 3px;
    width: 100%;
    box-sizing: border-box;
    transition: background-color 0.2s ease; /* Smooth transition */
}
#dev-sidebar button:hover {
    background-color: #555;
}
/* --- NEW --- Styles for active/inactive toggle buttons */
#dev-sidebar button.toggle-button.active {
    background-color: #3a8d3a; /* Green for active */
    border-color: #5cb85c;
}
#dev-sidebar button.toggle-button.active:hover {
    background-color: #4cae4c;
}
#dev-sidebar button.toggle-button.inactive {
    background-color: #c9302c; /* Red for inactive */
    border-color: #d43f3a;
}
#dev-sidebar button.toggle-button.inactive:hover {
    background-color: #d9534f;
}
/* --- END NEW --- */

.dev-setting-item {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
}

.dev-setting-item label {
    margin-bottom: 5px;
    font-size: 0.9em;
    color: #bbb;
}

.dev-setting-item select {
    padding: 5px;
    background-color: #333;
    color: #eee;
    border: 1px solid #555;
    border-radius: 3px;
    font-size: 1em;
    width: 100%;
    box-sizing: border-box;
}

.dev-stats-item {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
    border: 1px solid #555;
    padding: 8px;
    background-color: #333;
    font-family: monospace;
    font-size: 0.8em;
    white-space: pre-wrap;
    word-break: break-all;
}

.dev-stats-item label {
    margin-bottom: 5px;
    font-size: 0.9em;
    color: #bbb;
    font-family: sans-serif;
}

/* --- New Dev Sidebar Clipboard Styles --- */
.dev-clipboard-item {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
}

.dev-clipboard-item label {
    margin-bottom: 5px;
    font-size: 0.9em;
    color: #bbb;
}

.dev-clipboard-item textarea {
    padding: 5px;
    background-color: #333;
    color: #eee;
    border: 1px solid #555;
    border-radius: 3px;
    font-size: 0.9em;
    width: 100%;
    box-sizing: border-box;
    min-height: 80px; /* Give it some initial height */
    resize: vertical; /* Allow vertical resize */
    font-family: monospace; /* Use monospace for text content */
}
/* ----------------------------------------- */
  `;
  document.head.appendChild(style);

};

// --- NEW --- Helper function to update toggle button appearance
function updateToggleButtonAppearance(buttonElement, isActive) {
    if (!buttonElement) return;
    if (isActive) {
        buttonElement.textContent = buttonElement.id === 'videoToggleBtn' ? 'Video: ON' : 'Audio: ON';
        buttonElement.classList.remove('inactive');
        buttonElement.classList.add('active');
    } else {
        buttonElement.textContent = buttonElement.id === 'videoToggleBtn' ? 'Video: OFF' : 'Audio: OFF';
        buttonElement.classList.remove('active');
        buttonElement.classList.add('inactive');
    }
}
// --- END NEW ---

const initializeUI = () => {
  injectCSS();

  document.title = `Selkies - ${appName}`;

  const appDiv = document.getElementById('app');
  if (!appDiv) {
      console.error("FATAL: Could not find #app element.");
      return;
  }
  if (dev_mode) {
      appDiv.classList.add('dev-mode');
  }

  const videoContainer = document.createElement('div');
  videoContainer.className = 'video-container';

  statusDisplayElement = document.createElement('div');
  statusDisplayElement.id = 'status-display';
  statusDisplayElement.className = 'status-bar';
  statusDisplayElement.textContent = 'Connecting...';
  statusDisplayElement.classList.toggle('hidden', !showStart);
  videoContainer.appendChild(statusDisplayElement);

  overlayInput = document.createElement('input');
  overlayInput.type = 'text';
  overlayInput.readOnly = true;
  overlayInput.id = 'overlayInput';
  videoContainer.appendChild(overlayInput);

  videoElement = document.createElement('video');
  videoElement.id = 'stream';
  videoElement.className = 'video';
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.contentEditable = 'true';
  videoContainer.appendChild(videoElement);

  canvas = document.getElementById('videoCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'videoCanvas';
  }
  videoContainer.appendChild(canvas);
  canvasContext = canvas.getContext('2d');
  if (!canvasContext) {
    console.error('Failed to get 2D rendering context');
  }

  audioElement = document.createElement('audio');
  audioElement.id = 'audio_stream';
  audioElement.style.display = 'none';
  audioElement.autoplay = true;
  audioElement.playsInline = true;
  videoContainer.appendChild(audioElement);

  spinnerElement = document.createElement('div');
  spinnerElement.id = 'spinner';
  spinnerElement.className = 'spinner-container';
  spinnerElement.classList.toggle('hidden', showStart);
  videoContainer.appendChild(spinnerElement);

  playButtonElement = document.createElement('button');
  playButtonElement.id = 'playButton';
  playButtonElement.textContent = 'Play Stream';
  playButtonElement.classList.toggle('hidden', !showStart);
  videoContainer.appendChild(playButtonElement);

  const sidebarDiv = document.createElement('div');
  sidebarDiv.id = 'dev-sidebar';

  if (dev_mode) {
    // --- NEW: Add Video/Audio Toggle Buttons ---
    videoToggleButtonElement = document.createElement('button');
    videoToggleButtonElement.id = 'videoToggleBtn';
    videoToggleButtonElement.className = 'toggle-button'; // Add class for styling
    updateToggleButtonAppearance(videoToggleButtonElement, isVideoPipelineActive); // Set initial state
    sidebarDiv.appendChild(videoToggleButtonElement);

    videoToggleButtonElement.addEventListener('click', () => {
        if (clientMode !== 'websockets') return; // Only work in websockets mode
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const newState = !isVideoPipelineActive; // Toggle the desired state
            const message = newState ? 'START_VIDEO' : 'STOP_VIDEO';
            console.log(`Dev Sidebar: Sending ${message} via websocket.`);
            websocket.send(message);
            // Optimistically update state and UI, will be corrected by postMessage if needed
            isVideoPipelineActive = newState;
            updateToggleButtonAppearance(videoToggleButtonElement, isVideoPipelineActive);
            // Send message to self to potentially update other parts if needed (or rely on server confirmation)
            window.postMessage({ type: 'pipelineStatusUpdate', video: isVideoPipelineActive, audio: isAudioPipelineActive }, window.location.origin);
        } else {
            console.warn('Websocket not open, cannot send video toggle command.');
        }
    });

    audioToggleButtonElement = document.createElement('button');
    audioToggleButtonElement.id = 'audioToggleBtn';
    audioToggleButtonElement.className = 'toggle-button'; // Add class for styling
    updateToggleButtonAppearance(audioToggleButtonElement, isAudioPipelineActive); // Set initial state
    sidebarDiv.appendChild(audioToggleButtonElement);

    audioToggleButtonElement.addEventListener('click', () => {
        if (clientMode !== 'websockets') return; // Only work in websockets mode
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const newState = !isAudioPipelineActive; // Toggle the desired state
            const message = newState ? 'START_AUDIO' : 'STOP_AUDIO';
            console.log(`Dev Sidebar: Sending ${message} via websocket.`);
            websocket.send(message);
            // Optimistically update state and UI
            isAudioPipelineActive = newState;
            updateToggleButtonAppearance(audioToggleButtonElement, isAudioPipelineActive);
             // Send message to self
            window.postMessage({ type: 'pipelineStatusUpdate', video: isVideoPipelineActive, audio: isAudioPipelineActive }, window.location.origin);
        } else {
            console.warn('Websocket not open, cannot send audio toggle command.');
        }
    });
    // --- END NEW ---


    const encoderContainer = document.createElement('div');
    encoderContainer.className = 'dev-setting-item';

    const encoderLabel = document.createElement('label');
    encoderLabel.textContent = 'Encoder:';
    encoderLabel.htmlFor = 'encoderSelect';
    encoderContainer.appendChild(encoderLabel);

    encoderSelectElement = document.createElement('select');
    encoderSelectElement.id = 'encoderSelect';

    const encoders = [
        'x264enc',
        'nvh264enc',
        'vah264enc',
        'openh264enc'
    ];

    encoders.forEach(encoder => {
        const option = document.createElement('option');
        option.value = encoder;
        option.textContent = encoder;
        encoderSelectElement.appendChild(option);
    });

    encoderContainer.appendChild(encoderSelectElement);
    sidebarDiv.appendChild(encoderContainer);

    // MODIFIED: Send setting via window.postMessage
    encoderSelectElement.addEventListener('change', (event) => {
        const selectedEncoder = event.target.value;
        console.log(`Dev Sidebar: Encoder selected: ${selectedEncoder}. Sending via window.postMessage.`);
        window.postMessage({ type: 'settings', settings: { encoder: selectedEncoder } }, window.location.origin);
    });

    const framerateContainer = document.createElement('div');
    framerateContainer.className = 'dev-setting-item';

    const framerateLabel = document.createElement('label');
    framerateLabel.textContent = 'Frames per second:';
    framerateLabel.htmlFor = 'framerateSelect';
    framerateContainer.appendChild(framerateLabel);

    framerateSelectElement = document.createElement('select');
    framerateSelectElement.id = 'framerateSelect';

    const framerates = [
        8, 12, 15, 24, 25, 30, 48, 50, 60, 90, 100, 120, 144
    ];

    framerates.forEach(rate => {
        const option = document.createElement('option');
        option.value = rate.toString();
        option.textContent = `${rate} FPS`;
        framerateSelectElement.appendChild(option);
    });

    framerateContainer.appendChild(framerateSelectElement);
    sidebarDiv.appendChild(framerateContainer);

    // MODIFIED: Send setting via window.postMessage
    framerateSelectElement.addEventListener('change', (event) => {
        const selectedFramerate = parseInt(event.target.value, 10);
        if (!isNaN(selectedFramerate)) {
            console.log(`Dev Sidebar: Framerate selected: ${selectedFramerate}. Sending via window.postMessage.`);
            window.postMessage({ type: 'settings', settings: { videoFramerate: selectedFramerate } }, window.location.origin);
        }
    });

    const bitrateContainer = document.createElement('div');
    bitrateContainer.className = 'dev-setting-item';

    const bitrateLabel = document.createElement('label');
    bitrateLabel.textContent = 'Video Bitrate (KBs):';
    bitrateLabel.htmlFor = 'videoBitrateSelect';
    bitrateContainer.appendChild(bitrateLabel);

    videoBitrateSelectElement = document.createElement('select');
    videoBitrateSelectElement.id = 'videoBitrateSelect';

    const bitrates = [
        1000, 2000, 4000, 8000, 10000, 12000, 14000, 16000, 18000, 20000,
        25000, 30000, 35000, 40000, 45000, 50000,
        60000, 70000, 80000, 90000, 100000
    ];

    bitrates.forEach(bitrate => {
        const option = document.createElement('option');
        option.value = bitrate.toString();
        option.textContent = `${bitrate} KBs`;
        videoBitrateSelectElement.appendChild(option);
    });

    bitrateContainer.appendChild(videoBitrateSelectElement);
    sidebarDiv.appendChild(bitrateContainer);

    // MODIFIED: Send setting via window.postMessage
    videoBitrateSelectElement.addEventListener('change', (event) => {
        const selectedBitrate = parseInt(event.target.value, 10);
        if (!isNaN(selectedBitrate)) {
            console.log(`Dev Sidebar: Video Bitrate selected: ${selectedBitrate}. Sending via window.postMessage.`);
            window.postMessage({ type: 'settings', settings: { videoBitRate: selectedBitrate } }, window.location.origin);
        }
    });

    const audioBitrateContainer = document.createElement('div');
    audioBitrateContainer.className = 'dev-setting-item';

    const audioBitrateLabel = document.createElement('label');
    audioBitrateLabel.textContent = 'Audio Bitrate (kbit/s):';
    audioBitrateLabel.htmlFor = 'audioBitrateSelect';
    audioBitrateContainer.appendChild(audioBitrateLabel);

    audioBitrateSelectElement = document.createElement('select');
    audioBitrateSelectElement.id = 'audioBitrateSelect';

    const audioBitrates = [
        32000, 64000, 96000, 128000, 192000, 256000, 320000, 512000
    ];

    audioBitrates.forEach(bitrate => {
        const option = document.createElement('option');
        option.value = bitrate.toString();
        option.textContent = `${bitrate} kbit/s`;
        audioBitrateSelectElement.appendChild(option);
    });

    audioBitrateContainer.appendChild(audioBitrateSelectElement);
    sidebarDiv.appendChild(audioBitrateContainer);

    // MODIFIED: Send setting via window.postMessage
    audioBitrateSelectElement.addEventListener('change', (event) => {
        const selectedBitrate = parseInt(event.target.value, 10);
        if (!isNaN(selectedBitrate)) {
            console.log(`Dev Sidebar: Audio Bitrate selected: ${selectedBitrate}. Sending via window.postMessage.`);
            window.postMessage({ type: 'settings', settings: { audioBitRate: selectedBitrate } }, window.location.origin);
        }
    });

    const videoBufferContainer = document.createElement('div');
    videoBufferContainer.className = 'dev-setting-item';

    const videoBufferLabel = document.createElement('label');
    videoBufferLabel.textContent = 'Video Buffer Size (frames):';
    videoBufferLabel.htmlFor = 'videoBufferSelect';
    videoBufferContainer.appendChild(videoBufferLabel);

    videoBufferSelectElement = document.createElement('select');
    videoBufferSelectElement.id = 'videoBufferSelect';

    for (let i = 0; i <= 15; i++) {
        const option = document.createElement('option');
        option.value = i.toString();
        option.textContent = i === 0 ? '0 (Immediate)' : `${i} frames`;
        videoBufferSelectElement.appendChild(option);
    }

    videoBufferContainer.appendChild(videoBufferSelectElement);
    sidebarDiv.appendChild(videoBufferContainer);

    // NOTE: videoBufferSize is a client-side rendering/buffering setting,
    //       not a server setting. It doesn't need to be sent to the server.
    //       We keep the original logic of updating local state and localStorage.
    videoBufferSelectElement.addEventListener('change', (event) => {
        const selectedSize = parseInt(event.target.value, 10);
        if (!isNaN(selectedSize)) {
            videoBufferSize = selectedSize;
            setIntParam('videoBufferSize', videoBufferSize);
            console.log(`Dev Sidebar: Video buffer size set to ${videoBufferSize} frames via UI`);
        }
    });

    // --- New Clipboard Text Area in Dev Sidebar ---
    const clipboardContainer = document.createElement('div');
    clipboardContainer.className = 'dev-clipboard-item';

    const clipboardLabel = document.createElement('label');
    clipboardLabel.textContent = 'Server Clipboard:';
    clipboardLabel.htmlFor = 'serverClipboardTextarea';
    clipboardContainer.appendChild(clipboardLabel);

    serverClipboardTextareaElement = document.createElement('textarea');
    serverClipboardTextareaElement.id = 'serverClipboardTextarea';
    serverClipboardTextareaElement.value = serverClipboardContent; // Set initial value

    // Add event listener to detect changes and post message back
    serverClipboardTextareaElement.addEventListener('blur', (event) => {
        const newClipboardText = event.target.value;
        console.log(`Dev Sidebar: Clipboard text changed (blur). Sending via window.postMessage.`);
        // Send the updated text back to the main script's message handler
        window.postMessage({ type: 'clipboardUpdateFromUI', text: newClipboardText }, window.location.origin);
    });
    // Consider using 'input' with debounce for more reactive updates if needed
    // serverClipboardTextareaElement.addEventListener('input', debounce((event) => { ... }, 500));


    clipboardContainer.appendChild(serverClipboardTextareaElement);
    sidebarDiv.appendChild(clipboardContainer);
    // --------------------------------------------------


    const systemStatsLabel = document.createElement('label');
    systemStatsLabel.textContent = 'System Stats:';
    sidebarDiv.appendChild(systemStatsLabel);

    systemStatsDivElement = document.createElement('div');
    systemStatsDivElement.id = 'system-stats-div';
    systemStatsDivElement.className = 'dev-stats-item';
    systemStatsDivElement.textContent = 'Waiting for data...';
    sidebarDiv.appendChild(systemStatsDivElement);

    const gpuStatsLabel = document.createElement('label');
    gpuStatsLabel.textContent = 'GPU Stats:';
    sidebarDiv.appendChild(gpuStatsLabel);

    gpuStatsDivElement = document.createElement('div');
    gpuStatsDivElement.id = 'gpu-stats-div';
    gpuStatsDivElement.className = 'dev-stats-item';
    gpuStatsDivElement.textContent = 'Waiting for data...';
    sidebarDiv.appendChild(gpuStatsDivElement);

    const fpsLabel = document.createElement('label');
    fpsLabel.textContent = 'Client FPS:';
    sidebarDiv.appendChild(fpsLabel);

    fpsCounterDivElement = document.createElement('div');
    fpsCounterDivElement.id = 'fps-counter-div';
    fpsCounterDivElement.className = 'dev-stats-item';
    fpsCounterDivElement.textContent = `FPS: ${window.fps}`;
    sidebarDiv.appendChild(fpsCounterDivElement);

    const audioBufferLabel = document.createElement('label');
    audioBufferLabel.textContent = 'Audio Buffer Size (buffers):';
    sidebarDiv.appendChild(audioBufferLabel);

    audioBufferDivElement = document.createElement('div');
    audioBufferDivElement.id = 'audio-buffer-div';
    audioBufferDivElement.className = 'dev-stats-item';
    audioBufferDivElement.textContent = `Audio Buffer: ${window.currentAudioBufferSize}`;
    sidebarDiv.appendChild(audioBufferDivElement);

    const videoBufferDisplayLabel = document.createElement('label');
    videoBufferDisplayLabel.textContent = 'Video Buffer Size (current):';
    sidebarDiv.appendChild(videoBufferDisplayLabel);

    videoBufferDivElement = document.createElement('div');
    videoBufferDivElement.id = 'video-buffer-div';
    videoBufferDivElement.className = 'dev-stats-item';
    videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames`;
    sidebarDiv.appendChild(videoBufferDivElement);

  }

  appDiv.appendChild(videoContainer);

  if (dev_mode) {
    appDiv.appendChild(sidebarDiv);
  }

  // Load initial settings from localStorage
  videoBitRate = getIntParam('videoBitRate', videoBitRate);
  videoFramerate = getIntParam('videoFramerate', videoFramerate);
  audioBitRate = getIntParam('audioBitRate', audioBitRate);
  resizeRemote = getBoolParam('resizeRemote', resizeRemote);
  scaleLocal = getBoolParam('scaleLocal', scaleLocal);
  debug = getBoolParam('debug', debug);
  turnSwitch = getBoolParam('turnSwitch', turnSwitch);
  videoBufferSize = getIntParam('videoBufferSize', 0);


  videoElement.classList.toggle('scale', scaleLocal);


  updateStatusDisplay();
  updateLogOutput();
  updateDebugOutput();
  updatePublishingErrorDisplay();

  playButtonElement.addEventListener('click', playStream);
  if (clientMode === 'websockets') {
    playButtonElement.classList.add('hidden');
    statusDisplayElement.classList.remove('hidden');
    spinnerElement.classList.remove('hidden');
  }
}; // Removed the problematic semicolon here


const startStream = () => {
  if (streamStarted) return;
  streamStarted = true;
  spinnerElement.classList.add('hidden');
  statusDisplayElement.classList.add('hidden');
  playButtonElement.classList.add('hidden');
};

function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

const initializeInput = () => {
  if (inputInitialized) {
    return;
  }
  inputInitialized = true;

  let inputInstance;

  const websocketSendInput = (message) => {
    if (
      clientMode === 'websockets' &&
      websocket &&
      websocket.readyState === WebSocket.OPEN
    ) {
      websocket.send(message);
    }
  };

  const webrtcSendInput = (message) => {
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(message);
    }
  };

  let sendInputFunction;
  if (clientMode === 'websockets') {
    sendInputFunction = websocketSendInput;
  } else if (clientMode === 'webrtc') {
    sendInputFunction = webrtcSendInput;
  } else {
    sendInputFunction = () => {};
  }

  inputInstance = new Input(overlayInput, sendInputFunction);

  inputInstance.getWindowResolution = () => {
     const videoContainer = document.querySelector('.video-container');
     if (!videoContainer) {
          console.warn('video-container not found, using window size for resolution.');
          return [roundDownToEven(window.innerWidth), roundDownToEven(window.innerHeight)];
     }
     const videoContainerRect = videoContainer.getBoundingClientRect();
     const evenWidth = roundDownToEven(videoContainerRect.width);
     const evenHeight = roundDownToEven(videoContainerRect.height);
     return [evenWidth, evenHeight];
  };


  inputInstance.ongamepadconnected = (gamepad_id) => {
    gamepad.gamepadState = 'connected';
    gamepad.gamepadName = gamepad_id;
  };

  inputInstance.ongamepaddisconnected = () => {
    gamepad.gamepadState = 'disconnected';
    gamepad.gamepadName = 'none';
  };
  inputInstance.attach();

  const handleResizeUI = () => {
    const windowResolution = inputInstance.getWindowResolution();
    const newRes = `${windowResolution[0]}x${windowResolution[1]}`;

    if (canvas) {
      // Existing canvas resize logic would go here if needed, but it's handled in paintVideoFrame
    }

    if (clientMode === 'webrtc') {
      webrtcSendInput(`r,${newRes}`);
      webrtcSendInput(`s,${window.devicePixelRatio}`);
    } else if (clientMode === 'websockets') {
      websocketSendInput(`r,${newRes}`);
      websocketSendInput(`s,${window.devicePixelRatio}`);
    }
  };

  const debouncedHandleResizeUI = debounce(handleResizeUI, 1000);
  window.addEventListener('resize', debouncedHandleResizeUI);

  handleResizeUI();

  if (clientMode === 'webrtc') {
    if (webrtc) {
      webrtc.input = inputInstance;
    }
  }

  window.webrtcInput = inputInstance;
};


window.addEventListener('message', receiveMessage, false);

function receiveMessage(event) {
  if (event.origin !== window.location.origin) {
    console.warn(`Received message from unexpected origin: ${event.origin}`);
    return;
  }

  const message = event.data;
  if (typeof message === 'object' && message !== null) {
    if (message.type === 'settings') {
      console.log('Received settings message via window.postMessage:', message.settings);
      handleSettingsMessage(message.settings);
    } else if (message.type === 'getStats') {
      console.log('Received getStats message via window.postMessage.');
      sendStatsMessage();
    } else if (message.type === 'clipboardUpdateFromUI') {
      // --- Handle clipboard update from the UI text area ---
      console.log('Received clipboardUpdateFromUI message via window.postMessage.');
      const newClipboardText = message.text;

      if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
          try {
              const encodedText = btoa(newClipboardText);
               // Use the same message format as the seamless clipboard logic
              const clipboardMessage = `cw,${encodedText}`;
              websocket.send(clipboardMessage);
              console.log(`Sent clipboard update from UI to server via websocket: ${clipboardMessage}`);
          } catch (e) {
              console.error('Failed to encode or send clipboard text from UI:', e);
          }
      } else {
          console.warn('Cannot send clipboard update from UI: Not in websockets mode or websocket not open.');
      }
      // --- End clipboard update handling ---
    }
    // --- NEW --- Handle pipeline status updates
    else if (message.type === 'pipelineStatusUpdate') {
        console.log('Received pipelineStatusUpdate message via window.postMessage:', message);
        if (message.video !== undefined) {
            isVideoPipelineActive = message.video;
            if (dev_mode) {
                updateToggleButtonAppearance(videoToggleButtonElement, isVideoPipelineActive);
            }
        }
        if (message.audio !== undefined) {
            isAudioPipelineActive = message.audio;
             if (dev_mode) {
                updateToggleButtonAppearance(audioToggleButtonElement, isAudioPipelineActive);
            }
        }
    }
    // --- END NEW ---
    else {
      console.warn('Received unknown message type via window.postMessage:', message.type, message);
    }
  } else {
     console.warn('Received non-object message via window.postMessage:', message);
  }
}

function handleSettingsMessage(settings) {
  // This function now processes settings received from *any* source
  // (including the dev sidebar via window.postMessage).
  // It updates local state, localStorage, the UI (if dev_mode),
  // and sends the command to the server via the appropriate channel.

  console.log('Applying settings:', settings);

  if (settings.videoBitRate !== undefined) {
    videoBitRate = parseInt(settings.videoBitRate);
    setIntParam('videoBitRate', videoBitRate); // Save to localStorage

    // Update UI dropdown if in dev mode
    if (dev_mode && videoBitrateSelectElement) {
         videoBitrateSelectElement.value = videoBitRate.toString();
         let optionExists = false;
         for (let i = 0; i < videoBitrateSelectElement.options.length; i++) {
             if (videoBitrateSelectElement.options[i].value === videoBitRate.toString()) {
                 optionExists = true;
                 break;
             }
         }
         // Add option if it doesn't exist (e.g., custom value from external source)
         if (!optionExists) {
             console.warn(`Received video bitrate ${videoBitRate} kbit/s from settings is not in dropdown options. Adding it.`);
             const option = document.createElement('option');
             option.value = videoBitRate.toString();
             option.textContent = `${videoBitRate} kbit/s (custom)`;
             videoBitrateSelectElement.insertBefore(option, videoBitrateSelectElement.firstChild);
             videoBitrateSelectElement.value = videoBitRate.toString(); // Ensure the new option is selected
         }
    }

    // Send to server
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(`vb,${videoBitRate}`);
       console.log(`Sent video bitrate ${videoBitRate} kbit/s to server via DataChannel.`);
    } else if (clientMode === 'websockets') {
       if (websocket && websocket.readyState === WebSocket.OPEN) {
            const message = `SET_VIDEO_BITRATE,${videoBitRate}`;
            console.log(`Sent websocket message: ${message}`);
            websocket.send(message);
       } else {
           console.warn("Websocket connection not open, cannot send video bitrate setting.");
       }
    }
  }

  if (settings.videoFramerate !== undefined) {
    videoFramerate = parseInt(settings.videoFramerate);
    setIntParam('videoFramerate', videoFramerate); // Save to localStorage

     // Update UI dropdown if in dev mode
    if (dev_mode && framerateSelectElement) {
        framerateSelectElement.value = videoFramerate.toString();
         let optionExists = false;
         for (let i = 0; i < framerateSelectElement.options.length; i++) {
             if (framerateSelectElement.options[i].value === videoFramerate.toString()) {
                 optionExists = true;
                 break;
             }
         }
         // Add option if it doesn't exist
         if (!optionExists) {
             console.warn(`Received video framerate ${videoFramerate} FPS from settings is not in dropdown options. Adding it.`);
             const option = document.createElement('option');
             option.value = videoFramerate.toString();
             option.textContent = `${videoFramerate} FPS (custom)`;
             framerateSelectElement.insertBefore(option, framerateSelectElement.firstChild);
             framerateSelectElement.value = videoFramerate.toString(); // Ensure the new option is selected
         }
    }

    // Send to server
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(`_arg_fps,${videoFramerate}`);
      console.log(`Sent video framerate ${videoFramerate} FPS to server via DataChannel (_arg_fps).`);
    } else if (clientMode === 'websockets') {
       if (websocket && websocket.readyState === WebSocket.OPEN) {
           const message = `SET_FRAMERATE,${videoFramerate}`;
           console.log(`Sent websocket message: ${message}`);
           websocket.send(message);
       } else {
           console.warn("Websocket connection not open, cannot send framerate setting.");
       }
    }
  }

  if (settings.resizeRemote !== undefined) {
    resizeRemote = settings.resizeRemote;
    setBoolParam('resizeRemote', resizeRemote); // Save to localStorage

    // Send to server (requires calculating resolution)
    const videoContainer = document.querySelector('.video-container');
    let res;
    if (!videoContainer) {
         console.warn('video-container not found, using window size for resizeRemote resolution.');
         res = `${roundDownToEven(window.innerWidth)}x${roundDownToEven(window.innerHeight)}`;
    } else {
        const videoContainerRect = videoContainer.getBoundingClientRect();
        const evenWidth = roundDownToEven(videoContainerRect.width);
        const evenHeight = roundDownToEven(videoContainerRect.height);
        res = `${evenWidth}x${evenHeight}`;
    }

    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
       webrtc.sendDataChannelMessage(`_arg_resize,${resizeRemote},${res}`);
       console.log(`Sent resizeRemote ${resizeRemote} with resolution ${res} to server via DataChannel.`);
    } else if (clientMode === 'websockets') {
       // Note: Original code didn't send resize via websocket. Keep this behavior?
       // If needed, add websocket send logic here.
       console.warn("ResizeRemote setting received, but not sending to server in websockets mode (not implemented).");
    }
  }

  if (settings.scaleLocal !== undefined) {
    scaleLocal = settings.scaleLocal;
    setBoolParam('scaleLocal', scaleLocal); // Save to localStorage
    // This is a client-side rendering setting, no server message needed.
    videoElement.classList.toggle('scale', scaleLocal);
    console.log(`Applied scaleLocal setting: ${scaleLocal}`);
  }

  if (settings.audioBitRate !== undefined) {
    audioBitRate = parseInt(settings.audioBitRate);
    setIntParam('audioBitRate', audioBitRate); // Save to localStorage

    // Update UI dropdown if in dev mode
    if (dev_mode && audioBitrateSelectElement) {
        audioBitrateSelectElement.value = audioBitRate.toString();
         let optionExists = false;
         for (let i = 0; i < audioBitrateSelectElement.options.length; i++) {
             if (audioBitrateSelectElement.options[i].value === audioBitRate.toString()) {
                 optionExists = true;
                 break;
             }
         }
         // Add option if it doesn't exist
         if (!optionExists) {
             console.warn(`Received audio bitrate ${audioBitRate} kbit/s from settings is not in dropdown options. Adding it.`);
             const option = document.createElement('option');
             option.value = audioBitRate.toString();
             option.textContent = `${audioBitRate} kbit/s (custom)`;
             audioBitrateSelectElement.insertBefore(option, audioBitrateSelectElement.firstChild);
             audioBitrateSelectElement.value = audioBitrateSelectElement.value = audioBitrate.toString(); // Ensure the new option is selected
         }
    }

    // Send to server
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(`ab,${audioBitRate}`);
       console.log(`Sent audio bitrate ${audioBitRate} kbit/s to server via DataChannel.`);
    } else if (clientMode === 'websockets') {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const message = `SET_AUDIO_BITRATE,${audioBitRate}`;
            console.log(`Sent websocket message: ${message}`);
            websocket.send(message);
        } else {
            console.warn("Websocket connection not open, cannot send audio bitrate setting.");
        }
    }
  }

  if (settings.encoder !== undefined) {
      const encoder = settings.encoder;
      setStringParam('encoder', encoder); // Save to localStorage

      // Update UI dropdown if in dev mode
       if (dev_mode && encoderSelectElement) {
           encoderSelectElement.value = encoder;
            let optionExists = false;
            for (let i = 0; i < encoderSelectElement.options.length; i++) {
                if (encoderSelectElement.options[i].value === encoder) {
                    optionExists = true;
                    break;
                }
            }
            // Add option if it doesn't exist
            if (!optionExists) {
                console.warn(`Received encoder ${encoder} from settings is not in dropdown options. Adding it.`);
                const option = document.createElement('option');
                option.value = encoder;
                option.textContent = `${encoder} (custom)`;
                encoderSelectElement.insertBefore(option, encoderSelectElement.firstChild);
                encoderSelectElement.value = encoder; // Ensure the new option is selected
            }
       }

       // Send to server
      if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
           webrtc.sendDataChannelMessage(`enc,${encoder}`);
           console.log(`Sent encoder ${encoder} to server via DataChannel.`);
      } else if (clientMode === 'websockets') {
           if (websocket && websocket.readyState === WebSocket.OPEN) {
               const message = `SET_ENCODER,${encoder}`;
               console.log(`Sent websocket message: ${message}`);
               websocket.send(message);
           } else {
               console.warn("Websocket connection not open, cannot send encoder setting.");
           }
      }
  }

  if (settings.videoBufferSize !== undefined) {
    videoBufferSize = parseInt(settings.videoBufferSize);
    setIntParam('videoBufferSize', videoBufferSize); // Save to localStorage
    console.log(`Applied Video buffer size setting: ${videoBufferSize} frames.`);

     // Update UI dropdown if in dev mode
     if (dev_mode && videoBufferSelectElement) {
         videoBufferSelectElement.value = videoBufferSize.toString();
          let optionExists = false;
          for (let i = 0; i < videoBufferSelectElement.options.length; i++) {
              if (videoBufferSelectElement.options[i].value === videoBufferSize.toString()) {
                  optionExists = true;
                  break;
              }
          }
           // Add option if it doesn't exist
          if (!optionExists) {
              console.warn(`Received video buffer size ${videoBufferSize} from settings is not in dropdown options. Adding it.`);
              const option = document.createElement('option');
              option.value = videoBufferSize.toString();
              option.textContent = `${videoBufferSize} frames (custom)`;
              videoBufferSelectElement.insertBefore(option, videoBufferSelectElement.firstChild);
              videoBufferSelectElement.value = videoBufferSize.toString(); // Ensure the new option is selected
          }
     }
     // This is a client-side buffering setting, no server message needed.
  }

  // Note: turnSwitch and debug settings trigger a reload in the original code.
  // This is a bit disruptive, but keeping the original behavior for now.
  // These settings are also client-side (affecting how the client connects),
  // not server-side parameters.
  if (settings.turnSwitch !== undefined) {
    turnSwitch = settings.turnSwitch;
    setBoolParam('turnSwitch', turnSwitch); // Save to localStorage
    console.log(`Applied turnSwitch setting: ${turnSwitch}. Reloading...`);
    // Check if WebRTC connection exists before reloading
    if (clientMode === 'webrtc' && (!webrtc || webrtc.peerConnection === null)) {
      console.log('WebRTC not connected, skipping immediate reload.');
      return;
    }
    setTimeout(() => {
      window.location.reload();
    }, 700); // Delay reload slightly
  }
  if (settings.debug !== undefined) {
    debug = settings.debug;
    setBoolParam('debug', debug); // Save to localStorage
     console.log(`Applied debug setting: ${debug}. Reloading...`);
    // Check if WebRTC connection exists before reloading
    if (clientMode === 'webrtc' && (!webrtc || webrtc.peerConnection === null)) {
      console.log('WebRTC not connected, skipping immediate reload.');
      return;
    }
    setTimeout(() => {
      window.location.reload();
    }, 700); // Delay reload slightly
  }
}

function sendStatsMessage() {
  const stats = {
    connection: connectionStat,
    gpu: gpuStat,
    cpu: cpuStat,
    clientFps: window.fps,
    audioBuffer: window.currentAudioBufferSize,
    videoBuffer: videoFrameBuffer.length,
    // --- NEW --- Include pipeline status in stats
    isVideoPipelineActive: isVideoPipelineActive,
    isAudioPipelineActive: isAudioPipelineActive,
    // --- END NEW ---
  };
   if (typeof encoderName !== 'undefined') {
       stats.encoderName = encoderName;
   }
  // Send stats data back via window.postMessage
  window.parent.postMessage({ type: 'stats', data: stats }, window.location.origin);
  console.log('Sent stats message via window.postMessage:', stats);
}

document.addEventListener('DOMContentLoaded', () => {
  initializeUI();

  // Initialize UI dropdowns with loaded settings and add custom options if needed
  if (dev_mode) {
      if (videoBitrateSelectElement) {
          videoBitrateSelectElement.value = videoBitRate.toString();
           let optionExists = false;
           for (let i = 0; i < videoBitrateSelectElement.options.length; i++) {
               if (videoBitrateSelectElement.options[i].value === videoBitRate.toString()) {
                   optionExists = true;
                   break;
               }
           }
           if (!optionExists) {
               console.warn(`Loaded video bitrate ${videoBitRate} kbit/s is not in dropdown options. Adding it.`);
               const option = document.createElement('option');
               option.value = videoBitRate.toString();
               option.textContent = `${videoBitRate} kbit/s (custom)`;
               videoBitrateSelectElement.insertBefore(option, videoBitrateSelectElement.firstChild);
               videoBitrateSelectElement.value = videoBitrateSelectElement.value = videoBitRate.toString();
           }
      }

      if (audioBitrateSelectElement) {
          audioBitrateSelectElement.value = audioBitRate.toString();
           let optionExists = false;
           for (let i = 0; i < audioBitrateSelectElement.options.length; i++) {
               if (audioBitrateSelectElement.options[i].value === audioBitRate.toString()) {
                   optionExists = true;
                   break;
               }
           }
           if (!optionExists) {
               console.warn(`Loaded audio bitrate ${audioBitRate} kbit/s is not in dropdown options. Adding it.`);
               const option = document.createElement('option');
               option.value = audioBitRate.toString();
               option.textContent = `${audioBitRate} kbit/s (custom)`;
               audioBitrateSelectElement.insertBefore(option, audioBitrateSelectElement.firstChild);
               audioBitrateSelectElement.value = audioBitrateSelectElement.value = audioBitrate.toString();
           }
      }

      if (encoderSelectElement) {
          const savedEncoder = getStringParam('encoder', 'x264enc');
          encoderSelectElement.value = savedEncoder;
           let optionExists = false;
           for (let i = 0; i < encoderSelectElement.options.length; i++) {
               if (encoderSelectElement.options[i].value === savedEncoder) {
                   optionExists = true;
                   break;
               }
           }
           if (!optionExists) {
               console.warn(`Loaded encoder ${savedEncoder} is not in dropdown options. Adding it.`);
               const option = document.createElement('option');
               option.value = savedEncoder;
               option.textContent = `${savedEncoder} (custom)`;
               encoderSelectElement.insertBefore(option, encoderSelectElement.firstChild);
               encoderSelectElement.value = encoder;
           }
      }

      if (framerateSelectElement) {
          framerateSelectElement.value = videoFramerate.toString();
           let optionExists = false;
           for (let i = 0; i < framerateSelectElement.options.length; i++) {
               if (framerateSelectElement.options[i].value === videoFramerate.toString()) {
                   optionExists = true;
                   break;
               }
           }
           if (!optionExists) {
               console.warn(`Loaded video framerate ${videoFramerate} FPS is not in dropdown options. Adding it.`);
               const option = document.createElement('option');
               option.value = videoFramerate.toString();
               option.textContent = `${videoFramerate} FPS (custom)`;
               framerateSelectElement.insertBefore(option, framerateSelectElement.firstChild);
               framerateSelectElement.value = framerateSelectElement.value = videoFramerate.toString();
           }
      }

      if (videoBufferSelectElement) {
          videoBufferSelectElement.value = videoBufferSize.toString();
           let optionExists = false;
           for (let i = 0; i < videoBufferSelectElement.options.length; i++) {
               if (videoBufferSelectElement.options[i].value === videoBufferSize.toString()) {
                   optionExists = true;
                   break;
               }
           }
           if (!optionExists) {
               console.warn(`Loaded video buffer size ${videoBufferSize} is not in dropdown options. Adding it.`);
               const option = document.createElement('option');
               option.value = videoBufferSize.toString();
               option.textContent = `${videoBufferSize} frames (custom)`;
               videoBufferSelectElement.insertBefore(option, videoBufferSelectElement.firstChild);
               videoBufferSelectElement.value = videoBufferSize.toString();
           }
      }

      // Initialize clipboard text area if it exists
      if (serverClipboardTextareaElement) {
          serverClipboardTextareaElement.value = serverClipboardContent;
      }

      // --- NEW --- Initialize toggle button appearance based on initial state
      updateToggleButtonAppearance(videoToggleButtonElement, isVideoPipelineActive);
      updateToggleButtonAppearance(audioToggleButtonElement, isAudioPipelineActive);
      // --- END NEW ---
  }


  videoElement.addEventListener('loadeddata', () => {
    if (clientMode === 'webrtc' && webrtc && webrtc.input) {
      webrtc.input.getCursorScaleFactor();
    }
  });

  const pathname = window.location.pathname.substring(
    0,
    window.location.pathname.lastIndexOf('/') + 1
  );
  const protocol = location.protocol === 'http:' ? 'ws://' : 'wss://';

  audio_signalling = new WebRTCDemoSignalling(
    new URL(
      `${protocol}${window.location.host}${pathname}${appName}/signalling/`
    ),
    3
  );
  audio_webrtc = new WebRTCDemo(audio_signalling, audioElement, 3);
  audio_signalling.setInput(audio_webrtc.input);

  window.applyTimestamp = (msg) => {
    const now = new Date();
    const ts = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    return `[${ts}] ${msg}`;
  };

  audio_signalling.onstatus = (message) => {
    loadingText = message;
    appendLogEntry(message);
    updateStatusDisplay();
  };
  audio_signalling.onerror = appendLogError;

  audio_signalling.ondisconnect = () => {
    const checkconnect = status === 'checkconnect';
    status = 'connecting';
    updateStatusDisplay();
    overlayInput.style.cursor = 'auto';
    audio_webrtc.reset();
    status = 'checkconnect';
    if (!checkconnect && signalling) signalling.disconnect();
  };

  const setupWebRTCMode = () => {
    if (metricsIntervalId) {
        clearInterval(metricsIntervalId);
        metricsIntervalId = null;
    }

    signalling = new WebRTCDemoSignalling(
      new URL(
        `${protocol}${window.location.host}${pathname}${appName}/signalling/`
      ),
      1
    );
    webrtc = new WebRTCDemo(signalling, videoElement, 1);

    signalling.setInput(webrtc.input);

    signalling.onstatus = (message) => {
      loadingText = message;
      appendLogEntry(message);
      updateStatusDisplay();
    };
    signalling.onerror = appendLogError;

    signalling.ondisconnect = () => {
      const checkconnect = status === 'checkconnect';
      status = 'connecting';
      updateStatusDisplay();
      overlayInput.style.cursor = 'auto';
      if (clientMode === 'webrtc' && webrtc) {
        webrtc.reset();
      }
      status = 'checkconnect';
      if (!checkconnect) audio_signalling.disconnect();
    };

    webrtc.onstatus = (message) => {
      appendLogEntry(applyTimestamp(`[webrtc] ${message}`));
    };
    webrtc.onerror = (message) => {
      appendLogError(applyTimestamp(`[webrtc] [ERROR] ${message}`));
    };
    webrtc.onconnectionstatechange = (state) => {
      videoConnected = state;
      if (videoConnected === 'connected') {
        if (!videoElement.paused) {
          playButtonElement.classList.add('hidden');
          statusDisplayElement.classList.add('hidden');
          spinnerElement.classList.add('hidden');
        }
        if (webrtc && webrtc.peerConnection) {
          webrtc.peerConnection.getReceivers().forEach((receiver) => {
            const intervalLoop = setInterval(async () => {
              if (
                receiver.track.readyState !== 'live' ||
                receiver.transport.state !== 'connected'
              ) {
                clearInterval(intervalLoop);
                return;
              }
              receiver.jitterBufferTarget = 0;
              receiver.jitterBufferDelayHint = 0;
              receiver.playoutDelayHint = 0;
            }, 15);
          });
        }
      }
      status =
        videoConnected === 'connected' && audioConnected === 'connected'
          ? state
          : videoConnected === 'connected'
          ? audioConnected
          : videoConnected;
      updateStatusDisplay();
    };
    webrtc.ondatachannelopen = initializeInput;

    webrtc.ondatachannelclose = () => {
      if (webrtc && webrtc.input) webrtc.input.detach();
    };

    webrtc.onclipboardcontent = (content) => {
      // Seamless clipboard update from server to local clipboard (WebRTC mode)
      navigator.clipboard
        .writeText(content)
        .catch((err) => {
          if (webrtc)
            webrtc._setStatus(`Could not copy text to clipboard: ${err}`);
        });
       // Also update the dev sidebar textarea if it exists and in dev mode
       if (dev_mode && serverClipboardTextareaElement) {
           serverClipboardContent = content;
           serverClipboardTextareaElement.value = content;
       }
    };

    webrtc.oncursorchange = (handle, curdata, hotspot, override) => {
      if (parseInt(handle, 10) === 0) {
        overlayInput.style.cursor = 'auto';
        return;
      }
      if (override) {
        overlayInput.style.cursor = override;
        return;
      }
      if (webrtc && !webrtc.cursor_cache.has(handle)) {
        const cursor_url = `url('data:image/png;base64,${curdata}')`;
        webrtc.cursor_cache.set(handle, cursor_url);
      }
      if (webrtc) {
        let cursor_url = webrtc.cursor_cache.get(handle);
        if (hotspot) {
          cursor_url += ` ${hotspot.x} ${hotspot.y}, auto`;
        } else {
          cursor_url += ', auto';
        }
        overlayInput.style.cursor = cursor_url;
      }
    };

    webrtc.onsystemaction = (action) => {
      if (webrtc) webrtc._setStatus(`Executing system action: ${action}`);
    };

    webrtc.onlatencymeasurement = (latency_ms) => {
      serverLatency = latency_ms * 2.0;
    };

    if (debug) {
      webrtc.ondebug = (message) => {
        appendDebugEntry(applyTimestamp(`[webrtc] ${message}`));
      };
    }
    if (webrtc) {
      webrtc.ongpustats = async (data) => {
        gpuStat.gpuLoad = Math.round(data.load * 100);
        gpuStat.gpuMemoryTotal = data.memory_total;
        gpuStat.gpuMemoryUsed = data.memory_used;
      };
    }
  };

  audio_webrtc.onstatus = (message) => {
    appendLogEntry(applyTimestamp(`[audio webrtc] ${message}`));
  };
  audio_webrtc.onerror = appendLogError;

  audio_webrtc.onconnectionstatechange = (state) => {
    audioConnected = state;
    if (audioConnected === 'connected') {
      if (audio_webrtc && audio_webrtc.peerConnection) {
        audio_webrtc.peerConnection.getReceivers().forEach((receiver) => {
          const intervalLoop = setInterval(async () => {
            if (
              receiver.track.readyState !== 'live' ||
              receiver.transport.state !== 'connected'
            ) {
              clearInterval(intervalLoop);
              return;
            }
            receiver.jitterBufferTarget = 0;
            receiver.jitterBufferDelayHint = 0;
            receiver.playoutDelayHint = 0;
          }, 15);
        });
      }
    }
    status =
      audioConnected === 'connected' && videoConnected === 'connected'
        ? state
        : audioConnected === 'connected'
        ? videoConnected
        : audioConnected;
    updateStatusDisplay();
  };
  if (debug) {
    audio_signalling.ondebug = (message) => {
      appendDebugEntry(`[audio signalling] ${message}`);
    };
    audio_webrtc.ondebug = (message) => {
      appendDebugEntry(applyTimestamp(`[audio webrtc] ${message}`));
    };
  }

  window.addEventListener('focus', () => {
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage)
      webrtc.sendDataChannelMessage('kr');
    if (
      clientMode === 'websockets' &&
      websocket &&
      websocket.readyState === WebSocket.OPEN
    )
      websocket.send('kr');

    // Existing seamless clipboard read on focus (only sends if permission is granted)
    navigator.clipboard
      .readText()
      .then((text) => {
        const encodedText = btoa(text);
        if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage)
          webrtc.sendDataChannelMessage(`cw,${encodedText}`);
        if (
          clientMode === 'websockets' &&
          websocket &&
          websocket.readyState === WebSocket.OPEN
        )
          websocket.send(`cw,${encodedText}`);
      })
      .catch((err) => {
        if (clientMode === 'webrtc') {
          webrtc._setStatus(`Failed to read clipboard contents: ${err}`);
        } else if (clientMode === 'websockets') {
          console.error(`Failed to read clipboard contents: ${err}`);
        }
      });
  });
  window.addEventListener('blur', () => {
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage)
      webrtc.sendDataChannelMessage('kr');
    if (
      clientMode === 'websockets' &&
      websocket &&
      websocket.readyState === WebSocket.OPEN
    )
      websocket.send('kr');
  });

  // --- NEW --- Handle page visibility changes for websockets mode
  document.addEventListener('visibilitychange', () => {
    if (clientMode !== 'websockets') return; // Only handle in websockets mode

    if (document.hidden) {
        console.log('Tab is hidden, stopping video pipeline.');
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            // Only send STOP if we believe it's currently active
            if (isVideoPipelineActive) {
                websocket.send('STOP_VIDEO');
                // Update state immediately (optimistic)
                isVideoPipelineActive = false;
                // Notify UI via postMessage
                window.postMessage({ type: 'pipelineStatusUpdate', video: false }, window.location.origin);
            } else {
                 console.log('Video pipeline already stopped, not sending STOP_VIDEO.');
            }
        } else {
            console.warn('Websocket not open, cannot send STOP_VIDEO.');
        }
        // Clear the buffer when hidden to prevent stale frames on resume
        cleanupVideoBuffer();

    } else {
        console.log('Tab is visible, starting video pipeline.');
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            // Only send START if we believe it's currently stopped
            if (!isVideoPipelineActive) {
                websocket.send('START_VIDEO');
                 // Update state immediately (optimistic)
                isVideoPipelineActive = true;
                // Notify UI via postMessage
                window.postMessage({ type: 'pipelineStatusUpdate', video: true }, window.location.origin);
            } else {
                console.log('Video pipeline already started, not sending START_VIDEO.');
            }
        } else {
            console.warn('Websocket not open, cannot send START_VIDEO.');
        }
    }
  });
  // --- END NEW ---

  /**
   * Handles a decoded video frame from the decoder.
   * Adds the frame to the videoFrameBuffer.
   * @param {VideoFrame} frame
   */
  function handleDecodedFrame(frame) {
      // --- MODIFIED --- Keep the frame dropping logic, but visibility control is now in the event listener
      if (document.hidden) {
        console.log('Tab is hidden, dropping video frame.');
        frame.close();
        if (dev_mode && videoBufferDivElement) {
            videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames (Tab Hidden)`;
        }
        return;
      }
      // --- END MODIFIED ---

      // Only buffer if the video pipeline is supposed to be active
      if (!isVideoPipelineActive && clientMode === 'websockets') {
           console.log('Video pipeline inactive, dropping video frame.');
           frame.close();
           if (dev_mode && videoBufferDivElement) {
               videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames (Pipeline Inactive)`;
           }
           return;
      }

      videoFrameBuffer.push(frame);
      if (dev_mode && videoBufferDivElement) {
          videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames`;
      }
  }

  /**
   * Paints the oldest frame from the buffer onto the canvas if the buffer is full enough.
   * Runs on a requestAnimationFrame loop.
   */
  function paintVideoFrame() {
      // Only paint if the video pipeline is supposed to be active and tab is visible
      if (canvasContext && !document.hidden && isVideoPipelineActive && videoFrameBuffer.length > videoBufferSize) {
          const frameToPaint = videoFrameBuffer.shift();

          if (frameToPaint) {
              // Ensure canvas dimensions match the frame before drawing
              if (canvas.width !== frameToPaint.codedWidth || canvas.height !== frameToPaint.codedHeight) {
                   canvas.width = frameToPaint.codedWidth;
                   canvas.height = frameToPaint.codedHeight;
                   console.log(`Canvas resized to ${canvas.width}x${canvas.height}`);
              }

              canvasContext.drawImage(frameToPaint, 0, 0);

              frameToPaint.close();

              frameCount++;
              const now = performance.now();
              const elapsed = now - lastFpsUpdateTime;

              if (elapsed >= 1000) {
                  const currentFps = (frameCount * 1000) / elapsed;
                  window.fps = Math.round(currentFps);
                  frameCount = 0;
                  lastFpsUpdateTime = now;
              }

              if (!streamStarted) {
                  startStream();
                  initializeInput();
              }
          }
      } else {
           // Update buffer display even if not painting
           if (dev_mode && videoBufferDivElement) {
               let reason = '';
               if (document.hidden) reason = '(Tab Hidden)';
               else if (!isVideoPipelineActive) reason = '(Pipeline Inactive)';
               else if (videoFrameBuffer.length <= videoBufferSize) reason = '(Buffering)';
               videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames ${reason}`;
           }
           // If hidden or inactive, clear the canvas to avoid showing a stale frame
           if (canvasContext && (document.hidden || !isVideoPipelineActive)) {
               // Optional: Clear canvas or leave the last frame visible
               // canvasContext.clearRect(0, 0, canvas.width, canvas.height);
           }
      }

      requestAnimationFrame(paintVideoFrame);
  }


  async function initializeAudio() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate:48000,
      });
      console.log(
        'AudioContext initialized in initializeAudio with sampleRate:',
        audioContext.sampleRate
      );
    }

    try {
      const audioWorkletProcessorCode = `
        class AudioFrameProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.audioBufferQueue = [];
            this.currentAudioData = null;
            this.currentDataOffset = 0;
            this.port.onmessage = (event) => {
              if (event.data.audioData) {
                this.audioBufferQueue.push(event.data.audioData);
              } else if (event.data.type === 'getBufferSize') {
                this.port.postMessage({ type: 'audioBufferSize', size: this.audioBufferQueue.length });
              }
            };
          }

          process(inputs, outputs, parameters) {
            const output = outputs[0];
            const leftChannel = output ? output[0] : undefined;
            const rightChannel = output ? output[1] : undefined;

            if (!leftChannel || !rightChannel) {
              // console.error("Error: leftChannel or rightChannel is undefined! Output:", output, "Outputs:", outputs);
              // Return true to keep processor alive, but output silence
              if (leftChannel) leftChannel.fill(0);
              if (rightChannel) rightChannel.fill(0);
              return true; // Keep processor running even if output is initially undefined
            }

            const samplesPerBuffer = leftChannel.length;

            if (this.audioBufferQueue.length === 0 && this.currentAudioData === null) {
              leftChannel.fill(0);
              rightChannel.fill(0);
              return true;
            }

            let data = this.currentAudioData;
            let offset = this.currentDataOffset;

            for (let sampleIndex = 0; sampleIndex < samplesPerBuffer; sampleIndex++) {
              if (!data || offset >= data.length) {
                if (this.audioBufferQueue.length > 0) {
                  data = this.currentAudioData = this.audioBufferQueue.shift();
                  offset = this.currentDataOffset = 0;
                } else {
                  // Buffer underrun, output silence for the rest of this block
                  this.currentAudioData = null; // Ensure we fetch new data next time
                  this.currentDataOffset = 0;
                  leftChannel.fill(0, sampleIndex);
                  rightChannel.fill(0, sampleIndex);
                  return true; // Finished processing this block
                }
              }

              leftChannel[sampleIndex] = data[offset++];
              if (offset < data.length) {
                rightChannel[sampleIndex] = data[offset++];
              } else {
                 // Handle mono case or end of stereo data cleanly
                 rightChannel[sampleIndex] = leftChannel[sampleIndex]; // Output mono to both if stereo source ends
                 offset++; // Increment offset even if data wasn't used for right channel
              }
            }

            this.currentDataOffset = offset;
            // If we finished the current data chunk exactly at the end of the buffer, clear it
            if (offset >= data.length) {
                 this.currentAudioData = null;
                 this.currentDataOffset = 0;
            } else {
                 this.currentAudioData = data; // Otherwise, keep the remaining data
            }


            return true;
          }
        }

        registerProcessor('audio-frame-processor', AudioFrameProcessor);
      `;
      const audioWorkletBlob = new Blob([audioWorkletProcessorCode], {
        type: 'text/javascript',
      });
      const audioWorkletURL = URL.createObjectURL(audioWorkletBlob);
      await audioContext.audioWorklet.addModule(audioWorkletURL);
      URL.revokeObjectURL(audioWorkletURL);
      audioWorkletNode = new AudioWorkletNode(
        audioContext,
        'audio-frame-processor',
        {
          numberOfOutputs: 1,
          outputChannelCount: [2],
        }
      );
      audioWorkletProcessorPort = audioWorkletNode.port;

      audioWorkletProcessorPort.onmessage = (event) => {
          if (event.data.type === 'audioBufferSize') {
              window.currentAudioBufferSize = event.data.size;
          }
      };


      audioWorkletNode.connect(audioContext.destination);
      console.log('AudioWorkletProcessor initialized and connected.');
    } catch (error) {
      console.error('Error initializing AudioWorklet:', error);
      audioContext = null;
      audioWorkletNode = null;
      audioWorkletProcessorPort = null;
    }
  }

  async function handleAudio(frame) {
    // --- NEW --- Check if audio pipeline is active before processing
    if (!isAudioPipelineActive && clientMode === 'websockets') {
        // console.log('Audio pipeline inactive, dropping audio frame.'); // Can be noisy
        frame.close();
        return;
    }
    // --- END NEW ---

    if (!audioContext) {
      await initializeAudio();
    }

    if (!audioContext || !audioWorkletProcessorPort) {
      console.log('Audio context or AudioWorkletProcessor not available, waiting for user interaction!');
      frame.close();
      return;
    }

    // Autoplay policy might require interaction to start/resume audio
    if (audioContext.state !== 'running') {
      console.warn('AudioContext state is:', audioContext.state, '. Attempting resume...');
      try {
          await audioContext.resume();
          console.log('AudioContext resumed successfully.');
      } catch (resumeError) {
           console.error('Failed to resume AudioContext:', resumeError, ' Dropping audio frame.');
           frame.close();
           return;
      }
    }

    try {
      const numberOfChannels = frame.numberOfChannels;
      const sampleCount = frame.numberOfFrames;

      const pcmData = new Float32Array(sampleCount * numberOfChannels);
      const copyOptions = { format: 'f32-planar', planeIndex: 0 }; // Use f32-planar if available and needed

      // Adjust copyOptions based on frame format if necessary. Assuming interleaved 'f32' for simplicity now.
      copyOptions.format = 'f32'; // Sticking to interleaved f32 based on previous code

      await frame.copyTo(pcmData, copyOptions);

      // Post the entire Float32Array containing interleaved data
      audioWorkletProcessorPort.postMessage({ audioData: pcmData });

      frame.close();

      if (!streamStarted) {
        startStream();
        initializeInput();
      }
    } catch (error) {
      console.error('Audio processing error:', error);
      frame.close();
    }
  }
  async function initializeDecoder() {
    if (decoder && decoder.state !== 'closed') {
        console.warn("VideoDecoder already exists, closing before re-initializing.");
        decoder.close();
    }
    decoder = new VideoDecoder({
      output: handleDecodedFrame,
      error: (e) => {
        console.error('VideoDecoder error:', e.message);
        // Attempt to reset decoder on fatal errors
        if (e.message.includes('fatal')) {
            console.warn('Attempting to reset VideoDecoder due to fatal error.');
            initializeDecoder(); // Re-initialize
        }
      },
    });
    // Use a default reasonable resolution initially, it will be updated on first frame or resize
    const initialWidth = 1280;
    const initialHeight = 720;

    // Common codecs, avc1.42E01E (H.264 Baseline) is widely supported
    // We might receive different codecs, configure should handle it if possible.
    const decoderConfig = {
      codec: 'avc1.42E01E', // A common H.264 profile
      codedWidth: initialWidth,
      codedHeight: initialHeight,
      // optimizeForLatency: true, // Enable if supported and desired
    };

    try {
      const support = await VideoDecoder.isConfigSupported(decoderConfig);
      if (support.supported) {
          decoder.configure(decoderConfig);
          console.log('VideoDecoder configured successfully with initial config:', decoderConfig);
      } else {
          console.error('Initial VideoDecoder configuration not supported:', support);
          // Maybe try a different default codec?
          decoder = null;
      }
    } catch (e) {
      console.error('Error configuring VideoDecoder with initial config:', e);
      decoder = null;
    }
  }

  async function initializeDecoderAudio() {
     if (decoderAudio && decoderAudio.state !== 'closed') {
        console.warn("AudioDecoder already exists, closing before re-initializing.");
        decoderAudio.close();
    }
    decoderAudio = new AudioDecoder({
      output: handleAudio,
      error: (e) => {
        console.error('AudioDecoder error:', e.message);
         if (e.message.includes('fatal')) {
            console.warn('Attempting to reset AudioDecoder due to fatal error.');
            initializeDecoderAudio(); // Re-initialize
        }
      },
    });

    const decoderConfig = {
      codec: 'opus', // Standard Opus codec string
      numberOfChannels: 2,
      sampleRate: 48000,
      // bitDepth: 16 // This is not a standard config property for Opus in AudioDecoder
    };

    try {
       const support = await AudioDecoder.isConfigSupported(decoderConfig);
       if (support.supported) {
           decoderAudio.configure(decoderConfig);
           console.log('AudioDecoder configured successfully.');
       } else {
           console.error('AudioDecoder configuration not supported:', support);
           decoderAudio = null;
       }
    } catch (e) {
      console.error('Error configuring AudioDecoder:', e);
      decoderAudio = null;
    }
  }

  const ws_protocol = location.protocol === 'http:' ? 'ws://' : 'wss://';
  const websocketEndpointURL = new URL(
    `${ws_protocol}${window.location.host}${pathname}websockets`
  );
  websocket = new WebSocket(websocketEndpointURL.href);
  websocket.binaryType = 'arraybuffer';

  const sendClientMetrics = () => {
      if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
          if (audioWorkletProcessorPort) {
               audioWorkletProcessorPort.postMessage({ type: 'getBufferSize' });
          }

          try {
              // Only send metrics if pipelines are active? Or always? Sending always for now.
              websocket.send('cfps,' + window.fps);
              // Optionally send buffer sizes too
              // websocket.send('abuf,' + window.currentAudioBufferSize);
              // websocket.send('vbuf,' + videoFrameBuffer.length);
          } catch (error) {
              console.error('[websockets] Error sending client metrics:', error);
          }
      }
      if (dev_mode) {
          if (fpsCounterDivElement) {
              fpsCounterDivElement.textContent = `Client FPS: ${window.fps}`;
          }
          if (audioBufferDivElement) {
               audioBufferDivElement.textContent = `Audio Buffer: ${window.currentAudioBufferSize} buffers`;
          }
          // videoBufferDivElement updated in paint loop
      }
  };

  websocket.onopen = () => {
    console.log('[websockets] Connection opened!');
    // Reset pipeline states on new connection
    isVideoPipelineActive = true;
    isAudioPipelineActive = true;
    window.postMessage({ type: 'pipelineStatusUpdate', video: true, audio: true }, window.location.origin);

    if (metricsIntervalId === null) {
        metricsIntervalId = setInterval(sendClientMetrics, METRICS_INTERVAL_MS);
        console.log(`[websockets] Started sending client metrics every ${METRICS_INTERVAL_MS}ms.`);
    }
     // Send initial resize/scale info
     if (window.webrtcInput) {
         const windowResolution = window.webrtcInput.getWindowResolution();
         const newRes = `${windowResolution[0]}x${windowResolution[1]}`;
         websocketSendInput(`r,${newRes}`);
         websocketSendInput(`s,${window.devicePixelRatio}`);
     }
  };

  websocket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      if (clientMode === 'websockets') {
        const arrayBuffer = event.data;
        const dataView = new DataView(arrayBuffer);

        const dataTypeByte = dataView.getUint8(0); // 0 for video, 1 for audio
        const frameTypeFlag = dataView.getUint8(1); // 1 for key frame, 0 for delta/inter
        const frameDataArrayBuffer = arrayBuffer.slice(2); // Rest is frame data

        if (dataTypeByte === 0) { // Video data
          // --- MODIFIED --- Check if video pipeline is active before decoding
          if (!isVideoPipelineActive) {
              // console.log("Video pipeline inactive, skipping decode."); // Can be noisy
              return;
          }
          // --- END MODIFIED ---

          if (decoder && decoder.state === 'configured') {
            const chunk = new EncodedVideoChunk({
              type: frameTypeFlag === 1 ? 'key' : 'delta',
              timestamp: performance.now() * 1000, // Use performance.now() for timestamp
              // duration: 0, // Duration is often unknown for encoded chunks
              data: frameDataArrayBuffer,
            });
            try {
              // Check queue size before decoding to prevent excessive memory use?
              // const MAX_DECODE_QUEUE_SIZE = 30; // Example limit
              // if (decoder.decodeQueueSize < MAX_DECODE_QUEUE_SIZE) {
                   decoder.decode(chunk);
              // } else {
              //     console.warn(`Video decode queue full (${decoder.decodeQueueSize}), dropping frame.`);
              // }
            } catch (e) {
              console.error('Video Decoding error:', e);
              // Attempt to recover by resetting decoder?
              if (decoder.state === 'closed' || decoder.state === 'unconfigured') {
                   console.warn("Video Decoder is closed or unconfigured, reinitializing...");
                   initializeDecoder();
              }
            }
          } else {
            console.warn(
              'Video Decoder not ready or not configured yet, video frame dropped.'
            );
             // Attempt to initialize if null
             if (!decoder) initializeDecoder();
          }
        } else if (dataTypeByte === 1) { // Audio data
            // --- MODIFIED --- Check if audio pipeline is active before decoding
            if (!isAudioPipelineActive) {
                // console.log("Audio pipeline inactive, skipping decode."); // Can be noisy
                return;
            }
            // --- END MODIFIED ---

          const AUDIO_BUFFER_THRESHOLD = 15; // Increased threshold slightly

          if (window.currentAudioBufferSize >= AUDIO_BUFFER_THRESHOLD) {
              console.warn(
                  `Audio buffer (${window.currentAudioBufferSize} buffers) is full (>= ${AUDIO_BUFFER_THRESHOLD}). Dropping audio frame.`
              );
              // Maybe clear some buffer here? Or just drop.
              return;
          }

          if (decoderAudio && decoderAudio.state === 'configured') {
            const chunk = new EncodedAudioChunk({
              type: 'key', // Opus frames are typically independent 'key' frames
              timestamp: performance.now() * 1000, // Use performance.now() for timestamp
              // duration: 20000, // Common Opus frame duration (e.g., 20ms = 20000 us) - server should provide if possible
              data: frameDataArrayBuffer,
            });
            try {
               // Check queue size?
               // const MAX_AUDIO_DECODE_QUEUE_SIZE = 50;
               // if(decoderAudio.decodeQueueSize < MAX_AUDIO_DECODE_QUEUE_SIZE) {
                    decoderAudio.decode(chunk);
               // } else {
               //      console.warn(`Audio decode queue full (${decoderAudio.decodeQueueSize}), dropping frame.`);
               // }
            } catch (e) {
              console.error('Audio Decoding error:', e);
               if (decoderAudio.state === 'closed' || decoderAudio.state === 'unconfigured') {
                   console.warn("Audio Decoder is closed or unconfigured, reinitializing...");
                   initializeDecoderAudio();
              }
            }
          } else {
             console.warn('Audio Decoder not ready or not configured yet, audio frame dropped.');
              // Attempt to initialize if null
             if (!decoderAudio) initializeDecoderAudio();
          }
        } else {
          console.warn('Unknown binary data payload type received:', dataTypeByte);
        }
      }
    } else if (typeof event.data === 'string') {
      if (clientMode === 'websockets') {
         if (event.data.startsWith('{')) {
           let obj;
           try {
              obj = JSON.parse(event.data);
           } catch (e) {
              console.error('Error parsing JSON message from server:', e, 'Message:', event.data);
              return;
           }

           if (obj.type === 'system_stats') {
             window.system_stats = obj;
             if (dev_mode && systemStatsDivElement) {
               systemStatsDivElement.textContent = JSON.stringify(obj, null, 2);
             }
           } else if (obj.type === 'gpu_stats') {
             window.gpu_stats = obj;
             if (dev_mode && gpuStatsDivElement) {
               gpuStatsDivElement.textContent = JSON.stringify(obj, null, 2);
             }
           }
           // --- NEW --- Handle potential pipeline status confirmation from server (optional)
           // Example: Server might send {"type": "pipeline_status", "video": true, "audio": false}
           else if (obj.type === 'pipeline_status') {
                console.log('Received pipeline status confirmation from server:', obj);
                let statusChanged = false;
                if (obj.video !== undefined && obj.video !== isVideoPipelineActive) {
                    isVideoPipelineActive = obj.video;
                    statusChanged = true;
                }
                 if (obj.audio !== undefined && obj.audio !== isAudioPipelineActive) {
                    isAudioPipelineActive = obj.audio;
                    statusChanged = true;
                }
                // Update UI if status changed based on server message
                if (statusChanged) {
                     window.postMessage({ type: 'pipelineStatusUpdate', video: isVideoPipelineActive, audio: isAudioPipelineActive }, window.location.origin);
                }
           }
           // --- END NEW ---
           else {
             console.warn(`Received unexpected JSON message type from server: ${obj.type}`, obj);
           }

         } else if (event.data.startsWith('cursor,')) {
           try {
             const cursorData = JSON.parse(event.data.substring(7));
             if (parseInt(cursorData.handle, 10) === 0) {
               overlayInput.style.cursor = 'auto';
               return;
             }
             const cursor_url = `url('data:image/png;base64,${cursorData.curdata}')`;
             let cursorStyle = cursor_url;
             if (cursorData.hotspot) {
               cursorStyle += ` ${cursorData.hotspot.x} ${cursorData.hotspot.y}, auto`;
             } else {
               cursorStyle += ', auto';
             }
             overlayInput.style.cursor = cursorStyle;
           } catch (e) {
             console.error('Error parsing cursor data:', e);
           }
         } else if (event.data.startsWith('clipboard,')) {
           try {
             const clipboardDataBase64 = event.data.substring(10);
             const clipboardData = atob(clipboardDataBase64);
             navigator.clipboard.writeText(clipboardData).catch((err) => {
               console.error('Could not copy text to clipboard: ' + err);
             });
             if (dev_mode && serverClipboardTextareaElement) {
                 serverClipboardContent = clipboardData;
                 serverClipboardTextareaElement.value = clipboardData;
                 console.log('Updated dev sidebar clipboard textarea from server.');
             }
           } catch (e) {
             console.error('Error processing clipboard data:', e);
           }
         } else if (event.data.startsWith('system,')) {
             try {
                 const systemMsg = JSON.parse(event.data.substring(7));
                 if (systemMsg.action === 'reload') {
                     console.log('Received system reload action, reloading window.');
                     window.location.reload();
                 }
             } catch (e) {
                 console.error('Error parsing system data:', e);
             }
         }
         // --- NEW --- Handle non-JSON string messages if needed (e.g., simple confirmations)
         else if (event.data === 'VIDEO_STARTED' && !isVideoPipelineActive) {
             console.log('Received VIDEO_STARTED confirmation.');
             isVideoPipelineActive = true;
             window.postMessage({ type: 'pipelineStatusUpdate', video: true }, window.location.origin);
         } else if (event.data === 'VIDEO_STOPPED' && isVideoPipelineActive) {
             console.log('Received VIDEO_STOPPED confirmation.');
             isVideoPipelineActive = false;
             window.postMessage({ type: 'pipelineStatusUpdate', video: false }, window.location.origin);
             cleanupVideoBuffer(); // Clear buffer when stopped
         } else if (event.data === 'AUDIO_STARTED' && !isAudioPipelineActive) {
             console.log('Received AUDIO_STARTED confirmation.');
             isAudioPipelineActive = true;
             window.postMessage({ type: 'pipelineStatusUpdate', audio: true }, window.location.origin);
         } else if (event.data === 'AUDIO_STOPPED' && isAudioPipelineActive) {
             console.log('Received AUDIO_STOPPED confirmation.');
             isAudioPipelineActive = false;
             window.postMessage({ type: 'pipelineStatusUpdate', audio: false }, window.location.origin);
         }
         // --- END NEW ---
         else {
            // Assuming other string messages might be input related if input handler exists
            if (window.webrtcInput && window.webrtcInput.on_message) {
               window.webrtcInput.on_message(event.data);
            } else {
               console.warn('Received unhandled string message:', event.data);
            }
         }
      } else if (event.data === 'MODE websockets') {
        clientMode = 'websockets';
        console.log('[websockets] Switched to websockets mode.');
        // Ensure decoders are ready
        initializeDecoder();
        initializeDecoderAudio();
        initializeInput(); // Ensure input is initialized *after* mode is set

        if (playButtonElement) playButtonElement.classList.add('hidden');
        if (statusDisplayElement) statusDisplayElement.classList.remove('hidden');
        if (spinnerElement) spinnerElement.classList.remove('hidden');

        console.log('Starting video painting loop (requestAnimationFrame).');
        requestAnimationFrame(paintVideoFrame); // Start the paint loop

        // Request current clipboard content from server when mode is set
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send('cr');
            console.log('[websockets] Sent clipboard request (cr) to server.');
            // Ensure pipelines are started if connecting fresh in this mode
             if (!document.hidden && !isVideoPipelineActive) websocket.send('START_VIDEO');
             if (!isAudioPipelineActive) websocket.send('START_AUDIO');
        }


      } else if (event.data === 'MODE webrtc') {
        clientMode = 'webrtc';
        console.log('[websockets] Switched to webrtc mode.');
        if (metricsIntervalId) {
            clearInterval(metricsIntervalId);
            metricsIntervalId = null;
            console.log('[websockets] Stopped client metrics interval for webrtc mode.');
        }
        // Close websocket-specific resources
        if (decoder) decoder.close();
        if (decoderAudio) decoderAudio.close();
        cleanupVideoBuffer(); // Clear buffer when switching mode

        setupWebRTCMode();
        fetch('./turn')
          .then((response) => response.json())
          .then((config) => {
            turnSwitch = getBoolParam('turnSwitch', turnSwitch);
            audio_webrtc.forceTurn = turnSwitch;
            audio_webrtc.rtcPeerConfig = config;

            const windowResolution =
              (clientMode === 'webrtc' && webrtc && webrtc.input)
                ? webrtc.input.getWindowResolution()
                : [roundDownToEven(window.innerWidth), roundDownToEven(window.innerHeight)];

            if (!scaleLocal) {
              videoElement.style.width = `${windowResolution[0] / window.devicePixelRatio}px`;
              videoElement.style.height = `${windowResolution[1] / window.devicePixelRatio}px`;
            }

            if (config.iceServers.length > 1) {
              appendDebugEntry(
                applyTimestamp(
                  `[app] using TURN servers: ${config.iceServers[1].urls.join(
                    ', '
                  )}`
                )
              );
            } else {
              appendDebugEntry(applyTimestamp('[app] no TURN servers found.'));
            }

            audio_webrtc.connect();
            webrtc.forceTurn = turnSwitch;
            webrtc.rtcPeerConfig = config;
            webrtc.connect();
          });
      }
    }
  };

  websocket.onerror = (event) => {
    console.error('[websockets] Error:', event);
    if (metricsIntervalId) {
        clearInterval(metricsIntervalId);
        metricsIntervalId = null;
        console.log('[websockets] Stopped client metrics interval due to error.');
    }
  };

  websocket.onclose = (event) => {
    console.log('[websockets] Connection closed', event);
    if (metricsIntervalId) {
        clearInterval(metricsIntervalId);
        metricsIntervalId = null;
        console.log('[websockets] Stopped client metrics interval due to close.');
    }
    cleanupVideoBuffer();
    // Optionally reset decoder states
    if(decoder) decoder.close();
    if(decoderAudio) decoderAudio.close();
    decoder = null;
    decoderAudio = null;
    // Reset pipeline state flags on close
    isVideoPipelineActive = false; // Assume stopped on disconnect
    isAudioPipelineActive = false;
    window.postMessage({ type: 'pipelineStatusUpdate', video: false, audio: false }, window.location.origin);
  };
});

function cleanupVideoBuffer() {
    // console.log(`Cleanup: Closing ${videoFrameBuffer.length} video frames in buffer.`); // Can be noisy
    let closedCount = 0;
    while(videoFrameBuffer.length > 0) {
        const frame = videoFrameBuffer.shift();
        try {
            frame.close();
            closedCount++;
        } catch (e) {
            // Ignore errors closing already closed frames
        }
    }
     if (closedCount > 0) console.log(`Cleanup: Closed ${closedCount} video frames.`);

     if (dev_mode && videoBufferDivElement) {
        videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames`;
     }
}


function cleanup() {
  if (metricsIntervalId) {
      clearInterval(metricsIntervalId);
      metricsIntervalId = null;
      console.log('Cleanup: Stopped client metrics interval.');
  }

  // --- MODIFIED --- Use a flag to prevent recursive cleanup calls if possible
  if (window.isCleaningUp) return;
  window.isCleaningUp = true;
  console.log("Cleanup: Starting cleanup process...");
  // --- END MODIFIED ---

  if (clientMode === 'webrtc' && signalling) {
    signalling.disconnect();
    signalling = null; // Clear reference
  }
  if (audio_signalling) {
    audio_signalling.disconnect();
    audio_signalling = null; // Clear reference
  }
  if (clientMode === 'webrtc' && webrtc) {
    webrtc.reset();
    webrtc = null; // Clear reference
  }
  if (audio_webrtc) {
    audio_webrtc.reset();
    audio_webrtc = null; // Clear reference
  }
  if (websocket) {
    websocket.onopen = null;
    websocket.onmessage = null;
    websocket.onerror = null;
    websocket.onclose = null; // Important to prevent close handler running again during cleanup
    if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
        websocket.close();
        console.log("Cleanup: Closed websocket connection.");
    }
    websocket = null;
  }
  if (audioContext) {
      if (audioContext.state !== 'closed') {
           console.log(`Cleanup: Closing AudioContext (state: ${audioContext.state})`);
           audioContext.close().then(() => console.log('Cleanup: AudioContext closed.')).catch(e => console.error('Cleanup: Error closing AudioContext:', e));
      }
      audioContext = null;
      audioWorkletNode = null;
      audioWorkletProcessorPort = null;
      audioBufferQueue.length = 0;
      window.currentAudioBufferSize = 0;
  }
  if (decoder) {
       if (decoder.state !== 'closed') {
          decoder.close();
          console.log("Cleanup: Closed VideoDecoder.");
       }
      decoder = null;
  }
  if (decoderAudio) {
      if (decoderAudio.state !== 'closed') {
          decoderAudio.close();
          console.log("Cleanup: Closed AudioDecoder.");
      }
      decoderAudio = null;
  }

  cleanupVideoBuffer();


  status = 'connecting';
  loadingText = '';
  showStart = true;
  streamStarted = false;
  inputInitialized = false;
  if (statusDisplayElement) statusDisplayElement.textContent = 'Connecting...';
  if (statusDisplayElement) statusDisplayElement.classList.remove('hidden');
  if (playButtonElement) playButtonElement.classList.remove('hidden');
  if (spinnerElement) spinnerElement.classList.remove('hidden');
  if (overlayInput) overlayInput.style.cursor = 'auto';
  serverClipboardContent = '';
  if (dev_mode && serverClipboardTextareaElement) {
      serverClipboardTextareaElement.value = serverClipboardContent;
  }
  // Reset states
  isVideoPipelineActive = true; // Reset to default for next connection attempt
  isAudioPipelineActive = true;

  connectionStat.connectionStatType = 'unknown';
  connectionStat.connectionLatency = 0;
  connectionStat.connectionVideoLatency = 0;
  connectionStat.connectionAudioLatency = 0;
  connectionStat.connectionAudioCodecName = 'NA';
  connectionStat.connectionAudioBitrate = 0;
  connectionStat.connectionPacketsReceived = 0;
  connectionStat.connectionPacketsLost = 0;
  connectionStat.connectionBytesReceived = 0;
  connectionStat.connectionBytesSent = 0;
  connectionStat.connectionCodec = 'unknown';
  connectionStat.connectionVideoDecoder = 'unknown';
  connectionStat.connectionResolution = '';
  connectionStat.connectionFrameRate = 0;
  connectionStat.connectionVideoBitrate = 0;
  connectionStat.connectionAvailableBandwidth = 0;
  gamepad.gamepadState = 'disconnected';
  gamepad.gamepadName = 'none';
  publishingAllowed = false;
  publishingIdle = false;
  publishingError = '';
  publishingAppName = '';
  publishingAppDisplayName = '';
  publishingAppDescription = '';
  publishingAppIcon = '';
  publishingValid = false;
  logEntries.length = 0;
  debugEntries.length = 0;

  window.fps = 0;
  frameCount = 0;
  lastFpsUpdateTime = performance.now();
  if (dev_mode && fpsCounterDivElement) {
      fpsCounterDivElement.textContent = `Client FPS: ${window.fps}`;
  }
   if (dev_mode && audioBufferDivElement) {
        audioBufferDivElement.textContent = `Audio Buffer: ${window.currentAudioBufferSize} buffers`;
   }
   // --- MODIFIED --- Reset cleanup flag
   console.log("Cleanup: Finished cleanup process.");
   window.isCleaningUp = false;
   // --- END MODIFIED ---
}

window.addEventListener('beforeunload', cleanup);

window.webrtcInput = null;

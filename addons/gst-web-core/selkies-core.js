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

let isVideoPipelineActive = true;
let isAudioPipelineActive = true;

let metricsIntervalId = null;
const METRICS_INTERVAL_MS = 100;

// Define the chunk size for file uploads
const UPLOAD_CHUNK_SIZE = 1024 * 1024; // 1 MB

const MAX_SIDEBAR_UPLOADS = 3; // Max uploads to show in sidebar
let uploadProgressContainerElement;
let activeUploads = {};

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
let videoToggleButtonElement;
let audioToggleButtonElement;


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

#upload-progress-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
    border-top: 1px solid #555;
    padding-top: 10px;
}
.upload-progress-item {
    background-color: #333;
    border: 1px solid #555;
    border-radius: 3px;
    padding: 6px;
    font-size: 0.8em;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: opacity 0.5s ease-out;
}
.upload-progress-item.fade-out {
    opacity: 0;
}
.upload-progress-item .file-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #ccc;
}
.upload-progress-bar-outer {
    width: 100%;
    height: 8px;
    background-color: #555;
    border-radius: 4px;
    overflow: hidden;
}
.upload-progress-bar-inner {
    height: 100%;
    width: 0%; /* Start at 0% */
    background-color: #ffc000; /* Progress color */
    border-radius: 4px;
    transition: width 0.1s linear;
}
.upload-progress-item.complete .upload-progress-bar-inner {
    background-color: #3a8d3a; /* Green for complete */
}
.upload-progress-item.error .upload-progress-bar-inner {
    background-color: #c9302c; /* Red for error */
    width: 100% !important; /* Show full bar for error indication */
}
.upload-progress-item.error .file-name {
    color: #ff8a8a; /* Lighter red for error text */
}
  `;
  document.head.appendChild(style);

};

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
    // --- Existing Sidebar Elements ---
    videoToggleButtonElement = document.createElement('button');
    videoToggleButtonElement.id = 'videoToggleBtn';
    videoToggleButtonElement.className = 'toggle-button';
    updateToggleButtonAppearance(videoToggleButtonElement, isVideoPipelineActive);
    sidebarDiv.appendChild(videoToggleButtonElement);

    videoToggleButtonElement.addEventListener('click', () => {
        if (clientMode !== 'websockets') return;
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const newState = !isVideoPipelineActive;
            const message = newState ? 'START_VIDEO' : 'STOP_VIDEO';
            console.log(`Dev Sidebar: Sending ${message} via websocket.`);
            websocket.send(message);
            isVideoPipelineActive = newState;
            updateToggleButtonAppearance(videoToggleButtonElement, isVideoPipelineActive);
            window.postMessage({ type: 'pipelineStatusUpdate', video: isVideoPipelineActive, audio: isAudioPipelineActive }, window.location.origin);
        } else {
            console.warn('Websocket not open, cannot send video toggle command.');
        }
    });

    audioToggleButtonElement = document.createElement('button');
    audioToggleButtonElement.id = 'audioToggleBtn';
    audioToggleButtonElement.className = 'toggle-button';
    updateToggleButtonAppearance(audioToggleButtonElement, isAudioPipelineActive);
    sidebarDiv.appendChild(audioToggleButtonElement);

    audioToggleButtonElement.addEventListener('click', () => {
        if (clientMode !== 'websockets') return;
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const newState = !isAudioPipelineActive;
            const message = newState ? 'START_AUDIO' : 'STOP_AUDIO';
            console.log(`Dev Sidebar: Sending ${message} via websocket.`);
            websocket.send(message);
            isAudioPipelineActive = newState;
            updateToggleButtonAppearance(audioToggleButtonElement, isAudioPipelineActive);
            window.postMessage({ type: 'pipelineStatusUpdate', video: isVideoPipelineActive, audio: isAudioPipelineActive }, window.location.origin);
        } else {
            console.warn('Websocket not open, cannot send audio toggle command.');
        }
    });


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

    videoBufferSelectElement.addEventListener('change', (event) => {
        const selectedSize = parseInt(event.target.value, 10);
        if (!isNaN(selectedSize)) {
            videoBufferSize = selectedSize;
            setIntParam('videoBufferSize', videoBufferSize);
            console.log(`Dev Sidebar: Video buffer size set to ${videoBufferSize} frames via UI`);
        }
    });

    const clipboardContainer = document.createElement('div');
    clipboardContainer.className = 'dev-clipboard-item';

    const clipboardLabel = document.createElement('label');
    clipboardLabel.textContent = 'Server Clipboard:';
    clipboardLabel.htmlFor = 'serverClipboardTextarea';
    clipboardContainer.appendChild(clipboardLabel);

    serverClipboardTextareaElement = document.createElement('textarea');
    serverClipboardTextareaElement.id = 'serverClipboardTextarea';
    serverClipboardTextareaElement.value = serverClipboardContent;

    serverClipboardTextareaElement.addEventListener('blur', (event) => {
        const newClipboardText = event.target.value;
        console.log(`Dev Sidebar: Clipboard text changed (blur). Sending via window.postMessage.`);
        window.postMessage({ type: 'clipboardUpdateFromUI', text: newClipboardText }, window.location.origin);
    });

    clipboardContainer.appendChild(serverClipboardTextareaElement);
    sidebarDiv.appendChild(clipboardContainer);

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

    uploadProgressContainerElement = document.createElement('div');
    uploadProgressContainerElement.id = 'upload-progress-container';
    sidebarDiv.appendChild(uploadProgressContainerElement);

  } // End of if(dev_mode)

  appDiv.appendChild(videoContainer);

  if (dev_mode) {
    appDiv.appendChild(sidebarDiv);
  }

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
};


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

  // Add drag and drop listeners
  overlayInput.addEventListener('dragover', handleDragOver);
  overlayInput.addEventListener('drop', handleDrop);


  window.webrtcInput = inputInstance;
};


window.addEventListener('message', receiveMessage, false);

function updateSidebarUploadProgress(payload) {
    if (!dev_mode || !uploadProgressContainerElement) return;

    const { status, fileName, progress, fileSize, message: errorMessage } = payload;
    const existingUpload = activeUploads[fileName];

    if (status === 'start') {
        if (Object.keys(activeUploads).length >= MAX_SIDEBAR_UPLOADS) {
            console.warn(`Dev Sidebar: Max upload items (${MAX_SIDEBAR_UPLOADS}) reached. Ignoring: ${fileName}`);
            return; // Don't add more than the max
        }
        if (existingUpload) {
            console.warn(`Dev Sidebar: Upload already started for ${fileName}. Ignoring duplicate start.`);
            return;
        }

        const item = document.createElement('div');
        item.className = 'upload-progress-item';
        item.dataset.fileName = fileName; // Store filename for later retrieval

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = fileName;
        nameSpan.title = fileName; // Show full name on hover
        item.appendChild(nameSpan);

        const barOuter = document.createElement('div');
        barOuter.className = 'upload-progress-bar-outer';
        const barInner = document.createElement('div');
        barInner.className = 'upload-progress-bar-inner';
        barOuter.appendChild(barInner);
        item.appendChild(barOuter);

        uploadProgressContainerElement.appendChild(item);
        activeUploads[fileName] = { element: item, progress: 0 };
        console.log(`Dev Sidebar: Added progress for ${fileName}`);

    } else if (existingUpload) {
        const { element } = existingUpload;
        const barInner = element.querySelector('.upload-progress-bar-inner');

        if (status === 'progress') {
            if (barInner) {
                barInner.style.width = `${progress}%`;
            }
            activeUploads[fileName].progress = progress;
        } else if (status === 'end') {
            if (barInner) {
                barInner.style.width = '100%';
            }
            element.classList.add('complete');
            console.log(`Dev Sidebar: Completed ${fileName}`);
            // Remove after a delay
            setTimeout(() => {
                element.classList.add('fade-out');
                setTimeout(() => {
                    if (element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                    delete activeUploads[fileName];
                    console.log(`Dev Sidebar: Removed progress for ${fileName}`);
                }, 500); // Matches fade-out transition
            }, 2000); // Keep completed item visible for 2 seconds
        } else if (status === 'error') {
             if (barInner) {
                 barInner.style.width = '100%'; // Visually indicate error
             }
             element.classList.add('error');
             const nameSpan = element.querySelector('.file-name');
             if (nameSpan) {
                 nameSpan.textContent = `${fileName} (Error)`;
                 nameSpan.title = `Error: ${errorMessage || 'Unknown error'}`;
             }
             console.error(`Dev Sidebar: Error uploading ${fileName}: ${errorMessage}`);
             // Remove after a delay
             setTimeout(() => {
                 element.classList.add('fade-out');
                 setTimeout(() => {
                    if (element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                    delete activeUploads[fileName];
                    console.log(`Dev Sidebar: Removed error progress for ${fileName}`);
                 }, 500);
             }, 5000); // Keep error item visible for 5 seconds
        }
    } else {
        console.warn(`Dev Sidebar: Received '${status}' for unknown upload: ${fileName}`);
    }
}


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
      console.log('Received clipboardUpdateFromUI message via window.postMessage.');
      const newClipboardText = message.text;

      if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
          try {
              const encodedText = btoa(newClipboardText);
              const clipboardMessage = `cw,${encodedText}`;
              websocket.send(clipboardMessage);
              console.log(`Sent clipboard update from UI to server via websocket: ${clipboardMessage}`);
          } catch (e) {
              console.error('Failed to encode or send clipboard text from UI:', e);
          }
      } else {
          console.warn('Cannot send clipboard update from UI: Not in websockets mode or websocket not open.');
      }
    }
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
    else if (message.type === 'fileUpload') {
        console.log('Received fileUpload message:', message.payload);
        updateSidebarUploadProgress(message.payload); // Update the sidebar display
    }
    else {
      console.warn('Received unknown message type via window.postMessage:', message.type, message);
    }
  } else {
     console.warn('Received non-object message via window.postMessage:', message);
  }
}

// This function now processes settings received from *any* source
// (including the dev sidebar via window.postMessage).
// It updates local state, localStorage, the UI (if dev_mode),
// and sends the command to the server via the appropriate channel.
function handleSettingsMessage(settings) {

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

  if (settings.turnSwitch !== undefined) {
    turnSwitch = settings.turnSwitch;
    setBoolParam('turnSwitch', turnSwitch); // Save to localStorage
    console.log(`Applied turnSwitch setting: ${turnSwitch}. Reloading...`);
    if (clientMode === 'webrtc' && (!webrtc || webrtc.peerConnection === null)) {
      console.log('WebRTC not connected, skipping immediate reload.');
      return;
    }
    setTimeout(() => {
      window.location.reload();
    }, 700);
  }
  if (settings.debug !== undefined) {
    debug = settings.debug;
    setBoolParam('debug', debug); // Save to localStorage
     console.log(`Applied debug setting: ${debug}. Reloading...`);
    if (clientMode === 'webrtc' && (!webrtc || webrtc.peerConnection === null)) {
      console.log('WebRTC not connected, skipping immediate reload.');
      return;
    }
    setTimeout(() => {
      window.location.reload();
    }, 700);
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
    isVideoPipelineActive: isVideoPipelineActive,
    isAudioPipelineActive: isAudioPipelineActive,
  };
   if (typeof encoderName !== 'undefined') {
       stats.encoderName = encoderName;
   }
  window.parent.postMessage({ type: 'stats', data: stats }, window.location.origin);
  console.log('Sent stats message via window.postMessage:', stats);
}

document.addEventListener('DOMContentLoaded', () => {
  initializeUI();

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

      if (serverClipboardTextareaElement) {
          serverClipboardTextareaElement.value = serverClipboardContent;
      }

      updateToggleButtonAppearance(videoToggleButtonElement, isVideoPipelineActive);
      updateToggleButtonAppearance(audioToggleButtonElement, isAudioPipelineActive);
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
      navigator.clipboard
        .writeText(content)
        .catch((err) => {
          if (webrtc)
            webrtc._setStatus(`Could not copy text to clipboard: ${err}`);
        });
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

  document.addEventListener('visibilitychange', () => {
    if (clientMode !== 'websockets') return;

    if (document.hidden) {
        console.log('Tab is hidden, stopping video pipeline.');
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            if (isVideoPipelineActive) {
                websocket.send('STOP_VIDEO');
                isVideoPipelineActive = false;
                window.postMessage({ type: 'pipelineStatusUpdate', video: false }, window.location.origin);
            } else {
                 console.log('Video pipeline already stopped, not sending STOP_VIDEO.');
            }
        } else {
            console.warn('Websocket not open, cannot send STOP_VIDEO.');
        }
        cleanupVideoBuffer();

    } else {
        console.log('Tab is visible, starting video pipeline.');
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            if (!isVideoPipelineActive) {
                websocket.send('START_VIDEO');
                 isVideoPipelineActive = true;
                window.postMessage({ type: 'pipelineStatusUpdate', video: true }, window.location.origin);
            } else {
                console.log('Video pipeline already started, not sending START_VIDEO.');
            }
        } else {
            console.warn('Websocket not open, cannot send START_VIDEO.');
        }
    }
  });

  /**
   * Handles a decoded video frame from the decoder.
   * Adds the frame to the videoFrameBuffer.
   * @param {VideoFrame} frame
   */
  function handleDecodedFrame(frame) {
      if (document.hidden) {
        console.log('Tab is hidden, dropping video frame.');
        frame.close();
        if (dev_mode && videoBufferDivElement) {
            videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames (Tab Hidden)`;
        }
        return;
      }

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
      if (canvasContext && !document.hidden && isVideoPipelineActive && videoFrameBuffer.length > videoBufferSize) {
          const frameToPaint = videoFrameBuffer.shift();

          if (frameToPaint) {
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
           if (dev_mode && videoBufferDivElement) {
               videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames`;
           }
           if (canvasContext && (document.hidden || !isVideoPipelineActive)) {
               canvasContext.clearRect(0, 0, canvas.width, canvas.height);
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
              if (leftChannel) leftChannel.fill(0);
              if (rightChannel) rightChannel.fill(0);
              return true;
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
                  this.currentAudioData = null;
                  this.currentDataOffset = 0;
                  leftChannel.fill(0, sampleIndex);
                  rightChannel.fill(0, sampleIndex);
                  return true;
                }
              }

              leftChannel[sampleIndex] = data[offset++];
              if (offset < data.length) {
                rightChannel[sampleIndex] = data[offset++];
              } else {
                 rightChannel[sampleIndex] = leftChannel[sampleIndex];
                 offset++;
              }
            }

            this.currentDataOffset = offset;
            if (offset >= data.length) {
                 this.currentAudioData = null;
                 this.currentDataOffset = 0;
            } else {
                 this.currentAudioData = data;
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
    if (!isAudioPipelineActive && clientMode === 'websockets') {
        frame.close();
        return;
    }

    if (!audioContext) {
      await initializeAudio();
    }

    if (!audioContext || !audioWorkletProcessorPort) {
      console.log('Audio context or AudioWorkletProcessor not available, waiting for user interaction!');
      frame.close();
      return;
    }

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
      const copyOptions = { format: 'f32-planar', planeIndex: 0 };

      copyOptions.format = 'f32';

      await frame.copyTo(pcmData, copyOptions);

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
        if (e.message.includes('fatal')) {
            console.warn('Attempting to reset VideoDecoder due to fatal error.');
            initializeDecoder();
        }
      },
    });
    const initialWidth = 1280;
    const initialHeight = 720;

    const decoderConfig = {
      codec: 'avc1.42E01E',
      codedWidth: initialWidth,
      codedHeight: initialHeight,
    };

    try {
      const support = await VideoDecoder.isConfigSupported(decoderConfig);
      if (support.supported) {
          decoder.configure(decoderConfig);
          console.log('VideoDecoder configured successfully with initial config:', decoderConfig);
      } else {
          console.error('Initial VideoDecoder configuration not supported:', support);
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
            initializeDecoderAudio();
        }
      },
    });

    const decoderConfig = {
      codec: 'opus',
      numberOfChannels: 2,
      sampleRate: 48000,
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
              websocket.send('cfps,' + window.fps);
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
      }
  };

  websocket.onopen = () => {
    console.log('[websockets] Connection opened!');
    isVideoPipelineActive = true;
    isAudioPipelineActive = true;
    window.postMessage({ type: 'pipelineStatusUpdate', video: true, audio: true }, window.location.origin);

    if (metricsIntervalId === null) {
        metricsIntervalId = setInterval(sendClientMetrics, METRICS_INTERVAL_MS);
        console.log(`[websockets] Started sending client metrics every ${METRICS_INTERVAL_MS}ms.`);
    }
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

        const dataTypeByte = dataView.getUint8(0);
        const frameTypeFlag = dataView.getUint8(1);
        const frameDataArrayBuffer = arrayBuffer.slice(2);

        if (dataTypeByte === 0) {
          if (!isVideoPipelineActive) {
              return;
          }

          if (decoder && decoder.state === 'configured') {
            const chunk = new EncodedVideoChunk({
              type: frameTypeFlag === 1 ? 'key' : 'delta',
              timestamp: performance.now() * 1000,
              data: frameDataArrayBuffer,
            });
            try {
                   decoder.decode(chunk);
            } catch (e) {
              console.error('Video Decoding error:', e);
              if (decoder.state === 'closed' || decoder.state === 'unconfigured') {
                   console.warn("Video Decoder is closed or unconfigured, reinitializing...");
                   initializeDecoder();
              }
            }
          } else {
            console.warn(
              'Video Decoder not ready or not configured yet, video frame dropped.'
            );
             if (!decoder) initializeDecoder();
          }
        } else if (dataTypeByte === 1) {
            if (!isAudioPipelineActive) {
                return;
            }

          const AUDIO_BUFFER_THRESHOLD = 10;

          if (window.currentAudioBufferSize >= AUDIO_BUFFER_THRESHOLD) {
              console.warn(
                  `Audio buffer (${window.currentAudioBufferSize} buffers) is full (>= ${AUDIO_BUFFER_THRESHOLD}). Dropping audio frame.`
              );
              return;
          }

          if (decoderAudio && decoderAudio.state === 'configured') {
            const chunk = new EncodedAudioChunk({
              type: 'key',
              timestamp: performance.now() * 1000,
              data: frameDataArrayBuffer,
            });
            try {
                if(decoderAudio.decodeQueueSize < 10) {
                    decoderAudio.decode(chunk);
                } else {
                     console.warn(`Audio decode queue full (${decoderAudio.decodeQueueSize}), dropping frame.`);
                }
            } catch (e) {
              console.error('Audio Decoding error:', e);
               if (decoderAudio.state === 'closed' || decoderAudio.state === 'unconfigured') {
                   console.warn("Audio Decoder is closed or unconfigured, reinitializing...");
                   initializeDecoderAudio();
              }
            }
          } else {
             console.warn('Audio Decoder not ready or not configured yet, audio frame dropped.');
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
                if (statusChanged) {
                     window.postMessage({ type: 'pipelineStatusUpdate', video: isVideoPipelineActive, audio: isAudioPipelineActive }, window.location.origin);
                }
           }
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
         else if (event.data === 'VIDEO_STARTED' && !isVideoPipelineActive) {
             console.log('Received VIDEO_STARTED confirmation.');
             isVideoPipelineActive = true;
             window.postMessage({ type: 'pipelineStatusUpdate', video: true }, window.location.origin);
         } else if (event.data === 'VIDEO_STOPPED' && isVideoPipelineActive) {
             console.log('Received VIDEO_STOPPED confirmation.');
             isVideoPipelineActive = false;
             window.postMessage({ type: 'pipelineStatusUpdate', video: false }, window.location.origin);
             cleanupVideoBuffer();
         } else if (event.data === 'AUDIO_STARTED' && !isAudioPipelineActive) {
             console.log('Received AUDIO_STARTED confirmation.');
             isAudioPipelineActive = true;
             window.postMessage({ type: 'pipelineStatusUpdate', audio: true }, window.location.origin);
         } else if (event.data === 'AUDIO_STOPPED' && isAudioPipelineActive) {
             console.log('Received AUDIO_STOPPED confirmation.');
             isAudioPipelineActive = false;
             window.postMessage({ type: 'pipelineStatusUpdate', audio: false }, window.location.origin);
         }
         else {
            if (window.webrtcInput && window.webrtcInput.on_message) {
               window.webrtcInput.on_message(event.data);
            } else {
               console.warn('Received unhandled string message:', event.data);
            }
         }
      } else if (event.data === 'MODE websockets') {
        clientMode = 'websockets';
        console.log('[websockets] Switched to websockets mode.');
        initializeDecoder();
        initializeDecoderAudio();
        initializeInput();

        if (playButtonElement) playButtonElement.classList.add('hidden');
        if (statusDisplayElement) statusDisplayElement.classList.remove('hidden');
        if (spinnerElement) spinnerElement.classList.remove('hidden');

        console.log('Starting video painting loop (requestAnimationFrame).');
        requestAnimationFrame(paintVideoFrame);

        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send('cr');
            console.log('[websockets] Sent clipboard request (cr) to server.');
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
        if (decoder) decoder.close();
        if (decoderAudio) decoderAudio.close();
        cleanupVideoBuffer();

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
    if(decoder) decoder.close();
    if(decoderAudio) decoderAudio.close();
    decoder = null;
    decoderAudio = null;
    isVideoPipelineActive = false;
    isAudioPipelineActive = false;
    window.postMessage({ type: 'pipelineStatusUpdate', video: false, audio: false }, window.location.origin);
  };
});

function cleanupVideoBuffer() {
    let closedCount = 0;
    while(videoFrameBuffer.length > 0) {
        const frame = videoFrameBuffer.shift();
        try {
            frame.close();
            closedCount++;
        } catch (e) {
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

  if (window.isCleaningUp) return;
  window.isCleaningUp = true;
  console.log("Cleanup: Starting cleanup process...");

  if (clientMode === 'webrtc' && signalling) {
    signalling.disconnect();
    signalling = null;
  }
  if (audio_signalling) {
    audio_signalling.disconnect();
    audio_signalling = null;
  }
  if (clientMode === 'webrtc' && webrtc) {
    webrtc.reset();
    webrtc = null;
  }
  if (audio_webrtc) {
    audio_webrtc.reset();
    audio_webrtc = null;
  }
  if (websocket) {
    websocket.onopen = null;
    websocket.onmessage = null;
    websocket.onerror = null;
    websocket.onclose = null;
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
  isVideoPipelineActive = true;
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
   console.log("Cleanup: Finished cleanup process.");
   window.isCleaningUp = false;
}


/**
 * Handles the 'dragover' event to allow dropping.
 * @param {DragEvent} ev
 */
function handleDragOver(ev) {
  ev.preventDefault(); // Necessary to allow dropping
  ev.dataTransfer.dropEffect = 'copy';
}

/**
 * Handles the 'drop' event on the overlayInput element.
 * Collects entries first, then processes sequentially using async/await.
 * @param {DragEvent} ev
 */
async function handleDrop(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    const errorMsg = "WebSocket is not open. Cannot upload files.";
    console.error(errorMsg);
    // Send error message to window if needed
    window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: 'N/A', message: errorMsg } }, window.location.origin);
    return;
  }

  console.log("File(s) dropped, collecting entries...");

  const entriesToProcess = []; // Array to hold valid entries

  if (ev.dataTransfer.items) {
    // Synchronously collect all entries from the item list
    for (let i = 0; i < ev.dataTransfer.items.length; i++) {
      const item = ev.dataTransfer.items[i];
      // IMPORTANT: Use webkitGetAsEntry() for broader compatibility
      const entry = item.webkitGetAsEntry() || item.getAsEntry();
      if (entry) {
        entriesToProcess.push(entry); // Add the entry to our array
      } else {
         console.warn("Could not get FileSystemEntry for dropped item.", item);
      }
    }
  } else {
    // Use DataTransfer interface to access the file(s) (legacy)
    // This path is less common now, but let's try to handle it.
    // We need File objects here, which uploadFileObject can handle directly.
    // Note: This legacy path doesn't support directories well.
    for (let i = 0; i < ev.dataTransfer.files.length; i++) {
        console.warn("Legacy file drop detected. Handling files directly.");
    }
    if (entriesToProcess.length === 0 && ev.dataTransfer.files.length > 0) {
        console.log("Processing legacy files sequentially.");
        try {
            for (let i = 0; i < ev.dataTransfer.files.length; i++) {
                await uploadFileObject(ev.dataTransfer.files[i], ev.dataTransfer.files[i].name);
            }
             console.log("Finished processing all legacy files.");
        } catch (error) {
             const errorMsg = `An error occurred during the legacy file upload process: ${error.message || error}`;
             console.error(errorMsg);
             window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: 'N/A', message: errorMsg } }, window.location.origin);
             if (websocket && websocket.readyState === WebSocket.OPEN) {
                  try { websocket.send(`FILE_UPLOAD_ERROR:GENERAL:Legacy processing failed`); } catch (_) {}
             }
        } finally {
        }
        return; // Exit after handling legacy files
    }
  }

  console.log(`Collected ${entriesToProcess.length} entries to process sequentially.`);

  // Now, sequentially process the entries from our stable array
  try {
    for (const entry of entriesToProcess) {
      const entryName = entry.name || 'Unknown Entry Name';
      console.log(`Processing collected entry: ${entryName}`);
      // Await the handling of each entry from the array
      await handleDroppedEntry(entry);
    }
    console.log("Finished processing all collected entries.");
  } catch (error) {
      const errorMsg = `An error occurred during the sequential upload process: ${error.message || error}`;
      console.error(errorMsg);
      window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: 'N/A', message: errorMsg } }, window.location.origin);
      // Optionally send a generic error to the server or display UI feedback
      if (websocket && websocket.readyState === WebSocket.OPEN) {
           try { websocket.send(`FILE_UPLOAD_ERROR:GENERAL:Processing failed`); } catch (_) {}
      }
  } finally {
      console.log("Upload process finished.");
  }
}

/**
 * Promisified version of entry.file()
 * @param {FileSystemFileEntry} fileEntry
 * @returns {Promise<File>}
 */
function getFileFromEntry(fileEntry) {
    return new Promise((resolve, reject) => {
        fileEntry.file(resolve, reject);
    });
}

/**
 * Recursively handles a dropped FileSystemEntry (file or directory) sequentially.
 * @param {FileSystemEntry} entry
 */
async function handleDroppedEntry(entry) {
  if (entry.isFile) {
    const pathName = entry.fullPath || entry.name; // Use fullPath if available
    try {
        // Get the file object using the promisified helper
        const file = await getFileFromEntry(entry);
        // Await the upload of this file, passing the path
        await uploadFileObject(file, pathName); // Pass pathToSend
    } catch (err) {
        const errorMsg = `Error getting or uploading file from entry ${pathName}: ${err.message || err}`;
        console.error(errorMsg);
        window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathName, message: errorMsg } }, window.location.origin);
        // Optionally send an error for this specific file
        if (websocket && websocket.readyState === WebSocket.OPEN) {
             try { websocket.send(`FILE_UPLOAD_ERROR:${pathName}:Failed to get/upload file`); } catch (_) {} // Use pathName
        }
        // Rethrow or handle as needed for sequential processing
        throw err; // Propagate error to stop sequential processing if desired, or remove to continue
    }
  } else if (entry.isDirectory) {
    const dirPath = entry.fullPath || entry.name;
    console.log(`Reading directory: ${dirPath}`);
    const dirReader = entry.createReader();
    // Await the processing of the entire directory
    await readDirectoryEntries(dirReader);
  }
}

/**
 * Promisified version of dirReader.readEntries()
 * Reads one batch of entries.
 * @param {FileSystemDirectoryReader} dirReader
 * @returns {Promise<FileSystemEntry[]>}
 */
function readEntriesPromise(dirReader) {
    return new Promise((resolve, reject) => {
        dirReader.readEntries(resolve, reject);
    });
}


/**
 * Recursively reads and processes all entries in a directory sequentially.
 * @param {FileSystemDirectoryReader} dirReader
 */
async function readDirectoryEntries(dirReader) {
    let entries;
    do {
        // Await reading a batch of entries
        entries = await readEntriesPromise(dirReader);
        if (entries.length > 0) {
            // Process each entry in the batch sequentially
            for (const entry of entries) {
                await handleDroppedEntry(entry); // Await each entry within the directory
            }
        }
    } while (entries.length > 0); // Continue if readEntries returned a non-empty batch
}


/**
 * Uploads a single File object by chunking it. Returns a Promise.
 * Sends start, progress, end, and error messages via window.postMessage.
 * @param {File} file The File object to upload.
 * @param {string} pathToSend The relative path of the file to send to the server.
 * @returns {Promise<void>} Resolves when upload is complete, rejects on error.
 */
function uploadFileObject(file, pathToSend) {
    // Wrap in a Promise
    return new Promise((resolve, reject) => {
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            const errorMsg = `WebSocket closed before file ${pathToSend} could be uploaded.`;
            console.error(errorMsg);
            // Send error message to window
            window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
            reject(new Error(errorMsg)); // Reject the promise
            return;
        }

        console.log(`Starting upload for: ${pathToSend} (${file.size} bytes)`);
        // Send START message via window.postMessage
        window.postMessage({ type: 'fileUpload', payload: { status: 'start', fileName: pathToSend, fileSize: file.size } }, window.location.origin);

        // Send START message via WebSocket
        websocket.send(`FILE_UPLOAD_START:${pathToSend}:${file.size}`);

        let offset = 0;
        const reader = new FileReader();

        reader.onload = function(e) {
            if (!websocket || websocket.readyState !== WebSocket.OPEN) {
                const errorMsg = `WebSocket closed during upload of ${pathToSend}. Aborting.`;
                console.error(errorMsg);
                // Send error message to window
                window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
                reject(new Error(errorMsg)); // Reject the promise
                return;
            }
            if (e.target.error) {
                const errorMsg = `Error reading file ${pathToSend}: ${e.target.error}`;
                console.error(errorMsg);
                 // Send error message to window
                window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
                // Try to notify server before rejecting
                try { websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:${e.target.error}`); } catch (_) {}
                reject(e.target.error); // Reject the promise
                return;
            }

            try {
                websocket.send(e.target.result); // Send ArrayBuffer directly
                offset += e.target.result.byteLength;

                // Calculate and send PROGRESS message via window.postMessage
                const progress = file.size > 0 ? Math.round((offset / file.size) * 100) : 100;
                window.postMessage({ type: 'fileUpload', payload: { status: 'progress', fileName: pathToSend, progress: progress, fileSize: file.size } }, window.location.origin);

                if (offset < file.size) {
                    readChunk(offset); // Read next chunk
                } else {
                    console.log(`Finished uploading ${pathToSend}`);
                    // Send END message via WebSocket
                    websocket.send(`FILE_UPLOAD_END:${pathToSend}`);
                    // Send END message via window.postMessage
                    window.postMessage({ type: 'fileUpload', payload: { status: 'end', fileName: pathToSend, fileSize: file.size } }, window.location.origin);
                    resolve(); // Resolve the promise on success
                }
            } catch (wsError) {
                const errorMsg = `WebSocket error sending chunk for ${pathToSend}: ${wsError}`;
                console.error(errorMsg);
                // Send error message to window
                window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
                // Optionally try to send an error message, but websocket might be broken
                try { websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:WebSocket send failed`); } catch (_) {}
                reject(wsError); // Reject the promise
            }
        };

        reader.onerror = function(e) {
            const errorMsg = `FileReader error for ${pathToSend}: ${e.target.error}`;
            console.error(errorMsg);
            // Send error message to window
            window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
             if (websocket && websocket.readyState === WebSocket.OPEN) {
                try { websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:${e.target.error}`); } catch (_) {}
             }
            reject(e.target.error); // Reject the promise
        };

        function readChunk(startOffset) {
            // Check websocket state *before* reading next chunk
            if (!websocket || websocket.readyState !== WebSocket.OPEN) {
                 const errorMsg = `WebSocket closed before reading next chunk for ${pathToSend}. Aborting.`;
                 console.error(errorMsg);
                 // Send error message to window
                 window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
                 reject(new Error(errorMsg)); // Reject the promise
                 return;
            }
            const endOffset = Math.min(startOffset + UPLOAD_CHUNK_SIZE, file.size);
            const slice = file.slice(startOffset, endOffset);
            reader.readAsArrayBuffer(slice);
        }

        // Start reading the first chunk
        readChunk(0);
    });
}

window.addEventListener('beforeunload', cleanup);

window.webrtcInput = null;

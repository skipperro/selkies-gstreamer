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
let isMicrophoneActive = false;
let isGamepadEnabled = true;
let gamepadStates = {};
const GAMEPAD_VIS_THRESHOLD = 0.1;
const STICK_VIS_MULTIPLIER = 10;

// Microphone related resources
let micStream = null;
let micAudioContext = null;
let micSourceNode = null;
let micWorkletNode = null;
let preferredInputDeviceId = null;
let preferredOutputDeviceId = null;
let advancedAudioSettingsBtnElement;
let audioDeviceSettingsDivElement;
let audioInputSelectElement;
let audioOutputSelectElement;
let metricsIntervalId = null;
const METRICS_INTERVAL_MS = 500;
const UPLOAD_CHUNK_SIZE = (1024 * 1024) - 1;
const MAX_SIDEBAR_UPLOADS = 3;
let uploadProgressContainerElement;
let activeUploads = {};

// Elements for resolution controls
let manualWidthInput;
let manualHeightInput;
let scaleLocallyCheckbox;
let setResolutionButton;
let resetResolutionButton;
window.isManualResolutionMode = false;
let manualWidth = null;
let manualHeight = null;
let autoResizeHandler = null;
let debouncedAutoResizeHandler = null;
let originalWindowResizeHandler = null;

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
let audioBitRate = 320000;
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
let gamepadToggleButtonElement;
let micToggleButtonElement;


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

let scaleLocallyManual = getBoolParam('scaleLocallyManual', true);

const getUsername = () => getCookieValue(`broker_${appName}`)?.split('#')[0] || 'webrtc';


const enterFullscreen = () => {
  if (
    clientMode === 'webrtc' &&
    webrtc &&
    'input' in webrtc &&
    'enterFullscreen' in webrtc.input
  ) {
    webrtc.input.enterFullscreen();
  } else if (
    clientMode === 'websockets' &&
    'webrtcInput' in window
  ) {
    window.webrtcInput.enterFullscreen();
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
#app.dev-mode {
  flex-direction: row;
}
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
.video-container video,
.video-container canvas,
.video-container #overlayInput {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}
.video-container video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.video-container #videoCanvas {
    z-index: 2;
    pointer-events: none;
    display: block;
}
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
.video-container .spinner-container,
.video-container #playButton {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
}
:root {
  --spinner-size: 2rem;
  --spinner-thickness: 0.25rem;
  --spinner-color: #ffc000;
  --spinner-track-color: rgba(255, 192, 0, 0.2);
  --spinner-speed: 1s;
  --spinner-bg-color: #fff;
}
.spinner-container {
  width: var(--spinner-size);
  height: var(--spinner-size);
  position: relative;
  border-radius: 50%;
  background: conic-gradient(
    var(--spinner-track-color) 0deg,
    var(--spinner-color) 90deg,
    var(--spinner-color) 360deg
  );
  -webkit-animation: spin var(--spinner-speed) linear infinite;
  animation: spin var(--spinner-speed) linear infinite;
}
.spinner-container::before {
  content: '';
  position: absolute;
  /* Center the inner circle */
  top: var(--spinner-thickness);
  left: var(--spinner-thickness);
  right: var(--spinner-thickness);
  bottom: var(--spinner-thickness);
  border-radius: 50%;
  background-color: var(--spinner-bg-color);
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
#dev-sidebar {
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
    transition: background-color 0.2s ease;
}
#dev-sidebar button:hover {
    background-color: #555;
}
#dev-sidebar button.toggle-button.active {
    background-color: #3a8d3a;
    border-color: #5cb85c;
}
#dev-sidebar button.toggle-button.active:hover {
    background-color: #4cae4c;
}
#dev-sidebar button.toggle-button.inactive {
    background-color: #c9302c;
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
#audio-device-settings {
    border-top: 1px solid #555;
    padding-top: 10px;
    margin-top: 10px;
}
#audio-device-settings label {
    margin-top: 8px;
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
#gamepad-visualization-container {
    border-top: 1px solid #555;
    padding-top: 10px;
    margin-top: 10px;
}
#gamepad-visualization-container label {
    margin-bottom: 5px;
    font-size: 0.9em;
    color: #bbb;
    display: block; /* Ensure label is on its own line */
}
#gamepad-svg-vis {
    background-color: #222; /* Dark background for the SVG area */
    border-radius: 3px;
    display: block; /* Prevent extra space below */
    margin-top: 10px; /* <<< ADDED THIS LINE for padding */
}
  `;
  document.head.appendChild(style);

};

function updateToggleButtonAppearance(buttonElement, isActive) {
    if (!buttonElement) return;
    let label = 'Unknown';
    if (buttonElement.id === 'videoToggleBtn') label = 'Video';
    else if (buttonElement.id === 'audioToggleBtn') label = 'Audio';
    else if (buttonElement.id === 'micToggleBtn') label = 'Microphone';
    else if (buttonElement.id === 'gamepadToggleBtn') label = 'Gamepad'; 
    if (isActive) {
        buttonElement.textContent = `${label}: ON`;
        buttonElement.classList.remove('inactive');
        buttonElement.classList.add('active');
    } else {
        buttonElement.textContent = `${label}: OFF`;
        buttonElement.classList.remove('active');
        buttonElement.classList.add('inactive');
    }
}

/** NEW HELPER FUNCTION
 * Sends the current resolution (manual or container-based) and pixel ratio to the server.
 * @param {number} width - The width to send.
 * @param {number} height - The height to send.
 */
function sendResolutionToServer(width, height) {
    const pixelRatio = window.devicePixelRatio;
    const resString = `${width}x${height}`;

    console.log(`Sending resolution to server: ${resString}, Pixel Ratio: ${pixelRatio}`);

    if (clientMode === 'webrtc') {
        if (webrtc && webrtc.sendDataChannelMessage) {
            webrtc.sendDataChannelMessage(`r,${resString}`);
            webrtc.sendDataChannelMessage(`s,${pixelRatio}`);
        } else {
            console.warn("Cannot send resolution via WebRTC: Data channel not ready.");
        }
    } else if (clientMode === 'websockets') {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            // Assuming WebSocket messages 'r,' and 's,' are handled similarly
            websocket.send(`r,${resString}`);
            websocket.send(`s,${pixelRatio}`);
        } else {
            console.warn("Cannot send resolution via WebSocket: Connection not open.");
        }
    }
}

/** NEW HELPER FUNCTION
 * Applies CSS styles to the canvas based on manual resolution settings and scaling preference.
 * @param {number} targetWidth - The desired internal width of the stream.
 * @param {number} targetHeight - The desired internal height of the stream.
 * @param {boolean} scaleToFit - If true, scale visually while maintaining aspect ratio.
 */
function applyManualCanvasStyle(targetWidth, targetHeight, scaleToFit) {
    if (!canvas || !canvas.parentElement) {
        console.error("Cannot apply manual canvas style: Canvas or parent container not found.");
        return;
    }

    const container = canvas.parentElement; // Assumes canvas is directly in the video-container
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Always ensure canvas buffer matches target resolution (or incoming frame size handled by paintVideoFrame)
    // Note: paintVideoFrame might override this if frame dimensions differ, which is usually desired.
    // canvas.width = targetWidth;
    // canvas.height = targetHeight;

    if (scaleToFit) {
        // Scale Locally (Maintain Aspect Ratio) - Checked
        const targetAspectRatio = targetWidth / targetHeight;
        const containerAspectRatio = containerWidth / containerHeight;

        let cssWidth, cssHeight;

        if (targetAspectRatio > containerAspectRatio) {
            // Target is wider than container (letterbox)
            cssWidth = containerWidth;
            cssHeight = containerWidth / targetAspectRatio;
        } else {
            // Target is taller than or same as container (pillarbox)
            cssHeight = containerHeight;
            cssWidth = containerHeight * targetAspectRatio;
        }

        const topOffset = (containerHeight - cssHeight) / 2;
        const leftOffset = (containerWidth - cssWidth) / 2;

        canvas.style.position = 'absolute';
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvas.style.top = `${topOffset}px`;
        canvas.style.left = `${leftOffset}px`;
        canvas.style.objectFit = 'contain'; // Explicitly set object-fit for clarity
        console.log(`Applied manual style (Scaled): CSS ${cssWidth}x${cssHeight}, Pos ${leftOffset},${topOffset}`);

    } else {
        // Scale Locally - Unchecked (Exact resolution, top-left, overflow)
        canvas.style.position = 'absolute';
        canvas.style.width = `${targetWidth}px`;
        canvas.style.height = `${targetHeight}px`;
        canvas.style.top = '0px';
        canvas.style.left = '0px';
        canvas.style.objectFit = 'fill'; // Or 'none', depending on desired overflow behavior
        console.log(`Applied manual style (Exact): CSS ${targetWidth}x${targetHeight}, Pos 0,0`);
    }
    // Make canvas visible if it wasn't
    canvas.style.display = 'block';
}

/** NEW HELPER FUNCTION
 * Resets the canvas CSS styles to default (fill container).
 */
function resetCanvasStyle() {
    if (!canvas) return;
    canvas.style.position = 'absolute';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.top = '0px';
    canvas.style.left = '0px';
    canvas.style.objectFit = 'contain'; // Reset to default behavior
    console.log("Reset canvas style to default (100% width/height)");
}

/** NEW HELPER FUNCTION
 * Enables the automatic resizing behavior based on window/container size.
 */
function enableAutoResize() {
    if (originalWindowResizeHandler && !window.onresize) { // Check if it's not already added
        console.log("Re-enabling auto-resize listener.");
        window.addEventListener('resize', originalWindowResizeHandler);
        // Trigger an immediate resize calculation after enabling
        originalWindowResizeHandler();
    } else if (window.onresize) {
         console.log("Auto-resize listener already enabled.");
    } else {
        console.warn("Cannot enable auto-resize: Original handler not found.");
    }
}

/** NEW HELPER FUNCTION
 * Disables the automatic resizing behavior.
 */
function disableAutoResize() {
    if (originalWindowResizeHandler) {
        console.log("Disabling auto-resize listener.");
        window.removeEventListener('resize', originalWindowResizeHandler);
        // Setting window.onresize = null might be needed if it was set directly
        // window.onresize = null;
    } else {
        console.warn("Cannot disable auto-resize: Original handler not found.");
    }
}

const initializeUI = () => {
  injectCSS();
  document.title = `Selkies - ${appName}`;
  window.addEventListener('requestFileUpload', handleRequestFileUpload);
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
  // Apply default style initially
  resetCanvasStyle();
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
  const hiddenFileInput = document.createElement('input');
  hiddenFileInput.type = 'file';
  hiddenFileInput.id = 'globalFileInput';
  hiddenFileInput.multiple = true;
  hiddenFileInput.style.display = 'none';
  document.body.appendChild(hiddenFileInput);
  hiddenFileInput.addEventListener('change', handleFileInputChange);
  if (!document.getElementById('keyboard-input-assist')) {
      const keyboardInputAssist = document.createElement('input');
      keyboardInputAssist.type = 'text';
      keyboardInputAssist.id = 'keyboard-input-assist';
      // Apply hiding styles directly
      keyboardInputAssist.style.position = 'absolute';
      keyboardInputAssist.style.left = '-9999px';
      keyboardInputAssist.style.top = '-9999px';
      keyboardInputAssist.style.width = '1px';
      keyboardInputAssist.style.height = '1px';
      keyboardInputAssist.style.opacity = '0';
      keyboardInputAssist.style.border = '0';
      keyboardInputAssist.style.padding = '0';
      keyboardInputAssist.style.caretColor = 'transparent';
      // Accessibility and browser hints
      keyboardInputAssist.setAttribute('aria-hidden', 'true');
      keyboardInputAssist.setAttribute('autocomplete', 'off');
      keyboardInputAssist.setAttribute('autocorrect', 'off');
      keyboardInputAssist.setAttribute('autocapitalize', 'off');
      keyboardInputAssist.setAttribute('spellcheck', 'false');
      document.body.appendChild(keyboardInputAssist); // Append to body
      console.log("Dynamically added #keyboard-input-assist element.");
  }

  if (dev_mode) {
    // --- Existing Dev Sidebar Elements ---
    videoToggleButtonElement = document.createElement('button');
    videoToggleButtonElement.id = 'videoToggleBtn';
    videoToggleButtonElement.className = 'toggle-button';
    updateToggleButtonAppearance(videoToggleButtonElement, isVideoPipelineActive);
    sidebarDiv.appendChild(videoToggleButtonElement);
    videoToggleButtonElement.addEventListener('click', () => {
        const newState = !isVideoPipelineActive;
        window.postMessage({ type: 'pipelineControl', pipeline: 'video', enabled: newState }, window.location.origin);
    });
    audioToggleButtonElement = document.createElement('button');
    audioToggleButtonElement.id = 'audioToggleBtn';
    audioToggleButtonElement.className = 'toggle-button';
    updateToggleButtonAppearance(audioToggleButtonElement, isAudioPipelineActive);
    sidebarDiv.appendChild(audioToggleButtonElement);
    audioToggleButtonElement.addEventListener('click', () => {
        const newState = !isAudioPipelineActive;
        window.postMessage({ type: 'pipelineControl', pipeline: 'audio', enabled: newState }, window.location.origin);
    });
    micToggleButtonElement = document.createElement('button');
    micToggleButtonElement.id = 'micToggleBtn';
    micToggleButtonElement.className = 'toggle-button';
    updateToggleButtonAppearance(micToggleButtonElement, isMicrophoneActive);
    sidebarDiv.appendChild(micToggleButtonElement);
    micToggleButtonElement.addEventListener('click', () => {
        const newState = !isMicrophoneActive;
        window.postMessage({ type: 'pipelineControl', pipeline: 'microphone', enabled: newState }, window.location.origin);
    });
    const fullscreenButton = document.createElement('button');
    fullscreenButton.id = 'fullscreenBtn';
    fullscreenButton.textContent = 'Enter Fullscreen';
    sidebarDiv.appendChild(fullscreenButton);
    fullscreenButton.addEventListener('click', () => {
        window.postMessage({ type: 'requestFullscreen' }, window.location.origin);
    });
    gamepadToggleButtonElement = document.createElement('button');
    gamepadToggleButtonElement.id = 'gamepadToggleBtn';
    gamepadToggleButtonElement.className = 'toggle-button';
    sidebarDiv.appendChild(gamepadToggleButtonElement);
    const gamepadVisContainer = document.createElement('div');
    gamepadVisContainer.id = 'gamepad-visualization-container';
    gamepadVisContainer.className = 'dev-setting-item';
    const gamepadVisLabel = document.createElement('label');
    gamepadVisLabel.textContent = 'Gamepad 0 Input:';
    gamepadVisContainer.appendChild(gamepadVisLabel);
    const gamepadSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    gamepadSVG.setAttribute('viewBox', '0 0 260 100');
    gamepadSVG.setAttribute('width', '100%');
    gamepadSVG.setAttribute('height', '100');
    gamepadSVG.id = 'gamepad-svg-vis';
    gamepadSVG.innerHTML = `
        <style>
            .gp-vis-base { fill: #555; stroke: #888; stroke-width: 0.5; }
            .gp-vis-button { fill: #8ecae6; stroke: #a1d8f0; stroke-width: 0.5; transition: fill 0.05s linear; }
            .gp-vis-stick-base { fill: #2a527a; }
            .gp-vis-stick-top { fill: #6699cc; stroke: #8cb3d9; stroke-width: 0.5; transition: transform 0.05s linear; }
            .gp-vis-dpad { fill: #8ecae6; stroke: #a1d8f0; stroke-width: 0.5; transition: fill 0.05s linear; }
            .gp-vis-trigger {
                fill: #8ecae6;
                stroke: #a1d8f0;
                stroke-width: 0.5;
                transition: opacity 0.05s linear;
            }
            .gp-vis-bumper { fill: #8ecae6; stroke: #a1d8f0; stroke-width: 0.5; transition: fill 0.05s linear; }
            .gp-vis-button-pressed,
            .gp-vis-dpad-pressed,
            .gp-vis-bumper-pressed {
                fill: #4a90e2;
            }
        </style>
        <!-- Base Rectangle -->
        <rect class="gp-vis-base" x="30" y="10" width="200" height="80" rx="10" ry="10" />
        <!-- Bumpers -->
        <rect id="gp-vis-btn-4" class="gp-vis-bumper" x="40" y="0" width="40" height="8" rx="2" />
        <rect id="gp-vis-btn-5" class="gp-vis-bumper" x="180" y="0" width="40" height="8" rx="2" />
        <!-- Triggers -->
        <rect id="gp-vis-btn-6" class="gp-vis-trigger" x="40" y="10" width="40" height="10" rx="2" />
        <rect id="gp-vis-btn-7" class="gp-vis-trigger" x="180" y="10" width="40" height="10" rx="2" />
        <!-- Face Buttons -->
        <circle id="gp-vis-btn-0" class="gp-vis-button" cx="185" cy="55" r="6" /> <!-- A -->
        <circle id="gp-vis-btn-1" class="gp-vis-button" cx="205" cy="40" r="6" /> <!-- B -->
        <circle id="gp-vis-btn-2" class="gp-vis-button" cx="165" cy="40" r="6" /> <!-- X -->
        <circle id="gp-vis-btn-3" class="gp-vis-button" cx="185" cy="25" r="6" /> <!-- Y -->
        <!-- Special Buttons -->
        <rect id="gp-vis-btn-8" class="gp-vis-button" x="105" y="25" width="10" height="5" /> <!-- Back -->
        <rect id="gp-vis-btn-9" class="gp-vis-button" x="145" y="25" width="10" height="5" /> <!-- Start -->
        <!-- D-Pad -->
        <rect id="gp-vis-btn-12" class="gp-vis-dpad" x="70" y="50" width="10" height="10" /> <!-- Up -->
        <rect id="gp-vis-btn-13" class="gp-vis-dpad" x="70" y="70" width="10" height="10" /> <!-- Down -->
        <rect id="gp-vis-btn-14" class="gp-vis-dpad" x="60" y="60" width="10" height="10" /> <!-- Left -->
        <rect id="gp-vis-btn-15" class="gp-vis-dpad" x="80" y="60" width="10" height="10" /> <!-- Right -->
        <!-- Sticks -->
        <circle class="gp-vis-stick-base" cx="75" cy="30" r="12" />
        <circle id="gp-vis-stick-left" class="gp-vis-stick-top" cx="75" cy="30" r="8" />
        <circle id="gp-vis-btn-10" class="gp-vis-button" cx="75" cy="30" r="3" /> <!-- Left Stick Press -->
        <circle class="gp-vis-stick-base" cx="155" cy="65" r="12" />
        <circle id="gp-vis-stick-right" class="gp-vis-stick-top" cx="155" cy="65" r="8" />
        <circle id="gp-vis-btn-11" class="gp-vis-button" cx="155" cy="65" r="3" /> <!-- Right Stick Press -->
    `;
    gamepadVisContainer.appendChild(gamepadSVG);
    sidebarDiv.appendChild(gamepadVisContainer);
    gamepadToggleButtonElement.addEventListener('click', () => {
        const newState = !isGamepadEnabled;
        console.log(`Dev Sidebar: Toggling gamepad ${newState ? 'ON' : 'OFF'}. Sending via window.postMessage.`);
        window.postMessage({ type: 'gamepadControl', enabled: newState }, window.location.origin);
    });
    advancedAudioSettingsBtnElement = document.createElement('button');
    advancedAudioSettingsBtnElement.id = 'advancedAudioSettingsBtn';
    advancedAudioSettingsBtnElement.textContent = 'Advanced Audio Settings';
    sidebarDiv.appendChild(advancedAudioSettingsBtnElement);
    advancedAudioSettingsBtnElement.addEventListener('click', handleAdvancedAudioClick);
    audioDeviceSettingsDivElement = document.createElement('div');
    audioDeviceSettingsDivElement.id = 'audio-device-settings';
    audioDeviceSettingsDivElement.className = 'dev-setting-item hidden';
    sidebarDiv.appendChild(audioDeviceSettingsDivElement);
    const inputDeviceLabel = document.createElement('label');
    inputDeviceLabel.textContent = 'Audio Input (Microphone):';
    inputDeviceLabel.htmlFor = 'audioInputSelect';
    audioDeviceSettingsDivElement.appendChild(inputDeviceLabel);
    audioInputSelectElement = document.createElement('select');
    audioInputSelectElement.id = 'audioInputSelect';
    audioDeviceSettingsDivElement.appendChild(audioInputSelectElement);
    audioInputSelectElement.addEventListener('change', handleAudioDeviceChange);
    const outputDeviceLabel = document.createElement('label');
    outputDeviceLabel.textContent = 'Audio Output (Speaker):';
    outputDeviceLabel.htmlFor = 'audioOutputSelect';
    outputDeviceLabel.id = 'audioOutputLabel';
    audioDeviceSettingsDivElement.appendChild(outputDeviceLabel);
    audioOutputSelectElement = document.createElement('select');
    audioOutputSelectElement.id = 'audioOutputSelect';
    audioDeviceSettingsDivElement.appendChild(audioOutputSelectElement);
    audioOutputSelectElement.addEventListener('change', handleAudioDeviceChange);

    const resolutionContainer = document.createElement('div');
    resolutionContainer.className = 'dev-setting-item';
    resolutionContainer.style.borderTop = '1px solid #555';
    resolutionContainer.style.paddingTop = '10px';
    resolutionContainer.style.marginTop = '10px';

    const resLabel = document.createElement('label');
    resLabel.textContent = 'Manual Resolution Control:';
    resolutionContainer.appendChild(resLabel);

    const widthContainer = document.createElement('div');
    widthContainer.style.display = 'flex';
    widthContainer.style.alignItems = 'center';
    widthContainer.style.marginBottom = '5px';
    const widthLabel = document.createElement('label');
    widthLabel.textContent = 'Width:';
    widthLabel.style.marginRight = '5px';
    widthLabel.style.width = '50px'; // Align labels
    manualWidthInput = document.createElement('input');
    manualWidthInput.type = 'number';
    manualWidthInput.id = 'manualWidthInput';
    manualWidthInput.min = '1';
    manualWidthInput.step = '2'; // Encourage even numbers
    manualWidthInput.placeholder = 'e.g., 1920';
    manualWidthInput.style.flexGrow = '1';
    manualWidthInput.style.padding = '4px';
    manualWidthInput.style.backgroundColor = '#333';
    manualWidthInput.style.color = '#eee';
    manualWidthInput.style.border = '1px solid #555';
    widthContainer.appendChild(widthLabel);
    widthContainer.appendChild(manualWidthInput);
    resolutionContainer.appendChild(widthContainer);

    const heightContainer = document.createElement('div');
    heightContainer.style.display = 'flex';
    heightContainer.style.alignItems = 'center';
    heightContainer.style.marginBottom = '5px';
    const heightLabel = document.createElement('label');
    heightLabel.textContent = 'Height:';
    heightLabel.style.marginRight = '5px';
    heightLabel.style.width = '50px'; // Align labels
    manualHeightInput = document.createElement('input');
    manualHeightInput.type = 'number';
    manualHeightInput.id = 'manualHeightInput';
    manualHeightInput.min = '1';
    manualHeightInput.step = '2'; // Encourage even numbers
    manualHeightInput.placeholder = 'e.g., 1080';
    manualHeightInput.style.flexGrow = '1';
    manualHeightInput.style.padding = '4px';
    manualHeightInput.style.backgroundColor = '#333';
    manualHeightInput.style.color = '#eee';
    manualHeightInput.style.border = '1px solid #555';
    heightContainer.appendChild(heightLabel);
    heightContainer.appendChild(manualHeightInput);
    resolutionContainer.appendChild(heightContainer);
    const presetContainer = document.createElement('div');
    presetContainer.className = 'dev-setting-item'; // Use existing class for spacing/style
    presetContainer.style.marginBottom = '10px'; // Add some space before manual inputs

    const presetLabel = document.createElement('label');
    presetLabel.textContent = 'Preset:';
    presetLabel.htmlFor = 'resolutionPresetSelect';
    presetContainer.appendChild(presetLabel);

    const resolutionPresetSelect = document.createElement('select');
    resolutionPresetSelect.id = 'resolutionPresetSelect';
    resolutionPresetSelect.style.width = '100%'; // Make it full width like other selects
    resolutionPresetSelect.style.padding = '5px';
    resolutionPresetSelect.style.backgroundColor = '#333';
    resolutionPresetSelect.style.color = '#eee';
    resolutionPresetSelect.style.border = '1px solid #555';
    resolutionPresetSelect.style.marginTop = '3px'; // Small space below label
    const showKeyboardButton = document.createElement('button');
    showKeyboardButton.id = 'devShowKeyboardButton';
    showKeyboardButton.textContent = 'Show Virtual Keyboard';
    showKeyboardButton.style.marginTop = '10px';
    showKeyboardButton.addEventListener('click', () => {
        console.log("Dev Sidebar: Show Keyboard button clicked. Posting 'showVirtualKeyboard' message.");
        window.postMessage({ type: 'showVirtualKeyboard' }, window.location.origin);
    });
    sidebarDiv.appendChild(showKeyboardButton);
    // Define common resolutions [width, height, label]
    const commonResolutions = [
        { value: "", text: "-- Select Preset --" }, // Default option
        { value: "1920x1080", text: "1920 x 1080 (FHD)" },
        { value: "1280x720", text: "1280 x 720 (HD)" },
        { value: "1366x768", text: "1366 x 768 (Laptop)" },
        { value: "1920x1200", text: "1920 x 1200 (16:10)" },
        { value: "2560x1440", text: "2560 x 1440 (QHD)" },
        { value: "3840x2160", text: "3840 x 2160 (4K UHD)" },
        { value: "1024x768", text: "1024 x 768 (XGA 4:3)" },
        { value: "800x600", text: "800 x 600 (SVGA 4:3)" },
        { value: "640x480", text: "640 x 480 (VGA 4:3)" },
        { value: "320x240", text: "320 x 240 (QVGA 4:3)" },
    ];

    // Populate the dropdown
    commonResolutions.forEach((res, index) => {
        const option = document.createElement('option');
        option.value = res.value;
        option.textContent = res.text;
        if (index === 0) {
            option.disabled = true; // Disable the placeholder
            option.selected = true; // Make it selected by default
        }
        resolutionPresetSelect.appendChild(option);
    });

    // Add event listener for the dropdown
    resolutionPresetSelect.addEventListener('change', (event) => {
        const selectedValue = event.target.value;
        if (!selectedValue) {
            return;
        }

        const parts = selectedValue.split('x');
        if (parts.length === 2) {
            const width = parseInt(parts[0], 10);
            const height = parseInt(parts[1], 10);

            if (!isNaN(width) && width > 0 && !isNaN(height) && height > 0) {
                console.log(`Dev Sidebar: Preset selected: ${width}x${height}. Updating inputs and posting message.`);

                // Update the manual input boxes visually
                manualWidthInput.value = width;
                manualHeightInput.value = height;

                // Post the message to trigger the same logic as the button
                window.postMessage({ type: 'setManualResolution', width: width, height: height }, window.location.origin);

            } else {
                console.error("Error parsing selected resolution preset:", selectedValue);
            }
        }
    });

    presetContainer.appendChild(resolutionPresetSelect);
    resolutionContainer.insertBefore(presetContainer, widthContainer);
    const scaleContainer = document.createElement('div');
    scaleContainer.style.display = 'flex';
    scaleContainer.style.alignItems = 'center';
    scaleContainer.style.marginBottom = '10px';
    scaleLocallyCheckbox = document.createElement('input');
    scaleLocallyCheckbox.type = 'checkbox';
    scaleLocallyCheckbox.id = 'scaleLocallyCheckbox';
    scaleLocallyCheckbox.checked = scaleLocallyManual; // Set initial state from persisted value
    scaleLocallyCheckbox.style.marginRight = '8px';
    const scaleLabel = document.createElement('label');
    scaleLabel.textContent = 'Scale Locally (Maintain Aspect Ratio)';
    scaleLabel.htmlFor = 'scaleLocallyCheckbox';
    scaleContainer.appendChild(scaleLocallyCheckbox);
    scaleContainer.appendChild(scaleLabel);
    resolutionContainer.appendChild(scaleContainer);

    setResolutionButton = document.createElement('button');
    setResolutionButton.id = 'setResolutionBtn';
    setResolutionButton.textContent = 'Set Manual Resolution';
    resolutionContainer.appendChild(setResolutionButton);

    resetResolutionButton = document.createElement('button');
    resetResolutionButton.id = 'resetResolutionBtn';
    resetResolutionButton.textContent = 'Reset to Window Size';
    resolutionContainer.appendChild(resetResolutionButton);

    sidebarDiv.appendChild(resolutionContainer);

    scaleLocallyCheckbox.addEventListener('change', (event) => {
        const isChecked = event.target.checked;
        console.log(`Dev Sidebar: Scale Locally checkbox changed to ${isChecked}. Posting message.`);
        window.postMessage({ type: 'setScaleLocally', value: isChecked }, window.location.origin);
    });

    setResolutionButton.addEventListener('click', () => {
        const widthVal = manualWidthInput.value.trim();
        const heightVal = manualHeightInput.value.trim();
        const width = parseInt(widthVal, 10);
        const height = parseInt(heightVal, 10);

        if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
            alert('Please enter valid positive integers for Width and Height.');
            console.error('Invalid manual resolution input:', { widthVal, heightVal });
            return;
        }

        console.log(`Dev Sidebar: Set Resolution button clicked. Width: ${width}, Height: ${height}. Posting message.`);
        window.postMessage({ type: 'setManualResolution', width: width, height: height }, window.location.origin);
    });

    resetResolutionButton.addEventListener('click', () => {
        console.log('Dev Sidebar: Reset Resolution button clicked. Posting message.');
        window.postMessage({ type: 'resetResolutionToWindow' }, window.location.origin);
        manualWidthInput.value = '';
        manualHeightInput.value = '';
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
    const uploadButton = document.createElement('button');
    uploadButton.id = 'devUploadButton';
    uploadButton.textContent = 'Upload File(s)';
    uploadButton.addEventListener('click', () => {
        console.log("Dev sidebar upload button clicked, dispatching requestFileUpload event.");
        window.dispatchEvent(new CustomEvent('requestFileUpload'));
    });
    sidebarDiv.appendChild(uploadButton);


  } // End if(dev_mode)

  appDiv.appendChild(videoContainer);
  if (dev_mode) {
    appDiv.appendChild(sidebarDiv);
  }

  videoBitRate = getIntParam('videoBitRate', videoBitRate);
  videoFramerate = getIntParam('videoFramerate', videoFramerate);
  audioBitRate = getIntParam('audioBitRate', audioBitRate);
  resizeRemote = getBoolParam('resizeRemote', resizeRemote);
  debug = getBoolParam('debug', debug);
  turnSwitch = getBoolParam('turnSwitch', turnSwitch);
  videoBufferSize = getIntParam('videoBufferSize', 0);

  scaleLocallyManual = getBoolParam('scaleLocallyManual', true);
  if (dev_mode && scaleLocallyCheckbox) {
      scaleLocallyCheckbox.checked = scaleLocallyManual;
  }


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

async function handleAdvancedAudioClick() {
    console.log("Advanced Audio Settings button clicked.");
    if (!audioDeviceSettingsDivElement || !audioInputSelectElement || !audioOutputSelectElement) {
        console.error("Audio device UI elements not found in dev sidebar.");
        return;
    }
    // Check if the settings are currently hidden
    const isHidden = audioDeviceSettingsDivElement.classList.contains('hidden');
    if (isHidden) {
        console.log("Settings are hidden, attempting to show and populate...");
        // Check for setSinkId support for output selection
        const supportsSinkId = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
        const outputLabel = document.getElementById('audioOutputLabel');
        if (!supportsSinkId) {
            console.warn('Browser does not support selecting audio output device (setSinkId). Hiding output selection.');
            if (outputLabel) outputLabel.classList.add('hidden');
            audioOutputSelectElement.classList.add('hidden');
            return;
        } else {
            if (outputLabel) outputLabel.classList.remove('hidden');
            audioOutputSelectElement.classList.remove('hidden');
        }
        try {
            // Request temporary microphone permission to get device labels
            console.log("Requesting microphone permission for device listing...");
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            tempStream.getTracks().forEach(track => track.stop());
            console.log("Microphone permission granted or already available (temporary stream stopped).");
            console.log("Enumerating media devices...");
            const devices = await navigator.mediaDevices.enumerateDevices();
            console.log("Devices found:", devices);
            // Clear existing options
            audioInputSelectElement.innerHTML = '';
            audioOutputSelectElement.innerHTML = '';
            // Populate dropdowns
            let inputCount = 0;
            let outputCount = 0;
            devices.forEach(device => {
                if (device.kind === 'audioinput') {
                    inputCount++;
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Microphone ${inputCount}`;
                    audioInputSelectElement.appendChild(option);
                } else if (device.kind === 'audiooutput' && supportsSinkId) {
                    outputCount++;
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Speaker ${outputCount}`;
                    audioOutputSelectElement.appendChild(option);
                }
            });

            console.log(`Populated ${inputCount} input devices and ${outputCount} output devices.`);
            // Make the container visible
            audioDeviceSettingsDivElement.classList.remove('hidden');

        } catch (err) {
            console.error('Error getting media devices or permissions:', err);
            // Keep it hidden and inform the user
            audioDeviceSettingsDivElement.classList.add('hidden');
            alert(`Could not list audio devices. Please ensure microphone permissions are granted.\nError: ${err.message || err.name}`);
        }
    } else {
        console.log("Settings are visible, hiding...");
        audioDeviceSettingsDivElement.classList.add('hidden');
    }
}

function handleAudioDeviceChange(event) {
    const selectedDeviceId = event.target.value;
    const isInput = event.target.id === 'audioInputSelect';
    const contextType = isInput ? 'input' : 'output';
    console.log(`Dev Sidebar: Audio device selected - Type: ${contextType}, ID: ${selectedDeviceId}. Posting message...`);
    window.postMessage({
        type: 'audioDeviceSelected',
        context: contextType,
        deviceId: selectedDeviceId
    }, window.location.origin);
}

function handleRequestFileUpload() {
    const hiddenInput = document.getElementById('globalFileInput');
    if (!hiddenInput) {
        console.error("Global file input not found!");
        return;
    }
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket is not open. File upload cannot be initiated.");
        return;
    }
    console.log("Triggering click on hidden file input.");
    hiddenInput.click();
}

async function handleFileInputChange(event) {
    const files = event.target.files;
    if (!files || files.length === 0) {
        // Clear the input value in case the user cancels
        event.target.value = null;
        return;
    }

    console.log(`File input changed, processing ${files.length} files sequentially.`);

    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
         console.error("WebSocket is not open. Cannot upload selected files.");
         // Maybe post an error message?
         window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: 'N/A', message: "WebSocket not open for upload." } }, window.location.origin);
         event.target.value = null; 
         return;
    }

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const pathToSend = file.name;
            console.log(`Uploading file ${i + 1}/${files.length}: ${pathToSend}`);
            // Await the upload of each file before starting the next
            await uploadFileObject(file, pathToSend);
        }
        console.log("Finished processing all files from input.");
    } catch (error) {
        const errorMsg = `An error occurred during the file input upload process: ${error.message || error}`;
        console.error(errorMsg);
         window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: 'N/A', message: errorMsg } }, window.location.origin);
         if (websocket && websocket.readyState === WebSocket.OPEN) {
              try { websocket.send(`FILE_UPLOAD_ERROR:GENERAL:File input processing failed`); } catch (_) {}
         }
    } finally {
         event.target.value = null;
    }
}

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

  // This function now calculates the container size for auto-resize purposes
  inputInstance.getWindowResolution = () => {
     const videoContainer = document.querySelector('.video-container');
     if (!videoContainer) {
          console.warn('video-container not found, using window size for resolution.');
          // Return raw window size, let the caller handle rounding if needed
          return [window.innerWidth, window.innerHeight];
     }
     const videoContainerRect = videoContainer.getBoundingClientRect();
     // Return raw container size, let the caller handle rounding if needed
     return [videoContainerRect.width, videoContainerRect.height];
  };


  inputInstance.ongamepadconnected = (gamepad_id) => {
    gamepad.gamepadState = 'connected';
    gamepad.gamepadName = gamepad_id;
    if (window.webrtcInput && window.webrtcInput.gamepadManager) {
        if (!isGamepadEnabled) {
            window.webrtcInput.gamepadManager.disable();
        }
    } else {
        console.error("Gamepad connected callback fired, but gamepadManager instance not found on webrtcInput.");
    }
  };

  inputInstance.ongamepaddisconnected = () => {
    gamepad.gamepadState = 'disconnected';
    gamepad.gamepadName = 'none';
  };
  inputInstance.attach();

  // Define the actual resize logic
  const handleResizeUI = () => {
    if (window.isManualResolutionMode) {
        console.log("Auto-resize skipped: Manual resolution mode active.");
        return;
    }
    console.log("Auto-resize triggered.");
    const windowResolution = inputInstance.getWindowResolution();
    // Ensure resolution sent to server is even
    const evenWidth = roundDownToEven(windowResolution[0]);
    const evenHeight = roundDownToEven(windowResolution[1]);

    // Send the calculated resolution to the server
    sendResolutionToServer(evenWidth, evenHeight);

    // Reset canvas style to fill container when auto-resizing
    resetCanvasStyle();
  };

  originalWindowResizeHandler = debounce(handleResizeUI, 500);

  // Add the listener initially
  window.addEventListener('resize', originalWindowResizeHandler);

  // Trigger initial resize calculation if not in manual mode
  if (!window.isManualResolutionMode) {
    handleResizeUI();
  }

  if (clientMode === 'webrtc') {
    if (webrtc) {
      webrtc.input = inputInstance;
    }
  }

  overlayInput.addEventListener('dragover', handleDragOver);
  overlayInput.addEventListener('drop', handleDrop);

  window.webrtcInput = inputInstance;
  const keyboardInputAssist = document.getElementById('keyboard-input-assist');
  if (keyboardInputAssist && inputInstance) { // Check if both exist
      keyboardInputAssist.addEventListener('input', (event) => {
          const typedString = keyboardInputAssist.value;
          console.log(`Input event on assist: Value="${typedString}"`);

          if (typedString) {
              inputInstance._typeString(typedString);
              keyboardInputAssist.value = ''; // Clear after processing
          }
      });

      keyboardInputAssist.addEventListener('keydown', (event) => {
           if (event.key === 'Enter' || event.keyCode === 13) {
               console.log("Enter keydown detected on assist input.");
               const enterKeysym = 0xFF0D;
               inputInstance._guac_press(enterKeysym);
               setTimeout(() => inputInstance._guac_release(enterKeysym), 5);
               event.preventDefault();
               keyboardInputAssist.value = '';
           }
           else if (event.key === 'Backspace' || event.keyCode === 8) {
               console.log("Backspace keydown detected on assist input.");
               const backspaceKeysym = 0xFF08;
               inputInstance._guac_press(backspaceKeysym);
               setTimeout(() => inputInstance._guac_release(backspaceKeysym), 5);
               event.preventDefault();
           }
      });

      console.log("Added 'input' and 'keydown' listeners to #keyboard-input-assist.");

  } else {
      console.error("Could not add listeners to keyboard assist: Element or Input handler instance not found inside initializeInput.");
  }
};

/**
 * Attempts to apply the preferredOutputDeviceId to the playback audio context
 * and the audio element.
 */
async function applyOutputDevice() {
    if (!preferredOutputDeviceId) {
        console.log("No preferred output device set, using default.");
        return;
    }

    const supportsSinkId = (typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype) ||
                           (audioElement && typeof audioElement.setSinkId === 'function');

    if (!supportsSinkId) {
        console.warn("Browser does not support setSinkId, cannot apply output device preference.");
        // Hide the output selection UI elements if they exist and haven't been hidden already
        if (audioOutputSelectElement) audioOutputSelectElement.classList.add('hidden');
        const outputLabel = document.getElementById('audioOutputLabel');
        if (outputLabel) outputLabel.classList.add('hidden');
        return;
    }        

    // Apply to Playback AudioContext
    if (audioContext) {
        if (audioContext.state === 'running') {
            try {
                // Check if the current sinkId is already the preferred one
                await audioContext.setSinkId(preferredOutputDeviceId);
                console.log(`Playback AudioContext output set to device: ${preferredOutputDeviceId}`);
            } catch (err) {
                console.error(`Error setting sinkId on Playback AudioContext (ID: ${preferredOutputDeviceId}): ${err.name}`, err);
            }
        } else {
             console.warn(`Playback AudioContext not running (state: ${audioContext.state}), cannot set sinkId yet.`);
        }
    } else {
        console.log("Playback AudioContext doesn't exist yet, sinkId will be applied on initialization.");
    }

    // Apply to <audio> element (for redundancy or direct playback scenarios)
    if (audioElement && typeof audioElement.setSinkId === 'function') {
        try {
            if (audioElement.sinkId !== preferredOutputDeviceId) {
                await audioElement.setSinkId(preferredOutputDeviceId);
                console.log(`<audio> element output set to device: ${preferredOutputDeviceId}`);
            }
        } catch (err) {
            console.error(`Error setting sinkId on <audio> element (ID: ${preferredOutputDeviceId}): ${err.name}`, err);
        }
    }
}


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

function postSidebarButtonUpdate() {
    // Gather current states
    const updatePayload = {
        type: 'sidebarButtonStatusUpdate',
        video: isVideoPipelineActive,
        audio: isAudioPipelineActive,
        microphone: isMicrophoneActive,
        gamepad: isGamepadEnabled
    };
    console.log('Posting sidebarButtonStatusUpdate:', updatePayload);
    window.postMessage(updatePayload, window.location.origin);
}

function receiveMessage(event) {
    // 1. Origin Check (Security)
    if (event.origin !== window.location.origin) {
        console.warn(`Received message from unexpected origin: ${event.origin}. Expected ${window.location.origin}. Ignoring.`);
        return;
    }

    const message = event.data;

    // 2. Message Type Check (Basic Validation)
    if (typeof message !== 'object' || message === null) {
        console.warn('Received non-object message via window.postMessage:', message);
        return;
    }

    if (!message.type) {
        console.warn('Received message without a type property:', message);
        return;
    }

    // 3. Message Handling based on type

    switch (message.type) {
        case 'setScaleLocally':
            if (typeof message.value === 'boolean') {
                scaleLocallyManual = message.value;
                setBoolParam('scaleLocallyManual', scaleLocallyManual); // Persist the setting
                console.log(`Set scaleLocallyManual to ${scaleLocallyManual} and persisted.`);
                // If we are currently in manual mode, re-apply the style immediately
                if (window.isManualResolutionMode && manualWidth !== null && manualHeight !== null) {
                    console.log("Applying new scaling style in manual mode.");
                    applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
                }
                // Update checkbox UI element if it exists (safety check)
                if (dev_mode && scaleLocallyCheckbox && scaleLocallyCheckbox.checked !== scaleLocallyManual) {
                    scaleLocallyCheckbox.checked = scaleLocallyManual;
                }
            } else {
                console.warn("Invalid value received for setScaleLocally:", message.value);
            }
            break;

        case 'showVirtualKeyboard':
            console.log("Received 'showVirtualKeyboard' message.");
            const kbdAssistInput = document.getElementById('keyboard-input-assist');
            if (kbdAssistInput) {
                kbdAssistInput.value = '';
                kbdAssistInput.focus();
                console.log("Focused #keyboard-input-assist element.");
            } else {
                console.error("Could not find #keyboard-input-assist element to focus.");
            }
            break;

        case 'setManualResolution':
            // Validation already happened in the UI event listener, but double-check here
            const width = parseInt(message.width, 10);
            const height = parseInt(message.height, 10);

            if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
                console.error('Received invalid width/height for setManualResolution:', message);
                break;
            }

            console.log(`Setting manual resolution: ${width}x${height}`);
            window.isManualResolutionMode = true;
            manualWidth = roundDownToEven(width);
            manualHeight = roundDownToEven(height);
            console.log(`Rounded resolution to even numbers: ${manualWidth}x${manualHeight}`);

            disableAutoResize(); // Stop listening to window resize
            sendResolutionToServer(manualWidth, manualHeight); // Send new res to server
            applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual); // Apply local styling

            // Visually update input fields if they differ from rounded values
            if (dev_mode) {
                if (manualWidthInput.value !== manualWidth.toString()) manualWidthInput.value = manualWidth;
                if (manualHeightInput.value !== manualHeight.toString()) manualHeightInput.value = manualHeight;
            }
            break;

        case 'resetResolutionToWindow':
            console.log("Resetting resolution to window size.");
            window.isManualResolutionMode = false;
            manualWidth = null;
            manualHeight = null;

            resetCanvasStyle(); // Reset local canvas styling first
            enableAutoResize(); // Re-enable listener and trigger immediate resize

            break;

        case 'clipboardContentUpdate':
            if (dev_mode) {
                serverClipboardContent = message.text;
                 if(serverClipboardTextareaElement) serverClipboardTextareaElement.value = message.text;
                console.log('Updated dev sidebar clipboard textarea from server.');
             }
             break;
        case 'settings':
            console.log('Received settings message:', message.settings);
            handleSettingsMessage(message.settings);
            break;

        case 'getStats':
            console.log('Received getStats message.');
            sendStatsMessage();
            break;

        case 'clipboardUpdateFromUI':
            console.log('Received clipboardUpdateFromUI message.');
            const newClipboardText = message.text;
            if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
                try {
                    const encodedText = btoa(newClipboardText); // Base64 encode
                    const clipboardMessage = `cw,${encodedText}`; // Prepend type
                    websocket.send(clipboardMessage);
                    console.log(`Sent clipboard update from UI to server: cw,...`);
                } catch (e) {
                    console.error('Failed to encode or send clipboard text from UI:', e);
                }
            } else if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
                try {
                    const encodedText = btoa(newClipboardText); // Base64 encode
                    const clipboardMessage = `cw,${encodedText}`; // Prepend type
                    webrtc.sendDataChannelMessage(clipboardMessage);
                    console.log(`Sent clipboard update from UI to server via WebRTC: cw,...`);
                } catch (e) {
                    console.error('Failed to encode or send clipboard text from UI via WebRTC:', e);
                }
            }
             else {
                console.warn('Cannot send clipboard update from UI: Not connected.');
            }
            break;

        case 'pipelineStatusUpdate':
            console.log('Received pipelineStatusUpdate message:', message);
            let stateChangedFromStatus = false;
            if (message.video !== undefined && isVideoPipelineActive !== message.video) {
                console.log(`pipelineStatusUpdate: Updating isVideoPipelineActive to ${message.video}`);
                isVideoPipelineActive = message.video;
                stateChangedFromStatus = true;
            }
            if (message.audio !== undefined && isAudioPipelineActive !== message.audio) {
                console.log(`pipelineStatusUpdate: Updating isAudioPipelineActive to ${message.audio}`);
                isAudioPipelineActive = message.audio;
                stateChangedFromStatus = true;
            }
            if (message.microphone !== undefined && isMicrophoneActive !== message.microphone) {
                console.log(`pipelineStatusUpdate: Updating isMicrophoneActive to ${message.microphone}`);
                isMicrophoneActive = message.microphone;
                stateChangedFromStatus = true;
            }
            if (message.gamepad !== undefined && isGamepadEnabled !== message.gamepad) {
                console.log(`pipelineStatusUpdate: Updating isGamepadEnabled to ${message.gamepad}`);
                isGamepadEnabled = message.gamepad;
                stateChangedFromStatus = true;
            }

            if (stateChangedFromStatus) {
                console.log("pipelineStatusUpdate: State changed, posting sidebar button update.");
                postSidebarButtonUpdate();
            } else {
                 console.log("pipelineStatusUpdate: No relevant state change detected.");
            }
            break;

        case 'fileUpload':
            console.log('Received fileUpload message:', message.payload);
            updateSidebarUploadProgress(message.payload);
            break;

        case 'pipelineControl':
            console.log(`Received pipeline control message: pipeline=${message.pipeline}, enabled=${message.enabled}`);
            const pipeline = message.pipeline;
            const desiredState = message.enabled;
            let stateChangedFromControl = false;

            if (pipeline === 'video' || pipeline === 'audio') {
                let wsMessage = '';
                if (pipeline === 'video') {
                    if (isVideoPipelineActive !== desiredState) {
                        isVideoPipelineActive = desiredState;
                        console.log(`pipelineControl: Immediately updating isVideoPipelineActive to ${isVideoPipelineActive}`);
                        stateChangedFromControl = true;
                        if (!isVideoPipelineActive) { cleanupVideoBuffer(); }
                        wsMessage = desiredState ? 'START_VIDEO' : 'STOP_VIDEO';
                    }
                } else if (pipeline === 'audio') {
                     if (isAudioPipelineActive !== desiredState) {
                        isAudioPipelineActive = desiredState;
                        console.log(`pipelineControl: Immediately updating isAudioPipelineActive to ${isAudioPipelineActive}`);
                        stateChangedFromControl = true;
                        wsMessage = desiredState ? 'START_AUDIO' : 'STOP_AUDIO';
                     }
                }
                if (stateChangedFromControl) {
                    postSidebarButtonUpdate();
                }
                if (wsMessage && clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
                    console.log(`pipelineControl: Sending ${wsMessage} via websocket.`);
                    websocket.send(wsMessage);
                } else if (wsMessage) {
                     console.warn(`Cannot send ${pipeline} pipelineControl command: Not in websockets mode or websocket not open.`);
                }

            } else if (pipeline === 'microphone') {
                if (desiredState) {
                    startMicrophoneCapture();
                } else {
                    stopMicrophoneCapture();
                }
            } else {
                 console.warn(`Received pipelineControl message for unknown pipeline: ${pipeline}`);
            }
            break;

        case 'sidebarButtonStatusUpdate':
            console.log('Received sidebarButtonStatusUpdate:', message);
            if (dev_mode) {
                console.log('Dev mode enabled, updating sidebar button appearances.');
                if (message.video !== undefined && videoToggleButtonElement) {
                     updateToggleButtonAppearance(videoToggleButtonElement, message.video);
                }
                if (message.audio !== undefined && audioToggleButtonElement) {
                    updateToggleButtonAppearance(audioToggleButtonElement, message.audio);
                }
                 if (message.microphone !== undefined && micToggleButtonElement) {
                    updateToggleButtonAppearance(micToggleButtonElement, message.microphone);
                }
                 if (message.gamepad !== undefined && gamepadToggleButtonElement) {
                    updateToggleButtonAppearance(gamepadToggleButtonElement, message.gamepad);
                }
            } else {
                 console.log('Dev mode not enabled, skipping sidebar button UI update.');
            }
            break;

        case 'audioDeviceSelected':
            console.log('Received audioDeviceSelected message:', message);
            const { context, deviceId } = message;
            if (!deviceId) {
                console.warn("Received audioDeviceSelected message without a deviceId.");
                break;
            }
            if (context === 'input') {
                console.log(`Setting preferred input device to: ${deviceId}`);
                if (dev_mode && audioInputSelectElement && audioInputSelectElement.value !== deviceId) {
                    audioInputSelectElement.value = deviceId;
                }
                if (preferredInputDeviceId !== deviceId) {
                     preferredInputDeviceId = deviceId;
                     if (isMicrophoneActive) {
                         console.log("Microphone is active, restarting to apply new input device...");
                         stopMicrophoneCapture();
                         setTimeout(startMicrophoneCapture, 150);
                     }
                }
            } else if (context === 'output') {
                 console.log(`Setting preferred output device to: ${deviceId}`);
                 if (dev_mode && audioOutputSelectElement && audioOutputSelectElement.value !== deviceId) {
                     audioOutputSelectElement.value = deviceId;
                 }
                 if (preferredOutputDeviceId !== deviceId) {
                     preferredOutputDeviceId = deviceId;
                     applyOutputDevice();
                 }
            } else {
                console.warn(`Unknown context in audioDeviceSelected message: ${context}`);
            }
            break;

        case 'gamepadControl':
            console.log(`Received gamepad control message: enabled=${message.enabled}`);
            const newGamepadState = message.enabled;
            if (isGamepadEnabled !== newGamepadState) {
                isGamepadEnabled = newGamepadState;
                postSidebarButtonUpdate(); // Post update for UI consistency

                if (window.webrtcInput && window.webrtcInput.gamepadManager) {
                    if (isGamepadEnabled) {
                        window.webrtcInput.gamepadManager.enable();
                        console.log("Gamepad input enabled.");
                    } else {
                        window.webrtcInput.gamepadManager.disable();
                        console.log("Gamepad input disabled.");
                    }
                } else {
                    console.warn("Could not toggle gamepad state: window.webrtcInput or gamepadManager not found.");
                }
            }
            break;

        case 'gamepadButtonUpdate':
        case 'gamepadAxisUpdate':
             if (message.gamepadIndex === 0) {
                 if (!gamepadStates[0]) gamepadStates[0] = { buttons: {}, axes: {} };
                 if (message.type === 'gamepadButtonUpdate') {
                     const { buttonIndex, value } = message;
                     if (!gamepadStates[0].buttons) gamepadStates[0].buttons = {};
                     gamepadStates[0].buttons[buttonIndex] = value;
                 } else {
                     const { axisIndex, value } = message;
                     if (!gamepadStates[0].axes) gamepadStates[0].axes = {};
                     const clampedValue = Math.max(-1, Math.min(1, value));
                     gamepadStates[0].axes[axisIndex] = clampedValue;
                 }
                 updateGamepadVisuals(0);
             }
            break;

        case 'requestFullscreen':
            console.log('Received requestFullscreen message. Calling enterFullscreen().');
            enterFullscreen();
            break;

        case 'serverSettings':
            if (dev_mode) {
                console.log('Received server_settings payload:', message);
                // --- Handle Encoders Setting ---
                if (message && message.hasOwnProperty('encoders') && Array.isArray(message.encoders)) {
                    const serverSupportedEncoders = message.encoders;
                    console.log('Server supported encoders:', serverSupportedEncoders);

                    // Ensure encoderSelectElement is available
                    if (typeof encoderSelectElement !== 'undefined' && encoderSelectElement) {
                        // Clear existing options from the dropdown
                        while (encoderSelectElement.firstChild) {
                            encoderSelectElement.removeChild(encoderSelectElement.firstChild);
                        }
                        // Populate dropdown with encoders sent by the server
                        if (serverSupportedEncoders.length > 0) {
                            serverSupportedEncoders.forEach(encoder => {
                                const option = document.createElement('option');
                                option.value = encoder;
                                option.textContent = encoder;
                                encoderSelectElement.appendChild(option);
                            });
                            encoderSelectElement.value = serverSupportedEncoders[0];
                            console.log('Encoder dropdown updated with server-provided options.');
                        } else {
                            // Handle the case where the server provides an empty list of encoders
                            const option = document.createElement('option');
                            option.value = ""; // No value
                            option.textContent = "No encoders available from server";
                            option.disabled = true; // Make it unselectable
                            encoderSelectElement.appendChild(option);
                            console.warn('Server provided an empty list of encoders.');
                        }
                    } else {
                        console.warn('encoderSelectElement is not defined or not found. Cannot update encoder dropdown.');
                    }
                } else {
                    console.log('No "encoders" array found in server_settings payload, or it is not an array. Encoder dropdown will not be updated by the server.');
                }
            }
            break;

        default:
            console.warn('Received unknown message type via window.postMessage:', message.type, message);
            break;
    }

}

function updateGamepadVisuals(gamepadIndex) {
    if (gamepadIndex !== 0 || !dev_mode) return; // Only visualize the first gamepad

    const state = gamepadStates[0];
    if (!state) return; // No state for this gamepad yet

    const svg = document.getElementById('gamepad-svg-vis');
    if (!svg) return; // SVG not found

    // --- Update Buttons (including bumpers, dpad, stick clicks) ---
    for (let i = 0; i <= 15; i++) { // Standard buttons 0-15
        const buttonElement = svg.querySelector(`#gp-vis-btn-${i}`);
        if (buttonElement) {
            const value = state.buttons?.[i] || 0;
            const pressed = value > GAMEPAD_VIS_THRESHOLD;

            // Special handling for Triggers (opacity)
            if (i === 6 || i === 7) { // LT (6), RT (7)
                 buttonElement.style.opacity = 0.5 + (value * 0.5);
            }
            // Handling for Bumpers, DPad, Face Buttons, Stick Clicks (toggle class)
            else if ([0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15].includes(i)) {
                if (pressed) {
                    // Use specific classes based on type for potential style differences
                    if (i >= 12) buttonElement.classList.add('gp-vis-dpad-pressed');
                    else if (i === 4 || i === 5) buttonElement.classList.add('gp-vis-bumper-pressed');
                    else buttonElement.classList.add('gp-vis-button-pressed');
                } else {
                    buttonElement.classList.remove('gp-vis-button-pressed', 'gp-vis-dpad-pressed', 'gp-vis-bumper-pressed');
                }
            }
        }
    }

    // --- Update Sticks ---
    const leftStickElement = svg.querySelector('#gp-vis-stick-left');
    const rightStickElement = svg.querySelector('#gp-vis-stick-right');

    if (leftStickElement) {
        const x = state.axes?.[0] || 0; // Axis 0: Left Stick X
        const y = state.axes?.[1] || 0; // Axis 1: Left Stick Y
        const translateX = x * STICK_VIS_MULTIPLIER;
        const translateY = y * STICK_VIS_MULTIPLIER;
        leftStickElement.style.transform = `translate(${translateX}px, ${translateY}px)`;
    }

    if (rightStickElement) {
        const x = state.axes?.[2] || 0; // Axis 2: Right Stick X
        const y = state.axes?.[3] || 0; // Axis 3: Right Stick Y
        const translateX = x * STICK_VIS_MULTIPLIER;
        const translateY = y * STICK_VIS_MULTIPLIER;
        rightStickElement.style.transform = `translate(${translateX}px, ${translateY}px)`;
    }
}

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
         // Add option if it doesn't exist
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
       console.warn("ResizeRemote setting received, but not sending to server in websockets mode (not implemented).");
    }
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
    isMicrophoneActive: isMicrophoneActive,
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
      updateToggleButtonAppearance(micToggleButtonElement, isMicrophoneActive);
      updateToggleButtonAppearance(gamepadToggleButtonElement, isGamepadEnabled);
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
    // Check if canvas exists and context is available
    if (!canvas || !canvasContext) {
        requestAnimationFrame(paintVideoFrame); // Still request next frame
        return;
    }

    // Only paint if the tab is visible, the video pipeline is active,
    if (!document.hidden && isVideoPipelineActive && videoFrameBuffer.length > videoBufferSize) {
        const frameToPaint = videoFrameBuffer.shift();

        if (frameToPaint) {
            if (canvas.width !== frameToPaint.codedWidth || canvas.height !== frameToPaint.codedHeight) {
                 canvas.width = frameToPaint.codedWidth;
                 canvas.height = frameToPaint.codedHeight;
                 console.log(`Canvas internal buffer resized to ${canvas.width}x${canvas.height} to match video frame`);
            }

            // Draw the frame to the canvas buffer
            canvasContext.drawImage(frameToPaint, 0, 0, canvas.width, canvas.height);

            // Close the frame to release resources
            frameToPaint.close();

            // FPS calculation logic
            frameCount++;
            const now = performance.now();
            const elapsed = now - lastFpsUpdateTime;
            if (elapsed >= 1000) {
                const currentFps = (frameCount * 1000) / elapsed;
                window.fps = Math.round(currentFps);
                frameCount = 0;
                lastFpsUpdateTime = now;
            }

            // Start stream / initialize input if this is the first frame
            if (!streamStarted) {
                startStream();
                initializeInput(); // Input init depends on stream starting/overlay being ready
            }
        }
    } else {
         // If not painting, still update the buffer display in dev mode
         if (dev_mode && videoBufferDivElement) {
             let reason = "";
             if(document.hidden) reason = "(Tab Hidden)";
             else if (!isVideoPipelineActive) reason = "(Pipeline Inactive)";
             else if (videoFrameBuffer.length <= videoBufferSize) reason = `(Buffering ${videoFrameBuffer.length}/${videoBufferSize+1})`;
             videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames ${reason}`;
         }
         if (canvasContext && (document.hidden || !isVideoPipelineActive)) {
             canvasContext.clearRect(0, 0, canvas.width, canvas.height);
         }
    }

    // Request the next frame unconditionally
    requestAnimationFrame(paintVideoFrame);
  }

  async function initializeAudio() {
    if (!audioContext) {
      const contextOptions = {
          sampleRate: 48000,
      };

      audioContext = new (window.AudioContext || window.webkitAudioContext)(contextOptions);
      console.log(
        'Playback AudioContext initialized with options:', contextOptions,
        'Actual sampleRate:', audioContext.sampleRate,
        'Initial state:', audioContext.state
      );
       // Handle state changes (e.g., if it starts suspended and resumes later)
       audioContext.onstatechange = () => {
           console.log(`Playback AudioContext state changed to: ${audioContext.state}`);
           // Re-apply sinkId if it becomes running, in case it wasn't set before
           if (audioContext.state === 'running') {
               applyOutputDevice();
           }
       };
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
      console.log('Playback AudioWorkletProcessor initialized and connected.');

      await applyOutputDevice();

    } catch (error) {
      console.error('Error initializing Playback AudioWorklet:', error);
      if (audioContext && audioContext.state !== 'closed') {
          audioContext.close(); // Clean up context if worklet failed
      }
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
      // Check again if initialization failed
      if (!audioContext) {
           console.warn("Playback AudioContext initialization failed, dropping audio frame.");
           frame.close();
           return;
      }
    }

    if (!audioContext || !audioWorkletProcessorPort) {
      console.log('Playback Audio context or AudioWorkletProcessor not available, waiting for user interaction!');
      frame.close();
      return;
    }

    if (audioContext.state !== 'running') {
      console.warn('Playback AudioContext state is:', audioContext.state, '. Attempting resume...');
      try {
          await audioContext.resume();
          await applyOutputDevice();
          frame.close();
          return;
      } catch (resumeError) {
           console.error('Failed to resume Playback AudioContext:', resumeError, ' Dropping audio frame.');
           frame.close();
           return;
      }
    }

    try {
      const numberOfChannels = frame.numberOfChannels;
      const sampleCount = frame.numberOfFrames;

      const pcmData = new Float32Array(sampleCount * numberOfChannels);
      const copyOptions = { format: 'f32', planeIndex: 0 };

      // Assuming interleaved f32 format from decoder:
      await frame.copyTo(pcmData, copyOptions);

      audioWorkletProcessorPort.postMessage({ audioData: pcmData });

      frame.close();

      if (!streamStarted) {
        startStream();
        initializeInput();
      }
    } catch (error) {
      console.error('Playback audio processing error:', error);
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
        console.warn("Playback AudioDecoder already exists, closing before re-initializing.");
        decoderAudio.close();
    }
    decoderAudio = new AudioDecoder({
      output: handleAudio, // Uses the playback handler
      error: (e) => {
        console.error('Playback AudioDecoder error:', e.message);
         if (e.message.includes('fatal')) {
            console.warn('Attempting to reset Playback AudioDecoder due to fatal error.');
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
           console.log('Playback AudioDecoder configured successfully.');
       } else {
           console.error('Playback AudioDecoder configuration not supported:', support);
           decoderAudio = null;
       }
    } catch (e) {
      console.error('Error configuring Playback AudioDecoder:', e);
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
          if (audioWorkletProcessorPort) { // Playback worklet port
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
    isVideoPipelineActive = true; // Assume pipelines start active on new connection
    isAudioPipelineActive = true;
    window.postMessage({ type: 'pipelineStatusUpdate', video: true, audio: true }, window.location.origin);
    isMicrophoneActive = false; // Mic should always start off
    updateToggleButtonAppearance(micToggleButtonElement, isMicrophoneActive);

    if (metricsIntervalId === null) {
        metricsIntervalId = setInterval(sendClientMetrics, METRICS_INTERVAL_MS);
        console.log(`[websockets] Started sending client metrics every ${METRICS_INTERVAL_MS}ms.`);
    }

     // Send initial resolution *after* connection is open and *if not* in manual mode.
     if (!window.isManualResolutionMode) {
        const videoContainer = document.querySelector('.video-container');
        let initialWidth, initialHeight;
        if (videoContainer) {
            const rect = videoContainer.getBoundingClientRect();
            initialWidth = roundDownToEven(rect.width);
            initialHeight = roundDownToEven(rect.height);
        } else {
            console.warn("Websocket Open: video-container not found for initial resolution, using window.");
            initialWidth = roundDownToEven(window.innerWidth);
            initialHeight = roundDownToEven(window.innerHeight);
        }
        sendResolutionToServer(initialWidth, initialHeight);
     } else {
        // If somehow manual mode is active on connect (e.g., after quick refresh?), send the manual res
        console.log("[websockets] Manual mode active on connect, sending manual resolution.");
        sendResolutionToServer(manualWidth, manualHeight);
     }

     // Request clipboard content
     websocket.send('cr');
     console.log('[websockets] Sent clipboard request (cr) to server.');

  };

  websocket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      if (clientMode === 'websockets') {
        const arrayBuffer = event.data;
        const dataView = new DataView(arrayBuffer);

        // Check length before reading bytes
        if (arrayBuffer.byteLength < 1) { // Need at least 1 byte for type
             console.warn('Received empty binary message, ignoring.');
             return;
        }

        const dataTypeByte = dataView.getUint8(0);

        if (dataTypeByte === 0) {
          if (arrayBuffer.byteLength < 2) {
               console.warn('Received short video message (type 0), ignoring.');
               return;
          }
          const frameTypeFlag = dataView.getUint8(1);
          const videoDataArrayBuffer = arrayBuffer.slice(2);

          if (!isVideoPipelineActive) {
              return;
          }

          if (decoder && decoder.state === 'configured') {
            const chunk = new EncodedVideoChunk({
              type: frameTypeFlag === 1 ? 'key' : 'delta',
              timestamp: performance.now() * 1000,
              data: videoDataArrayBuffer,
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
          const AUDIO_BUFFER_THRESHOLD = 10;
          if (window.currentAudioBufferSize >= AUDIO_BUFFER_THRESHOLD) {
              console.warn(
                  `Playback Audio buffer (${window.currentAudioBufferSize} buffers) is full (>= ${AUDIO_BUFFER_THRESHOLD}). Dropping audio frame.`
              );
              return;
          }
          if (!isAudioPipelineActive) {
              return;
          }
          if (audioContext && audioContext.state !== 'running') {
              console.warn(`Playback AudioContext is ${audioContext.state}, discarding.`);
              audioContext.resume();
              return;
          } 
          const audioDataArrayBuffer = arrayBuffer.slice(2);
          if (decoderAudio && decoderAudio.state === 'configured') {
            const chunk = new EncodedAudioChunk({
              type: 'key',
              timestamp: performance.now() * 1000,
              data: audioDataArrayBuffer,
            });
            try {
                if(decoderAudio.decodeQueueSize < 10) {
                    decoderAudio.decode(chunk);
                } else {
                     console.warn(`Playback Audio decode queue full (${decoderAudio.decodeQueueSize}), dropping frame.`);
                }
            } catch (e) {
              console.error('Playback Audio Decoding error:', e);
               if (decoderAudio.state === 'closed' || decoderAudio.state === 'unconfigured') {
                   console.warn("Playback Audio Decoder is closed or unconfigured, reinitializing...");
                   initializeDecoderAudio();
              }
            }
          } else {
             console.warn('Playback Audio Decoder not ready or not configured yet, audio frame dropped.');
             if (!decoderAudio) initializeDecoderAudio();
          }
        } else if (dataTypeByte === 0x02) {
            console.log('Received unexpected microphone data (type 0x02) from server.');
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
           } else if (obj.type === 'server_settings') {
             window.postMessage({ type: 'serverSettings', encoders: obj.encoders }, window.location.origin);
           } else if (obj.type === 'pipeline_status') {
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
                // Update UI based on confirmed state
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
             window.postMessage({ type: 'clipboardContentUpdate', text: clipboardData }, window.location.origin);
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
               const handled = window.webrtcInput.on_message(event.data);
               if (!handled) {
                   console.warn('Received unhandled string message (not input):', event.data);
               }
            } else {
               console.warn('Received unhandled string message (no input handler):', event.data);
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
        if (decoderAudio) decoderAudio.close(); // Close Playback Audio Decoder
        cleanupVideoBuffer();
        stopMicrophoneCapture(); // Ensure microphone is stopped if switching modes

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

            if (!scaleLocallyManual) {
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
    if(decoderAudio) decoderAudio.close(); // Close Playback Audio Decoder
    decoder = null;
    decoderAudio = null;
    stopMicrophoneCapture(); // Ensure microphone is stopped on disconnect
    isVideoPipelineActive = false;
    isAudioPipelineActive = false;
    isMicrophoneActive = false;
    window.postMessage({ type: 'pipelineStatusUpdate', video: false, audio: false }, window.location.origin);
    // Update UI buttons
    if (dev_mode) {
        updateToggleButtonAppearance(videoToggleButtonElement, false);
        updateToggleButtonAppearance(audioToggleButtonElement, false);
        updateToggleButtonAppearance(micToggleButtonElement, false);
    }
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
            // Ignore errors closing already closed frames
        }
    }
     if (closedCount > 0) console.log(`Cleanup: Closed ${closedCount} video frames.`);

     if (dev_mode && videoBufferDivElement) {
        videoBufferDivElement.textContent = `Video Buffer: ${videoFrameBuffer.length} frames`;
     }
}

// --- Microphone Worklet Code ---
const micWorkletProcessorCode = `
class MicWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (input && input[0]) { // Check if input and channel data are available
      const inputChannelData = input[0];
      const int16Array = Int16Array.from(inputChannelData, x => x * 32767);
      if (! int16Array.every(item => item === 0)) {
        this.port.postMessage(int16Array.buffer, [int16Array.buffer]);
      }
    }
    return true; // Keep the processor alive
  }
}

registerProcessor('mic-worklet-processor', MicWorkletProcessor);
`;

async function startMicrophoneCapture() {
    // Check if already active or prerequisites missing
    if (isMicrophoneActive || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!isMicrophoneActive) {
             console.warn('getUserMedia not supported or mediaDevices not available.');
             // Ensure state reflects reality and trigger UI update
             isMicrophoneActive = false;
             postSidebarButtonUpdate(); // Post update even on failure to start due to lack of support
        } else {
            console.warn('Microphone already active.');
            postSidebarButtonUpdate();
        }
        return; // Exit if already active or not supported
    }

    console.log('Attempting to start microphone capture...');

    // Define constraints variable here to be accessible in catch block
    let constraints;
    try {
        // 1. Get Microphone Stream with selected device preference
        constraints = { // Assign to the outer scope variable
            audio: {
                deviceId: preferredInputDeviceId ? { exact: preferredInputDeviceId } : undefined,
                sampleRate: 24000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        };
        console.log("Requesting microphone with constraints:", JSON.stringify(constraints.audio));
        micStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Microphone access granted.');

        // Log actual settings and update preferred device if needed
        const audioTracks = micStream.getAudioTracks();
        if (audioTracks.length > 0) {
             const settings = audioTracks[0].getSettings();
             console.log("Actual microphone settings obtained:", settings);
             if (!preferredInputDeviceId && settings.deviceId) {
                  console.log(`Default input device resolved to: ${settings.deviceId} (${settings.label || 'No Label'})`);
                  preferredInputDeviceId = settings.deviceId;
             }
             // Log if the requested sample rate was achieved
             if (settings.sampleRate && settings.sampleRate !== 24000) {
                 console.warn(`Requested sampleRate 24000 but got ${settings.sampleRate}`);
             }
        }

        // 2. Create *separate* AudioContext for Microphone
        if (micAudioContext && micAudioContext.state !== 'closed') {
            console.warn("Closing existing micAudioContext before creating a new one.");
            await micAudioContext.close();
            micAudioContext = null; // Clear reference
        }
        micAudioContext = new AudioContext({ sampleRate: 24000 }); // Use the requested sample rate
        console.log('Microphone AudioContext created. Initial State:', micAudioContext.state, 'Sample Rate:', micAudioContext.sampleRate);
        if (micAudioContext.state === 'suspended') {
            console.log('Mic AudioContext is suspended, attempting resume...');
            await micAudioContext.resume();
            console.log('Mic AudioContext resumed. New State:', micAudioContext.state);
        }
        // Check if the actual context sample rate matches requested
        if (micAudioContext.sampleRate !== 24000) {
             console.warn(`Requested AudioContext sampleRate 24000 but created context has ${micAudioContext.sampleRate}`);
        }

        // 3. Add MicWorkletProcessor Module (Ensure micWorkletProcessorCode is defined)
        if (typeof micWorkletProcessorCode === 'undefined' || !micWorkletProcessorCode) {
            throw new Error("micWorkletProcessorCode is not defined. Cannot add AudioWorklet module.");
        }
        const micWorkletBlob = new Blob([micWorkletProcessorCode], { type: 'application/javascript' }); // Use correct MIME type
        const micWorkletURL = URL.createObjectURL(micWorkletBlob);
        try {
            await micAudioContext.audioWorklet.addModule(micWorkletURL);
            console.log('Microphone AudioWorklet module added.');
        } finally {
            URL.revokeObjectURL(micWorkletURL); // Revoke URL immediately after addModule promise resolves/rejects
        }


        // 4. Create Source and Worklet Nodes
        micSourceNode = micAudioContext.createMediaStreamSource(micStream);
        micWorkletNode = new AudioWorkletNode(micAudioContext, 'mic-worklet-processor'); // Ensure this name matches registerProcessor
        console.log('Microphone source and worklet nodes created.');

        // 5. Set up WebSocket message handler for processed audio
        micWorkletNode.port.onmessage = (event) => {
            const pcm16Buffer = event.data;
            const wsState = websocket ? websocket.readyState : 'No WebSocket';

            if (websocket && websocket.readyState === WebSocket.OPEN && isMicrophoneActive) {
                if (!pcm16Buffer || !(pcm16Buffer instanceof ArrayBuffer) || pcm16Buffer.byteLength === 0) {
                    return;
                }

                // Message format: 1 byte type (0x02) + PCM data
                const messageBuffer = new ArrayBuffer(1 + pcm16Buffer.byteLength);
                const messageView = new DataView(messageBuffer);
                messageView.setUint8(0, 0x02); // Type byte for PCM audio
                new Uint8Array(messageBuffer, 1).set(new Uint8Array(pcm16Buffer)); // Copy PCM data

                try {
                    websocket.send(messageBuffer);
                } catch (e) {
                    console.error("Error sending microphone data via websocket:", e);
                }
            } else if (!isMicrophoneActive) {
                console.log("Microphone inactive, dropping message from worklet.");
            } else {
                console.warn("WebSocket not open or null, cannot send microphone data. State:", wsState);
            }
        };
        micWorkletNode.port.onmessageerror = (event) => {
             console.error("Error receiving message from mic worklet:", event);
        };

        // 6. Connect the nodes
        micSourceNode.connect(micWorkletNode);
        console.log('Microphone nodes connected.');

        // 7. Update State and Trigger UI Update via postMessage
        isMicrophoneActive = true;
        postSidebarButtonUpdate(); // Post message to update UI
        console.log('Microphone capture started successfully.');

    } catch (error) {
        console.error('Failed to start microphone capture:', error);
        if (constraints) { // Log constraints if they were defined
             console.error('Error occurred after requesting constraints:', JSON.stringify(constraints.audio));
        }
        if (error.name === 'NotAllowedError') {
             alert("Microphone access was denied. Please grant permission in your browser settings.");
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
             alert("No microphone found, or the selected microphone is unavailable. Please check your hardware and browser settings.");
             // Clear preference if specific device failed
             if (preferredInputDeviceId) {
                 console.warn(`Failed to find preferred device ${preferredInputDeviceId}. Clearing preference.`);
                 preferredInputDeviceId = null;
             }
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
             alert("Could not read from the microphone. It might be in use by another application or there could be a hardware issue.");
        } else if (error.name === 'OverconstrainedError') {
             alert(`Could not satisfy microphone requirements (e.g., sample rate ${constraints?.audio?.sampleRate}). Try default settings.`);
             console.error("OverconstrainedError details:", error.constraint);
        } else if (error.message.includes("addModule")) {
             alert("Failed to load audio processing module. Please check console for details.");
        } else {
             alert(`An unexpected error occurred while starting the microphone: ${error.message}`);
        }

        // Clean up any resources that might have been partially created
        stopMicrophoneCapture();

        // Ensure state reflects failure and trigger UI update via postMessage
        isMicrophoneActive = false;
        postSidebarButtonUpdate(); // Post message to update UI to reflect failure
    }
}

function stopMicrophoneCapture() {
    // Only proceed if the microphone is actually active
    if (!isMicrophoneActive) {
        console.log('Stop capture called, but microphone is not active.');
        return;
    }

    console.log('Stopping microphone capture...');

    // 1. Stop MediaStream Tracks
    if (micStream) {
        micStream.getTracks().forEach(track => {
            track.stop();
            console.log(`Microphone track stopped: ${track.kind} (${track.label})`);
        });
        micStream = null; // Clear the reference
    } else {
        console.log('No active microphone stream (micStream) found to stop tracks for.');
    }

    // 2. Disconnect Nodes (Disconnect in reverse order: worklet first)
    if (micWorkletNode) {
        // Remove listeners first to prevent potential errors during/after disconnect
        micWorkletNode.port.onmessage = null;
        micWorkletNode.port.onmessageerror = null;
        try {
            micWorkletNode.disconnect();
            console.log('Microphone worklet node disconnected.');
        } catch (e) { console.warn("Error disconnecting worklet node (already disconnected?):", e); }
        micWorkletNode = null; // Clear reference
    } else {
        console.log('No microphone worklet node (micWorkletNode) found to disconnect.');
    }

    if (micSourceNode) {
        try {
            micSourceNode.disconnect();
            console.log('Microphone source node disconnected.');
        } catch (e) { console.warn("Error disconnecting source node (already disconnected?):", e); }
        micSourceNode = null; // Clear reference
    } else {
        console.log('No microphone source node (micSourceNode) found to disconnect.');
    }


    // 3. Close Microphone AudioContext
    if (micAudioContext) {
        if (micAudioContext.state !== 'closed') {
            console.log(`Closing microphone AudioContext (State: ${micAudioContext.state})...`);
            micAudioContext.close().then(() => {
                console.log('Microphone AudioContext closed successfully.');
                micAudioContext = null; // Clear reference after successful close
            }).catch(e => {
                console.error('Error closing microphone AudioContext:', e);
                micAudioContext = null; // Clear reference even on error to prevent reuse attempts
            });
        } else {
             console.log('Microphone AudioContext already closed.');
             micAudioContext = null; // Ensure reference is cleared
        }
    } else {
        console.log('No microphone AudioContext (micAudioContext) found to close.');
    }

    // 4. Update State and Trigger UI Update via postMessage
    isMicrophoneActive = false;
    postSidebarButtonUpdate(); // Post message to update UI
    console.log('Microphone capture stopped state updated and UI update posted.');
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

  // Stop microphone first
  stopMicrophoneCapture();

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
  // Cleanup Playback Audio Context
  if (audioContext) {
      if (audioContext.state !== 'closed') {
           console.log(`Cleanup: Closing Playback AudioContext (state: ${audioContext.state})`);
           audioContext.close().then(() => console.log('Cleanup: Playback AudioContext closed.')).catch(e => console.error('Cleanup: Error closing Playback AudioContext:', e));
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
          console.log("Cleanup: Closed Playback AudioDecoder.");
      }
      decoderAudio = null;
  }

  cleanupVideoBuffer();

  // Reset audio device preferences
  preferredInputDeviceId = null;
  preferredOutputDeviceId = null;
  console.log("Cleanup: Reset preferred audio device IDs.");


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
  isMicrophoneActive = false;

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
  if (dev_mode) {
      if (fpsCounterDivElement) fpsCounterDivElement.textContent = `Client FPS: ${window.fps}`;
      if (audioBufferDivElement) audioBufferDivElement.textContent = `Audio Buffer: ${window.currentAudioBufferSize} buffers`;
      updateToggleButtonAppearance(videoToggleButtonElement, isVideoPipelineActive);
      updateToggleButtonAppearance(audioToggleButtonElement, isAudioPipelineActive);
      updateToggleButtonAppearance(micToggleButtonElement, isMicrophoneActive);
      updateToggleButtonAppearance(gamepadToggleButtonElement, isGamepadEnabled);
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
      const entry = item.webkitGetAsEntry() || item.getAsEntry();
      if (entry) {
        entriesToProcess.push(entry); // Add the entry to our array
      } else {
         console.warn("Could not get FileSystemEntry for dropped item.", item);
      }
    }
  } else {
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
            // No explicit cleanup needed here for legacy files
        }
        return;
    }
  }

  console.log(`Collected ${entriesToProcess.length} entries to process sequentially.`);

  // Now, sequentially process the entries from our stable array
  try {
    for (const entry of entriesToProcess) {
      const entryName = entry.name || 'Unknown Entry Name';
      console.log(`Processing collected entry: ${entryName}`);
      await handleDroppedEntry(entry);
    }
    console.log("Finished processing all collected entries.");
  } catch (error) {
      const errorMsg = `An error occurred during the sequential upload process: ${error.message || error}`;
      console.error(errorMsg);
      window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: 'N/A', message: errorMsg } }, window.location.origin);
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
        await uploadFileObject(file, pathName);
    } catch (err) {
        const errorMsg = `Error getting or uploading file from entry ${pathName}: ${err.message || err}`;
        console.error(errorMsg);
        window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathName, message: errorMsg } }, window.location.origin);
        if (websocket && websocket.readyState === WebSocket.OPEN) {
             try { websocket.send(`FILE_UPLOAD_ERROR:${pathName}:Failed to get/upload file`); } catch (_) {}
        }
        throw err;
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
                await handleDroppedEntry(entry);
            }
        }
    } while (entries.length > 0);
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
            reject(new Error(errorMsg));
            return;
        }

        console.log(`Starting upload for: ${pathToSend} (${file.size} bytes)`);
        // Send START message via window.postMessage
        window.postMessage({ type: 'fileUpload', payload: { status: 'start', fileName: pathToSend, fileSize: file.size } }, window.location.origin);

        websocket.send(`FILE_UPLOAD_START:${pathToSend}:${file.size}`);

        let offset = 0;
        const reader = new FileReader();

        reader.onload = function(e) {
            if (!websocket || websocket.readyState !== WebSocket.OPEN) {
                const errorMsg = `WebSocket closed during upload of ${pathToSend}. Aborting.`;
                console.error(errorMsg);
                // Send error message to window
                window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
                reject(new Error(errorMsg));
                return;
            }
            if (e.target.error) {
                const errorMsg = `Error reading file ${pathToSend}: ${e.target.error}`;
                console.error(errorMsg);
                 // Send error message to window
                window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
                // Try to notify server before rejecting
                try { websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:${e.target.error}`); } catch (_) {}
                reject(e.target.error);
                return;
            }

            try {
                const prefixedView = new Uint8Array(1 + e.target.result.byteLength);
                prefixedView[0] = 0x01;
                prefixedView.set(new Uint8Array(e.target.result), 1);
                websocket.send(prefixedView.buffer);
                offset += e.target.result.byteLength;

                // Calculate and send PROGRESS message via window.postMessage
                const progress = file.size > 0 ? Math.round((offset / file.size) * 100) : 100;
                window.postMessage({ type: 'fileUpload', payload: { status: 'progress', fileName: pathToSend, progress: progress, fileSize: file.size } }, window.location.origin);

                if (offset < file.size) {
                    readChunk(offset); // Read next chunk
                } else {
                    console.log(`Finished uploading ${pathToSend}`);
                    websocket.send(`FILE_UPLOAD_END:${pathToSend}`);
                    window.postMessage({ type: 'fileUpload', payload: { status: 'end', fileName: pathToSend, fileSize: file.size } }, window.location.origin);
                    resolve();
                }
            } catch (wsError) {
                const errorMsg = `WebSocket error sending chunk for ${pathToSend}: ${wsError}`;
                console.error(errorMsg);
                window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
                try { websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:WebSocket send failed`); } catch (_) {}
                reject(wsError);
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
            reject(e.target.error);
        };

        function readChunk(startOffset) {
            // Check websocket state *before* reading next chunk
            if (!websocket || websocket.readyState !== WebSocket.OPEN) {
                 const errorMsg = `WebSocket closed before reading next chunk for ${pathToSend}. Aborting.`;
                 console.error(errorMsg);
                 // Send error message to window
                 window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: errorMsg } }, window.location.origin);
                 reject(new Error(errorMsg));
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

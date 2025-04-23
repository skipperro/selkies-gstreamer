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

/* eslint no-unused-vars: ["error", { "vars": "local" }] */

// Set this to true to enable the dev dashboard layout
var dev_mode = false;

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
    // Use the getWindowResolution from the input object, which now handles rounding
    const currRes = this.webrtcInput ? this.webrtcInput.getWindowResolution() : [window.innerWidth, window.innerHeight]; // Fallback if input not set yet
    const meta = {
      res: `${currRes[0]}x${currRes[1]}`, // Use the rounded resolution
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

    this._ws_conn = new WebSocket(this._server.href); // Use href for string URL

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
    if (this._ws_conn) { // Check if connection exists
      this._ws_conn.close();
    }
  }

  /**
   * Send ICE candidate.
   *
   * @param {RTCIceCandidate} ice
   */
  sendICE(ice) {
    if (this._ws_conn && this._ws_conn.readyState === WebSocket.OPEN) { // Add check
      this._setDebug(`sending ice candidate: ${JSON.stringify(ice)}`);
      this._ws_conn.send(JSON.stringify({ ice }));
    } else {
       console.warn("Websocket not open, cannot send ICE candidate."); // Add warning
    }
  }

  /**
   * Send local session description.
   *
   * @param {RTCSessionDescription} sdp
   */
  sendSDP(sdp) {
     if (this._ws_conn && this._ws_conn.readyState === WebSocket.OPEN) { // Add check
        this._setDebug(`sending local sdp: ${JSON.stringify(sdp)}`);
        this._ws_conn.send(JSON.stringify({ sdp }));
     } else {
        console.warn("Websocket not open, cannot send SDP."); // Add warning
     }
  }

  /**
   * Send SESSION request to the server to initiate WebRTC session.
   * @private
   */
  sendSessionRequest() {
     if (this._ws_conn && this._ws_conn.readyState === WebSocket.OPEN) { // Add check
        this._setDebug(
          `Sending SESSION request to server, peer ID: ${this.peer_id}`
        );
        this._ws_conn.send(`SESSION ${this.peer_id}`);
     } else {
        console.warn("Websocket not open, cannot send SESSION request."); // Add warning
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
let videoFramerate = 60; // This variable exists and will be used for the dropdown value
let audioBitRate = 128; // Default audio bitrate in kbps
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
      if (clientMode === 'webrtc') {
        webrtc._setStatus('clipboard enabled');
        webrtc.sendDataChannelMessage('cr');
      } else if (clientMode === 'websockets') {
        console.log(
          'Clipboard not supported in websockets mode yet (or implement websocket send)'
        );
      }
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
  flex-direction: column; /* Default: stack elements vertically */
  height: 100vh;
  width: 100%; /* Ensure app takes full width */
}

/* DEV MODE LAYOUT */
#app.dev-mode {
  flex-direction: row; /* In dev mode, arrange children horizontally */
}

/* Container for video, canvas, input, etc. */
.video-container {
  flex-grow: 1; /* Takes up remaining space in flex row (dev mode) */
  flex-shrink: 1; /* Allows shrinking */
  display: flex;
  flex-direction: column; /* Stack children vertically if needed */
  justify-content: center;
  align-items: center;
  height: 100%; /* Takes full height of parent flex container */
  width: 100%; /* Takes full width in default column mode */
  position: relative; /* Keep position relative for children */
  overflow: hidden; /* Hide anything outside the bounds */
}

/* Ensure video, canvas, input take 100% of their container */
.video-container video,
.video-container canvas,
.video-container #overlayInput {
    position: absolute; /* Position absolutely within the container */
    top: 0;
    left: 0;
    width: 100%;  /* Take full width of video-container */
    height: 100%; /* Take full height of video-container */
}

/* Specific video rules */
.video-container video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain; /* Maintain aspect ratio */
  /* Removed width: 100vw; height: 100vh; from original as container handles sizing */
}

/* Canvas is typically drawn over the video */
.video-container #videoCanvas {
    z-index: 2; /* Below input, above video */
    pointer-events: none; /* Don't capture mouse events */
    display: block;
}

/* Overlay input for capturing events */
.video-container #overlayInput {
    opacity: 0; /* Invisible */
    z-index: 3; /* On top */
    caret-color: transparent;
    background-color: transparent;
    color: transparent;
    pointer-events: auto; /* Capture mouse/keyboard events */
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
  z-index: 10; /* On top */
}

.spinner-container {
  width: 2rem;
  height: 2rem;
  border: 0.25rem solid #ffc000;
  border-bottom: 0.25rem solid rgba(255,255,255,0);
  border-radius: 50%;
  -webkit-animation: spin 1s linear infinite;
  animation: spin 1s linear infinite;
  background-color: #000; /* Ensure it's visible over video */
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
  position: absolute; /* Position absolute within the video-container */
  bottom: 0;
  left: 0;
  width: 100%; /* Span the width of the video-container */
  padding: 5px;
  background-color: rgba(0, 0, 0, 0.7); /* Semi-transparent background */
  color: #fff;
  text-align: center;
  z-index: 5; /* Below spinner/play button */
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
  display: flex; /* Show in dev mode */
  flex-direction: column; /* Stack controls vertically */
  flex-shrink: 0; /* Prevent shrinking */
  width: 300px; /* Fixed width */
  height: 100vh; /* Take full height of parent */
  background-color: #2e2e2e; /* Dark background */
  color: #eee; /* Light text */
  padding: 10px;
  box-sizing: border-box; /* Include padding in width */
  overflow-y: auto; /* Add scroll if content overflows */
  gap: 10px; /* Added for spacing controls */
}

#dev-sidebar button {
    margin-bottom: 10px; /* Space out buttons */
    padding: 8px;
    cursor: pointer;
    background-color: #444;
    color: white;
    border: 1px solid #555;
    border-radius: 3px;
    width: 100%; /* Added for better layout */
    box-sizing: border-box; /* Added for better layout */
}
#dev-sidebar button:hover {
    background-color: #555;
}

/* Added: Style for the new dropdown and its container */
.dev-setting-item {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px; /* Space below each setting group */
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
    width: 100%; /* Make dropdown fill sidebar width */
    box-sizing: border-box;
}

/* Styles for the new stats divs */
.dev-stats-item {
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
    border: 1px solid #555;
    padding: 8px;
    background-color: #333;
    font-family: monospace;
    font-size: 0.8em;
    white-space: pre-wrap; /* Preserve whitespace and wrap */
    word-break: break-all; /* Break long words */
}

.dev-stats-item label {
    margin-bottom: 5px;
    font-size: 0.9em;
    color: #bbb;
    font-family: sans-serif; /* Use sans-serif for labels */
}
  `;
  document.head.appendChild(style);

};

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
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const message = `SET_ENCODER,${selectedEncoder}`;
            console.log(`Sending websocket message: ${message}`);
            websocket.send(message);
        } else {
            console.warn("Websocket connection not open, cannot send encoder setting.");
        }
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
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                const message = `SET_FRAMERATE,${selectedFramerate}`;
                console.log(`Sending websocket message: ${message}`);
                websocket.send(message);

                videoFramerate = selectedFramerate;
                setIntParam('videoFramerate', videoFramerate);
                 console.log(`Video framerate set to ${videoFramerate} FPS via UI`);
            } else {
                console.warn("Websocket connection not open, cannot send framerate setting.");
            }
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
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                const message = `SET_VIDEO_BITRATE,${selectedBitrate}`;
                console.log(`Sending websocket message: ${message}`);
                websocket.send(message);

                videoBitRate = selectedBitrate;
                setIntParam('videoBitRate', videoBitRate);
                 console.log(`Video bitrate set to ${videoBitRate} KBs via UI`);
            } else {
                console.warn("Websocket connection not open, cannot send video bitrate setting.");
            }
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
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                const message = `SET_AUDIO_BITRATE,${selectedBitrate}`;
                console.log(`Sending websocket message: ${message}`);
                websocket.send(message);

                audioBitRate = selectedBitrate;
                setIntParam('audioBitRate', audioBitRate);
                 console.log(`Audio bitrate set to ${audioBitRate} kbit/s via UI`);
            } else {
                console.warn("Websocket connection not open, cannot send audio bitrate setting.");
            }
        }
    });

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

  }

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
      canvas.width = windowResolution[0];
      canvas.height = windowResolution[1];
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
};

window.addEventListener('message', receiveMessage, false);

function receiveMessage(event) {
  if (event.origin !== window.location.origin) {
    return;
  }

  const message = event.data;
  if (typeof message === 'object' && message !== null) {
    if (message.type === 'settings') {
      handleSettingsMessage(message.settings);
    } else if (message.type === 'getStats') {
      sendStatsMessage();
    }
  }
}

function handleSettingsMessage(settings) {
  if (settings.videoBitRate !== undefined) {
    videoBitRate = parseInt(settings.videoBitRate);
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(`vb,${videoBitRate}`);
       console.log(`Video bitrate set to ${videoBitRate} kbit/s via settings message`);
    } else if (clientMode === 'websockets') {
       console.log(`Video bitrate set to ${videoBitRate} kbit/s via settings message (websockets mode)`);
    }
    setIntParam('videoBitRate', videoBitRate);
    if (dev_mode && videoBitrateSelectElement) {
         videoBitrateSelectElement.value = videoBitRate.toString();
         let optionExists = false;
         for (let i = 0; i < videoBitrateSelectElement.options.length; i++) {
             if (videoBitrateSelectElement.options[i].value === videoBitRate.toString()) {
                 optionExists = true;
                 break;
             }
         }
         if (!optionExists) {
             console.warn(`Received video bitrate ${videoBitRate} kbit/s from settings is not in dropdown options. Adding it.`);
             const option = document.createElement('option');
             option.value = videoBitRate.toString();
             option.textContent = `${videoBitRate} kbit/s (custom)`;
             videoBitrateSelectElement.insertBefore(option, videoBitrateSelectElement.firstChild);
             videoBitrateSelectElement.value = videoBitRate.toString();
         }
    }
  }
  if (settings.videoFramerate !== undefined) {
    videoFramerate = parseInt(settings.videoFramerate);
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(`_arg_fps,${videoFramerate}`);
      console.log(`Video framerate set to ${videoFramerate} FPS via settings message (_arg_fps)`);
    } else if (clientMode === 'websockets') {
       console.log(`Video framerate set to ${videoFramerate} FPS via settings message (websockets mode)`);
    }
    setIntParam('videoFramerate', videoFramerate);
    if (dev_mode && framerateSelectElement) {
        framerateSelectElement.value = videoFramerate.toString();
         let optionExists = false;
         for (let i = 0; i < framerateSelectElement.options.length; i++) {
             if (framerateSelectElement.options[i].value === videoFramerate.toString()) {
                 optionExists = true;
                 break;
             }
         }
         if (!optionExists) {
             console.warn(`Received video framerate ${videoFramerate} FPS from settings is not in dropdown options. Adding it.`);
             const option = document.createElement('option');
             option.value = videoFramerate.toString();
             option.textContent = `${videoFramerate} FPS (custom)`;
             framerateSelectElement.insertBefore(option, framerateSelectElement.firstChild);
             framerateSelectElement.value = videoFramerate.toString();
         }
    }
  }
  if (settings.resizeRemote !== undefined) {
    resizeRemote = settings.resizeRemote;
    const videoContainer = document.querySelector('.video-container');
     if (!videoContainer) {
          console.warn('video-container not found, using window size for resizeRemote resolution.');
          const res = `${roundDownToEven(window.innerWidth)}x${roundDownToEven(window.innerHeight)}`;
           if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
              webrtc.sendDataChannelMessage(`_arg_resize,${resizeRemote},${res}`);
           }
           setBoolParam('resizeRemote', resizeRemote);
           return;
     }

    const videoContainerRect = videoContainer.getBoundingClientRect();
    const evenWidth = roundDownToEven(videoContainerRect.width);
    const evenHeight = roundDownToEven(videoContainerRect.height);
    const res = `${evenWidth}x${evenHeight}`;
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(`_arg_resize,${resizeRemote},${res}`);
    } else if (clientMode === 'websockets') {
    }
    setBoolParam('resizeRemote', resizeRemote);
  }
  if (settings.scaleLocal !== undefined) {
    scaleLocal = settings.scaleLocal;
    videoElement.classList.toggle('scale', scaleLocal);
    setBoolParam('scaleLocal', scaleLocal);
  }
  if (settings.audioBitRate !== undefined) {
    audioBitRate = parseInt(settings.audioBitRate);
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(`ab,${audioBitRate}`);
       console.log(`Audio bitrate set to ${audioBitRate} kbit/s via settings message`);
    } else if (clientMode === 'websockets') {
       console.log(`Audio bitrate set to ${audioBitRate} kbit/s via settings message (websockets mode)`);
    }
    setIntParam('audioBitRate', audioBitRate);
    if (dev_mode && audioBitrateSelectElement) {
        audioBitrateSelectElement.value = audioBitRate.toString();
         let optionExists = false;
         for (let i = 0; i < audioBitrateSelectElement.options.length; i++) {
             if (audioBitrateSelectElement.options[i].value === audioBitRate.toString()) {
                 optionExists = true;
                 break;
             }
         }
         if (!optionExists) {
             console.warn(`Received audio bitrate ${audioBitRate} kbit/s from settings is not in dropdown options. Adding it.`);
             const option = document.createElement('option');
             option.value = audioBitRate.toString();
             option.textContent = `${audioBitRate} kbit/s (custom)`;
             audioBitrateSelectElement.insertBefore(option, audioBitrateSelectElement.firstChild);
             audioBitrateSelectElement.value = audioBitRate.toString();
         }
    }
  }
  if (settings.encoder !== undefined) {
      const encoder = settings.encoder;
      if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
           webrtc.sendDataChannelMessage(`enc,${encoder}`);
           console.log(`Encoder set to ${encoder} via settings message`);
      } else if (clientMode === 'websockets') {
          console.log(`Encoder set to ${encoder} via settings message (websockets mode)`);
      }
       setStringParam('encoder', encoder);
       if (dev_mode && encoderSelectElement) {
           encoderSelectElement.value = encoder;
            let optionExists = false;
            for (let i = 0; i < encoderSelectElement.options.length; i++) {
                if (encoderSelectElement.options[i].value === encoder) {
                    optionExists = true;
                    break;
                }
            }
            if (!optionExists) {
                console.warn(`Received encoder ${encoder} from settings is not in dropdown options. Adding it.`);
                const option = document.createElement('option');
                option.value = encoder;
                option.textContent = `${encoder} (custom)`;
                encoderSelectElement.insertBefore(option, encoderSelectElement.firstChild);
                encoderSelectElement.value = encoder;
            }
       }
  }

  if (settings.turnSwitch !== undefined) {
    debug = settings.debug;
    setBoolParam('turnSwitch', turnSwitch);
    if (clientMode === 'webrtc' && (!webrtc || webrtc.peerConnection === null))
      return;
    setTimeout(() => {
      window.location.reload();
    }, 700);
  }
  if (settings.debug !== undefined) {
    debug = settings.debug;
    setBoolParam('debug', debug);
    if (clientMode === 'webrtc' && (!webrtc || webrtc.peerConnection === null))
      return;
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
  };
   if (typeof encoderName !== 'undefined') {
       stats.encoderName = encoderName;
   }
  window.parent.postMessage({ type: 'stats', data: stats }, window.location.origin);
}

document.addEventListener('DOMContentLoaded', () => {
  initializeUI();

  if (dev_mode && videoBitrateSelectElement) {
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
           videoBitrateSelectElement.value = videoBitRate.toString();
       }
  }

  if (dev_mode && audioBitrateSelectElement) {
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
           audioBitrateSelectElement.value = audioBitRate.toString();
       }
  }

  if (dev_mode && encoderSelectElement) {
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
           encoderSelectElement.value = savedEncoder;
       }
  }

  if (dev_mode && framerateSelectElement) {
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
           framerateSelectElement.value = videoFramerate.toString();
       }
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

  function handleFrame(frame) {
    if (!canvas) {
      canvas = document.getElementById('videoCanvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'videoCanvas';
        canvas.style.zIndex = '9999';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        document.body.appendChild(canvas);
      }
      canvasContext = canvas.getContext('2d');
      if (!canvasContext) {
        console.error('Failed to get 2D rendering context');
        frame.close();
        return;
      }
    }

    canvas.width = frame.codedWidth;
    canvas.height = frame.codedHeight;

    canvasContext.drawImage(frame, 0, 0);

    frame.close();

    frameCount++;
    const now = performance.now();
    const elapsed = now - lastFpsUpdateTime;

    if (elapsed >= 1000) {
        const currentFps = (frameCount * 1000) / elapsed;
        window.fps = Math.round(currentFps);
        frameCount = 0;
        lastFpsUpdateTime = now;

        if (dev_mode && fpsCounterDivElement) {
            fpsCounterDivElement.textContent = `FPS: ${window.fps}`;
        }
    }


    if (!streamStarted) {
      startStream();
      initializeInput();
    }
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
              }
            };
          }

          process(inputs, outputs, parameters) {
            const output = outputs[0];
            const leftChannel = output ? output[0] : undefined;
            const rightChannel = output ? output[1] : undefined;

            if (!leftChannel || !rightChannel) {
              console.error("Error: leftChannel or rightChannel is undefined! Output:", output, "Outputs:", outputs);
              return false;
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
                  leftChannel[sampleIndex] = 0;
                  rightChannel[sampleIndex] = 0;
                  continue;
                }
              }

              leftChannel[sampleIndex] = data[offset++];
              if (offset < data.length) {
                rightChannel[sampleIndex] = data[offset++];
              } else {
                rightChannel[sampleIndex] = 0;
              }
            }

            this.currentDataOffset = offset;
            this.currentAudioData = data;

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
    if (!audioContext) {
      await initializeAudio();
    }

    if (!audioContext || !audioWorkletProcessorPort) {
      console.log('Audio context or AudioWorkletProcessor not available, waiting for user interaction!');
      frame.close();
      return;
    }

    if (audioContext.state !== 'running') {
      console.warn('AudioContext state is:', audioContext.state, '. Resuming...');
      await audioContext.resume();
      frame.close();
      return;
    }

    try {
      const numberOfChannels = frame.numberOfChannels;
      const sampleCount = frame.numberOfFrames;

      const pcmData = new Float32Array(sampleCount * numberOfChannels);
      const copyOptions = { format: 'f32', planeIndex: 0 };

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
    decoder = new VideoDecoder({
      output: handleFrame,
      error: (e) => {
        console.error('Decoder error:', e);
      },
    });
    const windowResolution = [window.innerWidth, window.innerHeight];

    const decoderConfig = {
      codec: 'avc1.42E01E',
      codedWidth: windowResolution[0],
      codedHeight: windowResolution[1],
    };

    try {
      decoder.configure(decoderConfig);
    } catch (e) {
      console.error('Error configuring VideoDecoder:', e);
      decoder = null;
    }
  }

  async function initializeDecoderAudio() {
    decoderAudio = new AudioDecoder({
      output: handleAudio,
      error: (e) => {
        console.error('Decoder error:', e);
      },
    });

    const decoderConfig = {
      codec: 'opus',
      numberOfChannels: 2,
      sampleRate: 48000,
    };

    try {
      decoderAudio.configure(decoderConfig);
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

  websocket.onopen = () => {
    console.log('[websockets] Connection opened!');
  };

  websocket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      if (clientMode === 'websockets') {
        const arrayBuffer = event.data;
        const dataView = new DataView(arrayBuffer);

        const dataTypeByte = dataView.getUint8(0);
        const frameTypeFlag = dataView.getUint8(1);
        const isKey = frameTypeFlag === 1;
        const frameDataArrayBuffer = arrayBuffer.slice(2);
        if (dataTypeByte === 0) {
          if (decoder && decoder.state === 'configured') {
            const chunk = new EncodedVideoChunk({
              type: isKey ? 'key' : 'delta',
              timestamp: 0,
              duration: 0,
              data: frameDataArrayBuffer,
            });
            try {
              decoder.decode(chunk);
            } catch (e) {
              console.error('Decoding error:', e);
              decoder.reset();
            }
          } else {
            console.warn(
              'Decoder not ready or not configured yet, video frame dropped.'
            );
          }
        } else if (dataTypeByte === 1) {
          if (decoderAudio && decoderAudio.state === 'configured') {
            const chunk = new EncodedAudioChunk({
              type: 'key',
              timestamp: 0,
              duration: 0,
              data: frameDataArrayBuffer,
            });
            try {
              decoderAudio.decode(chunk);
            } catch (e) {
              console.error('Audio decoding error:', e);
              decoderAudio.reset();
            }
          } else {
             console.warn('Audio Decoder not ready or not configured yet, audio frame dropped.');
          }
        } else {
          console.warn('Unknown data payload type:', dataTypeByte);
        }
      }
    } else if (typeof event.data === 'string') {
      if (clientMode === 'websockets') {
        if (event.data.startsWith('{')) {
          let obj = JSON.parse(event.data);
          if (obj.type === 'system_stats') {
            window.system_stats = obj;
          } else if (obj.type === 'gpu_stats') {
            window.gpu_stats = obj;
          }
          if (dev_mode) {
            if (obj.type === 'system_stats') {
              if (systemStatsDivElement) {
                systemStatsDivElement.textContent = JSON.stringify(obj, null, 2);
              }
            } else if (obj.type === 'gpu_stats') {
              if (gpuStatsDivElement) {
                gpuStatsDivElement.textContent = JSON.stringify(obj, null, 2);
              }
            }
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
          } catch (e) {
            console.error('Error processing clipboard data:', e);
          }
        }
      } else if (event.data === 'MODE websockets') {
        clientMode = 'websockets';
        initializeDecoder();
        initializeDecoderAudio();
        initializeInput();
      } else if (event.data === 'MODE webrtc') {
        clientMode = 'webrtc';
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
  };

  websocket.onclose = (event) => {
    console.log('[websockets] Connection closed', event);
  };
});

function cleanup() {
  if (clientMode === 'webrtc' && signalling) {
    signalling.disconnect();
  }
  if (audio_signalling) {
    audio_signalling.disconnect();
  }
  if (clientMode === 'webrtc' && webrtc) {
    webrtc.reset();
  }
  if (audio_webrtc) {
    audio_webrtc.reset();
  }
  if (websocket) {
    websocket.close();
  }
  if (audioContext) {
      audioContext.close().then(() => console.log('AudioContext closed')).catch(e => console.error('Error closing AudioContext:', e));
      audioContext = null;
      audioWorkletNode = null;
      audioWorkletProcessorPort = null;
      audioBufferQueue.length = 0;
  }
  if (decoder) {
      decoder.close();
      decoder = null;
  }
  if (decoderAudio) {
      decoderAudio.close();
      decoderAudio = null;
  }


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
      fpsCounterDivElement.textContent = `FPS: ${window.fps}`;
  }
}

window.addEventListener('beforeunload', cleanup);

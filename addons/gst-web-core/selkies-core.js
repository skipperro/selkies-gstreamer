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
    const currRes = this.webrtcInput.getWindowResolution();
    const meta = {
      res: `${parseInt(currRes[0])}x${parseInt(currRes[1])}`,
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
    this._ws_conn.close();
  }

  /**
   * Send ICE candidate.
   *
   * @param {RTCIceCandidate} ice
   */
  sendICE(ice) {
    this._setDebug(`sending ice candidate: ${JSON.stringify(ice)}`);
    this._ws_conn.send(JSON.stringify({ ice }));
  }

  /**
   * Send local session description.
   *
   * @param {RTCSessionDescription} sdp
   */
  sendSDP(sdp) {
    this._setDebug(`sending local sdp: ${JSON.stringify(sdp)}`);
    this._ws_conn.send(JSON.stringify({ sdp }));
  }

  /**
   * Send SESSION request to the server to initiate WebRTC session.
   * @private
   */
  sendSessionRequest() {
    this._setDebug(
      `Sending SESSION request to server, peer ID: ${this.peer_id}`
    );
    this._ws_conn.send(`SESSION ${this.peer_id}`);
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
let videoFramerate = 60;
let audioBitRate = 128000;
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

let statusDisplayElement;
let videoElement;
let audioElement;
let playButtonElement;
let spinnerElement;
let overlayInput;

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
  updateLogOutput(); // Assuming updateLogOutput is defined elsewhere
};

const appendLogError = (message) => {
  logEntries.push(applyTimestamp(`[signalling] [ERROR] ${message}`));
  updateLogOutput(); // Assuming updateLogOutput is defined elsewhere
};

const appendDebugEntry = (message) => {
  debugEntries.push(`[signalling] ${message}`);
  updateDebugOutput(); // Assuming updateDebugOutput is defined elsewhere
};

const updateLogOutput = () => {
  // need messsage posts, assuming this is handled elsewhere
};

const updateDebugOutput = () => {
  // need message posts, assuming this is handled elsewhere
};

const updatePublishingErrorDisplay = () => {
  //publishingErrorElement.textContent = publishingError; // Assuming publishingErrorElement is defined elsewhere
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
}
.video-container {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  position: relative; /* Keep position relative for video-container */
}
video {
  max-width: 100%;
  max-height: 100%;
  width: 100vw;
  height: 100vh;
  object-fit: contain;
}
.spinner-container {
  position: absolute;
  top: calc(50% - 1rem);
  left: calc(50% - 1rem);
  width: 2rem;
  height: 2rem;
  border: 0.25rem solid #ffc000;
  border-bottom: 0.25rem solid rgba(255,255,255,0);
  border-radius: 50%;
  -webkit-animation: spin 1s linear infinite;
  animation: spin 1s linear infinite;
  z-index: 9999;
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
.video.scale {
  width: auto;
  height: auto;
}
.video {}
.status-bar {
  padding: 5px;
  background-color: #000;
  color: #fff;
  text-align: center;
}
#playButton {
  padding: 15px 30px;
  font-size: 1.5em;
  cursor: pointer;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  backdrop-filter: blur(5px);
}
#overlayInput {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    z-index: 3;
    caret-color: transparent;
    background-color: transparent;
    color: transparent;
    z-index: 3; /* Input on top */
    pointer-events: auto; /* Ensure input events are captured */
    -webkit-user-select: none; /* Prevent text selection */
    border: none;
    outline: none;
    padding: 0;
    margin: 0;
}
#videoCanvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;  /* Make canvas responsive */
    height: 100%; /* Make canvas responsive */
    z-index: 2;
    pointer-events: none;
    display: block; /* Ensure canvas is block level */
}
  `;
  document.head.appendChild(style);

  if (canvas && overlayInput && videoElement) {
    const videoContainer = videoElement.parentNode;
    if (videoContainer) {
      videoContainer.insertBefore(canvas, videoElement);
    }
  }
};

const initializeUI = () => {
  injectCSS();

  document.title = `Selkies - ${appName}`;

  const appDiv = document.getElementById('app');

  statusDisplayElement = document.createElement('div');
  statusDisplayElement.id = 'status-display';
  statusDisplayElement.className = 'status-bar';
  statusDisplayElement.textContent = 'Connecting...';
  statusDisplayElement.classList.toggle('hidden', !showStart);
  appDiv.appendChild(statusDisplayElement);

  overlayInput = document.createElement('input');
  overlayInput.type = 'text';
  overlayInput.id = 'overlayInput';
  appDiv.appendChild(overlayInput);

  const videoContainer = document.createElement('div');
  videoContainer.className = 'video-container';
  appDiv.appendChild(videoContainer);

  videoElement = document.createElement('video');
  videoElement.id = 'stream';
  videoElement.className = 'video';
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.contentEditable = 'true';
  videoContainer.appendChild(videoElement);

  if (!canvas) {
    canvas = document.getElementById('videoCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'videoCanvas';
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.zIndex = '2';
      canvas.style.pointerEvents = 'none';
      videoContainer.appendChild(canvas);
    }
    canvasContext = canvas.getContext('2d');
    if (!canvasContext) {
      console.error('Failed to get 2D rendering context');
    }
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

  videoBitRate = getIntParam('videoBitRate', videoBitRate);
  videoFramerate = getIntParam('videoFramerate', videoFramerate);
  audioBitRate = getIntParam('audioBitRate', audioBitRate);
  resizeRemote = getBoolParam('resizeRemote', resizeRemote);
  scaleLocal = getBoolParam('scaleLocal', scaleLocal);
  debug = getBoolParam('debug', debug);
  turnSwitch = getBoolParam('turnSwitch', turnSwitch);

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
    const newRes = `${parseInt(windowResolution[0])}x${parseInt(
      windowResolution[1]
    )}`;

    if (videoElement) {
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
    }
    if (canvas) {
      canvas.width = windowResolution[0];
      canvas.height = windowResolution[1];
    }
    if (overlayInput) {
      overlayInput.style.width = '100%';
      overlayInput.style.height = '100%';
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
    } else if (clientMode === 'websockets') {
      // Websocket bitrate control if needed
    }
    setIntParam('videoBitRate', videoBitRate);
  }
  if (settings.videoFramerate !== undefined) {
    videoFramerate = parseInt(settings.videoFramerate);
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(`_arg_fps,${videoFramerate}`);
    } else if (clientMode === 'websockets') {
      // Websocket framerate control if needed
    }
    setIntParam('videoFramerate', videoFramerate);
  }
  if (settings.resizeRemote !== undefined) {
    resizeRemote = settings.resizeRemote;
    const windowResolution =
      clientMode === 'webrtc' && webrtc && webrtc.input
        ? webrtc.input.getWindowResolution()
        : [window.innerWidth, window.innerHeight];
    const res = `${windowResolution[0]}x${windowResolution[1]}`;
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage(`_arg_resize,${resizeRemote},${res}`);
    } else if (clientMode === 'websockets') {
      // Websocket resize control if needed
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
    } else if (clientMode === 'websockets') {
      // Websocket audio bitrate control if needed
    }
    setIntParam('audioBitRate', audioBitRate);
  }
  if (settings.turnSwitch !== undefined) {
    turnSwitch = settings.turnSwitch;
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
    encoderName,
  };
  window.parent.postMessage({ type: 'stats', data: stats }, window.location.origin);
}

document.addEventListener('DOMContentLoaded', () => {
  initializeUI();

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
        if (clientMode === 'webrtc' && webrtc) {
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
      // 1. Define the AudioWorkletProcessor code as a string (inline worker)
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
            const output = outputs[0]; // Get the first output buffer (should be stereo now)
            const leftChannel = output ? output[0] : undefined;   // Left channel buffer
            const rightChannel = output ? output[1] : undefined;  // Right channel buffer

            if (!leftChannel || !rightChannel) {
              console.error("Error: leftChannel or rightChannel is undefined! Output:", output, "Outputs:", outputs);
              return false; // Stop processing if channels are invalid
            }

            const samplesPerBuffer = leftChannel.length; // Samples per channel buffer

            if (this.audioBufferQueue.length === 0 && this.currentAudioData === null) {
              // No data, output silence for both channels
              leftChannel.fill(0);
              rightChannel.fill(0);
              return true; // Keep processor alive
            }

            let data = this.currentAudioData;
            let offset = this.currentDataOffset;

            for (let sampleIndex = 0; sampleIndex < samplesPerBuffer; sampleIndex++) {
              if (!data || offset >= data.length) {
                if (this.audioBufferQueue.length > 0) {
                  data = this.currentAudioData = this.audioBufferQueue.shift();
                  offset = this.currentDataOffset = 0;
                } else {
                  // Still no data, output silence for both channels
                  leftChannel[sampleIndex] = 0;
                  rightChannel[sampleIndex] = 0;
                  continue; // Next sample
                }
              }

              // Standard Stereo De-interleaving (NO AVERAGING):
              leftChannel[sampleIndex] = data[offset++];      // Left channel
              if (offset < data.length) {
                rightChannel[sampleIndex] = data[offset++];   // Right channel
              } else {
                rightChannel[sampleIndex] = 0;              // Pad right with silence if needed
              }
            }

            this.currentDataOffset = offset;
            this.currentAudioData = data;

            return true; // Keep processor alive
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
              console.error('Decoding error:', e);
              decoderAudio.reset();
            }
          }
        } else {
          console.warn('Unknown data payload type:', dataTypeByte);
        }
      }
    } else if (typeof event.data === 'string') {
      if (clientMode === 'websockets') {
        if (event.data.startsWith('cursor,')) {
          try {
            const cursorData = JSON.parse(event.data.substring(7));
            if (parseInt(cursorData.handle, 10) === 0) {
              overlayInput.style.cursor = 'auto';
              return;
            }
            if (cursorData.override) {
              overlayInput.style.cursor = cursorData.override;
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
              clientMode === 'webrtc' && webrtc && webrtc.input
                ? webrtc.input.getWindowResolution()
                : [window.innerWidth, window.innerHeight];

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

  status = 'connecting';
  loadingText = '';
  showStart = true;
  streamStarted = false;
  inputInitialized = false;
  statusDisplayElement.textContent = 'Connecting...';
  statusDisplayElement.classList.remove('hidden');
  playButtonElement.classList.remove('hidden');
  spinnerElement.classList.remove('hidden');

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
}

window.addEventListener('beforeunload', cleanup);

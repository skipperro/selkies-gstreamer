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

/*eslint no-unused-vars: ["error", { "vars": "local" }]*/


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
     * @param {String} message
     */
    _setStatus(message) {
        if (this.onstatus !== null) {
            this.onstatus(message);
        }
    }

    /**
     * Sets a debug message.
     * @private
     * @param {String} message
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
     * @param {String} message
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
     * @param {String} message
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
        var currRes = this.webrtcInput.getWindowResolution();
        var meta = {
            "res": parseInt(currRes[0]) + "x" + parseInt(currRes[1]),
            "scale": window.devicePixelRatio
        };
        this.state = 'connected';
        this._ws_conn.send(`HELLO ${this.peer_id} ${btoa(JSON.stringify(meta))}`);
        this._setStatus("Registering with server, peer ID: " + this.peer_id);
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
        this._setStatus("Connection error, retry in 3 seconds.");
        this.retry_count++;
        if (this._ws_conn.readyState === this._ws_conn.CLOSED) {
            setTimeout(() => {
                if (this.retry_count > 3) {
                    window.location.replace(window.location.href.replace(window.location.pathname, "/"));
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
     * @param {Event} event The event: https://developer.mozilla.org/en-US/docs/Web/API/MessageEvent
     */
    _onServerMessage(event) {
        this._setDebug("server message: " + event.data);

        if (event.data === "HELLO") {
            this._setStatus("Registered with server.");
            this._setStatus("Waiting for stream.");
            this.sendSessionRequest();
            return;
        }

        if (event.data.startsWith("ERROR")) {
            this._setStatus("Error from server: " + event.data);
            return;
        }

        var msg;
        try {
            msg = JSON.parse(event.data);
        } catch (e) {
            if (e instanceof SyntaxError) {
                this._setError("error parsing message as JSON: " + event.data);
            } else {
                this._setError("failed to parse message: " + event.data);
            }
            return;
        }

        if (msg.sdp != null) {
            this._setSDP(new RTCSessionDescription(msg.sdp));
        } else if (msg.ice != null) {
            var icecandidate = new RTCIceCandidate(msg.ice);
            this._setICE(icecandidate);
        } else {
            this._setError("unhandled JSON message: " + msg);
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
            this._setError("Server closed connection.");
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
        this._setStatus("Connecting to server.");

        this._ws_conn = new WebSocket(this._server);

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
        this._setDebug("sending ice candidate: " + JSON.stringify(ice));
        this._ws_conn.send(JSON.stringify({ 'ice': ice }));
    }

    /**
     * Send local session description.
     *
     * @param {RTCSessionDescription} sdp
     */
    sendSDP(sdp) {
        this._setDebug("sending local sdp: " + JSON.stringify(sdp));
        this._ws_conn.send(JSON.stringify({ 'sdp': sdp }));
    }

    /**
     * Send SESSION request to the server to initiate WebRTC session.
     * @private
     */
    sendSessionRequest() {
        this._setDebug("Sending SESSION request to server, peer ID: " + this.peer_id);
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

var webrtc;
var audio_webrtc;
var signalling;
var audio_signalling;
var decoder;
var canvas = null;
var canvasContext = null;
var websocket;
let clientMode = null;
var videoConnected = "";
var audioConnected = "";


window.onload = () => {
  'use strict';
}

function getCookieValue(a) {
  var b = document.cookie.match('(^|[^;]+)\\s*' + a + '\\s*=\\s*([^;]+)');
  return b ? b.pop() : '';
}

const appName = window.location.pathname.endsWith("/") &&
  (window.location.pathname.split("/")[1]) || "webrtc";
let videoBitRate = 8000;
let videoFramerate = 60;
let audioBitRate = 128000;
let showStart = true;
const logEntries = [];
const debugEntries = [];
let status = 'connecting';
let loadingText = '';
let clipboardStatus = 'disabled';
let windowResolution = "";
let encoderName = "";
const gamepad = {
  gamepadState: 'disconnected',
  gamepadName: 'none',
};
const connectionStat = {
  connectionStatType: "unknown",
  connectionLatency: 0,
  connectionVideoLatency: 0,
  connectionAudioLatency: 0,
  connectionAudioCodecName: "NA",
  connectionAudioBitrate: 0,
  connectionPacketsReceived: 0,
  connectionPacketsLost: 0,
  connectionBytesReceived: 0,
  connectionBytesSent: 0,
  connectionCodec: "unknown",
  connectionVideoDecoder: "unknown",
  connectionResolution: "",
  connectionFrameRate: 0,
  connectionVideoBitrate: 0,
  connectionAvailableBandwidth: 0
};
const gpuStat = {
  gpuLoad: 0,
  gpuMemoryTotal: 0,
  gpuMemoryUsed: 0
};
const cpuStat = {
  serverCPUUsage: 0,
  serverMemoryTotal: 0,
  serverMemoryUsed: 0
};
let serverLatency = 0;
let resizeRemote = true;
let scaleLocal = false;
let debug = false;
let turnSwitch = false;
let publishingAllowed = false;
let publishingIdle = false;
let publishingError = "";
let publishingAppName = "";
let publishingAppDisplayName = "";
let publishingAppDescription = "";
let publishingAppIcon = "";
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
  const prefixedKey = appName + "_" + key;
  return (parseInt(window.localStorage.getItem(prefixedKey)) || default_value);
};

const setIntParam = (key, value) => {
  if (value === null) return;
  const prefixedKey = appName + "_" + key;
  window.localStorage.setItem(prefixedKey, value.toString());
};

const getBoolParam = (key, default_value) => {
  const prefixedKey = appName + "_" + key;
  var v = window.localStorage.getItem(prefixedKey);
  if (v === null) {
    return default_value;
  } else {
    return (v.toString().toLowerCase() === "true");
  }
};

const setBoolParam = (key, value) => {
  if (value === null) return;
  const prefixedKey = appName + "_" + key;
  window.localStorage.setItem(prefixedKey, value.toString());
};

const getUsername = () => {
  return (getCookieValue("broker_" + appName) || "webrtc").split("#")[0];
};

const enterFullscreen = () => {
  if (clientMode === 'webrtc' && webrtc && 'input' in webrtc && 'enterFullscreen' in webrtc.input) {
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
  navigator.clipboard.readText()
    .then(text => {
      if (clientMode === 'webrtc') {
        webrtc._setStatus("clipboard enabled");
        webrtc.sendDataChannelMessage("cr");
      } else if (clientMode === 'websockets') {
        console.log("Clipboard not supported in websockets mode yet (or implement websocket send)");
      }
    })
    .catch(err => {
      if (clientMode === 'webrtc') {
        webrtc._setError('Failed to read clipboard contents: ' + err);
      } else if (clientMode === 'websockets') {
        console.error('Failed to read clipboard contents: ' + err);
      }
    });
};

const publish = () => {
  var data = {
    name: publishingAppName,
    displayName: publishingAppDisplayName,
    description: publishingAppDescription,
    icon: publishingAppIcon,
  }

  fetch("./publish/" + appName, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(data),
  })
    .then(function (response) {
      return response.json();
    })
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
  logEntries.push(applyTimestamp("[signalling] " + message));
  updateLogOutput();
};

const appendLogError = (message) => {
  logEntries.push(applyTimestamp("[signalling] [ERROR] " + message));
  updateLogOutput();
};

const appendDebugEntry = (message) => {
  debugEntries.push("[signalling] " + message);
  updateDebugOutput();
};


const updateLogOutput = () => {
  // need messsage posts
};

const updateDebugOutput = () => {
  // need message posts
};


const updatePublishingErrorDisplay = () => {
  //publishingErrorElement.textContent = publishingError;
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

  document.title = "Selkies - " + appName;

  const appDiv = document.getElementById('app');

  statusDisplayElement = document.createElement('div');
  statusDisplayElement.id = 'status-display';
  statusDisplayElement.className = 'status-bar';
  statusDisplayElement.textContent = 'Connecting...';
  if (!showStart) {
    statusDisplayElement.classList.add('hidden');
  } else {
    statusDisplayElement.classList.remove('hidden');
  }
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
  videoElement.contentEditable = "true";
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
            console.error("Failed to get 2D rendering context");
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
  if (showStart) {
    spinnerElement.classList.add('hidden');
  } else {
    spinnerElement.classList.remove('hidden');
  }
  videoContainer.appendChild(spinnerElement);

  playButtonElement = document.createElement('button');
  playButtonElement.id = 'playButton';
  playButtonElement.textContent = 'Play Stream';
  if (!showStart) {
    playButtonElement.classList.add('hidden');
  } else {
    playButtonElement.classList.remove('hidden');
  }
  videoContainer.appendChild(playButtonElement);


  videoBitRate = getIntParam("videoBitRate", videoBitRate);
  videoFramerate = getIntParam("videoFramerate", videoFramerate);
  audioBitRate = getIntParam("audioBitRate", audioBitRate);
  resizeRemote = getBoolParam("resizeRemote", resizeRemote);
  scaleLocal = getBoolParam("scaleLocal", scaleLocal);
  debug = getBoolParam("debug", debug);
  turnSwitch = getBoolParam("turnSwitch", turnSwitch);

  updateStatusDisplay();
  updateLogOutput();
  updateDebugOutput();
  updatePublishingErrorDisplay();

  playButtonElement.addEventListener('click', playStream);
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
  return function(...args) {
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
        if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
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
        gamepad.gamepadState = "connected";
        gamepad.gamepadName = gamepad_id;
    }

    inputInstance.ongamepaddisconnected = () => {
        gamepad.gamepadState = "disconnected";
        gamepad.gamepadName = "none";
    }
    inputInstance.attach();


    const handleResizeUI = () => {
        windowResolution = inputInstance.getWindowResolution();
        var newRes = parseInt(windowResolution[0]) + "x" + parseInt(windowResolution[1]);

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
            webrtcSendInput("r," + newRes);
            webrtcSendInput("s," + window.devicePixelRatio);
        } else if (clientMode === 'websockets') {
            websocketSendInput("r," + newRes);
            websocketSendInput("s," + window.devicePixelRatio);
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

  var message = event.data;
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
      webrtc.sendDataChannelMessage('vb,' + videoBitRate);
    } else if (clientMode === 'websockets') {
    }
    setIntParam("videoBitRate", videoBitRate);
  }
  if (settings.videoFramerate !== undefined) {
    videoFramerate = parseInt(settings.videoFramerate);
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage('_arg_fps,' + videoFramerate);
    } else if (clientMode === 'websockets') {
    }
    setIntParam("videoFramerate", videoFramerate);
  }
  if (settings.resizeRemote !== undefined) {
    resizeRemote = settings.resizeRemote;
    windowResolution = (clientMode === 'webrtc' && webrtc && webrtc.input) ? webrtc.input.getWindowResolution() : [window.innerWidth, window.innerHeight];
    var res = windowResolution[0] + "x" + windowResolution[1];
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage('_arg_resize,' + resizeRemote + "," + res);
    } else if (clientMode === 'websockets') {
    }
    setBoolParam("resizeRemote", resizeRemote);
  }
  if (settings.scaleLocal !== undefined) {
    scaleLocal = settings.scaleLocal;
    if (scaleLocal === true) {
      videoElement.style.width = '';
      videoElement.style.height = '';
      videoElement.setAttribute("class", "video scale");
    } else {
      videoElement.setAttribute("class", "video");
    }
    setBoolParam("scaleLocal", scaleLocal);
  }
  if (settings.audioBitRate !== undefined) {
    audioBitRate = parseInt(settings.audioBitRate);
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) {
      webrtc.sendDataChannelMessage('ab,' + audioBitRate);
    } else if (clientMode === 'websockets') {
    }
    setIntParam("audioBitRate", audioBitRate);
  }
  if (settings.turnSwitch !== undefined) {
    turnSwitch = settings.turnSwitch;
    setBoolParam("turnSwitch", turnSwitch);
    if (clientMode === 'webrtc' && (webrtc === undefined || webrtc.peerConnection === null)) return;
    setTimeout(() => {
      document.location.reload();
    }, 700);
  }
  if (settings.debug !== undefined) {
    debug = settings.debug;
    setBoolParam("debug", debug);
    if (clientMode === 'webrtc' && (webrtc === undefined || webrtc.peerConnection === null)) return;
    setTimeout(() => {
      document.location.reload();
    }, 700);
  }
}

function sendStatsMessage() {
  const stats = {
    connection: connectionStat,
    gpu: gpuStat,
    cpu: cpuStat,
    encoderName: encoderName
  };
  window.parent.postMessage({ type: 'stats', data: stats },
    window.location.origin);
}


document.addEventListener('DOMContentLoaded', () => {
  initializeUI();


  videoElement.addEventListener('loadeddata', (e) => {
    if (clientMode === 'webrtc' && webrtc && webrtc.input) {
      webrtc.input.getCursorScaleFactor();
    }
  });

  var pathname = window.location.pathname;
  var pathname = pathname.slice(0, pathname.lastIndexOf("/") + 1);
  var protocol = (location.protocol == "http:" ? "ws://" : "wss://");

  audio_signalling = new WebRTCDemoSignalling(
    new URL(protocol + window.location.host + pathname + appName +
      "/signalling/"), 3);
  audio_webrtc = new WebRTCDemo(audio_signalling, audioElement, 3);
  audio_signalling.setInput(audio_webrtc.input);


  window.applyTimestamp = (msg) => {
    var now = new Date();
    var ts = now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();
    return "[" + ts + "]" + " " + msg;
  };

  audio_signalling.onstatus = (message) => {
    loadingText = message;
    appendLogEntry(message);
    updateStatusDisplay();
  };
  audio_signalling.onerror = (message) => { appendLogError(message) };

  audio_signalling.ondisconnect = () => {
    var checkconnect = status == checkconnect;
    status = 'connecting';
    updateStatusDisplay();
    overlayInput.style.cursor = "auto";
    audio_webrtc.reset();
    status = 'checkconnect';
    if (!checkconnect) {
      if (signalling) signalling.disconnect();
    }
  };

  const setupWebRTCMode = () => {
    signalling = new WebRTCDemoSignalling(
      new URL(protocol + window.location.host + pathname + appName +
        "/signalling/"), 1);
    webrtc = new WebRTCDemo(signalling, videoElement, 1);


    signalling.setInput(webrtc.input);

    signalling.onstatus = (message) => {
      loadingText = message;
      appendLogEntry(message);
      updateStatusDisplay();
    };
    signalling.onerror = (message) => { appendLogError(message) };

    signalling.ondisconnect = () => {
      var checkconnect = status == checkconnect;
      status = 'connecting';
      updateStatusDisplay();
      overlayInput.style.cursor = "auto";
      if (clientMode === 'webrtc' && webrtc) {
        webrtc.reset();
      }
      status = 'checkconnect';
      if (!checkconnect) audio_signalling.disconnect();
    };

    webrtc.onstatus = (message) => {
      appendLogEntry(applyTimestamp("[webrtc] " + message))
    };
    webrtc.onerror = (message) => {
      appendLogError(applyTimestamp("[webrtc] [ERROR] " + message))
    };
    webrtc.onconnectionstatechange = (state) => {
      videoConnected = state;
      if (videoConnected === "connected") {
        if (!videoElement.paused) {
          playButtonElement.classList.add('hidden');
          statusDisplayElement.classList.add('hidden');
          spinnerElement.classList.add('hidden');
        }
        if (webrtc && webrtc.peerConnection) {
          webrtc.peerConnection.getReceivers().forEach((receiver) => {
            let intervalLoop = setInterval(async () => {
              if (receiver.track.readyState !== "live" ||
                receiver.transport.state !== "connected") {
                clearInterval(intervalLoop);
                return;
              } else {
                receiver.jitterBufferTarget = receiver.jitterBufferDelayHint =
                  receiver.playoutDelayHint = 0;
              }
            }, 15);
          });
        }
      }
      if (videoConnected === "connected" && audioConnected === "connected") {
        status = state;
        updateStatusDisplay();
        if (clientMode === 'webrtc' && !inputInitialized) {
        }
      } else {
        status = state === "connected" ? audioConnected : videoConnected;
        updateStatusDisplay();
      }
    };
    webrtc.ondatachannelopen = () => {
      initializeInput();
    };

    webrtc.ondatachannelclose = () => {
      if (webrtc && webrtc.input) webrtc.input.detach();
    };

    webrtc.onclipboardcontent = (content) => {
      if (clipboardStatus === 'enabled') {
        navigator.clipboard.writeText(content)
          .catch(err => {
            if (webrtc) webrtc._setStatus('Could not copy text to clipboard: ' + err);
          });
      }
    };

    webrtc.oncursorchange = (handle, curdata, hotspot, override) => {
      if (parseInt(handle) === 0) {
        overlayInput.style.cursor = "auto";
        return;
      }
      if (override) {
        overlayInput.style.cursor = override;
        return;
      }
      if (webrtc && !webrtc.cursor_cache.has(handle)) {
        const cursor_url = "url('data:image/png;base64," + curdata + "')";
        webrtc.cursor_cache.set(handle, cursor_url);
      }
      if (webrtc) {
        var cursor_url = webrtc.cursor_cache.get(handle);
        if (hotspot) {
          cursor_url += ` ${hotspot.x} ${hotspot.y}, auto`;
        } else {
          cursor_url += ", auto";
        }
        overlayInput.style.cursor = cursor_url;
      }
    };

    webrtc.onsystemaction = (action) => {
      if (webrtc) webrtc._setStatus("Executing system action: " + action);
    };

    webrtc.onlatencymeasurement = (latency_ms) => {
      serverLatency = latency_ms * 2.0;
    };


    if (debug) {
      webrtc.ondebug = (message) => {
        appendDebugEntry(applyTimestamp("[webrtc] " + message))
      };
    }
    if (webrtc) {
      webrtc.ongpustats = async (data) => {
        gpuStat.gpuLoad = Math.round(data.load * 100);
        gpuStat.gpuMemoryTotal = data.memory_total;
        gpuStat.gpuMemoryUsed = data.memory_used;
      };
    }
  }

  audio_webrtc.onstatus = (message) => {
    appendLogEntry(applyTimestamp("[audio webrtc] " + message))
  };
  audio_webrtc.onerror = (message) => {
    appendLogError(applyTimestamp("[audio webrtc] [ERROR] " + message))
  };
  audio_webrtc.onconnectionstatechange = (state) => {
    audioConnected = state;
    if (audioConnected === "connected") {
      if (audio_webrtc && audio_webrtc.peerConnection) {
        audio_webrtc.peerConnection.getReceivers().forEach((receiver) => {
          let intervalLoop = setInterval(async () => {
            if (receiver.track.readyState !== "live" ||
              receiver.transport.state !== "connected") {
              clearInterval(intervalLoop);
              return;
            } else {
              receiver.jitterBufferTarget = receiver.jitterBufferDelayHint =
                receiver.playoutDelayHint = 0;
            }
          }, 15);
        });
      }
    }
    if (audioConnected === "connected" && videoConnected === "connected") {
      status = state;
      updateStatusDisplay();
    } else {
      status = state === "connected" ? audioConnected : videoConnected;
      updateStatusDisplay();
    }
  };
  if (debug) {
    audio_signalling.ondebug = (message) => {
      appendDebugEntry("[audio signalling] " + message);
    };
    audio_webrtc.ondebug = (message) => {
      appendDebugEntry(applyTimestamp("[audio webrtc] " + message))
    };
  }



  window.addEventListener('focus', () => {
    if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) webrtc.sendDataChannelMessage("kr");
    if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) websocket.send("kr");

    navigator.clipboard.readText()
      .then(text => {
        if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) webrtc.sendDataChannelMessage("cw," + btoa(text));
        if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) websocket.send("cw," + btoa(text));
      })
      .catch(err => {
        if (clientMode === 'webrtc' && webrtc) {
          webrtc._setStatus('Failed to read clipboard contents: ' + err);
        } else if (clientMode === 'websockets') {
          console.error('Failed to read clipboard contents: ' + err);
        }
      });
  });
  window.addEventListener('blur', () => {
     if (clientMode === 'webrtc' && webrtc && webrtc.sendDataChannelMessage) webrtc.sendDataChannelMessage("kr");
     if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) websocket.send("kr");
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
            console.error("Failed to get 2D rendering context");
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
  async function initializeDecoder() {
      decoder = new VideoDecoder({
          output: handleFrame,
          error: (e) => {
              console.error("Decoder error:", e);
          }
      });
      windowResolution = [window.innerWidth, window.innerHeight];

      const decoderConfig = {
          codec: "avc1.42E01E",
          codedWidth: windowResolution[0],
          codedHeight: windowResolution[1]
      };

      try {
          decoder.configure(decoderConfig);
      } catch (e) {
          console.error("Error configuring VideoDecoder:", e);
          decoder = null;
      }
  }
  const ws_protocol = (location.protocol == "http:" ? "ws://" : "wss://");
  const websocketEndpointURL = new URL(ws_protocol + window.location.host + pathname + "websockets");
  websocket = new WebSocket(websocketEndpointURL);
  websocket.binaryType = "arraybuffer";

  websocket.onopen = () => {
    console.log('[websockets] Connection opened!');
  };

  websocket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      if (clientMode === 'websockets') {
        const arrayBuffer = event.data;
        const dataView = new DataView(arrayBuffer);
        const frameTypeFlag = dataView.getUint8(0);
        var isKey;
        if (dataView.getUint8(0) === 1) {
          isKey = true;
        } else {
          isKey = false;
        }
        const frameDataArrayBuffer = arrayBuffer.slice(1);
        if (decoder && decoder.state === "configured") {
          const chunk = new EncodedVideoChunk({
            type: isKey ? "key" : "delta",
            timestamp: 0,
            duration: 0,
            data: frameDataArrayBuffer
          });
          try {
            decoder.decode(chunk);
          } catch (e) {
            console.error("Decoding error:", e);
            decoder.reset();
          }
        } else {
          console.warn("Decoder not ready or not configured yet, frame dropped.");
        }
      }
    } else {
      if (event.data === "MODE websockets") {
        clientMode = 'websockets';
        initializeDecoder();
      } else if (event.data === "MODE webrtc") {
        clientMode = 'webrtc';
        setupWebRTCMode();
        fetch("./turn")
        .then(function (response) {
          return response.json();
        })
        .then((config) => {
          turnSwitch = getBoolParam("turnSwitch", turnSwitch);
            audio_webrtc.forceTurn = turnSwitch;
            audio_webrtc.rtcPeerConfig = config;


          windowResolution = (clientMode === 'webrtc' && webrtc && webrtc.input) ? webrtc.input.getWindowResolution() : [window.innerWidth, window.innerHeight];

          if (scaleLocal === false) {
            videoElement.style.width = windowResolution[0] / window.devicePixelRatio + 'px';
            videoElement.style.height = windowResolution[1] / window.devicePixelRatio + 'px';
          }

          if (config.iceServers.length > 1) {
            appendDebugEntry(applyTimestamp("[app] using TURN servers: " +
              config.iceServers[1].urls.join(", ")));
          } else {
            appendDebugEntry(applyTimestamp("[app] no TURN servers found."));
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

  connectionStat.connectionStatType = "unknown";
  connectionStat.connectionLatency = 0;
  connectionStat.connectionVideoLatency = 0;
  connectionStat.connectionAudioLatency = 0;
  connectionStat.connectionAudioCodecName = "NA";
  connectionStat.connectionAudioBitrate = 0;
  connectionStat.connectionPacketsReceived = 0;
  connectionStat.connectionPacketsLost = 0;
  connectionStat.connectionBytesReceived = 0;
  connectionStat.connectionAudioBitrate = 0;
  connectionStat.connectionPacketsReceived = 0;
  connectionStat.connectionPacketsLost = 0;
  connectionStat.connectionBytesReceived = 0;
  connectionStat.connectionBytesSent = 0;
  connectionStat.connectionCodec = "unknown";
  connectionStat.connectionVideoDecoder = "unknown";
  connectionStat.connectionResolution = "";
  connectionStat.connectionFrameRate = 0;
  connectionStat.connectionVideoBitrate = 0;
  connectionStat.connectionAvailableBandwidth = 0;
  gamepad.gamepadState = 'disconnected';
  gamepad.gamepadName = 'none';
  publishingAllowed = false;
  publishingIdle = false;
  publishingError = "";
  publishingAppName = "";
  publishingAppDisplayName = "";
  publishingAppDescription = "";
  publishingAppIcon = "";
  publishingValid = false;
  logEntries.length = 0;
  debugEntries.length = 0;
}

window.addEventListener('beforeunload', cleanup);

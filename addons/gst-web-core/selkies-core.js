/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
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

// WebRTCDemoSignaling class removed as it's WebRTC specific.

import {
  GamepadManager
} from './lib/gamepad.js';
import {
  Input
} from './lib/input.js';

let decoder;
let audioDecoderWorker = null;
let canvas = null;
let canvasContext = null;
let websocket;
let clientMode = null;
let audioContext;
let audioWorkletNode;
let audioWorkletProcessorPort;
const audioBufferQueue = [];
window.currentAudioBufferSize = 0;
let videoFrameBuffer = [];
let jpegStripeRenderQueue = [];
let videoBufferSize = 0;
let videoBufferSelectElement;
let videoBufferDivElement;
let serverClipboardTextareaElement;
let serverClipboardContent = '';
let triggerInitializeDecoder = () => {
  console.error("initializeDecoder function not yet assigned!");
};
let isVideoPipelineActive = true;
let isAudioPipelineActive = true;
let isMicrophoneActive = false;
let isGamepadEnabled;
let gamepadStates = {};
let lastReceivedVideoFrameId = -1;
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
let crfSelectElement;
let metricsIntervalId = null;
const METRICS_INTERVAL_MS = 100;
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
let handleResizeUI_globalRef = null;
let vncStripeDecoders = {};
let vncStripeFrameMetadata = {};
let currentEncoderMode = 'x264enc-stiped';

const isSharedMode = window.location.hash === '#shared';
if (isSharedMode) {
  console.log("Client is running in SHARED read-only mode.");
}

window.onload = () => {
  'use strict';
};

function getCookieValue(name) {
  const b = document.cookie.match(`(^|[^;]+)\\s*${name}\\s*=\\s*([^;]+)`);
  return b ? b.pop() : '';
}
// Set app name from manifest if possible
let appName = 'Selkies';
!async function() {
  try {
    const t = await fetch("manifest.json", {
      signal: AbortSignal.timeout(500)
    });
    if (t.ok) {
      const a = await t.json();
      a && "string" == typeof a.name && "" !== a.name.trim() && (appName = a.name)
    }
  } catch (t) {}
}();

let videoBitRate = 8000;
let videoFramerate = 60;
let videoCRF = 25;
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
let resizeRemote = true;
let debug = false;
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
let scaleLocallyManual;
window.fps = 0;
let frameCount = 0;
let lastFpsUpdateTime = performance.now();
let uniqueStripedFrameIdsThisPeriod = new Set();
let lastStripedFpsUpdateTime = performance.now();
let statusDisplayElement;
let videoElement;
let audioElement;
let playButtonElement;
let overlayInput;
let videoBitrateSelectElement;
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
  const value = window.localStorage.getItem(prefixedKey);
  return (value === null || value === undefined) ? default_value : parseInt(value);
};
const setIntParam = (key, value) => {
  const prefixedKey = `${appName}_${key}`;
  if (value === null || value === undefined) {
    window.localStorage.removeItem(prefixedKey);
  } else {
    window.localStorage.setItem(prefixedKey, value.toString());
  }
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
  const prefixedKey = `${appName}_${key}`;
  if (value === null || value === undefined) {
    window.localStorage.removeItem(prefixedKey);
  } else {
    window.localStorage.setItem(prefixedKey, value.toString());
  }
};
const getStringParam = (key, default_value) => {
  const prefixedKey = `${appName}_${key}`;
  const value = window.localStorage.getItem(prefixedKey);
  return (value === null || value === undefined) ? default_value : value;
};
const setStringParam = (key, value) => {
  const prefixedKey = `${appName}_${key}`;
  if (value === null || value === undefined) {
    window.localStorage.removeItem(prefixedKey);
  } else {
    window.localStorage.setItem(prefixedKey, value.toString());
  }
};

videoBitRate = getIntParam('videoBitRate', videoBitRate);
videoFramerate = getIntParam('videoFramerate', videoFramerate);
videoCRF = getIntParam('videoCRF', videoCRF);
audioBitRate = getIntParam('audioBitRate', audioBitRate);
resizeRemote = getBoolParam('resizeRemote', resizeRemote);
debug = getBoolParam('debug', debug);
videoBufferSize = getIntParam('videoBufferSize', 0);
currentEncoderMode = getStringParam('encoder', 'x264enc-striped');
scaleLocallyManual = getBoolParam('scaleLocallyManual', true);
isManualResolutionMode = getBoolParam('isManualResolutionMode', false);
isGamepadEnabled = getBoolParam('isGamepadEnabled', true);

if (isSharedMode) {
    manualWidth = 1280; // Default stream dimensions for shared mode before first frame
    manualHeight = 720;
    console.log(`Shared mode: Initialized manualWidth/Height to ${manualWidth}x${manualHeight}`);
    // Behavior of isManualResolutionMode = true and scaleLocallyManual = true is emulated
    // by directly controlling canvas and scaling in shared mode logic.
} else {
    manualWidth = getIntParam('manualWidth', null);
    manualHeight = getIntParam('manualHeight', null);
}


const getUsername = () => getCookieValue(`broker_${appName}`)?.split('#')[0] || 'websocket_user'; // Default user for WS

const enterFullscreen = () => {
  if ('webrtcInput' in window && window.webrtcInput && typeof window.webrtcInput.enterFullscreen === 'function') {
    window.webrtcInput.enterFullscreen();
  }
};

const playStream = () => {
  showStart = false;
  if (playButtonElement) playButtonElement.classList.add('hidden');
  if (statusDisplayElement) statusDisplayElement.classList.add('hidden');
  console.log("playStream called in WebSocket mode - UI elements hidden.");
};

const enableClipboard = () => {
  navigator.clipboard
    .readText()
    .then((text) => {
      console.log("Clipboard API read access confirmed.");
    })
    .catch((err) => {
      console.error(`Failed to read clipboard contents: ${err}`);
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
      } else {
        publishingError = response.status;
        updatePublishingErrorDisplay();
      }
    });
};

const updateStatusDisplay = () => {
  if (statusDisplayElement) {
    statusDisplayElement.textContent = loadingText || status;
  }
};

window.applyTimestamp = (msg) => {
  const now = new Date();
  const ts = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
  return `[${ts}] ${msg}`;
};

const appendLogEntry = (message) => {
  logEntries.push(applyTimestamp(`[app] ${message}`));
};
const appendLogError = (message) => {
  logEntries.push(applyTimestamp(`[app] [ERROR] ${message}`));
};
const appendDebugEntry = (message) => {
  debugEntries.push(`[app] ${message}`);
  updateDebugOutput();
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
  display: none;
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
.video-container #playButton {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
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

function sendResolutionToServer(width, height) {
  if (isSharedMode) {
    console.log("Shared mode: Resolution sending to server is blocked.");
    return;
  }
  const pixelRatio = window.devicePixelRatio;
  const resString = `${width}x${height}`;
  console.log(`Sending resolution to server: ${resString}, Pixel Ratio: ${pixelRatio}`);
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(`r,${resString}`);
    websocket.send(`s,${pixelRatio}`);
  } else {
    console.warn("Cannot send resolution via WebSocket: Connection not open.");
  }
}

function applyManualCanvasStyle(targetWidth, targetHeight, scaleToFit) {
  if (!canvas || !canvas.parentElement) {
    console.error("Cannot apply manual canvas style: Canvas or parent container not found.");
    return;
  }
  if (targetWidth <=0 || targetHeight <=0) {
    console.warn(`Cannot apply manual canvas style: Invalid target dimensions ${targetWidth}x${targetHeight}`);
    return;
  }

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    console.log(`Canvas internal buffer set to: ${targetWidth}x${targetHeight}`);
  }
  const container = canvas.parentElement;
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  if (scaleToFit) {
    const targetAspectRatio = targetWidth / targetHeight;
    const containerAspectRatio = containerWidth / containerHeight;
    let cssWidth, cssHeight;
    if (targetAspectRatio > containerAspectRatio) {
      cssWidth = containerWidth;
      cssHeight = containerWidth / targetAspectRatio;
    } else {
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
    canvas.style.objectFit = 'contain'; // Should be 'fill' if CSS handles aspect ratio
    console.log(`Applied manual style (Scaled): CSS ${cssWidth}x${cssHeight}, Buffer ${targetWidth}x${targetHeight}, Pos ${leftOffset},${topOffset}`);
  } else {
    canvas.style.position = 'absolute';
    canvas.style.width = `${targetWidth}px`;
    canvas.style.height = `${targetHeight}px`;
    canvas.style.top = '0px';
    canvas.style.left = '0px';
    canvas.style.objectFit = 'fill';
    console.log(`Applied manual style (Exact): CSS ${targetWidth}x${targetHeight}, Buffer ${targetWidth}x${targetHeight}, Pos 0,0`);
  }
  canvas.style.display = 'block';
}

function resetCanvasStyle(streamWidth, streamHeight) {
  if (!canvas) return;
   if (streamWidth <=0 || streamHeight <=0) {
    console.warn(`Cannot reset canvas style: Invalid stream dimensions ${streamWidth}x${streamHeight}`);
    return;
  }
  if (canvas.width !== streamWidth || canvas.height !== streamHeight) {
    canvas.width = streamWidth;
    canvas.height = streamHeight;
    console.log(`Canvas internal buffer reset to: ${streamWidth}x${streamHeight}`);
  }
  canvas.style.position = 'absolute';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.top = '0px';
  canvas.style.left = '0px';
  canvas.style.objectFit = 'contain';
  canvas.style.display = 'block';
  console.log(`Reset canvas CSS style to 100% width/height, object-fit: contain. Buffer: ${streamWidth}x${streamHeight}`);
}

function enableAutoResize() {
  if (directManualLocalScalingHandler) {
    console.log("Switching to Auto Mode: Removing direct manual local scaling listener.");
    window.removeEventListener('resize', directManualLocalScalingHandler);
  }
  if (originalWindowResizeHandler) {
    console.log("Switching to Auto Mode: Adding original (auto) debounced resize listener.");
    window.removeEventListener('resize', originalWindowResizeHandler); // Ensure no duplicates
    window.addEventListener('resize', originalWindowResizeHandler);
    if (typeof handleResizeUI_globalRef === 'function') {
      console.log("Triggering immediate auto-resize calculation for auto mode.");
      handleResizeUI_globalRef();
    } else {
      console.warn("handleResizeUI function not directly callable from enableAutoResize. Auto-resize will occur on next event.");
    }
  } else {
    console.warn("Cannot enable auto-resize: originalWindowResizeHandler not found.");
  }
}

const directManualLocalScalingHandler = () => {
  // This handler is for non-shared manual mode.
  // Shared mode has its own simpler resize handling in initializeUI.
  if (window.isManualResolutionMode && !isSharedMode && manualWidth != null && manualHeight != null && manualWidth > 0 && manualHeight > 0) {
    applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
  }
};

function disableAutoResize() {
  // This is primarily for non-shared manual mode.
  if (originalWindowResizeHandler) {
    console.log("Switching to Manual Mode Local Scaling: Removing original (auto) resize listener.");
    window.removeEventListener('resize', originalWindowResizeHandler);
  }
  console.log("Switching to Manual Mode Local Scaling: Adding direct manual scaling listener.");
  window.removeEventListener('resize', directManualLocalScalingHandler); // Defensive removal
  window.addEventListener('resize', directManualLocalScalingHandler);
  if (window.isManualResolutionMode && !isSharedMode && manualWidth != null && manualHeight != null && manualWidth > 0 && manualHeight > 0) {
    console.log("Applying current manual canvas style after enabling direct manual resize handler.");
    applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
  }
}

function updateUIForSharedMode() {
    if (!isSharedMode) return;

    console.log("Shared mode: Updating UI elements to read-only.");

    const idsToHide = [
        'manualWidthInput', 'manualHeightInput', 'setResolutionButton', 'resetResolutionButton',
        'scaleLocallyCheckbox', 'scaleLocallyLabel',
        'videoBitrateSelect', 'encoderSelect', 'framerateSelect', 'crfSelect',
        'videoBitrateLabel', 'encoderLabel', 'framerateLabel', 'crfLabel',
        'micToggleBtn',
        'fileUploadButton', // Assuming a generic ID for a file upload button in sidebar
        'advancedAudioSettingsBtn',
        // 'audioDeviceSettingsDiv', // This is a variable, handled below
        // 'uploadProgressContainer' // This is a variable, handled below
    ];

    idsToHide.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add('hidden');
            console.log(`Shared mode: Hid UI element #${id}`);
        }
    });

    if (uploadProgressContainerElement) {
        uploadProgressContainerElement.classList.add('hidden');
        console.log("Shared mode: Hid uploadProgressContainerElement");
    }
    // advancedAudioSettingsBtnElement might not be initialized yet, check for it
    const advAudioBtn = document.getElementById('advancedAudioSettingsBtn');
    if (advAudioBtn) {
        advAudioBtn.classList.add('hidden');
        console.log("Shared mode: Hid advancedAudioSettingsBtn (by ID)");
    }
    // audioDeviceSettingsDivElement might not be initialized yet
    const audioDevSettingsDiv = document.getElementById('audioDeviceSettingsDiv');
     if (audioDevSettingsDiv) {
        audioDevSettingsDiv.classList.add('hidden');
        console.log("Shared mode: Hid audioDeviceSettingsDiv (by ID)");
    }


    const globalFileInput = document.getElementById('globalFileInput');
    if (globalFileInput) {
        globalFileInput.disabled = true;
        console.log("Shared mode: Disabled globalFileInput.");
    }
}


const initializeUI = () => {
  injectCSS();
  document.title = `${appName}`;
  window.addEventListener('requestFileUpload', handleRequestFileUpload);
  const appDiv = document.getElementById('app');
  if (!appDiv) {
    console.error("FATAL: Could not find #app element.");
    return;
  }
  const videoContainer = document.createElement('div');
  videoContainer.className = 'video-container';
  statusDisplayElement = document.createElement('div');
  statusDisplayElement.id = 'status-display';
  statusDisplayElement.className = 'status-bar';
  statusDisplayElement.textContent = 'Connecting...';
  videoContainer.appendChild(statusDisplayElement);
  overlayInput = document.createElement('input');
  overlayInput.type = 'text';
  overlayInput.readOnly = true;
  overlayInput.id = 'overlayInput';
  videoContainer.appendChild(overlayInput);

  videoElement = document.createElement('video');
  videoElement.id = 'stream';
  videoElement.style.display = 'none';
  videoContainer.appendChild(videoElement);

  canvas = document.getElementById('videoCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'videoCanvas';
  }
  videoContainer.appendChild(canvas);

  if (isSharedMode) {
      if (!manualWidth || manualWidth <= 0 || !manualHeight || manualHeight <= 0) {
          manualWidth = 1280; manualHeight = 720; // Fallback defaults for safety
      }
      applyManualCanvasStyle(manualWidth, manualHeight, true); // scaleToFit = true
      window.addEventListener('resize', () => { // Simple resize for CSS scaling
          if (isSharedMode && manualWidth && manualHeight && manualWidth > 0 && manualHeight > 0) {
              applyManualCanvasStyle(manualWidth, manualHeight, true);
          }
      });
      console.log(`Initialized UI in Shared Mode: Canvas buffer target ${manualWidth}x${manualHeight}, will scale to fit viewport.`);
  } else if (isManualResolutionMode && manualWidth != null && manualHeight != null && manualWidth > 0 && manualHeight > 0) {
    applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
    disableAutoResize(); // Sets up directManualLocalScalingHandler for non-shared manual
    console.log(`Initialized UI in Manual Resolution Mode: ${manualWidth}x${manualHeight}, ScaleLocally: ${scaleLocallyManual}`);
  } else {
    const initialStreamWidth = 1024;
    const initialStreamHeight = 768;
    resetCanvasStyle(initialStreamWidth, initialStreamHeight);
    console.log("Initialized UI in Auto Resolution Mode (defaulting to 1024x768 for now)");
  }
  canvasContext = canvas.getContext('2d');
  if (!canvasContext) {
    console.error('Failed to get 2D rendering context');
  }

  audioElement = document.createElement('audio');
  audioElement.id = 'audio_stream';
  audioElement.style.display = 'none';
  videoContainer.appendChild(audioElement);

  playButtonElement = document.createElement('button');
  playButtonElement.id = 'playButton';
  playButtonElement.textContent = 'Play Stream';
  videoContainer.appendChild(playButtonElement);
  playButtonElement.classList.add('hidden');
  statusDisplayElement.classList.remove('hidden');
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
    keyboardInputAssist.style.position = 'absolute';
    keyboardInputAssist.style.left = '-9999px';
    keyboardInputAssist.style.top = '-9999px';
    keyboardInputAssist.style.width = '1px';
    keyboardInputAssist.style.height = '1px';
    keyboardInputAssist.style.opacity = '0';
    keyboardInputAssist.style.border = '0';
    keyboardInputAssist.style.padding = '0';
    keyboardInputAssist.style.caretColor = 'transparent';
    keyboardInputAssist.setAttribute('aria-hidden', 'true');
    keyboardInputAssist.setAttribute('autocomplete', 'off');
    keyboardInputAssist.setAttribute('autocorrect', 'off');
    keyboardInputAssist.setAttribute('autocapitalize', 'off');
    keyboardInputAssist.setAttribute('spellcheck', 'false');
    document.body.appendChild(keyboardInputAssist);
    console.log("Dynamically added #keyboard-input-assist element.");
  }
  appDiv.appendChild(videoContainer);
  updateStatusDisplay();
  playButtonElement.addEventListener('click', playStream);

  if (isSharedMode) {
      updateUIForSharedMode(); // Call after main UI elements are in DOM
  }
};

function clearAllVncStripeDecoders() {
  console.log("Clearing all VNC stripe decoders.");
  for (const yPos in vncStripeDecoders) {
    if (vncStripeDecoders.hasOwnProperty(yPos)) {
      const decoderInfo = vncStripeDecoders[yPos];
      if (decoderInfo.decoder && decoderInfo.decoder.state !== "closed") {
        try {
          decoderInfo.decoder.close();
          console.log(`Closed VNC stripe decoder for Y=${yPos}`);
        } catch (e) {
          console.error(`Error closing VNC stripe decoder for Y=${yPos}:`, e);
        }
      }
    }
  }
  vncStripeDecoders = {};
  vncStripeFrameMetadata = {};
  console.log("All VNC stripe decoders and metadata cleared.");
}

function processPendingChunksForStripe(stripe_y_start) {
  const decoderInfo = vncStripeDecoders[stripe_y_start];
  if (!decoderInfo || decoderInfo.decoder.state !== "configured" || !decoderInfo.pendingChunks) {
    return;
  }
  console.log(`Processing ${decoderInfo.pendingChunks.length} pending chunks for stripe Y=${stripe_y_start}`);
  while (decoderInfo.pendingChunks.length > 0) {
    const pending = decoderInfo.pendingChunks.shift();
    const chunk = new EncodedVideoChunk({
      type: pending.type,
      timestamp: pending.timestamp,
      data: pending.data
    });
    try {
      decoderInfo.decoder.decode(chunk);
    } catch (e) {
      console.error(`Error decoding pending chunk for stripe Y=${stripe_y_start}:`, e, chunk);
    }
  }
}

window.vncStripesDecodedThisPeriod = 0;
window.vncStripesArrivedThisPeriod = 0;
window.lastVncStripeRateLogTime = performance.now();
window.VNC_STRIPE_LOG_INTERVAL_MS = 1000;
let decodedStripesQueue = [];

function handleDecodedVncStripeFrame(yPos, vncFrameID, frame) {
  decodedStripesQueue.push({
    yPos,
    frame,
    vncFrameID
  });
}

async function handleAdvancedAudioClick() {
  console.log("Advanced Audio Settings button clicked.");
  if (!audioDeviceSettingsDivElement || !audioInputSelectElement || !audioOutputSelectElement) {
    console.error("Audio device UI elements not found in dev sidebar.");
    return;
  }
  const isHidden = audioDeviceSettingsDivElement.classList.contains('hidden');
  if (isHidden) {
    console.log("Settings are hidden, attempting to show and populate...");
    const supportsSinkId = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
    const outputLabel = document.getElementById('audioOutputLabel');
    if (!supportsSinkId) {
      console.warn('Browser does not support selecting audio output device (setSinkId). Hiding output selection.');
      if (outputLabel) outputLabel.classList.add('hidden');
      audioOutputSelectElement.classList.add('hidden');
    } else {
      if (outputLabel) outputLabel.classList.remove('hidden');
      audioOutputSelectElement.classList.remove('hidden');
    }
    try {
      console.log("Requesting microphone permission for device listing...");
      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      tempStream.getTracks().forEach(track => track.stop());
      console.log("Microphone permission granted or already available (temporary stream stopped).");
      console.log("Enumerating media devices...");
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log("Devices found:", devices);
      audioInputSelectElement.innerHTML = '';
      audioOutputSelectElement.innerHTML = '';
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
      audioDeviceSettingsDivElement.classList.remove('hidden');
    } catch (err) {
      console.error('Error getting media devices or permissions:', err);
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
  if (isSharedMode) {
    console.log("Shared mode: File upload via requestFileUpload blocked.");
    return;
  }
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
  if (isSharedMode) {
    console.log("Shared mode: File upload via fileInputChange blocked.");
    event.target.value = null; // Clear the input
    return;
  }
  const files = event.target.files;
  if (!files || files.length === 0) {
    event.target.value = null;
    return;
  }
  console.log(`File input changed, processing ${files.length} files sequentially.`);
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    console.error("WebSocket is not open. Cannot upload selected files.");
    window.postMessage({
      type: 'fileUpload',
      payload: {
        status: 'error',
        fileName: 'N/A',
        message: "WebSocket not open for upload."
      }
    }, window.location.origin);
    event.target.value = null;
    return;
  }
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pathToSend = file.name;
      console.log(`Uploading file ${i + 1}/${files.length}: ${pathToSend}`);
      await uploadFileObject(file, pathToSend);
    }
    console.log("Finished processing all files from input.");
  } catch (error) {
    const errorMsg = `An error occurred during the file input upload process: ${error.message || error}`;
    console.error(errorMsg);
    window.postMessage({
      type: 'fileUpload',
      payload: {
        status: 'error',
        fileName: 'N/A',
        message: errorMsg
      }
    }, window.location.origin);
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      try {
        websocket.send(`FILE_UPLOAD_ERROR:GENERAL:File input processing failed`);
      } catch (_) {}
    }
  } finally {
    event.target.value = null;
  }
}

const startStream = () => {
  if (streamStarted) return;
  streamStarted = true;
  if (statusDisplayElement) statusDisplayElement.classList.add('hidden');
  if (playButtonElement) playButtonElement.classList.add('hidden');
  console.log("Stream started (UI elements hidden).");
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
    console.log("Input already initialized. Skipping.");
    return;
  }
  inputInitialized = true;
  console.log("Initializing Input system...");

  let inputInstance;
  const websocketSendInput = (message) => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(message);
    } else {
      console.warn("initializeInput: WebSocket not open, cannot send input message:", message);
    }
  };

  const sendInputFunction = websocketSendInput;

  if (!overlayInput) {
    console.error("initializeInput: overlayInput element not found. Cannot initialize input handling.");
    inputInitialized = false;
    return;
  }

  inputInstance = new Input(overlayInput, sendInputFunction, isSharedMode);

  inputInstance.getWindowResolution = () => {
    const videoContainer = document.querySelector('.video-container');
    if (!videoContainer) {
      console.warn('initializeInput: .video-container not found, using window inner dimensions for resolution calculation.');
      return [window.innerWidth, window.innerHeight];
    }
    const videoContainerRect = videoContainer.getBoundingClientRect();
    return [videoContainerRect.width, videoContainerRect.height];
  };

  inputInstance.ongamepadconnected = (gamepad_id) => {
    gamepad.gamepadState = 'connected';
    gamepad.gamepadName = gamepad_id;
    console.log(`Client: Gamepad "${gamepad_id}" connected. isSharedMode: ${isSharedMode}, isGamepadEnabled (global toggle): ${isGamepadEnabled}`);
    if (window.webrtcInput && window.webrtcInput.gamepadManager) {
        if (isSharedMode) {
            window.webrtcInput.gamepadManager.enable();
            console.log("Shared mode: Gamepad connected, ensuring its GamepadManager is active for polling.");
        } else {
            if (!isGamepadEnabled) {
                window.webrtcInput.gamepadManager.disable();
                console.log("Primary mode: Gamepad connected, but master gamepad toggle is OFF. Disabling its GamepadManager.");
            } else {
                window.webrtcInput.gamepadManager.enable();
                console.log("Primary mode: Gamepad connected, master gamepad toggle is ON. Ensuring its GamepadManager is active.");
            }
        }
    } else {
        console.warn("Client: window.webrtcInput.gamepadManager not found in ongamepadconnected. Cannot control its polling state.");
    }
  };

  inputInstance.ongamepaddisconnected = () => {
    gamepad.gamepadState = 'disconnected';
    gamepad.gamepadName = 'none';
    console.log("Gamepad disconnected.");
  };

  inputInstance.attach();


  const handleResizeUI = () => {
    if (isSharedMode) {
        console.log("Shared mode: handleResizeUI (auto-resize logic) skipped.");
        // In shared mode, canvas buffer size is driven by stream dimensions.
        // CSS scaling is re-applied on window resize by a listener in initializeUI.
        if (manualWidth && manualHeight && manualWidth > 0 && manualHeight > 0) {
            applyManualCanvasStyle(manualWidth, manualHeight, true);
        }
        return;
    }
    if (window.isManualResolutionMode) {
      console.log("handleResizeUI: Auto-resize skipped, manual resolution mode is active.");
      return;
    }

    console.log("handleResizeUI: Auto-resize triggered (e.g., by window resize event).");
    const windowResolution = inputInstance.getWindowResolution();
    const evenWidth = roundDownToEven(windowResolution[0]);
    const evenHeight = roundDownToEven(windowResolution[1]);

    if (evenWidth <= 0 || evenHeight <= 0) {
      console.warn(`handleResizeUI: Calculated invalid dimensions (${evenWidth}x${evenHeight}). Skipping resize send.`);
      return;
    }

    sendResolutionToServer(evenWidth, evenHeight);
    resetCanvasStyle(evenWidth, evenHeight);
  };

  handleResizeUI_globalRef = handleResizeUI;
  originalWindowResizeHandler = debounce(handleResizeUI, 500);

  if (isSharedMode) {
    console.log("Shared mode: Auto-resize event listener (originalWindowResizeHandler) NOT attached.");
    // Shared mode has its own simple window resize listener in initializeUI for CSS adjustments.
  } else if (!window.isManualResolutionMode) {
    console.log("initializeInput: Auto-resolution mode. Attaching 'resize' event listener for subsequent changes.");
    window.addEventListener('resize', originalWindowResizeHandler);
    const videoContainer = document.querySelector('.video-container');
    let currentAutoWidth, currentAutoHeight;
    if (videoContainer) {
      const rect = videoContainer.getBoundingClientRect();
      currentAutoWidth = roundDownToEven(rect.width);
      currentAutoHeight = roundDownToEven(rect.height);
    } else {
      currentAutoWidth = roundDownToEven(window.innerWidth);
      currentAutoHeight = roundDownToEven(window.innerHeight);
    }
    if (currentAutoWidth <= 0 || currentAutoHeight <= 0) {
      console.warn(`initializeInput: Current auto-calculated dimensions are invalid (${currentAutoWidth}x${currentAutoHeight}). Defaulting canvas style to 1024x768 for initial setup. The resolution sent by onopen should prevail on the server.`);
      currentAutoWidth = 1024;
      currentAutoHeight = 768;
    }
    resetCanvasStyle(currentAutoWidth, currentAutoHeight);
    console.log(`initializeInput: Canvas style reset to reflect current auto-dimensions: ${currentAutoWidth}x${currentAutoHeight}. Initial resolution was already sent by onopen.`);
  } else { // Non-shared, manual mode
    console.log("initializeInput: Manual resolution mode active. Initial resolution already sent by onopen.");
    if (manualWidth != null && manualHeight != null && manualWidth > 0 && manualHeight > 0) {
      // applyManualCanvasStyle is called in initializeUI for this case
      disableAutoResize(); // Sets up directManualLocalScalingHandler
    } else {
      console.warn("initializeInput: Manual mode is set, but manualWidth/Height are invalid. Canvas might not display correctly.");
    }
  }

  if (overlayInput && !isSharedMode) {
    overlayInput.addEventListener('dragover', handleDragOver);
    overlayInput.addEventListener('drop', handleDrop);
  } else if (overlayInput && isSharedMode) {
    console.log("Shared mode: Drag/drop file upload listeners NOT attached to overlayInput.");
  } else {
    console.warn("initializeInput: overlayInput not found, cannot attach drag/drop listeners.");
  }

  window.webrtcInput = inputInstance;

  const keyboardInputAssist = document.getElementById('keyboard-input-assist');
  if (keyboardInputAssist && inputInstance && !isSharedMode) { // Keyboard assist only for non-shared
    keyboardInputAssist.addEventListener('input', (event) => {
      const typedString = keyboardInputAssist.value;
      if (typedString) {
        inputInstance._typeString(typedString);
        keyboardInputAssist.value = '';
      }
    });
    keyboardInputAssist.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.keyCode === 13) {
        const enterKeysym = 0xFF0D;
        inputInstance._guac_press(enterKeysym);
        setTimeout(() => inputInstance._guac_release(enterKeysym), 5);
        event.preventDefault();
        keyboardInputAssist.value = '';
      } else if (event.key === 'Backspace' || event.keyCode === 8) {
        const backspaceKeysym = 0xFF08;
        inputInstance._guac_press(backspaceKeysym);
        setTimeout(() => inputInstance._guac_release(backspaceKeysym), 5);
        event.preventDefault();
      }
    });
    console.log("initializeInput: Added 'input' and 'keydown' listeners to #keyboard-input-assist.");
  } else if (isSharedMode) {
    console.log("Shared mode: Keyboard input assist listeners NOT attached.");
  } else {
    console.error("initializeInput: Could not add listeners to keyboard assist: Element or Input handler instance not found.");
  }
  console.log("Input system initialized.");
};

async function applyOutputDevice() {
  if (!preferredOutputDeviceId) {
    console.log("No preferred output device set, using default.");
    return;
  }
  const supportsSinkId = (typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype) ||
    (audioElement && typeof audioElement.setSinkId === 'function');
  if (!supportsSinkId) {
    console.warn("Browser does not support setSinkId, cannot apply output device preference.");
    if (audioOutputSelectElement) audioOutputSelectElement.classList.add('hidden');
    const outputLabel = document.getElementById('audioOutputLabel');
    if (outputLabel) outputLabel.classList.add('hidden');
    return;
  }
  if (audioContext) {
    if (audioContext.state === 'running') {
      try {
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
}

window.addEventListener('message', receiveMessage, false);

function postSidebarButtonUpdate() {
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
  if (event.origin !== window.location.origin) {
    console.warn(`Received message from unexpected origin: ${event.origin}. Expected ${window.location.origin}. Ignoring.`);
    return;
  }
  const message = event.data;
  if (typeof message !== 'object' || message === null) {
    console.warn('Received non-object message via window.postMessage:', message);
    return;
  }
  if (!message.type) {
    console.warn('Received message without a type property:', message);
    return;
  }
  switch (message.type) {
    case 'setScaleLocally':
      if (isSharedMode) {
        console.log("Shared mode: setScaleLocally message ignored (forced true behavior).");
        break;
      }
      if (typeof message.value === 'boolean') {
        scaleLocallyManual = message.value;
        setBoolParam('scaleLocallyManual', scaleLocallyManual);
        console.log(`Set scaleLocallyManual to ${scaleLocallyManual} and persisted.`);
        if (window.isManualResolutionMode && manualWidth !== null && manualHeight !== null) {
          console.log("Applying new scaling style in manual mode.");
          applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
        }
      } else {
        console.warn("Invalid value received for setScaleLocally:", message.value);
      }
      break;
    case 'showVirtualKeyboard':
      if (isSharedMode) {
        console.log("Shared mode: showVirtualKeyboard message ignored.");
        break;
      }
      console.log("Received 'showVirtualKeyboard' message.");
      const kbdAssistInput = document.getElementById('keyboard-input-assist');
      const mainInteractionOverlay = document.getElementById('overlayInput');
      if (kbdAssistInput) {
        kbdAssistInput.value = '';
        kbdAssistInput.focus();
        console.log("Focused #keyboard-input-assist element.");
        mainInteractionOverlay.addEventListener(
          "touchstart",
          () => {
            if (document.activeElement === kbdAssistInput) {
              kbdAssistInput.blur();
            }
          }, {
            once: true,
            passive: true
          }
        );
      } else {
        console.error("Could not find #keyboard-input-assist element to focus.");
      }
      break;
    case 'setManualResolution':
      if (isSharedMode) {
        console.log("Shared mode: setManualResolution message ignored.");
        break;
      }
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
      setIntParam('manualWidth', manualWidth);
      setIntParam('manualHeight', manualHeight);
      setBoolParam('isManualResolutionMode', true);
      disableAutoResize();
      sendResolutionToServer(manualWidth, manualHeight);
      applyManualCanvasStyle(manualWidth, manualHeight, scaleLocallyManual);
      if (currentEncoderMode === 'x264enc-striped') {
        console.log("Clearing VNC stripe decoders due to manual resolution change.");
        clearAllVncStripeDecoders();
        if (canvasContext) canvasContext.setTransform(1, 0, 0, 1, 0, 0);
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
      }
      break;
    case 'resetResolutionToWindow':
      if (isSharedMode) {
        console.log("Shared mode: resetResolutionToWindow message ignored.");
        break;
      }
      console.log("Resetting resolution to window size.");
      window.isManualResolutionMode = false;
      manualWidth = null;
      manualHeight = null;
      setIntParam('manualWidth', null);
      setIntParam('manualHeight', null);
      setBoolParam('isManualResolutionMode', false);
      const currentWindowRes = window.webrtcInput ? window.webrtcInput.getWindowResolution() : [window.innerWidth, window.innerHeight];
      const autoWidth = roundDownToEven(currentWindowRes[0]);
      const autoHeight = roundDownToEven(currentWindowRes[1]);
      resetCanvasStyle(autoWidth, autoHeight);
      if (currentEncoderMode === 'x264enc-striped') {
        console.log("Clearing VNC stripe decoders due to resolution reset to window.");
        clearAllVncStripeDecoders();
        if (canvasContext) canvasContext.setTransform(1, 0, 0, 1, 0, 0);
        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
      }
      enableAutoResize();
      break;
    case 'settings':
      console.log('Received settings message:', message.settings);
      handleSettingsMessage(message.settings); // handleSettingsMessage itself gates server sends if isSharedMode
      break;
    case 'getStats':
      console.log('Received getStats message.');
      sendStatsMessage();
      break;
    case 'clipboardUpdateFromUI':
      console.log('Received clipboardUpdateFromUI message.');
      if (isSharedMode) {
        console.log("Shared mode: Clipboard write to server blocked.");
        break;
      }
      const newClipboardText = message.text;
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        try {
          const encodedText = btoa(newClipboardText);
          const clipboardMessage = `cw,${encodedText}`;
          websocket.send(clipboardMessage);
          console.log(`Sent clipboard update from UI to server: cw,...`);
        } catch (e) {
          console.error('Failed to encode or send clipboard text from UI:', e);
        }
      } else {
        console.warn('Cannot send clipboard update from UI: Not connected.');
      }
      break;
    case 'pipelineStatusUpdate':
      console.log('Received pipelineStatusUpdate message:', message);
      let stateChangedFromStatus = false;
      if (message.video !== undefined && isVideoPipelineActive !== message.video) {
        isVideoPipelineActive = message.video;
        stateChangedFromStatus = true;
      }
      if (message.audio !== undefined && isAudioPipelineActive !== message.audio) {
        isAudioPipelineActive = message.audio;
        stateChangedFromStatus = true;
      }
      if (message.microphone !== undefined && isMicrophoneActive !== message.microphone) {
        isMicrophoneActive = message.microphone;
        stateChangedFromStatus = true;
      }
      if (message.gamepad !== undefined && isGamepadEnabled !== message.gamepad) {
        isGamepadEnabled = message.gamepad;
        stateChangedFromStatus = true;
      }
      if (stateChangedFromStatus) {
        postSidebarButtonUpdate();
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
            stateChangedFromControl = true;
            if (!isVideoPipelineActive) {
              cleanupVideoBuffer();
              if (currentEncoderMode === 'x264enc-striped') {
                clearAllVncStripeDecoders();
              }
            }
            wsMessage = desiredState ? 'START_VIDEO' : 'STOP_VIDEO';
          }
        } else if (pipeline === 'audio') {
          if (isAudioPipelineActive !== desiredState) {
            isAudioPipelineActive = desiredState;
            stateChangedFromControl = true;
            wsMessage = desiredState ? 'START_AUDIO' : 'STOP_AUDIO';
            if (audioDecoderWorker) {
              audioDecoderWorker.postMessage({
                type: 'updatePipelineStatus',
                data: {
                  isActive: isAudioPipelineActive
                }
              });
            }
          }
        }
        if (stateChangedFromControl) {
          postSidebarButtonUpdate();
        }
        if (wsMessage && websocket && websocket.readyState === WebSocket.OPEN) {
          if (isSharedMode) {
            console.log(`Shared mode: Blocked sending ${wsMessage} for pipeline ${pipeline}.`);
          } else {
            websocket.send(wsMessage);
          }
        } else if (wsMessage) {
          console.warn(`Cannot send ${pipeline} pipelineControl command: Websocket not open.`);
        }
      } else if (pipeline === 'microphone') {
        if (isSharedMode) {
          console.log("Shared mode: Microphone control blocked.");
          break;
        }
        if (desiredState) {
          startMicrophoneCapture();
        } else {
          stopMicrophoneCapture();
        }
      } else {
        console.warn(`Received pipelineControl message for unknown pipeline: ${pipeline}`);
      }
      break;
    case 'audioDeviceSelected':
      console.log('Received audioDeviceSelected message:', message);
      if (isSharedMode && message.context === 'input') {
          console.log("Shared mode: Audio input device selection ignored.");
          break;
      }
      const {
        context, deviceId
      } = message;
      if (!deviceId) {
        console.warn("Received audioDeviceSelected message without a deviceId.");
        break;
      }
      if (context === 'input') {
        preferredInputDeviceId = deviceId;
        if (isMicrophoneActive) {
          stopMicrophoneCapture();
          setTimeout(startMicrophoneCapture, 150);
        }
      } else if (context === 'output') {
        preferredOutputDeviceId = deviceId;
        applyOutputDevice();
      } else {
        console.warn(`Unknown context in audioDeviceSelected message: ${context}`);
      }
      break;
    case 'gamepadControl':
      console.log(`Received gamepad control message: enabled=${message.enabled}`);
      const newGamepadState = message.enabled;
      if (isGamepadEnabled !== newGamepadState) {
        isGamepadEnabled = newGamepadState;
        setBoolParam('isGamepadEnabled', isGamepadEnabled);
        postSidebarButtonUpdate();
        if (window.webrtcInput && window.webrtcInput.gamepadManager) {
            if (isSharedMode) {
                // In shared mode, the shared client's gamepad manager should always be enabled for polling,
                window.webrtcInput.gamepadManager.enable();
                console.log("Shared mode: Gamepad control message received, ensuring its GamepadManager remains active for polling.");
            } else {
                // Primary client: respect the toggle
                if (isGamepadEnabled) {
                    window.webrtcInput.gamepadManager.enable();
                    console.log("Primary mode: Gamepad toggle ON. Enabling GamepadManager polling.");
                } else {
                    window.webrtcInput.gamepadManager.disable();
                    console.log("Primary mode: Gamepad toggle OFF. Disabling GamepadManager polling.");
                }
            }
        } else {
            console.warn("Client: window.webrtcInput.gamepadManager not found in 'gamepadControl' message handler.");
        }
      }
      break;
    case 'gamepadButtonUpdate':
    case 'gamepadAxisUpdate':
      if (isSharedMode) break; // Gamepad input not sent
      if (message.gamepadIndex === 0) {
        if (!gamepadStates[0]) gamepadStates[0] = {
          buttons: {},
          axes: {}
        };
        if (message.type === 'gamepadButtonUpdate') {
          if (!gamepadStates[0].buttons) gamepadStates[0].buttons = {};
          gamepadStates[0].buttons[message.buttonIndex] = message.value;
        } else {
          if (!gamepadStates[0].axes) gamepadStates[0].axes = {};
          gamepadStates[0].axes[message.axisIndex] = Math.max(-1, Math.min(1, message.value));
        }
        updateGamepadVisuals(0);
      }
      break;
    case 'requestFullscreen':
      enterFullscreen();
      break;
    case 'command':
      if (isSharedMode) {
        console.log("Shared mode: Arbitrary command sending to server blocked.");
        break;
      }
      if (typeof message.value === 'string') {
        const commandString = message.value;
        console.log(`Received 'command' message with value: "${commandString}". Forwarding to WebSocket.`);
        if (websocket && websocket.readyState === WebSocket.OPEN) {
          try {
            websocket.send(`cmd,${commandString}`);
            console.log(`Sent command to server via WebSocket: cmd,${commandString}`);
          } catch (e) {
            console.error('Failed to send command via WebSocket:', e);
          }
        } else {
          console.warn('Cannot send command: WebSocket is not open or not available.');
        }
      } else {
        console.warn("Received 'command' message without a string value:", message);
      }
      break;
    default:
      break;
  }
}

function handleSettingsMessage(settings) {
  console.log('Applying settings:', settings);
  if (settings.videoBitRate !== undefined) {
    videoBitRate = parseInt(settings.videoBitRate);
    setIntParam('videoBitRate', videoBitRate);
    if (!isSharedMode && websocket && websocket.readyState === WebSocket.OPEN) {
      const message = `SET_VIDEO_BITRATE,${videoBitRate}`;
      console.log(`Sent websocket message: ${message}`);
      websocket.send(message);
    } else if (!isSharedMode) {
      console.warn("Websocket connection not open, cannot send video bitrate setting.");
    }
  }
  if (settings.videoFramerate !== undefined) {
    videoFramerate = parseInt(settings.videoFramerate);
    setIntParam('videoFramerate', videoFramerate);
    if (!isSharedMode && websocket && websocket.readyState === WebSocket.OPEN) {
      const message = `SET_FRAMERATE,${videoFramerate}`;
      console.log(`Sent websocket message: ${message}`);
      websocket.send(message);
    } else if (!isSharedMode) {
      console.warn("Websocket connection not open, cannot send framerate setting.");
    }
  }
  if (settings.resizeRemote !== undefined) {
    resizeRemote = settings.resizeRemote;
    setBoolParam('resizeRemote', resizeRemote);
    console.warn("ResizeRemote setting received; for websockets, server ENABLE_RESIZE and client 'r,' messages control resizing.");
  }
  if (settings.encoder !== undefined) {
    const newEncoderSetting = settings.encoder;
    const oldEncoderActual = currentEncoderMode;

    if (oldEncoderActual !== newEncoderSetting) {
      currentEncoderMode = newEncoderSetting;
      setStringParam('encoder', currentEncoderMode);

      if (!isSharedMode && websocket && websocket.readyState === WebSocket.OPEN) {
        const message = `SET_ENCODER,${currentEncoderMode}`;
        console.log(`Sent websocket message: ${message}`);
        websocket.send(message);
      } else if (!isSharedMode) {
        console.warn("Websocket connection not open, cannot send encoder setting.");
      }

      const isNewStripedH264 = newEncoderSetting === 'x264enc-striped';
      const isOldStripedH264 = oldEncoderActual === 'x264enc-striped';
      const isNewJpeg = newEncoderSetting === 'jpeg';
      const isOldJpeg = oldEncoderActual === 'jpeg';
      const isNewVideoPipeline = !isNewJpeg && !isNewStripedH264;
      const isOldVideoPipeline = !isOldJpeg && !isOldStripedH264;

      if (isOldStripedH264 && !isNewStripedH264) {
        clearAllVncStripeDecoders();
        console.log(`Switched away from ${oldEncoderActual}, cleared stripe decoders.`);
      }
      if ((isOldVideoPipeline || isOldStripedH264) && isNewJpeg) {
        if (decoder && decoder.state !== 'closed') {
          console.log(`Switching from ${oldEncoderActual} to JPEG, closing main video decoder.`);
          decoder.close();
          decoder = null;
        }
      }

      if (isNewStripedH264) {
        if (canvasContext) {
          canvasContext.setTransform(1, 0, 0, 1, 0, 0);
          canvasContext.clearRect(0, 0, canvas.width, canvas.height);
          console.log("Switched to x264enc-striped, cleared canvas.");
        }
        if (decoder && decoder.state !== 'closed') {
          console.log("Switching to x264enc-striped, closing main video decoder.");
          decoder.close();
          decoder = null;
        }
      } else if (isNewJpeg) {
        console.log("Encoder changed to JPEG. Ensuring canvas buffer is correctly sized.");
        let currentTargetWidth, currentTargetHeight;
        if (isSharedMode) { // In shared mode, use its manualWidth/Height
            currentTargetWidth = manualWidth;
            currentTargetHeight = manualHeight;
            if (currentTargetWidth && currentTargetHeight) applyManualCanvasStyle(currentTargetWidth, currentTargetHeight, true);

        } else if (window.isManualResolutionMode && manualWidth != null && manualHeight != null) {
          currentTargetWidth = manualWidth;
          currentTargetHeight = manualHeight;
          applyManualCanvasStyle(currentTargetWidth, currentTargetHeight, scaleLocallyManual);
        } else {
          if (window.webrtcInput && typeof window.webrtcInput.getWindowResolution === 'function') {
            const currentWindowRes = window.webrtcInput.getWindowResolution();
            currentTargetWidth = roundDownToEven(currentWindowRes[0]);
            currentTargetHeight = roundDownToEven(currentWindowRes[1]);
            resetCanvasStyle(currentTargetWidth, currentTargetHeight);
          } else {
            console.warn("Cannot determine auto resolution for JPEG switch: webrtcInput or getWindowResolution not available.");
          }
        }
      } else if (isNewVideoPipeline) {
        console.log(`Switching to video pipeline ${newEncoderSetting}. Ensuring main decoder is initialized/reconfigured.`);
        triggerInitializeDecoder();
      }
      const wasStripedOrJpeg = isOldJpeg || isOldStripedH264;
      if (wasStripedOrJpeg && isNewVideoPipeline) {
        console.log(`Switched from ${oldEncoderActual} (striped/jpeg) to ${newEncoderSetting} (video pipeline). Resending video bitrate ${videoBitRate} kbit/s.`);
        if (!isSharedMode && websocket && websocket.readyState === WebSocket.OPEN) {
          const message = `SET_VIDEO_BITRATE,${videoBitRate}`;
          websocket.send(message);
        }
      }
    } else {
      console.log(`Encoder setting received (${newEncoderSetting}), but it's the same as current (${oldEncoderActual}). No change.`);
    }
  }
  if (settings.videoBufferSize !== undefined) {
    videoBufferSize = parseInt(settings.videoBufferSize);
    setIntParam('videoBufferSize', videoBufferSize);
    console.log(`Applied Video buffer size setting: ${videoBufferSize} frames.`);
  }
  if (settings.videoCRF !== undefined) {
    videoCRF = parseInt(settings.videoCRF, 10);
    setIntParam('videoCRF', videoCRF);
    console.log(`Applied Video CRF setting: ${videoCRF}.`);
    if (!isSharedMode && websocket && websocket.readyState === WebSocket.OPEN) {
      const message = `SET_CRF,${videoCRF}`;
      console.log(`Sent websocket message: ${message}`);
      websocket.send(message);
    } else if (!isSharedMode) {
      console.warn("Websocket connection not open, cannot send CRF setting.");
    }
  }
  if (settings.turnSwitch !== undefined) {
    console.log(`turnSwitch setting received (WebRTC specific): ${settings.turnSwitch}. No action in WebSocket mode.`);
  }
  if (settings.debug !== undefined) {
    debug = settings.debug;
    setBoolParam('debug', debug);
    console.log(`Applied debug setting: ${debug}. Reloading...`);
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
  stats.encoderName = currentEncoderMode;
  window.parent.postMessage({
    type: 'stats',
    data: stats
  }, window.location.origin);
  console.log('Sent stats message via window.postMessage:', stats);
}

document.addEventListener('DOMContentLoaded', () => {
  async function initializeDecoder() {
    if (decoder && decoder.state !== 'closed') {
      console.warn("VideoDecoder already exists, closing before re-initializing.");
      decoder.close();
    }
    let targetWidth = 1280;
    let targetHeight = 720;

    if (isSharedMode) { // In shared mode, use its manualWidth/Height which are updated by stream
        targetWidth = manualWidth > 0 ? manualWidth : 1280;
        targetHeight = manualHeight > 0 ? manualHeight : 720;
    } else if (window.isManualResolutionMode && manualWidth != null && manualHeight != null) {
      targetWidth = manualWidth;
      targetHeight = manualHeight;
    } else if (window.webrtcInput && typeof window.webrtcInput.getWindowResolution === 'function') {
      try {
        const currentRes = window.webrtcInput.getWindowResolution();
        const autoWidth = roundDownToEven(currentRes[0]);
        const autoHeight = roundDownToEven(currentRes[1]);
        if (autoWidth > 0 && autoHeight > 0) {
          targetWidth = autoWidth;
          targetHeight = autoHeight;
        }
      } catch (e) {
        /* use defaults */
      }
    }
    decoder = new VideoDecoder({
      output: handleDecodedFrame,
      error: (e) => {
        console.error('VideoDecoder error:', e.message);
        if (e.message.includes('fatal') || decoder.state === 'closed' || decoder.state === 'unconfigured') {
          initializeDecoder();
        }
      },
    });
    const decoderConfig = {
      codec: 'avc1.42E01E',
      codedWidth: targetWidth,
      codedHeight: targetHeight,
      optimizeForLatency: true,
    };
    try {
      const support = await VideoDecoder.isConfigSupported(decoderConfig);
      if (support.supported) {
        decoder.configure(decoderConfig);
        console.log('Main VideoDecoder configured successfully with config:', decoderConfig);
      } else {
        console.error('Main VideoDecoder configuration not supported:', support, decoderConfig);
        decoder = null;
      }
    } catch (e) {
      console.error('Error configuring Main VideoDecoder with config:', e, decoderConfig);
      decoder = null;
    }
  }

  initializeUI();


  const pathname = window.location.pathname.substring(
    0,
    window.location.pathname.lastIndexOf('/') + 1
  );

  window.addEventListener('focus', () => {
    if (isSharedMode) return; // No key reset or clipboard sending in shared mode on focus
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send('kr'); // Key reset
    }
    navigator.clipboard
      .readText()
      .then((text) => {
        const encodedText = btoa(text);
        if (websocket && websocket.readyState === WebSocket.OPEN) {
          websocket.send(`cw,${encodedText}`); // Clipboard write
        }
      })
      .catch((err) => {
        console.error(`Failed to read clipboard contents on focus: ${err}`);
      });
  });

  window.addEventListener('blur', () => {
    if (isSharedMode) return; // No key reset in shared mode on blur
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send('kr'); // Key reset
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (isSharedMode) {
      console.log("Shared mode: Tab visibility changed, stream control bypassed. Current state:", document.hidden ? "hidden" : "visible");
      // Rendering loop (paintVideoFrame) already checks document.hidden for drawing frames.
      // Audio continues regardless.
      return;
    }
    if (document.hidden) {
      console.log('Tab is hidden, stopping video pipeline.');
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        if (isVideoPipelineActive) {
          websocket.send('STOP_VIDEO');
          isVideoPipelineActive = false;
          window.postMessage({
            type: 'pipelineStatusUpdate',
            video: false
          }, window.location.origin);
          if (currentEncoderMode === 'x264enc-striped') {
            console.log("Tab hidden in VNC mode, clearing stripe decoders.");
            clearAllVncStripeDecoders();
          }
        }
      }
      cleanupVideoBuffer();
    } else {
      console.log('Tab is visible, starting video pipeline.');
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        if (!isVideoPipelineActive) {
          websocket.send('START_VIDEO');
          isVideoPipelineActive = true;
          window.postMessage({
            type: 'pipelineStatusUpdate',
            video: true
          }, window.location.origin);
          if (currentEncoderMode === 'x264enc-striped' && canvasContext) {
            canvasContext.setTransform(1, 0, 0, 1, 0, 0);
            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      }
    }
  });

  async function decodeAndQueueJpegStripe(startY, jpegData) {
    if (typeof ImageDecoder === 'undefined') {
      console.warn('ImageDecoder API not supported. Cannot decode JPEG stripes.');
      return;
    }
    try {
      const imageDecoder = new ImageDecoder({
        data: jpegData,
        type: 'image/jpeg'
      });
      const result = await imageDecoder.decode();
      jpegStripeRenderQueue.push({
        image: result.image,
        startY: startY
      });
      imageDecoder.close();
    } catch (error) {
      console.error('Error decoding JPEG stripe:', error, 'startY:', startY, 'dataLength:', jpegData.byteLength);
    }
  }

  function handleDecodedFrame(frame) {
    if (document.hidden && !isSharedMode) { // Shared mode processes even if hidden (audio must continue)
      frame.close();
      return;
    }
    if (!isVideoPipelineActive && clientMode === 'websockets' && !isSharedMode) {
      frame.close();
      return;
    }

    if (isSharedMode) {
      if ((manualWidth !== frame.codedWidth || manualHeight !== frame.codedHeight) && frame.codedWidth > 0 && frame.codedHeight > 0) {
        manualWidth = frame.codedWidth;
        manualHeight = frame.codedHeight;
        console.log(`Shared mode: Updated manual dimensions from H.264 frame: ${manualWidth}x${manualHeight}`);
        applyManualCanvasStyle(manualWidth, manualHeight, true);
      }
    }
    videoFrameBuffer.push(frame);
  }

  triggerInitializeDecoder = initializeDecoder;
  console.log("initializeDecoder function assigned to triggerInitializeDecoder.");

  function paintVideoFrame() {
    if (!canvas || !canvasContext) {
      requestAnimationFrame(paintVideoFrame);
      return;
    }

    if (isSharedMode) {
      if (manualWidth && manualHeight && manualWidth > 0 && manualHeight > 0 &&
          (canvas.width !== manualWidth || canvas.height !== manualHeight)) {
        console.log(`Shared mode (paintVideoFrame): Canvas buffer ${canvas.width}x${canvas.height} out of sync with manual ${manualWidth}x${manualHeight}. Re-applying style.`);
        applyManualCanvasStyle(manualWidth, manualHeight, true);
      }
    }
    
    // For shared mode, rendering continues even if tab is "logically" hidden to keep audio sync,
    // but actual drawing to canvas can be skipped if truly not visible.
    // However, the prompt says "Continue to process and decode incoming video and audio data as it arrives, regardless of tab visibility."
    // and implies rendering continues. For simplicity, let's assume drawing continues if frames are available.
    // The `handleDecodedFrame` already has a `document.hidden` check for non-shared mode.

    let videoPaintedThisFrame = false;
    let jpegPaintedThisFrame = false;

    if (currentEncoderMode === 'x264enc-striped') {
      if (isSharedMode && decodedStripesQueue.length > 0) {
          const firstStripeFrame = decodedStripesQueue[0].frame;
          if (firstStripeFrame && firstStripeFrame.codedWidth > 0 && manualWidth !== firstStripeFrame.codedWidth) {
              manualWidth = firstStripeFrame.codedWidth;
              console.log(`Shared mode: Updated manualWidth from VNC stripe: ${manualWidth}`);
              // manualHeight is not updated from stripes, it's from full frame or default
              if (manualHeight && manualWidth && manualHeight > 0) {
                  applyManualCanvasStyle(manualWidth, manualHeight, true);
              }
          }
      }
      let paintedSomethingThisCycle = false;
      for (const stripeData of decodedStripesQueue) {
        if (canvas.width > 0 && canvas.height > 0) { // Ensure canvas is ready
            canvasContext.drawImage(stripeData.frame, 0, stripeData.yPos);
        }
        stripeData.frame.close();
        paintedSomethingThisCycle = true;
      }
      decodedStripesQueue = [];
      if (paintedSomethingThisCycle && !streamStarted) {
        startStream();
      }
    } else if (currentEncoderMode === 'jpeg') {
      if (canvasContext && jpegStripeRenderQueue.length > 0) {
        if (isSharedMode && jpegStripeRenderQueue.length > 0) {
            const firstStripeImage = jpegStripeRenderQueue[0].image;
            if (firstStripeImage && firstStripeImage.codedWidth > 0 && manualWidth !== firstStripeImage.codedWidth) {
                manualWidth = firstStripeImage.codedWidth;
                console.log(`Shared mode: Updated manualWidth from JPEG stripe: ${manualWidth}`);
                // manualHeight is not updated from stripes
                if (manualHeight && manualWidth && manualHeight > 0) {
                    applyManualCanvasStyle(manualWidth, manualHeight, true);
                }
            }
        }
        if ((canvas.width === 0 || canvas.height === 0) || (canvas.width === 300 && canvas.height === 150)) {
          const firstStripe = jpegStripeRenderQueue[0];
          if (firstStripe && firstStripe.image && (firstStripe.startY + firstStripe.image.height > canvas.height || firstStripe.image.width > canvas.width)) {
            console.warn(`[paintVideoFrame] Canvas dimensions (${canvas.width}x${canvas.height}) may be too small for JPEG stripes.`);
          }
        }
        while (jpegStripeRenderQueue.length > 0) {
          const segment = jpegStripeRenderQueue.shift();
          if (segment && segment.image) {
            try {
              if (canvas.width > 0 && canvas.height > 0) { // Ensure canvas is ready
                canvasContext.drawImage(segment.image, 0, segment.startY);
              }
              segment.image.close();
              jpegPaintedThisFrame = true;
            } catch (e) {
              console.error("[paintVideoFrame] Error drawing JPEG segment:", e, segment);
              if (segment.image && typeof segment.image.close === 'function') {
                segment.image.close();
              }
            }
          }
        }
        if (jpegPaintedThisFrame && !streamStarted) {
          startStream();
          if (!inputInitialized && !isSharedMode) initializeInput(); // Input only for non-shared
        }
      }
    } else { 
      if (!document.hidden || isSharedMode) { // Draw if visible or in shared mode
        if (isVideoPipelineActive || isSharedMode) { // Also draw if shared mode, regardless of isVideoPipelineActive server state (as we want to show what we get)
           if (videoFrameBuffer.length > videoBufferSize) {
                const frameToPaint = videoFrameBuffer.shift();
                if (frameToPaint) {
                    if (canvas.width > 0 && canvas.height > 0) { // Ensure canvas is ready
                        canvasContext.drawImage(frameToPaint, 0, 0);
                    }
                    frameToPaint.close();
                    videoPaintedThisFrame = true;
                    frameCount++;
                    if (!streamStarted) {
                        startStream();
                        if (!inputInitialized && !isSharedMode) initializeInput();
                    }
                }
            }
        }
      }
    }
    requestAnimationFrame(paintVideoFrame);
  }

  async function initializeAudio() {
    if (!audioContext) {
      const contextOptions = {
        sampleRate: 48000
      };
      audioContext = new(window.AudioContext || window.webkitAudioContext)(contextOptions);
      console.log('Playback AudioContext initialized. Actual sampleRate:', audioContext.sampleRate, 'Initial state:', audioContext.state);
      audioContext.onstatechange = () => {
        console.log(`Playback AudioContext state changed to: ${audioContext.state}`);
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
                const pcmData = new Float32Array(event.data.audioData);
                this.audioBufferQueue.push(pcmData);
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
        type: 'text/javascript'
      });
      const audioWorkletURL = URL.createObjectURL(audioWorkletBlob);
      await audioContext.audioWorklet.addModule(audioWorkletURL);
      URL.revokeObjectURL(audioWorkletURL);
      audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-frame-processor', {
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      audioWorkletProcessorPort = audioWorkletNode.port;
      audioWorkletProcessorPort.onmessage = (event) => {
        if (event.data.type === 'audioBufferSize') {
          window.currentAudioBufferSize = event.data.size;
        }
      };
      audioWorkletNode.connect(audioContext.destination);
      console.log('Playback AudioWorkletProcessor initialized and connected.');
      await applyOutputDevice();

      if (audioDecoderWorker) {
        console.warn("[Main] Terminating existing audio decoder worker before creating a new one.");
        audioDecoderWorker.postMessage({
          type: 'close'
        });
        await new Promise(resolve => setTimeout(resolve, 50));
        if (audioDecoderWorker) audioDecoderWorker.terminate();
        audioDecoderWorker = null;
      }
      const audioDecoderWorkerBlob = new Blob([audioDecoderWorkerCode], {
        type: 'application/javascript'
      });
      const audioDecoderWorkerURL = URL.createObjectURL(audioDecoderWorkerBlob);
      audioDecoderWorker = new Worker(audioDecoderWorkerURL);
      URL.revokeObjectURL(audioDecoderWorkerURL);
      audioDecoderWorker.onmessage = (event) => {
        const {
          type,
          reason,
          message
        } = event.data;
        if (type === 'decoderInitFailed') {
          console.error(`[Main] Audio Decoder Worker failed to initialize: ${reason}`);
        } else if (type === 'decoderError') {
          console.error(`[Main] Audio Decoder Worker reported error: ${message}`);
        } else if (type === 'decoderInitialized') {
          console.log('[Main] Audio Decoder Worker confirmed its decoder is initialized.');
        } else if (type === 'decodedAudioData') {
          const pcmBufferFromWorker = event.data.pcmBuffer;
          if (pcmBufferFromWorker && audioWorkletProcessorPort && audioContext && audioContext.state === 'running') {
            if (window.currentAudioBufferSize < 10) { // Keep buffer low for Opus
              audioWorkletProcessorPort.postMessage({
                audioData: pcmBufferFromWorker
              }, [pcmBufferFromWorker]);
            }
          }
        }
      };
      audioDecoderWorker.onerror = (error) => {
        console.error('[Main] Uncaught error in Audio Decoder Worker:', error.message, error);
        if (audioDecoderWorker) {
          audioDecoderWorker.terminate();
          audioDecoderWorker = null;
        }
      };
      if (audioWorkletProcessorPort) {
        audioDecoderWorker.postMessage({
          type: 'init',
          data: {
            initialPipelineStatus: isAudioPipelineActive // Or true for shared mode initially
          }
        });
        console.log('[Main] Audio Decoder Worker created and init message sent.');
      } else {
        console.error("[Main] audioWorkletProcessorPort is null, cannot initialize audioDecoderWorker correctly.");
      }
    } catch (error) {
      console.error('Error initializing Playback AudioWorklet:', error);
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
      audioContext = null;
      audioWorkletNode = null;
      audioWorkletProcessorPort = null;
    }
  }

  async function initializeDecoderAudio() {
    if (audioDecoderWorker) {
      console.log('[Main] Requesting Audio Decoder Worker to reinitialize its decoder.');
      audioDecoderWorker.postMessage({
        type: 'reinitialize'
      });
    } else {
      console.warn('[Main] Cannot initialize decoder audio: Audio Decoder Worker not available. Call initializeAudio() first.');
      if (clientMode === 'websockets' && !audioContext) { 
        console.log('[Main] Audio context missing, attempting to initialize full audio pipeline for websockets.');
        await initializeAudio();
      }
    }
  }

  const ws_protocol = location.protocol === 'http:' ? 'ws://' : 'wss://';
  const websocketEndpointURL = new URL(`${ws_protocol}${window.location.host}${pathname}websockets`);
  websocket = new WebSocket(websocketEndpointURL.href);
  websocket.binaryType = 'arraybuffer';

  const sendClientMetrics = () => {
    if (isSharedMode) return; // Shared mode does not send metrics like cfps or frame_ack

    if (websocket && websocket.readyState === WebSocket.OPEN) {
      if (audioWorkletProcessorPort) {
        audioWorkletProcessorPort.postMessage({
          type: 'getBufferSize'
        });
      }
      const now = performance.now();
      const elapsedStriped = now - lastStripedFpsUpdateTime;
      const elapsedFullFrame = now - lastFpsUpdateTime;
      const fpsUpdateInterval = 1000;
      if (uniqueStripedFrameIdsThisPeriod.size > 0) {
        if (elapsedStriped >= fpsUpdateInterval) {
          const stripedFps = (uniqueStripedFrameIdsThisPeriod.size * 1000) / elapsedStriped;
          window.fps = Math.round(stripedFps);
          uniqueStripedFrameIdsThisPeriod.clear();
          lastStripedFpsUpdateTime = now;
          frameCount = 0;
          lastFpsUpdateTime = now;
        }
      } else if (frameCount > 0) {
        if (elapsedFullFrame >= fpsUpdateInterval) {
          const fullFrameFps = (frameCount * 1000) / elapsedFullFrame;
          window.fps = Math.round(fullFrameFps);
          frameCount = 0;
          lastFpsUpdateTime = now;
          uniqueStripedFrameIdsThisPeriod.clear();
          lastStripedFpsUpdateTime = now;
        }
      } else {
        if (elapsedStriped >= fpsUpdateInterval && elapsedFullFrame >= fpsUpdateInterval) {
          window.fps = 0;
          lastFpsUpdateTime = now;
          lastStripedFpsUpdateTime = now;
        }
      }
      try {
        websocket.send('cfps,' + window.fps);
        if (lastReceivedVideoFrameId !== -1) {
          websocket.send(`CLIENT_FRAME_ACK ${lastReceivedVideoFrameId}`);
        }
      } catch (error) {
        console.error('[websockets] Error sending client metrics:', error);
      }
    }
  };

  websocket.onopen = () => {
    console.log('[websockets] Connection opened!');
    status = 'connected_waiting_mode';
    loadingText = 'Connection established. Waiting for server mode...';
    updateStatusDisplay();

    if (!isSharedMode) {
      const settingsPrefix = `${appName}_`;
      const settingsToSend = {};
      let foundSettings = false;
      let initialClientWidthForSettings, initialClientHeightForSettings;

      for (const key in localStorage) {
        if (Object.hasOwnProperty.call(localStorage, key) && key.startsWith(settingsPrefix)) {
          const unprefixedKey = key.substring(settingsPrefix.length);
          let serverExpectedKey = null;
          if (unprefixedKey === 'videoBitRate') serverExpectedKey = 'webrtc_videoBitRate';
          else if (unprefixedKey === 'videoFramerate') serverExpectedKey = 'webrtc_videoFramerate';
          else if (unprefixedKey === 'videoCRF') serverExpectedKey = 'webrtc_videoCRF';
          else if (unprefixedKey === 'encoder') serverExpectedKey = 'webrtc_encoder';
          else if (unprefixedKey === 'resizeRemote') serverExpectedKey = 'webrtc_resizeRemote';
          else if (unprefixedKey === 'isManualResolutionMode') serverExpectedKey = 'webrtc_isManualResolutionMode';
          else if (unprefixedKey === 'manualWidth') serverExpectedKey = 'webrtc_manualWidth';
          else if (unprefixedKey === 'manualHeight') serverExpectedKey = 'webrtc_manualHeight';
          else if (unprefixedKey === 'audioBitRate') serverExpectedKey = 'webrtc_audioBitRate';
          else if (unprefixedKey === 'videoBufferSize') serverExpectedKey = 'webrtc_videoBufferSize';

          if (serverExpectedKey) {
            let value = localStorage.getItem(key);
            if (serverExpectedKey === 'webrtc_resizeRemote' || serverExpectedKey === 'webrtc_isManualResolutionMode') {
              value = (value === 'true');
            } else if (['webrtc_videoBitRate', 'webrtc_videoFramerate', 'webrtc_videoCRF',
                'webrtc_manualWidth', 'webrtc_manualHeight', 'webrtc_audioBitRate',
                'webrtc_videoBufferSize'
              ].includes(serverExpectedKey)) {
              value = parseInt(value, 10);
              if (isNaN(value)) value = localStorage.getItem(key);
            }
            settingsToSend[serverExpectedKey] = value;
            foundSettings = true;
          }
        }
      }

      if (isManualResolutionMode && manualWidth != null && manualHeight != null) {
        initialClientWidthForSettings = manualWidth;
        initialClientHeightForSettings = manualHeight;
        if (settingsToSend['webrtc_isManualResolutionMode'] === undefined) settingsToSend['webrtc_isManualResolutionMode'] = true;
        if (settingsToSend['webrtc_manualWidth'] === undefined) settingsToSend['webrtc_manualWidth'] = manualWidth;
        if (settingsToSend['webrtc_manualHeight'] === undefined) settingsToSend['webrtc_manualHeight'] = manualHeight;
      } else {
        const videoContainer = document.querySelector('.video-container');
        const rect = videoContainer ? videoContainer.getBoundingClientRect() : {
          width: window.innerWidth,
          height: window.innerHeight
        };
        initialClientWidthForSettings = roundDownToEven(rect.width);
        initialClientHeightForSettings = roundDownToEven(rect.height);
        settingsToSend['webrtc_isManualResolutionMode'] = false;
        settingsToSend['webrtc_initialClientWidth'] = initialClientWidthForSettings;
        settingsToSend['webrtc_initialClientHeight'] = initialClientHeightForSettings;
      }

      try {
        const settingsJson = JSON.stringify(settingsToSend);
        const message = `SETTINGS,${settingsJson}`;
        websocket.send(message);
        console.log('[websockets] Sent initial settings (including resolution) to server:', settingsToSend);
        window.postMessage({
          type: 'initialClientSettings',
          settings: settingsToSend
        }, window.location.origin);
      } catch (e) {
        console.error('[websockets] Error constructing or sending initial settings:', e);
      }

      const isCurrentModeStripedH264_ws = currentEncoderMode === 'x264enc-striped';
      const isCurrentModeJpeg_ws = currentEncoderMode === 'jpeg';
      const isCurrentModeVideoPipeline_ws = !isCurrentModeStripedH264_ws && !isCurrentModeJpeg_ws;

      if (isCurrentModeVideoPipeline_ws) {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
          const bitrateMessage = `SET_VIDEO_BITRATE,${videoBitRate}`;
          websocket.send(bitrateMessage);
          console.log(`[websockets] Sent initial SET_VIDEO_BITRATE,${videoBitRate} for GStreamer encoder.`);
        }
      }

      const pixelRatio = window.devicePixelRatio;
      websocket.send(`s,${pixelRatio}`);
      console.log(`[websockets] Sent initial pixel ratio: ${pixelRatio}.`);
    } else {
        console.log("Shared mode: Skipping sending SETTINGS and pixel ratio onopen.");
    }

    websocket.send('cr'); // Request clipboard content (read-only is fine)
    console.log('[websockets] Sent initial clipboard request (cr) to server.');

    isVideoPipelineActive = true;
    isAudioPipelineActive = true;
    window.postMessage({
      type: 'pipelineStatusUpdate',
      video: true,
      audio: true
    }, window.location.origin);

    isMicrophoneActive = false;
    updateToggleButtonAppearance(micToggleButtonElement, isMicrophoneActive);

    if (metricsIntervalId === null && !isSharedMode) { // Metrics only for non-shared
      metricsIntervalId = setInterval(sendClientMetrics, METRICS_INTERVAL_MS);
      console.log(`[websockets] Started sending client metrics every ${METRICS_INTERVAL_MS}ms.`);
    }
  };
  websocket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      const arrayBuffer = event.data;
      const dataView = new DataView(arrayBuffer);
      if (arrayBuffer.byteLength < 1) return;
      const dataTypeByte = dataView.getUint8(0);

      if (dataTypeByte === 0) { // Full H.264 frame
        if (arrayBuffer.byteLength < 4) return;
        const frameTypeFlag = dataView.getUint8(1);
        if (!isSharedMode) lastReceivedVideoFrameId = dataView.getUint16(2, false); // No ack in shared
        const videoDataArrayBuffer = arrayBuffer.slice(4);
        if (!isVideoPipelineActive && !isSharedMode) return; // Shared mode processes always
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
            if (decoder.state === 'closed' || decoder.state === 'unconfigured') initializeDecoder();
          }
        } else {
          if (!decoder || decoder.state === 'closed') initializeDecoder();
        }
      } else if (dataTypeByte === 1) { // Audio frame
        if (window.currentAudioBufferSize >= 5 && !isSharedMode) return; // Shared mode might buffer more aggressively if needed, or just play
        if (!isAudioPipelineActive && !isSharedMode) return; // Shared mode processes always
        if (audioDecoderWorker) {
          if (audioContext && audioContext.state !== 'running') {
            audioContext.resume().catch(e => console.error("Error resuming audio context", e));
          }
          const opusDataArrayBuffer = arrayBuffer.slice(2);
          if (opusDataArrayBuffer.byteLength > 0) {
            audioDecoderWorker.postMessage({
              type: 'decode',
              data: {
                opusBuffer: opusDataArrayBuffer,
                timestamp: performance.now() * 1000
              }
            }, [opusDataArrayBuffer]);
          }
        } else {
          initializeAudio().then(() => { // Ensure audio pipeline is up
            if (audioDecoderWorker) {
              const opusDataArrayBuffer = arrayBuffer.slice(2);
              if (opusDataArrayBuffer.byteLength > 0) {
                audioDecoderWorker.postMessage({
                  type: 'decode',
                  data: { opusBuffer: opusDataArrayBuffer, timestamp: performance.now() * 1000 }
                }, [opusDataArrayBuffer]);
              }
            }
          });
        }
      } else if (dataTypeByte === 0x03) { // JPEG Stripe
        if (arrayBuffer.byteLength < 6) return;
        if (!isSharedMode) lastReceivedVideoFrameId = dataView.getUint16(2, false);
        const stripe_y_start = dataView.getUint16(4, false);
        const jpegDataBuffer = arrayBuffer.slice(6);
        if (jpegDataBuffer.byteLength === 0) return;
        decodeAndQueueJpegStripe(stripe_y_start, jpegDataBuffer);
      } else if (dataTypeByte === 0x04) { // H.264 VNC Stripe
        if (!isVideoPipelineActive && !isSharedMode) return;
        if (typeof window.vncStripesArrivedThisPeriod !== 'undefined' && !isSharedMode) window.vncStripesArrivedThisPeriod++;
        const EXPECTED_HEADER_LENGTH = 10;
        if (arrayBuffer.byteLength < EXPECTED_HEADER_LENGTH) return;
        const video_frame_type_byte = dataView.getUint8(1);
        const vncFrameID = dataView.getUint16(2, false);
        if (!isSharedMode) {
            lastReceivedVideoFrameId = vncFrameID;
            uniqueStripedFrameIdsThisPeriod.add(lastReceivedVideoFrameId);
        }
        const vncStripeYStart = dataView.getUint16(4, false);
        const stripeWidth = dataView.getUint16(6, false);
        const stripeHeight = dataView.getUint16(8, false);
        const h264Payload = arrayBuffer.slice(EXPECTED_HEADER_LENGTH);
        if (h264Payload.byteLength === 0) return;
        let decoderInfo = vncStripeDecoders[vncStripeYStart];
        const chunkType = (video_frame_type_byte === 0x01) ? 'key' : 'delta';
        if (!decoderInfo) {
          const newStripeDecoder = new VideoDecoder({
            output: handleDecodedVncStripeFrame.bind(null, vncStripeYStart, vncFrameID),
            error: (e) => console.error(`Error in VideoDecoder for VNC stripe Y=${vncStripeYStart} (FrameID: ${vncFrameID}):`, e.message)
          });
          const decoderConfig = {
            codec: 'avc1.42E01E',
            codedWidth: stripeWidth,
            codedHeight: stripeHeight,
            optimizeForLatency: true
          };
          vncStripeDecoders[vncStripeYStart] = {
            decoder: newStripeDecoder,
            pendingChunks: []
          };
          decoderInfo = vncStripeDecoders[vncStripeYStart];
          VideoDecoder.isConfigSupported(decoderConfig)
            .then(support => {
              if (support.supported) return newStripeDecoder.configure(decoderConfig);
              else {
                delete vncStripeDecoders[vncStripeYStart];
                return Promise.reject("Config not supported");
              }
            })
            .then(() => processPendingChunksForStripe(vncStripeYStart))
            .catch(e => {
              console.error(`Error configuring VNC stripe decoder Y=${vncStripeYStart}:`, e);
              if (vncStripeDecoders[vncStripeYStart] && vncStripeDecoders[vncStripeYStart].decoder === newStripeDecoder) {
                try {
                  if (newStripeDecoder.state !== 'closed') newStripeDecoder.close();
                } catch (_) {}
                delete vncStripeDecoders[vncStripeYStart];
              }
            });
        }
        if (decoderInfo) {
          const chunkTimestamp = performance.now() * 1000;
          const chunkData = {
            type: chunkType,
            timestamp: chunkTimestamp,
            data: h264Payload
          };
          if (decoderInfo.decoder.state === "configured") {
            const chunk = new EncodedVideoChunk(chunkData);
            try {
              decoderInfo.decoder.decode(chunk);
            } catch (e) {
              console.error(`Error decoding VNC stripe chunk Y=${vncStripeYStart}:`, e);
            }
          } else {
            decoderInfo.pendingChunks.push(chunkData);
          }
        }
      } else {
        console.warn('Unknown binary data payload type received:', dataTypeByte);
      }
    } else if (typeof event.data === 'string') {
      if (event.data === 'MODE websockets') {
        clientMode = 'websockets';
        console.log('[websockets] Switched to websockets mode.');
        status = 'initializing';
        loadingText = 'Initializing WebSocket mode...';
        updateStatusDisplay();

        if (decoder && decoder.state !== "closed") decoder.close();
        clearAllVncStripeDecoders();
        cleanupVideoBuffer();
        cleanupJpegStripeQueue();
        if (!isSharedMode) stopMicrophoneCapture(); // Mic only for non-shared

        if (currentEncoderMode !== 'x264enc-striped' && currentEncoderMode !== 'jpeg') {
          initializeDecoder();
        }
        initializeAudio().then(() => {
          initializeDecoderAudio();
        });
        
        initializeInput();


        if (playButtonElement) playButtonElement.classList.add('hidden');
        if (statusDisplayElement) statusDisplayElement.classList.remove('hidden');

        console.log('Starting video painting loop (requestAnimationFrame).');
        requestAnimationFrame(paintVideoFrame);

        if (isSharedMode) {
            console.log("Shared mode: Received MODE websockets. Sending STOP_VIDEO then START_VIDEO for keyframe.");
            if (websocket && websocket.readyState === WebSocket.OPEN) {
              websocket.send('STOP_VIDEO');
              setTimeout(() => {
                if (websocket && websocket.readyState === WebSocket.OPEN) {
                  websocket.send('START_VIDEO');
                  console.log("Shared mode: Sent START_VIDEO after delay.");
                }
              }, 100);
              // Local pipeline active flags should reflect an attempt to view
              isVideoPipelineActive = true;
              isAudioPipelineActive = true;
              window.postMessage({ type: 'pipelineStatusUpdate', video: true, audio: true }, window.location.origin);
            }
        } else { // Non-shared mode logic
            if (websocket && websocket.readyState === WebSocket.OPEN) {
              websocket.send('cr'); // Request clipboard
              if (!document.hidden && !isVideoPipelineActive) websocket.send('START_VIDEO');
              if (!isAudioPipelineActive) websocket.send('START_AUDIO');
            }
        }
        loadingText = 'Waiting for stream...';
        updateStatusDisplay();

      } 
      else if (clientMode === 'websockets') { 
        if (event.data.startsWith('{')) {
          let obj;
          try {
            obj = JSON.parse(event.data);
          } catch (e) {
            console.error('Error parsing JSON:', e);
            return;
          }
          if (obj.type === 'system_stats') window.system_stats = obj;
          else if (obj.type === 'gpu_stats') window.gpu_stats = obj;
          else if (obj.type === 'server_settings') window.postMessage({
            type: 'serverSettings',
            encoders: obj.encoders
          }, window.location.origin);
          else if (obj.type === 'server_apps') {
            if (obj.apps && Array.isArray(obj.apps)) {
              window.postMessage({
                type: 'systemApps',
                apps: obj.apps
              }, window.location.origin);
            }
          } else if (obj.type === 'pipeline_status') {
            let statusChanged = false;
            if (obj.video !== undefined && obj.video !== isVideoPipelineActive) {
              isVideoPipelineActive = obj.video;
              statusChanged = true;
              if (!isVideoPipelineActive && currentEncoderMode === 'x264enc-striped') clearAllVncStripeDecoders();
            }
            if (obj.audio !== undefined && obj.audio !== isAudioPipelineActive) {
              isAudioPipelineActive = obj.audio;
              statusChanged = true;
              if (audioDecoderWorker) audioDecoderWorker.postMessage({
                type: 'updatePipelineStatus',
                data: {
                  isActive: isAudioPipelineActive
                }
              });
            }
            if (statusChanged) window.postMessage({
              type: 'pipelineStatusUpdate',
              video: isVideoPipelineActive,
              audio: isAudioPipelineActive
            }, window.location.origin);
         } else if (obj.type === 'stream_resolution') {
           if (isSharedMode) {
             const newWidth = parseInt(obj.width, 10);
             const newHeight = parseInt(obj.height, 10);

             if (newWidth > 0 && newHeight > 0 && (manualWidth !== newWidth || manualHeight !== newHeight)) {
               console.log(`Shared mode: Received stream_resolution from server: ${newWidth}x${newHeight}. Current manual: ${manualWidth}x${manualHeight}`);
               manualWidth = newWidth;
               manualHeight = newHeight;
               applyManualCanvasStyle(manualWidth, manualHeight, true); // true for scaleToFit

               // Handle decoder and canvas updates based on current encoder mode
               if (currentEncoderMode !== 'x264enc-striped' && currentEncoderMode !== 'jpeg') {
                 // This is for the main video pipeline (e.g., full H.264 frames)
                 console.log(`Shared mode: Stream resolution changed to ${newWidth}x${newHeight} for main video pipeline (${currentEncoderMode}). Ensuring decoder is (re)initialized.`);
                 // triggerInitializeDecoder will use the updated manualWidth/manualHeight
                 // to configure or reconfigure the main VideoDecoder.
                 triggerInitializeDecoder();
               } else if (currentEncoderMode === 'x264enc-striped') {
                 // This is for VNC-style H.264 stripes
                 console.log(`Shared mode: Stream resolution changed to ${newWidth}x${newHeight} for x264enc-striped. Clearing stripe decoders and canvas.`);
                 clearAllVncStripeDecoders(); // Clears individual H.264 stripe decoders
                 if (canvasContext) {
                   canvasContext.setTransform(1, 0, 0, 1, 0, 0);
                   // canvas.width/height have been updated by applyManualCanvasStyle
                   canvasContext.clearRect(0, 0, canvas.width, canvas.height);
                 }
               } else if (currentEncoderMode === 'jpeg') {
                 // This is for JPEG stripes/frames
                 console.log(`Shared mode: Stream resolution changed to ${newWidth}x${newHeight} for JPEG. Clearing canvas.`);
                 // No specific decoder objects to clear for JPEG, but canvas clear is good.
                 // clearAllVncStripeDecoders(); // Not needed for JPEG, VNC specific
                 if (canvasContext) {
                   canvasContext.setTransform(1, 0, 0, 1, 0, 0);
                   // canvas.width/height have been updated by applyManualCanvasStyle
                   canvasContext.clearRect(0, 0, canvas.width, canvas.height);
                 }
               }

             } else if (!(newWidth > 0 && newHeight > 0)) {
                 console.warn(`Shared mode: Received invalid stream_resolution dimensions: ${obj.width}x${obj.height}`);
             }
           } else {
             // In non-shared mode, we generally don't use this message to override client-driven resolution.
             // However, you could log it or use it for informational purposes if desired.
             console.log(`Non-shared mode: Received stream_resolution (ignored for control): ${obj.width}x${obj.height}`);
           }
          } else {
            console.warn(`Unexpected JSON message type: ${obj.type}`, obj);
          }
        } else if (event.data.startsWith('cursor,')) {
          try {
            const cursorData = JSON.parse(event.data.substring(7));
            if (parseInt(cursorData.handle, 10) === 0) {
              if(overlayInput) overlayInput.style.cursor = 'auto';
              return;
            }
            let cursorStyle = `url('data:image/png;base64,${cursorData.curdata}')`;
            if (cursorData.hotspot) cursorStyle += ` ${cursorData.hotspot.x} ${cursorData.hotspot.y}, auto`;
            else cursorStyle += ', auto';
            if(overlayInput) overlayInput.style.cursor = cursorStyle;
          } catch (e) {
            console.error('Error parsing cursor data:', e);
          }
        } else if (event.data.startsWith('clipboard,')) {
          try {
            const clipboardData = atob(event.data.substring(10));
            // In shared mode, we can still display clipboard content from server.
            // Writing to system clipboard might be desired.
            navigator.clipboard.writeText(clipboardData).catch(err => console.error('Could not copy server clipboard to local: ' + err));
            window.postMessage({
              type: 'clipboardContentUpdate',
              text: clipboardData
            }, window.location.origin);
          } catch (e) {
            console.error('Error processing clipboard data:', e);
          }
        } else if (event.data.startsWith('system,')) {
          try {
            const systemMsg = JSON.parse(event.data.substring(7));
            if (systemMsg.action === 'reload') window.location.reload();
          } catch (e) {
            console.error('Error parsing system data:', e);
          }
        } else if (event.data === 'VIDEO_STARTED' && !isVideoPipelineActive) {
          isVideoPipelineActive = true;
          window.postMessage({
            type: 'pipelineStatusUpdate',
            video: true
          }, window.location.origin);
        } else if (event.data === 'VIDEO_STOPPED' && isVideoPipelineActive) {
          isVideoPipelineActive = false;
          window.postMessage({
            type: 'pipelineStatusUpdate',
            video: false
          }, window.location.origin);
          cleanupVideoBuffer();
          if (currentEncoderMode === 'x264enc-striped') clearAllVncStripeDecoders();
        } else if (event.data === 'AUDIO_STARTED' && !isAudioPipelineActive) {
          isAudioPipelineActive = true;
          window.postMessage({
            type: 'pipelineStatusUpdate',
            audio: true
          }, window.location.origin);
          if (audioDecoderWorker) audioDecoderWorker.postMessage({
            type: 'updatePipelineStatus',
            data: {
              isActive: true
            }
          });
        } else if (event.data === 'AUDIO_STOPPED' && isAudioPipelineActive) {
          isAudioPipelineActive = false;
          window.postMessage({
            type: 'pipelineStatusUpdate',
            audio: false
          }, window.location.origin);
          if (audioDecoderWorker) audioDecoderWorker.postMessage({
            type: 'updatePipelineStatus',
            data: {
              isActive: false
            }
          });
        } else {
          if (window.webrtcInput && window.webrtcInput.on_message && !isSharedMode) { // Input messages only for non-shared
            window.webrtcInput.on_message(event.data);
          }
        }
      }
    }
  };

  websocket.onerror = (event) => {
    console.error('[websockets] Error:', event);
    status = 'error';
    loadingText = 'WebSocket connection error.';
    updateStatusDisplay();
    if (metricsIntervalId) {
      clearInterval(metricsIntervalId);
      metricsIntervalId = null;
    }
  };

  websocket.onclose = (event) => {
    console.log('[websockets] Connection closed', event);
    status = 'disconnected';
    loadingText = 'WebSocket disconnected. Attempting to reconnect...';
    updateStatusDisplay();
    if (metricsIntervalId) {
      clearInterval(metricsIntervalId);
      metricsIntervalId = null;
    }
    cleanupVideoBuffer();
    cleanupJpegStripeQueue();
    if (decoder && decoder.state !== "closed") decoder.close();
    clearAllVncStripeDecoders();
    decoder = null;
    if (audioDecoderWorker) {
      audioDecoderWorker.postMessage({
        type: 'close'
      });
      audioDecoderWorker = null; // Terminate and nullify in worker's close handler
    }
    if (!isSharedMode) stopMicrophoneCapture();
    isVideoPipelineActive = false;
    isAudioPipelineActive = false;
    isMicrophoneActive = false;
    window.postMessage({
      type: 'pipelineStatusUpdate',
      video: false,
      audio: false
    }, window.location.origin);
  };

  setInterval(() => {
    if (clientMode === 'websockets' && websocket && websocket.readyState === WebSocket.OPEN) {
      // Connection is fine
    } else {
      console.log("WebSocket not open or not in WebSocket mode, reloading page to reconnect.");
      location.reload();
    }
  }, 3000);
});

function cleanupVideoBuffer() {
  let closedCount = 0;
  while (videoFrameBuffer.length > 0) {
    const frame = videoFrameBuffer.shift();
    try {
      frame.close();
      closedCount++;
    } catch (e) {
      /* ignore */
    }
  }
  if (closedCount > 0) console.log(`Cleanup: Closed ${closedCount} video frames from main buffer.`);
}

function cleanupJpegStripeQueue() {
  let closedCount = 0;
  while (jpegStripeRenderQueue.length > 0) {
    const segment = jpegStripeRenderQueue.shift();
    if (segment && segment.image && typeof segment.image.close === 'function') {
      try {
        segment.image.close();
        closedCount++;
      } catch (e) {
        /* ignore */
      }
    }
  }
  if (closedCount > 0) console.log(`Cleanup: Closed ${closedCount} JPEG stripe images.`);
}

const audioDecoderWorkerCode = `
  let decoderAudio;
  let pipelineActive = true;
  let currentDecodeQueueSize = 0;
  const decoderConfig = {
    codec: 'opus',
    numberOfChannels: 2,
    sampleRate: 48000,
  };

  async function initializeDecoderInWorker() {
    if (decoderAudio && decoderAudio.state !== 'closed') {
      try { decoderAudio.close(); } catch (e) { /* ignore */ }
    }
    currentDecodeQueueSize = 0;
    decoderAudio = new AudioDecoder({
      output: handleDecodedAudioFrameInWorker,
      error: (e) => {
        console.error('[AudioWorker] AudioDecoder error:', e.message, e);
        currentDecodeQueueSize = Math.max(0, currentDecodeQueueSize -1);
        if (e.message.includes('fatal') || (decoderAudio && (decoderAudio.state === 'closed' || decoderAudio.state === 'unconfigured'))) {
          // initializeDecoderInWorker(); // Avoid rapid re-init loops on persistent errors
        }
      },
    });
    try {
      const support = await AudioDecoder.isConfigSupported(decoderConfig);
      if (support.supported) {
        await decoderAudio.configure(decoderConfig);
        self.postMessage({ type: 'decoderInitialized' });
      } else {
        decoderAudio = null;
        self.postMessage({ type: 'decoderInitFailed', reason: 'configNotSupported' });
      }
    } catch (e) {
      decoderAudio = null;
      self.postMessage({ type: 'decoderInitFailed', reason: e.message });
    }
  }

  async function handleDecodedAudioFrameInWorker(frame) {
    currentDecodeQueueSize = Math.max(0, currentDecodeQueueSize - 1);
    if (!frame || typeof frame.copyTo !== 'function' || typeof frame.allocationSize !== 'function' || typeof frame.close !== 'function') {
        if(frame && typeof frame.close === 'function') { try { frame.close(); } catch(e) { /* ignore */ } }
        return;
    }
    // In shared mode, pipelineActive is effectively always true from worker's perspective for processing
    // if (!pipelineActive) { 
    //   try { frame.close(); } catch(e) { /* ignore */ }
    //   return;
    // }
    let pcmDataArrayBuffer;
    try {
      const requiredByteLength = frame.allocationSize({ planeIndex: 0, format: 'f32' });
      if (requiredByteLength === 0) {
          try { frame.close(); } catch(e) { /* ignore */ }
          return;
      }
      pcmDataArrayBuffer = new ArrayBuffer(requiredByteLength);
      const pcmDataView = new Float32Array(pcmDataArrayBuffer);
      await frame.copyTo(pcmDataView, { planeIndex: 0, format: 'f32' });
      self.postMessage({ type: 'decodedAudioData', pcmBuffer: pcmDataArrayBuffer }, [pcmDataArrayBuffer]);
      pcmDataArrayBuffer = null;
    } catch (error) { /* console.error */ }
    finally {
      if (frame && typeof frame.close === 'function') {
        try { frame.close(); } catch (e) { /* ignore */ }
      }
    }
  }

  self.onmessage = async (event) => {
    const { type, data } = event.data;
    switch (type) {
      case 'init':
        pipelineActive = data.initialPipelineStatus;
        await initializeDecoderInWorker();
        break;
      case 'decode':
        // if (!pipelineActive) return; // Allow decode even if main thread says inactive, for shared mode to always process
        if (decoderAudio && decoderAudio.state === 'configured') {
          const chunk = new EncodedAudioChunk({ type: 'key', timestamp: data.timestamp || (performance.now() * 1000), data: data.opusBuffer });
          try {
            if (currentDecodeQueueSize < 20) { // Limit queue to prevent OOM with bad data
                 decoderAudio.decode(chunk); currentDecodeQueueSize++; 
            } else {
                // console.warn('[AudioWorker] Decode queue full, dropping audio chunk.');
            }
          } catch (e) { 
              currentDecodeQueueSize = Math.max(0, currentDecodeQueueSize - 1);
              if (decoderAudio.state === 'closed' || decoderAudio.state === 'unconfigured') await initializeDecoderInWorker(); 
          }
        } else if (!decoderAudio || (decoderAudio && decoderAudio.state !== 'configuring')) {
          await initializeDecoderInWorker(); // Try to reinit if not configured
        }
        break;
      case 'reinitialize': await initializeDecoderInWorker(); break;
      case 'updatePipelineStatus': pipelineActive = data.isActive; break;
      case 'close':
        if (decoderAudio && decoderAudio.state !== 'closed') { try { decoderAudio.close(); } catch (e) { /* ignore */ } }
        decoderAudio = null; self.close(); break;
      default: break;
    }
  };
`;

const micWorkletProcessorCode = `
class MicWorkletProcessor extends AudioWorkletProcessor {
  constructor() { super(); }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      const inputChannelData = input[0];
      const int16Array = Int16Array.from(inputChannelData, x => x * 32767);
      if (! int16Array.every(item => item === 0)) {
        this.port.postMessage(int16Array.buffer, [int16Array.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('mic-worklet-processor', MicWorkletProcessor);
`;

async function startMicrophoneCapture() {
  if (isSharedMode) {
    console.log("Shared mode: Microphone capture blocked.");
    isMicrophoneActive = false;
    postSidebarButtonUpdate();
    return;
  }
  if (isMicrophoneActive || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (!isMicrophoneActive) isMicrophoneActive = false;
    postSidebarButtonUpdate();
    return;
  }
  let constraints;
  try {
    constraints = {
      audio: {
        deviceId: preferredInputDeviceId ? {
          exact: preferredInputDeviceId
        } : undefined,
        sampleRate: 24000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    };
    micStream = await navigator.mediaDevices.getUserMedia(constraints);
    const audioTracks = micStream.getAudioTracks();
    if (audioTracks.length > 0) {
      const settings = audioTracks[0].getSettings();
      if (!preferredInputDeviceId && settings.deviceId) preferredInputDeviceId = settings.deviceId;
    }
    if (micAudioContext && micAudioContext.state !== 'closed') await micAudioContext.close();
    micAudioContext = new AudioContext({
      sampleRate: 24000
    });
    if (micAudioContext.state === 'suspended') await micAudioContext.resume();
    if (typeof micWorkletProcessorCode === 'undefined' || !micWorkletProcessorCode) throw new Error("micWorkletProcessorCode undefined");
    const micWorkletBlob = new Blob([micWorkletProcessorCode], {
      type: 'application/javascript'
    });
    const micWorkletURL = URL.createObjectURL(micWorkletBlob);
    try {
      await micAudioContext.audioWorklet.addModule(micWorkletURL);
    } finally {
      URL.revokeObjectURL(micWorkletURL);
    }
    micSourceNode = micAudioContext.createMediaStreamSource(micStream);
    micWorkletNode = new AudioWorkletNode(micAudioContext, 'mic-worklet-processor');
    micWorkletNode.port.onmessage = (event) => {
      const pcm16Buffer = event.data;
      if (websocket && websocket.readyState === WebSocket.OPEN && isMicrophoneActive) {
        if (!pcm16Buffer || !(pcm16Buffer instanceof ArrayBuffer) || pcm16Buffer.byteLength === 0) return;
        const messageBuffer = new ArrayBuffer(1 + pcm16Buffer.byteLength);
        const messageView = new DataView(messageBuffer);
        messageView.setUint8(0, 0x02);
        new Uint8Array(messageBuffer, 1).set(new Uint8Array(pcm16Buffer));
        try {
          websocket.send(messageBuffer);
        } catch (e) {
          console.error("Error sending mic data:", e);
        }
      }
    };
    micWorkletNode.port.onmessageerror = (event) => console.error("Error from mic worklet:", event);
    micSourceNode.connect(micWorkletNode);
    isMicrophoneActive = true;
    postSidebarButtonUpdate();
  } catch (error) {
    console.error('Failed to start microphone capture:', error);
    alert(`Microphone error: ${error.name} - ${error.message}`);
    stopMicrophoneCapture(); // This will set isMicrophoneActive = false and update UI
  }
}

function stopMicrophoneCapture() {
  // This function is safe to call even in shared mode, it will just do nothing if mic wasn't active.
  if (!isMicrophoneActive && !micStream && !micAudioContext) {
    if (isMicrophoneActive) { // Should not happen if first condition is true, but defensive
      isMicrophoneActive = false;
      postSidebarButtonUpdate();
    }
    return;
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  if (micWorkletNode) {
    micWorkletNode.port.onmessage = null;
    micWorkletNode.port.onmessageerror = null;
    try {
      micWorkletNode.disconnect();
    } catch (e) {}
    micWorkletNode = null;
  }
  if (micSourceNode) {
    try {
      micSourceNode.disconnect();
    } catch (e) {}
    micSourceNode = null;
  }
  if (micAudioContext) {
    if (micAudioContext.state !== 'closed') {
      micAudioContext.close().catch(e => console.error('Error closing mic AudioContext:', e)).finally(() => micAudioContext = null);
    } else {
      micAudioContext = null;
    }
  }
  if (isMicrophoneActive) { // Only update if it was active
    isMicrophoneActive = false;
    postSidebarButtonUpdate();
  }
}

function cleanup() {
  if (metricsIntervalId) {
    clearInterval(metricsIntervalId);
    metricsIntervalId = null;
  }
  if (window.isCleaningUp) return;
  window.isCleaningUp = true;
  console.log("Cleanup: Starting cleanup process...");
  if (!isSharedMode) stopMicrophoneCapture(); // Microphone only for non-shared

  if (websocket) {
    websocket.onopen = null;
    websocket.onmessage = null;
    websocket.onerror = null;
    websocket.onclose = null;
    if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) websocket.close();
    websocket = null;
  }
  if (audioContext) {
    if (audioContext.state !== 'closed') audioContext.close().catch(e => console.error('Cleanup error:', e));
    audioContext = null;
    audioWorkletNode = null;
    audioWorkletProcessorPort = null;
    audioBufferQueue.length = 0;
    window.currentAudioBufferSize = 0;
    if (audioDecoderWorker) {
      audioDecoderWorker.postMessage({
        type: 'close'
      }); // Worker will terminate itself
      audioDecoderWorker = null;
    }
  }
  if (decoder && decoder.state !== "closed") {
    decoder.close();
    decoder = null;
  }
  cleanupVideoBuffer();
  cleanupJpegStripeQueue();
  clearAllVncStripeDecoders();
  preferredInputDeviceId = null;
  preferredOutputDeviceId = null;
  status = 'connecting';
  loadingText = '';
  showStart = true;
  streamStarted = false;
  inputInitialized = false; // Reset input initialization flag
  if (statusDisplayElement) statusDisplayElement.textContent = 'Connecting...';
  if (statusDisplayElement) statusDisplayElement.classList.remove('hidden');
  if (playButtonElement) playButtonElement.classList.remove('hidden');
  if (overlayInput) overlayInput.style.cursor = 'auto';
  serverClipboardContent = '';
  isVideoPipelineActive = true;
  isAudioPipelineActive = true;
  isMicrophoneActive = false;
  window.fps = 0;
  frameCount = 0;
  lastFpsUpdateTime = performance.now();
  console.log("Cleanup: Finished cleanup process.");
  window.isCleaningUp = false;
}

function handleDragOver(ev) {
  if (isSharedMode) { // Prevent drop indication in shared mode
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'none';
      return;
  }
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'copy';
}

async function handleDrop(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (isSharedMode) {
    console.log("Shared mode: File upload via drag-drop blocked.");
    return;
  }
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    window.postMessage({
      type: 'fileUpload',
      payload: {
        status: 'error',
        fileName: 'N/A',
        message: "WebSocket not open."
      }
    }, window.location.origin);
    return;
  }
  const entriesToProcess = [];
  if (ev.dataTransfer.items) {
    for (let i = 0; i < ev.dataTransfer.items.length; i++) {
      const entry = ev.dataTransfer.items[i].webkitGetAsEntry() || ev.dataTransfer.items[i].getAsEntry();
      if (entry) entriesToProcess.push(entry);
    }
  } else if (ev.dataTransfer.files.length > 0) {
    for (let i = 0; i < ev.dataTransfer.files.length; i++) {
      await uploadFileObject(ev.dataTransfer.files[i], ev.dataTransfer.files[i].name);
    }
    return;
  }

  try {
    for (const entry of entriesToProcess) await handleDroppedEntry(entry);
  } catch (error) {
    const errorMsg = `Error during sequential upload: ${error.message || error}`;
    window.postMessage({
      type: 'fileUpload',
      payload: {
        status: 'error',
        fileName: 'N/A',
        message: errorMsg
      }
    }, window.location.origin);
    if (websocket && websocket.readyState === WebSocket.OPEN) websocket.send(`FILE_UPLOAD_ERROR:GENERAL:Processing failed`);
  }
}

function getFileFromEntry(fileEntry) {
  return new Promise((resolve, reject) => fileEntry.file(resolve, reject));
}

async function handleDroppedEntry(entry) {
  if (entry.isFile) {
    const pathName = entry.fullPath || entry.name;
    try {
      const file = await getFileFromEntry(entry);
      await uploadFileObject(file, pathName);
    } catch (err) {
      const errorMsg = `Error with file entry ${pathName}: ${err.message || err}`;
      window.postMessage({
        type: 'fileUpload',
        payload: {
          status: 'error',
          fileName: pathName,
          message: errorMsg
        }
      }, window.location.origin);
      if (websocket && websocket.readyState === WebSocket.OPEN) websocket.send(`FILE_UPLOAD_ERROR:${pathName}:Failed to get/upload`);
      throw err;
    }
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    await readDirectoryEntries(dirReader);
  }
}

function readEntriesPromise(dirReader) {
  return new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
}

async function readDirectoryEntries(dirReader) {
  let entries;
  do {
    entries = await readEntriesPromise(dirReader);
    for (const entry of entries) await handleDroppedEntry(entry);
  } while (entries.length > 0);
}

function uploadFileObject(file, pathToSend) {
  return new Promise((resolve, reject) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      const errorMsg = `WS closed for ${pathToSend}.`;
      window.postMessage({
        type: 'fileUpload',
        payload: {
          status: 'error',
          fileName: pathToSend,
          message: errorMsg
        }
      }, window.location.origin);
      reject(new Error(errorMsg));
      return;
    }
    window.postMessage({
      type: 'fileUpload',
      payload: {
        status: 'start',
        fileName: pathToSend,
        fileSize: file.size
      }
    }, window.location.origin);
    websocket.send(`FILE_UPLOAD_START:${pathToSend}:${file.size}`);
    let offset = 0;
    const reader = new FileReader();
    reader.onload = function(e) {
      if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        const uploadErrorMsg = `WS closed during upload of ${pathToSend}`;
        window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: uploadErrorMsg }}, window.location.origin);
        reject(new Error(uploadErrorMsg));
        return;
      }
      if (e.target.error) {
        const readErrorMsg = `File read error for ${pathToSend}: ${e.target.error}`;
        window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: readErrorMsg }}, window.location.origin);
        websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:File read error`);
        reject(e.target.error);
        return;
      }
      try {
        const prefixedView = new Uint8Array(1 + e.target.result.byteLength);
        prefixedView[0] = 0x01; // Data prefix for file chunk
        prefixedView.set(new Uint8Array(e.target.result), 1);
        websocket.send(prefixedView.buffer);
        offset += e.target.result.byteLength;
        const progress = file.size > 0 ? Math.round((offset / file.size) * 100) : 100;
        window.postMessage({
          type: 'fileUpload',
          payload: {
            status: 'progress',
            fileName: pathToSend,
            progress: progress,
            fileSize: file.size
          }
        }, window.location.origin);
        if (offset < file.size) readChunk(offset);
        else {
          websocket.send(`FILE_UPLOAD_END:${pathToSend}`);
          window.postMessage({
            type: 'fileUpload',
            payload: {
              status: 'end',
              fileName: pathToSend,
              fileSize: file.size
            }
          }, window.location.origin);
          resolve();
        }
      } catch (wsError) {
        const sendErrorMsg = `WS send error during upload of ${pathToSend}: ${wsError.message || wsError}`;
        window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: sendErrorMsg }}, window.location.origin);
        websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:WS send error`);
        reject(wsError);
      }
    };
    reader.onerror = function(e) {
      const generalReadError = `General file reader error for ${pathToSend}: ${e.target.error}`;
      window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: generalReadError }}, window.location.origin);
      websocket.send(`FILE_UPLOAD_ERROR:${pathToSend}:General file reader error`);
      reject(e.target.error);
    };

    function readChunk(startOffset) {
      if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        const chunkReadError = `WS closed before reading next chunk of ${pathToSend}`;
         window.postMessage({ type: 'fileUpload', payload: { status: 'error', fileName: pathToSend, message: chunkReadError }}, window.location.origin);
        reject(new Error(chunkReadError));
        return;
      }
      const slice = file.slice(startOffset, Math.min(startOffset + UPLOAD_CHUNK_SIZE, file.size));
      reader.readAsArrayBuffer(slice);
    }
    readChunk(0);
  });
}

window.addEventListener('beforeunload', cleanup);
window.webrtcInput = null;

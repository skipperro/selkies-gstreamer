![Selkies WebRTC](/docs/assets/logo/horizontal-480.png)

[![Build](https://github.com/selkies-project/selkies-gstreamer/actions/workflows/build_and_publish_all_images.yaml/badge.svg)](https://github.com/selkies-project/selkies-gstreamer/actions/workflows/build_and_publish_all_images.yaml)

[![Discord](https://img.shields.io/badge/dynamic/json?logo=discord&label=Discord%20Members&query=approximate_member_count&url=https%3A%2F%2Fdiscordapp.com%2Fapi%2Finvites%2FwDNGDeSW5F%3Fwith_counts%3Dtrue)](https://discord.gg/wDNGDeSW5F)

**Moonlight, Google Stadia, or GeForce NOW in noVNC form factor for Linux X11, in any HTML5 web interface you wish to embed inside, with at least 60 frames per second on Full HD resolution.**

**We are in need of maintainers and community contributors. Please consider stepping up, as we can never have too much help!**

Selkies-GStreamer is an open-source low-latency high-performance Linux-native GPU/CPU-accelerated WebRTC HTML5 remote desktop streaming platform, for self-hosting, containers, Kubernetes, or Cloud/HPC platforms, [started out first by Google engineers](https://web.archive.org/web/20210310083658/https://cloud.google.com/solutions/gpu-accelerated-streaming-using-webrtc), then expanded by academic researchers.

Selkies-GStreamer is designed for researchers studying Agentic AI, Graphical AI, Robotics, Autonomous Driving, Drug Discovery technologies, SLURM supercomputer or HPC system administrators, Jupyter, Kubernetes, Docker®, Coder infrastructure administrators, and Linux cloud gaming enthusiasts.

While designed for clustered or unprivileged containerized environments, Selkies-GStreamer can also be deployed in desktop computers, and any performance issue that would be problematic in cloud gaming platforms is also considered a bug.

**[Read the Documentation](https://selkies-project.github.io/selkies/) to get started.**

# Selkies Core API 

This document outlines the API for an external dashboard to interact with the client-side Selkies Core application. Interaction primarily occurs via the standard `window.postMessage` mechanism and by observing specific global variables or status messages posted back from the client.

## 1. Window Messaging API (Dashboard -> Client)

The client listens for messages sent via `window.postMessage`. To ensure security, the client **only accepts messages from the same origin** (`event.origin === window.location.origin`).

All messages sent to the client should be JavaScript objects with a `type` property indicating the action to perform.

### Supported Messages:

---

**Type:** `setScaleLocally`

*   **Payload:** `{ type: 'setScaleLocally', value: <boolean> }`
*   **Description:** Sets the client-side preference for how video is scaled when using manual resolution.
    *   `true`: Scales the video canvas locally to fit within the container while maintaining the aspect ratio set by the manual resolution (letterboxing/pillarboxing may occur).
    *   `false`: Renders the canvas at the exact manual resolution, potentially overflowing the container or appearing smaller.
    *   This setting is persisted in `localStorage` (`appName_scaleLocallyManual`). It only takes visual effect when `isManualResolutionMode` is active.

---

**Type:** `showVirtualKeyboard`

*   **Payload:** `{ type: 'showVirtualKeyboard' }`
*   **Description:** Attempts to focus a hidden input element (`#keyboard-input-assist`) on the page. This is intended as a workaround on mobile devices or touch environments to bring up the operating system's virtual keyboard for text input, which is then captured and forwarded by the client's input handler.

---

**Type:** `setManualResolution`

*   **Payload:** `{ type: 'setManualResolution', width: <number>, height: <number> }`
*   **Description:** Switches the client to manual resolution mode.
    *   Disables automatic resizing based on the window/container size.
    *   Sends the specified `width` and `height` (rounded down to the nearest even number) to the server via the active connection (WebRTC DataChannel or WebSocket message `r,WIDTHxHEIGHT`).
    *   Applies local canvas styling based on the `scaleLocallyManual` setting (see `setScaleLocally`).
    *   Updates the corresponding input fields in the development sidebar if present.

---

**Type:** `resetResolutionToWindow`

*   **Payload:** `{ type: 'resetResolutionToWindow' }`
*   **Description:** Disables manual resolution mode and reverts to automatic resizing.
    *   Enables the window resize listener.
    *   Calculates the current container size, rounds it down to even numbers, and sends it to the server.
    *   Resets the canvas CSS styles to fill the container (`100%` width/height, `object-fit: contain`).
    *   Clears the manual resolution input fields in the development sidebar if present.

---

**Type:** `settings`

*   **Payload:** `{ type: 'settings', settings: <object> }`
*   **Description:** Applies one or more client-side settings and attempts to propagate them to the server. Settings are persisted in `localStorage`.
*   **Supported `settings` object properties:**
    *   `videoBitRate`: (Number) Target video bitrate in KBs (e.g., `8000`). Sends `vb,VALUE` (WebRTC) or `SET_VIDEO_BITRATE,VALUE` (WebSocket).
    *   `videoFramerate`: (Number) Target video framerate (e.g., `60`). Sends `_arg_fps,VALUE` (WebRTC) or `SET_FRAMERATE,VALUE` (WebSocket).
    *   `audioBitRate`: (Number) Target audio bitrate in kbit/s (e.g., `320000`). Sends `ab,VALUE` (WebRTC) or `SET_AUDIO_BITRATE,VALUE` (WebSocket).
    *   `encoder`: (String) Preferred video encoder name (e.g., `'nvh264enc'`). Sends `enc,VALUE` (WebRTC) or `SET_ENCODER,VALUE` (WebSocket).
    *   `videoBufferSize`: (Number) Target number of video frames to buffer on the client before rendering (0 = immediate). Affects client-side rendering latency.
    *   `resizeRemote`: (Boolean) *WebRTC Only*. If `true`, sends resolution updates to the server when the window resizes. Sends `_arg_resize,VALUE,WIDTHxHEIGHT`.
    *   `scaleLocal`: (Boolean) *WebRTC Only (Legacy?)*. Toggles a 'scale' CSS class on the video element.
    *   `turnSwitch`: (Boolean) *WebRTC Only*. If `true`, forces the use of TURN servers for the connection. Requires page reload to take effect.
    *   `debug`: (Boolean) *WebRTC Only*. Enables verbose debug logging. Requires page reload to take effect.

---

**Type:** `getStats`

*   **Payload:** `{ type: 'getStats' }`
*   **Description:** Requests the client to send back its current statistics via a `window.postMessage` with `type: 'stats'`. (See Section 2).

---

**Type:** `clipboardUpdateFromUI`

*   **Payload:** `{ type: 'clipboardUpdateFromUI', text: <string> }`
*   **Description:** Sends the provided `text` to the server as the new client clipboard content. The text is Base64 encoded before sending (`cw,BASE64_TEXT`). This is typically triggered when the user modifies the clipboard textarea in the sidebar.

---

**Type:** `pipelineControl`

*   **Payload:** `{ type: 'pipelineControl', pipeline: <string>, enabled: <boolean> }`
*   **Description:** Attempts to enable or disable specific media pipelines.
*   **Supported `pipeline` values:**
    *   `'video'`: (WebSocket Mode Only) Sends `START_VIDEO` or `STOP_VIDEO` message to the server. Updates internal state `isVideoPipelineActive`.
    *   `'audio'`: (WebSocket Mode Only) Sends `START_AUDIO` or `STOP_AUDIO` message to the server. Updates internal state `isAudioPipelineActive`.
    *   `'microphone'`: Toggles microphone capture locally using `startMicrophoneCapture()` or `stopMicrophoneCapture()`. Updates internal state `isMicrophoneActive`. Captured audio (if enabled) is sent over the WebSocket connection.

---

**Type:** `audioDeviceSelected`

*   **Payload:** `{ type: 'audioDeviceSelected', context: <string>, deviceId: <string> }`
*   **Description:** Sets the preferred audio device for input or output.
*   **Supported `context` values:**
    *   `'input'`: Sets the `preferredInputDeviceId`. If the microphone is currently active, it will be restarted to use the new device.
    *   `'output'`: Sets the `preferredOutputDeviceId`. Attempts to apply this preference to the playback `AudioContext` and `<audio>` element using `setSinkId()` (if supported by the browser).

---

**Type:** `gamepadControl`

*   **Payload:** `{ type: 'gamepadControl', enabled: <boolean> }`
*   **Description:** Enables or disables the client's gamepad input processing and forwarding. Updates internal state `isGamepadEnabled` and calls `enable()` or `disable()` on the `GamepadManager`.

---

**Type:** `requestFullscreen`

*   **Payload:** `{ type: 'requestFullscreen' }`
*   **Description:** Triggers the client's internal `enterFullscreen()` function, which attempts to make the video container fullscreen using the browser's Fullscreen API.

## 2. Client State & Statistics (Client -> Dashboard)

The client exposes certain state information through global variables and sends status updates via `window.postMessage`. An external dashboard would typically request stats using the `getStats` message and listen for the `stats` response.

### Key Global Variables:

*   `window.fps`: (Number) Calculated client-side rendering frames per second.
*   `window.currentAudioBufferSize`: (Number) Number of audio buffers currently queued in the playback AudioWorklet.
*   `videoFrameBuffer.length`: (Number) Number of video frames currently buffered client-side before rendering. (Access via `stats` message).
*   `connectionStat`: (Object) Contains WebRTC connection statistics (latency, bitrate, packets lost, codec, resolution, etc.). Structure:
    ```javascript
    {
      connectionStatType: 'unknown' | 'webrtc' | 'websocket',
      connectionLatency: 0, // Round trip time (WebRTC specific)
      connectionVideoLatency: 0, // Video specific latency (WebRTC)
      connectionAudioLatency: 0, // Audio specific latency (WebRTC)
      connectionAudioCodecName: 'NA',
      connectionAudioBitrate: 0,
      connectionPacketsReceived: 0,
      connectionPacketsLost: 0,
      connectionBytesReceived: 0,
      connectionBytesSent: 0,
      connectionCodec: 'unknown', // Video Codec
      connectionVideoDecoder: 'unknown',
      connectionResolution: '', // e.g., "1920x1080"
      connectionFrameRate: 0,
      connectionVideoBitrate: 0,
      connectionAvailableBandwidth: 0 // WebRTC specific
    }
    ```
*   `gpuStat`: (Object) Server-reported GPU statistics (if available). Structure: `{ gpuLoad: 0, gpuMemoryTotal: 0, gpuMemoryUsed: 0 }`.
*   `cpuStat`: (Object) Server-reported CPU/Memory statistics (if available via WebSocket `system_stats`). Structure: `{ serverCPUUsage: 0, serverMemoryTotal: 0, serverMemoryUsed: 0 }`. (Note: Code shows `window.system_stats` receives this).
*   `serverClipboardContent`: (String) The last known clipboard content received from the server.
*   `isVideoPipelineActive`: (Boolean) Client's belief about whether the video pipeline (receiving/decoding/rendering) is active.
*   `isAudioPipelineActive`: (Boolean) Client's belief about whether the audio pipeline (receiving/decoding/playback) is active.
*   `isMicrophoneActive`: (Boolean) Whether the client is currently capturing microphone audio.
*   `isGamepadEnabled`: (Boolean) Whether gamepad input processing is enabled.

### Messages Sent from Client to Dashboard:

*   **Type:** `stats`
    *   **Payload:** `{ type: 'stats', data: <object> }`
    *   **Description:** Sent in response to a `getStats` request. The `data` object contains a snapshot of the current stats, including most of the globals listed above.
    *   **Example `data` structure:**
        ```javascript
        {
          connection: connectionStat, // Object described above
          gpu: gpuStat,             // Object described above
          cpu: cpuStat,               // Object described above (derived from window.system_stats)
          clientFps: window.fps,
          audioBuffer: window.currentAudioBufferSize,
          videoBuffer: videoFrameBuffer.length,
          isVideoPipelineActive: isVideoPipelineActive,
          isAudioPipelineActive: isAudioPipelineActive,
          isMicrophoneActive: isMicrophoneActive
          // encoderName: <string> // Potentially included if available
        }
        ```

*   **Type:** `pipelineStatusUpdate`
    *   **Payload:** `{ type: 'pipelineStatusUpdate', video?: <boolean>, audio?: <boolean>, microphone?: <boolean>, gamepad?: <boolean> }`
    *   **Description:** Sent when the client's internal state for pipelines changes (e.g., after receiving confirmation from the server in WebSocket mode, or toggling locally). Used to keep the dashboard UI (like toggle buttons) in sync.

*   **Type:** `sidebarButtonStatusUpdate`
    *   **Payload:** `{ type: 'sidebarButtonStatusUpdate', video: <boolean>, audio: <boolean>, microphone: <boolean>, gamepad: <boolean> }`
    *   **Description:** Sent *by* the client *to itself* after a state change to trigger UI updates in the dev sidebar. An external dashboard could potentially listen for this as well, although `pipelineStatusUpdate` is more direct.

*   **Type:** `clipboardContentUpdate`
    *   **Payload:** `{ type: 'clipboardContentUpdate', text: <string> }`
    *   **Description:** Sent when the client receives new clipboard content from the server (via WebSocket `clipboard,...` or WebRTC datachannel).

*   **Type:** `fileUpload`
    *   **Payload:** `{ type: 'fileUpload', payload: <object> }`
    *   **Description:** Sent during file uploads initiated via drag-and-drop or the file input. The `payload` object indicates the status.
    *   **Payload `status` values:**
        *   `'start'`: `{ status: 'start', fileName: <string>, fileSize: <number> }`
        *   `'progress'`: `{ status: 'progress', fileName: <string>, progress: <number (0-100)>, fileSize: <number> }`
        *   `'end'`: `{ status: 'end', fileName: <string>, fileSize: <number> }`
        *   `'error'`: `{ status: 'error', fileName: <string>, message: <string> }`

*   **Type:** `gamepadButtonUpdate` / `gamepadAxisUpdate`
    *   **Payload:** `{ type: 'gamepadButtonUpdate', gamepadIndex: <number>, buttonIndex: <number>, value: <number> }` or `{ type: 'gamepadAxisUpdate', gamepadIndex: <number>, axisIndex: <number>, value: <number> }`
    *   **Description:** Sent *by* the client *to itself* when gamepad input is detected, primarily to update the SVG visualization in the dev sidebar. An external dashboard could listen to replicate this visualization.

## 3. Replicating UI Interactions

To replicate the functionality provided by the client's development sidebar, an external dashboard needs to implement the following:

1.  **Settings Controls:** Use the `settings` message type to send changes for bitrate, framerate, encoder, etc.
2.  **Pipeline Toggles:** Use the `pipelineControl` message to toggle Video, Audio (WebSocket only), and Microphone pipelines. Listen for `pipelineStatusUpdate` to update the button states.
3.  **Gamepad Toggle & Visualization:** Use `gamepadControl` to toggle gamepad input. Listen for `gamepadButtonUpdate` and `gamepadAxisUpdate` messages to update a custom gamepad visualizer.
4.  **Resolution Control:**
    *   Implement inputs/dropdowns for manual width/height.
    *   Send `setManualResolution` on apply.
    *   Implement a checkbox for "Scale Locally" and send `setScaleLocally`.
    *   Implement a "Reset" button sending `resetResolutionToWindow`.
5.  **Fullscreen:** Implement a button sending the `requestFullscreen` message.
6.  **Stats Display:** Send `getStats` periodically or on demand. Listen for the `stats` response and display the relevant information.
7.  **Server Clipboard:**
    *   Display clipboard content received via the `clipboardContentUpdate` message.
    *   Allow editing and send changes back using the `clipboardUpdateFromUI` message.
8.  **File Upload:**
    *   Implement a file input button. When clicked, dispatch a `CustomEvent('requestFileUpload')` on the client's `window` object (`window.dispatchEvent(new CustomEvent('requestFileUpload'))`). This triggers the client's hidden file input.
    *   *(Alternative/DragDrop)*: Implement drag-and-drop handling. The client overlay already handles this, sending files via WebSocket. Replicating this fully externally might be complex, but triggering the file input is the standard sidebar approach.
    *   Listen for `fileUpload` messages to display upload progress and status.
9.  **Virtual Keyboard:** Implement a button sending the `showVirtualKeyboard` message for environments needing the OSK.
10. **Audio Device Selection:**
    *   Query `navigator.mediaDevices.enumerateDevices()` (requires user permission first, often obtained via a temporary `getUserMedia({audio: true})` call).
    *   Populate dropdowns for audio input and output devices.
    *   On selection change, send the `audioDeviceSelected` message with the appropriate `context` ('input' or 'output') and `deviceId`.

Remember to handle the origin check when sending messages and potentially when receiving them if the dashboard itself needs security.

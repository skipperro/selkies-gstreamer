# Interactive Streaming Server Core

This document outlines the fundamental responsibilities and architecture of this server component, designed for real-time interactive streaming.

## Overview

This server provides the backend infrastructure for establishing and managing interactive streaming sessions. It is engineered with a dual-mode architecture to cater to different client requirements and network environments, offering both WebRTC-based peer-to-peer connections and direct WebSocket-based streaming.

## Core Responsibilities

1.  **Dual-Mode Streaming Architecture:**
    *   **WebRTC Mode:** Facilitates full peer-to-peer (P2P) interactive streaming. This mode manages the complete WebRTC lifecycle, including signaling, media transport negotiation (SRTP), and data channel communication for low-latency interaction.
    *   **WebSockets Streaming Mode:** Offers an alternative, server-relayed streaming approach. Media is streamed directly over WebSockets, supporting specialized, efficient protocols such as `jpeg-striped` and `x264enc-striped` (akin to the `pixelflux` methodology). This mode is advantageous in scenarios where P2P WebRTC is constrained or a simpler, direct stream is preferred.

2.  **WebRTC Connection Management (WebRTC Mode):**
    *   Handles Session Description Protocol (SDP) offer/answer exchanges.
    *   Manages Interactive Connectivity Establishment (ICE) candidate exchange for NAT traversal.
    *   Establishes secure media transport (SRTP) for audio and video.

3.  **Audio/Video Processing and Delivery:**
    *   Captures, encodes, and streams audio and video from the server.
    *   Utilizes GStreamer for flexible and high-performance media pipeline construction, supporting various encoders (e.g., `x264enc`).
    *   Delivers media via SRTP in WebRTC mode or custom WebSocket protocols (`jpeg-striped`, `x264enc-striped`) in WebSockets mode.
    *   Supports dynamic adjustments to streaming parameters such as bitrate and framerate.

4.  **Remote Input Handling:**
    *   Receives and processes user input events (e.g., mouse, keyboard, clipboard) from the client, primarily transmitted over WebRTC data channels.
    *   Injects these inputs into the server's environment to enable remote control and interaction.

5.  **Dynamic RTC Configuration (WebRTC Mode):**
    *   Manages STUN/TURN server configurations crucial for robust NAT traversal in WebRTC.
    *   Supports fetching RTC configurations from multiple sources:
        *   Static JSON configuration files.
        *   External REST APIs.
        *   Dynamically generated credentials (e.g., HMAC-based for TURN).
        *   Cloud-provider TURN services.
    *   Includes mechanisms for periodic monitoring and updating of these configurations.

6.  **Session and Display Adaptation:**
    *   Supports dynamic resizing of the remote display to match the client's viewport dimensions.
    *   Manages DPI scaling and remote cursor state updates to ensure a consistent user experience.

7.  **Integrated Web Server & Signaling:**
    *   Provides an embedded HTTP/HTTPS server to:
        *   Serve client-side web application assets.
        *   Host the WebSocket endpoint necessary for WebRTC signaling.
    *   Supports basic authentication for access control to the web server and signaling endpoints.

8.  **System Monitoring and Metrics:**
    *   Collects and exposes key performance indicators (KPIs) and metrics, including:
        *   System resource utilization (CPU, memory).
        *   GPU performance (if applicable).
        *   WebRTC and streaming connection statistics.

## Technical Foundation

*   **Primary Language/Runtime:** Python, leveraging `asyncio` for efficient asynchronous operations and I/O handling.
*   **Media Framework:** GStreamer is extensively used for all media capture, encoding, and streaming pipeline management.
*   **Communication Protocols:**
    *   WebRTC (SDP, ICE, SRTP, Data Channels) for P2P mode.
    *   WebSockets for signaling (WebRTC mode) and as a direct media transport (WebSockets streaming mode with custom protocols).
    *   HTTP/HTTPS for asset delivery and signaling endpoint.

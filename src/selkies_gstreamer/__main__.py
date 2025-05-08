import logging
LOGLEVEL = logging.INFO
logging.basicConfig(level=LOGLEVEL)
logger_selkies_gamepad = logging.getLogger("selkies_gamepad")
logger_gstwebrtc_app = logging.getLogger("gstebrtc_app")
logger_gstwebrtc_app_resize = logging.getLogger("gstwebrtc_app_resize")
logger_signaling = logging.getLogger("signaling")
logger_webrtc_input = logging.getLogger("webrtc_input")
logger_webrtc_signalling = logging.getLogger("webrtc_signalling")
logger = logging.getLogger("main")
web_logger = logging.getLogger("web")
data_logger = logging.getLogger("data_websocket") # Used for JPEG logs too

import concurrent.futures
import asyncio
import argparse
import base64
import csv
import functools
import hashlib
import hmac
import http
import io
import json
import os
import pathlib
import random
import re
import signal
import socket
import ssl
import struct
import subprocess
import sys
import time
import urllib.parse
import websockets
import websockets.asyncio.client
import websockets.asyncio.server
from collections import OrderedDict
from datetime import datetime
from queue import Queue
from shutil import which
from signal import SIGINT, signal
from watchdog.events import FileClosedEvent, FileSystemEventHandler
from watchdog.observers import Observer
try:
    import pulsectl
    import pasimple
    PULSEAUDIO_AVAILABLE = True
except ImportError:
    PULSEAUDIO_AVAILABLE = False
    data_logger.warning("pulsectl or pasimple not found. Microphone forwarding will be disabled.")
import ctypes
X11_CAPTURE_AVAILABLE = False
try:
    from x11_screen_capture import CaptureSettings, ScreenCapture, StripeCallback
    X11_CAPTURE_AVAILABLE = True
    data_logger.info("x11_screen_capture library found. JPEG encoding mode available.")
except ImportError:
    data_logger.warning("x11_screen_capture library not found. JPEG encoding mode unavailable.")
    pass
from system_metrics import Metrics, GPUMonitor, SystemMonitor, FPS_HIST_BUCKETS
from input_handler import (WebRTCInput, SelkiesGamepad, GamepadMapper)
from gstreamer_pipeline import (GSTWebRTCApp, GSTWebRTCAppError, fit_res,
                                get_new_res, resize_display,
                                generate_xrandr_gtf_modeline, set_dpi,
                                set_cursor_size, check_encoder_supported)
import psutil
import GPUtil
import traceback
FPS_DIFFERENCE_THRESHOLD = 5
BITRATE_DECREASE_STEP_KBPS = 2000
BITRATE_INCREASE_STEP_KBPS = 1000
BACKPRESSURE_CHECK_INTERVAL_SECONDS = 2.0
RAMP_UP_STABILITY_SECONDS = 20.0
MIN_VIDEO_BITRATE_KBPS_BACKPRESSURE = 1000
TARGET_FRAMERATE = 60
TARGET_VIDEO_BITRATE_KBPS = 16000
MIN_VIDEO_BITRATE_KBPS = 500
DEFAULT_RTC_CONFIG = """{
  "lifetimeDuration": "86400s",
  "iceServers": [
    {
      "urls": [
        "stun:stun.l.google.com:19302"
      ]
    }
  ],
  "blockStatus": "NOT_BLOCKED",
  "iceTransportPolicy": "all"
}"""
MIME_TYPES = {
    "html": "text/html",
    "js": "text/javascript",
    "css": "text/css",
    "ico": "image/x-icon",
}
upload_dir_path = os.path.expanduser("~/Desktop")
try:
    os.makedirs(upload_dir_path, exist_ok=True)
    print(f"Upload directory ensured: {upload_dir_path}")
except OSError as e:
    print(f"FATAL: Could not create upload directory {upload_dir_path}: {e}")
    upload_dir_path = None
active_uploads_by_path = {}
client_to_filepath_map = {}

class HMACRTCMonitor:
    """Periodically generates and updates RTC config using HMAC-SHA1 TURN credentials."""
    def __init__(self, turn_host, turn_port, turn_shared_secret, turn_username,
                 turn_protocol='udp', turn_tls=False, stun_host=None,
                 stun_port=None, period=60, enabled=True):
        """Initializes the HMAC RTC configuration monitor."""
        self.turn_host = turn_host
        self.turn_port = turn_port
        self.turn_username = turn_username
        self.turn_shared_secret = turn_shared_secret
        self.turn_protocol = turn_protocol
        self.turn_tls = turn_tls
        self.stun_host = stun_host
        self.stun_port = stun_port
        self.period = period
        self.enabled = enabled

        self.running = False

        self.on_rtc_config = lambda stun_servers, turn_servers, rtc_config: \
            logger.warning("unhandled on_rtc_config")

    async def start(self):
        """Starts the periodic monitoring loop."""
        if self.enabled:
            self.running = True
            while self.running:
                # Check if it's time to generate a new config based on the period
                if self.enabled and int(time.time()) % self.period == 0:
                    try:
                        hmac_data = await asyncio.to_thread(
                            generate_rtc_config, self.turn_host, self.turn_port,
                            self.turn_shared_secret, self.turn_username,
                            self.turn_protocol, self.turn_tls, self.stun_host,
                            self.stun_port
                        )
                        stun_servers, turn_servers, rtc_config = \
                            await asyncio.to_thread(parse_rtc_config, hmac_data)
                        # Call the handler with the new config
                        await asyncio.to_thread(
                            self.on_rtc_config, stun_servers, turn_servers,
                            rtc_config
                        )
                    except Exception as e:
                        logger.warning(
                            "could not fetch TURN HMAC config in periodic monitor: "
                            f"{e}"
                        )
                await asyncio.sleep(0.5)
            logger.info("HMAC RTC monitor stopped")

    async def stop(self):
        """Stops the monitoring loop."""
        self.running = False


class RESTRTCMonitor:
    """Periodically fetches and updates RTC config from a TURN REST API."""
    def __init__(self, turn_rest_uri, turn_rest_username,
                 turn_rest_username_auth_header, turn_protocol='udp',
                 turn_rest_protocol_header='x-turn-protocol', turn_tls=False,
                 turn_rest_tls_header='x-turn-tls', period=60, enabled=True):
        """Initializes the TURN REST API monitor."""
        self.period = period
        self.enabled = enabled
        self.running = False

        self.turn_rest_uri = turn_rest_uri
        self.turn_rest_username = turn_rest_username.replace(":", "-")
        self.turn_rest_username_auth_header = turn_rest_username_auth_header
        self.turn_protocol = turn_protocol
        self.turn_rest_protocol_header = turn_rest_protocol_header
        self.turn_tls = turn_tls
        self.turn_rest_tls_header = turn_rest_tls_header

        self.on_rtc_config = lambda stun_servers, turn_servers, rtc_config: \
            logger.warning("unhandled on_rtc_config")

    async def start(self):
        """Starts the periodic monitoring loop."""
        if self.enabled:
            self.running = True
            while self.running:
                # Check if it's time to fetch a new config based on the period
                if self.enabled and int(time.time()) % self.period == 0:
                    try:
                        stun_servers, turn_servers, rtc_config = \
                            await asyncio.to_thread(
                                fetch_turn_rest, self.turn_rest_uri,
                                self.turn_rest_username,
                                self.turn_rest_username_auth_header,
                                self.turn_protocol,
                                self.turn_rest_protocol_header,
                                self.turn_tls, self.turn_rest_tls_header
                            )
                        # Call the handler with the new config
                        await asyncio.to_thread(
                            self.on_rtc_config, stun_servers, turn_servers,
                            rtc_config
                        )
                    except Exception as e:
                        logger.warning(
                            "could not fetch TURN REST config in periodic monitor: "
                            f"{e}"
                        )
                await asyncio.sleep(0.5)
            logger.info("TURN REST RTC monitor stopped")

    async def stop(self):
        """Stops the monitoring loop."""
        self.running = False


class RTCConfigFileMonitor:
    """Monitors an RTC configuration JSON file for changes."""
    def __init__(self, rtc_file, enabled=True):
        """Initializes the RTC configuration file monitor."""
        self.enabled = enabled
        self.running = False
        self.rtc_file = rtc_file

        self.on_rtc_config = lambda stun_servers, turn_servers, rtc_config: \
            logger.warning("unhandled on_rtc_config")

        # Setup watchdog observer to monitor the file
        self.observer = Observer()
        self.file_event_handler = FileSystemEventHandler()
        self.file_event_handler.on_closed = self.event_handler
        self.observer.schedule(self.file_event_handler, self.rtc_file,
                               recursive=False)

    def event_handler(self, event):
        """Handles file close events (often indicating a write completion)."""
        if type(event) is FileClosedEvent:
            print("Detected RTC JSON file change: {}".format(event.src_path))
            try:
                with open(self.rtc_file, 'rb') as f:
                    data = f.read()
                    stun_servers, turn_servers, rtc_config = parse_rtc_config(
                        data
                    )
                    # Call the handler with the new config
                    self.on_rtc_config(stun_servers, turn_servers, rtc_config)
            except Exception as e:
                logger.warning(
                    f"could not read RTC JSON file: {self.rtc_file}: {e}"
                )

    async def start(self):
        """Starts the file observer."""
        if self.enabled:
            await asyncio.to_thread(self.observer.start)
            self.running = True

    async def stop(self):
        """Stops the file observer."""
        await asyncio.to_thread(self.observer.stop)
        logger.info("RTC config file monitor stopped")
        self.running = False


def generate_rtc_config(
    turn_host,
    turn_port,
    shared_secret,
    user,
    protocol="udp",
    turn_tls=False,
    stun_host=None,
    stun_port=None,
):
    """Generates a WebRTC configuration JSON using HMAC-SHA1 TURN credentials."""
    user = user.replace(":", "-")
    expiry_hour = 24
    exp = int(time.time()) + expiry_hour * 3600
    username = "{}:{}".format(exp, user)
    hashed = hmac.new(
        bytes(shared_secret, "utf-8"), bytes(username, "utf-8"), hashlib.sha1
    ).digest()
    password = base64.b64encode(hashed).decode()
    stun_list = ["stun:{}:{}".format(turn_host, turn_port)]
    if (
        stun_host is not None
        and stun_port is not None
        and (stun_host != turn_host or str(stun_port) != str(turn_port))
    ):
        stun_list.insert(0, "stun:{}:{}".format(stun_host, stun_port))
    if stun_host != "stun.l.google.com" or (str(stun_port) != "19302"):
        stun_list.append("stun:stun.l.google.com:19302")
    rtc_config = {}
    rtc_config["lifetimeDuration"] = "{}s".format(expiry_hour * 3600)
    rtc_config["blockStatus"] = "NOT_BLOCKED"
    rtc_config["iceTransportPolicy"] = "all"
    rtc_config["iceServers"] = []
    rtc_config["iceServers"].append({"urls": stun_list})
    rtc_config["iceServers"].append(
        {
            "urls": [
                "{}:{}:{}?transport={}".format(
                    "turns" if turn_tls else "turn", turn_host, turn_port, protocol
                )
            ],
            "username": username,
            "credential": password,
        }
    )
    return json.dumps(rtc_config, indent=2)


def make_turn_rtc_config_json_legacy(
    turn_host,
    turn_port,
    username,
    password,
    protocol="udp",
    turn_tls=False,
    stun_host=None,
    stun_port=None,
):
    """Generates a WebRTC configuration JSON using static TURN username/password."""
    stun_list = ["stun:{}:{}".format(turn_host, turn_port)]
    if (
        stun_host is not None
        and stun_port is not None
        and (stun_host != turn_host or str(stun_port) != str(turn_port))
    ):
        stun_list.insert(0, "stun:{}:{}".format(stun_host, stun_port))
    if stun_host != "stun.l.google.com" or (str(stun_port) != "19302"):
        stun_list.append("stun:stun.l.google.com:19302")
    rtc_config = {}
    rtc_config["lifetimeDuration"] = "86400s"
    rtc_config["blockStatus"] = "NOT_BLOCKED"
    rtc_config["iceTransportPolicy"] = "all"
    rtc_config["iceServers"] = []
    rtc_config["iceServers"].append({"urls": stun_list})
    rtc_config["iceServers"].append(
        {
            "urls": [
                "{}:{}:{}?transport={}".format(
                    "turns" if turn_tls else "turn", turn_host, turn_port, protocol
                )
            ],
            "username": username,
            "credential": password,
        }
    )
    return json.dumps(rtc_config, indent=2)


def parse_rtc_config(data):
    """Parses a WebRTC configuration JSON to extract STUN and TURN URIs."""
    ice_servers = json.loads(data)["iceServers"]
    stun_uris = []
    turn_uris = []
    for ice_server in ice_servers:
        for url in ice_server.get("urls", []):
            if url.startswith("stun:"):
                stun_host = url.split(":")[1]
                stun_port = url.split(":")[2].split("?")[0]
                stun_uri = "stun://%s:%s" % (stun_host, stun_port)
                stun_uris.append(stun_uri)
            elif url.startswith("turn:"):
                turn_host = url.split(":")[1]
                turn_port = url.split(":")[2].split("?")[0]
                turn_user = ice_server["username"]
                turn_password = ice_server["credential"]
                turn_uri = "turn://%s:%s@%s:%s" % (
                    urllib.parse.quote(turn_user, safe=""),
                    urllib.parse.quote(turn_password, safe=""),
                    turn_host,
                    turn_port,
                )
                turn_uris.append(turn_uri)
            elif url.startswith("turns:"):
                turn_host = url.split(":")[1]
                turn_port = url.split(":")[2].split("?")[0]
                turn_user = ice_server["username"]
                turn_password = ice_server["credential"]
                turn_uri = "turns://%s:%s@%s:%s" % (
                    urllib.parse.quote(turn_user, safe=""),
                    urllib.parse.quote(turn_password, safe=""),
                    turn_host,
                    turn_port,
                )
                turn_uris.append(turn_uri)
    return stun_uris, turn_uris, data


def fetch_turn_rest(
    uri,
    user,
    auth_header_username="x-auth-user",
    protocol="udp",
    header_protocol="x-turn-protocol",
    turn_tls=False,
    header_tls="x-turn-tls",
):
    """Fetches WebRTC configuration from a TURN REST API service."""
    parsed_uri = urllib.parse.urlparse(uri)
    if parsed_uri.scheme == "https":
        conn = http.client.HTTPSConnection(parsed_uri.netloc)
    else:
        conn = http.client.HTTPConnection(parsed_uri.netloc)
    auth_headers = {
        auth_header_username: user,
        header_protocol: protocol,
        header_tls: "true" if turn_tls else "false",
    }
    conn.request("GET", parsed_uri.path, headers=auth_headers)
    resp = conn.getresponse()
    status = resp.status
    data = resp.read()
    conn.close()
    if status >= 400:
        raise Exception(
            "error fetching REST API config. Status code: {}. {}, {}".format(
                resp.status, resp.reason, data
            )
        )
    if not data:
        raise Exception("data from REST API service was empty")
    return parse_rtc_config(data)

def fetch_cloudflare_turn(turn_token_id, api_token, ttl=86400):
    """Fetches temporary TURN credentials from the Cloudflare API."""
    auth_headers = {
        "authorization": f"Bearer {api_token}",
        "content-type": "application/json",
    }
    uri = f"https://rtc.live.cloudflare.com/v1/turn/keys/{turn_token_id}/credentials/generate"
    data = {"ttl": ttl}
    parsed_uri = urllib.parse.urlparse(uri)
    conn = http.client.HTTPSConnection(parsed_uri.netloc)
    conn.request("POST", parsed_uri.path, json.dumps(data), headers=auth_headers)
    resp = conn.getresponse()
    status = resp.status
    data = resp.read()
    conn.close()
    if status >= 400:
        raise Exception(
            f"could not obtain Cloudflare TURN credentials, status was: {resp.status}"
        )
    return json.load(data)


async def wait_for_app_ready(ready_file, app_wait_ready=False):
    """Waits for a specified file to exist before proceeding."""
    logger.info("Waiting for streaming app ready")
    logging.debug("app_wait_ready=%s, ready_file=%s" % (app_wait_ready, ready_file))
    while app_wait_ready and not os.path.exists(ready_file):
        await asyncio.sleep(0.2)


def set_json_app_argument(config_path, key, value):
    """Sets a specific key-value pair in a JSON configuration file."""
    if not os.path.exists(config_path):
        with open(config_path, "w") as f:
            json.dump({}, f)
    with open(config_path, "r") as f:
        json_data = json.load(f)
    json_data[key] = value
    with open(config_path, "w") as f:
        json.dump(json_data, f)
    return True


async def _collect_system_stats_ws(shared_data, interval_seconds=1):
    """Collects system CPU and memory statistics periodically (for WS mode)."""
    data_logger.debug(
        f"System monitor loop (WS mode) started, collection interval: "
        f"{interval_seconds}s"
    )
    try:
        while True:
            cpu_percent = psutil.cpu_percent()
            mem = psutil.virtual_memory()
            mem_total = mem.total
            mem_used = mem.used

            shared_data["system"] = {
                "type": "system_stats",
                "timestamp": datetime.now().isoformat(),
                "cpu_percent": cpu_percent,
                "mem_total": mem_total,
                "mem_used": mem_used
            }

            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        data_logger.info("System monitor loop (WS mode) cancelled.")
    except Exception as e:
        data_logger.error(
            f"System monitor loop (WS mode) error: {e}", exc_info=True
        )


async def _collect_gpu_stats_ws(shared_data, gpu_id=0, interval_seconds=1):
    """Collects GPU utilization and memory statistics periodically (for WS mode)."""
    data_logger.debug(
        f"GPU monitor loop (WS mode) started for GPU {gpu_id}, collection interval: "
        f"{interval_seconds}s"
    )
    try:
        gpus = GPUtil.getGPUs()
        if not gpus:
            data_logger.warning(
                "No GPUs detected for GPU monitor (WS mode). Loop will not run."
            )
            return

        if gpu_id < 0 or gpu_id >= len(gpus):
             data_logger.error(
                 f"Invalid GPU ID {gpu_id} for GPU monitor (WS mode). Only "
                 f"{len(gpus)} GPUs found (0 to {len(gpus)-1})."
             )
             return

        while True:
            try:
                # Re-fetch GPUs inside the loop to handle potential changes/errors
                gpus = GPUtil.getGPUs()
                if not gpus or gpu_id >= len(gpus):
                     data_logger.error(f"GPU {gpu_id} no longer available. Stopping GPU monitor.")
                     break # Exit loop if GPU disappears or ID becomes invalid

                gpu = gpus[gpu_id]
                load = gpu.load
                memory_total = gpu.memoryTotal * 1024 * 1024
                memory_used = gpu.memoryUsed * 1024 * 1024

                shared_data["gpu"] = {
                    "type": "gpu_stats",
                    "timestamp": datetime.now().isoformat(),
                    "gpu_id": gpu_id,
                    "load": load,
                    "memory_total": memory_total,
                    "memory_used": memory_used
                }

            except Exception as e:
                 data_logger.error(
                     f"GPU monitor (WS mode): Error getting GPU stats for ID "
                     f"{gpu_id}: {e}"
                 )
                 # Optional: Add a delay before retrying after an error
                 await asyncio.sleep(interval_seconds * 2)


            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        data_logger.info("GPU monitor loop (WS mode) cancelled.")
    except Exception as e:
        data_logger.error(f"GPU monitor loop (WS mode) error: {e}", exc_info=True)

async def _send_stats_periodically_ws(websocket, shared_data, interval_seconds=5):
    """Sends collected system and GPU stats over the WebSocket periodically (WS mode)."""
    try:
        while True:
            await asyncio.sleep(interval_seconds)

            # Get and remove stats from shared dict to avoid sending duplicates
            system_stats = shared_data.pop("system", None)
            gpu_stats = shared_data.pop("gpu", None)

            try:
                if websocket:
                    if system_stats:
                        json_data = json.dumps(system_stats)
                        await websocket.send(json_data)
                        data_logger.debug("Sent system stats over WS.")

                    if gpu_stats:
                        json_data = json.dumps(gpu_stats)
                        await websocket.send(json_data)
                        data_logger.debug("Sent GPU stats over WS.")
                else:
                    data_logger.info("Stats sender: WebSocket connection closed or invalid, stopping sender loop.")
                    break # Exit loop if connection is not valid

            except websockets.exceptions.ConnectionClosed:
                data_logger.info("Stats sender: WebSocket connection closed.")
                break
            except Exception as e:
                data_logger.error(
                    f"Stats sender: Error sending data over websocket: {e}"
                )

    except asyncio.CancelledError:
        data_logger.info("Stats sender loop (WS mode) cancelled.")
    except Exception as e:
        data_logger.error(f"Stats sender loop (WS mode) error: {e}", exc_info=True)


class DataStreamingServer:
    """Handles the data WebSocket connection for input, stats, and control messages."""

    def __init__(self, port, mode, app, uinput_mouse_socket, js_socket_path,
                 enable_clipboard, enable_cursors, cursor_size, cursor_scale,
                 cursor_debug):
        """Initializes the data WebSocket server."""
        self.port = port
        self.mode = mode
        self.server = None
        self.stop_server = None
        self.data_ws = None
        self.app = app

        # Backpressure state (initialized in ws_handler when connection starts)
        self._initial_target_bitrate_kbps = TARGET_VIDEO_BITRATE_KBPS
        self._current_target_bitrate_kbps = TARGET_VIDEO_BITRATE_KBPS
        self._min_bitrate_kbps = max(MIN_VIDEO_BITRATE_KBPS_BACKPRESSURE, MIN_VIDEO_BITRATE_KBPS) # Use specific or global min
        self._latest_client_render_fps = 0.0
        self._last_backpressure_check_time = 0.0
        self._last_bitrate_adjustment_time = 0.0
        self._last_time_client_ok = 0.0
        self._backpressure_task = None

        # State for Websockets mode stats collection/sending
        self._system_monitor_task_ws = None
        self._gpu_monitor_task_ws = None
        self._stats_sender_task_ws = None
        self._shared_stats_ws = {}

        # Input handling configuration
        self.uinput_mouse_socket = uinput_mouse_socket
        self.js_socket_path = js_socket_path
        self.enable_clipboard = enable_clipboard
        self.enable_cursors = enable_cursors
        self.cursor_size = cursor_size
        self.cursor_scale = cursor_scale
        self.cursor_debug = cursor_debug
        self.webrtc_input = None

        # State for adaptive FPS/bitrate adjustment
        self._last_adjustment_timestamp = 0.0
        self._low_fps_condition_start_timestamp = None

        # --- JPEG Capture Attributes ---
        self.jpeg_capture_module = None
        self.is_jpeg_capturing = False
        self.jpeg_capture_loop = None # To store the asyncio event loop for the callback
        # --- End JPEG Capture Attributes ---

    # --- JPEG Capture Methods ---
    def _jpeg_stripe_callback(self, result_ptr, user_data):
        """Callback executed by x11_screen_capture library thread."""
        # Check if still capturing, loop exists, websocket exists, and pointer is valid
        if not self.is_jpeg_capturing or not self.jpeg_capture_loop or not self.data_ws or not result_ptr:
            return

        result = result_ptr.contents
        if result.data and result.size > 0:
            try:
                # Cast the void* data to a byte pointer of the correct size
                data_bytes_ptr = ctypes.cast(
                    result.data, ctypes.POINTER(ctypes.c_ubyte * result.size)
                )
                # Copy data into a Python bytes object
                jpeg_buffer = bytes(data_bytes_ptr.contents)

                # Schedule sending the data on the main event loop
                if self.data_ws:
                    async def send_data_async():
                        try:
                            # Double check websocket state before sending
                            if self.data_ws:
                                data_type_byte = b'\x03'  # Indicates JPEG data
                                frame_type_byte = b'\x00' # Static placeholder for JPEG
                                prefixed_jpeg_data = data_type_byte + frame_type_byte + jpeg_buffer
                                # Send the prefixed data
                                await self.data_ws.send(prefixed_jpeg_data)
                        except websockets.exceptions.ConnectionClosed:
                            data_logger.debug("JPEG Callback: WebSocket closed while trying to send.")
                            # Consider stopping capture if WS closed? Handled by main handler cleanup.
                        except Exception as e:
                            data_logger.error(f"JPEG Callback: Error sending prefixed JPEG data: {e}")

                    # Safely schedule the async send operation from this thread
                    asyncio.run_coroutine_threadsafe(send_data_async(), self.jpeg_capture_loop)
            except Exception as e:
                data_logger.error(f"Error processing JPEG stripe in callback: {e}", exc_info=True)
        # No need to free result.data, the C library manages it

    async def _start_jpeg_pipeline(self):
        """Starts the X11 JPEG screen capture pipeline."""
        if not X11_CAPTURE_AVAILABLE:
            data_logger.error("Cannot start JPEG pipeline: x11_screen_capture library not available.")
            await self._send_error_to_client("JPEG encoder not available on server")
            return False
        if self.is_jpeg_capturing:
            data_logger.warning("JPEG capture already running.")
            return True
        if not self.app:
            data_logger.error("Cannot start JPEG pipeline: self.app (GSTWebRTCApp) is not set.")
            await self._send_error_to_client("Server misconfiguration for JPEG")
            return False
        if not self.jpeg_capture_loop: # Should be set in ws_handler
            self.jpeg_capture_loop = asyncio.get_running_loop()
            if not self.jpeg_capture_loop:
                 data_logger.error("Cannot start JPEG pipeline: could not get running event loop.")
                 await self._send_error_to_client("Server error getting event loop")
                 return False

        # Get current dimensions from the app object (should be set by ws_handler before calling this)
        display_width = getattr(self.app, 'display_width', 1024) # Use user default
        display_height = getattr(self.app, 'display_height', 768) # Use user default

        # --- Fixed settings for JPEG capture ---
        # These could be made configurable via args if needed later
        fixed_target_fps = 30.0
        fixed_jpeg_quality = 40 # Lower quality = smaller size, higher framerate possible
        # --- End Fixed settings ---

        data_logger.info(f"Starting X11 JPEG capture: {display_width}x{display_height} @ {fixed_target_fps}fps, Quality: {fixed_jpeg_quality}")
        try:
            # Configure capture settings
            capture_settings = CaptureSettings()
            capture_settings.capture_width = display_width
            capture_settings.capture_height = display_height
            capture_settings.capture_x = 0 # Capture full screen
            capture_settings.capture_y = 0
            capture_settings.target_fps = fixed_target_fps
            capture_settings.jpeg_quality = fixed_jpeg_quality
            # Optional: Configure paint-over quality (higher quality for changed areas)
            capture_settings.paint_over_jpeg_quality = 95
            capture_settings.use_paint_over_quality = True
            capture_settings.paint_over_trigger_frames = 2
            capture_settings.damage_block_threshold = 15
            capture_settings.damage_block_duration = 30

            # Create the callback object
            stripe_callback_obj = StripeCallback(self._jpeg_stripe_callback)

            # Create the screen capture module instance
            if self.jpeg_capture_module: # Defensive cleanup if somehow exists
                del self.jpeg_capture_module
            self.jpeg_capture_module = ScreenCapture()

            if not self.jpeg_capture_module:
                data_logger.error("Failed to create ScreenCapture module instance for JPEG.")
                await self._send_error_to_client("Failed to init JPEG capture module")
                return False

            # Start the capture in a separate thread using run_in_executor
            # The C library handles its own threading internally for capture + callback
            await self.jpeg_capture_loop.run_in_executor(
                None, # Use default executor (ThreadPoolExecutor)
                self.jpeg_capture_module.start_capture,
                capture_settings,
                stripe_callback_obj
            )

            self.is_jpeg_capturing = True
            data_logger.info("X11 JPEG capture started successfully.")
            return True
        except Exception as e:
            data_logger.error(f"Failed to start X11 JPEG capture: {e}", exc_info=True)
            await self._send_error_to_client(f"Error starting JPEG capture: {str(e)[:100]}") # Send truncated error
            self.is_jpeg_capturing = False
            # Clean up module instance if creation succeeded but start failed
            if self.jpeg_capture_module:
                del self.jpeg_capture_module
                self.jpeg_capture_module = None
            return False

    async def _stop_jpeg_pipeline(self):
        """Stops the X11 JPEG screen capture pipeline."""
        if not self.is_jpeg_capturing or not self.jpeg_capture_module:
            # data_logger.debug("JPEG capture not running, stop request ignored.")
            return True # Indicate success (it's already stopped)

        data_logger.info("Stopping X11 JPEG capture...")
        self.is_jpeg_capturing = False # Set flag first to prevent callback processing during stop

        try:
            if self.jpeg_capture_loop and self.jpeg_capture_module:
                # Call the blocking stop_capture in an executor
                await self.jpeg_capture_loop.run_in_executor(None, self.jpeg_capture_module.stop_capture)
                data_logger.info("X11 JPEG capture stop command issued and completed.")
            else:
                 data_logger.warning("Cannot issue stop command: loop or module missing.")
        except Exception as e:
            data_logger.error(f"Error stopping X11 JPEG capture via executor: {e}", exc_info=True)
            # Continue cleanup even if stop command failed
        finally:
            # Ensure module instance is released for garbage collection
            if self.jpeg_capture_module:
                module_to_del = self.jpeg_capture_module
                self.jpeg_capture_module = None
                # Let Python's GC handle the __del__ in the C extension if it exists
                del module_to_del
                data_logger.debug("X11 Capture module instance released for GC.")
            # self.is_jpeg_capturing is already False
        return True

    async def _send_error_to_client(self, error_message):
        """Sends an ERROR message to the connected client."""
        if self.data_ws:
            try:
                await self.data_ws.send(f"ERROR {error_message}")
            except Exception as e:
                data_logger.warning(f"Could not send error to client: {e}")
    # --- End JPEG Capture Methods ---


    async def ws_handler(self, websocket):
        """Handles incoming WebSocket connections and messages."""
        global TARGET_FRAMERATE, TARGET_VIDEO_BITRATE_KBPS

        raddr = websocket.remote_address
        data_logger.info(f"Data WebSocket connected from {raddr}")

        # --- Store connection-specific state ---
        if not self.jpeg_capture_loop: # Ensure loop is captured for this handler instance
            self.jpeg_capture_loop = asyncio.get_running_loop()
        self.data_ws = websocket # Store current websocket for this handler instance
        # --- End connection-specific state ---

        mode_message = f"MODE {self.mode}"
        try:
            await websocket.send(mode_message)
        except websockets.exceptions.ConnectionClosed:
             data_logger.warning(
                 f"Connection closed immediately after connecting from {raddr}"
             )
             return

        # ---- Send Server Settings Message ----
        encoders_to_check = [
            'x264enc',
            'nvh264enc',
            'vah264enc',
            'openh264enc'
        ]
        supported_encoders = []
        # Add JPEG if the library is available
        if X11_CAPTURE_AVAILABLE:
            supported_encoders.append('jpeg')

        for encoder_name in encoders_to_check:
            if check_encoder_supported(encoder_name):
                supported_encoders.append(encoder_name)

        server_settings_payload = {
            'type': 'server_settings',
            'encoders': supported_encoders
        }
        server_settings_message_json = json.dumps(server_settings_payload)

        try:
            await websocket.send(server_settings_message_json)
            data_logger.info(f"Sent server_settings to {raddr}: {server_settings_message_json}")
        except websockets.exceptions.ConnectionClosed:
            data_logger.warning(
                f"Connection closed before sending server_settings to {raddr}. Client may not have received settings."
            )
            return
        # --- Initialize Backpressure State for this connection ---
        self._initial_target_bitrate_kbps = TARGET_VIDEO_BITRATE_KBPS # Use current global target as initial
        self._current_target_bitrate_kbps = self._initial_target_bitrate_kbps
        self._min_bitrate_kbps = max(MIN_VIDEO_BITRATE_KBPS_BACKPRESSURE, MIN_VIDEO_BITRATE_KBPS)
        self._latest_client_render_fps = 0.0 # Reset client FPS
        self._last_bitrate_adjustment_time = time.monotonic() # Initialize to now
        self._last_time_client_ok = time.monotonic()          # Initialize to now
        self._backpressure_task = None                       # Reset task handle

        # Maps final server file path -> file handle for ongoing uploads for this connection
        active_uploads_by_path = {}
        # Tracks the final file path currently being uploaded by this connection
        active_upload_target_path = None

        # Define the base upload directory
        upload_dir_path = os.path.expanduser("~/Desktop")

        # Create the base upload directory if it doesn't exist
        upload_dir_valid = False
        try:
            os.makedirs(upload_dir_path, exist_ok=True)
            data_logger.info(f"Upload directory ensured: {upload_dir_path}")
            upload_dir_valid = True
        except OSError as e:
            data_logger.error(f"Could not create upload directory {upload_dir_path}: {e}")

        mic_setup_done = False
        pa_module_index = None
        pa_stream = None
        current_pa_rate = None
        pulse = None
        sink_name = "SelkiesVirtualMic"

        if self.mode == "websockets":
            data_logger.info("Operating in websockets mode.")
            # Initialize Input Handler for this connection
            try:
                logger.info("Initializing WebRTCInput for new websocket connection...")
                self.webrtc_input = WebRTCInput(
                    self.app,
                    self.uinput_mouse_socket,
                    self.js_socket_path,
                    self.enable_clipboard,
                    self.enable_cursors,
                    self.cursor_size,
                    self.cursor_scale,
                    self.cursor_debug,
                )
                if hasattr(self.webrtc_input, 'connect') and asyncio.iscoroutinefunction(self.webrtc_input.connect):
                    await self.webrtc_input.connect()
                logger.info("WebRTCInput initialized and connected for websocket.")
            except Exception as e:
                logger.error(f"Failed to initialize or connect WebRTCInput for websockets mode: {e}", exc_info=True)
                self.webrtc_input = None # Ensure it's None if setup fails

            data_logger.info("Attempting to start audio pipeline by default for websockets mode...")
            if hasattr(self.app, 'start_websocket_audio_pipeline'):
                try:
                    await self.app.start_websocket_audio_pipeline()
                    data_logger.info("Default audio pipeline started successfully for websockets mode.")
                except Exception as e:
                    data_logger.error(f"Error starting default audio pipeline for websockets mode: {e}", exc_info=True)
            else:
                data_logger.warning("app instance has no start_websocket_audio_pipeline method. Cannot start audio by default.")
            # Setup stats collection and sending for this connection
            self._shared_stats_ws = {} # Reset stats for this connection
            gpu_id_for_monitor = getattr(self.app, 'gpu_id', 0)
            # Start system stats collection task
            self._system_monitor_task_ws = asyncio.create_task(
                _collect_system_stats_ws(self._shared_stats_ws, interval_seconds=1)
            )
            # Start GPU stats collection task
            self._gpu_monitor_task_ws = asyncio.create_task(
                _collect_gpu_stats_ws(self._shared_stats_ws,
                                          gpu_id=gpu_id_for_monitor,
                                          interval_seconds=1)
            )
            # Start task to send collected stats periodically
            self._stats_sender_task_ws = asyncio.create_task(
                _send_stats_periodically_ws(websocket, self._shared_stats_ws,
                                                interval_seconds=5)
            )
            data_logger.info(
                "System/GPU monitor and sender tasks started for websockets mode."
            )

            data_logger.info("Starting WebSocket backpressure adjustment task.")
            self._backpressure_task = asyncio.create_task(self._run_backpressure_logic())

        else:
            # Operating in webrtc mode
            data_logger.info(
                "Operating in webrtc mode. Data websocket handler is minimal."
            )
            self.webrtc_input = None


        try:
            # ---- Initialize pulsectl client for this connection ----
            if PULSEAUDIO_AVAILABLE:
                try:
                    pulse = pulsectl.Pulse('selkies-mic-handler')
                    data_logger.debug("PulseAudio client connected.")
                except Exception as e:
                    data_logger.error(f"Failed to connect to PulseAudio: {e}. Microphone forwarding disabled for this connection.")
                    pulse = None
            else:
                pulse = None

            async for message in websocket:
                if isinstance(message, bytes):
                    message_type = message[0]
                    payload = message[1:]
                    if message_type == 0x01: # File data
                        if active_upload_target_path and active_upload_target_path in active_uploads_by_path:
                            file_handle = active_uploads_by_path[active_upload_target_path]
                            try:
                                file_handle.write(payload)
                            except Exception as e:
                                data_logger.error(
                                    f"Error writing chunk to file {active_upload_target_path}: {e}",
                                    exc_info=True
                                )
                                try:
                                    file_handle.close()
                                except Exception: pass
                                active_uploads_by_path.pop(active_upload_target_path, None)
                                try:
                                    if os.path.exists(active_upload_target_path):
                                        os.remove(active_upload_target_path)
                                        data_logger.info(f"Deleted partial file {active_upload_target_path} after write error.")
                                except Exception as remove_e:
                                    data_logger.warning(f"Could not remove partial file {active_upload_target_path} after write error: {remove_e}")
                                active_upload_target_path = None
                        else:
                             if payload:
                                 data_logger.warning(f"Received file chunk (0x01) but no upload active. Ignoring {len(payload)} bytes.")

                    elif message_type == 0x02: # Microphone Data
                        if not pulse: # Check if PulseAudio connection succeeded earlier or is available
                            if len(payload) > 0: # Only log if there was data to send
                                data_logger.warning("PulseAudio not available/connected. Skipping microphone data.")
                            continue # Skip processing mic data
                        if not mic_setup_done:
                            virtual_source_name = "SelkiesVirtualMic"
                            master_monitor = "input.monitor"

                            data_logger.info("Checking PulseAudio state for virtual microphone setup...")

                            try:
                                # Ensure we have a PulseAudio client connection
                                if pulse is None:
                                    data_logger.info("Establishing PulseAudio connection...")
                                    pulse = pulsectl.Pulse('selkies-mic-handler')

                                # --- Step 1: Check if the desired Virtual Source already exists ---
                                data_logger.debug(f"Checking for existing source named '{virtual_source_name}'...")
                                existing_source_info = None # Initialize as None
                                try:
                                    # Get the list of all current sources
                                    source_list = pulse.source_list()
                                    # Iterate through the list to find the source by name
                                    for source in source_list:
                                        if source.name == virtual_source_name:
                                            existing_source_info = source
                                            break # Exit the loop once found
                                except pulsectl.PulseError as pe:
                                    # Handle potential connection errors during check
                                    data_logger.error(f"PulseAudio error while listing sources: {pe}", exc_info=True)
                                    raise # Re-raise to be caught by the outer handler

                                if existing_source_info:
                                    # Source already exists! Use the found 'existing_source_info' object
                                    data_logger.info(f"Virtual source '{virtual_source_name}' (Index: {existing_source_info.index}) already exists.")

                                    # Access proplist directly from the found SourceInfo object
                                    actual_master = existing_source_info.proplist.get('device.master_device')
                                    if actual_master == master_monitor:
                                        data_logger.info(f"Existing source is correctly linked to '{master_monitor}'.")
                                    else:
                                        data_logger.warning(f"Existing source '{virtual_source_name}' is linked to '{actual_master}' "
                                                            f"instead of the expected '{master_monitor}'. "
                                                            f"Manual intervention might be required to fix the link.")

                                    # Since it exists, mark setup as done for this run
                                    mic_setup_done = True
                                    pa_module_index = existing_source_info.owner_module
                                    # Restart audio pipeline
                                    if hasattr(self.app, 'stop_websocket_audio_pipeline'): await self.app.stop_websocket_audio_pipeline()
                                    if hasattr(self.app, 'start_websocket_audio_pipeline'): await self.app.start_websocket_audio_pipeline()


                                else:
                                    # Source does NOT exist, proceed to create it
                                    data_logger.info(f"Virtual source '{virtual_source_name}' not found. Attempting to load module...")
                                    try:
                                        # Load the module, including the description property
                                        load_args = f'source_name={virtual_source_name} master={master_monitor}'
                                        data_logger.info(f"Loading module-virtual-source with args: {load_args}")
                                        pa_module_index = pulse.module_load('module-virtual-source', load_args)
                                        data_logger.info(f"Loaded virtual source module with index {pa_module_index}.")

                                        # Verification after load: Re-fetch the list and check again
                                        data_logger.info(f"Verifying creation of source '{virtual_source_name}'...")
                                        new_source_info = None
                                        source_list_after_load = pulse.source_list()
                                        for source in source_list_after_load:
                                            if source.name == virtual_source_name:
                                                new_source_info = source
                                                break

                                        if new_source_info:
                                            data_logger.info(f"Successfully verified creation of source '{virtual_source_name}' (Index: {new_source_info.index}).")
                                            mic_setup_done = True # Mark setup done ONLY after successful load AND verificationi
                                            # Restart audio pipeline
                                            if hasattr(self.app, 'stop_websocket_audio_pipeline'): await self.app.stop_websocket_audio_pipeline()
                                            if hasattr(self.app, 'start_websocket_audio_pipeline'): await self.app.start_websocket_audio_pipeline()
                                        else:
                                            data_logger.error(f"Loaded module {pa_module_index} but failed to find source '{virtual_source_name}' immediately after checking list.")
                                            # Attempt to clean up the potentially problematic module load
                                            try:
                                                pulse.module_unload(pa_module_index)
                                                data_logger.info(f"Unloaded module {pa_module_index} due to verification failure.")
                                            except Exception as unload_err:
                                                data_logger.error(f"Failed to unload module {pa_module_index} after verification failure: {unload_err}")
                                            # Do NOT set mic_setup_done = True if verification fails

                                    except pulsectl.PulseError as e_load:
                                        data_logger.error(f"Failed to load module-virtual-source: {e_load}", exc_info=True)
                                        # Don't set mic_setup_done = True

                                # --- Step 2: Attempt to Set as Default Source (Only if setup is now marked as done) ---
                                if mic_setup_done:
                                    try:
                                        # Find the source object again (could be pre-existing or newly created)
                                        source_info_for_default = None
                                        source_list_for_default = pulse.source_list()
                                        for source in source_list_for_default:
                                            if source.name == virtual_source_name:
                                                source_info_for_default = source
                                                break

                                        if source_info_for_default:
                                            current_default_source = pulse.server_info().default_source_name
                                            if current_default_source != source_info_for_default.name:
                                                data_logger.info(f"Setting default source to '{source_info_for_default.name}'...")
                                                pulse.default_set(source_info_for_default) # Use the SourceInfo object
                                                data_logger.info(f"Default source set successfully.")
                                            else:
                                                data_logger.info(f"Default source is already '{source_info_for_default.name}'. No change needed.")
                                        else:
                                            data_logger.error(f"Cannot set default: Source '{virtual_source_name}' not found even after setup was marked done.")

                                    except Exception as e_set_default:
                                        data_logger.error(f"Failed during set default source operation for '{virtual_source_name}': {e_set_default}", exc_info=True)

                                data_logger.info("PulseAudio virtual microphone setup check/attempt finished for this run.")

                            except (pulsectl.PulseError, Exception) as e:
                                data_logger.error(f"Error during PulseAudio virtual mic setup process: {e}", exc_info=True)
                                if pulse:
                                    try:
                                        pulse.close()
                                    except Exception as close_e:
                                        data_logger.error(f"Error closing pulse connection after setup failure: {close_e}")
                                pulse = None
                                continue
                        # --- Process Microphone Data ---
                        if not mic_setup_done:
                            data_logger.warning("Mic setup flag not set despite receiving data. Skipping.")
                            continue

                        # The rest is s16le mono PCM data
                        if len(payload) < 1:
                            data_logger.warning(f"Received microphone data packet too short ({len(payload)} bytes) to contain data. Skipping.")
                            continue

                        try:
                            pcm_data = payload
                            # --- Manage pasimple Stream ---
                            if pa_stream is None:
                                data_logger.info(f"Opening new pasimple playback stream to '{sink_name}' at 24000 Hz (s16le, mono).")
                                try:
                                    pa_stream = pasimple.PaSimple(
                                        pasimple.PA_STREAM_PLAYBACK,    # Direction
                                        pasimple.PA_SAMPLE_S16LE,       # Format
                                        1,                              # Channels
                                        24000,                          # Rate
                                        "SelkiesClient",                # App name
                                        "Microphone Stream",            # Stream name
                                        server_name=None,
                                        device_name="input"
                                    )
                                    # current_pa_rate was not set, this line would error if uncommented
                                    # data_logger.debug(f"Successfully opened pasimple stream to '{sink_name}' at {current_pa_rate} Hz.")
                                    data_logger.debug(f"Successfully opened pasimple stream to '{sink_name}' at 24000 Hz.")
                                except Exception as e_open:
                                    data_logger.error(f"Failed to open pasimple stream to '{sink_name}': {e_open}", exc_info=True)
                                    pa_stream = None
                                    continue

                            # --- Write Data to PulseAudio ---
                            if pa_stream:
                                try:
                                    pa_stream.write(pcm_data)
                                except Exception as e_write:
                                    # Log error and close stream to force reopen on next packet
                                    data_logger.error(f"Error writing to pasimple stream '{sink_name}': {e_write}. Closing stream.", exc_info=False) # Keep log cleaner
                                    try:
                                        pa_stream.close()
                                    except Exception: pass
                                    pa_stream = None

                        except struct.error as e_struct:
                            data_logger.warning(f"Failed to unpack sample rate from microphone data: {e_struct}. Skipping packet.")
                        except Exception as e_mic:
                            data_logger.error(f"Unexpected error processing microphone data: {e_mic}", exc_info=True)
                            # Attempt to clean up stream on unexpected errors
                            if pa_stream:
                                try: pa_stream.close()
                                except Exception: pass
                            pa_stream = None
                    else:
                        data_logger.warning(f"Received unknown binary message type: {hex(message_type)}. Ignoring {len(payload)} bytes.")

                elif isinstance(message, str):
                    if message.startswith('FILE_UPLOAD_START:'):
                        if not upload_dir_valid: # Check if upload directory is okay
                            data_logger.error("Upload directory not configured or creation failed. Skipping upload.")
                            continue
                        try:
                            _, relative_path, size_str = message.split(':', 2)
                            file_size = int(size_str)
                            data_logger.info(f"Received FILE_UPLOAD_START from {raddr}: Path='{relative_path}', Size={file_size}")
                            relative_path = relative_path.lstrip('/\\')
                            if "\x00" in relative_path:
                                data_logger.error(f"Invalid path rejected (contains null byte): {relative_path}")
                                continue
                            if "//" in relative_path or "\\\\" in relative_path:
                                 data_logger.error(f"Invalid path format rejected (double slashes): {relative_path}")
                                 continue
                            normalized_relative_path = os.path.normpath(relative_path)
                            if os.path.isabs(normalized_relative_path) or os.path.isabs(relative_path):
                                data_logger.error(f"Absolute path rejected: {normalized_relative_path} (from original: {relative_path})")
                                continue
                            intended_full_path = os.path.join(upload_dir_path, normalized_relative_path)
                            absolute_intended_path = os.path.abspath(intended_full_path)
                            absolute_upload_dir = os.path.abspath(upload_dir_path)
                            if not absolute_intended_path.startswith(absolute_upload_dir + os.sep) and absolute_intended_path != absolute_upload_dir:
                                 data_logger.error(f"Directory traversal attempt rejected: '{relative_path}' resolved outside upload directory to '{absolute_intended_path}'")
                                 continue

                            # --- Path Processing ---
                            server_dir_part = os.path.dirname(absolute_intended_path)
                            base_name = os.path.basename(absolute_intended_path)

                            # Sanitize the final filename component
                            sanitized_basename = re.sub(r'[^\w\-.\s]', '_', base_name).strip()
                            if not sanitized_basename: # Handle empty filenames
                                sanitized_basename = "uploaded_file"

                            # Construct the final full path
                            final_file_path = os.path.join(server_dir_part, sanitized_basename)

                            # --- Create Directories ---
                            try:
                                os.makedirs(server_dir_part, exist_ok=True)
                            except OSError as e:
                                data_logger.error(f"Error creating directory {server_dir_part}: {e}")
                                continue

                            data_logger.info(f"Final server file path for {raddr}: {final_file_path}")

                            # --- Open File ---
                            # Check if this connection is already uploading something else
                            if active_upload_target_path:
                                 data_logger.warning(f"Client {raddr} started new upload for '{final_file_path}' while already uploading '{active_upload_target_path}'. Cleaning up previous.")
                                 # Clean up previous potentially orphaned entry
                                 if active_upload_target_path in active_uploads_by_path:
                                     try: active_uploads_by_path[active_upload_target_path].close()
                                     except: pass
                                     try: os.remove(active_upload_target_path) # Delete partial file
                                     except: pass
                                     del active_uploads_by_path[active_upload_target_path]
                                 active_upload_target_path = None

                            # Open the file for writing (binary mode)
                            file_handle = open(final_file_path, 'wb')
                            active_uploads_by_path[final_file_path] = file_handle
                            active_upload_target_path = final_file_path # Set the active path for this connection
                            data_logger.info(f"Opened file for writing: {final_file_path}")


                        except ValueError as e:
                            data_logger.error(f"Invalid FILE_UPLOAD_START format or size from {raddr}: {message} ({e})")
                        except Exception as e:
                            data_logger.error(f"Error processing FILE_UPLOAD_START '{message}' from {raddr}: {e}", exc_info=True)
                            active_upload_target_path = None # Ensure reset on error
                    elif message.startswith('FILE_UPLOAD_END:'):
                        try:
                            _, relative_path_end = message.split(':', 1)
                            # Use the server-tracked active path for consistency
                            if active_upload_target_path:
                                target_path = active_upload_target_path
                                data_logger.info(f"Received FILE_UPLOAD_END for active path: {target_path} (Client sent: {relative_path_end})")
                                if target_path in active_uploads_by_path:
                                    # Close the file handle
                                    active_uploads_by_path[target_path].close()
                                    data_logger.info(f"Closed file: {target_path}")
                                    del active_uploads_by_path[target_path]
                                else:
                                    data_logger.warning(f"END received, path {target_path} was active, but not in active_uploads_by_path (already closed/cleaned?).")
                                # Reset active path for this connection
                                active_upload_target_path = None
                            else:
                                data_logger.warning(f"Received FILE_UPLOAD_END from {raddr} but no active upload path for this connection. Client sent: {relative_path_end}")

                        except ValueError:
                            data_logger.error(f"Invalid FILE_UPLOAD_END format from {raddr}: {message}")
                        except Exception as e:
                             data_logger.error(f"Error processing FILE_UPLOAD_END '{message}' from {raddr}: {e}", exc_info=True)
                             # Attempt cleanup based on active_upload_target_path if it's still set
                             if active_upload_target_path and active_upload_target_path in active_uploads_by_path:
                                 try: active_uploads_by_path[active_upload_target_path].close();
                                 except: pass
                                 # Optionally delete partial file on error during END processing
                                 try: os.remove(active_upload_target_path)
                                 except: pass
                                 del active_uploads_by_path[active_upload_target_path]
                             active_upload_target_path = None # Ensure reset

                    elif message.startswith('FILE_UPLOAD_ERROR:'):
                         try:
                             _, relative_path_err, error_msg = message.split(':', 2)
                             data_logger.error(f"Received FILE_UPLOAD_ERROR from {raddr} for '{relative_path_err}': {error_msg}")

                             # Use the server-tracked active path for cleanup
                             if active_upload_target_path:
                                 target_path = active_upload_target_path
                                 data_logger.info(f"Cleaning up upload due to client error for path: {target_path} (Client sent: {relative_path_err})")
                                 if target_path in active_uploads_by_path:
                                     try:
                                         active_uploads_by_path[target_path].close()
                                         # Delete the partially uploaded file on client error
                                         os.remove(target_path)
                                         data_logger.info(f"Deleted partial file: {target_path}")
                                     except Exception as e:
                                         data_logger.error(f"Error during cleanup for {target_path}: {e}")
                                     finally:
                                         # Ensure removal from active uploads dict
                                         if target_path in active_uploads_by_path:
                                             del active_uploads_by_path[target_path]
                                 else:
                                     data_logger.warning(f"Client error received, path {target_path} was active, but not in active_uploads_by_path.")
                                 # Reset active path for this connection
                                 active_upload_target_path = None
                             else:
                                  data_logger.warning(f"Received FILE_UPLOAD_ERROR from {raddr} but no active upload path mapped. Client sent: {relative_path_err}")
                         except ValueError:
                             data_logger.error(f"Invalid FILE_UPLOAD_ERROR message format from {raddr}: {message}")
                         except Exception as e:
                            data_logger.error(f"Error processing FILE_UPLOAD_ERROR '{message}' from {raddr}: {e}", exc_info=True)
                            # Attempt cleanup based on active_upload_target_path if it's still set
                            if active_upload_target_path and active_upload_target_path in active_uploads_by_path:
                                try: active_uploads_by_path[active_upload_target_path].close();
                                except: pass
                                # Optionally delete partial file
                                try: os.remove(active_upload_target_path)
                                except: pass
                                del active_uploads_by_path[active_upload_target_path]
                            active_upload_target_path = None # Ensure reset
                    elif self.mode == "websockets":
                        # Handle standard commands for websockets mode
                        if message == "START_VIDEO":
                            data_logger.info("Received START_VIDEO command.")
                            # --- Start correct pipeline based on app.encoder ---
                            if self.app.encoder == 'jpeg':
                                await self._start_jpeg_pipeline()
                            elif hasattr(self.app, 'start_websocket_video_pipeline'):
                                await self.app.start_websocket_video_pipeline()
                            else:
                                data_logger.error("app instance has no start_websocket_video_pipeline method for GStreamer.")
                                await self._send_error_to_client("START_VIDEO Method not found")
                            # --- End START_VIDEO ---
                        elif message == "STOP_VIDEO":
                            data_logger.info("Received STOP_VIDEO command.")
                            # --- Stop correct pipeline ---
                            if self.is_jpeg_capturing: # Check if JPEG is actually running
                                await self._stop_jpeg_pipeline()
                            elif hasattr(self.app, 'stop_websocket_video_pipeline'): # Otherwise assume GStreamer
                                # Check if GStreamer pipeline is running before stopping
                                if getattr(self.app, 'pipeline_running', False):
                                    await self.app.stop_websocket_video_pipeline()
                                else:
                                    data_logger.debug("STOP_VIDEO ignored: GStreamer pipeline not running.")
                            else:
                                data_logger.error("app instance has no stop_websocket_video_pipeline method for GStreamer.")
                            # --- End STOP_VIDEO ---
                        elif message == "START_AUDIO":
                            data_logger.info("Received START_AUDIO command.")
                            if hasattr(self.app, 'start_websocket_audio_pipeline'):
                                 try:
                                    await self.app.start_websocket_audio_pipeline()
                                 except Exception as e:
                                    data_logger.error(f"Error starting WS audio pipeline via helper: {e}", exc_info=True)
                            else:
                                data_logger.error("app instance has no start_websocket_audio_pipeline method.")
                        elif message == "STOP_AUDIO":
                            data_logger.info("Received STOP_AUDIO command.")
                            if hasattr(self.app, 'stop_websocket_audio_pipeline'):
                                 try:
                                    await self.app.stop_websocket_audio_pipeline()
                                 except Exception as e:
                                    data_logger.error(f"Error stopping WS audio pipeline via helper: {e}", exc_info=True)
                            else:
                                data_logger.error("app instance has no stop_websocket_audio_pipeline method.")
                        elif message.startswith("r,"):
                            # --- Handle Resize (5-Step Logic) ---
                            target_res_str = message[2:]
                            data_logger.info(f"Received resize request: {target_res_str}")

                            # 1. Stop active video pipeline
                            pipeline_was_running = False
                            if self.is_jpeg_capturing:
                                data_logger.info("Stopping JPEG capture before resize...")
                                await self._stop_jpeg_pipeline()
                                pipeline_was_running = True
                            elif getattr(self.app, 'pipeline_running', False) and hasattr(self.app, 'stop_websocket_video_pipeline'):
                                data_logger.info("Stopping GStreamer video pipeline before resize...")
                                await self.app.stop_websocket_video_pipeline()
                                pipeline_was_running = True

                            # 2. Call on_resize_handler to attempt screen change
                            on_resize_handler(target_res_str, self.app) # Updates app.last_resize_success

                            # 3. Parse target dimensions and update app state
                            target_w = 0
                            target_h = 0
                            resize_succeeded = getattr(self.app, 'last_resize_success', False)
                            if resize_succeeded:
                                try:
                                    parts = target_res_str.split('x')
                                    if len(parts) == 2:
                                        target_w = int(parts[0])
                                        target_h = int(parts[1])
                                        if target_w > 0 and target_h > 0:
                                            data_logger.info(f"Resize successful, updating app dimensions to {target_w}x{target_h}")
                                            self.app.display_width = target_w
                                            self.app.display_height = target_h
                                        else:
                                             data_logger.error(f"Parsed invalid dimensions from resize request '{target_res_str}'. Cannot update app state.")
                                             resize_succeeded = False # Mark as failed if parsing fails
                                    else:
                                        data_logger.error(f"Invalid format in resize request '{target_res_str}'. Cannot update app state.")
                                        resize_succeeded = False
                                except ValueError:
                                    data_logger.error(f"Non-integer dimensions in resize request '{target_res_str}'. Cannot update app state.")
                                    resize_succeeded = False
                            else:
                                data_logger.warning(f"Resize attempt for {target_res_str} failed (reported by on_resize_handler). App dimensions not updated to target.")
                                # Optionally: Query actual dimensions and update app state here if needed.
                                # For simplicity, we leave app dimensions as they were before the failed attempt.

                            data_logger.info("Restarting video pipeline after resize attempt...")
                            if self.app.encoder == 'jpeg':
                                await self._start_jpeg_pipeline() # Will use updated app.display_width/height
                            elif hasattr(self.app, 'start_websocket_video_pipeline'):
                                await self.app.start_websocket_video_pipeline() # Will use updated app.display_width/height
                            # --- End Resize Handling ---
                        elif message.startswith("s,"):
                            # Handle scaling ratio change request (no specific JPEG action, GStreamer might react)
                            scale = message[2:]
                            try:
                                scale = float(scale)
                                on_scaling_ratio_handler(scale, self.app)
                            except ValueError:
                                data_logger.error(f"Invalid scale value received: {scale}")
                        elif message.startswith("cfps,"):
                          # Handle client FPS report for backpressure logic
                          # Ignore if JPEG is the encoder
                          if self.app.encoder != 'jpeg':
                            try:
                                parts = message.split(",")
                                if len(parts) != 2:
                                    data_logger.error(f"Invalid cfps message format: {message}")
                                    continue
                                current_cfps_str = parts[1]
                                self._latest_client_render_fps = float(current_cfps_str)
                            except ValueError:
                                data_logger.error(f"Error: Invalid cfps value received (not a number): {message}")
                                self._latest_client_render_fps = 0.0 # Reset on error
                            except Exception as e:
                                data_logger.error(f"Error processing cfps message: {e}", exc_info=True)
                                self._latest_client_render_fps = 0.0 # Reset on error
                          # else:
                              # data_logger.debug("cfps message ignored for JPEG encoder.")


                        elif message.startswith("SET_VIDEO_BITRATE,"):
                            # Ignore if JPEG is active
                            if self.app.encoder == 'jpeg':
                                data_logger.info(f"Message '{message}' ignored: JPEG encoder uses fixed quality, not bitrate.")
                            else: # GStreamer
                                try:
                                    parts = message.split(",")
                                    if len(parts) != 2:
                                        data_logger.error(f"Invalid SET_VIDEO_BITRATE message format: {message}")
                                        await self._send_error_to_client("Invalid SET_VIDEO_BITRATE format")
                                        continue
                                    new_bitrate_kbps = int(parts[1])
                                    data_logger.info(f"Received SET_VIDEO_BITRATE for GStreamer: {new_bitrate_kbps}kbps")
                                    TARGET_VIDEO_BITRATE_KBPS = new_bitrate_kbps
                                    self.app.video_bitrate = new_bitrate_kbps
                                    if hasattr(self.app, 'stop_websocket_video_pipeline'): await self.app.stop_websocket_video_pipeline()
                                    if hasattr(self.app, 'start_websocket_video_pipeline'):
                                        await self.app.start_websocket_video_pipeline()
                                        data_logger.info("GStreamer video pipeline restarted with new video bitrate.")
                                except Exception as e:
                                    data_logger.error(f"Error setting GStreamer video bitrate: {e}", exc_info=True)
                                    await self._send_error_to_client("Failed to set GStreamer video bitrate")

                        elif message.startswith("SET_AUDIO_BITRATE,"):
                            # Audio is always GStreamer for now
                            try:
                                parts = message.split(",")
                                if len(parts) != 2:
                                    data_logger.error(f"Invalid SET_AUDIO_BITRATE message format: {message}")
                                    await self._send_error_to_client("Invalid SET_AUDIO_BITRATE format")
                                    continue
                                new_bitrate_bps = int(parts[1])
                                data_logger.info(f"Received SET_AUDIO_BITRATE: {new_bitrate_bps}bps")
                                if hasattr(self.app, 'stop_websocket_audio_pipeline'): await self.app.stop_websocket_audio_pipeline()
                                if hasattr(self.app, 'audio_bitrate'): self.app.audio_bitrate = new_bitrate_bps
                                if hasattr(self.app, 'start_websocket_audio_pipeline'):
                                    await self.app.start_websocket_audio_pipeline()
                                    data_logger.info("Audio pipeline restarted with new audio bitrate.")
                            except Exception as e:
                                data_logger.error(f"Error setting audio bitrate: {e}", exc_info=True)
                                await self._send_error_to_client("Failed to set audio bitrate")

                        elif message.startswith("SET_ENCODER,"):
                            # --- Handle Encoder Change ---
                            try:
                                parts = message.split(",")
                                if len(parts) != 2:
                                    data_logger.error(f"Invalid SET_ENCODER message format: {message}")
                                    await self._send_error_to_client("Invalid SET_ENCODER format")
                                    continue
                                new_encoder_str = parts[1].strip().lower() # Normalize
                                data_logger.info(f"Received SET_ENCODER: {new_encoder_str}")

                                if new_encoder_str == self.app.encoder:
                                    data_logger.info(f"Encoder already set to {new_encoder_str}. No change.")
                                    continue

                                # Check availability for JPEG
                                if new_encoder_str == "jpeg" and not X11_CAPTURE_AVAILABLE:
                                    data_logger.error("Client requested 'jpeg' encoder, but x11_screen_capture is not available.")
                                    await self._send_error_to_client("JPEG encoder not available on server")
                                    continue

                                # Stop current video pipeline, whichever it is
                                pipeline_was_running = False
                                if self.is_jpeg_capturing:
                                    await self._stop_jpeg_pipeline()
                                    pipeline_was_running = True
                                elif hasattr(self.app, 'stop_websocket_video_pipeline') and getattr(self.app, 'pipeline_running', False):
                                    await self.app.stop_websocket_video_pipeline()
                                    pipeline_was_running = True

                                # Update app's encoder knowledge
                                self.app.encoder = new_encoder_str

                                # Start new video pipeline if one was running before
                                if pipeline_was_running:
                                    if new_encoder_str == 'jpeg':
                                        await self._start_jpeg_pipeline()
                                    elif hasattr(self.app, 'start_websocket_video_pipeline'):
                                        await self.app.start_websocket_video_pipeline()
                                    data_logger.info(f"Video pipeline stopped and restarted with new encoder: {new_encoder_str}.")
                                else:
                                    data_logger.info(f"Encoder set to {new_encoder_str}. Pipeline was not running, will start on next START_VIDEO or resize.")
                            except Exception as e:
                                data_logger.error(f"Error setting encoder and restarting pipeline: {e}", exc_info=True)
                                await self._send_error_to_client(f"Failed to set encoder: {str(e)[:100]}")
                            # --- End Encoder Change ---

                        elif message.startswith("SET_FRAMERATE,"):
                            # Ignore if JPEG is active
                            if self.app.encoder == 'jpeg':
                                data_logger.info(f"Message '{message}' ignored: JPEG encoder uses fixed framerate.")
                            else: # GStreamer
                                try:
                                    parts = message.split(",")
                                    if len(parts) != 2:
                                        data_logger.error(f"Invalid SET_FRAMERATE message format: {message}")
                                        await self._send_error_to_client("Invalid SET_FRAMERATE format")
                                        continue
                                    new_framerate_int = int(parts[1])
                                    data_logger.info(f"Received SET_FRAMERATE for GStreamer: {new_framerate_int}fps")
                                    TARGET_FRAMERATE = new_framerate_int
                                    self.app.framerate = new_framerate_int
                                    if hasattr(self.app, 'stop_websocket_video_pipeline'): await self.app.stop_websocket_video_pipeline()
                                    if hasattr(self.app, 'start_websocket_video_pipeline'):
                                        await self.app.start_websocket_video_pipeline()
                                        data_logger.info("GStreamer video pipeline restarted with new framerate.")
                                except Exception as e:
                                    data_logger.error(f"Error setting GStreamer framerate: {e}", exc_info=True)
                                    await self._send_error_to_client("Failed to set GStreamer framerate")
                        else:
                             # Default handling for other string messages (e.g., input events)
                             if self.webrtc_input and hasattr(self.webrtc_input, 'on_message'):
                                  await self.webrtc_input.on_message(message)
                             else:
                                  data_logger.warning(
                                      f"Received message '{message}' but webrtc_input is not "
                                      "initialized or has no on_message method."
                                  )

                    elif self.mode == "webrtc":
                        data_logger.warning(
                            "Received unexpected string message in webrtc mode on data "
                            f"websocket: {message}"
                        )
                    else:
                         data_logger.warning(f"Received unhandled string message in unknown mode: {message}")

        except websockets.exceptions.ConnectionClosedOK:
            data_logger.info(f"Data WebSocket disconnected gracefully from {raddr}")
        except websockets.exceptions.ConnectionClosedError as e:
             data_logger.warning(f"Data WebSocket connection closed with error from {raddr}: {e}")
        except Exception as e:
            data_logger.error(
                f"Error in Data WebSocket handler for {raddr}: {e}",
                exc_info=True
            )

        finally:
            data_logger.info(f"Cleaning up Data WebSocket handler for {raddr} (including PulseAudio and Pipelines)...")
            # --- Cancel background tasks ---
            if self._backpressure_task and not self._backpressure_task.done():
                data_logger.info("Cancelling WebSocket backpressure task...")
                self._backpressure_task.cancel()
                try:
                    await asyncio.wait_for(asyncio.shield(self._backpressure_task), timeout=0.5) # Shorter timeout
                except asyncio.CancelledError:
                    data_logger.info("WebSocket backpressure task cancellation confirmed.")
                except asyncio.TimeoutError:
                    data_logger.warning("Timeout waiting for backpressure task cancellation.")
                except Exception as e: # Catch all for safety
                    data_logger.error(f"Error during backpressure task cleanup: {e}")
                self._backpressure_task = None

            tasks_to_cancel_ws = []
            if self._system_monitor_task_ws and not self._system_monitor_task_ws.done(): tasks_to_cancel_ws.append(self._system_monitor_task_ws)
            if self._gpu_monitor_task_ws and not self._gpu_monitor_task_ws.done(): tasks_to_cancel_ws.append(self._gpu_monitor_task_ws)
            if self._stats_sender_task_ws and not self._stats_sender_task_ws.done(): tasks_to_cancel_ws.append(self._stats_sender_task_ws)

            for task in tasks_to_cancel_ws: task.cancel()
            if tasks_to_cancel_ws:
                await asyncio.gather(*tasks_to_cancel_ws, return_exceptions=True)
                data_logger.info("Websockets mode stats tasks cancelled.")
            # --- End Cancel background tasks ---

            # --- Stop Pipelines ---
            if self.is_jpeg_capturing:
                await self._stop_jpeg_pipeline()
            # Stop GStreamer video if running
            if getattr(self.app, 'pipeline_running', False) and hasattr(self.app, 'stop_websocket_video_pipeline'):
                data_logger.info("Stopping GStreamer video pipeline during cleanup.")
                await self.app.stop_websocket_video_pipeline()
            # Stop GStreamer audio if running (use a separate flag if audio has independent lifecycle)
            # Assuming audio runs if video runs for now, or managed by its own start/stop calls
            if hasattr(self.app, 'stop_websocket_audio_pipeline'): # Check if method exists
                 # Add a check here if audio pipeline state is tracked separately
                 # E.g., if getattr(self.app, 'audio_pipeline_running', False):
                 data_logger.info("Stopping GStreamer audio pipeline during cleanup.")
                 await self.app.stop_websocket_audio_pipeline()
            # --- End Stop Pipelines ---

            # --- PulseAudio Cleanup ---
            if pa_stream:
                data_logger.info(f"Closing pasimple stream connected to '{sink_name}'.")
                try:
                    pa_stream.close()
                except Exception as e:
                    data_logger.error(f"Error closing pasimple stream during cleanup: {e}")
                pa_stream = None
            if pa_module_index is not None and pulse:
                data_logger.info(f"Unloading PulseAudio module index {pa_module_index}.")
                try:
                    pulse.module_unload(pa_module_index)
                except Exception as e:
                    data_logger.error(f"Error unloading PulseAudio module {pa_module_index}: {e}")
            if pulse:
                data_logger.debug("Closing pulsectl client connection.")
                try:
                    pulse.close()
                except Exception as e:
                     data_logger.error(f"Error closing pulsectl connection: {e}")
            # --- End PulseAudio Cleanup ---

            # --- File Upload Cleanup ---
            if active_upload_target_path and active_upload_target_path in active_uploads_by_path:
                target_path = active_upload_target_path
                data_logger.warning(f"Connection closed with active upload: '{target_path}'. Cleaning up.")
                try:
                    active_uploads_by_path[target_path].close()
                    os.remove(target_path)
                    data_logger.info(f"Closed and deleted incomplete upload: '{target_path}'")
                except Exception as e:
                    data_logger.error(f"Error cleaning up active upload '{target_path}': {e}")
                if target_path in active_uploads_by_path: del active_uploads_by_path[target_path]
            # --- End File Upload Cleanup ---

            # --- Input Handler Cleanup ---
            if self.mode == "websockets" and self.webrtc_input:
                data_logger.info("Disconnecting WebRTCInput.")
                if hasattr(self.webrtc_input, 'disconnect'):
                     try: await self.webrtc_input.disconnect()
                     except Exception as e: data_logger.error(f"Error disconnecting webrtc_input: {e}", exc_info=True)
                self.webrtc_input = None
            # --- End Input Handler Cleanup ---

            self.data_ws = None # Clear the reference to this specific connection's websocket
            self.jpeg_capture_loop = None # Clear loop reference for this handler
            data_logger.info(f"Data WebSocket handler finished for {raddr}")

    async def _run_backpressure_logic(self):
        """Periodically checks FPS and adjusts video bitrate for WebSocket mode by restarting the pipeline."""
        data_logger.info("Backpressure logic task started (pipeline restart mode).")
        try:
            while True:
                await asyncio.sleep(BACKPRESSURE_CHECK_INTERVAL_SECONDS)

                # --- Skip backpressure if JPEG encoder is active ---
                if self.app and self.app.encoder == 'jpeg':
                    # data_logger.debug("Backpressure check skipped: JPEG encoder is active.")
                    continue
                # --- End Skip ---

                now = time.monotonic()
                self._last_backpressure_check_time = now

                if not self.app or self.mode != 'websockets':
                    data_logger.warning("Backpressure check skipped: App not available or not in websockets mode.")
                    continue

                # Check if GStreamer video pipeline is running
                if not getattr(self.app, 'pipeline_running', False):
                    # data_logger.debug("Backpressure check skipped: WS GStreamer Video pipeline is not running.")
                    continue

                server_fps = 0.0
                try:
                    server_fps = self.app.get_current_server_fps()
                except Exception as e:
                    data_logger.error(f"Backpressure: Error getting server FPS: {e}")
                    continue

                client_fps = self._latest_client_render_fps
                if server_fps <= 0 or client_fps <= 0:
                    # data_logger.debug(f"Backpressure check skipped: Server FPS ({server_fps:.1f}) or Client FPS ({client_fps:.1f}) not valid yet.")
                    continue

                is_client_lagging = client_fps < (server_fps - FPS_DIFFERENCE_THRESHOLD)

                if is_client_lagging:
                    self._last_time_client_ok = 0
                    new_bitrate = self._current_target_bitrate_kbps - BITRATE_DECREASE_STEP_KBPS
                    new_bitrate = max(self._min_bitrate_kbps, new_bitrate)

                    if new_bitrate < self._current_target_bitrate_kbps:
                        data_logger.warning(
                            f"Backpressure Triggered (GStreamer): Client FPS ({client_fps:.1f}) < Server FPS ({server_fps:.1f}). "
                            f"Reducing GStreamer bitrate {self._current_target_bitrate_kbps}kbps -> {new_bitrate}kbps."
                        )
                        try:
                            if hasattr(self.app, 'stop_websocket_video_pipeline'): await self.app.stop_websocket_video_pipeline()
                            if hasattr(self.app, 'video_bitrate'): self.app.video_bitrate = new_bitrate
                            if hasattr(self.app, 'start_websocket_video_pipeline'): await self.app.start_websocket_video_pipeline()
                            self._current_target_bitrate_kbps = new_bitrate
                            self._last_bitrate_adjustment_time = now
                        except Exception as e:
                            data_logger.error(f"Backpressure: Error restarting GStreamer pipeline for bitrate reduction: {e}", exc_info=True)
                else: # Client not lagging
                    if self._last_time_client_ok == 0: self._last_time_client_ok = now
                    is_stable = (now - self._last_time_client_ok) >= RAMP_UP_STABILITY_SECONDS
                    is_below_initial = self._current_target_bitrate_kbps < self._initial_target_bitrate_kbps
                    is_cooled_down = (now - self._last_bitrate_adjustment_time) >= RAMP_UP_STABILITY_SECONDS

                    if is_stable and is_below_initial and is_cooled_down:
                        new_bitrate = self._current_target_bitrate_kbps + BITRATE_INCREASE_STEP_KBPS
                        new_bitrate = min(self._initial_target_bitrate_kbps, new_bitrate)
                        if new_bitrate > self._current_target_bitrate_kbps:
                             data_logger.info(
                                 f"Backpressure Ramp-Up (GStreamer): Client stable. Increasing GStreamer bitrate {self._current_target_bitrate_kbps}kbps -> {new_bitrate}kbps."
                             )
                             try:
                                if hasattr(self.app, 'stop_websocket_video_pipeline'): await self.app.stop_websocket_video_pipeline()
                                if hasattr(self.app, 'video_bitrate'): self.app.video_bitrate = new_bitrate
                                if hasattr(self.app, 'start_websocket_video_pipeline'): await self.app.start_websocket_video_pipeline()
                                self._current_target_bitrate_kbps = new_bitrate
                                self._last_bitrate_adjustment_time = now
                                self._last_time_client_ok = now
                             except Exception as e:
                                 data_logger.error(f"Backpressure: Error restarting GStreamer pipeline for bitrate ramp-up: {e}", exc_info=True)
        except asyncio.CancelledError:
            data_logger.info("Backpressure logic task cancelled.")
        except Exception as e:
             data_logger.error(f"Backpressure logic task error: {e}", exc_info=True)
        finally:
             data_logger.info("Backpressure logic task finished.")

    async def run_server(self):
        """Starts the data WebSocket server."""
        self.stop_server = asyncio.Future()
        try:
            async with websockets.asyncio.server.serve(
                self.ws_handler,
                '0.0.0.0',
                self.port,
                compression=None
            ) as self.server:
                data_logger.info(
                    f"Data WebSocket Server listening on port {self.port}"
                )
                await self.stop_server
        except OSError as e:
             data_logger.error(f"Failed to start Data WebSocket Server on port {self.port}: {e}")
             raise
        except Exception as e:
             data_logger.error(
                 f"Exception starting Data WebSocket Server: {e}",
                 exc_info=True
             )
             raise

    async def stop(self):
        """Stops the data WebSocket server."""
        logger_signaling.info("Stopping Data WebSocket Server...") # logger_signaling is used in original
        if self.stop_server is not None and not self.stop_server.done():
            self.stop_server.set_result(True)
        if self.server:
            try:
                self.server.close()
                await asyncio.wait_for(self.server.wait_closed(), timeout=2.0)
            except asyncio.TimeoutError:
                 data_logger.warning("Timeout waiting for Data WebSocket server to close.")
            except Exception as e:
                 data_logger.warning(
                     f"Error waiting for Data WebSocket server to close: {e}"
                 )
            self.server = None
        # --- Ensure JPEG capture is stopped if the DataStreamingServer itself is stopped. ---
        if self.is_jpeg_capturing:
            data_logger.info("DataStreamingServer stopping: ensuring JPEG capture is also stopped.")
            await self._stop_jpeg_pipeline()
        # --- End JPEG Stop ---
        data_logger.info("Data WebSocket Server Stopped.")

class WebRTCSimpleServer:
    """A simple WebRTC signaling server with HTTP file serving capabilities."""
    def __init__(self, options):
        """Initializes the combined signaling and web server."""
        self.peers = dict() # Stores connected peers {uid: [ws, raddr, status, meta]}
        self.sessions = dict() # Stores active peer-to-peer sessions {uid: peer_id}
        self.rooms = dict() # Stores active rooms {room_id: {uid1, uid2, ...}}
        self.server = None # Websocket server instance
        self.stop_server = None # Future to signal server stop
        self.addr = options.addr
        self.port = options.port
        self.keepalive_timeout = options.keepalive_timeout
        self.cert_restart = options.cert_restart # Unused currently
        self.enable_https = options.enable_https
        self.https_cert = options.https_cert
        self.https_key = options.https_key
        self.health_path = options.health
        self.web_root = options.web_root
        self.cert_mtime = -1 # Unused currently
        self.cache_ttl = 300 # Cache duration for static files
        self.http_cache = {} # Cache for static file content
        self.turn_shared_secret = options.turn_shared_secret
        self.turn_host = options.turn_host
        self.turn_port = options.turn_port
        self.turn_protocol = options.turn_protocol.lower()
        if self.turn_protocol != "tcp":
            self.turn_protocol = "udp"
        self.turn_tls = options.turn_tls
        self.turn_auth_header_name = options.turn_auth_header_name
        self.stun_host = options.stun_host
        self.stun_port = options.stun_port
        self.enable_basic_auth = options.enable_basic_auth
        self.basic_auth_user = options.basic_auth_user
        self.basic_auth_password = options.basic_auth_password
        self.rtc_config = options.rtc_config # Initial RTC config
        if os.path.exists(options.rtc_config_file):
            logger_signaling.info(
                "parsing rtc_config_file: {}".format(options.rtc_config_file)
            )
            self.rtc_config = self.read_file(options.rtc_config_file)
        if self.turn_shared_secret:
            if not (self.turn_host and self.turn_port):
                raise Exception(
                    "missing turn_host or turn_port options with turn_shared_secret"
                )
        if self.enable_basic_auth:
            if not self.basic_auth_password:
                raise Exception(
                    "missing basic_auth_password when using enable_basic_auth option."
                )

    def set_rtc_config(self, rtc_config):
        """Updates the RTC configuration served by the /turn endpoint."""
        self.rtc_config = rtc_config

    def read_file(self, path):
        """Reads a file from disk."""
        with open(path, "rb") as f:
            return f.read()

    async def cache_file(self, full_path):
        """Reads a file from disk or returns a cached version."""
        data, cached_at = self.http_cache.get(full_path, (None, None))
        now = time.time()
        # Check if cache entry exists and is still valid
        if data is None or now - cached_at >= self.cache_ttl:
            data = await asyncio.to_thread(self.read_file, full_path)
            self.http_cache[full_path] = (data, now)
        return data

    def http_response(self, status, response_headers, body):
        """Constructs an HTTP response object."""
        if isinstance(body, str):
            body = body.encode()
        status = http.HTTPStatus(status)
        headers = websockets.datastructures.Headers(
            [
                ("Connection", "close"),
                ("Content-Length", str(len(body))),
                ("Content-Type", "text/plain; charset=utf-8"),
            ]
        )
        # Merge provided headers, overwriting defaults if necessary
        for key, value in response_headers.raw_items():
            if headers.get(key) is not None:
                del headers[key]
            headers[key] = value
        return websockets.http11.Response(status.value, status.phrase, headers, body)

    async def process_request(self, server_root, connection, request):
        """Handles incoming HTTP requests (before potential WebSocket upgrade)."""
        path = request.path
        request_headers = request.headers
        response_headers = websockets.datastructures.Headers()
        username = ""

        # --- Basic Authentication Check ---
        if self.enable_basic_auth:
            auth_header = request_headers.get("authorization", "").lower()
            if "basic" in auth_header:
                try:
                    decoded_username, decoded_password = \
                        websockets.headers.parse_authorization_basic(request_headers.get("authorization"))
                    if not (decoded_username == self.basic_auth_user and decoded_password == self.basic_auth_password):
                        return self.http_response(http.HTTPStatus.UNAUTHORIZED, response_headers, b"Unauthorized")
                    username = decoded_username # Store username if needed later
                except ValueError: # Handle malformed header
                    return self.http_response(http.HTTPStatus.BAD_REQUEST, response_headers, b"Malformed Authorization Header")
            else:
                # Request authentication
                response_headers["WWW-Authenticate"] = 'Basic realm="restricted", charset="UTF-8"'
                return self.http_response(http.HTTPStatus.UNAUTHORIZED, response_headers, b"Authorization required")

        # --- WebSocket Upgrade Path Check ---
        # Check if the path matches known WebSocket endpoints exactly
        if path == "/websocket" or path == "/ws" or path == "/ws/" or path.endswith("/signalling") or path.endswith("/signalling/"):
             # Let the websockets library handle the upgrade request
             return None

        # --- Handle Specific HTTP Endpoints ---
        # Health check endpoint
        if path == self.health_path + "/" or path == self.health_path:
            return self.http_response(http.HTTPStatus.OK, response_headers, b"OK\n")

        # TURN/RTC configuration endpoint
        if path == "/turn/" or path == "/turn":
            if self.turn_shared_secret:
                # Generate HMAC credentials if shared secret is configured
                if not username: # If basic auth didn't provide username, check header
                    username = request_headers.get(self.turn_auth_header_name, "default_user")
                web_logger.info(
                    "Generating HMAC credential for user: {}".format(username)
                )
                rtc_config_str = generate_rtc_config(
                    self.turn_host, self.turn_port, self.turn_shared_secret, username,
                    self.turn_protocol, self.turn_tls, self.stun_host, self.stun_port
                )
                response_headers["Content-Type"] = "application/json"
                return self.http_response(http.HTTPStatus.OK, response_headers, str.encode(rtc_config_str))
            elif self.rtc_config:
                # Serve the pre-configured RTC config (from file or default)
                data = self.rtc_config
                if isinstance(data, str):
                    data = data.encode()
                response_headers["Content-Type"] = "application/json"
                return self.http_response(http.HTTPStatus.OK, response_headers, data)
            else:
                # No RTC config available
                web_logger.warning("HTTP GET {} 404 NOT FOUND - Missing RTC config".format(path))
                return self.http_response(http.HTTPStatus.NOT_FOUND, response_headers, b"404 NOT FOUND - No RTC Config")

        # --- Serve Static Files ---
        path_part = path.split("?")[0]
        if path_part == "/":
            path_part = "/index.html" # Default to index.html for root path

        # Securely join path components and prevent traversal
        try:
            # Ensure server_root is absolute
            abs_server_root = os.path.abspath(server_root)
            # Normalize the requested path part (remove leading '/')
            normalized_req_path = os.path.normpath(path_part.lstrip('/'))
            # Prevent path components like '..'
            if '..' in normalized_req_path.split(os.path.sep):
                 raise ValueError("Invalid path component '..'")
            # Join safely
            full_path = os.path.join(abs_server_root, normalized_req_path)
            # Final check: ensure the resolved path is still within the root directory
            if os.path.commonpath((abs_server_root, full_path)) != abs_server_root:
                 raise ValueError("Attempted path traversal")
        except ValueError as e:
             web_logger.warning(f"Blocked potentially insecure path request: {path_part} ({e})")
             return self.http_response(http.HTTPStatus.BAD_REQUEST, response_headers, b"400 Bad Request")

        # Check if file exists and is a file
        if not os.path.exists(full_path) or not os.path.isfile(full_path):
            response_headers["Content-Type"] = "text/html"
            web_logger.info("HTTP GET {} 404 NOT FOUND".format(path))
            return self.http_response(http.HTTPStatus.NOT_FOUND, response_headers, b"404 NOT FOUND")

        # Determine MIME type based on extension
        extension = full_path.split(".")[-1]
        mime_type = MIME_TYPES.get(extension, "application/octet-stream")
        response_headers["Content-Type"] = mime_type

        # Read file (using cache)
        try:
            body = await self.cache_file(full_path)
        except FileNotFoundError:
             # Should not happen due to exists check, but handle defensively
             web_logger.error(f"File disappeared after check: {full_path}")
             return self.http_response(http.HTTPStatus.INTERNAL_SERVER_ERROR, response_headers, b"500 Internal Server Error")
        except Exception as e:
             web_logger.error(f"Error reading file {full_path}: {e}")
             return self.http_response(http.HTTPStatus.INTERNAL_SERVER_ERROR, response_headers, b"500 Internal Server Error")

        # Send the file content
        response_headers["Content-Length"] = str(len(body))
        web_logger.info("HTTP GET {} 200 OK".format(path))
        return self.http_response(http.HTTPStatus.OK, response_headers, body)

    async def recv_msg_ping(self, ws, raddr):
        """Wrapper for ws.recv() that includes a keepalive ping mechanism."""
        msg = None
        try:
            # Wait for a message with the configured timeout
            msg = await asyncio.wait_for(ws.recv(), self.keepalive_timeout)
        except (asyncio.TimeoutError, concurrent.futures._base.TimeoutError):
            # If timeout occurs, send a ping to check if the client is still responsive
            logger_signaling.debug("Sending keepalive ping to {!r} in recv".format(raddr))
            await ws.ping()
            # Wait again for a short period after pinging for a potential pong or message
            try:
                 msg = await asyncio.wait_for(ws.recv(), self.keepalive_timeout / 2) # Shorter timeout after ping
            except (asyncio.TimeoutError, concurrent.futures._base.TimeoutError):
                 # If still no response, assume disconnected
                 logger_signaling.warning(f"No reply from {raddr} after ping, assuming disconnected.")
                 raise websockets.exceptions.ConnectionClosedOK(1000, "Keepalive timeout") # Simulate clean close
            except websockets.exceptions.ConnectionClosed as e:
                 # If client disconnected while waiting for pong/message
                 logger_signaling.info(f"Connection closed by {raddr} while waiting for pong/message.")
                 raise e # Re-raise original close exception
        return msg


    async def cleanup_session(self, uid):
        """Cleans up state associated with a peer-to-peer session involving uid."""
        if uid in self.sessions:
            other_id = self.sessions.pop(uid) # Use pop for atomicity
            logger_signaling.info("Cleaned up {} session".format(uid))
            # Also clean up the other side of the session if it exists
            if other_id in self.sessions:
                # Check if the other side still points to us before deleting
                if self.sessions.get(other_id) == uid:
                    del self.sessions[other_id]
                    logger_signaling.info("Also cleaned up {} session".format(other_id))
                else:
                    # This indicates a potential state inconsistency
                    logger_signaling.warning(f"Session mismatch during cleanup: {other_id} no longer points to {uid}")

                # Close connection to the other peer if they still exist in the peers dict
                if other_id in self.peers:
                    logger_signaling.info("Closing connection to {}".format(other_id))
                    wso, oaddr, _, _ = self.peers[other_id]
                    del self.peers[other_id]
                    await wso.close()

    async def cleanup_room(self, uid, room_id):
        """Removes a user from a room and notifies remaining peers."""
        if room_id not in self.rooms:
             logger_signaling.warning(f"Attempted to cleanup room {room_id} for {uid}, but room doesn't exist.")
             return

        room_peers = self.rooms[room_id]
        if uid not in room_peers:
            # Peer might have already been removed (e.g., simultaneous disconnects)
            # logger_signaling.debug(f"User {uid} not found in room {room_id} during cleanup.")
            return

        logger_signaling.info(f"Removing {uid} from room {room_id}")
        room_peers.remove(uid)

        # If room is now empty, remove the room itself
        if not room_peers:
            logger_signaling.info(f"Room {room_id} is now empty, removing.")
            del self.rooms[room_id]
            return # No peers left to notify

        # Notify remaining peers that uid has left
        msg = "ROOM_PEER_LEFT {}".format(uid)
        notify_tasks = []
        peers_to_remove_from_room = [] # Track peers found disconnected during notification prep

        for pid in room_peers:
            if pid in self.peers:
                wsp, paddr, _, _ = self.peers[pid]
                logger_signaling.info(
                    "room {}: Notifying {} -> {}: {}".format(room_id, uid, pid, msg)
                )
                # Create task to send notification concurrently
                notify_tasks.append(asyncio.create_task(wsp.send(msg)))
            else:
                # Inconsistency: Peer in room set but not in main peers dict
                logger_signaling.warning(f"Peer {pid} in room {room_id} but not in self.peers during LEFT notification.")
                peers_to_remove_from_room.append(pid) # Mark for removal from room set

        # Remove inconsistent peers found during notification prep
        for pid_remove in peers_to_remove_from_room:
             if pid_remove in room_peers: room_peers.remove(pid_remove)

        # Wait for all notification tasks to complete
        if notify_tasks:
            results = await asyncio.gather(*notify_tasks, return_exceptions=True)
            for i, result in enumerate(results):
                 if isinstance(result, Exception):
                     # Log errors during notification (recipient peer likely disconnected)
                     logger_signaling.warning(f"Error sending ROOM_PEER_LEFT notification: {result}")
                     # The disconnect of the recipient peer will be handled separately


    async def remove_peer(self, uid):
        await self.cleanup_session(uid)
        if uid in self.peers:
            ws, raddr, status, _ = self.peers[uid]
            if status and status != "session":
                await self.cleanup_room(uid, status)
            del self.peers[uid]
            await ws.close()
            logger_signaling.info(
                "Disconnected from peer {!r} at {!r}".format(uid, raddr)
            )

    async def connection_handler(self, ws, uid, meta=None):
        """Handles the message loop for a single connected peer."""
        raddr = ws.remote_address
        peer_status = None # Initial status (None = idle, "session" = in session, room_id = in room)
        # Register peer *after* successful HELLO in run() -> handler()
        self.peers[uid] = [ws, raddr, peer_status, meta]
        logger_signaling.info(
            "Registered peer {!r} at {!r} with meta: {}".format(uid, raddr, meta)
        )

        try:
            # Main message processing loop for this peer
            while True:
                # Wait for message using keepalive mechanism
                msg = await self.recv_msg_ping(ws, raddr)

                # Check if peer still exists before processing (could be removed by another task)
                if uid not in self.peers:
                    logger_signaling.warning(f"Peer {uid} removed during message handling loop. Breaking.")
                    break
                # Update local status from the potentially modified peers dict entry
                current_ws, current_raddr, peer_status, current_meta = self.peers[uid]
                if ws != current_ws: # Sanity check
                     logger_signaling.error(f"Websocket mismatch for peer {uid}. Aborting handler.")
                     break

                # --- Handle messages based on peer status ---
                if peer_status is not None: # Peer is in a session or room
                    if peer_status == "session":
                        # --- In a Session ---
                        other_id = self.sessions.get(uid)
                        # Check if session partner still exists and is valid
                        if not other_id or other_id not in self.peers:
                            logger_signaling.warning(f"Session partner {other_id} for {uid} not found or disconnected. Cleaning up.")
                            break # Exit loop, finally block will call remove_peer

                        wso, oaddr, status, _ = self.peers[other_id]
                        if status != "session": # Partner status mismatch
                            logger_signaling.warning(f"Session partner {other_id} status is not 'session' ({status}). Cleaning up.")
                            break # Exit loop

                        # Forward the message to the session partner
                        logger_signaling.debug("{} -> {}: {}".format(uid, other_id, msg))
                        try:
                            await wso.send(msg)
                        except websockets.exceptions.ConnectionClosed:
                             logger_signaling.info(f"Connection to session partner {other_id} closed while sending. Cleaning up.")
                             break # Exit loop
                        except Exception as e:
                             logger_signaling.error(f"Error sending message to session partner {other_id}: {e}")
                             break # Exit loop on send error

                    else:
                        # --- In a Room (peer_status == room_id) ---
                        room_id = peer_status
                        if msg.startswith("ROOM_PEER_MSG"):
                            # Handle message directed to another peer in the same room
                            try:
                                _, other_id, room_msg = msg.split(maxsplit=2)
                            except ValueError:
                                 logger_signaling.warning(f"Invalid ROOM_PEER_MSG format from {uid}: {msg}")
                                 await ws.send("ERROR invalid ROOM_PEER_MSG format")
                                 continue

                            if other_id == uid: # Cannot send to self
                                await ws.send("ERROR cannot send room message to self")
                                continue

                            # Check if recipient exists and is in the same room
                            if other_id not in self.peers:
                                await ws.send("ERROR peer {!r} not found".format(other_id))
                                continue
                            wso, oaddr, status, _ = self.peers[other_id]
                            if status != room_id:
                                await ws.send("ERROR peer {!r} is not in the same room".format(other_id))
                                continue

                            # Forward message with sender ID prepended
                            full_msg = "ROOM_PEER_MSG {} {}".format(uid, room_msg)
                            logger_signaling.debug(
                                "room {}: {} -> {}: {}".format(room_id, uid, other_id, full_msg)
                            )
                            try:
                                await wso.send(full_msg)
                            except websockets.exceptions.ConnectionClosed:
                                # Log but don't break sender's loop; receiver will handle their disconnect
                                logger_signaling.info(f"Connection to room peer {other_id} closed while sending.")
                            except Exception as e:
                                logger_signaling.error(f"Error sending message to room peer {other_id}: {e}")
                        else:
                            # Invalid command while in a room
                            await ws.send("ERROR invalid command while in a room")
                            continue

                else:
                    # --- Peer is Idle (peer_status is None) ---
                    if msg.startswith("SESSION"):
                        # Request to start a session with another peer
                        try:
                            _, callee_id = msg.split(maxsplit=1)
                        except ValueError:
                            logger_signaling.warning(f"Invalid SESSION command format from {uid}: {msg}")
                            await ws.send("ERROR invalid SESSION command")
                            continue

                        if callee_id == uid: # Cannot start session with self
                             await ws.send("ERROR cannot start session with self")
                             continue

                        # Check if callee exists and is idle
                        if callee_id not in self.peers:
                            await ws.send("ERROR peer {!r} not found".format(callee_id))
                            continue
                        callee_ws, callee_raddr, callee_status, callee_meta = self.peers[callee_id]
                        if callee_status is not None: # Check if callee is busy
                            await ws.send("ERROR peer {!r} busy".format(callee_id))
                            continue

                        # Initiate session: Update states for both peers
                        self.peers[uid][2] = "session"
                        self.sessions[uid] = callee_id
                        self.peers[callee_id][2] = "session"
                        self.sessions[callee_id] = uid
                        peer_status = "session" # Update local status for next loop iteration

                        # Send SESSION_OK to caller, including callee metadata if available
                        meta64 = ""
                        if callee_meta:
                            try:
                                meta64 = base64.b64encode(bytes(json.dumps(callee_meta).encode())).decode("ascii")
                            except Exception as e:
                                logger_signaling.error(f"Failed to encode metadata for callee {callee_id}: {e}")
                        await ws.send("SESSION_OK {}".format(meta64))

                        logger_signaling.info(
                            "Session initiated: {!r} ({!r}) <-> {!r} ({!r})"
                            "".format(uid, raddr, callee_id, callee_raddr)
                        )

                    elif msg.startswith("ROOM"):
                        # Request to join or create a room
                        try:
                            _, room_id = msg.split(maxsplit=1)
                        except ValueError:
                            logger_signaling.warning(f"Invalid ROOM command format from {uid}: {msg}")
                            await ws.send("ERROR invalid ROOM command")
                            continue

                        # Validate room_id (basic checks)
                        if not room_id or room_id == "session" or room_id.split() != [room_id]:
                            await ws.send("ERROR invalid room id {!r}".format(room_id))
                            continue

                        # Create room if it doesn't exist
                        if room_id not in self.rooms:
                            self.rooms[room_id] = set()
                        room_peers_set = self.rooms[room_id]

                        # Send ROOM_OK with list of current peers BEFORE adding self
                        room_peers_str = " ".join(list(room_peers_set)) # Send a copy
                        await ws.send("ROOM_OK {}".format(room_peers_str))

                        # Update state AFTER sending OK: Add peer to room and update status
                        self.peers[uid][2] = room_id
                        room_peers_set.add(uid)
                        peer_status = room_id # Update local status variable

                        logger_signaling.info(f"Peer {uid} joined room {room_id}. Current peers: {list(room_peers_set)}")

                        # Notify existing peers AFTER adding self to the room set
                        join_msg = "ROOM_PEER_JOINED {}".format(uid)
                        notify_tasks = []
                        peers_to_remove_from_room = [] # Track inconsistent peers
                        for pid in room_peers_set:
                            if pid == uid: continue # Don't notify self
                            if pid in self.peers:
                                wsp, paddr, _, _ = self.peers[pid]
                                logger_signaling.debug(
                                    "room {}: Notifying {} -> {}: {}".format(room_id, uid, pid, join_msg)
                                )
                                notify_tasks.append(asyncio.create_task(wsp.send(join_msg)))
                            else:
                                # Inconsistency: Peer in room but not main dict
                                logger_signaling.warning(f"Peer {pid} in room {room_id} but not in self.peers during JOIN notification.")
                                peers_to_remove_from_room.append(pid)

                        # Cleanup room set if inconsistent peers found
                        for pid_remove in peers_to_remove_from_room:
                            if pid_remove in room_peers_set: room_peers_set.remove(pid_remove)

                        # Wait for notifications to complete
                        if notify_tasks:
                            results = await asyncio.gather(*notify_tasks, return_exceptions=True)
                            # Log errors, but don't break loop for sender
                            for res in results:
                                if isinstance(res, Exception):
                                    logger_signaling.warning(f"Error sending ROOM_PEER_JOINED notification: {res}")

                    else:
                        # Unknown command from an idle peer
                        logger_signaling.warning(
                            "Ignoring unknown message {!r} from idle peer {!r}".format(msg, uid)
                        )
                        await ws.send("ERROR unknown command")

        except websockets.exceptions.ConnectionClosed as e:
            # Expected closure
            logger_signaling.info(f"Connection handler loop for {uid} ended. Reason: Connection closed ({e.code} {e.reason})")
        except Exception as e:
            # Unexpected error during handling
            logger_signaling.error(f"Unexpected error in connection handler for {uid}: {e}", exc_info=True)
            # Ensure connection is closed on unexpected error
            await ws.close(code=1011, reason="Internal handler error")
        finally:
            # Cleanup (removing the peer) is handled by the caller (run -> handler's finally block)
            logger_signaling.debug(f"Exiting connection_handler for {uid}.")


    async def hello_peer(self, ws):
        """Handles the initial HELLO handshake from a new connection."""
        raddr = ws.remote_address
        try:
            # Wait for the HELLO message
            hello = await ws.recv()
        except websockets.exceptions.ConnectionClosed:
            raise Exception(f"Connection closed by {raddr} before HELLO received")

        # Parse HELLO message (HELLO <uid> [metadata_base64])
        toks = hello.split(maxsplit=2)
        metab64str = None
        uid = None
        if len(toks) >= 2:
            hello_cmd, uid = toks[:2]
            if len(toks) > 2:
                metab64str = toks[2]
        else:
             hello_cmd = None # Force failure below

        # Validate command
        if hello_cmd != "HELLO":
            await ws.close(code=1002, reason="invalid protocol - expected HELLO")
            raise Exception("Invalid hello command {!r} from {!r}".format(hello_cmd, raddr))

        # Basic UID validation (non-empty, no spaces, not reserved keyword)
        if not uid or uid.split() != [uid] or uid == "session":
            await ws.close(code=1002, reason="invalid peer uid")
            raise Exception("Invalid uid {!r} from {!r}".format(uid, raddr))

        # Check if UID is already taken
        if uid in self.peers:
             await ws.close(code=1008, reason="peer uid already taken") # Policy Violation
             raise Exception("UID {!r} already taken by another peer.".format(uid))

        # Decode optional metadata
        meta = None
        if metab64str:
            try:
                meta = json.loads(base64.b64decode(metab64str))
            except (json.JSONDecodeError, base64.binascii.Error, TypeError) as e:
                 logger_signaling.warning(f"Failed to decode metadata from {raddr} for uid {uid}: {e}")
                 meta = None # Proceed without metadata on error

        # Send HELLO confirmation back to client
        await ws.send("HELLO")
        return uid, meta

    def get_https_certs(self):
        """Returns the paths to the configured HTTPS certificate and key files."""
        cert_pem = (
            os.path.abspath(self.https_cert)
            if self.https_cert and os.path.isfile(self.https_cert) # Check file exists
            else None
        )
        key_pem = (
            os.path.abspath(self.https_key)
            if self.https_key and os.path.isfile(self.https_key) # Check file exists
            else None
        )
        return cert_pem, key_pem

    def get_ssl_ctx(self, https_server=True):
        """Creates and configures an SSL context for HTTPS if enabled."""
        if not self.enable_https:
            return None
        cert_pem, key_pem = self.get_https_certs()
        # Certificate file is mandatory for HTTPS
        if not cert_pem:
             logger_signaling.error(f"HTTPS enabled but certificate file not found or invalid: {self.https_cert}")
             sys.exit(1)
        # Key file can be optional if embedded in the certificate
        if key_pem and not os.path.exists(key_pem):
             logger_signaling.error(f"HTTPS enabled but key file not found or invalid: {self.https_key}")
             sys.exit(1)

        logger_signaling.info(
            "Using TLS certificate: {}, Key: {}".format(cert_pem, key_pem or "Embedded/None")
        )
        # Use SERVER_AUTH purpose for the server-side context
        ssl_purpose = ssl.Purpose.SERVER_AUTH
        sslctx = ssl.create_default_context(purpose=ssl_purpose)

        try:
            # Load the certificate chain and private key
            sslctx.load_cert_chain(cert_pem, keyfile=key_pem)
        except ssl.SSLError as e:
            logger_signaling.error(f"Error loading certificate/key: {e}")
            # Provide helpful hints for common SSL errors
            if "PEM routines" in str(e) and "bad end line" in str(e):
                 logger_signaling.error("This might indicate an improperly formatted certificate or key file.")
            elif "private key" in str(e) and "does not match the certificate public key" in str(e):
                 logger_signaling.error("The private key file does not correspond to the certificate file.")
            else:
                 logger_signaling.error(
                     "Please ensure the certificate and key files are valid and accessible. "
                     "For self-signed, try: 'openssl req -x509 -newkey rsa:4096 "
                     "-keyout key.pem -out cert.pem -days 3650 -nodes -subj \"/CN=localhost\"'"
                 )
            sys.exit(1)
        except Exception as e:
             logger_signaling.error(f"Unexpected error loading certificate/key: {e}", exc_info=True)
             sys.exit(1)

        return sslctx

    async def run(self):
        """Starts the signaling and web server."""
        # Define the main WebSocket connection handler
        async def handler(ws):
            raddr = ws.remote_address
            logger_signaling.info("Signaling WebSocket connected from {!r}".format(raddr))
            peer_id = None # Initialize peer_id, assigned after successful HELLO
            try:
                # Perform initial handshake
                peer_id, meta = await self.hello_peer(ws)
                # If handshake successful, start the main message loop
                await self.connection_handler(ws, peer_id, meta)
            except websockets.exceptions.ConnectionClosed as e:
                # Log expected connection closures
                reason = f"Code: {e.code}, Reason: {e.reason}" if e.code else "Closed uncleanly"
                logger_signaling.info(
                    "Signaling connection from {!r} (ID: {}) closed: {}".format(raddr, peer_id or 'N/A', reason)
                )
            except Exception as e:
                 # Log unexpected errors during handshake or connection handling
                 logger_signaling.error(
                     f"Error handling signaling connection for {raddr} (ID: {peer_id or 'N/A'}): {e}",
                     exc_info=True # Log traceback for unexpected errors
                 )
                 # Attempt to close the connection cleanly if an error occurred
                 if ws.open:
                     await ws.close(code=1011, reason="Internal server error") # Internal Error
            finally:
                # Ensure cleanup happens when the handler exits (normally or due to error)
                # Remove the peer ONLY if the HELLO handshake completed successfully (peer_id assigned)
                if peer_id:
                    await self.remove_peer(peer_id)
                else:
                    # Log if connection closed before registration
                    logger_signaling.info(f"Disconnected from {raddr} before registration completed.")

        # Pre-cache static web files for faster serving
        try:
            static_files = list(pathlib.Path(self.web_root).rglob("*.*"))
            logger_signaling.info(f"Caching {len(static_files)} static files from {self.web_root}...")
            await asyncio.gather(
                *[
                    self.cache_file(os.path.realpath(f))
                    for f in static_files if os.path.isfile(f)
                ]
            )
            logger_signaling.info("Static file caching complete.")
        except Exception as e:
            logger_signaling.warning(f"Error during static file caching (non-fatal): {e}")

        # Get SSL context if HTTPS is enabled
        sslctx = self.get_ssl_ctx(https_server=True)
        logger_signaling.setLevel(logging.INFO)
        web_logger.setLevel(logging.WARN) # Reduce verbosity of web file serving logs
        http_protocol = "https:" if self.enable_https else "http:"
        logger_signaling.info(
            "Signaling/Web server listening on {}//{}:{}".format(http_protocol, self.addr, self.port)
        )
        # Create partial function for HTTP request processing
        http_handler = functools.partial(self.process_request, self.web_root)
        self.stop_server = asyncio.Future()
        try:
            # Configure server options
            server_options = {
                "ssl": sslctx,
                "process_request": http_handler, # Handle HTTP requests before upgrade
                "max_queue": 16, # Limit queued connections
                "ping_interval": 20, # Enable keepalive pings
                "ping_timeout": 20,
            }
            # Start the WebSocket server
            async with websockets.asyncio.server.serve(
                handler, # Main WebSocket connection handler
                self.addr,
                self.port,
                **server_options
            ) as self.server:
                # Wait until stop() is called
                await self.stop_server
        except OSError as e:
             # Handle common startup errors like address in use
             logger_signaling.error(f"Failed to start Signaling/Web server on {self.addr}:{self.port}: {e}")
             self.server = None
             raise
        except Exception as e:
            logger_signaling.error(f"Exception starting WebRTCSimpleServer: {e}", exc_info=True)
            self.server = None
            raise

    async def stop(self):
        """Stops the signaling and web server gracefully."""
        logger_signaling.info("Stopping Signaling/Web server... ")
        # Signal the run() loop to exit
        if self.stop_server is not None and not self.stop_server.done():
            self.stop_server.set_result(True)
        # Close the server instance
        if self.server:
            self.server.close()
            try:
                # Wait for the server to close
                await asyncio.wait_for(self.server.wait_closed(), timeout=5.0)
            except asyncio.TimeoutError:
                 logger_signaling.warning("Timeout waiting for Signaling/Web server to close.")
            except Exception as e:
                logger_signaling.warning(f"Error waiting for Signaling/Web server to close: {e}")
            self.server = None

        # Clean up any remaining peers that might not have disconnected cleanly
        if self.peers:
             logger_signaling.info(f"Cleaning up {len(self.peers)} remaining signaling peer connections...")
             # Create tasks to remove all remaining peers concurrently
             cleanup_tasks = [self.remove_peer(peer_id) for peer_id in list(self.peers.keys())]
             await asyncio.gather(*cleanup_tasks, return_exceptions=True)
             logger_signaling.info("Remaining signaling peer cleanup finished.")

        logger_signaling.info("Signaling/Web server stopped.")

    def check_cert_changed(self):
        """Checks if the HTTPS certificate or key file has been modified."""
        cert_pem, key_pem = self.get_https_certs()
        if not cert_pem or not os.path.exists(cert_pem): return False
        if key_pem and not os.path.exists(key_pem): return False # Check key only if specified
        try:
            mtime = os.stat(cert_pem).st_mtime
            if key_pem: mtime = max(mtime, os.stat(key_pem).st_mtime)

            if self.cert_mtime < 0: # First check
                self.cert_mtime = mtime
                return False
            if mtime > self.cert_mtime: # Subsequent checks
                self.cert_mtime = mtime
                return True
        except OSError as e:
            logger_signaling.error(f"Error stating certificate/key files: {e}")
        return False

    async def check_server_needs_restart(self):
        """Periodically checks if the certificate changed and stops the server if needed."""
        while self.cert_restart:
            await asyncio.sleep(1.0)
            if self.check_cert_changed():
                logger_signaling.info("Certificate changed, stopping server...")
                await self.stop()
                return # Exit the check loop


class WebRTCSignallingError(Exception):
    """Custom exception for general WebRTC signaling errors."""
    pass


class WebRTCSignallingErrorNoPeer(Exception):
    """Custom exception for errors when a specific peer is not found."""
    pass


class WebRTCSignalling:
    def __init__(
        self,
        server,
        id,
        peer_id,
        enable_https=False,
        enable_basic_auth=False,
        basic_auth_user=None,
        basic_auth_password=None,
    ):
        self.server = server
        self.id = id
        self.peer_id = peer_id
        self.enable_https = enable_https
        self.enable_basic_auth = enable_basic_auth
        self.basic_auth_user = basic_auth_user
        self.basic_auth_password = basic_auth_password
        self.conn = None
        self.on_ice = lambda mlineindex, candidate: \
            logger_webrtc_signalling.warning("unhandled ice event")
        self.on_sdp = lambda sdp_type, sdp: \
            logger_webrtc_signalling.warning("unhandled sdp event")
        self.on_connect = lambda: \
            logger_webrtc_signalling.warning("unhandled on_connect callback")
        self.on_disconnect = lambda: \
            logger_webrtc_signalling.warning("unhandled on_disconnect callback")
        self.on_session = lambda peer_id, meta: \
            logger_webrtc_signalling.warning("unhandled on_session callback")
        self.on_error = lambda v: logger_webrtc_signalling.warning(
            "unhandled on_error callback: %s", v
        )

    async def setup_call(self):
        logger_webrtc_signalling.debug("setting up call")
        await self.conn.send("SESSION %d" % self.peer_id)

    async def connect(self):
        try:
            sslctx = None
            if self.enable_https:
                sslctx = ssl.create_default_context(purpose=ssl.Purpose.SERVER_AUTH)
                sslctx.check_hostname = False
                sslctx.verify_mode = ssl.CERT_NONE
            headers = None
            if self.enable_basic_auth:
                auth64 = base64.b64encode(
                    bytes(
                        "{}:{}".format(self.basic_auth_user, self.basic_auth_password),
                        "ascii",
                    )
                ).decode("ascii")
                headers = [("Authorization", "Basic {}".format(auth64))]
            while True:
                try:
                    self.conn = await websockets.asyncio.client.connect(
                        self.server, additional_headers=headers, ssl=sslctx
                    )
                    break
                except ConnectionRefusedError:
                    logger_webrtc_signalling.info("Connecting to signal server...")
                    await asyncio.sleep(2.0)
            await self.conn.send("HELLO %d" % self.id)
        except websockets.exceptions.ConnectionClosed:
            await self.on_disconnect()

    async def send_ice(self, mlineindex, candidate):
        msg = json.dumps({"ice": {"candidate": candidate, "sdpMLineIndex": mlineindex}})
        await self.conn.send(msg)

    async def send_sdp(self, sdp_type, sdp):
        logger_webrtc_signalling.info("sending sdp type: %s" % sdp_type)
        logger_webrtc_signalling.debug("SDP:\n%s" % sdp)
        msg = json.dumps({"sdp": {"type": sdp_type, "sdp": sdp}})
        await self.conn.send(msg)

    async def stop(self):
        logger_webrtc_signalling.warning("stopping")
        if self.conn:
            await self.conn.close()
        self.conn = None

    async def start(self):
        if not self.conn:
             logger_webrtc_signalling.error(
                 "Cannot start signaling loop, connection is not established."
             )
             return

        try:
            async for message in self.conn:
                if message == "HELLO":
                    logger_webrtc_signalling.info("connected")
                    await self.on_connect()
                elif message.startswith("SESSION_OK"):
                    toks = message.split()
                    meta = {}
                    if len(toks) > 1:
                        meta = json.loads(base64.b64decode(toks[1]))
                    logger_webrtc_signalling.info(
                        "started session with peer: %s, meta: %s",
                        self.peer_id,
                        json.dumps(meta),
                    )
                    self.on_session(self.peer_id, (meta))
                elif message.startswith("ERROR"):
                    if message == "ERROR peer '%s' not found" % self.peer_id:
                        await self.on_error(
                            WebRTCSignallingErrorNoPeer("'%s' not found" % self.peer_id)
                        )
                    else:
                        await self.on_error(
                            WebRTCSignallingError(
                                "unhandled signalling message: %s" % message
                            )
                        )
                else:
                    data = None
                    try:
                        data = json.loads(message)
                    except Exception as e:
                        if isinstance(e, json.decoder.JSONDecodeError):
                            await self.on_error(
                                WebRTCSignallingError(
                                    "error parsing message as JSON: %s" % message
                                )
                            )
                        else:
                            await self.on_error(
                                WebRTCSignallingError(
                                    "failed to prase message: %s" % message
                                )
                            )
                        continue
                    if data.get("sdp", None):
                        logger_webrtc_signalling.info("received SDP")
                        logger_webrtc_signalling.debug("SDP:\n%s" % data["sdp"])
                        self.on_sdp(data["sdp"].get("type"), data["sdp"].get("sdp"))
                    elif data.get("ice", None):
                        logger_webrtc_signalling.info("received ICE")
                        logger_webrtc_signalling.debug("ICE:\n%s" % data.get("ice"))
                        self.on_ice(
                            data["ice"].get("sdpMLineIndex"), data["ice"].get("candidate")
                        )
                    else:
                        await self.on_error(
                            WebRTCSignallingError(
                                "unhandled JSON message: %s", json.dumps(data)
                            )
                        )
        except websockets.exceptions.ConnectionClosed:
             logger_webrtc_signalling.info("Signaling connection closed.")
             await self.on_disconnect()
        except Exception as e:
             logger_webrtc_signalling.error(
                 f"Unexpected error in signaling loop: {e}", exc_info=True
             )
             await self.on_disconnect()

# --- Simplified on_resize_handler ---
def on_resize_handler(res_from_client, current_app):
    """
    Attempts to resize the display using resize_display based on the client request.
    Updates current_app.last_resize_success flag.
    Does NOT update current_app.display_width/height.
    """
    logger_gstwebrtc_app_resize.info(f"on_resize_handler attempting resize for: {res_from_client}")
    try:
        # Check if the last resize attempt failed to prevent rapid failed attempts
        if not getattr(current_app, 'last_resize_success', True):
            logger_gstwebrtc_app_resize.warning(f"Skipping resize for {res_from_client} because last attempt failed.")
            # Ensure flag remains False
            current_app.last_resize_success = False
            return # Don't attempt resize

        logger_gstwebrtc_app_resize.info(f"Calling resize_display with '{res_from_client}'...")
        # Attempt to resize the display using external tools (e.g., xrandr)
        success = resize_display(res_from_client)

        if success:
            logger_gstwebrtc_app_resize.info(f"resize_display('{res_from_client}') reported success.")
            current_app.last_resize_success = True # Set flag on success
            # Optionally send confirmation back to client - ws_handler can do this too
            # if hasattr(current_app, 'send_remote_resolution'):
            #     current_app.send_remote_resolution(res_from_client)
        else:
            logger_gstwebrtc_app_resize.error(f"resize_display('{res_from_client}') reported failure.")
            current_app.last_resize_success = False # Set flag on failure

    except Exception as e:
        logger_gstwebrtc_app_resize.error(f"Error during resize handling for '{res_from_client}': {e}", exc_info=True)
        # Ensure flag is False on any exception during the process
        if current_app: current_app.last_resize_success = False
# --- End Simplified on_resize_handler ---


def on_scaling_ratio_handler(scale, current_app):
    """Handles client request to change DPI scaling and cursor size."""
    if scale < 0.75 or scale > 2.5: # Basic validation
        logger.error("requested scale ratio out of bounds: {}".format(scale))
        return
    # Calculate and set DPI
    dpi = int(96 * scale)
    logger.info("Setting DPI to: {}".format(dpi))
    if not set_dpi(dpi):
        logger.error("failed to set DPI to {}".format(dpi))
    # Calculate and set cursor size
    cursor_size = int(16 * scale)
    logger.info("Setting cursor size to: {}".format(cursor_size))
    if not set_cursor_size(cursor_size):
        logger.error("failed to set cursor size to {}".format(cursor_size))

async def main():
    """Main asynchronous function to set up and run the server components."""
    # --- Argument Parsing ---
    if "DEV_MODE" in os.environ:
        try:
            pathlib.Path("../../addons/gst-web-core/selkies-version.txt").touch()
        except OSError as e:
            logger.warning(f"Could not touch selkies-version.txt: {e}")
    parser = argparse.ArgumentParser()
    # --- Server Configuration ---
    parser.add_argument(
        "--json_config",
        default=os.environ.get("SELKIES_JSON_CONFIG", "/tmp/selkies_config.json"),
        help="Path to the JSON file containing argument key-value pairs that are overlaid with CLI arguments or environment variables, this path must be writable",
    )
    parser.add_argument(
        "--addr",
        default=os.environ.get("SELKIES_ADDR", "0.0.0.0"),
        help='Host to listen to for the signaling and web server, default: "0.0.0.0"',
    )
    parser.add_argument(
        "--port",
        default=os.environ.get("SELKIES_PORT", "8080"),
        help='Port to listen to for the signaling and web server, default: "8080"',
    )
    parser.add_argument(
        "--data_websocket_port",
        default=os.environ.get("SELKIES_DATA_WEBSOCKET_PORT", "8082"),
        help='Port to listen to for the raw data websocket server, default: "8082"',
    )
    parser.add_argument(
        "--web_root",
        default=os.environ.get("SELKIES_WEB_ROOT", "/opt/gst-web"),
        help='Path to directory containing web application files, default: "/opt/gst-web"',
    )
    # --- Security ---
    parser.add_argument(
        "--enable_https",
        default=os.environ.get("SELKIES_ENABLE_HTTPS", "false"),
        help="Enable or disable HTTPS for the web application, specifying a valid server certificate is recommended",
    )
    parser.add_argument(
        "--https_cert",
        default=os.environ.get(
            "SELKIES_HTTPS_CERT", "/etc/ssl/certs/ssl-cert-snakeoil.pem"
        ),
        help="Path to the TLS server certificate file when HTTPS is enabled",
    )
    parser.add_argument(
        "--https_key",
        default=os.environ.get(
            "SELKIES_HTTPS_KEY", "/etc/ssl/private/ssl-cert-snakeoil.key"
        ),
        help="Path to the TLS server private key file when HTTPS is enabled, set to an empty value if the private key is included in the certificate",
    )
    parser.add_argument(
        "--enable_basic_auth",
        default=os.environ.get("SELKIES_ENABLE_BASIC_AUTH", "true"),
        help="Enable basic authentication on server, must set --basic_auth_password and optionally --basic_auth_user to enforce basic authentication",
    )
    parser.add_argument(
        "--basic_auth_user",
        default=os.environ.get("SELKIES_BASIC_AUTH_USER", os.environ.get("USER", "")),
        help="Username for basic authentication, default is to use the USER environment variable or a blank username if not present, must also set --basic_auth_password to enforce basic authentication",
    )
    parser.add_argument(
        "--basic_auth_password",
        default=os.environ.get("SELKIES_BASIC_AUTH_PASSWORD", "mypasswd"),
        help="Password used when basic authentication is set",
    )
    # --- WebRTC Configuration (STUN/TURN) ---
    parser.add_argument(
        "--rtc_config_json",
        default=os.environ.get("SELKIES_RTC_CONFIG_JSON", "/tmp/rtc.json"),
        help="JSON file with WebRTC configuration to use, checked periodically, overriding all other STUN/TURN settings",
    )
    parser.add_argument(
        "--turn_rest_uri",
        default=os.environ.get("SELKIES_TURN_REST_URI", ""),
        help="URI for TURN REST API service, example: http://localhost:8008",
    )
    parser.add_argument(
        "--turn_rest_username",
        default=os.environ.get(
            "SELKIES_TURN_REST_USERNAME", "selkies-{}".format(socket.gethostname())
        ),
        help="URI for TURN REST API service, default set to system hostname",
    )
    parser.add_argument(
        "--turn_rest_username_auth_header",
        default=os.environ.get("SELKIES_TURN_REST_USERNAME_AUTH_HEADER", "x-auth-user"),
        help="Header to pass user to TURN REST API service",
    )
    parser.add_argument(
        "--turn_rest_protocol_header",
        default=os.environ.get("SELKIES_TURN_REST_PROTOCOL_HEADER", "x-turn-protocol"),
        help="Header to pass desired TURN protocol to TURN REST API service",
    )
    parser.add_argument(
        "--turn_rest_tls_header",
        default=os.environ.get("SELKIES_TURN_REST_TLS_HEADER", "x-turn-tls"),
        help="Header to pass TURN (D)TLS usage to TURN REST API service",
    )
    parser.add_argument(
        "--turn_host",
        default=os.environ.get("SELKIES_TURN_HOST", "staticauth.openrelay.metered.ca"),
        help="TURN host when generating RTC config from shared secret or using long-term credentials, IPv6 addresses must be enclosed with square brackets such as [::1]",
    )
    parser.add_argument(
        "--turn_port",
        default=os.environ.get("SELKIES_TURN_PORT", "443"),
        help="TURN port when generating RTC config from shared secret or using long-term credentials",
    )
    parser.add_argument(
        "--turn_protocol",
        default=os.environ.get("SELKIES_TURN_PROTOCOL", "udp"),
        help='TURN protocol for the client to use ("udp" or "tcp"), set to "tcp" without the quotes if "udp" is blocked on the network, "udp" is otherwise strongly recommended',
    )
    parser.add_argument(
        "--turn_tls",
        default=os.environ.get("SELKIES_TURN_TLS", "false"),
        help="Enable or disable TURN over TLS (for the TCP protocol) or TURN over DTLS (for the UDP protocol), valid TURN server certificate required",
    )
    parser.add_argument(
        "--turn_shared_secret",
        default=os.environ.get("SELKIES_TURN_SHARED_SECRET", "openrelayprojectsecret"),
        help="Shared TURN secret used to generate HMAC credentials, also requires --turn_host and --turn_port",
    )
    parser.add_argument(
        "--turn_username",
        default=os.environ.get("SELKIES_TURN_USERNAME", ""),
        help="Legacy non-HMAC TURN credential username, also requires --turn_host and --turn_port",
    )
    parser.add_argument(
        "--turn_password",
        default=os.environ.get("SELKIES_TURN_PASSWORD", ""),
        help="Legacy non-HMAC TURN credential password, also requires --turn_host and --turn_port",
    )
    parser.add_argument(
        "--stun_host",
        default=os.environ.get("SELKIES_STUN_HOST", "stun.l.google.com"),
        help='STUN host for NAT hole punching with WebRTC, change to your internal STUN/TURN server for local networks without internet, defaults to "stun.l.google.com"',
    )
    parser.add_argument(
        "--stun_port",
        default=os.environ.get("SELKIES_STUN_PORT", "19302"),
        help='STUN port for NAT hole punching with WebRTC, change to your internal STUN/TURN server for local networks without internet, defaults to "19302"',
    )
    parser.add_argument(
        "--enable_cloudflare_turn",
        default=os.environ.get("SELKIES_ENABLE_CLOUDFLARE_TURN", "false"),
        help="Enable Cloudflare TURN service, requires SELKIES_CLOUDFLARE_TURN_TOKEN_ID, and SELKIES_CLOUDFLARE_TURN_API_TOKEN",
    )
    parser.add_argument(
        "--cloudflare_turn_token_id",
        default=os.environ.get("SELKIES_CLOUDFLARE_TURN_TOKEN_ID", ""),
        help="The Cloudflare TURN App token ID.",
    )
    parser.add_argument(
        "--cloudflare_turn_api_token",
        default=os.environ.get("SELKIES_CLOUDFLARE_TURN_API_TOKEN", ""),
        help="The Cloudflare TURN API token.",
    )
    # --- Application Integration ---
    parser.add_argument(
        "--app_wait_ready",
        default=os.environ.get("SELKIES_APP_WAIT_READY", "false"),
        help='Waits for --app_ready_file to exist before starting stream if set to "true"',
    )
    parser.add_argument(
        "--app_ready_file",
        default=os.environ.get("SELKIES_APP_READY_FILE", "/tmp/selkies-appready"),
        help="File set by sidecar used to indicate that app is initialized and ready",
    )
    # --- Input Handling ---
    parser.add_argument(
        "--uinput_mouse_socket",
        default=os.environ.get("SELKIES_UINPUT_MOUSE_SOCKET", ""),
        help="Path to the uinput mouse socket, if not provided uinput is used directly",
    )
    parser.add_argument(
        "--js_socket_path",
        default=os.environ.get("SELKIES_JS_SOCKET_PATH", "/tmp"),
        help="Directory to write the Selkies Joystick Interposer communication sockets to, default: /tmp, results in socket files: /tmp/selkies_js{0-3}.sock",
    )
    parser.add_argument(
        "--enable_clipboard",
        default=os.environ.get("SELKIES_ENABLE_CLIPBOARD", "true"),
        help="Enable or disable the clipboard features, supported values: true, false, in, out",
    )
    parser.add_argument(
        "--enable_resize",
        default=os.environ.get("SELKIES_ENABLE_RESIZE", "false"),
        help="Enable dynamic resizing to match browser size",
    )
    parser.add_argument(
        "--enable_cursors",
        default=os.environ.get("SELKIES_ENABLE_CURSORS", "true"),
        help="Enable passing remote cursors to client",
    )
    parser.add_argument(
        "--debug_cursors",
        default=os.environ.get("SELKIES_DEBUG_CURSORS", "false"),
        help="Enable cursor debug logging",
    )
    parser.add_argument(
        "--cursor_size",
        default=os.environ.get(
            "SELKIES_CURSOR_SIZE", os.environ.get("XCURSOR_SIZE", "-1")
        ),
        help="Cursor size in points for the local cursor, set instead XCURSOR_SIZE without of this argument to configure the cursor size for both the local and remote cursors",
    )
    # --- GStreamer Pipeline Configuration ---
    parser.add_argument(
        "--encoder",
        default=os.environ.get("SELKIES_ENCODER", "x264enc"),
        # --- Add jpeg as a potential default/choice ---
        help="Video encoder to use (e.g., x264enc, nvh264enc, jpeg)",
        # --- End add jpeg ---
    )
    parser.add_argument(
        "--gpu_id",
        default=os.environ.get("SELKIES_GPU_ID", "0"),
        help="GPU ID for GStreamer hardware video encoders, will use enumerated GPU ID (0, 1, ..., n) for NVIDIA and /dev/dri/renderD{128 + n} for VA-API",
    )
    parser.add_argument(
        "--framerate",
        default=os.environ.get("SELKIES_FRAMERATE", "60"),
        help="Framerate of the streamed remote desktop",
    )
    parser.add_argument(
        "--video_bitrate",
        default=os.environ.get("SELKIES_VIDEO_BITRATE", "16000"),
        help="Default video bitrate in kilobits per second",
    )
    parser.add_argument(
        "--keyframe_distance",
        default=os.environ.get("SELKIES_KEYFRAME_DISTANCE", "-1"),
        help='Distance between video keyframes/GOP-frames in seconds, defaults to "-1" for infinite keyframe distance (ideal for low latency and preventing periodic blurs)',
    )
    parser.add_argument(
        "--congestion_control",
        default=os.environ.get("SELKIES_CONGESTION_CONTROL", "false"),
        help="Enable Google Congestion Control (GCC), suggested if network conditions fluctuate and when bandwidth is >= 2 mbps but may lead to lower quality and microstutter due to adaptive bitrate in some encoders",
    )
    parser.add_argument(
        "--video_packetloss_percent",
        default=os.environ.get("SELKIES_VIDEO_PACKETLOSS_PERCENT", "0"),
        help='Expected packet loss percentage (%%) for ULP/RED Forward Error Correction (FEC) in video, use "0" to disable FEC, less effective because of other mechanisms including NACK/PLI, enabling not recommended if Google Congestion Control is enabled',
    )
    parser.add_argument(
        "--audio_bitrate",
        default=os.environ.get("SELKIES_AUDIO_BITRATE", "128000"),
        help="Default audio bitrate in bits per second",
    )
    parser.add_argument(
        "--audio_channels",
        default=os.environ.get("SELKIES_AUDIO_CHANNELS", "2"),
        help="Number of audio channels, defaults to stereo (2 channels)",
    )
    parser.add_argument(
        "--audio_packetloss_percent",
        default=os.environ.get("SELKIES_AUDIO_PACKETLOSS_PERCENT", "0"),
        help='Expected packet loss percentage (%%) for ULP/RED Forward Error Correction (FEC) in audio, use "0" to disable FEC',
    )
    # --- Statistics and Monitoring ---
    parser.add_argument(
        "--enable_webrtc_statistics",
        default=os.environ.get("SELKIES_ENABLE_WEBRTC_STATISTICS", "false"),
        help="Enable WebRTC Statistics CSV dumping to the directory --webrtc_statistics_dir with filenames selkies-stats-video-[timestamp].csv and selkies-stats-audio-[timestamp].csv",
    )
    parser.add_argument(
        "--webrtc_statistics_dir",
        default=os.environ.get("SELKIES_WEBRTC_STATISTICS_DIR", "/tmp"),
        help="Directory to save WebRTC Statistics CSV from client with filenames selkies-stats-video-[timestamp].csv and selkies-stats-audio-[timestamp].csv",
    )
    parser.add_argument(
        "--enable_metrics_http",
        default=os.environ.get("SELKIES_ENABLE_METRICS_HTTP", "false"),
        help="Enable the Prometheus HTTP metrics port",
    )
    parser.add_argument(
        "--metrics_http_port",
        default=os.environ.get("SELKIES_METRICS_HTTP_PORT", "8000"),
        help="Port to start the Prometheus metrics server on",
    )
    # --- Operating Mode ---
    parser.add_argument(
        "--mode",
        default=os.environ.get("SELKIES_MODE", "webrtc"),
        choices=['webrtc', 'websockets'],
        help='Mode of operation: "webrtc" for standard WebRTC, "websockets" for Websockets-based pipelines. Default: "webrtc"',
    )
    # --- Debugging ---
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    # --- Apply JSON Config Overlay ---
    global TARGET_FRAMERATE, TARGET_VIDEO_BITRATE_KBPS
    TARGET_FRAMERATE = int(args.framerate)
    TARGET_VIDEO_BITRATE_KBPS = int(args.video_bitrate)
    # --- Initialize app.encoder from args ---
    initial_encoder = args.encoder.lower()
    # --- End encoder init ---

    # Load settings from JSON file, potentially overriding command-line args/env vars
    if os.path.exists(args.json_config):
        try:
            with open(args.json_config, "r") as f:
                json_args = json.load(f)
            for k, v in json_args.items():
                # Apply specific overrides from JSON config
                if k == "framerate":
                    TARGET_FRAMERATE = int(v)
                    args.framerate = str(TARGET_FRAMERATE)
                if k == "video_bitrate":
                    TARGET_VIDEO_BITRATE_KBPS = int(v)
                    args.video_bitrate = str(TARGET_VIDEO_BITRATE_KBPS)
                if k == "audio_bitrate":
                    args.audio_bitrate = str(int(v))
                if k == "enable_resize":
                    args.enable_resize = str((str(v).lower() == "true")).lower()
                if k == "encoder":
                    initial_encoder = v.lower() # Update initial encoder from JSON
                    args.encoder = initial_encoder # Keep args consistent
        except Exception as e:
            logger.error(
                "failed to load json config from {}: {}".format(
                    args.json_config, str(e)
                )
            )

    # --- Logging Setup ---
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        # Ensure all loggers inherit debug level if not explicitly set
        for name in logging.root.manager.loggerDict:
             if logging.getLogger(name).level == logging.NOTSET:
                 logging.getLogger(name).setLevel(logging.DEBUG)
    else:
        logging.getLogger().setLevel(logging.INFO)
        # Reduce noise from verbose libraries
        logging.getLogger("websockets").setLevel(logging.WARNING)
        logging.getLogger("aiortc").setLevel(logging.WARNING)
        # Reduce pulsectl/pasimple noise unless debugging
        if not args.debug:
            logging.getLogger("pulsectl").setLevel(logging.WARNING)

    # Log effective arguments after parsing and overlay
    logger.info(f"Effective arguments: {args}")
    logger.info(f"Initial Encoder: {initial_encoder}")

    # --- Wait for App Ready ---
    await wait_for_app_ready(args.app_ready_file, args.app_wait_ready.lower() == "true")

    # --- Setup IDs and Metrics ---
    my_id = 0 # ID for main (video) signaling client
    peer_id = 1 # Expected ID of the peer for main (video) connection
    my_audio_id = 2 # ID for audio-only signaling client
    audio_peer_id = 3 # Expected ID of the peer for audio-only connection
    using_metrics_http = args.enable_metrics_http.lower() == "true"
    using_webrtc_csv = args.enable_webrtc_statistics.lower() == "true"
    metrics = Metrics(int(args.metrics_http_port), using_webrtc_csv)

    # --- Setup Server Flags ---
    using_https = args.enable_https.lower() == "true"
    using_basic_auth = args.enable_basic_auth.lower() == "true"
    if using_basic_auth and not args.basic_auth_password:
        logger.critical("Basic auth enabled but --basic_auth_password not set. Exiting.")
        sys.exit(1)

    # --- Setup Signaling Clients (WebRTC Mode Only) ---
    signalling = None
    audio_signalling = None
    if args.mode == 'webrtc':
        ws_protocol = "wss:" if using_https else "ws:"
        # Signaling clients connect to the local signaling server instance
        signalling_url = f"{ws_protocol}//127.0.0.1:{args.port}/ws"
        # Video/App signaling client
        signalling = WebRTCSignalling(
            signalling_url, my_id, peer_id, using_https, using_basic_auth,
            args.basic_auth_user, args.basic_auth_password
        )
        # Audio-only signaling client
        audio_signalling = WebRTCSignalling(
            signalling_url, my_audio_id, audio_peer_id, using_https, using_basic_auth,
            args.basic_auth_user, args.basic_auth_password
        )

        # Define error handlers for signaling clients
        async def on_signalling_error(e):
            if isinstance(e, WebRTCSignallingErrorNoPeer):
                # If peer not found, retry session setup after a delay
                logger.warning(f"Signaling: Peer {signalling.peer_id} not found, retrying setup call...")
                await asyncio.sleep(1.0)
                await signalling.setup_call()
            else:
                # Log other signaling errors and potentially stop the pipeline
                logger.error("Signalling error: %s", str(e), exc_info=True)
                if app and hasattr(app, 'stop_pipeline'): await app.stop_pipeline()
        async def on_audio_signalling_error(e):
            if isinstance(e, WebRTCSignallingErrorNoPeer):
                 # If audio peer not found, retry session setup
                 logger.warning(f"Audio Signaling: Peer {audio_signalling.peer_id} not found, retrying setup call...")
                 await asyncio.sleep(1.0)
                 await audio_signalling.setup_call()
            else:
                 logger.error("Audio signalling error: %s", str(e), exc_info=True)
                 if audio_app and hasattr(audio_app, 'stop_pipeline'): await audio_app.stop_pipeline()

        # Assign handlers to signaling clients
        signalling.on_error = on_signalling_error
        audio_signalling.on_error = on_audio_signalling_error
        # Stop pipelines if signaling disconnects
        if hasattr(GSTWebRTCApp, 'stop_pipeline'): # Check before assigning lambda
            signalling.on_disconnect = lambda: app.stop_pipeline() if app else None
            audio_signalling.on_disconnect = lambda: audio_app.stop_pipeline() if audio_app else None
        # Initiate session setup upon successful connection
        signalling.on_connect = signalling.setup_call
        audio_signalling.on_connect = audio_signalling.setup_call

    # --- RTC Configuration Determination ---
    # Determine the source and content of the WebRTC ICE server configuration
    turn_rest_username = args.turn_rest_username.replace(":", "-") # Ensure username is compatible
    rtc_config = None
    stun_servers = []
    turn_servers = []
    turn_protocol = "tcp" if args.turn_protocol.lower() == "tcp" else "udp"
    using_turn_tls = args.turn_tls.lower() == "true"
    using_turn_rest = False
    using_hmac_turn = False
    using_rtc_config_json = False

    # Priority 1: Cloudflare TURN
    if args.enable_cloudflare_turn == "true":
        if args.cloudflare_turn_token_id and args.cloudflare_turn_api_token:
            try:
                cf_creds = fetch_cloudflare_turn(args.cloudflare_turn_token_id, args.cloudflare_turn_api_token)
                logger.info(f"Got Cloudflare TURN credentials") # Avoid logging credentials
                # Construct standard iceServers list including Cloudflare TURN
                ice_servers_list = []
                ice_servers_list.append({"urls": [f"stun:{args.stun_host}:{args.stun_port}", "stun:stun.l.google.com:19302"]})
                ice_servers_list.append({
                    "urls": cf_creds.get("uris", []),
                    "username": cf_creds.get("username"),
                    "credential": cf_creds.get("password")
                })
                rtc_config_data = {"iceServers": ice_servers_list}
                rtc_config = json.dumps(rtc_config_data)
                stun_servers, turn_servers, _ = parse_rtc_config(rtc_config)
            except Exception as e:
                logger.warning(f"failed to fetch or parse TURN config from Cloudflare: {e}")
        else:
            logger.error("Cloudflare TURN enabled but missing --cloudflare_turn_token_id or --cloudflare_turn_api_token")

    # Priority 2: RTC Config JSON File
    if rtc_config is None and os.path.exists(args.rtc_config_json):
        logger.warning(f"Using JSON file from {args.rtc_config_json} for RTC config")
        try:
            with open(args.rtc_config_json, "r") as f:
                config_content = f.read()
            stun_servers, turn_servers, rtc_config = parse_rtc_config(config_content)
            using_rtc_config_json = True # Enable file monitor
        except Exception as e:
            logger.error(f"Failed to read/parse RTC config file {args.rtc_config_json}: {e}")
            rtc_config = None # Ensure fallback if parsing fails

    # Priority 3: TURN REST API
    if rtc_config is None and args.turn_rest_uri:
        try:
            stun_servers, turn_servers, rtc_config = fetch_turn_rest(
                args.turn_rest_uri, turn_rest_username, args.turn_rest_username_auth_header,
                turn_protocol, args.turn_rest_protocol_header, using_turn_tls, args.turn_rest_tls_header
            )
            logger.info("Using TURN REST API RTC configuration")
            using_turn_rest = True # Enable REST monitor
        except Exception as e:
            logger.warning(f"Error fetching TURN REST API ({args.turn_rest_uri}): {e}. Falling back...")
            using_turn_rest = False
            rtc_config = None # Ensure fallback

    # Priority 4: Fallback Credentials (Legacy, HMAC, Default STUN)
    if rtc_config is None:
        if (args.turn_username and args.turn_password) and (args.turn_host and args.turn_port):
            # Use legacy static username/password
            config_json = make_turn_rtc_config_json_legacy(
                args.turn_host, args.turn_port, args.turn_username, args.turn_password,
                turn_protocol, using_turn_tls, args.stun_host, args.stun_port
            )
            stun_servers, turn_servers, rtc_config = parse_rtc_config(config_json)
            logger.info("Using TURN long-term username/password credentials")
        elif args.turn_shared_secret and (args.turn_host and args.turn_port):
            # Use HMAC shared secret
            hmac_data = generate_rtc_config(
                args.turn_host, args.turn_port, args.turn_shared_secret, turn_rest_username,
                turn_protocol, using_turn_tls, args.stun_host, args.stun_port
            )
            stun_servers, turn_servers, rtc_config = parse_rtc_config(hmac_data)
            logger.info("Using TURN short-term shared secret HMAC credentials")
            using_hmac_turn = True # Enable HMAC monitor
        else:
            # Use default STUN servers only
            stun_servers, turn_servers, rtc_config = parse_rtc_config(DEFAULT_RTC_CONFIG)
            logger.warning("No valid TURN configured. Using default STUN servers only.")

    logger.info("Initial server RTC configuration determined.")
    # --- End RTC Config Determination ---

    # --- Setup App Parameters ---
    enable_resize = args.enable_resize.lower() == "true"
    audio_channels = int(args.audio_channels)
    initial_fps = TARGET_FRAMERATE
    gpu_id = int(args.gpu_id)
    initial_video_bitrate = TARGET_VIDEO_BITRATE_KBPS
    initial_audio_bitrate = int(args.audio_bitrate)
    enable_cursors = args.enable_cursors.lower() == "true"
    cursor_debug = args.debug_cursors.lower() == "true"
    cursor_size = int(args.cursor_size)
    keyframe_distance = float(args.keyframe_distance)
    congestion_control = args.congestion_control.lower() == "true"
    video_packetloss_percent = float(args.video_packetloss_percent)
    audio_packetloss_percent = float(args.audio_packetloss_percent)

    # --- Initialize GST Apps and Data Server ---
    event_loop = asyncio.get_running_loop()
    # Main application instance (handles video/app stream)
    app = GSTWebRTCApp(
        event_loop, stun_servers, turn_servers, audio_channels, initial_fps,
        initial_encoder, # Use initial encoder determined from args/JSON
        gpu_id, initial_video_bitrate, initial_audio_bitrate, keyframe_distance,
        congestion_control, video_packetloss_percent, audio_packetloss_percent,
        data_streaming_server=None, # Will be set below
        mode=args.mode
    )
    # --- Initialize App State ---
    # Set default dimensions (will be overridden by first resize message)
    app.display_width = 1024
    app.display_height = 768
    app.last_resize_success = True # Assume initial state is valid
    # Ensure encoder attribute matches initial value
    app.encoder = initial_encoder
    logger.info(f"App initialized with: encoder={app.encoder}, display={app.display_width}x{app.display_height}")
    # --- End Initialize App State ---

    # Add helper methods if they don't exist (for compatibility/websockets mode)
    if not hasattr(GSTWebRTCApp, 'start_websocket_video_pipeline'): GSTWebRTCApp.start_websocket_video_pipeline = lambda self: logger.warning("start_websocket_video_pipeline not implemented.")
    if not hasattr(GSTWebRTCApp, 'stop_websocket_video_pipeline'): GSTWebRTCApp.stop_websocket_video_pipeline = lambda self: logger.warning("stop_websocket_video_pipeline not implemented.")
    if not hasattr(GSTWebRTCApp, 'start_websocket_audio_pipeline'): GSTWebRTCApp.start_websocket_audio_pipeline = lambda self: logger.warning("start_websocket_audio_pipeline not implemented.")
    if not hasattr(GSTWebRTCApp, 'stop_websocket_audio_pipeline'): GSTWebRTCApp.stop_websocket_audio_pipeline = lambda self: logger.warning("stop_websocket_audio_pipeline not implemented.")
    if not hasattr(GSTWebRTCApp, 'stop_ws_pipeline'): GSTWebRTCApp.stop_ws_pipeline = GSTWebRTCApp.stop_pipeline if hasattr(GSTWebRTCApp, 'stop_pipeline') else lambda self: logger.warning("stop_pipeline not implemented.")
    if not hasattr(GSTWebRTCApp, 'build_audio_ws_pipeline'): GSTWebRTCApp.build_audio_ws_pipeline = lambda self: logger.warning("build_audio_ws_pipeline not implemented.")

    # Data WebSocket server instance
    data_websocket_server = DataStreamingServer(
        int(args.data_websocket_port), args.mode, app, args.uinput_mouse_socket, args.js_socket_path,
        args.enable_clipboard.lower(), enable_cursors, cursor_size, 1.0, cursor_debug
    )
    app.data_streaming_server = data_websocket_server # Link data server to main app

    # Audio-only application instance (WebRTC mode only)
    audio_app = None
    if args.mode == 'webrtc':
        audio_app = GSTWebRTCApp(
            event_loop, stun_servers, turn_servers, audio_channels, initial_fps, "opusenc", -1, # Use Opus for audio
            initial_video_bitrate, initial_audio_bitrate, keyframe_distance, congestion_control,
            video_packetloss_percent, audio_packetloss_percent, data_streaming_server=data_websocket_server, mode=args.mode
        )
        # Initialize audio app state similarly if needed, though less critical
        if audio_app:
            audio_app.display_width = 1024
            audio_app.display_height = 768
            audio_app.last_resize_success = True
            audio_app.encoder = "opusenc" # Explicitly set

    # --- Setup Callbacks (Linking components) ---
    if args.mode == 'webrtc':
        if not signalling or not audio_signalling:
             # Should not happen if mode is webrtc, but check defensively
             logger.critical("WebRTC mode setup error: Signaling objects not initialized. Exiting.")
             sys.exit(1)
        # Link GSTApp SDP/ICE generation to Signaling client sending methods
        if hasattr(app, 'on_sdp'): app.on_sdp = signalling.send_sdp
        if audio_app and hasattr(audio_app, 'on_sdp'): audio_app.on_sdp = audio_signalling.send_sdp
        if hasattr(app, 'on_ice'): app.on_ice = signalling.send_ice
        if audio_app and hasattr(audio_app, 'on_ice'): audio_app.on_ice = audio_signalling.send_ice
        # Link Signaling client SDP/ICE receiving methods to GSTApp handlers
        if hasattr(app, 'set_sdp'): signalling.on_sdp = app.set_sdp
        if audio_signalling and audio_app and hasattr(audio_app, 'set_sdp'): audio_signalling.on_sdp = audio_app.set_sdp
        if hasattr(app, 'set_ice'): signalling.on_ice = app.set_ice
        if audio_signalling and audio_app and hasattr(audio_app, 'set_ice'): audio_signalling.on_ice = audio_app.set_ice

    # Handler for when a signaling session is established
    def on_session_handler(session_peer_id, meta=None):
        logger.info(f"Session handler called for peer_id {session_peer_id} with meta: {meta}")
        if args.mode == 'webrtc':
            # Check which session (main or audio) was established
            if str(session_peer_id) == str(peer_id):
                # Main video/app session established
                if meta:
                    # Process initial metadata from client (e.g., resolution)
                    if enable_resize:
                        if meta.get("res"): on_resize_handler(meta["res"], app)
                        if meta.get("scale"): on_scaling_ratio_handler(meta["scale"], app)
                    else:
                        logger.info("Remote resize disabled by server config.")
                        if cursor_size <= 0: set_cursor_size(16) # Set default cursor if not specified
                logger.info("Starting main video/app pipeline (webrtc mode)")
                if hasattr(app, 'start_pipeline'): app.start_pipeline()
            elif str(session_peer_id) == str(audio_peer_id) and audio_app:
                # Audio-only session established
                logger.info("Starting audio pipeline (webrtc mode)")
                if hasattr(audio_app, 'start_pipeline'): audio_app.start_pipeline(audio_only=True)
            else:
                logger.error("Failed to start pipeline for unexpected peer_id: %s" % session_peer_id)

    # Assign the session handler to signaling clients (WebRTC mode)
    if args.mode == 'webrtc':
        signalling.on_session = on_session_handler
        if audio_signalling: audio_signalling.on_session = on_session_handler

    # Initialize the input handler
    cursor_scale = 1.0 # Initial cursor scale
    webrtc_input = WebRTCInput(
        app, args.uinput_mouse_socket, args.js_socket_path, args.enable_clipboard.lower(),
        enable_cursors, cursor_size, cursor_scale, cursor_debug
    )
    # Link input handler back to data server (needed for cursor updates in WS mode)
    if args.mode == 'websockets':
        data_websocket_server.webrtc_input = webrtc_input

    # Callback for sending cursor changes (used by cursor monitor)
    if hasattr(webrtc_input, 'send_cursor_data'):
        webrtc_input.on_cursor_change = webrtc_input.send_cursor_data

    # Handler for when WebRTC data channel opens
    def data_channel_ready():
        logger.info("WebRTC data channel opened. Sending initial state.")
        # Send initial configuration values to the client
        if hasattr(app, 'send_framerate'): app.send_framerate(app.framerate)
        if hasattr(app, 'send_video_bitrate'): app.send_video_bitrate(app.video_bitrate)
        audio_bitrate_to_send = audio_app.audio_bitrate if audio_app else app.audio_bitrate
        if hasattr(app, 'send_audio_bitrate'): app.send_audio_bitrate(audio_bitrate_to_send)
        if hasattr(app, 'send_resize_enabled'): app.send_resize_enabled(enable_resize)
        if hasattr(app, 'send_encoder'): app.send_encoder(app.encoder)
        if hasattr(app, 'send_cursor_data') and hasattr(app, 'last_cursor_sent'): app.send_cursor_data(app.last_cursor_sent) # Send last known cursor

    # Assign data channel callbacks (WebRTC mode)
    if args.mode == 'webrtc':
        if hasattr(app, 'on_data_open'): app.on_data_open = data_channel_ready
        if hasattr(app, 'on_data_message'): app.on_data_message = webrtc_input.on_message # Route data channel messages to input handler

    # --- Input Handler Callbacks ---
    # Callbacks triggered by messages received via WebRTC data channel or WebSocket
    if hasattr(app, 'set_video_bitrate'):
        webrtc_input.on_video_encoder_bit_rate = lambda bitrate: set_json_app_argument(args.json_config, "video_bitrate", bitrate) and app.set_video_bitrate(int(bitrate))
    if args.mode == 'webrtc' and audio_app and hasattr(audio_app, 'set_audio_bitrate'):
        webrtc_input.on_audio_encoder_bit_rate = lambda bitrate: set_json_app_argument(args.json_config, "audio_bitrate", bitrate) and audio_app.set_audio_bitrate(int(bitrate))
    elif hasattr(app, 'set_audio_bitrate'): # Fallback for non-webrtc or if audio_app doesn't handle it
        webrtc_input.on_audio_encoder_bit_rate = lambda bitrate: set_json_app_argument(args.json_config, "audio_bitrate", bitrate) and app.set_audio_bitrate(int(bitrate))

    if hasattr(app, 'set_pointer_visible'): webrtc_input.on_mouse_pointer_visible = lambda visible: app.set_pointer_visible(visible)
    if hasattr(webrtc_input, 'send_clipboard_data'): webrtc_input.on_clipboard_read = webrtc_input.send_clipboard_data # Triggered when client requests clipboard content

    # Handler for setting FPS
    def set_fps_handler(fps):
        set_json_app_argument(args.json_config, "framerate", fps)
        if hasattr(app, 'set_framerate'): app.set_framerate(fps)
    webrtc_input.on_set_fps = set_fps_handler

    # Assign resize/scaling handlers only if enabled
    if enable_resize:
        webrtc_input.on_resize = lambda res: on_resize_handler(res, app)
        webrtc_input.on_scaling_ratio = lambda scale: on_scaling_ratio_handler(scale, app)
    else:
        logger.info("remote resize is disabled, removing handler for on_resize/on_scaling_ratio")
        webrtc_input.on_resize = lambda res: logger.warning(f"remote resize is disabled, skipping resize to {res}")
        webrtc_input.on_scaling_ratio = lambda scale: logger.warning(f"remote resize is disabled, skipping DPI scale change to {scale}")

    # Callback for ping response (latency calculation)
    if hasattr(app, 'send_latency_time'): webrtc_input.on_ping_response = lambda latency: app.send_latency_time(latency)

    # Handler for enabling/disabling remote resize dynamically
    def enable_resize_handler(enabled, enable_res):
        # Use nonlocal as enable_resize is defined in main's scope
        nonlocal enable_resize
        new_state = str(enabled).lower() == 'true'
        logger.info(f"Setting remote resize enabled to: {new_state}")
        set_json_app_argument(args.json_config, "enable_resize", new_state)
        enable_resize = new_state # Update scope's variable
        if new_state:
            # Re-assign handlers if enabled
            webrtc_input.on_resize = lambda res: on_resize_handler(res, app)
            webrtc_input.on_scaling_ratio = lambda scale: on_scaling_ratio_handler(scale, app)
            if enable_res: on_resize_handler(enable_res, app) # Apply initial resize if provided
        else:
            # Remove handlers if disabled
            logger.info("Disabling remote resize handlers.")
            webrtc_input.on_resize = lambda res: logger.warning(f"remote resize is disabled, skipping resize to {res}")
            webrtc_input.on_scaling_ratio = lambda scale: logger.warning(f"remote resize is disabled, skipping DPI scale change to {scale}")
    webrtc_input.on_set_enable_resize = enable_resize_handler

    # Callbacks for receiving client-side metrics
    webrtc_input.on_client_fps = lambda fps: metrics.set_fps(fps)
    webrtc_input.on_client_latency = lambda latency_ms: metrics.set_latency(latency_ms)
    webrtc_input.on_client_webrtc_stats = lambda type, stats: metrics.set_webrtc_stats(type, stats)

    # --- Setup Monitors (GPU, System) ---
    gpu_mon = None
    system_mon = None
    if args.mode == 'webrtc': # Monitors primarily send stats via WebRTC data channel
        # GPU Monitor (only if NVENC encoder is likely used)
        gpu_mon = GPUMonitor(enabled=args.encoder.startswith("nv"))
        def on_gpu_stats(load, memory_total, memory_used):
            if hasattr(app, 'send_gpu_stats'): app.send_gpu_stats(load, memory_total, memory_used) # Send via data channel
            metrics.set_gpu_utilization(load * 100) # Update Prometheus metrics
        gpu_mon.on_stats = on_gpu_stats

        # System Monitor (CPU/Mem)
        system_mon = SystemMonitor()
        def on_sysmon_timer(t):
            # Send system stats and initiate ping via data channel
            webrtc_input.ping_start = t
            if hasattr(app, 'send_system_stats'): app.send_system_stats(system_mon.cpu_percent, system_mon.mem_total, system_mon.mem_used)
            if hasattr(app, 'send_ping'): app.send_ping(t)
        system_mon.on_timer = on_sysmon_timer

    # --- Setup Signaling Server ---
    # Configure the signaling server instance
    options = argparse.Namespace(
        addr=args.addr, port=int(args.port), enable_basic_auth=using_basic_auth,
        basic_auth_user=args.basic_auth_user, basic_auth_password=args.basic_auth_password,
        enable_https=using_https, https_cert=args.https_cert, https_key=args.https_key,
        health="/health", web_root=os.path.abspath(args.web_root), keepalive_timeout=30,
        cert_restart=False, # Certificate restart logic is currently disabled
        rtc_config_file=args.rtc_config_json, rtc_config=rtc_config, # Pass initial RTC config
        turn_shared_secret=args.turn_shared_secret if using_hmac_turn else "", # Pass secret only if HMAC is used
        turn_host=args.turn_host if using_hmac_turn else "",
        turn_port=int(args.turn_port) if using_hmac_turn and args.turn_port else 0, # Ensure int if present
        turn_protocol=turn_protocol, turn_tls=using_turn_tls,
        turn_auth_header_name=args.turn_rest_username_auth_header,
        stun_host=args.stun_host, stun_port=int(args.stun_port)
    )
    server = WebRTCSimpleServer(options)

    # --- Setup RTC Monitors (File, REST, HMAC) ---
    # Monitors that dynamically update the RTC config
    hmac_turn_mon = None
    turn_rest_mon = None
    rtc_file_mon = None
    if args.mode == 'webrtc':
        # Define handler for when a monitor detects an RTC config change
        def mon_rtc_config(new_stun_servers, new_turn_servers, new_rtc_config):
            logger.info("RTC config updated by monitor. Applying changes.")
            # Update running GStreamer pipelines
            if app and hasattr(app, 'webrtcbin') and hasattr(app, 'update_rtc_config'): app.update_rtc_config(new_stun_servers, new_turn_servers)
            if audio_app and hasattr(audio_app, 'webrtcbin') and hasattr(audio_app, 'update_rtc_config'): audio_app.update_rtc_config(new_stun_servers, new_turn_servers)
            # Update config served by the signaling server's /turn endpoint
            server.set_rtc_config(new_rtc_config)

        # Initialize monitors based on which RTC config source was chosen
        hmac_turn_mon = HMACRTCMonitor(
            args.turn_host, int(args.turn_port) if args.turn_port else 0, args.turn_shared_secret, turn_rest_username,
            turn_protocol=turn_protocol, turn_tls=using_turn_tls, stun_host=args.stun_host,
            stun_port=args.stun_port, period=60, enabled=using_hmac_turn
        )
        hmac_turn_mon.on_rtc_config = mon_rtc_config
        turn_rest_mon = RESTRTCMonitor(
            args.turn_rest_uri, turn_rest_username, args.turn_rest_username_auth_header,
            turn_protocol=turn_protocol, turn_rest_protocol_header=args.turn_rest_protocol_header,
            turn_tls=using_turn_tls, turn_rest_tls_header=args.turn_rest_tls_header,
            period=60, enabled=using_turn_rest
        )
        turn_rest_mon.on_rtc_config = mon_rtc_config
        rtc_file_mon = RTCConfigFileMonitor(rtc_file=args.rtc_config_json, enabled=using_rtc_config_json)
        rtc_file_mon.on_rtc_config = mon_rtc_config

    # --- Main Execution Logic ---
    # Initialize task variables
    server_task = None
    data_websocket_server_task = None
    metrics_http_task = None
    webrtc_input_connect_task = None
    clipboard_monitor_task = None
    cursor_monitor_task = None
    signaling_task = None
    audio_signaling_task = None
    rtc_monitor_tasks = []
    webrtc_monitor_tasks = []
    gst_bus_tasks = []

    try:
        # Start Core Servers (Essential for both modes)
        logger.info("Starting Signaling/Web server...")
        server_task = asyncio.create_task(server.run())
        logger.info("Starting Data WebSocket server...")
        data_websocket_server_task = asyncio.create_task(data_websocket_server.run_server())

        # Start Metrics HTTP Server (If enabled)
        if using_metrics_http and metrics.port > 0:
            logger.info(f"Starting Prometheus metrics HTTP server on port {metrics.port}...")
            metrics_http_task = asyncio.create_task(metrics.start_http())

        # Start Input Handling Components (Essential for both modes)
        logger.info("Connecting WebRTCInput components...")
        webrtc_input_connect_task = asyncio.create_task(webrtc_input.connect())
        logger.info("Starting clipboard monitor...")
        clipboard_monitor_task = asyncio.create_task(webrtc_input.start_clipboard())
        logger.info("Starting cursor monitor...")
        cursor_monitor_task = asyncio.create_task(webrtc_input.start_cursor_monitor())

        # Start GStreamer Bus Handlers (Essential if apps exist)
        logger.info("Starting GStreamer bus handlers...")
        if app and hasattr(app, 'handle_bus_calls'): gst_bus_tasks.append(asyncio.create_task(app.handle_bus_calls()))
        if audio_app and hasattr(audio_app, 'handle_bus_calls'): gst_bus_tasks.append(asyncio.create_task(audio_app.handle_bus_calls()))

        # --- Mode-Specific Task Starting and Waiting ---
        if args.mode == 'webrtc':
            # Start WebRTC Specific Monitors
            logger.info("Starting WebRTC monitors (RTC config, GPU, System)...")
            if hmac_turn_mon and hmac_turn_mon.enabled: rtc_monitor_tasks.append(asyncio.create_task(hmac_turn_mon.start()))
            if turn_rest_mon and turn_rest_mon.enabled: rtc_monitor_tasks.append(asyncio.create_task(turn_rest_mon.start()))
            if rtc_file_mon and rtc_file_mon.enabled: rtc_monitor_tasks.append(asyncio.create_task(rtc_file_mon.start()))
            if gpu_mon and gpu_mon.enabled: webrtc_monitor_tasks.append(asyncio.create_task(gpu_mon.start(int(args.gpu_id))))
            if system_mon and system_mon.enabled: webrtc_monitor_tasks.append(asyncio.create_task(system_mon.start()))

            # Start Signaling Client Loop
            logger.info("Connecting and starting WebRTC signaling client loops...")
            await signalling.connect()
            signaling_task = asyncio.create_task(signalling.start())
            if audio_signalling:
                await audio_signalling.connect()
                audio_signaling_task = asyncio.create_task(audio_signalling.start())

            # Define essential tasks to wait for in WebRTC mode
            # The application should run as long as the servers and signaling loops are active
            essential_webrtc_tasks = [server_task, data_websocket_server_task, signaling_task]
            if audio_signaling_task: essential_webrtc_tasks.append(audio_signaling_task)

            logger.info("WebRTC mode: Waiting for essential server/signaling tasks to complete...")
            # Wait for the first essential task to complete (which indicates an error or shutdown)
            done, pending = await asyncio.wait(essential_webrtc_tasks, return_when=asyncio.FIRST_COMPLETED)

        elif args.mode == 'websockets':
             logger.info("Websockets mode: Waiting for essential server tasks to complete...")
             # In websockets mode, only the servers need to keep running indefinitely
             # The ws_handler manages pipelines and other resources per connection
             essential_websocket_tasks = [server_task, data_websocket_server_task]
             # Wait for the first essential server task to complete
             done, pending = await asyncio.wait(essential_websocket_tasks, return_when=asyncio.FIRST_COMPLETED)

        # Log which task finished causing the main loop to exit
        for task in done:
            try:
                 task_name = task.get_name() if hasattr(task, 'get_name') else repr(task)
                 logger.warning(f"Essential task {task_name} finished unexpectedly, triggering cleanup.")
                 # Log exception if the task finished with one
                 if task.exception():
                      logger.error(f"Task {task_name} raised an exception:", exc_info=task.exception())
            except asyncio.CancelledError:
                 logger.info(f"Essential task {task_name} was cancelled.")
            except Exception as e:
                 logger.error(f"Error inspecting completed task {repr(task)}: {e}")


    except asyncio.CancelledError:
        logger.info("Main loop cancelled.")
    except Exception as e:
        logger.critical("Caught unhandled exception in main: %s", e, exc_info=True)
        # Let finally block handle cleanup
    finally:
        logger.info("Main loop ending or interrupted, performing cleanup...")

        # --- Cleanup Logic ---
        # Gracefully stop all running tasks and components
        tasks_to_cancel = []
        # Collect all potentially running tasks
        all_tasks = [
            server_task, data_websocket_server_task, metrics_http_task,
            webrtc_input_connect_task, clipboard_monitor_task, cursor_monitor_task,
            signaling_task, audio_signaling_task
        ] + rtc_monitor_tasks + webrtc_monitor_tasks + gst_bus_tasks

        # Identify tasks that are still running and need cancellation
        for task in all_tasks:
            if task and not task.done():
                tasks_to_cancel.append(task)

        # Cancel running tasks concurrently
        if tasks_to_cancel:
            logger.info(f"Cancelling {len(tasks_to_cancel)} running tasks...")
            for task in tasks_to_cancel:
                task.cancel()
            # Wait for cancellation to complete (suppress CancelledError from gather)
            await asyncio.gather(*tasks_to_cancel, return_exceptions=True)
            logger.info("Task cancellation complete.")

        # Stop Monitors (WebRTC mode)
        if args.mode == 'webrtc':
             logger.info("Stopping WebRTC monitors...")
             if gpu_mon and hasattr(gpu_mon, 'stop'): gpu_mon.stop()
             if system_mon and hasattr(system_mon, 'stop'): system_mon.stop()
             # RTC monitors have async stop methods
             if hmac_turn_mon: await hmac_turn_mon.stop()
             if turn_rest_mon: await turn_rest_mon.stop()
             if rtc_file_mon: await rtc_file_mon.stop()

        # Stop Signaling Clients (WebRTC mode)
        logger.info("Stopping signaling clients...")
        if signalling: await signalling.stop()
        if audio_signalling: await audio_signalling.stop()

        # Stop GStreamer Pipelines (Both modes)
        if app:
            logger.info("Stopping main app pipeline...")
            stop_method = None
            # Use appropriate stop method based on mode
            if args.mode == 'websockets':
                 # Prefer specific websocket stop methods if they exist
                 # Check for JPEG first if that's the active encoder
                 if app.encoder == 'jpeg' and hasattr(data_websocket_server, '_stop_jpeg_pipeline'):
                     # JPEG stop is handled by data_websocket_server.stop()
                     pass
                 elif hasattr(app, 'stop_websocket_video_pipeline'):
                      stop_method = app.stop_websocket_video_pipeline
                 # Check audio separately
                 if hasattr(app, 'stop_websocket_audio_pipeline'):
                     try:
                         await app.stop_websocket_audio_pipeline()
                     except Exception as e: logger.error(f"Error stopping WS audio pipeline: {e}", exc_info=True)

            # Fallback to generic stop_pipeline if mode-specific not found or in webrtc mode
            if not stop_method and hasattr(app, 'stop_pipeline'): stop_method = app.stop_pipeline

            if stop_method:
                try:
                    # Await if the stop method is async
                    if asyncio.iscoroutinefunction(stop_method): await stop_method()
                    else: stop_method()
                except Exception as e: logger.error(f"Error stopping main app pipeline: {e}", exc_info=True)
            # else: logger.warning("Could not find a suitable stop method for the main app.") # Reduce noise

        if audio_app: # Only exists in webrtc mode
            logger.info("Stopping audio app pipeline...")
            if hasattr(audio_app, 'stop_pipeline'):
                try:
                    if asyncio.iscoroutinefunction(audio_app.stop_pipeline): await audio_app.stop_pipeline()
                    else: audio_app.stop_pipeline()
                except Exception as e: logger.error(f"Error stopping audio app pipeline: {e}", exc_info=True)
            else: logger.warning("audio_app instance has no stop_pipeline method.")

        # Stop WebRTCInput components (Both modes)
        if webrtc_input:
            logger.info("Stopping WebRTCInput components...")
            # Stop background monitors/servers managed by input handler
            if hasattr(webrtc_input, 'stop_clipboard'): webrtc_input.stop_clipboard()
            if hasattr(webrtc_input, 'stop_cursor_monitor'): webrtc_input.stop_cursor_monitor()
            if hasattr(webrtc_input, 'stop_js_server') and asyncio.iscoroutinefunction(webrtc_input.stop_js_server):
                 try: await webrtc_input.stop_js_server()
                 except Exception as e: logger.error(f"Error stopping js_server: {e}")
            # Disconnect any remaining connections
            if hasattr(webrtc_input, 'disconnect') and asyncio.iscoroutinefunction(webrtc_input.disconnect):
                 try: await webrtc_input.disconnect()
                 except Exception as e: logger.error(f"Error disconnecting webrtc_input: {e}")
            logger.info("WebRTCInput components stopped.")

        # Stop Servers (Both modes - stop these last)
        # Data server stop will handle stopping JPEG capture if active
        logger.info("Stopping main servers...")
        if data_websocket_server: await data_websocket_server.stop()
        if server: await server.stop()
        logger.info("Servers stopped.")

        # Stop Metrics HTTP server if running
        if metrics_http_task and not metrics_http_task.done(): # Should have been cancelled already
             if hasattr(metrics, 'stop_http') and asyncio.iscoroutinefunction(metrics.stop_http):
                 try: await metrics.stop_http()
                 except Exception as e: logger.error(f"Error stopping metrics http server: {e}")

        logger.info("Cleanup complete.")


def entrypoint():
    """Application entrypoint to run the main async function and handle exits."""
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Asyncio event loop stopped by KeyboardInterrupt.")
    except SystemExit as e:
        logger.info(f"Caught SystemExit({e.code}).")
        sys.exit(e.code) # Propagate exit code
    except Exception as e:
        # Log critical errors from main that weren't handled in its own try/except
        logger.critical("Entrypoint caught unhandled critical exception: %s", e, exc_info=True)
        sys.exit(1) # Exit with error code


if __name__ == "__main__":
    entrypoint()

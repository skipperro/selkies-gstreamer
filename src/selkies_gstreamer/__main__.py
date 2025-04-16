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
data_logger = logging.getLogger("data_websocket")

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

from system_metrics import Metrics, GPUMonitor, SystemMonitor, FPS_HIST_BUCKETS
from input_handler import WebRTCInput, SelkiesGamepad, GamepadMapper, get_btn_event, get_axis_event, detect_gamepad_config, get_num_btns_for_mapping, get_num_axes_for_mapping, normalize_axis_val, normalize_trigger_val, ABS_MIN, ABS_MAX, STANDARD_XPAD_CONFIG, XPAD_CONFIG_MAP, logger_selkies_gamepad
from gstreamer_pipeline import GSTWebRTCApp, GSTWebRTCAppError, fit_res, get_new_res, resize_display, generate_xrandr_gtf_modeline, set_dpi, set_cursor_size

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


class HMACRTCMonitor:
    def __init__(self, turn_host, turn_port, turn_shared_secret, turn_username, turn_protocol='udp', turn_tls=False, stun_host=None, stun_port=None, period=60, enabled=True):
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

        self.on_rtc_config = lambda stun_servers, turn_servers, rtc_config: logger.warning("unhandled on_rtc_config")

    async def start(self):
        if self.enabled:
            self.running = True
            while self.running:
                if self.enabled and int(time.time()) % self.period == 0:
                    try:
                        hmac_data = await asyncio.to_thread(generate_rtc_config, self.turn_host, self.turn_port, self.turn_shared_secret, self.turn_username, self.turn_protocol, self.turn_tls, self.stun_host, self.stun_port)
                        stun_servers, turn_servers, rtc_config = await asyncio.to_thread(parse_rtc_config, hmac_data)
                        await asyncio.to_thread(self.on_rtc_config, stun_servers, turn_servers, rtc_config)
                    except Exception as e:
                        logger.warning("could not fetch TURN HMAC config in periodic monitor: {}".format(e))
                await asyncio.sleep(0.5)
            logger.info("HMAC RTC monitor stopped")

    async def stop(self):
        self.running = False
class RESTRTCMonitor:
    def __init__(self, turn_rest_uri, turn_rest_username, turn_rest_username_auth_header, turn_protocol='udp', turn_rest_protocol_header='x-turn-protocol', turn_tls=False, turn_rest_tls_header='x-turn-tls', period=60, enabled=True):
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

        self.on_rtc_config = lambda stun_servers, turn_servers, rtc_config: logger.warning("unhandled on_rtc_config")

    async def start(self):
        if self.enabled:
            self.running = True
            while self.running:
                if self.enabled and int(time.time()) % self.period == 0:
                    try:
                        stun_servers, turn_servers, rtc_config = await asyncio.to_thread(fetch_turn_rest, self.turn_rest_uri, self.turn_rest_username, self.turn_rest_username_auth_header, self.turn_protocol, self.turn_rest_protocol_header, self.turn_tls, self.turn_rest_tls_header)
                        await asyncio.to_thread(self.on_rtc_config, stun_servers, turn_servers, rtc_config)
                    except Exception as e:
                        logger.warning("could not fetch TURN REST config in periodic monitor: {}".format(e))
                await asyncio.sleep(0.5)
            logger.info("TURN REST RTC monitor stopped")

    async def stop(self):
        self.running = False
class RTCConfigFileMonitor:
    def __init__(self, rtc_file, enabled=True):
        self.enabled = enabled
        self.running = False
        self.rtc_file = rtc_file

        self.on_rtc_config = lambda stun_servers, turn_servers, rtc_config: logger.warning("unhandled on_rtc_config")

        self.observer = Observer()
        self.file_event_handler = FileSystemEventHandler()
        self.file_event_handler.on_closed = self.event_handler
        self.observer.schedule(self.file_event_handler, self.rtc_file, recursive=False)

    def event_handler(self, event):
        if type(event) is FileClosedEvent:
            print("Detected RTC JSON file change: {}".format(event.src_path))
            try:
                with open(self.rtc_file, 'rb') as f:
                    data = f.read()
                    stun_servers, turn_servers, rtc_config = parse_rtc_config(data)
                    self.on_rtc_config(stun_servers, turn_servers, rtc_config)
            except Exception as e:
                logger.warning("could not read RTC JSON file: {}: {}".format(self.rtc_file, e))

    async def start(self):
        if self.enabled:
            await asyncio.to_thread(self.observer.start)
            self.running = True

    async def stop(self):
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
    logger.info("Waiting for streaming app ready")
    logging.debug("app_wait_ready=%s, ready_file=%s" % (app_wait_ready, ready_file))
    while app_wait_ready and not os.path.exists(ready_file):
        await asyncio.sleep(0.2)
def set_json_app_argument(config_path, key, value):
    if not os.path.exists(config_path):
        with open(config_path, "w") as f:
            json.dump({}, f)
    with open(config_path, "r") as f:
        json_data = json.load(f)
    json_data[key] = value
    with open(config_path, "w") as f:
        json.dump(json_data, f)
    return True


class DataStreamingServer:
    def __init__(self, port, mode, app, uinput_mouse_socket, js_socket_path, enable_clipboard, enable_cursors, cursor_size, cursor_scale, cursor_debug):
        self.port = port
        self.mode = mode
        self.server = None
        self.stop_server = None
        self.data_ws = None
        self.app = app
        self.uinput_mouse_socket = uinput_mouse_socket
        self.js_socket_path = js_socket_path
        self.enable_clipboard = enable_clipboard
        self.enable_cursors = enable_cursors
        self.cursor_size = cursor_size
        self.cursor_scale = cursor_scale
        self.cursor_debug = cursor_debug

    async def ws_handler(self, websocket):
        raddr = websocket.remote_address
        data_logger.info(f"Data WebSocket connected from {raddr}")
        mode_message = f"MODE {self.mode}"
        await websocket.send(mode_message)
        self.data_ws = websocket

        if self.mode == "websockets":
            if self.app.pipeline_running:
                await self.app.stop_ws_pipeline()
            self.app.start_ws_pipeline()
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
            await self.webrtc_input.connect()

        else:
            self.webrtc_input = None

        try:
            async for message in websocket:
                if self.mode == "websockets" and self.webrtc_input:
                    if message.startswith("r,"):
                        res = message[2:]
                        on_resize_handler(res, self.app)
                    elif message.startswith("s,"):
                        scale = message[2:]
                        try:
                            scale = float(scale)
                            on_scaling_ratio_handler(scale, self.app)
                        except ValueError:
                            logger.error(f"Invalid scale value received: {scale}")
                    else:
                        await self.webrtc_input.on_message(message)
        except websockets.exceptions.ConnectionClosed:
            data_logger.info(f"Data WebSocket disconnected from {raddr}")
        finally:
            if self.mode == "websockets":
                await self.app.stop_ws_pipeline()
            if self.webrtc_input:
                await self.webrtc_input.disconnect()
                self.webrtc_input = None
            self.data_ws = None

    async def run_server(self):
        self.stop_server = asyncio.Future()
        async with websockets.asyncio.server.serve(
            self.ws_handler, '0.0.0.0', self.port, compression=None
        ) as self.server:
            data_logger.info(f"Data WebSocket Server listening on port {self.port}")
            await self.stop_server

    async def stop(self):
        data_logger.info("Stopping Data WebSocket Server...")
        if self.stop_server is not None:
            self.stop_server.set_result(True)
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        data_logger.info("Data WebSocket Server Stopped.")

class WebRTCSimpleServer(object):
    def __init__(self, options):
        self.peers = dict()
        self.sessions = dict()
        self.rooms = dict()
        self.server = None
        self.stop_server = None
        self.addr = options.addr
        self.port = options.port
        self.keepalive_timeout = options.keepalive_timeout
        self.cert_restart = options.cert_restart
        self.enable_https = options.enable_https
        self.https_cert = options.https_cert
        self.https_key = options.https_key
        self.health_path = options.health
        self.web_root = options.web_root
        self.cert_mtime = -1
        self.cache_ttl = 300
        self.http_cache = {}
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
        self.rtc_config = options.rtc_config
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
        self.rtc_config = rtc_config
    def read_file(self, path):
        with open(path, "rb") as f:
            return f.read()
    async def cache_file(self, full_path):
        data, cached_at = self.http_cache.get(full_path, (None, None))
        now = time.time()
        if data is None or now - cached_at >= self.cache_ttl:
            data = await asyncio.to_thread(self.read_file, full_path)
            self.http_cache[full_path] = (data, now)
        return data
    def http_response(self, status, response_headers, body):
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
        for key, value in response_headers.raw_items():
            if headers.get(key) is not None:
                del headers[key]
            headers[key] = value
        return websockets.http11.Response(status.value, status.phrase, headers, body)
    async def process_request(self, server_root, connection, request):
        path = request.path
        request_headers = request.headers
        response_headers = websockets.datastructures.Headers()
        username = ""
        if self.enable_basic_auth:
            if "basic" in request_headers.get("authorization", "").lower():
                (
                    decoded_username,
                    decoded_password,
                ) = websockets.headers.parse_authorization_basic(
                    request_headers.get("authorization")
                )
                if not (
                    decoded_username == self.basic_auth_user
                    and decoded_password == self.basic_auth_password
                ):
                    return self.http_response(
                        http.HTTPStatus.UNAUTHORIZED, response_headers, b"Unauthorized"
                    )
            else:
                response_headers[
                    "WWW-Authenticate"
                ] = 'Basic realm="restricted, charset="UTF-8"'
                return self.http_response(
                    http.HTTPStatus.UNAUTHORIZED,
                    response_headers,
                    b"Authorization required",
                )
        if path == "/websocket":
            return None
        if (
            path == "/ws/"
            or path == "/ws"
            or path.endswith("/signalling/")
            or path.endswith("/signalling")
        ):
            return None
        if path == self.health_path + "/" or path == self.health_path:
            return self.http_response(http.HTTPStatus.OK, response_headers, b"OK\n")
        if path == "/turn/" or path == "/turn":
            if self.turn_shared_secret:
                if not username:
                    username = request_headers.get(
                        self.turn_auth_header_name, "username"
                    )
                    if not username:
                        web_logger.warning(
                            "HTTP GET {} 401 Unauthorized - missing auth header: {}".format(
                                path, self.turn_auth_header_name
                            )
                        )
                        return self.http_response(
                            http.HTTPStatus.UNAUTHORIZED,
                            response_headers,
                            b"401 Unauthorized - missing auth header",
                        )
                web_logger.info(
                    "Generating HMAC cargparseargparseredential for user: {}".format(username)
                )
                rtc_config = generate_rtc_config(
                    self.turn_host,
                    self.turn_port,
                    self.turn_shared_secret,
                    username,
                    self.turn_protocol,
                    self.turn_tls,
                    self.stun_host,
                    self.stun_port,
                )
                return self.http_response(
                    http.HTTPStatus.OK, response_headers, str.encode(rtc_config)
                )
            elif self.rtc_config:
                data = self.rtc_config
                if type(data) == str:
                    data = str.encode(data)
                response_headers["Content-Type"] = "application/json"
                return self.http_response(http.HTTPStatus.OK, response_headers, data)
            else:
                web_logger.warning(
                    "HTTP GET {} 404 NOT FOUND - Missing RTC config".format(path)
                )
                return self.http_response(
                    http.HTTPStatus.NOT_FOUND, response_headers, b"404 NOT FOUND"
                )
        path = path.split("?")[0]
        if path == "/":
            path = "/index.html"
        full_path = os.path.realpath(os.path.join(server_root, path[1:]))
        if (
            os.path.commonpath((server_root, full_path)) != server_root
            or not os.path.exists(full_path)
            or not os.path.isfile(full_path)
        ):
            response_headers["Content-Type"] = "text/html"
            web_logger.info("HTTP GET {} 404 NOT FOUND".format(path))
            return self.http_response(
                http.HTTPStatus.NOT_FOUND, response_headers, b"404 NOT FOUND"
            )
        extension = full_path.split(".")[-1]
        mime_type = MIME_TYPES.get(extension, "application/octet-stream")
        response_headers["Content-Type"] = mime_type
        body = await self.cache_file(full_path)
        response_headers["Content-Length"] = str(len(body))
        web_logger.info("HTTP GET {} 200 OK".format(path))
        return self.http_response(http.HTTPStatus.OK, response_headers, body)
    async def recv_msg_ping(self, ws, raddr):
        msg = None
        while msg is None:
            try:
                msg = await asyncio.wait_for(ws.recv(), self.keepalive_timeout)
            except (asyncio.TimeoutError, concurrent.futures._base.TimeoutError):
                web_logger.info("Sending keepalive ping to {!r} in recv".format(raddr))
                await ws.ping()
        return msg
    async def cleanup_session(self, uid):
        if uid in self.sessions:
            other_id = self.sessions[uid]
            del self.sessions[uid]
            logger_signaling.info("Cleaned up {} session".format(uid))
            if other_id in self.sessions:
                del self.sessions[other_id]
                logger_signaling.info("Also cleaned up {} session".format(other_id))
                if other_id in self.peers:
                    logger_signaling.info("Closing connection to {}".format(other_id))
                    wso, oaddr, _, _ = self.peers[other_id]
                    del self.peers[other_id]
                    await wso.close()
    async def cleanup_room(self, uid, room_id):
        room_peers = self.rooms[room_id]
        if uid not in room_peers:
            return
        room_peers.remove(uid)
        for pid in room_peers:
            wsp, paddr, _, _ = self.peers[pid]
            msg = "ROOM_PEER_LEFT {}".format(uid)
            logger_signaling.info(
                "room {}: {} -> {}: {}".format(room_id, uid, pid, msg)
            )
            await wsp.send(msg)
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
        raddr = ws.remote_address
        peer_status = None
        self.peers[uid] = [ws, raddr, peer_status, meta]
        logger_signaling.info(
            "Registered peer {!r} at {!r} with meta: {}".format(uid, raddr, meta)
        )
        while True:
            msg = await self.recv_msg_ping(ws, raddr)
            peer_status = self.peers[uid][2]
            if peer_status is not None:
                if peer_status == "session":
                    other_id = self.sessions[uid]
                    wso, oaddr, status, _ = self.peers[other_id]
                    assert status == "session"
                    logger_signaling.info("{} -> {}: {}".format(uid, other_id, msg))
                    await wso.send(msg)
                elif peer_status:
                    if msg.startswith("ROOM_PEER_MSG"):
                        _, other_id, msg = msg.split(maxsplit=2)
                        if other_id not in self.peers:
                            await ws.send(
                                "ERROR peer {!r} not found" "".format(other_id)
                            )
                            continue
                        wso, oaddr, status, _ = self.peers[other_id]
                        if status != room_id:
                            await ws.send(
                                "ERROR peer {!r} is not in the room" "".format(other_id)
                            )
                            continue
                        msg = "ROOM_PEER_MSG {} {}".format(uid, msg)
                        logger_signaling.info(
                            "room {}: {} -> {}: {}".format(room_id, uid, other_id, msg)
                        )
                        await wso.send(msg)
                    else:
                        await ws.send("ERROR invalid msg, already in room")
                        continue
                else:
                    raise AssertionError("Unknown peer status {!r}".format(peer_status))
            elif msg.startswith("SESSION"):
                _, callee_id = msg.split(maxsplit=1)
                if callee_id not in self.peers:
                    await ws.send("ERROR peer {!r} not found".format(callee_id))
                    continue
                if peer_status is not None:
                    await ws.send("ERROR peer {!r} busy".format(callee_id))
                    continue
                meta = self.peers[callee_id][3]
                if meta:
                    meta64 = base64.b64encode(bytes(json.dumps(meta).encode())).decode(
                        "ascii"
                    )
                else:
                    meta64 = ""
                await ws.send("SESSION_OK {}".format(meta64))
                wsc = self.peers[callee_id][0]
                logger_signaling.info(
                    "Session from {!r} ({!r}) to {!r} ({!r})"
                    "".format(uid, raddr, callee_id, wsc.remote_address)
                )
                self.peers[uid][2] = peer_status = "session"
                self.sessions[uid] = callee_id
                self.peers[callee_id][2] = "session"
                self.sessions[callee_id] = uid
            elif msg.startswith("ROOM"):
                logger_signaling.info("{!r} command {!r}".format(uid, msg))
                _, room_id = msg.split(maxsplit=1)
                if room_id == "session" or room_id.split() != [room_id]:
                    await ws.send("ERROR invalid room id {!r}".format(room_id))
                    continue
                if room_id in self.rooms:
                    if uid in self.rooms[room_id]:
                        raise AssertionError(
                            "How did we accept a ROOM command "
                            "despite already being in a room?"
                        )
                else:
                    self.rooms[room_id] = set()
                room_peers = " ".join([pid for pid in self.rooms[room_id]])
                await ws.send("ROOM_OK {}".format(room_peers))
                self.peers[uid][2] = peer_status = room_id
                self.rooms[room_id].add(uid)
                for pid in self.rooms[room_id]:
                    if pid == uid:
                        continue
                    wsp, paddr, _, _ = self.peers[pid]
                    msg = "ROOM_PEER_JOINED {}".format(uid)
                    logger_signaling.info(
                        "room {}: {} -> {}: {}".format(room_id, uid, pid, msg)
                    )
                    await wsp.send(msg)
            else:
                logger_signaling.info(
                    "Ignoring unknown message {!r} from {!r}".format(msg, uid)
                )
    async def hello_peer(self, ws):
        raddr = ws.remote_address
        hello = await ws.recv()
        toks = hello.split(maxsplit=2)
        metab64str = None
        if len(toks) > 2:
            hello, uid, metab64str = toks
        else:
            hello, uid = toks
        if hello != "HELLO":
            await ws.close(code=1002, reason="invalid protocol")
            raise Exception("Invalid hello from {!r}".format(raddr))
        if not uid or uid in self.peers or uid.split() != [uid]:
            await ws.close(code=1002, reason="invalid peer uid")
            raise Exception("Invalid uid {!r} from {!r}".format(uid, raddr))
        meta = None
        if metab64str:
            meta = json.loads(base64.b64decode(metab64str))
        await ws.send("HELLO")
        return uid, meta
    def get_https_certs(self):
        cert_pem = (
            os.path.abspath(self.https_cert)
            if os.path.isfile(self.https_cert)
            else None
        )
        key_pem = (
            os.path.abspath(self.https_key) if os.path.isfile(self.https_key) else None
        )
        return cert_pem, key_pem
    def get_ssl_ctx(self, https_server=True):
        if not self.enable_https:
            return None
        cert_pem, key_pem = self.get_https_certs()
        logger_signaling.info(
            "Using TLS with provided certificate and private key from arguments"
        )
        ssl_purpose = (
            ssl.Purpose.CLIENT_AUTH if https_server else ssl.Purpose.SERVER_AUTH
        )
        sslctx = ssl.create_default_context(purpose=ssl_purpose)
        sslctx.check_hostname = False
        sslctx.verify_mode = ssl.CERT_NONE
        try:
            sslctx.load_cert_chain(cert_pem, keyfile=key_pem)
        except Exception:
            logger_signaling.error(
                "Certificate or private key file not found or incorrect. To use a self-signed certificate, install the package 'ssl-cert' and add the group 'ssl-cert' to your user in Debian-based distributions or generate a new certificate with root using 'openssl req -x509 -newkey rsa:4096 -keyout /etc/ssl/private/ssl-cert-snakeoil.key -out /etc/ssl/certs/ssl-cert-snakeoil.pem -days 3650 -nodes -subj \"/CN=localhost\"'"
            )
            sys.exit(1)
        return sslctx
    async def run(self):
        async def handler(ws):
            raddr = ws.remote_address
            logger_signaling.info("Connected to {!r}".format(raddr))
            peer_id, meta = await self.hello_peer(ws)
            try:
                await self.connection_handler(ws, peer_id, meta)
            except websockets.exceptions.ConnectionClosed:
                logger_signaling.info(
                    "Connection to peer {!r} closed, exiting handler".format(raddr)
                )
            finally:
                await self.remove_peer(peer_id)
        await asyncio.gather(
            *[
                self.cache_file(os.path.realpath(f))
                for f in pathlib.Path(self.web_root).rglob("*.*")
            ]
        )
        sslctx = self.get_ssl_ctx(https_server=True)
        logger_signaling.setLevel(logging.INFO)
        web_logger.setLevel(logging.WARN)
        http_protocol = "https:" if self.enable_https else "http:"
        logger_signaling.info(
            "Listening on {}//{}:{}".format(http_protocol, self.addr, self.port)
        )
        http_handler = functools.partial(self.process_request, self.web_root)
        self.stop_server = asyncio.Future()
        async with websockets.asyncio.server.serve(
            handler,
            self.addr,
            self.port,
            ssl=sslctx,
            process_request=http_handler,
            max_queue=16,
        ) as self.server:
            await self.stop_server
        if self.enable_https:
            asyncio.create_task(self.check_server_needs_restart())
    async def stop(self):
        logger_signaling.info("Stopping server... ")
        if self.stop_server is not None:
            self.stop_server.set_result(True)
        self.server.close()
        await self.server.wait_closed()
        logger_signaling.info("Stopped.")
    def check_cert_changed(self):
        cert_pem, key_pem = self.get_https_certs()
        mtime = max(os.stat(key_pem).st_mtime, os.stat(cert_pem).st_mtime)
        if self.cert_mtime < 0:
            self.cert_mtime = mtime
            return False
        if mtime > self.cert_mtime:
            self.cert_mtime = mtime
            return True
        return False
    async def check_server_needs_restart(self):
        while self.cert_restart:
            await asyncio.sleep(1.0)
            if self.check_cert_changed():
                logger_signaling.info("Certificate changed, stopping server...")
                await self.stop()
                return

class WebRTCSignallingError(Exception):
    pass
class WebRTCSignallingErrorNoPeer(Exception):
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
        self.on_ice = lambda mlineindex, candidate: logger_webrtc_signalling.warning(
            "unhandled ice event"
        )
        self.on_sdp = lambda sdp_type, sdp: logger_webrtc_signalling.warning(
            "unhandled sdp event"
        )
        self.on_connect = lambda: logger_webrtc_signalling.warning(
            "unhandled on_connect callback"
        )
        self.on_disconnect = lambda: logger_webrtc_signalling.warning(
            "unhandled on_disconnect callback"
        )
        self.on_session = lambda peer_id, meta: logger_webrtc_signalling.warning(
            "unhandled on_session callback"
        )
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
        await self.conn.close()
    async def start(self):
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
def on_resize_handler(res, current_app):
    curr_res, new_res, _, __, ___ = get_new_res(res)
    if curr_res != new_res:
        if not current_app.last_resize_success:
            logger.warning("skipping resize because last resize failed.")
            return
        logger.warning("resizing display from {} to {}".format(curr_res, new_res))
        if resize_display(res):
            current_app.send_remote_resolution(res)

def on_scaling_ratio_handler(scale, current_app):
    if scale < 0.75 or scale > 2.5:
        logger.error("requested scale ratio out of bounds: {}".format(scale))
        return
    dpi = int(96 * scale)
    logger.info("Setting DPI to: {}".format(dpi))
    if not set_dpi(dpi):
        logger.error("failed to set DPI to {}".format(dpi))
    cursor_size = int(16 * scale)
    logger.info("Setting cursor size to: {}".format(cursor_size))
    if not set_cursor_size(cursor_size):
        logger.error("failed to set cursor size to {}".format(cursor_size))
async def main():
    if "DEV_MODE" in os.environ:
        with open("../../addons/gst-web-core/selkies-version.txt", "a"):
            os.utime("../../addons/gst-web-core/selkies-version.txt", None)
    parser = argparse.ArgumentParser()
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
        "--encoder",
        default=os.environ.get("SELKIES_ENCODER", "x264enc"),
        help="GStreamer video encoder to use",
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
        "--mode",
        default=os.environ.get("SELKIES_MODE", "webrtc"),
        choices=['webrtc', 'websockets'],
        help='Mode of operation: "webrtc" for standard WebRTC, "websockets" for Websockets-based pipelines. Default: "webrtc"',
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
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()
    #args.mode = 'webrtc'
    if os.path.exists(args.json_config):
        try:
            with open(args.json_config, "r") as f:
                json_args = json.load(f)
            for k, v in json_args.items():
                if k == "framerate":
                    args.framerate = str(int(v))
                if k == "video_bitrate":
                    args.video_bitrate = str(int(v))
                if k == "audio_bitrate":
                    args.audio_bitrate = str(int(v))
                if k == "enable_resize":
                    args.enable_resize = str((str(v).lower() == "true")).lower()
                if k == "encoder":
                    args.encoder = v.lower()
        except Exception as e:
            logger.error(
                "failed to load json config from {}: {}".format(
                    args.json_config, str(e)
                )
            )
    logging.warning(args)
    if args.debug:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.INFO)
    await wait_for_app_ready(args.app_ready_file, args.app_wait_ready.lower() == "true")
    my_id = 0
    peer_id = 1
    my_audio_id = 2
    audio_peer_id = 3
    using_metrics_http = args.enable_metrics_http.lower() == "true"
    using_webrtc_csv = args.enable_webrtc_statistics.lower() == "true"
    metrics = Metrics(int(args.metrics_http_port), using_webrtc_csv)
    using_https = args.enable_https.lower() == "true"
    using_basic_auth = args.enable_basic_auth.lower() == "true"
    ws_protocol = "wss:" if using_https else "ws:"
    signalling = WebRTCSignalling(
        "%s//127.0.0.1:%s/ws" % (ws_protocol, args.port),
        my_id,
        peer_id,
        enable_https=using_https,
        enable_basic_auth=using_basic_auth,
        basic_auth_user=args.basic_auth_user,
        basic_auth_password=args.basic_auth_password,
    )
    audio_signalling = WebRTCSignalling(
        "%s//127.0.0.1:%s/ws" % (ws_protocol, args.port),
        my_audio_id,
        audio_peer_id,
        enable_https=using_https,
        enable_basic_auth=using_basic_auth,
        basic_auth_user=args.basic_auth_user,
        basic_auth_password=args.basic_auth_password,
    )
    async def on_signalling_error(e):
        if isinstance(e, WebRTCSignallingErrorNoPeer):
            await asyncio.sleep(1.0)
            await signalling.setup_call()
        else:
            logger.error("signalling error: %s", str(e))
            await app.stop_pipeline()
    async def on_audio_signalling_error(e):
        if isinstance(e, WebRTCSignallingErrorNoPeer):
            await asyncio.sleep(1.0)
            await audio_signalling.setup_call()
        else:
            logger.error("signalling error: %s", str(e))
            await audio_app.stop_pipeline()
    signalling.on_error = on_signalling_error
    audio_signalling.on_error = on_audio_signalling_error
    signalling.on_disconnect = lambda: app.stop_pipeline()
    audio_signalling.on_disconnect = lambda: audio_app.stop_pipeline()
    signalling.on_connect = signalling.setup_call
    audio_signalling.on_connect = audio_signalling.setup_call
    turn_rest_username = args.turn_rest_username.replace(":", "-")
    rtc_config = None
    turn_protocol = "tcp" if args.turn_protocol.lower() == "tcp" else "udp"
    using_turn_tls = args.turn_tls.lower() == "true"
    using_turn_rest = False
    using_hmac_turn = False
    using_rtc_config_json = False
    if args.enable_cloudflare_turn == "true":
        if args.cloudflare_turn_token_id and args.cloudflare_turn_api_token:
            try:
                json_config = fetch_cloudflare_turn(
                    args.cloudflare_turn_token_id, args.cloudflare_turn_api_token
                )
                logger.info(f"Got Cloudflare TURN config: {json_config}")
                stun_servers, turn_servers, rtc_config = parse_rtc_config(
                    json.dumps({"iceServers": [json_config["iceServers"]]})
                )
            except Exception as e:
                logger.warning(f"failed to fetch TURN config from Cloudflare: {e}")
        else:
            logger.error("missing cloudflare TURN Token ID and TURN API token")
    elif os.path.exists(args.rtc_config_json):
        logger.warning(
            "using JSON file from argument for RTC config, overrides all other STUN/TURN configuration"
        )
        with open(args.rtc_config_json, "r") as f:
            stun_servers, turn_servers, rtc_config = parse_rtc_config(f.read())
        using_rtc_config_json = True
    else:
        if args.turn_rest_uri:
            try:
                stun_servers, turn_servers, rtc_config = fetch_turn_rest(
                    args.turn_rest_uri,
                    turn_rest_username,
                    args.turn_rest_username_auth_header,
                    turn_protocol,
                    args.turn_rest_protocol_header,
                    using_turn_tls,
                    args.turn_rest_tls_header,
                )
                logger.info(
                    "using TURN REST API RTC configuration, overrides long-term username/password or short-term shared secret STUN/TURN configuration"
                )
                using_turn_rest = True
            except Exception as e:
                logger.warning(
                    "error fetching TURN REST API RTC configuration, falling back to other methods: {}".format(
                        str(e)
                    )
                )
                using_turn_rest = False
        if not using_turn_rest:
            if (args.turn_username and args.turn_password) and (
                args.turn_host and args.turn_port
            ):
                config_json = make_turn_rtc_config_json_legacy(
                    args.turn_host,
                    args.turn_port,
                    args.turn_username,
                    args.turn_password,
                    turn_protocol,
                    using_turn_tls,
                    args.stun_host,
                    args.stun_port,
                )
                stun_servers, turn_servers, rtc_config = parse_rtc_config(config_json)
                logger.info(
                    "using TURN long-term username/password credentials, prioritized over short-term shared secret configuration"
                )
            elif args.turn_shared_secret and (args.turn_host and args.turn_port):
                hmac_data = generate_rtc_config(
                    args.turn_host,
                    args.turn_port,
                    args.turn_shared_secret,
                    turn_rest_username,
                    turn_protocol,
                    using_turn_tls,
                    args.stun_host,
                    args.stun_port,
                )
                stun_servers, turn_servers, rtc_config = parse_rtc_config(hmac_data)
                logger.info("using TURN short-term shared secret HMAC credentials")
                using_hmac_turn = True
            else:
                stun_servers, turn_servers, rtc_config = parse_rtc_config(
                    DEFAULT_RTC_CONFIG
                )
                logger.warning(
                    "missing TURN server information, using DEFAULT_RTC_CONFIG"
                )
    logger.info("initial server RTC configuration fetched")
    enable_resize = args.enable_resize.lower() == "true"
    audio_channels = int(args.audio_channels)
    curr_fps = int(args.framerate)
    gpu_id = int(args.gpu_id)
    curr_video_bitrate = int(args.video_bitrate)
    curr_audio_bitrate = int(args.audio_bitrate)
    enable_cursors = args.enable_cursors.lower() == "true"
    cursor_debug = args.debug_cursors.lower() == "true"
    cursor_size = int(args.cursor_size)
    keyframe_distance = float(args.keyframe_distance)
    congestion_control = args.congestion_control.lower() == "true"
    video_packetloss_percent = float(args.video_packetloss_percent)
    audio_packetloss_percent = float(args.audio_packetloss_percent)
    event_loop = asyncio.get_running_loop()
    app = GSTWebRTCApp(
        event_loop,
        stun_servers,
        turn_servers,
        audio_channels,
        curr_fps,
        args.encoder,
        gpu_id,
        curr_video_bitrate,
        curr_audio_bitrate,
        keyframe_distance,
        congestion_control,
        video_packetloss_percent,
        audio_packetloss_percent,
        data_streaming_server=None,
        mode=args.mode # ADDED mode here
    )
    if not hasattr(GSTWebRTCApp, 'stop_ws_pipeline'):
        GSTWebRTCApp.stop_ws_pipeline = GSTWebRTCApp.stop_pipeline
    app.last_resize_success = True
    data_websocket_server = DataStreamingServer(
        int(args.data_websocket_port),
        args.mode,
        app,
        args.uinput_mouse_socket,
        args.js_socket_path,
        args.enable_clipboard.lower(),
        enable_cursors,
        cursor_size,
        1.0, # cursor_scale is hardcoded to 1.0 as before
        cursor_debug
    )
    app.data_streaming_server = data_websocket_server
    audio_app = GSTWebRTCApp(
        event_loop,
        stun_servers,
        turn_servers,
        audio_channels,
        curr_fps,
        args.encoder,
        gpu_id,
        curr_video_bitrate,
        curr_audio_bitrate,
        keyframe_distance,
        congestion_control,
        video_packetloss_percent,
        audio_packetloss_percent,
    )
    app.on_sdp = signalling.send_sdp
    audio_app.on_sdp = audio_signalling.send_sdp
    app.on_ice = signalling.send_ice
    audio_app.on_ice = audio_signalling.send_ice
    signalling.on_sdp = app.set_sdp
    audio_signalling.on_sdp = audio_app.set_sdp
    signalling.on_ice = app.set_ice
    audio_signalling.on_ice = audio_app.set_ice
    def on_session_handler(session_peer_id, meta=None):
        logger.info(
            "starting session for peer id {} with meta: {}".format(
                session_peer_id, meta
            )
        )
        if str(session_peer_id) == str(peer_id):
            if meta:
                if enable_resize:
                    if meta["res"]:
                        on_resize_handler(meta["res"], app)
                    if meta["scale"]:
                        on_scaling_ratio_handler(meta["scale"], app)
                else:
                    logger.info("setting cursor to default size")
                    set_cursor_size(16)

            current_mode = args.mode
            if current_mode == "websockets":
                app.start_ws_pipeline()
            else:
                app.start_pipeline()
        elif str(session_peer_id) == str(audio_peer_id):
            logger.info("starting audio pipeline")
            audio_app.start_pipeline(audio_only=True)
        else:
            logger.error("failed to start pipeline for peer_id: %s" % peer_id)
    signalling.on_session = on_session_handler
    audio_signalling.on_session = on_session_handler
    cursor_scale = 1.0
    webrtc_input = WebRTCInput(
        app,
        args.uinput_mouse_socket,
        args.js_socket_path,
        args.enable_clipboard.lower(),
        enable_cursors,
        cursor_size,
        cursor_scale,
        cursor_debug,
    )
    webrtc_input.on_cursor_change = webrtc_input.send_cursor_data # Changed to use send_cursor_data
    def data_channel_ready():
        logger.info("opened peer data channel for user input to X11")
        app.send_framerate(app.framerate)
        app.send_video_bitrate(app.video_bitrate)
        app.send_audio_bitrate(audio_app.audio_bitrate)
        app.send_resize_enabled(enable_resize)
        app.send_encoder(app.encoder)
        app.send_cursor_data(app.last_cursor_sent)
    app.on_data_open = lambda: data_channel_ready()
    app.on_data_message = webrtc_input.on_message
    webrtc_input.on_video_encoder_bit_rate = lambda bitrate: set_json_app_argument(
        args.json_config, "video_bitrate", bitrate
    ) and (app.set_video_bitrate(int(bitrate)))
    webrtc_input.on_audio_encoder_bit_rate = lambda bitrate: set_json_app_argument(
        args.json_config, "audio_bitrate", bitrate
    ) and audio_app.set_audio_bitrate(int(bitrate))
    webrtc_input.on_mouse_pointer_visible = lambda visible: app.set_pointer_visible(
        visible
    )
    webrtc_input.on_clipboard_read = webrtc_input.send_clipboard_data # Changed to use send_clipboard_data
    def set_fps_handler(fps):
        set_json_app_argument(args.json_config, "framerate", fps)
        app.set_framerate(fps)
    webrtc_input.on_set_fps = lambda fps: set_fps_handler(fps)

    if enable_resize:
        webrtc_input.on_resize = lambda res: on_resize_handler(res, app)
        webrtc_input.on_scaling_ratio = lambda scale: on_scaling_ratio_handler(scale, app)
    else:
        logger.info("removing handler for on_resize")
        webrtc_input.on_resize = lambda res: logger.warning(
            "remote resize is disabled, skipping resize to %s" % res
        )
        webrtc_input.on_scaling_ratio = lambda scale: logger.warning(
            "remote resize is disabled, skipping DPI scale change to %s"
            % str(scale)
        )
    webrtc_input.on_ping_response = lambda latency: app.send_latency_time(latency)
    def enable_resize_handler(enabled, enable_res):
        set_json_app_argument(args.json_config, "enable_resize", enabled)
        if enabled:
            webrtc_input.on_resize = lambda res: on_resize_handler(res, app)
            webrtc_input.on_scaling_ratio = lambda scale: on_scaling_ratio_handler(scale, app)
            on_resize_handler(enable_res, app)
        else:
            logger.info("removing handler for on_resize")
            webrtc_input.on_resize = lambda res: logger.warning(
                "remote resize is disabled, skipping resize to %s" % res
            )
            webrtc_input.on_scaling_ratio = lambda scale: logger.warning(
                "remote resize is disabled, skipping DPI scale change to %s"
                % str(scale)
            )
    webrtc_input.on_set_enable_resize = enable_resize_handler
    webrtc_input.on_client_fps = lambda fps: metrics.set_fps(fps)
    webrtc_input.on_client_latency = lambda latency_ms: metrics.set_latency(latency_ms)
    webrtc_input.on_client_webrtc_stats = (
        lambda webrtc_stat_type, webrtc_stats: metrics.set_webrtc_stats(
            webrtc_stat_type, webrtc_stats
        )
    )
    gpu_mon = GPUMonitor(enabled=args.encoder.startswith("nv"))
    def on_gpu_stats(load, memory_total, memory_used):
        app.send_gpu_stats(load, memory_total, memory_used)
        metrics.set_gpu_utilization(load * 100)
    gpu_mon.on_stats = on_gpu_stats
    system_mon = SystemMonitor()
    def on_sysmon_timer(t):
        webrtc_input.ping_start = t
        app.send_system_stats(
            system_mon.cpu_percent, system_mon.mem_total, system_mon.mem_used
        )
        app.send_ping(t)
    system_mon.on_timer = on_sysmon_timer
    options = argparse.Namespace()
    options.addr = args.addr
    options.port = args.port
    options.enable_basic_auth = using_basic_auth
    options.basic_auth_user = args.basic_auth_user
    options.basic_auth_password = args.basic_auth_password
    options.enable_https = using_https
    options.https_cert = args.https_cert
    options.https_key = args.https_key
    options.health = "/health"
    options.web_root = os.path.abspath(args.web_root)
    options.keepalive_timeout = 30
    options.cert_restart = False
    options.rtc_config_file = args.rtc_config_json
    options.rtc_config = rtc_config
    options.turn_shared_secret = args.turn_shared_secret if using_hmac_turn else ""
    options.turn_host = args.turn_host if using_hmac_turn else ""
    options.turn_port = args.turn_port if using_hmac_turn else ""
    options.turn_protocol = turn_protocol
    options.turn_tls = using_turn_tls
    options.turn_auth_header_name = args.turn_rest_username_auth_header
    options.stun_host = args.stun_host
    options.stun_port = args.stun_port
    server = WebRTCSimpleServer(options)
    def mon_rtc_config(stun_servers, turn_servers, rtc_config):
        if app.webrtcbin:
            logger.info("updating STUN server")
            app.webrtcbin.set_property("stun-server", stun_servers[0])
            for i, turn_server in enumerate(turn_servers):
                logger.info("updating TURN server")
                if i == 0:
                    app.webrtcbin.set_property("turn-server", turn_server)
                else:
                    app.webrtcbin.emit("add-turn-server", turn_server)
        server.set_rtc_config(rtc_config)
    hmac_turn_mon = HMACRTCMonitor(
        args.turn_host,
        args.turn_port,
        args.turn_shared_secret,
        turn_rest_username,
        turn_protocol=turn_protocol,
        turn_tls=using_turn_tls,
        stun_host=args.stun_host,
        stun_port=args.stun_port,
        period=60,
        enabled=using_hmac_turn,
    )
    hmac_turn_mon.on_rtc_config = mon_rtc_config
    turn_rest_mon = RESTRTCMonitor(
        args.turn_rest_uri,
        turn_rest_username,
        args.turn_rest_username_auth_header,
        turn_protocol=turn_protocol,
        turn_rest_protocol_header=args.turn_rest_protocol_header,
        turn_tls=using_turn_tls,
        turn_rest_tls_header=args.turn_rest_tls_header,
        period=60,
        enabled=using_turn_rest,
    )
    turn_rest_mon.on_rtc_config = mon_rtc_config
    rtc_file_mon = RTCConfigFileMonitor(
        rtc_file=args.rtc_config_json, enabled=using_rtc_config_json
    )
    rtc_file_mon.on_rtc_config = mon_rtc_config
    try:
        asyncio.create_task(server.run())
        asyncio.create_task(data_websocket_server.run_server())
        if using_metrics_http:
            asyncio.create_task(metrics.start_http())
        await webrtc_input.connect()
        asyncio.create_task(webrtc_input.start_clipboard())
        asyncio.create_task(webrtc_input.start_cursor_monitor())
        asyncio.create_task(gpu_mon.start(gpu_id))
        asyncio.create_task(hmac_turn_mon.start())
        asyncio.create_task(turn_rest_mon.start())
        asyncio.create_task(rtc_file_mon.start())
        asyncio.create_task(system_mon.start())
        while True:
            if using_webrtc_csv:
                metrics.initialize_webrtc_csv_file(args.webrtc_statistics_dir)
            asyncio.create_task(app.handle_bus_calls())
            asyncio.create_task(audio_app.handle_bus_calls())
            await signalling.connect()
            await audio_signalling.connect()
            asyncio.create_task(audio_signalling.start())
            await signalling.start()
            await app.stop_pipeline()
            await audio_app.stop_pipeline()
            await webrtc_input.stop_js_server()
    except Exception as e:
        logger.error("Caught exception: %s" % e)
        traceback.print_exc()
        sys.exit(1)
    finally:
        await app.stop_pipeline()
        await audio_app.stop_pipeline()
        webrtc_input.stop_clipboard()
        webrtc_input.stop_cursor_monitor()
        await webrtc_input.stop_js_server()
        await webrtc_input.disconnect()
        gpu_mon.stop()
        await hmac_turn_mon.stop()
        await turn_rest_mon.stop()
        await rtc_file_mon.stop()
        system_mon.stop()
        await server.stop()
        await data_websocket_server.stop()
        sys.exit(0)
def entrypoint():
    asyncio.run(main())
if __name__ == "__main__":
    entrypoint()

# Logging setup
import logging
LOGLEVEL = logging.INFO
logging.basicConfig(level=LOGLEVEL)
logger_selkies_gamepad = logging.getLogger("selkies_gamepad")
logger_gpu_monitor = logging.getLogger("gpu_monitor")
logger_gstwebrtc_app = logging.getLogger("gstebrtc_app")
logger_metrics = logging.getLogger("metrics")
logger_gstwebrtc_app_resize = logging.getLogger("gstwebrtc_app_resize")
logger_signaling = logging.getLogger("signaling")
logger_system_monitor = logging.getLogger("system_monitor")
logger_webrtc_input = logging.getLogger("webrtc_input")
logger_webrtc_signalling = logging.getLogger("signalling")
logger = logging.getLogger("main")
web_logger = logging.getLogger("web")

# Imports
import concurrent.futures
import psutil
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
from Xlib import display
from Xlib import X
from Xlib.ext import xfixes, xtest
from prometheus_client import Gauge, Histogram, Info, start_http_server
try:
    import gi
    gi.require_version("GLib", "2.0")
    gi.require_version("Gst", "1.0")
    gi.require_version("GstRtp", "1.0")
    gi.require_version("GstSdp", "1.0")
    gi.require_version("GstWebRTC", "1.0")
    from gi.repository import GLib, Gst, GstRtp, GstSdp, GstWebRTC
    fract = Gst.Fraction(60, 1)
    del fract
except Exception as e:
    msg = """ERROR: could not find working GStreamer-Python installation.
If GStreamer is installed at a certain location, set the path to the environment variable GSTREAMER_PATH, then make sure your environment is set correctly using the below commands (for Debian-like distributions):
export GSTREAMER_PATH="${GSTREAMER_PATH:-$(pwd)}"
export PATH="${GSTREAMER_PATH}/bin${PATH:+:${PATH}}"
export LD_LIBRARY_PATH="${GSTREAMER_PATH}/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
export GST_PLUGIN_PATH="${GSTREAMER_PATH}/lib/x86_64-linux-gnu/gstreamer-1.0${GST_PLUGIN_PATH:+:${GST_PLUGIN_PATH}}"
export GST_PLUGIN_SYSTEM_PATH="${XDG_DATA_HOME:-${HOME:-~}/.local/share}/gstreamer-1.0/plugins:/usr/lib/x86_64-linux-gnu/gstreamer-1.0${GST_PLUGIN_SYSTEM_PATH:+:${GST_PLUGIN_SYSTEM_PATH}}"
export GI_TYPELIB_PATH="${GSTREAMER_PATH}/lib/x86_64-linux-gnu/girepository-1.0:/usr/lib/x86_64-linux-gnu/girepository-1.0${GI_TYPELIB_PATH:+:${GI_TYPELIB_PATH}}"
export PYTHONPATH="${GSTREAMER_PATH}/lib/python3/dist-packages${PYTHONPATH:+:${PYTHONPATH}}"
Replace "x86_64-linux-gnu" in other architectures manually or use "$(gcc -print-multiarch)" in place.
"""
    logger_gstwebrtc_app.error(msg)
    logger_gstwebrtc_app.error(e)
    sys.exit(1)
logger_gstwebrtc_app.info("GStreamer-Python install looks OK")
import GPUtil
import pynput
from PIL import Image

# Constants
EV_SYN = 0x00
EV_KEY = 0x01
EV_REL = 0x02
EV_ABS = 0x03
EV_MSC = 0x04
EV_SW = 0x05
EV_LED = 0x11
EV_SND = 0x12
EV_REP = 0x14
EV_FF = 0x15
EV_PWR = 0x16
EV_FF_STATUS = 0x17
EV_MAX = 0x1F
EV_CNT = EV_MAX + 1
SYN_REPORT = 0
SYN_CONFIG = 1
SYN_MT_REPORT = 2
SYN_DROPPED = 3
SYN_MAX = 0xF
SYN_CNT = SYN_MAX + 1
BTN_MISC = 0x100
BTN_0 = 0x100
BTN_1 = 0x101
BTN_2 = 0x102
BTN_3 = 0x103
BTN_4 = 0x104
BTN_5 = 0x105
BTN_6 = 0x106
BTN_7 = 0x107
BTN_8 = 0x108
BTN_9 = 0x109
BTN_MOUSE = 0x110
BTN_LEFT = 0x110
BTN_RIGHT = 0x111
BTN_MIDDLE = 0x112
BTN_SIDE = 0x113
BTN_EXTRA = 0x114
BTN_FORWARD = 0x115
BTN_BACK = 0x116
BTN_TASK = 0x117
BTN_JOYSTICK = 0x120
BTN_TRIGGER = 0x120
BTN_THUMB = 0x121
BTN_THUMB2 = 0x122
BTN_TOP = 0x123
BTN_TOP2 = 0x124
BTN_PINKIE = 0x125
BTN_BASE = 0x126
BTN_BASE2 = 0x127
BTN_BASE3 = 0x128
BTN_BASE4 = 0x129
BTN_BASE5 = 0x12A
BTN_BASE6 = 0x12B
BTN_DEAD = 0x12F
BTN_GAMEPAD = 0x130
BTN_SOUTH = 0x130
BTN_A = BTN_SOUTH
BTN_EAST = 0x131
BTN_B = BTN_EAST
BTN_C = 0x132
BTN_NORTH = 0x133
BTN_X = BTN_NORTH
BTN_WEST = 0x134
BTN_Y = BTN_WEST
BTN_Z = 0x135
BTN_TL = 0x136
BTN_TR = 0x137
BTN_TL2 = 0x138
BTN_TR2 = 0x139
BTN_SELECT = 0x13A
BTN_START = 0x13B
BTN_MODE = 0x13C
BTN_THUMBL = 0x13D
BTN_THUMBR = 0x13E
ABS_X = 0x00
ABS_Y = 0x01
ABS_Z = 0x02
ABS_RX = 0x03
ABS_RY = 0x04
ABS_RZ = 0x05
ABS_THROTTLE = 0x06
ABS_RUDDER = 0x07
ABS_WHEEL = 0x08
ABS_GAS = 0x09
ABS_BRAKE = 0x0A
ABS_HAT0X = 0x10
ABS_HAT0Y = 0x11
ABS_HAT1X = 0x12
ABS_HAT1Y = 0x13
ABS_HAT2X = 0x14
ABS_HAT2Y = 0x15
ABS_HAT3X = 0x16
ABS_HAT3Y = 0x17
ABS_PRESSURE = 0x18
ABS_DISTANCE = 0x19
ABS_TILT_X = 0x1A
ABS_TILT_Y = 0x1B
ABS_TOOL_WIDTH = 0x1C
ABS_VOLUME = 0x20
ABS_PROFILE = 0x21
JS_EVENT_BUTTON = 0x01
JS_EVENT_AXIS = 0x02
MAX_BTNS = 512
MAX_AXES = 64
ABS_MIN = -32767
ABS_MAX = 32767
FPS_HIST_BUCKETS = (0, 20, 40, 60)
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
MOUSE_POSITION = 10
MOUSE_MOVE = 11
MOUSE_SCROLL_UP = 20
MOUSE_SCROLL_DOWN = 21
MOUSE_BUTTON_PRESS = 30
MOUSE_BUTTON_RELEASE = 31
MOUSE_BUTTON = 40
MOUSE_BUTTON_LEFT = 41
MOUSE_BUTTON_MIDDLE = 42
MOUSE_BUTTON_RIGHT = 43
UINPUT_BTN_LEFT = (0x01, 0x110)
UINPUT_BTN_MIDDLE = (0x01, 0x112)
UINPUT_BTN_RIGHT = (0x01, 0x111)
UINPUT_REL_X = (0x02, 0x00)
UINPUT_REL_Y = (0x02, 0x01)
UINPUT_REL_WHEEL = (0x02, 0x08)
MOUSE_BUTTON_MAP = {
    MOUSE_BUTTON_LEFT: {
        "uinput": UINPUT_BTN_LEFT,
        "pynput": pynput.mouse.Button.left,
    },
    MOUSE_BUTTON_MIDDLE: {
        "uinput": UINPUT_BTN_MIDDLE,
        "pynput": pynput.mouse.Button.middle,
    },
    MOUSE_BUTTON_RIGHT: {
        "uinput": UINPUT_BTN_RIGHT,
        "pynput": pynput.mouse.Button.right,
    },
}

def get_btn_event(btn_num, btn_val):
    ts = int((time.time() * 1000) % 1000000000)
    struct_format = "IhBB"
    event = struct.pack(struct_format, ts, btn_val, JS_EVENT_BUTTON, btn_num)
    logger_selkies_gamepad.debug(struct.unpack(struct_format, event))
    return event
def get_axis_event(axis_num, axis_val):
    ts = int((time.time() * 1000) % 1000000000)
    struct_format = "IhBB"
    event = struct.pack(struct_format, ts, axis_val, JS_EVENT_AXIS, axis_num)
    logger_selkies_gamepad.debug(struct.unpack(struct_format, event))
    return event
def detect_gamepad_config(name):
    return STANDARD_XPAD_CONFIG
def get_num_btns_for_mapping(cfg):
    num_mapped_btns = len(
        [i for j in cfg["mapping"]["axes_to_btn"].values() for i in j]
    )
    return len(cfg["btn_map"]) + num_mapped_btns
def get_num_axes_for_mapping(cfg):
    return len(cfg["axes_map"])
def normalize_axis_val(val):
    return round(ABS_MIN + ((val + 1) * (ABS_MAX - ABS_MIN)) / 2)
def normalize_trigger_val(val):
    return round(val * (ABS_MAX - ABS_MIN)) + ABS_MIN
def fit_res(w, h, max_w, max_h):
    if w < max_w and h < max_h:
        return w, h
    new_w = float(w)
    new_h = float(h)
    while new_w > max_w or new_h > max_h:
        new_w = float(new_w * 0.9999)
        new_h = float(new_h * 0.9999)
    new_w, new_h = [int(i) + int(i) % 2 for i in (new_w, new_h)]
    return new_w, new_h
def get_new_res(res):
    screen_name = "screen"
    resolutions = []
    screen_pat = re.compile(r"(.*)? connected.*?")
    current_pat = re.compile(r".*current (\d+ x \d+).*")
    res_pat = re.compile(r"^(\d+x\d+)\s.*$")
    found_screen = False
    curr_res = new_res = max_res = res
    with os.popen("xrandr") as pipe:
        for line in pipe:
            screen_ma = re.match(screen_pat, line.strip())
            current_ma = re.match(current_pat, line.strip())
            if screen_ma:
                found_screen = True
                (screen_name,) = screen_ma.groups()
            if current_ma:
                (curr_res,) = current_ma.groups()
                curr_res = curr_res.replace(" ", "")
            if found_screen:
                res_ma = re.match(res_pat, line.strip())
                if res_ma:
                    resolutions += res_ma.groups()
    if not found_screen:
        logger_gstwebrtc_app_resize.error("failed to find screen info in xrandr output")
        return curr_res, new_res, resolutions, max_res
    w, h = [int(i) for i in res.split("x")]
    if screen_name.startswith("DVI"):
        max_res = "2560x1600"
    else:
        max_res = "7680x4320"
    max_w, max_h = [int(i) for i in max_res.split("x")]
    new_w, new_h = fit_res(w, h, max_w, max_h)
    new_res = "%dx%d" % (new_w, new_h)
    resolutions.sort()
    return curr_res, new_res, resolutions, max_res, screen_name
def resize_display(res):
    curr_res, new_res, resolutions, max_res, screen_name = get_new_res(res)
    if curr_res == new_res:
        logger_gstwebrtc_app_resize.info(
            "target resolution is the same: %s, skipping resize" % res
        )
        return False
    w, h = new_res.split("x")
    res = mode = new_res
    logger_gstwebrtc_app_resize.info("resizing display to %s" % res)
    if res not in resolutions:
        logger_gstwebrtc_app_resize.info(
            "adding mode %s to xrandr screen '%s'" % (res, screen_name)
        )
        mode, modeline = generate_xrandr_gtf_modeline(res)
        logger_gstwebrtc_app_resize.info(
            "creating new xrandr mode: %s %s" % (mode, modeline)
        )
        cmd = ["xrandr", "--newmode", mode, *re.split("\s+", modeline)]
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = p.communicate()
        if p.returncode != 0:
            logger_gstwebrtc_app_resize.error(
                "failed to create new xrandr mode: '%s %s': %s%s"
                % (mode, modeline, str(stdout), str(stderr))
            )
            return False
        logger_gstwebrtc_app_resize.info(
            "adding xrandr mode '%s' to screen '%s'" % (mode, screen_name)
        )
        cmd = ["xrandr", "--addmode", screen_name, mode]
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = p.communicate()
        if p.returncode != 0:
            logger_gstwebrtc_app_resize.error(
                "failed to add mode '%s' using xrandr: %s%s"
                % (mode, str(stdout), str(stderr))
            )
            return False
    logger_gstwebrtc_app_resize.info(
        "applying xrandr screen '%s' mode: %s" % (screen_name, mode)
    )
    cmd = ["xrandr", "--output", screen_name, "--mode", mode]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = p.communicate()
    if p.returncode != 0:
        logger_gstwebrtc_app_resize.error(
            "failed to apply xrandr mode '%s': %s%s" % (mode, str(stdout), str(stderr))
        )
        return False
    return True
def generate_xrandr_gtf_modeline(res):
    mode = ""
    modeline = ""
    modeline_pat = re.compile(r'^.*Modeline\s+"(.*?)"\s+(.*)')
    if len(res.split("x")) == 2:
        toks = res.split("x")
        gtf_res = "{} {} 60".format(toks[0], toks[1])
        mode = res
    elif len(res.split(" ")) == 2:
        toks = res.split(" ")
        gtf_res = "{} {} 60".format(toks[0], toks[1])
        mode = "{}x{}".format(toks[0], toks[1])
    elif len(res.split(" ")) == 3:
        toks = res.split(" ")
        gtf_res = res
        mode = "{}x{}".format(toks[0], toks[1])
    else:
        raise Exception("unsupported input resolution format: {}".format(res))
    with os.popen("cvt -r " + gtf_res) as pipe:
        for line in pipe:
            modeline_ma = re.match(modeline_pat, line.strip())
            if modeline_ma:
                _, modeline = modeline_ma.groups()
    return mode, modeline
def set_dpi(dpi):
    if which("xfconf-query"):
        cmd = [
            "xfconf-query",
            "-c",
            "xsettings",
            "-p",
            "/Xft/DPI",
            "-s",
            str(dpi),
            "--create",
            "-t",
            "int",
        ]
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = p.communicate()
        if p.returncode != 0:
            logger_gstwebrtc_app_resize.error(
                "failed to set XFCE DPI to: '%d': %s%s"
                % (dpi, str(stdout), str(stderr))
            )
            return False
    else:
        logger_gstwebrtc_app_resize.warning(
            "failed to find supported window manager to set DPI."
        )
        return False
    return True
def set_cursor_size(size):
    if which("xfconf-query"):
        cmd = [
            "xfconf-query",
            "-c",
            "xsettings",
            "-p",
            "/Gtk/CursorThemeSize",
            "-s",
            str(size),
            "--create",
            "-t",
            "int",
        ]
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = p.communicate()
        if p.returncode != 0:
            logger_gstwebrtc_app_resize.error(
                "failed to set XFCE cursor size to: '%d': %s%s"
                % (size, str(stdout), str(stderr))
            )
            return False
    else:
        logger_gstwebrtc_app_resize.warning(
            "failed to find supported window manager to set DPI."
        )
        return False
    return True
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
psutil
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

STANDARD_XPAD_CONFIG = {
    "name": "Selkies Controller",
    "btn_map": [
        BTN_A,
        BTN_B,
        BTN_X,
        BTN_Y,
        BTN_TL,
        BTN_TR,
        BTN_SELECT,
        BTN_START,
        BTN_MODE,
        BTN_THUMBL,
        BTN_THUMBR,
    ],
    "axes_map": [ABS_X, ABS_Y, ABS_Z, ABS_RX, ABS_RY, ABS_RZ, ABS_HAT0X, ABS_HAT0Y],
    "mapping": {
        "axes_to_btn": {2: (6,), 5: (7,), 6: (15, 14), 7: (13, 12)},
        "axes": {
            2: 3,
            3: 4,
        },
        "btns": {8: 6, 9: 7, 10: 9, 11: 10, 16: 8},
        "trigger_axes": [2, 5],
    },
}
XPAD_CONFIG_MAP = {
    ("045e", "0b12"): STANDARD_XPAD_CONFIG,
}
class SelkiesGamepad:
    def __init__(self, socket_path):
        self.socket_path = socket_path
        self.mapper = None
        self.name = None
        self.server = None
        self.config = None
        self.clients = {}
        self.events = asyncio.Queue() # Changed to asyncio.Queue
        self.running = False
    def set_config(self, name, num_btns, num_axes):
        self.name = name
        self.config = detect_gamepad_config(name)
        self.mapper = GamepadMapper(self.config, name, num_btns, num_axes)
    def __make_config(self):
        if not self.config:
            logger_selkies_gamepad.error(
                "could not make js config because it has not yet been set."
            )
            return None
        num_btns = len(self.config["btn_map"])
        num_axes = len(self.config["axes_map"])
        btn_map = [i for i in self.config["btn_map"]]
        axes_map = [i for i in self.config["axes_map"]]
        btn_map[num_btns:MAX_BTNS] = [0 for i in range(num_btns, MAX_BTNS)]
        axes_map[num_axes:MAX_AXES] = [0 for i in range(num_axes, MAX_AXES)]
        struct_fmt = "255sHH%dH%dB" % (MAX_BTNS, MAX_AXES)
        data = struct.pack(
            struct_fmt,
            self.config["name"].encode(),
            num_btns,
            num_axes,
            *btn_map,
            *axes_map,
        )
        return data
    async def __send_events(self):
        while self.running:
            if self.events.empty():
                await asyncio.sleep(0.01) # Increased sleep duration to 0.01 for less aggressive polling.
                continue
            while self.running and not self.events.empty():
                event = await self.events.get() # Await directly from asyncio.Queue
                await self.send_event(event)
                self.events.task_done() # Indicate task completion for Queue
    def send_btn(self, btn_num, btn_val):
        if not self.mapper:
            logger_selkies_gamepad.warning(
                "failed to send js button event because mapper was not set"
            )
            return
        event = self.mapper.get_mapped_btn(btn_num, btn_val)
        if event is not None:
            self.events.put_nowait(event) # Use put_nowait for non-blocking queue operation
    def send_axis(self, axis_num, axis_val):
        if not self.mapper:
            logger_selkies_gamepad.warning(
                "failed to send js axis event because mapper was not set"
            )
            return
        event = self.mapper.get_mapped_axis(axis_num, axis_val)
        if event is not None:
            self.events.put_nowait(event) # Use put_nowait for non-blocking queue operation
    async def send_event(self, event):
        if len(self.clients) < 1:
            return
        closed_clients = []
        for fd in self.clients:
            try:
                client = self.clients[fd]
                logger_selkies_gamepad.debug("Sending event to client with fd: %d" % fd)
                # Directly await client.send instead of using asyncio.to_thread, assuming client is asyncio socket
                await asyncio.get_running_loop().sock_sendall(client, event) # Use sock_sendall for asyncio socket
            except BrokenPipeError:
                logger_selkies_gamepad.info("Client %d disconnected" % fd)
                closed_clients.append(fd)
                client.close()
        for fd in closed_clients:
            del self.clients[fd]
    async def setup_client(self, client):
        logger_selkies_gamepad.info(
            "Sending config to client with fd: %d" % client.fileno()
        )
        try:
            config_data = self.__make_config()
            if not config_data:
                return
            # Directly await client.send instead of using asyncio.to_thread, assuming client is asyncio socket
            await asyncio.get_running_loop().sock_sendall(client, config_data) # Use sock_sendall for asyncio socket
            await asyncio.sleep(0.5)
            for btn_num in range(len(self.config["btn_map"])):
                self.send_btn(btn_num, 0)
            for axis_num in range(len(self.config["axes_map"])):
                self.send_axis(axis_num, 0)
        except BrokenPipeError:
            client.close()
            logger_selkies_gamepad.info("Client disconnected")
    async def run_server(self):
        try:
            os.unlink(self.socket_path)
        except OSError:
            if os.path.exists(self.socket_path):
                raise
        self.server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.server.bind(self.socket_path)
        self.server.listen(1)
        self.server.setblocking(False)
        logger_selkies_gamepad.info(
            "Listening for connections on %s" % self.socket_path
        )
        asyncio.create_task(self.__send_events())
        self.running = True
        try:
            while self.running:
                try:
                    client, _ = await asyncio.get_running_loop().sock_accept(self.server) # Use sock_accept for asyncio socket
                except asyncio.TimeoutError:
                    continue
                fd = client.fileno()
                logger_selkies_gamepad.info("Client connected with fd: %d" % fd)
                await self.setup_client(client)
                self.clients[fd] = client
        finally:
            self.server.close()
            try:
                os.unlink(self.socket_path)
            except:
                pass
        logger_selkies_gamepad.info(
            "Stopped gamepad socket server for %s" % self.socket_path
        )
class GamepadMapper:
    def __init__(self, config, name, num_btns, num_axes):
        self.config = config
        self.input_name = name
        self.input_num_btns = num_btns
        self.input_num_axes = num_axes
    def get_mapped_btn(self, btn_num, btn_val):
        axis_num = None
        axis_sign = 1
        for axis, mapping in self.config["mapping"]["axes_to_btn"].items():
            if btn_num in mapping:
                axis_num = axis
                if len(mapping) > 1:
                    axis_sign = 1 if mapping[0] == btn_num else -1
                break
        if axis_num is not None:
            axis_val = normalize_axis_val(btn_val * axis_sign)
            if axis_num in self.config["mapping"]["trigger_axes"]:
                axis_val = normalize_trigger_val(btn_val)
            return get_axis_event(axis_num, axis_val)
        mapped_btn = self.config["mapping"]["btns"].get(btn_num, btn_num)
        if mapped_btn >= len(self.config["btn_map"]):
            logger_selkies_gamepad.error(
                "cannot send button num %d, max num buttons is %d"
                % (mapped_btn, len(self.config["btn_map"]) - 1)
            )
            return None
        return get_btn_event(mapped_btn, int(btn_val))
    def get_mapped_axis(self, axis_num, axis_val):
        mapped_axis = self.config["mapping"]["axes"].get(axis_num, axis_num)
        if mapped_axis >= len(self.config["axes_map"]):
            logger_selkies_gamepad.error(
                "cannot send axis %d, max axis num is %d"
                % (mapped_axis, len(self.config["axes_map"]) - 1)
            )
            return None
        return get_axis_event(mapped_axis, normalize_axis_val(axis_val))
class GPUMonitor:
    def __init__(self, period=1, enabled=True):
        self.period = period
        self.enabled = enabled
        self.running = False
        self.on_stats = (
            lambda load, memoryTotal, memoryUsed: logger_gpu_monitor.warning(
                "unhandled on_stats"
            )
        )
    async def start(self, gpu_id=0):
        self.running = True
        while self.running:
            if self.enabled and int(time.time()) % self.period == 0:
                gpu = GPUtil.getGPUs()[gpu_id]
                self.on_stats(gpu.load, gpu.memoryTotal, gpu.memoryUsed)
            await asyncio.sleep(self.period) # Sleep for the defined period
        logger_gpu_monitor.info("GPU monitor stopped")
    def stop(self):
        self.running = False
class GSTWebRTCAppError(Exception):
    pass
class GSTWebRTCApp:
    def __init__(
        self,
        async_event_loop,
        stun_servers=None,
        turn_servers=None,
        audio_channels=2,
        framerate=30,
        encoder=None,
        gpu_id=0,
        video_bitrate=2000,
        audio_bitrate=96000,
        keyframe_distance=-1.0,
        congestion_control=False,
        video_packetloss_percent=0.0,
        audio_packetloss_percent=0.0,
    ):
        self.async_event_loop = async_event_loop
        self.stun_servers = stun_servers
        self.turn_servers = turn_servers
        self.audio_channels = audio_channels
        self.pipeline = None
        self.webrtcbin = None
        self.data_channel = None
        self.rtpgccbwe = None
        self.congestion_control = congestion_control
        self.encoder = encoder
        self.gpu_id = gpu_id
        self.framerate = framerate
        self.video_bitrate = video_bitrate
        self.audio_bitrate = audio_bitrate
        self.keyframe_distance = keyframe_distance
        self.min_keyframe_frame_distance = 60
        self.keyframe_frame_distance = (
            -1
            if self.keyframe_distance == -1.0
            else max(
                self.min_keyframe_frame_distance,
                int(self.framerate * self.keyframe_distance),
            )
        )
        self.vbv_multiplier_nv = 1.5 if self.keyframe_distance == -1.0 else 3
        self.vbv_multiplier_va = 1.5 if self.keyframe_distance == -1.0 else 3
        self.vbv_multiplier_vp = 1.5 if self.keyframe_distance == -1.0 else 3
        self.vbv_multiplier_sw = 1.5 if self.keyframe_distance == -1.0 else 3
        self.video_packetloss_percent = video_packetloss_percent
        self.audio_packetloss_percent = audio_packetloss_percent
        self.fec_video_bitrate = int(
            self.video_bitrate / (1.0 + (self.video_packetloss_percent / 100.0))
        )
        self.fec_audio_bitrate = int(
            self.audio_bitrate * (1.0 + (self.audio_packetloss_percent / 100.0))
        )
        self.on_ice = lambda mlineindex, candidate: logger_gstwebrtc_app.warning(
            "unhandled ice event"
        )
        self.on_sdp = lambda sdp_type, sdp: logger_gstwebrtc_app.warning(
            "unhandled sdp event"
        )
        self.on_data_open = lambda: logger_gstwebrtc_app.warning(
            "unhandled on_data_open"
        )
        self.on_data_close = lambda: logger_gstwebrtc_app.warning(
            "unhandled on_data_close"
        )
        self.on_data_error = lambda: logger_gstwebrtc_app.warning(
            "unhandled on_data_error"
        )
        self.on_data_message = lambda msg: logger_gstwebrtc_app.warning(
            "unhandled on_data_message"
        )
        Gst.init(None)
        self.check_plugins()
        self.ximagesrc = None
        self.ximagesrc_caps = None
        self.last_cursor_sent = None
    def stop_ximagesrc(self):
        if self.ximagesrc:
            self.ximagesrc.set_state(Gst.State.NULL)
    def start_ximagesrc(self):
        if self.ximagesrc:
            self.ximagesrc.set_property("endx", 0)
            self.ximagesrc.set_property("endy", 0)
            self.ximagesrc.set_state(Gst.State.PLAYING)
    def build_webrtcbin_pipeline(self, audio_only=False):
        self.webrtcbin = Gst.ElementFactory.make("webrtcbin", "app")
        self.webrtcbin.set_property("bundle-policy", "max-compat")
        self.webrtcbin.set_property("latency", 0)
        if self.congestion_control and not audio_only:
            self.webrtcbin.connect(
                "request-aux-sender",
                lambda webrtcbin, dtls_transport: self.__request_aux_sender_gcc(
                    webrtcbin, dtls_transport
                ),
            )
        self.webrtcbin.connect(
            "on-negotiation-needed",
            lambda webrtcbin: self.__on_negotiation_needed(webrtcbin),
        )
        self.webrtcbin.connect(
            "on-ice-candidate",
            lambda webrtcbin, mlineindex, candidate: self.__send_ice(
                webrtcbin, mlineindex, candidate
            ),
        )
        if self.stun_servers:
            logger_gstwebrtc_app.info("updating STUN server")
            self.webrtcbin.set_property("stun-server", self.stun_servers[0])
        if self.turn_servers:
            for i, turn_server in enumerate(self.turn_servers):
                logger_gstwebrtc_app.info("updating TURN server")
                if i == 0:
                    self.webrtcbin.set_property("turn-server", turn_server)
                else:
                    self.webrtcbin.emit("add-turn-server", turn_server)
        self.pipeline.add(self.webrtcbin)
    def build_video_pipeline(self):
        self.ximagesrc = Gst.ElementFactory.make("ximagesrc", "x11")
        ximagesrc = self.ximagesrc
        ximagesrc.set_property("show-pointer", 0)
        ximagesrc.set_property("remote", 1)
        ximagesrc.set_property("blocksize", 16384)
        ximagesrc.set_property("use-damage", 0)
        self.ximagesrc_caps = Gst.caps_from_string("video/x-raw")
        self.ximagesrc_caps.set_value("framerate", Gst.Fraction(self.framerate, 1))
        self.ximagesrc_capsfilter = Gst.ElementFactory.make("capsfilter")
        self.ximagesrc_capsfilter.set_property("caps", self.ximagesrc_caps)
        if self.encoder in ["nvh264enc"]:
            cudaupload = Gst.ElementFactory.make("cudaupload")
            if self.gpu_id >= 0:
                cudaupload.set_property("cuda-device-id", self.gpu_id)
            cudaconvert = Gst.ElementFactory.make("cudaconvert")
            if self.gpu_id >= 0:
                cudaconvert.set_property("cuda-device-id", self.gpu_id)
            cudaconvert.set_property("qos", True)
            cudaconvert_caps = Gst.caps_from_string("video/x-raw(memory:CUDAMemory)")
            cudaconvert_caps.set_value("format", "NV12")
            cudaconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            cudaconvert_capsfilter.set_property("caps", cudaconvert_caps)
            if self.gpu_id > 0:
                if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                    nvh264enc = Gst.ElementFactory.make(
                        "nvcudah264device{}enc".format(self.gpu_id), "nvenc"
                    )
                else:
                    nvh264enc = Gst.ElementFactory.make(
                        "nvh264device{}enc".format(self.gpu_id), "nvenc"
                    )
            else:
                if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                    nvh264enc = Gst.ElementFactory.make("nvcudah264enc", "nvenc")
                else:
                    nvh264enc = Gst.ElementFactory.make("nvh264enc", "nvenc")
            nvh264enc.set_property("bitrate", self.fec_video_bitrate)
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                nvh264enc.set_property("rate-control", "cbr")
            else:
                nvh264enc.set_property("rc-mode", "cbr")
            nvh264enc.set_property(
                "gop-size",
                -1 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance,
            )
            nvh264enc.set_property("strict-gop", True)
            nvh264enc.set_property("aud", False)
            nvh264enc.set_property("b-adapt", False)
            nvh264enc.set_property("rc-lookahead", 0)
            nvh264enc.set_property(
                "vbv-buffer-size",
                int(
                    (self.fec_video_bitrate + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_nv
                ),
            )
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                nvh264enc.set_property("b-frames", 0)
                nvh264enc.set_property("zero-reorder-delay", True)
            else:
                nvh264enc.set_property("bframes", 0)
                nvh264enc.set_property("zerolatency", True)
            if Gst.version().major == 1 and Gst.version().minor > 20:
                nvh264enc.set_property("cabac", True)
                nvh264enc.set_property("repeat-sequence-header", True)
            if Gst.version().major == 1 and Gst.version().minor > 22:
                nvh264enc.set_property("preset", "p4")
                nvh264enc.set_property("tune", "ultra-low-latency")
                nvh264enc.set_property("multi-pass", "two-pass-quarter")
            else:
                nvh264enc.set_property("preset", "low-latency-hq")
        elif self.encoder in ["nvh265enc"]:
            cudaupload = Gst.ElementFactory.make("cudaupload")
            if self.gpu_id >= 0:
                cudaupload.set_property("cuda-device-id", self.gpu_id)
            cudaconvert = Gst.ElementFactory.make("cudaconvert")
            if self.gpu_id >= 0:
                cudaconvert.set_property("cuda-device-id", self.gpu_id)
            cudaconvert.set_property("qos", True)
            cudaconvert_caps = Gst.caps_from_string("video/x-raw(memory:CUDAMemory)")
            cudaconvert_caps.set_value("format", "NV12")
            cudaconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            cudaconvert_capsfilter.set_property("caps", cudaconvert_caps)
            if self.gpu_id > 0:
                if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                    nvh265enc = Gst.ElementFactory.make(
                        "nvcudah265device{}enc".format(self.gpu_id), "nvenc"
                    )
                else:
                    nvh265enc = Gst.ElementFactory.make(
                        "nvh265device{}enc".format(self.gpu_id), "nvenc"
                    )
            else:
                if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                    nvh265enc = Gst.ElementFactory.make("nvcudah265enc", "nvenc")
                else:
                    nvh265enc = Gst.ElementFactory.make("nvh265enc", "nvenc")
            nvh265enc.set_property("bitrate", self.fec_video_bitrate)
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                nvh265enc.set_property("rate-control", "cbr")
            else:
                nvh265enc.set_property("rc-mode", "cbr")
            nvh265enc.set_property(
                "gop-size",
                -1 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance,
            )
            nvh265enc.set_property("strict-gop", True)
            nvh265enc.set_property("aud", False)
            nvenc_properties = [
                nvenc_property.name for nvenc_property in nvh265enc.list_properties()
            ]
            if "b-adapt" in nvenc_properties:
                nvh265enc.set_property("b-adapt", False)
            nvh265enc.set_property("rc-lookahead", 0)
            nvh265enc.set_property(
                "vbv-buffer-size",
                int(
                    (self.fec_video_bitrate + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_nv
                ),
            )
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                if "b-frames" in nvenc_properties:
                    nvh265enc.set_property("b-frames", 0)
                nvh265enc.set_property("zero-reorder-delay", True)
            else:
                if "bframes" in nvenc_properties:
                    nvh265enc.set_property("bframes", 0)
                nvh265enc.set_property("zerolatency", True)
            if Gst.version().major == 1 and Gst.version().minor > 20:
                nvh265enc.set_property("repeat-sequence-header", True)
            if Gst.version().major == 1 and Gst.version().minor > 22:
                nvh265enc.set_property("preset", "p4")
                nvh265enc.set_property("tune", "ultra-low-latency")
                nvh265enc.set_property("multi-pass", "two-pass-quarter")
            else:
                nvh265enc.set_property("preset", "low-latency-hq")
        elif self.encoder in ["nvav1enc"]:
            cudaupload = Gst.ElementFactory.make("cudaupload")
            if self.gpu_id >= 0:
                cudaupload.set_property("cuda-device-id", self.gpu_id)
            cudaconvert = Gst.ElementFactory.make("cudaconvert")
            if self.gpu_id >= 0:
                cudaconvert.set_property("cuda-device-id", self.gpu_id)
            cudaconvert.set_property("qos", True)
            cudaconvert_caps = Gst.caps_from_string("video/x-raw(memory:CUDAMemory)")
            cudaconvert_caps.set_value("format", "NV12")
            cudaconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            cudaconvert_capsfilter.set_property("caps", cudaconvert_caps)
            if self.gpu_id > 0:
                if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                    nvav1enc = Gst.ElementFactory.make(
                        "nvcudaav1device{}enc".format(self.gpu_id), "nvenc"
                    )
                else:
                    nvav1enc = Gst.ElementFactory.make(
                        "nvav1device{}enc".format(self.gpu_id), "nvenc"
                    )
            else:
                if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                    nvav1enc = Gst.ElementFactory.make("nvcudaav1enc", "nvenc")
                else:
                    nvav1enc = Gst.ElementFactory.make("nvav1enc", "nvenc")
            nvav1enc.set_property("bitrate", self.fec_video_bitrate)
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                nvav1enc.set_property("rate-control", "cbr")
            else:
                nvav1enc.set_property("rc-mode", "cbr")
            nvav1enc.set_property(
                "gop-size",
                -1 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance,
            )
            nvav1enc.set_property("strict-gop", True)
            nvav1enc.set_property("b-adapt", False)
            nvav1enc.set_property("rc-lookahead", 0)
            nvav1enc.set_property(
                "vbv-buffer-size",
                int(
                    (self.fec_video_bitrate + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_nv
                ),
            )
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                nvav1enc.set_property("b-frames", 0)
                nvav1enc.set_property("zero-reorder-delay", True)
            else:
                nvav1enc.set_property("bframes", 0)
                nvav1enc.set_property("zerolatency", True)
            if Gst.version().major == 1 and Gst.version().minor > 22:
                nvav1enc.set_property("preset", "p4")
                nvav1enc.set_property("tune", "ultra-low-latency")
                nvav1enc.set_property("multi-pass", "two-pass-quarter")
            else:
                nvav1enc.set_property("preset", "low-latency-hq")
        elif self.encoder in ["vah264enc"]:
            if self.gpu_id > 0:
                vapostproc = Gst.ElementFactory.make(
                    "varenderD{}postproc".format(128 + self.gpu_id), "vapostproc"
                )
            else:
                vapostproc = Gst.ElementFactory.make("vapostproc")
            vapostproc.set_property("scale-method", "fast")
            vapostproc.set_property("qos", True)
            vapostproc_caps = Gst.caps_from_string("video/x-raw(memory:VAMemory)")
            vapostproc_caps.set_value("format", "NV12")
            vapostproc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vapostproc_capsfilter.set_property("caps", vapostproc_caps)
            if self.gpu_id > 0:
                vah264enc = Gst.ElementFactory.make(
                    "varenderD{}h264enc".format(128 + self.gpu_id), "vaenc"
                )
                if vah264enc is None:
                    vah264enc = Gst.ElementFactory.make(
                        "varenderD{}h264lpenc".format(128 + self.gpu_id), "vaenc"
                    )
            else:
                vah264enc = Gst.ElementFactory.make("vah264enc", "vaenc")
                if vah264enc is None:
                    vah264enc = Gst.ElementFactory.make("vah264lpenc", "vaenc")
            vah264enc.set_property("aud", False)
            vah264enc.set_property("b-frames", 0)
            vah264enc.set_property(
                "cpb-size",
                int(
                    (self.fec_video_bitrate + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_va
                ),
            )
            vah264enc.set_property("dct8x8", False)
            vah264enc.set_propertyLOGLEVEL(
                "key-int-max",
                1024
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            vah264enc.set_property("mbbrc", "disabled")
            vah264enc.set_property("num-slices", 4)
            vah264enc.set_property("ref-frames", 1)
            vah264enc.set_property("rate-control", "cbr")
            vah264enc.set_property("target-usage", 6)
            vah264enc.set_property("bitrate", self.fec_video_bitrate)
        elif self.encoder in ["vah265enc"]:
            if self.gpu_id > 0:
                vapostproc = Gst.ElementFactory.make(
                    "varenderD{}postproc".format(128 + self.gpu_id), "vapostproc"
                )
            else:
                vapostproc = Gst.ElementFactory.make("vapostproc")
            vapostproc.set_property("scale-method", "fast")
            vapostproc.set_property("qos", True)
            vapostproc_caps = Gst.caps_from_string("video/x-raw(memory:VAMemory)")
            vapostproc_caps.set_value("format", "NV12")
            vapostproc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vapostproc_capsfilter.set_property("caps", vapostproc_caps)
            if self.gpu_id > 0:
                vah265enc = Gst.ElementFactory.make(
                    "varenderD{}h265enc".format(128 + self.gpu_id), "vaenc"
                )
                if vah265enc is None:
                    vah265enc = Gst.ElementFactory.make(
                        "varenderD{}h265lpenc".format(128 + self.gpu_id), "vaenc"
                    )
            else:
                vah265enc = Gst.ElementFactory.make("vah265enc", "vaenc")
                if vah265enc is None:
                    vah265enc = Gst.ElementFactory.make("vah265lpenc", "vaenc")
            vah265enc.set_property("aud", False)
            vah265enc.set_property("b-frames", 0)
            vah265enc.set_property(
                "cpb-size",
                int(
                    (self.fec_video_bitrate + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_va
                ),
            )
            vah265enc.set_property(
                "key-int-max",
                1024
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            vah265enc.set_property("mbbrc", "disabled")
            vah265enc.set_property("num-slices", 4)
            vah265enc.set_property("ref-frames", 1)
            vah265enc.set_property("rate-control", "cbr")
            vah265enc.set_property("target-usage", 6)
            vah265enc.set_property("bitrate", self.fec_video_bitrate)
        elif self.encoder in ["vavp9enc"]:
            if self.gpu_id > 0:
                vapostproc = Gst.ElementFactory.make(
                    "varenderD{}postproc".format(128 + self.gpu_id), "vapostproc"
                )
            else:
                vapostproc = Gst.ElementFactory.make("vapostproc")
            vapostproc.set_property("scale-method", "fast")
            vapostproc.set_property("qos", True)
            vapostproc_caps = Gst.caps_from_string("video/x-raw(memory:VAMemory)")
            vapostproc_caps.set_value("format", "NV12")
            vapostproc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vapostproc_capsfilter.set_property("caps", vapostproc_caps)
            if self.gpu_id > 0:
                vavp9enc = Gst.ElementFactory.make(
                    "varenderD{}vp9enc".format(128 + self.gpu_id), "vaenc"
                )
                if vavp9enc is None:
                    vavp9enc = Gst.ElementFactory.make(
                        "varenderD{}vp9lpenc".format(128 + self.gpu_id), "vaenc"
                    )
            else:
                vavp9enc = Gst.ElementFactory.make("vavp9enc", "vaenc")
                if vavp9enc is None:
                    vavp9enc = Gst.ElementFactory.make("vavp9lpenc", "vaenc")
            vavp9enc.set_property(
                "cpb-size",
                int(
                    (self.fec_video_bitrate + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_va
                ),
            )
            vavp9enc.set_property("hierarchical-level", 1)
            vavp9enc.set_property(
                "key-int-max",
                1024
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            vavp9enc.set_property("mbbrc", "disabled")
            vavp9enc.set_property("ref-frames", 1)
            vavp9enc.set_property("rate-control", "cbr")
            vavp9enc.set_property("target-usage", 6)
            vavp9enc.set_property("bitrate", self.fec_video_bitrate)
        elif self.encoder in ["vaav1enc"]:
            if self.gpu_id > 0:
                vapostproc = Gst.ElementFactory.make(
                    "varenderD{}postproc".format(128 + self.gpu_id), "vapostproc"
                )
            else:
                vapostproc = Gst.ElementFactory.make("vapostproc")
            vapostproc.set_property("scale-method", "fast")
            vapostproc.set_property("qos", True)
            vapostproc_caps = Gst.caps_from_string("video/x-raw(memory:VAMemory)")
            vapostproc_caps.set_value("format", "NV12")
            vapostproc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vapostproc_capsfilter.set_property("caps", vapostproc_caps)
            if self.gpu_id > 0:
                vaav1enc = Gst.ElementFactory.make(
                    "varenderD{}av1enc".format(128 + self.gpu_id), "vaenc"
                )
                if vaav1enc is None:
                    vaav1enc = Gst.ElementFactory.make(
                        "varenderD{}av1lpenc".format(128 + self.gpu_id), "vaenc"
                    )
            else:
                vaav1enc = Gst.ElementFactory.make("vaav1enc", "vaenc")
                if vaav1enc is None:
                    vaav1enc = Gst.ElementFactory.make("vaav1lpenc", "vaenc")
            vaav1enc.set_property(
                "cpb-size",
                int(
                    (self.fec_video_bitrate + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_va
                ),
            )
            vaav1enc.set_property("hierarchical-level", 1)
            vaav1enc.set_property(
                "key-int-max",
                1024
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            vaav1enc.set_property("mbbrc", "disabled")
            vaav1enc.set_property("ref-frames", 1)
            vaav1enc.set_property("tile-groups", 16)
            vaav1enc.set_property("rate-control", "cbr")
            vaav1enc.set_property("target-usage", 6)
            vaav1enc.set_property("bitrate", self.fec_video_bitrate)
        elif self.encoder in ["x264enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property(
                "n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "NV12")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            x264enc = Gst.ElementFactory.make("x264enc", "x264enc")
            x264enc.set_property(
                "threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            x264enc.set_property("aud", False)
            x264enc.set_property("b-adapt", False)
            x264enc.set_property("bframes", 0)
            x264enc.set_property("dct8x8", False)
            x264enc.set_property("insert-vui", True)
            x264enc.set_property(
                "key-int-max",
                2147483647
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            x264enc.set_property("mb-tree", False)
            x264enc.set_property("rc-lookahead", 0)
            x264enc.set_property("sync-lookahead", 0)
            x264enc.set_property(
                "vbv-buf-capacity",
                int(
                    (1000 + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_sw
                ),
            )
            x264enc.set_property("sliced-threads", True)
            x264enc.set_property("byte-stream", True)
            x264enc.set_property("pass", "cbr")
            x264enc.set_property("speed-preset", "ultrafast")
            x264enc.set_property("tune", "zerolatency")
            x264enc.set_property("bitrate", self.fec_video_bitrate)
        elif self.encoder in ["openh264enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property(
                "n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            openh264enc = Gst.ElementFactory.make("openh264enc", "openh264enc")
            openh264enc.set_property("adaptive-quantization", False)
            openh264enc.set_property("background-detection", False)
            openh264enc.set_property("enable-frame-skip", False)
            openh264enc.set_property("scene-change-detection", False)
            openh264enc.set_property("usage-type", "screen")
            openh264enc.set_property("complexity", "low")
            openh264enc.set_property(
                "gop-size",
                2147483647
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            openh264enc.set_property(
                "multi-thread", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            openh264enc.set_property("slice-mode", "n-slices")
            openh264enc.set_property(
                "num-slices", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            openh264enc.set_property("rate-control", "bitrate")
            openh264enc.set_property("bitrate", self.fec_video_bitrate * 1000)
        elif self.encoder in ["x265enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property(
                "n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            x265enc = Gst.ElementFactory.make("x265enc", "x265enc")
            x265enc.set_property(
                "option-string",
                "b-adapt=0:bframes=0:rc-lookahead=0:repeat-headers:pmode:wpp",
            )
            x265enc.set_property(
                "key-int-max",
                2147483647
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            x265enc.set_property("speed-preset", "ultrafast")
            x265enc.set_property("tune", "zerolatency")
            x265enc.set_property("bitrate", self.fec_video_bitrate)
        elif self.encoder in ["vp8enc", "vp9enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property(
                "n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            if self.encoder == "vp8enc":
                vpenc = Gst.ElementFactory.make("vp8enc", "vpenc")
            elif self.encoder == "vp9enc":
                vpenc = Gst.ElementFactory.make("vp9enc", "vpenc")
                vpenc.set_property("frame-parallel-decoding", True)
                vpenc.set_property("row-mt", True)
            vpenc.set_property(
                "threads", min(16, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            vbv_buffer_size = int(
                (1000 + self.framerate - 1) // self.framerate * self.vbv_multiplier_vp
            )
            vpenc.set_property("buffer-initial-size", vbv_buffer_size)
            vpenc.set_property("buffer-optimal-size", vbv_buffer_size)
            vpenc.set_property("buffer-size", vbv_buffer_size)
            vpenc.set_property("cpu-used", -16)
            vpenc.set_property("deadline", 1)
            vpenc.set_property("end-usage", "cbr")
            vpenc.set_property("error-resilient", "default")
            vpenc.set_property("keyframe-mode", "disabled")
            vpenc.set_property(
                "keyframe-max-dist",
                2147483647
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            vpenc.set_property("lag-in-frames", 0)
            vpenc.set_property("max-intra-bitrate", 250)
            vpenc.set_property("multipass-mode", "first-pass")
            vpenc.set_property("overshoot", 10)
            vpenc.set_property("undershoot", 25)
            vpenc.set_property("static-threshold", 0)
            vpenc.set_property("tuning", "psnr")
            vpenc.set_property("target-bitrate", self.fec_video_bitrate * 1000)
        elif self.encoder in ["svtav1enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property(
                "n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            svtav1enc = Gst.ElementFactory.make("svtav1enc", "svtav1enc")
            svtav1enc.set_property(
                "intra-period-length",
                -1 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance,
            )
            svtav1enc.set_property("preset", 10)
            svtav1enc.set_property(
                "logical-processors", min(24, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            svtav1enc.set_property(
                "parameters-string",
                "rc=2:fast-decode=1:buf-initial-sz=100:buf-optimal-sz=120:maxsection-pct=250:lookahead=0:pred-struct=1",
            )
            svtav1enc.set_property("target-bitrate", self.fec_video_bitrate)
        elif self.encoder in ["av1enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property(
                "n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            av1enc = Gst.ElementFactory.make("av1enc", "av1enc")
            av1enc.set_property("cpu-used", 10)
            av1enc.set_property("end-usage", "cbr")
            av1enc.set_property(
                "keyframe-max-dist",
                2147483647
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            av1enc.set_property("lag-in-frames", 0)
            av1enc.set_property("overshoot-pct", 10)
            av1enc.set_property("row-mt", True)
            av1enc.set_property("usage-profile", "realtime")
            av1enc.set_property("tile-columns", 2)
            av1enc.set_property("tile-rows", 2)
            av1enc.set_property(
                "threads", min(24, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            av1enc.set_property("target-bitrate", self.fec_video_bitsrate)
        elif self.encoder in ["rav1enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property(
                "n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            rav1enc = Gst.ElementFactory.make("rav1enc", "rav1enc")
            rav1enc.set_property("low-latency", True)
            rav1enc.set_property(
                "max-key-frame-interval",
                715827882
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            rav1enc.set_property("rdo-lookahead-frames", 0)
            rav1enc.set_property("reservoir-frame-delay", 12)
            rav1enc.set_property("speed-preset", 10)
            rav1enc.set_property("tiles", 16)
            rav1enc.set_property(
                "threads", min(24, max(1, len(os.sched_getaffinity(0)) - 1))
            )
            rav1enc.set_property("bitrate", self.fec_video_bitrate * 1000)
        else:
            raise GSTWebRTCAppError(
                "Unsupported encoder for pipeline: %s" % self.encoder
            )
        if "h264" in self.encoder or "x264" in self.encoder:
            h264enc_caps = Gst.caps_from_string("video/x-h264")
            h264enc_caps.set_value("profile", "main")
            h264enc_caps.set_value("stream-format", "byte-stream")
            h264enc_capsfilter = Gst.ElementFactory.make("capsfilter")
            h264enc_capsfilter.set_property("caps", h264enc_caps)
            rtph264pay = Gst.ElementFactory.make("rtph264pay")
            rtph264pay.set_property("mtu", 1200)
            rtph264pay.set_property("aggregate-mode", "zero-latency")
            rtph264pay.set_property("config-interval", -1)
            extensions_return = self.rtp_add_extensions(rtph264pay)
            if not extensions_return:
                logger_gstwebrtc_app.warning(
                    "WebRTC RTP extension configuration failed with video, this may lead to suboptimal performance"
                )
            rtph264pay_caps = Gst.caps_from_string("application/x-rtp")
            rtph264pay_caps.set_value("media", "video")
            rtph264pay_caps.set_value("clock-rate", 90000)
            rtph264pay_caps.set_value("encoding-name", "H264")
            rtph264pay_caps.set_value("payload", 97)
            rtph264pay_caps.set_value("rtcp-fb-nack-pli", True)
            rtph264pay_caps.set_value("rtcp-fb-ccm-fir", True)
            rtph264pay_caps.set_value("rtcp-fb-x-gstreamer-fir-as-repair", True)
            rtph264pay_capsfilter = Gst.ElementFactory.make("capsfilter")
            rtph264pay_capsfilter.set_property("caps", rtph264pay_caps)
        elif "h265" in self.encoder or "x265" in self.encoder:
            h265enc_caps = Gst.caps_from_string("video/x-h265")
            h265enc_caps.set_value("profile", "main")
            h265enc_caps.set_value("stream-format", "byte-stream")
            h265enc_capsfilter = Gst.ElementFactory.make("capsfilter")
            h265enc_capsfilter.set_property("caps", h265enc_caps)
            rtph265pay = Gst.ElementFactory.make("rtph265pay")
            rtph265pay.set_property("mtu", 1200)
            rtph265pay.set_property("aggregate-mode", "zero-latency")
            rtph265pay.set_property("config-interval", -1)
            extensions_return = self.rtp_add_extensions(rtph265pay)
            if not extensions_return:
                logger_gstwebrtc_app.warning(
                    "WebRTC RTP extension configuration failed with video, this may lead to suboptimal performance"
                )
            rtph265pay_caps = Gst.caps_from_string("application/x-rtp")
            rtph265pay_caps.set_value("media", "video")
            rtph265pay_caps.set_value("clock-rate", 90000)
            rtph265pay_caps.set_value("encoding-name", "H265")
            rtph265pay_caps.set_value("payload", 100)
            rtph265pay_caps.set_value("rtcp-fb-nack-pli", True)
            rtph265pay_caps.set_value("rtcp-fb-ccm-fir", True)
            rtph265pay_caps.set_value("rtcp-fb-x-gstreamer-fir-as-repair", True)
            rtph265pay_capsfilter = Gst.ElementFactory.make("capsfilter")
            rtph265pay_capsfilter.set_property("caps", rtph265pay_caps)
        elif "vp8" in self.encoder:
            vpenc_caps = Gst.caps_from_string("video/x-vp8")
            vpenc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vpenc_capsfilter.set_property("caps", vpenc_caps)
            rtpvppay = Gst.ElementFactory.make("rtpvp8pay", "rtpvppay")
            rtpvppay.set_property("mtu", 1200)
            rtpvppay.set_property("picture-id-mode", "15-bit")
            extensions_return = self.rtp_add_extensions(rtpvppay)
            if not extensions_return:
                logger_gstwebrtc_app.warning(
                    "WebRTC RTP extension configuration failed with video, this may lead to suboptimal performance"
                )
            rtpvppay_caps = Gst.caps_from_string("application/x-rtp")
            rtpvppay_caps.set_value("media", "video")
            rtpvppay_caps.set_value("clock-rate", 90000)
            rtpvppay_caps.set_value("encoding-name", "VP8")
            rtpvppay_caps.set_value("payload", 96)
            rtpvppay_caps.set_value("rtcp-fb-nack-pli", True)
            rtpvppay_caps.set_value("rtcp-fb-ccm-fir", True)
            rtpvppay_caps.set_value("rtcp-fb-x-gstreamer-fir-as-repair", True)
            rtpvppay_capsfilter = Gst.ElementFactory.make("capsfilter")
            rtpvppay_capsfilter.set_property("caps", rtpvppay_caps)
        elif "vp9" in self.encoder:
            vpenc_caps = Gst.caps_from_string("video/x-vp9")
            vpenc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vpenc_capsfilter.set_property("caps", vpenc_caps)
            rtpvppay = Gst.ElementFactory.make("rtpvp9pay", "rtpvppay")
            rtpvppay.set_property("mtu", 1200)
            rtpvppay.set_property("picture-id-mode", "15-bit")
            extensions_return = self.rtp_add_extensions(rtpvppay)
            if not extensions_return:
                logger_gstwebrtc_app.warning(
                    "WebRTC RTP extension configuration failed with video, this may lead to suboptimal performance"
                )
            rtpvppay_caps = Gst.caps_from_string("application/x-rtp")
            rtpvppay_caps.set_value("media", "video")
            rtpvppay_caps.set_value("clock-rate", 90000)
            rtpvppay_caps.set_value("encoding-name", "VP9")
            rtpvppay_caps.set_value("payload", 98)
            rtpvppay_caps.set_value("rtcp-fb-nack-pli", True)
            rtpvppay_caps.set_value("rtcp-fb-ccm-fir", True)
            rtpvppay_caps.set_value("rtcp-fb-x-gstreamer-fir-as-repair", True)
            rtpvppay_capsfilter = Gst.ElementFactory.make("capsfilter")
            rtpvppay_capsfilter.set_property("caps", rtpvppay_caps)
        elif "av1" in self.encoder:
            av1enc_caps = Gst.caps_from_string("video/x-av1")
            av1enc_caps.set_value("parsed", True)
            av1enc_caps.set_value("stream-format", "obu-stream")
            av1enc_capsfilter = Gst.ElementFactory.make("capsfilter")
            av1enc_capsfilter.set_property("caps", av1enc_caps)
            rtpav1pay = Gst.ElementFactory.make("rtpav1pay")
            rtpav1pay.set_property("mtu", 1200)
            extensions_return = self.rtp_add_extensions(rtpav1pay)
            if not extensions_return:
                logger_gstwebrtc_app.warning(
                    "WebRTC RTP extension configuration failed with video, this may lead to suboptimal performance"
                )
            rtpav1pay_caps = Gst.caps_from_string("application/x-rtp")
            rtpav1pay_caps.set_value("media", "video")
            rtpav1pay_caps.set_value("clock-rate", 90000)
            rtpav1pay_caps.set_value("encoding-name", "AV1")
            rtpav1pay_caps.set_value("payload", 96)
            rtpav1pay_caps.set_value("rtcp-fb-nack-pli", True)
            rtpav1pay_caps.set_value("rtcp-fb-ccm-fir", True)
            rtpav1pay_caps.set_value("rtcp-fb-x-gstreamer-fir-as-repair", True)
            rtpav1pay_capsfilter = Gst.ElementFactory.make("capsfilter")
            rtpav1pay_capsfilter.set_property("caps", rtpav1pay_caps)
        pipeline_elements = [self.ximagesrc, self.ximagesrc_capsfilter]
        if self.encoder in ["nvh264enc"]:
            pipeline_elements += [
                cudaupload,
                cudaconvert,
                cudaconvert_capsfilter,
                nvh264enc,
                h264enc_capsfilter,
                rtph264pay,
                rtph264pay_capsfilter,
            ]
        elif self.encoder in ["nvh265enc"]:
            pipeline_elements += [
                cudaupload,
                cudaconvert,
                cudaconvert_capsfilter,
                nvh265enc,
                h265enc_capsfilter,
                rtph265pay,
                rtph265pay_capsfilter,
            ]
        elif self.encoder in ["nvav1enc"]:
            pipeline_elements += [
                cudaupload,
                cudaconvert,
                cudaconvert_capsfilter,
                nvav1enc,
                av1enc_capsfilter,
                rtpav1pay,
                rtpav1pay_capsfilter,
            ]
        elif self.encoder in ["vah264enc"]:
            pipeline_elements += [
                vapostproc,
                vapostproc_capsfilter,
                vah264enc,
                h264enc_capsfilter,
                rtph264pay,
                rtph264pay_capsfilter,
            ]
        elif self.encoder in ["vah265enc"]:
            pipeline_elements += [
                vapostproc,
                vapostproc_capsfilter,
                vah265enc,
                h265enc_capsfilter,
                rtph265pay,
                rtph265pay_capsfilter,
            ]
        elif self.encoder in ["vavp9enc"]:
            pipeline_elements += [
                vapostproc,
                vapostproc_capsfilter,
                vavp9enc,
                vpenc_capsfilter,
                rtpvppay,
                rtpvppay_capsfilter,
            ]
        elif self.encoder in ["vaav1enc"]:
            pipeline_elements += [
                vapostproc,
                vapostproc_capsfilter,
                vaav1enc,
                av1enc_capsfilter,
                rtpav1pay,
                rtpav1pay_capsfilter,
            ]
        elif self.encoder in ["x264enc"]:
            pipeline_elements += [
                videoconvert,
                videoconvert_capsfilter,
                x264enc,
                h264enc_capsfilter,
                rtph264pay,
                rtph264pay_capsfilter,
            ]
        elif self.encoder in ["openh264enc"]:
            pipeline_elements += [
                videoconvert,
                videoconvert_capsfilter,
                openh264enc,
                h264enc_capsfilter,
                rtph264pay,
                rtph264pay_capsfilter,
            ]
        elif self.encoder in ["x265enc"]:
            pipeline_elements += [
                videoconvert,
                videoconvert_capsfilter,
                x265enc,
                h265enc_capsfilter,
                rtph265pay,
                rtph265pay_capsfilter,
            ]
        elif self.encoder in ["vp8enc", "vp9enc"]:
            pipeline_elements += [
                videoconvert,
                videoconvert_capsfilter,
                vpenc,
                vpenc_capsfilter,
                rtpvppay,
                rtpvppay_capsfilter,
            ]
        elif self.encoder in ["svtav1enc"]:
            pipeline_elements += [
                videoconvert,
                videoconvert_capsfilter,
                svtav1enc,
                av1enc_capsfilter,
                rtpav1pay,
                rtpav1pay_capsfilter,
            ]
        elif self.encoder in ["av1enc"]:
            pipeline_elements += [
                videoconvert,
                videoconvert_capsfilter,
                av1enc,
                av1enc_capsfilter,
                rtpav1pay,
                rtpav1pay_capsfilter,
            ]
        elif self.encoder in ["rav1enc"]:
            pipeline_elements += [
                videoconvert,
                videoconvert_capsfilter,
                rav1enc,
                av1enc_capsfilter,
                rtpav1pay,
                rtpav1pay_capsfilter,
            ]
        for pipeline_element in pipeline_elements:
            self.pipeline.add(pipeline_element)
        pipeline_elements += [self.webrtcbin]
        for i in range(len(pipeline_elements) - 1):
            if not Gst.Element.link(pipeline_elements[i], pipeline_elements[i + 1]):
                raise GSTWebRTCAppError(
                    "Failed to link {} -> {}".format(
                        pipeline_elements[i].get_name(),
                        pipeline_elements[i + 1].get_name(),
                    )
                )
        transceiver = self.webrtcbin.emit("get-transceiver", 0)
        transceiver.set_property("do-nack", True)
        transceiver.set_property(
            "fec-type",
            GstWebRTC.WebRTCFECType.ULP_RED
            if self.video_packetloss_percent > 0
            else GstWebRTC.WebRTCFECType.NONE,
        )
        transceiver.set_property("fec-percentage", self.video_packetloss_percent)
    def build_audio_pipeline(self):
        pulsesrc = Gst.ElementFactory.make("pulsesrc", "pulsesrc")
        pulsesrc.set_property("provide-clock", True)
        pulsesrc.set_property("do-timestamp", False)
        pulsesrc.set_property("buffer-time", 100000)
        pulsesrc.set_property("latency-time", 1000)
        pulsesrc_caps = Gst.caps_from_string("audio/x-raw")
        pulsesrc_caps.set_value("channels", self.audio_channels)
        pulsesrc_capsfilter = Gst.ElementFactory.make("capsfilter")
        pulsesrc_capsfilter.set_property("caps", pulsesrc_caps)
        opusenc = Gst.ElementFactory.make("opusenc", "opusenc")
        opusenc.set_property("audio-type", "restricted-lowdelay")
        opusenc.set_property("bandwidth", "fullband")
        opusenc.set_property("bitrate-type", "cbr")
        opusenc.set_property("frame-size", "10")
        opusenc.set_property("perfect-timestamp", True)
        opusenc.set_property("max-payload-size", 4000)
        opusenc.set_property("inband-fec", self.audio_packetloss_percent > 0)
        opusenc.set_property("packet-loss-percentage", self.audio_packetloss_percent)
        opusenc.set_property("bitrate", self.audio_bitrate)
        rtpopuspay = Gst.ElementFactory.make("rtpopuspay")
        rtpopuspay.set_property("mtu", 1200)
        extensions_return = self.rtp_add_extensions(rtpopuspay, audio=True)
        if not extensions_return:
            logger_gstwebrtc_app.warning(
                "WebRTC RTP extension configuration failed with audio, this may lead to suboptimal performance"
            )
        rtpopuspay_queue = Gst.ElementFactory.make("queue", "rtpopuspay_queue")
        rtpopuspay_queue.set_property("leaky", "downstream")
        rtpopuspay_queue.set_property("flush-on-eos", True)
        rtpopuspay_queue.set_property("max-size-time", 16000000)
        rtpopuspay_queue.set_property("max-size-buffers", 0)
        rtpopuspay_queue.set_property("max-size-bytes", 0)
        rtpopuspay_caps = Gst.caps_from_string("application/x-rtp")
        rtpopuspay_caps.set_value("media", "audio")
        rtpopuspay_caps.set_value(
            "encoding-name", "OPUS" if self.audio_channels <= 2 else "MULTIOPUS"
        )
        rtpopuspay_caps.set_value("payload", 111)
        rtpopuspay_caps.set_value("clock-rate", 48000)
        rtpopuspay_capsfilter = Gst.ElementFactory.make("capsfilter")
        rtpopuspay_capsfilter.set_property("caps", rtpopuspay_caps)
        pipeline_elements = [
            pulsesrc,
            pulsesrc_capsfilter,
            opusenc,
            rtpopuspay,
            rtpopuspay_queue,
            rtpopuspay_capsfilter,
        ]
        for pipeline_element in pipeline_elements:
            self.pipeline.add(pipeline_element)
        pipeline_elements += [self.webrtcbin]
        for i in range(len(pipeline_elements) - 1):
            if not Gst.Element.link(pipeline_elements[i], pipeline_elements[i + 1]):
                raise GSTWebRTCAppError(
                    "Failed to link {} -> {}".format(
                        pipeline_elements[i].get_name(),
                        pipeline_elements[i + 1].get_name(),
                    )
                )
    def check_plugins(self):
        required = [
            "opus",
            "nice",
            "webrtc",
            "app",
            "dtls",
            "srtp",
            "rtp",
            "sctp",
            "rtpmanager",
            "ximagesrc",
        ]
        supported = [
            "nvh264enc",
            "nvh265enc",
            "nvav1enc",
            "vah264enc",
            "vah265enc",
            "vavp9enc",
            "vaav1enc",
            "x264enc",
            "openh264enc",
            "x265enc",
            "vp8enc",
            "vp9enc",
            "svtav1enc",
            "av1enc",
            "rav1enc",
        ]
        if self.encoder not in supported:
            raise GSTWebRTCAppError(
                "Unsupported encoder, must be one of: " + ",".join(supported)
            )
        if "av1" in self.encoder or self.congestion_control:
            required.append("rsrtp")
        if self.encoder.startswith("nv"):
            required.append("nvcodec")
        elif self.encoder.startswith("va"):
            required.append("va")
        elif self.encoder in ["x264enc"]:
            required.append("x264")
        elif self.encoder in ["openh264enc"]:
            required.append("openh264")
        elif self.encoder in ["x265enc"]:
            required.append("x265")
        elif self.encoder in ["vp8enc", "vp9enc"]:
            required.append("vpx")
        elif self.encoder in ["svtav1enc"]:
            required.append("svtav1")
        elif self.encoder in ["av1enc"]:
            required.append("aom")
        elif self.encoder in ["rav1enc"]:
            required.append("rav1e")
        missing = list(
            filter(lambda p: Gst.Registry.get().find_plugin(p) is None, required)
        )
        if missing:
            raise GSTWebRTCAppError("Missing gstreamer plugins:", missing)
    def set_sdp(self, sdp_type, sdp):
        if not self.webrtcbin:
            raise GSTWebRTCAppError("Received SDP before session started")
        if sdp_type != "answer":
            raise GSTWebRTCAppError('ERROR: sdp type was not "answer"')
        _, sdpmsg = GstSdp.SDPMessage.new_from_text(sdp)
        answer = GstWebRTC.WebRTCSessionDescription.new(
            GstWebRTC.WebRTCSDPType.ANSWER, sdpmsg
        )
        promise = Gst.Promise.new()
        self.webrtcbin.emit("set-remote-description", answer, promise)
        promise.interrupt()
    def set_ice(self, mlineindex, candidate):
        logger_gstwebrtc_app.info(
            "setting ICE candidate: %d, %s" % (mlineindex, candidate)
        )
        if not self.webrtcbin:
            raise GSTWebRTCAppError("Received ICE before session started")
        self.webrtcbin.emit("add-ice-candidate", mlineindex, candidate)
    def set_framerate(self, framerate):
        if self.pipeline:
            self.framerate = framerate
            self.keyframe_frame_distance = (
                -1
                if self.keyframe_distance == -1.0
                else max(
                    self.min_keyframe_frame_distance,
                    int(self.framerate * self.keyframe_distance),
                )
            )
            if self.encoder.startswith("nv"):
                element = Gst.Bin.get_by_name(self.pipeline, "nvenc")
                element.set_property(
                    "gop-size",
                    -1
                    if self.keyframe_distance == -1.0
                    else self.keyframe_frame_distance,
                )
                element.set_property(
                    "vbv-buffer-size",
                    int(
                        (self.fec_video_bitrate + self.framerate - 1)
                        // self.framerate
                        * self.vbv_multiplier_nv
                    ),
                )
            elif self.encoder.startswith("va"):
                element = Gst.Bin.get_by_name(self.pipeline, "vaenc")
                element.set_property(
                    "key-int-max",
                    1024
                    if self.keyframe_distance == -1.0
                    else self.keyframe_frame_distance,
                )
                element.set_property(
                    "cpb-size",
                    int(
                        (self.fec_video_bitrate + self.framerate - 1)
                        // self.framerate
                        * self.vbv_multiplier_va
                    ),
                )
            elif self.encoder in ["x264enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "x264enc")
                element.set_property(
                    "key-int-max",
                    2147483647
                    if self.keyframe_distance == -1.0
                    else self.keyframe_frame_distance,
                )
                element.set_property(
                    "vbv-buf-capacity",
                    int(
                        (1000 + self.framerate - 1)
                        // self.framerate
                        * self.vbv_multiplier_sw
                    ),
                )
            elif self.encoder in ["openh264enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "openh264enc")
                element.set_property(
                    "gop-size",
                    2147483647
                    if self.keyframe_distance == -1.0
                    else self.keyframe_frame_distance,
                )
            elif self.encoder in ["x265enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "x265enc")
                element.set_property(
                    "key-int-max",
                    2147483647
                    if self.keyframe_distance == -1.0
                    else self.keyframe_frame_distance,
                )
            elif self.encoder.startswith("vp"):
                element = Gst.Bin.get_by_name(self.pipeline, "vpenc")
                element.set_property(
                    "keyframe-max-dist",
                    2147483647
                    if self.keyframe_distance == -1.0
                    else self.keyframe_frame_distance,
                )
                vbv_buffer_size = int(
                    (1000 + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_vp
                )
                element.set_property("buffer-initial-size", vbv_buffer_size)
                element.set_property("buffer-optimal-size", vbv_buffer_size)
                element.set_property("buffer-size", vbv_buffer_size)
            elif self.encoder in ["svtav1enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "svtav1enc")
                element.set_property(
                    "intra-period-length",
                    -1
                    if self.keyframe_distance == -1.0
                    else self.keyframe_frame_distance,
                )
            elif self.encoder in ["av1enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "av1enc")
                element.set_property(
                    "keyframe-max-dist",
                    2147483647
                    if self.keyframe_distance == -1.0
                    else self.keyframe_frame_distance,
                )
            elif self.encoder in ["rav1enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "rav1enc")
                element.set_property(
                    "max-key-frame-interval",
                    715827882
                    if self.keyframe_distance == -1.0
                    else self.keyframe_frame_distance,
                )
            else:
                logger_gstwebrtc_app.warning(
                    "setting keyframe interval (GOP size) not supported with encoder: %s"
                    % self.encoder
                )
            self.ximagesrc_caps = Gst.caps_from_string("video/x-raw")
            self.ximagesrc_caps.set_value("framerate", Gst.Fraction(self.framerate, 1))
            self.ximagesrc_capsfilter.set_property("caps", self.ximagesrc_caps)
            logger_gstwebrtc_app.info("framerate set to: %d" % framerate)
    def set_video_bitrate(self, bitrate, cc=False):
        if self.pipeline:
            fec_bitrate = int(bitrate / (1.0 + (self.video_packetloss_percent / 100.0)))
            if (not cc) and self.congestion_control and self.rtpgccbwe is not None:
                self.rtpgccbwe.set_property(
                    "min-bitrate",
                    max(
                        100000 + self.fec_audio_bitrate,
                        int(bitrate * 1000 * 0.1 + self.fec_audio_bitrate),
                    ),
                )
                self.rtpgccbwe.set_property(
                    "max-bitrate", int(bitrate * 1000 + self.fec_audio_bitrate)
                )
                self.rtpgccbwe.set_property(
                    "estimated-bitrate", int(bitrate * 1000 + self.fec_audio_bitrate)
                )
            if self.encoder.startswith("nv"):
                element = Gst.Bin.get_by_name(self.pipeline, "nvenc")
                if not cc:
                    element.set_property(
                        "vbv-buffer-size",
                        int(
                            (fec_bitrate + self.framerate - 1)
                            // self.framerate
                            * self.vbv_multiplier_nv
                        ),
                    )
                element.set_property("bitrate", fec_bitrate)
            elif self.encoder.startswith("va"):
                element = Gst.Bin.get_by_name(self.pipeline, "vaenc")
                if not cc:
                    element.set_property(
                        "cpb-size",
                        int(
                            (fec_bitrate + self.framerate - 1)
                            // self.framerate
                            * self.vbv_multiplier_va
                        ),
                    )
                element.set_property("bitrate", fec_bitrate)
            elif self.encoder in ["x264enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "x264enc")
                element.set_property("bitrate", fec_bitrate)
            elif self.encoder in ["openh264enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "openh264enc")
                element.set_property("bitrate", fec_bitrate * 1000)
            elif self.encoder in ["x265enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "x265enc")
                element.set_property("bitrate", fec_bitrate)
            elif self.encoder in ["vp8enc", "vp9enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "vpenc")
                element.set_property("target-bitrate", fec_bitrate * 1000)
            elif self.encoder in ["svtav1enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "svtav1enc")
                element.set_property("target-bitrate", fec_bitrate)
            elif self.encoder in ["av1enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "av1enc")
                element.set_property("target-bitrate", fec_bitrate)
            elif self.encoder in ["rav1enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "rav1enc")
                element.set_property("bitrate", fec_bitrate * 1000)
            else:
                logger_gstwebrtc_app.warning(
                    "set_video_bitrate not supported with encoder: %s" % self.encoder
                )
            if not cc:
                logger_gstwebrtc_app.info("video bitrate set to: %d" % bitrate)
            else:
                logger_gstwebrtc_app.debug(
                    "video bitrate set with congestion control to: %d" % bitrate
                )
            self.video_bitrate = bitrate
            self.fec_video_bitrate = fec_bitrate
            if not cc:
                self.__send_data_channel_message(
                    "pipeline", {"status": "Video bitrate set to: %d" % bitrate}
                )
    def set_audio_bitrate(self, bitrate):
        if self.pipeline:
            fec_bitrate = int(bitrate * (1.0 + (self.audio_packetloss_percent / 100.0)))
            if self.congestion_control and self.rtpgccbwe is not None:
                self.rtpgccbwe.set_property(
                    "min-bitrate",
                    max(
                        100000 + fec_bitrate,
                        int(self.video_bitrate * 1000 * 0.1 + fec_bitrate),
                    ),
                )
                self.rtpgccbwe.set_property(
                    "max-bitrate", int(self.video_bitrate * 1000 + fec_bitrate)
                )
                self.rtpgccbwe.set_property(
                    "estimated-bitrate", int(self.video_bitrate * 1000 + fec_bitrate)
                )
            element = Gst.Bin.get_by_name(self.pipeline, "opusenc")
            element.set_property("bitrate", bitrate)
            logger_gstwebrtc_app.info("audio bitrate set to: %d" % bitrate)
            self.audio_bitrate = bitrate
            self.fec_audio_bitrate = fec_bitrate
            self.__send_data_channel_message(
                "pipeline", {"status": "Audio bitrate set to: %d" % bitrate}
            )
    def set_pointer_visible(self, visible):
        element = Gst.Bin.get_by_name(self.pipeline, "x11")
        element.set_property("show-pointer", visible)
        self.__send_data_channel_message(
            "pipeline", {"status": "Set pointer visibility to: %d" % visible}
        )
    def send_clipboard_data(self, data):
        CLIPBOARD_RESTRICTION = 65400
        clipboard_message = base64.b64encode(data.encode()).decode("utf-8")
        clipboard_length = len(clipboard_message)
        if clipboard_length <= CLIPBOARD_RESTRICTION:
            self.__send_data_channel_message(
                "clipboard", {"content": clipboard_message}
            )
        else:
            logger_gstwebrtc_app.warning(
                "clipboard may not be sent to the client because the base64 message length {} is above the maximum length of {}".format(
                    clipboard_length, CLIPBOARD_RESTRICTION
                )
            )
    def send_cursor_data(self, data):
        self.last_cursor_sent = data
        self.__send_data_channel_message("cursor", data)
    def send_gpu_stats(self, load, memory_total, memory_used):
        self.__send_data_channel_message(
            "gpu_stats",
            {
                "load": load,
                "memory_total": memory_total,
                "memory_used": memory_used,
            },
        )
    def send_reload_window(self):
        logger_gstwebrtc_app.info("sending window reload")
        self.__send_data_channel_message("system", {"action": "reload"})
    def send_framerate(self, framerate):
        logger_gstwebrtc_app.info("sending framerate")
        self.__send_data_channel_message(
            "system", {"action": "framerate," + str(framerate)}
        )
    def send_video_bitrate(self, bitrate):
        logger_gstwebrtc_app.info("sending video bitrate")
        self.__send_data_channel_message(
            "system", {"action": "video_bitrate,%d" % bitrate}
        )
    def send_audio_bitrate(self, bitrate):
        logger_gstwebrtc_app.info("sending audio bitrate")
        self.__send_data_channel_message(
            "system", {"action": "audio_bitrate,%d" % bitrate}
        )
    def send_encoder(self, encoder):
        logger_gstwebrtc_app.info("sending encoder: " + encoder)
        self.__send_data_channel_message("system", {"action": "encoder,%s" % encoder})
    def send_resize_enabled(self, resize_enabled):
        logger_gstwebrtc_app.info("sending resize enabled state")
        self.__send_data_channel_message(
            "system", {"action": "resize," + str(resize_enabled)}
        )
    def send_remote_resolution(self, res):
        logger_gstwebrtc_app.info("sending remote resolution of: " + res)
        self.__send_data_channel_message("system", {"action": "resolution," + res})
    def send_ping(self, t):
        self.__send_data_channel_message("ping", {"start_time": float("%.3f" % t)})
    def send_latency_time(self, latency):
        self.__send_data_channel_message("latency_measurement", {"latency_ms": latency})
    def send_system_stats(self, cpu_percent, mem_total, mem_used):
        self.__send_data_channel_message(
            "system_stats",
            {
                "cpu_percent": cpu_percent,
                "mem_total": mem_total,
                "mem_used": mem_used,
            },
        )
    def is_data_channel_ready(self):
        return (
            self.data_channel
            and self.data_channel.get_property("ready-state")
            == GstWebRTC.WebRTCDataChannelState.OPEN
        )
    def __send_data_channel_message(self, msg_type, data):
        if not self.is_data_channel_ready():
            logger_gstwebrtc_app.debug(
                "skipping message because data channel is not ready: %s" % msg_type
            )
            return
        msg = {"type": msg_type, "data": data}
        self.data_channel.emit("send-string", json.dumps(msg))
    def __on_offer_created(self, promise, _, __):
        promise.wait()
        reply = promise.get_reply()
        offer = reply.get_value("offer")
        promise = Gst.Promise.new()
        self.webrtcbin.emit("set-local-description", offer, promise)
        promise.interrupt()
        sdp_text = offer.sdp.as_text()
        if "rtx-time" not in sdp_text:
            logger_gstwebrtc_app.warning("injecting rtx-time to SDP")
            sdp_text = re.sub(r"(apt=\d+)", r"\1;rtx-time=125", sdp_text)
        elif "rtx-time=125" not in sdp_text:
            logger_gstwebrtc_app.warning("injecting modified rtx-time to SDP")
            sdp_text = re.sub(r"rtx-time=\d+", r"rtx-time=125", sdp_text)
        if "h264" in self.encoder or "x264" in self.encoder:
            if "profile-level-id" not in sdp_text:
                logger_gstwebrtc_app.warning("injecting profile-level-id to SDP")
                sdp_text = sdp_text.replace(
                    "packetization-mode=", "profile-level-id=42e01f;packetization-mode="
                )
            elif "profile-level-id=42e01f" not in sdp_text:
                logger_gstwebrtc_app.warning(
                    "injecting modified profile-level-id to SDP"
                )
                sdp_text = re.sub(
                    r"profile-level-id=\w+", r"profile-level-id=42e01f", sdp_text
                )
            if "level-asymmetry-allowed" not in sdp_text:
                logger_gstwebrtc_app.warning("injecting level-asymmetry-allowed to SDP")
                sdp_text = sdp_text.replace(
                    "packetization-mode=",
                    "level-asymmetry-allowed=1;packetization-mode=",
                )
            elif "level-asymmetry-allowed=1" not in sdp_text:
                logger_gstwebrtc_app.warning(
                    "injecting modified level-asymmetry-allowed to SDP"
                )
                sdp_text = re.sub(
                    r"level-asymmetry-allowed=\d+",
                    r"level-asymmetry-allowed=1",
                    sdp_text,
                )
        if (
            "h264" in self.encoder
            or "x264" in self.encoder
            or "h265" in self.encoder
            or "x265" in self.encoder
        ):
            if "sps-pps-idr-in-keyframe" not in sdp_text:
                logger_gstwebrtc_app.warning("injecting sps-pps-idr-in-keyframe to SDP")
                sdp_text = sdp_text.replace(
                    "packetization-mode=",
                    "sps-pps-idr-in-keyframe=1;packetization-mode=",
                )
            elif "sps-pps-idr-in-keyframe=1" not in sdp_text:
                logger_gstwebrtc_app.warning(
                    "injecting modified sps-pps-idr-in-keyframe to SDP"
                )
                sdp_text = re.sub(
                    r"sps-pps-idr-in-keyframe=\d+",
                    r"sps-pps-idr-in-keyframe=1",
                    sdp_text,
                )
        if "opus/" in sdp_text.lower():
            sdp_text = re.sub(r"([^-]sprop-[^\r\n]+)", r"\1\r\na=ptime:10", sdp_text)
        asyncio.run(self.on_sdp("offer", sdp_text))
    def __request_aux_sender_gcc(self, webrtcbin, dtls_transport):
        self.rtpgccbwe = Gst.ElementFactory.make("rtpgccbwe")
        if self.rtpgccbwe is None:
            logger_gstwebrtc_app.warning(
                "rtpgccbwe element is not available, not performing any congestion control."
            )
            return None
        logger_gstwebrtc_app.info(
            "handling on-request-aux-header, activating rtpgccbwe congestion control."
        )
        self.rtpgccbwe.set_property(
            "min-bitrate",
            max(
                100000 + self.fec_audio_bitrate,
                int(self.video_bitrate * 1000 * 0.1 + self.fec_audio_bitrate),
            ),
        )
        self.rtpgccbwe.set_property(
            "max-bitrate", int(self.video_bitrate * 1000 + self.fec_audio_bitrate)
        )
        self.rtpgccbwe.set_property(
            "estimated-bitrate", int(self.video_bitrate * 1000 + self.fec_audio_bitrate)
        )
        self.rtpgccbwe.connect(
            "notify::estimated-bitrate",
            lambda bwe, pspec: self.set_video_bitrate(
                int((bwe.get_property(pspec.name) - self.fec_audio_bitrate) / 1000),
                cc=True,
            ),
        )
        return self.rtpgccbwe
    def rtp_add_extensions(self, payloader, audio=False):
        rtp_id_iteration = 0
        return_result = True
        custom_ext = {
            "http://www.webrtc.org/experiments/rtp-hdrext/playout-delay": self.PlayoutDelayExtension()
        }
        rtp_uri_list = []
        if self.congestion_control:
            rtp_uri_list += [
                "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"
            ]
        if not audio:
            rtp_uri_list += [
                "http://www.webrtc.org/experiments/rtp-hdrext/playout-delay"
            ]
        for rtp_uri in rtp_uri_list:
            try:
                rtp_id = self.__pick_rtp_extension_id(
                    payloader, rtp_uri, previous_rtp_id=rtp_id_iteration
                )
                if rtp_id is not None:
                    if rtp_uri in custom_ext.keys():
                        rtp_extension = custom_ext[rtp_uri]
                    else:
                        rtp_extension = GstRtp.RTPHeaderExtension.create_from_uri(
                            rtp_uri
                        )
                    if not rtp_extension:
                        raise GSTWebRTCAppError(
                            "GstRtp.RTPHeaderExtension for {} is None".format(rtp_uri)
                        )
                    rtp_extension.set_id(rtp_id)
                    payloader.emit("add-extension", rtp_extension)
                    rtp_id_iteration = rtp_id
            except Exception as e:
                logger_gstwebrtc_app.warning(
                    "RTP extension {} not added because of error {}".format(rtp_uri, e)
                )
                return_result = False
        return return_result
    def __pick_rtp_extension_id(self, payloader, uri, previous_rtp_id=0):
        payloader_properties = payloader.list_properties()
        enabled_extensions = (
            payloader.get_property("extensions")
            if "extensions"
            in [payloader_property.name for payloader_property in payloader_properties]
            else None
        )
        if not enabled_extensions:
            logger_gstwebrtc_app.debug(
                "'extensions' property in {} does not exist in payloader, application code must ensure to select non-conflicting IDs for any additionally configured extensions".format(
                    payloader.get_name()
                )
            )
            return max(1, previous_rtp_id + 1)
        extension = next(
            (ext for ext in enabled_extensions if ext.get_uri() == uri), None
        )
        if extension:
            return None
        used_numbers = set(ext.get_id() for ext in enabled_extensions)
        num = 1
        while True:
            if num not in used_numbers:
                return num
            num += 1
    def __on_negotiation_needed(self, webrtcbin):
        logger_gstwebrtc_app.info("handling on-negotiation-needed, creating offer.")
        promise = Gst.Promise.new_with_change_func(
            self.__on_offer_created, webrtcbin, None
        )
        webrtcbin.emit("create-offer", None, promise)
    def __send_ice(self, webrtcbin, mlineindex, candidate):
        logger_gstwebrtc_app.debug(
            "received ICE candidate: %d %s", mlineindex, candidate
        )
        asyncio.run(self.on_ice(mlineindex, candidate))
    def bus_call(self, message):
        t = message.type
        if t == Gst.MessageType.EOS:
            logger_gstwebrtc_app.error("End-of-stream\n")
            return False
        elif t == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            logger_gstwebrtc_app.error("Error: %s: %s\n" % (err, debug))
            return False
        elif t == Gst.MessageType.STATE_CHANGED:
            if isinstance(message.src, Gst.Pipeline):
                old_state, new_state, pending_state = message.parse_state_changed()
                logger_gstwebrtc_app.info(
                    (
                        "Pipeline state changed from %s to %s."
                        % (old_state.value_nick, new_state.value_nick)
                    )
                )
                if old_state.value_nick == "paused" and new_state.value_nick == "ready":
                    logger_gstwebrtc_app.info("stopping bus message task")
                    return False
        elif t == Gst.MessageType.LATENCY:
            if self.webrtcbin:
                self.webrtcbin.set_property("latency", 0)
        return True
    def start_pipeline(self, audio_only=False):
        logger_gstwebrtc_app.info("starting pipeline")
        self.pipeline = Gst.Pipeline.new()
        self.build_webrtcbin_pipeline(audio_only)
        if audio_only:
            self.build_audio_pipeline()
        else:
            self.build_video_pipeline()
        res = self.pipeline.set_state(Gst.State.PLAYING)
        if res != Gst.StateChangeReturn.SUCCESS:
            raise GSTWebRTCAppError(
                "Failed to transition pipeline to PLAYING: %s" % res
            )
        if not audio_only:
            options = Gst.Structure("application/data-channel")
            options.set_value("ordered", True)
            options.set_value("priority", "high")
            options.set_value("max-retransmits", 0)
            self.data_channel = self.webrtcbin.emit(
                "create-data-channel", "input", options
            )
            self.data_channel.connect("on-open", lambda _: self.on_data_open())
            self.data_channel.connect("on-close", lambda _: self.on_data_close())
            self.data_channel.connect("on-error", lambda _: self.on_data_error())
            self.data_channel.connect(
                "on-message-string",
                lambda _, msg: asyncio.run_coroutine_threadsafe(
                    self.on_data_message(msg), loop=self.async_event_loop
                ),
            )
        logger_gstwebrtc_app.info(
            "{} pipeline started".format("audio" if audio_only else "video")
        )
    async def handle_bus_calls(self):
        bus = None
        if self.pipeline is not None: # Get bus only if pipeline is created
            bus = self.pipeline.get_bus() # Get bus outside the loop for efficiency
        while True: # Run indefinitely to handle bus messages
            if bus is not None:
                message = bus.timed_pop(0.1) # Polling with timeout to avoid blocking
                if message: # Process message only if available
                    if not self.bus_call(message):
                        break # Exit loop if bus_call returns False (EOS or ERROR)
            else:
                await asyncio.sleep(0.1) # Sleep if no bus available yet
    async def stop_pipeline(self):
        logger_gstwebrtc_app.info("stopping pipeline")
        if self.data_channel:
            await asyncio.to_thread(self.data_channel.emit, "close")
            self.data_channel = None
            logger_gstwebrtc_app.info("data channel closed")
        if self.pipeline:
            logger_gstwebrtc_app.info("setting pipeline state to NULL")
            await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
            self.pipeline = None
            logger_gstwebrtc_app.info("pipeline set to state NULL")
        if self.webrtcbin:
            await asyncio.to_thread(self.webrtcbin.set_state, Gst.State.NULL)
            self.webrtcbin = None
            logger_gstwebrtc_app.info("webrtcbin set to state NULL")
        logger_gstwebrtc_app.info("pipeline stopped")
    class PlayoutDelayExtension(GstRtp.RTPHeaderExtension):
        def __init__(self):
            super().__init__()
            self.min_delay = 0
            self.max_delay = 0
            self.set_uri("http://www.webrtc.org/experiments/rtp-hdrext/playout-delay")
        def do_get_supported_flags(self):
            return (
                GstRtp.RTPHeaderExtensionFlags.ONE_BYTE
                | GstRtp.RTPHeaderExtensionFlags.TWO_BYTE
            )
        def do_get_max_size(self, input_meta):
            return 3
        def do_write(self, input_meta, write_flags, output, data, size):
            return 3
        def do_read(self, read_flags, data, size, buffer):
            self.min_delay = (data[0] << 4) | (data[1] >> 4)
            self.max_delay = ((data[1] & 0x0F) << 8) | data[2]
            return True
class Metrics:
    def __init__(self, port=8000, using_webrtc_csv=False):
        self.port = port
        self.fps = Gauge("fps", "Frames per second observed by client")
        self.fps_hist = Histogram(
            "fps_hist", "Histogram of FPS observed by client", buckets=FPS_HIST_BUCKETS
        )
        self.gpu_utilization = Gauge(
            "gpu_utilization", "Utilization percentage reported by GPU"
        )
        self.latency = Gauge("latency", "Latency observed by client")
        self.webrtc_statistics = Info(
            "webrtc_statistics", "WebRTC Statistics from the client"
        )
        self.using_webrtc_csv = using_webrtc_csv
        self.stats_video_file_path = None
        self.stats_audio_file_path = None
        self.prev_stats_video_header_len = None
        self.prev_stats_audio_header_len = None
    def set_fps(self, fps):
        self.fps.set(fps)
        self.fps_hist.observe(fps)
    def set_gpu_utilization(self, utilization):
        self.gpu_utilization.set(utilization)
    def set_latency(self, latency_ms):
        self.latency.set(latency_ms)
    async def start_http(self):
        await asyncio.to_thread(start_http_server, self.port)
    async def set_webrtc_stats(self, webrtc_stat_type, webrtc_stats):
        webrtc_stats_obj = await asyncio.to_thread(json.loads, webrtc_stats)
        sanitized_stats = await asyncio.to_thread(
            self.sanitize_json_stats, webrtc_stats_obj
        )
        if self.using_webrtc_csv:
            if webrtc_stat_type == "_stats_audio":
                asyncio.create_task(
                    asyncio.to_thread(
                        self.write_webrtc_stats_csv,
                        sanitized_stats,
                        self.stats_audio_file_path,
                    )
                )
            else:
                asyncio.create_task(
                    asyncio.to_thread(
                        self.write_webrtc_stats_csv,
                        sanitized_stats,
                        self.stats_video_file_path,
                    )
                )
        await asyncio.to_thread(self.webrtc_statistics.info, sanitized_stats)
    def sanitize_json_stats(self, obj_list):
        obj_type = []
        sanitized_stats = OrderedDict()
        for i in range(len(obj_list)):
            curr_key = obj_list[i].get("type")
            if curr_key in obj_type:
                curr_key = curr_key + str("-") + obj_list[i].get("id")
                obj_type.append(curr_key)
            else:
                obj_type.append(curr_key)
            for key, val in obj_list[i].items():
                unique_type = curr_key + str(".") + key
                if not isinstance(val, str):
                    sanitized_stats[unique_type] = str(val)
                else:
                    sanitized_stats[unique_type] = val
        return sanitized_stats
    def write_webrtc_stats_csv(self, obj, file_path):
        dt = datetime.now()
        timestamp = dt.strftime("%d/%B/%Y:%H:%M:%S")
        try:
            with open(file_path, "a+") as stats_file:
                csv_writer = csv.writer(stats_file, quotechar='"')
                headers = ["timestamp"]
                headers += obj.keys()
                if len(headers) < 15:
                    return
                values = [timestamp]
                for val in obj.values():
                    values.extend(
                        [
                            '"{}"'.format(val)
                            if isinstance(val, str) and ";" in val
                            else val
                        ]
                    )
                if "audio" in file_path:
                    if self.prev_stats_audio_header_len is None:
                        csv_writer.writerow(headers)
                        csv_writer.writerow(values)
                        self.prev_stats_audio_header_len = len(headers)
                    elif self.prev_stats_audio_header_len == len(headers):
                        csv_writer.writerow(values)
                    else:
                        self.prev_stats_audio_header_len = self.update_webrtc_stats_csv(
                            file_path, headers, values
                        )
                else:
                    if self.prev_stats_video_header_len is None:
                        csv_writer.writerow(headers)
                        csv_writer.writerow(values)
                        self.prev_stats_video_header_len = len(headers)
                    elif self.prev_stats_video_header_len == len(headers):
                        csv_writer.writerow(values)
                    else:
                        self.prev_stats_video_header_len = self.update_webrtc_stats_csv(
                            file_path, headers, values
                        )
        except Exception as e:
            logger_metrics.error("writing WebRTC Statistics to CSV file: " + str(e))
    def update_webrtc_stats_csv(self, file_path, headers, values):
        prev_headers = None
        prev_values = []
        try:
            with open(file_path, "r") as stats_file:
                csv_reader = csv.reader(stats_file, delimiter=",")
                header_indicator = 0
                for row in csv_reader:
                    if header_indicator == 0:
                        prev_headers = row
                        header_indicator += 1
                    else:
                        prev_values.append(row)
                if len(headers) < len(prev_headers):
                    for i in prev_headers:
                        if i not in headers:
                            values.insert(prev_headers.index(i), "NaN")
                else:
                    i, j, k = 0, 0, 0
                    while i < len(headers):
                        if headers[i] != prev_headers[j]:
                            for row in prev_values:
                                row.insert(i, "NaN")
                            i += 1
                            k += 1
                        else:
                            i += 1
                            j += 1
                    j += k
                    while j < i:
                        for row in prev_values:
                            row.insert(j, "NaN")
                        j += 1
                if len(prev_values[0]) != len(values):
                    logger_metrics.warning(
                        "There's a mismatch; columns could be misaligned with headers"
                    )
            if os.path.exists(file_path):
                os.remove(file_path)
            else:
                logger_metrics.warning(
                    "File {} doesn't exist to purge".format(file_path)
                )
            with open(file_path, "a") as stats_file:
                csv_writer = csv.writer(stats_file)
                if len(headers) > len(prev_headers):
                    csv_writer.writerow(headers)
                else:
                    csv_writer.writerow(prev_headers)
                csv_writer.writerows(prev_values)
                csv_writer.writerow(values)
                logger_metrics.debug(
                    "WebRTC Statistics file {} created with updated data".format(
                        file_path
                    )
                )
            return (
                len(headers) if len(headers) > len(prev_headers) else len(prev_headers)
            )
        except Exception as e:
            logger_metrics.error("writing WebRTC Statistics to CSV file: " + str(e))
    def initialize_webrtc_csv_file(self, webrtc_stats_dir="/tmp"):
        dt = datetime.now()
        timestamp = dt.strftime("%Y-%m-%d:%H:%M:%S")
        self.stats_video_file_path = "{}/selkies-stats-video-{}.csv".format(
            webrtc_stats_dir, timestamp
        )
        self.stats_audio_file_path = "{}/selkies-stats-audio-{}.csv".format(
            webrtc_stats_dir, timestamp
        )
        self.prev_stats_video_header_len = None
        self.prev_stats_audio_header_len = None
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
                logger_signaling.info("{!r} command {!r}".format(uid, msg))
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
class SystemMonitor:
    def __init__(self, period=1, enabled=True):
        self.period = period
        self.enabled = enabled
        self.running = False
        self.cpu_percent = 0
        self.mem_total = 0
        self.mem_used = 0
        self.on_timer = lambda: logger_system_monitor.warning("unhandled on_timer")
    async def start(self):
        self.running = True
        while self.running:
            if self.enabled and int(time.time()) % self.period == 0:
                self.cpu_percent = psutil.cpu_percent()
                mem = psutil.virtual_memory()
                self.mem_total = mem.total
                self.mem_used = mem.used
                self.on_timer(time.time())
            await asyncio.sleep(0.5)
        logger_system_monitor.info("system monitor stopped")
    def stop(self):
        self.running = False
class WebRTCInputError(Exception):
    pass
class WebRTCInput:
    def __init__(
        self,
        uinput_mouse_socket_path="",
        js_socket_path="",
        enable_clipboard="",
        enable_cursors=True,
        cursor_size=16,
        cursor_scale=1.0,
        cursor_debug=False,
    ):
        self.clipboard_running = False
        self.uinput_mouse_socket_path = uinput_mouse_socket_path
        self.uinput_mouse_socket = None
        self.js_socket_path_map = {
            i: os.path.join(js_socket_path, "selkies_js%d.sock" % i) for i in range(4)
        }
        self.js_map = {}
        self.enable_clipboard = enable_clipboard
        self.enable_cursors = enable_cursors
        self.cursors_running = False
        self.cursor_cache = {}
        self.cursor_scale = cursor_scale
        self.cursor_size = cursor_size
        self.cursor_debug = cursor_debug
        self.keyboard = None
        self.mouse = None
        self.joystick = None
        self.xdisplay = None
        self.button_mask = 0
        self.ping_start = None
        self.on_video_encoder_bit_rate = lambda bitrate: logger_webrtc_input.warning(
            "unhandled on_video_encoder_bit_rate"
        )
        self.on_audio_encoder_bit_rate = lambda bitrate: logger_webrtc_input.warning(
            "unhandled on_audio_encoder_bit_rate"
        )
        self.on_mouse_pointer_visible = lambda visible: logger_webrtc_input.warning(
            "unhandled on_mouse_pointer_visible"
        )
        self.on_clipboard_read = lambda data: logger_webrtc_input.warning(
            "unhandled on_clipboard_read"
        )
        self.on_set_fps = lambda fps: logger_webrtc_input.warning(
            "unhandled on_set_fps"
        )
        self.on_set_enable_resize = (
            lambda enable_resize, res: logger_webrtc_input.warning(
                "unhandled on_set_enable_resize"
            )
        )
        self.on_client_fps = lambda fps: logger_webrtc_input.warning(
            "unhandled on_client_fps"
        )
        self.on_client_latency = lambda latency: logger_webrtc_input.warning(
            "unhandled on_client_latency"
        )
        self.on_resize = lambda res: logger_webrtc_input.warning("unhandled on_resize")
        self.on_scaling_ratio = lambda res: logger_webrtc_input.warning(
            "unhandled on_scaling_ratio"
        )
        self.on_ping_response = lambda latency: logger_webrtc_input.warning(
            "unhandled on_ping_response"
        )
        self.on_cursor_change = lambda msg: logger_webrtc_input.warning(
            "unhandled on_cursor_change"
        )
        self.on_client_webrtc_stats = (
            lambda webrtc_stat_type, webrtc_stats: logger_webrtc_input.warning(
                "unhandled on_client_webrtc_stats"
            )
        )
    def __keyboard_connect(self):
        self.keyboard = pynput.keyboard.Controller()
    def __mouse_connect(self):
        if self.uinput_mouse_socket_path:
            logger_webrtc_input.info(
                "Connecting to uinput mouse socket: %s" % self.uinput_mouse_socket_path
            )
            self.uinput_mouse_socket = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        self.mouse = pynput.mouse.Controller()
    def __mouse_disconnect(self):
        if self.mouse:
            del self.mouse
            self.mouse = None
    def __mouse_emit(self, *args, **kwargs):
        if self.uinput_mouse_socket_path:
            cmd = {"args": args, "kwargs": kwargs}
            data = msgpack.packb(cmd, use_bin_type=True)
            self.uinput_mouse_socket.sendto(data, self.uinput_mouse_socket_path)
    def __js_connect(self, js_num, name, num_btns, num_axes):
        logger_webrtc_input.info(
            "creating selkies gamepad for js%d, name: '%s', buttons: %d, axes: %d"
            % (js_num, name, num_btns, num_axes)
        )
        socket_path = self.js_socket_path_map.get(js_num, None)
        if socket_path is None:
            logger_webrtc_input.error(
                "failed to connect js%d because socket_path was not found" % js_num
            )
            return
        js = SelkiesGamepad(socket_path)
        js.set_config(name, num_btns, num_axes)
        asyncio.create_task(js.run_server())
        self.js_map[js_num] = js
    async def __js_disconnect(self, js_num=None):
        if js_num is None:
            for js in self.js_map.values():
                await asyncio.to_thread(js.stop_server)
            self.js_map = {}
            return
        js = await asyncio.to_thread(self.js_map.get, js_num, None)
        if js is not None:
            logger_webrtc_input.info("stopping gamepad %d" % js_num)
            await asyncio.to_thread(js.stop_server)
            del self.js_map[js_num]
    def __js_emit_btn(self, js_num, btn_num, btn_val):
        js = self.js_map.get(js_num, None)
        if js is None:
            logger_webrtc_input.error(
                "cannot send button because js%d is not connected" % js_num
            )
            return
        logger_webrtc_input.debug(
            "sending js%d button num %d with val %d" % (js_num, btn_num, btn_val)
        )
        js.send_btn(btn_num, btn_val)
    def __js_emit_axis(self, js_num, axis_num, axis_val):
        js = self.js_map.get(js_num, None)
        if js is None:
            logger_webrtc_input.error(
                "cannot send axis because js%d is not connected" % js_num
            )
            return
        logger_webrtc_input.debug(
            "sending js%d axis num %d with val %d" % (js_num, axis_num, axis_val)
        )
        js.send_axis(axis_num, axis_val)
    async def connect(self):
        self.xdisplay = display.Display()
        self.__keyboard_connect()
        self.reset_keyboard()
        self.__mouse_connect()
    async def disconnect(self):
        await self.__js_disconnect()
        self.__mouse_disconnect()
    def reset_keyboard(self):
        logger_webrtc_input.info("Resetting keyboard modifiers.")
        lctrl = 65507
        lshift = 65505
        lalt = 65513
        rctrl = 65508
        rshift = 65506
        ralt = 65027
        lmeta = 65511
        rmeta = 65512
        keyf = 102
        keyF = 70
        keym = 109
        keyM = 77
        escape = 65307
        for k in [
            lctrl,
            lshift,
            lalt,
            rctrl,
            rshift,
            ralt,
            lmeta,
            rmeta,
            keyf,
            keyF,
            keym,
            keyM,
            escape,
        ]:
            self.send_x11_keypress(k, down=False)
    def send_mouse(self, action, data):
        if action == MOUSE_POSITION:
            if self.mouse:
                self.mouse.position = data
        elif action == MOUSE_MOVE:
            x, y = data
            if self.uinput_mouse_socket_path:
                self.__mouse_emit(UINPUT_REL_X, x, syn=False)
                self.__mouse_emit(UINPUT_REL_Y, y)
            else:
                xtest.fake_input(
                    self.xdisplay,
                    Xlib.X.MotionNotify,
                    detail=True,
                    root=Xlib.X.NONE,
                    x=x,
                    y=y,
                )
                self.xdisplay.sync()
        elif action == MOUSE_SCROLL_UP:
            if self.uinput_mouse_socket_path:
                self.__mouse_emit(UINPUT_REL_WHEEL, 1)
            else:
                self.mouse.scroll(0, -1)
        elif action == MOUSE_SCROLL_DOWN:
            if self.uinput_mouse_socket_path:
                self.__mouse_emit(UINPUT_REL_WHEEL, -1)
            else:
                self.mouse.scroll(0, 1)
        elif action == MOUSE_BUTTON:
            if self.uinput_mouse_socket_path:
                btn = MOUSE_BUTTON_MAP[data[1]]["uinput"]
            else:
                btn = MOUSE_BUTTON_MAP[data[1]]["pynput"]
            if data[0] == MOUSE_BUTTON_PRESS:
                if self.uinput_mouse_socket_path:
                    self.__mouse_emit(btn, 1)
                else:
                    self.mouse.press(btn)
            else:
                if self.uinput_mouse_socket_path:
                    self.__mouse_emit(btn, 0)
                else:
                    self.mouse.release(btn)
    def send_x11_keypress(self, keysym, down=True):
        try:
            if keysym == 60 and self.keyboard._display.keysym_to_keycode(keysym) == 94:
                keysym = 44
            keycode = pynput.keyboard.KeyCode(keysym)
            if down:
                self.keyboard.press(keycode)
            else:
                self.keyboard.release(keycode)
        except Exception as e:
            logger_webrtc_input.error("failed to send keypress: {}".format(e))
    def send_x11_mouse(self, x, y, button_mask, scroll_magnitude, relative=False):
        if relative:
            self.send_mouse(MOUSE_MOVE, (x, y))
        else:
            self.send_mouse(MOUSE_POSITION, (x, y))
        if button_mask != self.button_mask:
            max_buttons = 5
            for i in range(0, max_buttons):
                if (button_mask ^ self.button_mask) & (1 << i):
                    action = MOUSE_BUTTON
                    btn_action = MOUSE_BUTTON_PRESS
                    btn_num = MOUSE_BUTTON_LEFT
                    if button_mask & (1 << i):
                        btn_action = MOUSE_BUTTON_PRESS
                    else:
                        btn_action = MOUSE_BUTTON_RELEASE
                    if i == 1:
                        btn_num = MOUSE_BUTTON_MIDDLE
                    elif i == 2:
                        btn_num = MOUSE_BUTTON_RIGHT
                    elif i == 3 and button_mask != 0:
                        action = MOUSE_SCROLL_UP
                    elif i == 4 and button_mask != 0:
                        action = MOUSE_SCROLL_DOWN
                    data = (btn_action, btn_num)
                    if i == 3 or i == 4:
                        for i in range(1, scroll_magnitude):
                            self.send_mouse(action, data)
                    self.send_mouse(action, data)
            self.button_mask = button_mask
        if not relative:
            self.xdisplay.sync()
    def read_clipboard(self):
        try:
            result = subprocess.run(
                ("xsel", "--clipboard", "--output"),
                check=True,
                text=True,
                capture_output=True,
                timeout=3,
            )
            return result.stdout
        except subprocess.SubprocessError as e:
            logger_webrtc_input.warning(f"Error while capturing clipboard: {e}")
    def write_clipboard(self, data):
        try:
            subprocess.run(
                ("xsel", "--clipboard", "--input"),
                input=data.encode(),
                check=True,
                timeout=3,
            )
            return True
        except subprocess.SubprocessError as e:
            logger_webargparseargparsertc_input.warning(f"Error while writing to clipboard: {e}")
            return False
    async def start_clipboard(self):
        if self.enable_clipboard in ["true", "out"]:
            logger_webrtc_input.info("starting clipboard monitor")
            self.clipboard_running = True
            last_data = ""
            while self.clipboard_running:
                curr_data = self.read_clipboard()
                if curr_data and curr_data != last_data:
                    logger_webrtc_input.info(
                        "sending clipboard content, length: %d" % len(curr_data)
                    )
                    self.on_clipboard_read(curr_data)
                    last_data = curr_data
                await asyncio.sleep(0.5)
            logger_webrtc_input.info("clipboard monitor stopped")
        else:
            logger_webrtc_input.info("skipping outbound clipboard service.")
    def stop_clipboard(self):
        logger_webrtc_input.info("stopping clipboard monitor")
        self.clipboard_running = False
    async def start_cursor_monitor(self):
        if not self.xdisplay.has_extension("XFIXES"):
            if self.xdisplay.query_extension("XFIXES") is None:
                logger_webrtc_input.error(
                    "XFIXES extension not supported, cannot watch cursor changes"
                )
                return
        xfixes_version = self.xdisplay.xfixes_query_version()
        logger_webrtc_input.info(
            "Found XFIXES version %s.%s"
            % (
                xfixes_version.major_version,
                xfixes_version.minor_version,
            )
        )
        logger_webrtc_input.info("starting cursor monitor")
        self.cursor_cache = {}
        self.cursors_running = True
        screen = self.xdisplay.screen()
        self.xdisplay.xfixes_select_cursor_input(
            screen.root, xfixes.XFixesDisplayCursorNotifyMask
        )
        logger_webrtc_input.info("watching for cursor changes")
        try:
            image = self.xdisplay.xfixes_get_cursor_image(screen.root)
            self.cursor_cache[image.cursor_serial] = self.cursor_to_msg(
                image, self.cursor_scale, self.cursor_size
            )
            self.on_cursor_change(self.cursor_cache[image.cursor_serial])
        except Exception as e:
            logger_webrtc_input.warning("exception from fetching cursor image: %s" % e)
        while self.cursors_running:
            if self.xdisplay.pending_events() == 0:
                await asyncio.sleep(0.1)
                continue
            event = self.xdisplay.next_event()
            if (event.type, 0) == self.xdisplay.extension_event.DisplayCursorNotify:
                cache_key = event.cursor_serial
                if cache_key in self.cursor_cache:
                    if self.cursor_debug:
                        logger_webrtc_input.warning(
                            "cursor changed to cached serial: {}".format(cache_key)
                        )
                else:
                    try:
                        cursor = self.xdisplay.xfixes_get_cursor_image(screen.root)
                        self.cursor_cache[cache_key] = self.cursor_to_msg(
                            cursor, self.cursor_scale, self.cursor_size
                        )
                        if self.cursor_debug:
                            logger_webrtc_input.warning(
                                "New cursor: position={},{}, size={}x{}, length={}, xyhot={},{}, cursor_serial={}".format(
                                    cursor.x,
                                    cursor.y,
                                    cursor.width,
                                    cursor.height,
                                    len(cursor.cursor_image),
                                    cursor.xhot,
                                    cursor.yhot,
                                    cursor.cursor_serial,
                                )
                            )
                    except Exception as e:
                        logger_webrtc_input.warning(
                            "exception from fetching cursor image: %s" % e
                        )
                self.on_cursor_change(self.cursor_cache.get(cache_key))
        logger_webrtc_input.info("cursor monitor stopped")
    def stop_cursor_monitor(self):
        logger_webrtc_input.info("stopping cursor monitor")
        self.cursors_running = False
    def cursor_to_msg(self, cursor, scale=1.0, cursor_size=-1):
        if cursor_size > -1:
            target_width = cursor_size
            target_height = cursor_size
            xhot_scaled = int(cursor_size / cursor.width * cursor.xhot)
            yhot_scaled = int(cursor_size / cursor.height * cursor.yhot)
        else:
            target_width = int(cursor.width * scale)
            target_height = int(cursor.height * scale)
            xhot_scaled = int(cursor.xhot * scale)
            yhot_scaled = int(cursor.yhot * scale)
        png_data_b64 = base64.b64encode(
            self.cursor_to_png(cursor, target_width, target_height)
        )
        override = None
        if sum(cursor.cursor_image) == 0:
            override = "none"
        return {
            "curdata": png_data_b64.decode(),
            "handle": cursor.cursor_serial,
            "override": override,
            "hotspot": {
                "x": xhot_scaled,
                "y": yhot_scaled,
            },
        }
    def cursor_to_png(self, cursor, resize_width, resize_height):
        with io.BytesIO() as f:
            s = [((i >> b) & 0xFF) for i in cursor.cursor_image for b in [16, 8, 0, 24]]
            im = Image.frombytes("RGBA", (cursor.width, cursor.height), bytes(s), "raw")
            if cursor.width != resize_width or cursor.height != resize_height:
                im = im.resize((resize_width, resize_height))
            im.save(f, "PNG")
            data = f.getvalue()
            if self.cursor_debug:
                with open("/tmp/cursor_%d.png" % cursor.cursor_serial, "wb") as debugf:
                    debugf.write(data)
            return data
    async def stop_js_server(self):
        await self.__js_disconnect()
    async def on_message(self, msg):
        toks = msg.split(",")
        if toks[0] == "pong":
            if self.ping_start is None:
                logger_webrtc_input.warning("received pong before ping")
                return
            roundtrip = time.time() - self.ping_start
            latency = (roundtrip / 2) * 1000
            latency = float("%.3f" % latency)
            self.on_ping_response(latency)
        elif toks[0] == "kd":
            self.send_x11_keypress(int(toks[1]), down=True)
        elif toks[0] == "ku":
            self.send_x11_keypress(int(toks[1]), down=False)
        elif toks[0] == "kr":
            self.reset_keyboard()
        elif toks[0] in ["m", "m2"]:
            relative = False
            if toks[0] == "m2":
                relative = True
            try:
                x, y, button_mask, scroll_magnitude = [int(i) for i in toks[1:]]
            except:
                x, y, button_mask, scroll_magnitude = 0, 0, self.button_mask, 0
                relative = False
            try:
                self.send_x11_mouse(x, y, button_mask, scroll_magnitude, relative)
            except Exception as e:
                logger_webrtc_input.warning("failed to set mouse cursor: {}".format(e))
        elif toks[0] == "p":
            visible = bool(int(toks[1]))
            logger_webrtc_input.info("Setting pointer visibility to: %s" % str(visible))
            self.on_mouse_pointer_visible(visible)
        elif toks[0] == "vb":
            bitrate = int(toks[1])
            logger_webrtc_input.info("Setting video bitrate to: %d" % bitrate)
            self.on_video_encoder_bit_rate(bitrate)
        elif toks[0] == "ab":
            bitrate = int(toks[1])
            logger_webrtc_input.info("Setting audio bitrate to: %d" % bitrate)
            self.on_audio_encoder_bit_rate(bitrate)
        elif toks[0] == "js":
            if toks[1] == "c":
                js_num = int(toks[2])
                name = base64.b64decode(toks[3]).decode()[:255]
                num_axes = int(toks[4])
                num_btns = int(toks[5])
                self.__js_connect(js_num, name, num_btns, num_axes)
            elif toks[1] == "d":
                js_num = int(toks[2])
                await self.__js_disconnect(js_num)
            elif toks[1] == "b":
                js_num = int(toks[2])
                btn_num = int(toks[3])
                btn_val = float(toks[4])
                self.__js_emit_btn(js_num, btn_num, btn_val)
            elif toks[1] == "a":
                js_num = int(toks[2])
                axis_num = int(toks[3])
                axis_val = float(toks[4])
                self.__js_emit_axis(js_num, axis_num, axis_val)
            else:
                logger_webrtc_input.warning("unhandled joystick command: %s" % toks[1])
        elif toks[0] == "cr":
            if self.enable_clipboard in ["true", "out"]:
                data = self.read_clipboard()
                if data:
                    logger_webrtc_input.info(
                        "read clipboard content, length: %d" % len(data)
                    )
                    self.on_clipboard_read(data)
                else:
                    logger_webrtc_input.warning("no clipboard content to send")
            else:
                logger_webrtc_input.warning(
                    "rejecting clipboard read because outbound clipboard is disabled."
                )
        elif toks[0] == "cw":
            if self.enable_clipboard in ["true", "in"]:
                data = base64.b64decode(toks[1]).decode("utf-8")
                self.write_clipboard(data)
                logger_webrtc_input.info(
                    "set clipboard content, length: %d" % len(data)
                )
            else:
                logger_webrtc_input.warning(
                    "rejecting clipboard write because inbound clipboard is disabled."
                )
        elif toks[0] == "r":
            res = toks[1]
            if re.match(re.compile(r"^\d+x\d+$"), res):
                w, h = [int(i) + int(i) % 2 for i in res.split("x")]
                self.on_resize("%dx%d" % (w, h))
            else:
                logger_webrtc_input.warning(
                    "rejecting resolution change, invalid WxH resolution: %s" % res
                )
        elif toks[0] == "s":
            scale = toks[1]
            if re.match(re.compile(r"^\d+(\.\d+)?$"), scale):
                self.on_scaling_ratio(float(scale))
            else:
                logger_webrtc_input.warning(
                    "rejecting scaling change, invalid scale ratio: %s" % scale
                )
        elif toks[0] == "_arg_fps":
            fps = int(toks[1])
            logger_webrtc_input.info("Setting framerate to: %d" % fps)
            self.on_set_fps(fps)
        elif toks[0] == "_arg_resize":
            if len(toks) != 3:
                logger_webrtc_input.error(
                    "invalid _arg_resize command, expected 2 arguments <enabled>,<resolution>"
                )
            else:
                enabled = toks[1].lower() == "true"
                logger_webrtc_input.info("Setting enable_resize to : %s" % str(enabled))
                res = toks[2]
                if re.match(re.compile(r"^\d+x\d+$"), res):
                    w, h = [int(i) + int(i) % 2 for i in res.split("x")]
                    enable_res = "%dx%d" % (w, h)
                else:
                    logger_webrtc_input.warning(
                        "rejecting enable resize with resolution change to invalid resolution: %s"
                        % res
                    )
                    enable_res = None
                self.on_set_enable_resize(enabled, enable_res)
        elif toks[0] == "_f":
            try:
                fps = int(toks[1])
                self.on_client_fps(fps)
            except:
                logger_webrtc_input.error(
                    "failed to parse fps from client: " + str(toks)
                )
        elif toks[0] == "_l":
            try:
                latency_ms = int(toks[1])
                self.on_client_latency(latency_ms)
            except:
                logger_webrtc_input.error(
                    "failed to parse latency report from client" + str(toks)
                )
        elif toks[0] == "_stats_video" or toks[0] == "_stats_audio":
            try:
                await self.on_client_webrtc_stats(toks[0], ",".join(toks[1:]))
            except:
                logger_webrtc_input.error(
                    "failed to parse WebRTC Statistics JSON object"
                )
        elif toks[0] == "co":
            if toks[1] == "end":
                try:
                    subprocess.run(["xdotool", "type", toks[2]], check=True)
                except subprocess.CalledProcessError as e:
                    logger_webrtc_input.warning(f"Error calling xdotool type: {e}")
                except FileNotFoundError:
                    logger_webrtc_input.warning(f"Xdotool not found on this system: {e}")
        else:
            logger_webrtc_input.info("unknown data channel message: %s" % msg)
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
        default=os.environ.get("SELKIES_VIDEO_BITRATE", "8000"),
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
    )
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
                        on_resize_handler(meta["res"])
                    if meta["scale"]:
                        on_scaling_ratio_handler(meta["scale"])
                else:
                    logger.info("setting cursor to default size")
                    set_cursor_size(16)
            logger.info("starting video pipeline")
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
        args.uinput_mouse_socket,
        args.js_socket_path,
        args.enable_clipboard.lower(),
        enable_cursors,
        cursor_size,
        cursor_scale,
        cursor_debug,
    )
    webrtc_input.on_cursor_change = lambda data: app.send_cursor_data(data)
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
    webrtc_input.on_clipboard_read = lambda data: app.send_clipboard_data(data)
    def set_fps_handler(fps):
        set_json_app_argument(args.json_config, "framerate", fps)
        app.set_framerate(fps)
    webrtc_input.on_set_fps = lambda fps: set_fps_handler(fps)
    app.last_resize_success = True
    def on_resize_handler(res):
        curr_res, new_res, _, __, ___ = get_new_res(res)
        if curr_res != new_res:
            if not app.last_resize_success:
                logger.warning("skipping resize because last resize failed.")
                return
            logger.warning("resizing display from {} to {}".format(curr_res, new_res))
            if resize_display(res):
                app.send_remote_resolution(res)
    if enable_resize:
        webrtc_input.on_resize = on_resize_handler
    else:
        logger.info("removing handler for on_resize")
        webrtc_input.on_resize = lambda res: logger.warning(
            "remote resize is disabled, skipping resize to %s" % res
        )
    def on_scaling_ratio_handler(scale):
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
    if enable_resize:
        webrtc_input.on_scaling_ratio = on_scaling_ratio_handler
    else:
        webrtc_input.on_scaling_ratio = lambda scale: logger.warning(
            "remote resize is disabled, skipping DPI scale change to %s" % str(scale)
        )
    webrtc_input.on_ping_response = lambda latency: app.send_latency_time(latency)
    def enable_resize_handler(enabled, enable_res):
        set_json_app_argument(args.json_config, "enable_resize", enabled)
        if enabled:
            webrtc_input.on_resize = on_resize_handler
            webrtc_input.on_scaling_ratio = on_scaling_ratio_handler
            on_resize_handler(enable_res)
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
        sys.exit(0)
def entrypoint():
    asyncio.run(main())
if __name__ == "__main__":
    entrypoint()

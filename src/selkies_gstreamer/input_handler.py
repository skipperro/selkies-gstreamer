import logging
import struct
import time
import asyncio
import socket
import os
import base64
import io
import subprocess
import re
import json

import pynput
from PIL import Image
import Xlib
from Xlib import display
from Xlib import X
from Xlib.ext import xfixes, xtest
import msgpack

logger_webrtc_input = logging.getLogger("webrtc_input")
logger_selkies_gamepad = logging.getLogger("selkies_gamepad")

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

def get_btn_event(btn_num, btn_val):
    ts = int((time.time() * 1000) % 1000000000)
    struct_format = "IhBB"
    event = struct.pack(struct_format, ts, btn_val, JS_EVENT_BUTTON, btn_num)
    return event
def get_axis_event(axis_num, axis_val):
    ts = int((time.time() * 1000) % 1000000000)
    struct_format = "IhBB"
    event = struct.pack(struct_format, ts, axis_val, JS_EVENT_AXIS, axis_num)
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


class SelkiesGamepad:
    def __init__(self, socket_path):
        self.socket_path = socket_path
        self.mapper = None
        self.name = None
        self.server = None
        self.config = None
        self.clients = {}
        self.events = asyncio.Queue()
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
                await asyncio.sleep(0.01)
                continue
            while self.running and not self.events.empty():
                event = await self.events.get()
                await self.send_event(event)
                self.events.task_done()
    def send_btn(self, btn_num, btn_val):
        if not self.mapper:
            logger_selkies_gamepad.warning(
                "failed to send js button event because mapper was not set"
            )
            return
        event = self.mapper.get_mapped_btn(btn_num, btn_val)
        if event is not None:
            self.events.put_nowait(event)
    def send_axis(self, axis_num, axis_val):
        if not self.mapper:
            logger_selkies_gamepad.warning(
                "failed to send js axis event because mapper was not set"
            )
            return
        event = self.mapper.get_mapped_axis(axis_num, axis_val)
        if event is not None:
            self.events.put_nowait(event)
    async def send_event(self, event):
        if len(self.clients) < 1:
            return
        closed_clients = []
        for fd in self.clients:
            try:
                client = self.clients[fd]
                await asyncio.get_running_loop().sock_sendall(client, event)
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
            await asyncio.get_running_loop().sock_sendall(client, config_data)
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
                    client, _ = await asyncio.get_running_loop().sock_accept(self.server)
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


class WebRTCInputError(Exception):
    pass
class WebRTCInput:
    def __init__(
        self,
        gst_webrtc_app,
        uinput_mouse_socket_path="",
        js_socket_path="",
        enable_clipboard="",
        enable_cursors=True,
        cursor_size=16,
        cursor_scale=1.0,
        cursor_debug=False,
    ):
        self.gst_webrtc_app = gst_webrtc_app
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
        self.on_clipboard_read = self._on_clipboard_read # Changed to use self._on_clipboard_read
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
        self.on_cursor_change = self._on_cursor_change # Changed to use self._on_cursor_change
        self.on_client_webrtc_stats = (
            lambda webrtc_stat_type, webrtc_stats: logger_webrtc_input.warning(
                "unhandled on_client_webrtc_stats"
            )
        )

    def _on_clipboard_read(self, data):
        self.send_clipboard_data(data)

    def _on_cursor_change(self, data):
        self.send_cursor_data(data)

    def send_clipboard_data(self, data):
        if self.gst_webrtc_app.mode == "websockets":
            self.gst_webrtc_app.send_ws_clipboard_data(data)
        else:
            self.gst_webrtc_app.send_clipboard_data(data)

    def send_cursor_data(self, data):
        if self.gst_webrtc_app.mode == "websockets":
            self.gst_webrtc_app.send_ws_cursor_data(data)
        else:
            self.gst_webrtc_app.send_cursor_data(data)


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
        js.send_btn(btn_num, btn_val)
    def __js_emit_axis(self, js_num, axis_num, axis_val):
        js = self.js_map.get(js_num, None)
        if js is None:
            logger_webrtc_input.error(
                "cannot send axis because js%d is not connected" % js_num
            )
            return
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
            logger_webrtc_input.warning(f"Error while writing to clipboard: {e}")
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
                    pass
                else:
                    try:
                        cursor = self.xdisplay.xfixes_get_cursor_image(screen.root)
                        self.cursor_cache[cache_key] = self.cursor_to_msg(
                            cursor, self.cursor_scale, self.cursor_size
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
                self.__js_connect(js_num, name, num_axes, num_btns)
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

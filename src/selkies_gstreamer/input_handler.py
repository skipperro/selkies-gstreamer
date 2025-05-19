# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#   http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import ctypes
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

# EVDEV Event Codes (from linux/input-event-codes.h)
EV_SYN = 0x00
EV_KEY = 0x01
EV_REL = 0x02
EV_ABS = 0x03
EV_MSC = 0x04
SYN_REPORT = 0

# Mouse Button Codes (from linux/input-event-codes.h)
BTN_MOUSE = 0x110
BTN_LEFT = 0x110
BTN_RIGHT = 0x111
BTN_MIDDLE = 0x112
BTN_SIDE = 0x113
BTN_EXTRA = 0x114

# Gamepad Button Codes
BTN_A = 0x130  # Or BTN_SOUTH
BTN_B = 0x131  # Or BTN_EAST
BTN_X = 0x133  # Or BTN_NORTH
BTN_Y = 0x134  # Or BTN_WEST
BTN_TL = 0x136 # Left Bumper
BTN_TR = 0x137 # Right Bumper
BTN_SELECT = 0x13a
BTN_START = 0x13b
BTN_MODE = 0x13c # Xbox/Guide button
BTN_THUMBL = 0x13d # Left Thumbstick click
BTN_THUMBR = 0x13e # Right Thumbstick click

# Absolute Axis Codes
ABS_X = 0x00
ABS_Y = 0x01
ABS_Z = 0x02      # Often Left Trigger
ABS_RX = 0x03
ABS_RY = 0x04
ABS_RZ = 0x05     # Often Right Trigger
ABS_HAT0X = 0x10
ABS_HAT0Y = 0x11

# JS Event types (from linux/joystick.h, used by the JS-like interface)
JS_EVENT_BUTTON = 0x01
JS_EVENT_AXIS = 0x02
JS_EVENT_INIT = 0x80

# For js_config_t struct packing for the C interposer
# These are the max sizes in the C struct js_config_t
INTERPOSER_MAX_BTNS = 512
INTERPOSER_MAX_AXES = 64
CONTROLLER_NAME_MAX_LEN = 255 

# For mouse input to send fake back and forward events
KEYSYM_ALT_L = 0xFFE9     # Left Alt keysym
KEYSYM_LEFT_ARROW = 0xFF51 # Left Arrow keysym
KEYSYM_RIGHT_ARROW = 0xFF53# Right Arrow keysym

class JsConfigCtypes(ctypes.Structure):
    _fields_ = [
        ("name", ctypes.c_char * CONTROLLER_NAME_MAX_LEN),
        ("vendor", ctypes.c_uint16),
        ("product", ctypes.c_uint16),
        ("version", ctypes.c_uint16),
        ("num_btns", ctypes.c_uint16),
        ("num_axes", ctypes.c_uint16),
        ("btn_map", ctypes.c_uint16 * INTERPOSER_MAX_BTNS),
        ("axes_map", ctypes.c_uint8 * INTERPOSER_MAX_AXES),
        ("final_alignment_padding", ctypes.c_uint8 * 6) # NEW FIELD
    ]

    def pack_to_bytes(self):
        # This format string MUST exactly match the order and types in _fields_
        # and the C struct, assuming standard C packing ('=').
        # '=' means standard C types, native byte order, and proper padding.
        # 's' for char array (name) - ctypes.c_char * X is like char[X]
        # 'H' for uint16_t
        # 'B' for uint8_t
        # 'x' can be used for explicit padding if needed, but '=' should handle most.

        # Construct the format string dynamically based on constants
        # This is robust if INTERPOSER_MAX_BTNS or AXES changes.
        pack_format = f"={CONTROLLER_NAME_MAX_LEN}sHHHHH{INTERPOSER_MAX_BTNS}H{INTERPOSER_MAX_AXES}B"
        
        # Ensure name is bytes and correctly truncated/padded for fixed-size char array
        name_bytes = self.name.encode('utf-8')[:CONTROLLER_NAME_MAX_LEN]
        # Pad with nulls if shorter than CONTROLLER_NAME_MAX_LEN
        name_bytes = name_bytes.ljust(CONTROLLER_NAME_MAX_LEN, b'\0')

        return struct.pack(
            pack_format,
            name_bytes, # Must be bytes
            self.vendor,
            self.product,
            self.version,
            self.num_btns,
            self.num_axes,
            *self.btn_map,  # Unpack the array
            *self.axes_map   # Unpack the array
        )

# Get the size of the C-compatible struct
EXPECTED_C_STRUCT_SIZE = ctypes.sizeof(JsConfigCtypes)
logging.info(f"Expected C js_config_t size (from ctypes): {EXPECTED_C_STRUCT_SIZE} bytes")


ABS_MIN_VAL = -32767
ABS_MAX_VAL = 32767
ABS_TRIGGER_MIN_VAL = 0 # Triggers often 0-255 or 0-1023 for EVDEV
ABS_TRIGGER_MAX_VAL = 255 # Or 1023, or ABS_MAX_VAL depending on driver expectation
ABS_HAT_MIN_VAL = -1
ABS_HAT_MAX_VAL = 1


STANDARD_XPAD_CONFIG = {
    "name": "Selkies Xbox360 Controller",
    "vendor_id": 0x045e,  # Microsoft
    "product_id": 0x028e, # Xbox 360 Wired Controller (example, 028f is also common)
    "version_id": 0x0101, # Example version
    # EVDEV codes, indexed by internal abstract button number (0 to N-1)
    "btn_map": [
        BTN_A, BTN_B, BTN_X, BTN_Y, BTN_TL, BTN_TR,
        BTN_SELECT, BTN_START, BTN_MODE, BTN_THUMBL, BTN_THUMBR,
    ],
    # EVDEV codes, indexed by internal abstract axis number (0 to N-1)
    "axes_map": [
        ABS_X, ABS_Y, ABS_Z, ABS_RX, ABS_RY, ABS_RZ, ABS_HAT0X, ABS_HAT0Y
    ],
    "mapping": { # Maps client (e.g., HTML5 Gamepad API) button/axis numbers
                 # to our internal abstract button/axis *indices* (0 to N-1)
        "btns": { # client_btn_idx -> internal_abstract_btn_idx
            0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5,
            8: 6, 9: 7, 16: 8, 10: 9, 11: 10,
        },
        "axes": { # client_axis_idx -> internal_abstract_axis_idx
            0: 0, # Left Stick X  -> internal abstract idx 0 (ABS_X)
            1: 1, # Left Stick Y  -> internal abstract idx 1 (ABS_Y)
            2: 3, # Right Stick X -> internal abstract idx 3 (ABS_RX)
            3: 4, # Right Stick Y -> internal abstract idx 4 (ABS_RY)
        },
        # Client buttons that map to an internal abstract axis
        # client_btn_idx -> internal_abstract_axis_idx
        "client_btns_to_internal_axes": {
            6: 2, # Client Btn 6 (LT) -> internal abstract axis idx 2 (ABS_Z)
            7: 5, # Client Btn 7 (RT) -> internal abstract axis idx 5 (ABS_RZ)
        },
        # Client buttons that map to HAT axes
        # client_btn_idx -> (internal_abstract_axis_idx_for_HAT, hat_direction_value)
        "dpad_to_hat": {
            12: (7, -1), # Up    -> internal abstract HAT Y (idx 7 is ABS_HAT0Y), value -1
            13: (7, 1),  # Down  -> internal abstract HAT Y (idx 7 is ABS_HAT0Y), value 1
            14: (6, -1), # Left  -> internal abstract HAT X (idx 6 is ABS_HAT0X), value -1
            15: (6, 1),  # Right -> internal abstract HAT X (idx 6 is ABS_HAT0X), value 1
        },
        # Internal abstract axis indices that are triggers (and expect 0-1 values from client)
        "trigger_internal_abstract_axis_indices": [2, 5], # ABS_Z, ABS_RZ
        # Internal abstract axis indices that are HATs
        "hat_internal_abstract_axis_indices": [6, 7], # ABS_HAT0X, ABS_HAT0Y
    }
}

# --- Event Packing Functions ---
def get_js_event_packed(ev_type, number, value):
    """Packs a js_event struct."""
    # struct js_event { __u32 time; __s16 value; __u8 type; __u8 number; };
    ts_ms = int(time.time() * 1000) & 0xFFFFFFFF # Ensure it fits in u32
    return struct.pack("=IhbB", ts_ms, int(value), ev_type, number)

def get_evdev_events_packed(ev_type, ev_code, ev_value, client_arch_bits):
    """Packs an input_event struct and a SYN_REPORT, using client architecture for timeval."""
    # struct input_event { struct timeval time; __u16 type; __u16 code; __s32 value; };
    # struct timeval { time_t tv_sec; suseconds_t tv_usec; };
    # time_t and suseconds_t are 'long' on 32-bit, 'long long' (usually) on 64-bit for tv_sec,
    # and 'long' for tv_usec. The C interposer sends sizeof(unsigned long).
    
    now = time.time()
    ts_sec = int(now)
    ts_usec = int((now - ts_sec) * 1_000_000)

    if client_arch_bits == 64: # Assuming 'long' is 8 bytes for timeval members on 64-bit client
        timeval_fmt = "qq" # tv_sec (long long), tv_usec (long long)
    else: # Assuming 'long' is 4 bytes for timeval members on 32-bit client
        timeval_fmt = "ll" # tv_sec (long), tv_usec (long)
    
    event_fmt = f"={timeval_fmt}HHi" # Native byte order, timeval, type, code, value

    event_data = struct.pack(event_fmt, ts_sec, ts_usec, ev_type, ev_code, int(ev_value))
    syn_event_data = struct.pack(event_fmt, ts_sec, ts_usec, EV_SYN, SYN_REPORT, 0)
    return event_data + syn_event_data

def normalize_axis_value(client_value, is_trigger, is_hat):
    """Normalizes client axis value (-1 to 1, or 0 to 1 for triggers) to EVDEV/JS range."""
    if is_hat: # Client sends -1, 0, or 1 for HATs (via DPad buttons mapping)
        return int(max(ABS_HAT_MIN_VAL, min(ABS_HAT_MAX_VAL, round(client_value))))
    if is_trigger: # Client sends 0.0 to 1.0
        # Map 0..1 to EVDEV trigger range (e.g., 0..255 or 0..ABS_MAX_VAL)
        # For JS, triggers are often also -32k to 32k, or 0 to 32k.
        return int(ABS_MIN_VAL + client_value * (ABS_MAX_VAL - ABS_MIN_VAL)) # Map 0..1 to -32k..+32k
    # Regular axis: client sends -1.0 to 1.0
    return int(ABS_MIN_VAL + ((client_value + 1) / 2) * (ABS_MAX_VAL - ABS_MIN_VAL))


class GamepadMapper:
    def __init__(self, config_template, client_input_name, client_num_btns, client_num_axes):
        self.config = config_template # This is STANDARD_XPAD_CONFIG
        self.client_input_name = client_input_name
        # client_num_btns, client_num_axes are for info, mapping is fixed by self.config

    def get_mapped_events(self, client_event_idx, client_value, is_button_event):
        js_event_data = None
        evdev_event_template = None # (type, code, value)

        # 1. Determine internal abstract index and if it's a button, axis, trigger, or hat
        internal_abstract_idx = -1
        is_trigger_axis = False
        is_hat_axis = False
        target_evdev_type = None

        if is_button_event:
            # D-Pad buttons map to HAT axes
            if client_event_idx in self.config["mapping"]["dpad_to_hat"]:
                internal_abstract_idx, hat_direction_value = self.config["mapping"]["dpad_to_hat"][client_event_idx]
                is_hat_axis = True
                target_evdev_type = EV_ABS
                # Value for HAT axis is hat_direction_value if button pressed (client_value=1), else 0
                final_value = hat_direction_value * int(client_value)
            # Triggers (if they come as client buttons) map to internal axes
            elif client_event_idx in self.config["mapping"]["client_btns_to_internal_axes"]:
                internal_abstract_idx = self.config["mapping"]["client_btns_to_internal_axes"][client_event_idx]
                is_trigger_axis = internal_abstract_idx in self.config["mapping"]["trigger_internal_abstract_axis_indices"]
                target_evdev_type = EV_ABS
                final_value = client_value # 0.0 to 1.0
            # Regular buttons
            else:
                internal_abstract_idx = self.config["mapping"]["btns"].get(client_event_idx)
                target_evdev_type = EV_KEY
                final_value = int(client_value) # 0 or 1
        else: # Axis event from client
            internal_abstract_idx = self.config["mapping"]["axes"].get(client_event_idx)
            is_trigger_axis = internal_abstract_idx in self.config["mapping"]["trigger_internal_abstract_axis_indices"]
            is_hat_axis = internal_abstract_idx in self.config["mapping"]["hat_internal_abstract_axis_indices"]
            target_evdev_type = EV_ABS
            final_value = client_value # -1.0 to 1.0 (or 0.0 to 1.0 if client sends triggers as axes)

        if internal_abstract_idx is None or internal_abstract_idx < 0:
            # logger_selkies_gamepad.debug(f"Unmapped client event: idx={client_event_idx}, val={client_value}, is_btn={is_button_event}")
            return None

        # 2. Get EVDEV code and normalized value
        evdev_code = -1
        normalized_value_for_events = 0

        if target_evdev_type == EV_KEY: # Button
            if 0 <= internal_abstract_idx < len(self.config["btn_map"]):
                evdev_code = self.config["btn_map"][internal_abstract_idx]
                normalized_value_for_events = final_value # Already 0 or 1
            else: return None # Invalid internal abstract button index
        elif target_evdev_type == EV_ABS: # Axis, Trigger, or HAT
            if 0 <= internal_abstract_idx < len(self.config["axes_map"]):
                evdev_code = self.config["axes_map"][internal_abstract_idx]
                normalized_value_for_events = normalize_axis_value(final_value, is_trigger_axis, is_hat_axis)
            else: return None # Invalid internal abstract axis index
        else:
            return None # Should not happen

        # 3. Create event data/templates
        if evdev_code != -1:
            # JS events use the internal abstract index as 'number'
            js_event_type = JS_EVENT_BUTTON if target_evdev_type == EV_KEY else JS_EVENT_AXIS
            js_event_data = get_js_event_packed(js_event_type, internal_abstract_idx, normalized_value_for_events)
            
            evdev_event_template = (target_evdev_type, evdev_code, normalized_value_for_events)
            
            return {'js_event_data': js_event_data, 'evdev_event_template': evdev_event_template}
        
        return None


class SelkiesGamepad:
    def __init__(self, js_interposer_socket_path, evdev_interposer_socket_path, loop=None):
        self.js_sock_path = js_interposer_socket_path
        self.evdev_sock_path = evdev_interposer_socket_path
        self.loop = loop or asyncio.get_event_loop()
        
        self.mapper = None # Set by set_config
        self.config_payload_cache = None # Cache for js_config_t

        self.js_server = None
        self.evdev_server = None
        self.js_clients = {} # {writer: {'arch_bits': bits}}
        self.evdev_clients = {} # {writer: {'arch_bits': bits}}
        
        self.events_queue = asyncio.Queue()
        self.running = False
        self._event_processor_task = None

    def set_config(self, client_input_name, client_num_btns, client_num_axes):
        self.mapper = GamepadMapper(STANDARD_XPAD_CONFIG, client_input_name, client_num_btns, client_num_axes)
        
        js_idx = 0 
        match = re.search(r"selkies_js(\d+)\.sock$", self.js_sock_path)
        if match:
            js_idx = int(match.group(1))
        else:
            logger_selkies_gamepad.warning(
                f"Failed to parse js_index from {self.js_sock_path}, "
                f"defaulting to 0 for payload name generation if needed."
            )

        payload_controller_config = {
            "name": STANDARD_XPAD_CONFIG.get("name", f"Selkies Virtual JS{js_idx}"),
            "vendor_id": STANDARD_XPAD_CONFIG.get("vendor_id", 0x0000),
            "product_id": STANDARD_XPAD_CONFIG.get("product_id", 0x0000),
            "version": STANDARD_XPAD_CONFIG.get("version_id", 0x0100), 
            "buttons": STANDARD_XPAD_CONFIG.get("btn_map", []), 
            "axes": STANDARD_XPAD_CONFIG.get("axes_map", [])
        }
        
        self.config_payload_cache = self._make_interposer_config_payload(js_idx, payload_controller_config)
        
        logger_selkies_gamepad.info(
            f"Gamepad configured. JS socket: {self.js_sock_path}, EVDEV socket: {self.evdev_sock_path}. "
            f"Using fixed config: {STANDARD_XPAD_CONFIG['name']}"
        )

    def _make_interposer_config_payload(self, js_index: int, controller_config: dict) -> bytes:
        """
        Creates the configuration payload (js_config_t) to be sent to the C interposer.
        """
        try:
            name_str = controller_config.get("name", f"Selkies Virtual JS{js_index}")
            # Ensure name is bytes and correctly truncated/padded for fixed-size char array
            # The C side expects a null-terminated string within the CONTROLLER_NAME_MAX_LEN buffer.
            name_bytes_utf8 = name_str.encode('utf-8')
            if len(name_bytes_utf8) >= CONTROLLER_NAME_MAX_LEN: # If too long (or exactly fits without null)
                name_bytes_for_pack = name_bytes_utf8[:CONTROLLER_NAME_MAX_LEN - 1] + b'\0'
            else: # Shorter, so pad with nulls
                # Use ljust to ensure it's exactly CONTROLLER_NAME_MAX_LEN
                name_bytes_for_pack = name_bytes_utf8.ljust(CONTROLLER_NAME_MAX_LEN, b'\0')


            # Defensive check, should be exactly CONTROLLER_NAME_MAX_LEN
            if len(name_bytes_for_pack) != CONTROLLER_NAME_MAX_LEN:
                 logging.error(f"CRITICAL: name_bytes_for_pack is not {CONTROLLER_NAME_MAX_LEN} bytes long! Got {len(name_bytes_for_pack)}")
                 # This indicates a logic error above, should not happen if logic is correct.
                 return b'\0' * EXPECTED_C_STRUCT_SIZE


            vendor_id = int(str(controller_config.get("vendor_id", "0x0000")), 16)
            product_id = int(str(controller_config.get("product_id", "0x0000")), 16)
            version_id = int(str(controller_config.get("version", "0x0100")), 16)

            buttons_evdev_codes = controller_config.get("buttons", [])
            axes_evdev_codes = controller_config.get("axes", [])

            num_actual_btns = len(buttons_evdev_codes)
            num_actual_axes = len(axes_evdev_codes)

            padded_btn_map_for_pack = list(buttons_evdev_codes)
            if len(padded_btn_map_for_pack) > INTERPOSER_MAX_BTNS:
                logging.warning(f"Controller '{name_str}' has {len(padded_btn_map_for_pack)} buttons, truncating to {INTERPOSER_MAX_BTNS} for config.")
                padded_btn_map_for_pack = padded_btn_map_for_pack[:INTERPOSER_MAX_BTNS]
                num_actual_btns = INTERPOSER_MAX_BTNS
            else:
                padded_btn_map_for_pack.extend([0] * (INTERPOSER_MAX_BTNS - len(padded_btn_map_for_pack)))

            padded_axes_map_for_pack = list(axes_evdev_codes)
            if len(padded_axes_map_for_pack) > INTERPOSER_MAX_AXES:
                logging.warning(f"Controller '{name_str}' has {len(padded_axes_map_for_pack)} axes, truncating to {INTERPOSER_MAX_AXES} for config.")
                padded_axes_map_for_pack = padded_axes_map_for_pack[:INTERPOSER_MAX_AXES]
                num_actual_axes = INTERPOSER_MAX_AXES
            else:
                padded_axes_map_for_pack.extend([0] * (INTERPOSER_MAX_AXES - len(padded_axes_map_for_pack)))
            struct_fmt = f"={CONTROLLER_NAME_MAX_LEN}sxHHHHH{INTERPOSER_MAX_BTNS}H{INTERPOSER_MAX_AXES}B6x"
            python_packed_size = struct.calcsize(struct_fmt) # This should now be 1360
            if python_packed_size != EXPECTED_C_STRUCT_SIZE:
                logging.error(
                    f"CRITICAL STRUCT SIZE MISMATCH for js_config_t! "
                    f"ctypes C size: {EXPECTED_C_STRUCT_SIZE}, "
                    f"Python struct.pack calculated size: {python_packed_size} using format '{struct_fmt}'. "
                    f"The C interposer will likely misinterpret the data or crash. "
                    f"Check C struct definition and Python struct_fmt string for consistency, "
                    f"especially regarding padding and field order/types."
                )
                return b'\0' * EXPECTED_C_STRUCT_SIZE

            logging.debug(f"Using struct_fmt: '{struct_fmt}' for js_config, expecting size {python_packed_size}")

            payload_args = [
                name_bytes_for_pack,
                vendor_id,
                product_id,
                version_id,
                num_actual_btns,
                num_actual_axes,
            ]
            payload_args.extend(padded_btn_map_for_pack)
            payload_args.extend(padded_axes_map_for_pack)
            # No arguments needed for '6x' padding; struct.pack handles it.

            payload = struct.pack(struct_fmt, *payload_args)

            log_display_name = name_bytes_for_pack.split(b'\0',1)[0].decode('utf-8', errors='replace')
            logging.info(f"Packed js_config payload for '{name_str}' (js{js_index}): "
                         f"len={len(payload)} bytes. "
                         f"Name='{log_display_name}', "
                         f"Vendor=0x{vendor_id:04x}, Product=0x{product_id:04x}, Version=0x{version_id:04x}, "
                         f"Buttons={num_actual_btns}, Axes={num_actual_axes}")
            if len(payload) != EXPECTED_C_STRUCT_SIZE:
                # This check should ideally be redundant if the one above passes.
                logging.error(f"FINAL PAYLOAD SIZE MISMATCH! Expected {EXPECTED_C_STRUCT_SIZE}, got {len(payload)}. This is very bad.")
                return b'\0' * EXPECTED_C_STRUCT_SIZE
            return payload

        except struct.error as e:
            logging.error(f"Error packing joystick config for js{js_index} with format '{struct_fmt if 'struct_fmt' in locals() else 'undefined'}': {e}")
            config_to_log = controller_config if 'controller_config' in locals() else {}
            logging.error(f"Controller config was: {config_to_log}")
            return b'\0' * EXPECTED_C_STRUCT_SIZE
        except Exception as e:
            config_to_log = controller_config if 'controller_config' in locals() else {}
            logging.exception(f"Unexpected error creating interposer config payload for js{js_index} with config {config_to_log}: {e}")
            return b'\0' * EXPECTED_C_STRUCT_SIZE

    async def _handle_interposer_client(self, reader, writer, is_evdev_socket):
        peername = writer.get_extra_info('peername') 
        socket_type_str = "EVDEV" if is_evdev_socket else "JS"
        clients_dict = self.evdev_clients if is_evdev_socket else self.js_clients
        sock_path = self.evdev_sock_path if is_evdev_socket else self.js_sock_path
        log_prefix = f"Gamepad {sock_path} Client {peername} ({socket_type_str}):"
        logger_selkies_gamepad.info(f"{log_prefix} Handler started.")

        try:
            # 1. Send config payload
            if not self.config_payload_cache:
                logger_selkies_gamepad.error(f"{log_prefix} Config payload not ready. Aborting handler.")
                return
            logger_selkies_gamepad.info(f"{log_prefix} Preparing to send config payload. Length: {len(self.config_payload_cache)}, Expected C size: {EXPECTED_C_STRUCT_SIZE}, First 16 bytes: {self.config_payload_cache[:16].hex()}")
            writer.write(self.config_payload_cache)
            await writer.drain()
            await asyncio.sleep(1)
            logger_selkies_gamepad.debug(f"{log_prefix} Sent config payload.")

            # 2. Read 1-byte architecture specifier
            arch_byte = await reader.readexactly(1)
            client_sizeof_long = struct.unpack("=B", arch_byte)[0]
            client_arch_bits = client_sizeof_long * 8
            logger_selkies_gamepad.info(f"{log_prefix} Received arch specifier: {client_sizeof_long} bytes ({client_arch_bits}-bit).")
            
            clients_dict[writer] = {'arch_bits': client_arch_bits}
            logger_selkies_gamepad.info(f"{log_prefix} Added to active list. Total {socket_type_str} clients: {len(clients_dict)}.")

            # Keep connection alive
            while self.running and not writer.is_closing():
                await asyncio.sleep(0.1) 
            
            if not self.running:
                logger_selkies_gamepad.info(f"{log_prefix} Exiting handler normally because self.running is False.")
            if writer.is_closing():
                logger_selkies_gamepad.info(f"{log_prefix} Exiting handler normally because writer.is_closing() is True (client likely closed connection).")

        except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError) as e:
            logger_selkies_gamepad.info(f"{log_prefix} Disconnected (expected error): {type(e).__name__} - {e}")
        except Exception as e:
            logger_selkies_gamepad.error(f"{log_prefix} Unhandled error in handler: {e}", exc_info=True)
        finally:
            logger_selkies_gamepad.info(f"{log_prefix} Entering finally block.")
            if writer in clients_dict:
                del clients_dict[writer]
                logger_selkies_gamepad.info(f"{log_prefix} Removed from active list. Total {socket_type_str} clients now: {len(clients_dict)}.")
            else:
                logger_selkies_gamepad.warning(f"{log_prefix} Writer not found in active list during finally block.")

            if not writer.is_closing():
                logger_selkies_gamepad.info(f"{log_prefix} Explicitly closing writer in finally block.")
                writer.close()
                try: await writer.wait_closed() 
                except AttributeError: pass # wait_closed might not exist on all stream types or states
            logger_selkies_gamepad.info(f"{log_prefix} Handler finished.")

    async def _run_single_server(self, interposer_socket_path, is_evdev_socket):
        sock_dir = os.path.dirname(interposer_socket_path)
        if sock_dir and not os.path.exists(sock_dir):
            try: os.makedirs(sock_dir, exist_ok=True)
            except OSError as e:
                logger_selkies_gamepad.error(f"Failed to create directory {sock_dir} for socket: {e}")
                return None
        
        if os.path.exists(interposer_socket_path):
            try:
                os.unlink(interposer_socket_path)
                logger_selkies_gamepad.debug(f"Removed existing socket file: {interposer_socket_path}")
            except OSError as e:
                logger_selkies_gamepad.warning(f"Could not remove existing file at {interposer_socket_path}: {e}. Bind might fail.")

        try:
            server = await asyncio.start_unix_server(
                lambda r, w: self._handle_interposer_client(r, w, is_evdev_socket),
                path=interposer_socket_path
            )
            addr = server.sockets[0].getsockname() if server.sockets else interposer_socket_path
            logger_selkies_gamepad.info(f"{'EVDEV' if is_evdev_socket else 'JS'} interposer server listening on {addr}")
            return server
        except Exception as e:
            logger_selkies_gamepad.error(f"Failed to start {'EVDEV' if is_evdev_socket else 'JS'} server on {interposer_socket_path}: {e}", exc_info=True)
            return None

    async def run_servers(self):
        if not self.mapper:
            logger_selkies_gamepad.error("Mapper not set. Call set_config() before run_servers().")
            return

        self.running = True
        if self._event_processor_task is None or self._event_processor_task.done():
            self._event_processor_task = asyncio.create_task(self._process_event_queue())

        self.js_server = await self._run_single_server(self.js_sock_path, is_evdev_socket=False)
        self.evdev_server = await self._run_single_server(self.evdev_sock_path, is_evdev_socket=True)

        if not self.js_server and not self.evdev_server:
            logger_selkies_gamepad.error("Neither JS nor EVDEV interposer server could be started. Stopping.")
            self.running = False
            if self._event_processor_task and not self._event_processor_task.done():
                self._event_processor_task.cancel()
            return
        
        while self.running:
            await asyncio.sleep(1)
        logger_selkies_gamepad.info("run_servers loop exited.")

    def send_event(self, client_event_idx, client_value, is_button_event):
        if not self.mapper or not self.running:
            return
        event_package = self.mapper.get_mapped_events(client_event_idx, client_value, is_button_event)
        if event_package:
            logger_selkies_gamepad.debug(f"Gamepad {self.js_sock_path}: Queuing event: {event_package}")
            self.events_queue.put_nowait(event_package)

    async def _process_event_queue(self):
        logger_selkies_gamepad.info(f"Gamepad {self.js_sock_path}: Event processor started.")
        while self.running:
            try:
                event_package = await self.events_queue.get()
                if event_package is None: # Sentinel for shutdown
                    self.events_queue.task_done()
                    break
                
                logger_selkies_gamepad.debug(f"Gamepad {self.js_sock_path}: Dequeued event: {event_package}")
                
                js_data = event_package.get('js_event_data')
                evdev_template = event_package.get('evdev_event_template') 

                # Send to JS clients
                if js_data:
                    for i, (writer, client_info) in enumerate(list(self.js_clients.items())):
                        if not writer.is_closing():
                            try:
                                writer.write(js_data)
                                await writer.drain()
                                logger_selkies_gamepad.debug(f"Gamepad {self.js_sock_path}: JS event drained to client #{i}.")
                            except (ConnectionResetError, BrokenPipeError): pass 
                            except Exception as e: 
                                logger_selkies_gamepad.error(f"Error sending to JS client #{i}: {e}", exc_info=True) 
                
                # Send to EVDEV clients
                if evdev_template:
                    ev_type, ev_code, ev_value = evdev_template
                    for i, (writer, client_info) in enumerate(list(self.evdev_clients.items())):
                        if not writer.is_closing():
                            try:
                                client_arch_bits = client_info.get('arch_bits', 64) 
                                evdev_data = get_evdev_events_packed(ev_type, ev_code, ev_value, client_arch_bits)
                                writer.write(evdev_data)
                                await writer.drain()
                                logger_selkies_gamepad.debug(f"Gamepad {self.js_sock_path}: EVDEV event drained to client #{i}.")
                            except (ConnectionResetError, BrokenPipeError): pass 
                            except Exception as e: 
                                logger_selkies_gamepad.error(f"Error sending to EVDEV client #{i}: {e}", exc_info=True)
                
                self.events_queue.task_done()
            except asyncio.CancelledError:
                logger_selkies_gamepad.info(f"Gamepad {self.js_sock_path}: Event processor task cancelled.")
                break
            except Exception as e:
                logger_selkies_gamepad.error(f"Gamepad {self.js_sock_path}: Unhandled error in event processor: {e}", exc_info=True)
        logger_selkies_gamepad.info(f"Gamepad {self.js_sock_path}: Event processor stopped.")


    async def close(self):
        logger_selkies_gamepad.info(f"Closing gamepad services for JS:{self.js_sock_path}, EVDEV:{self.evdev_sock_path}")
        self.running = False

        if self.js_server:
            self.js_server.close()
            try: await self.js_server.wait_closed()
            except AttributeError: pass
            self.js_server = None
            logger_selkies_gamepad.info(f"JS interposer server {self.js_sock_path} closed.")
        if self.evdev_server:
            self.evdev_server.close()
            try: await self.evdev_server.wait_closed()
            except AttributeError: pass
            self.evdev_server = None
            logger_selkies_gamepad.info(f"EVDEV interposer server {self.evdev_sock_path} closed.")

        for writer in list(self.js_clients.keys()):
            if not writer.is_closing(): writer.close()
        self.js_clients.clear()
        for writer in list(self.evdev_clients.keys()):
            if not writer.is_closing(): writer.close()
        self.evdev_clients.clear()
        
        if self._event_processor_task and not self._event_processor_task.done():
            try:
                self.events_queue.put_nowait(None) 
                await asyncio.wait_for(self._event_processor_task, timeout=2.0)
            except asyncio.TimeoutError:
                logger_selkies_gamepad.warning("Event processor task timed out on close, cancelling.")
                self._event_processor_task.cancel()
            except asyncio.CancelledError:
                pass 
            except Exception as e:
                logger_selkies_gamepad.error(f"Exception stopping event processor: {e}")
        self._event_processor_task = None
        
        for sock_path in [self.js_sock_path, self.evdev_sock_path]:
            if sock_path and os.path.exists(sock_path):
                try:
                    os.unlink(sock_path)
                    logger_selkies_gamepad.info(f"Removed socket file: {sock_path}")
                except OSError as e:
                    logger_selkies_gamepad.warning(f"Could not remove socket file {sock_path} on close: {e}")
        
        logger_selkies_gamepad.info(f"Gamepad services fully closed.")


# --- WebRTCInput Class (Modified for new Gamepad handling) ---
class WebRTCInputError(Exception): pass

class WebRTCInput:
    def __init__(
        self,
        gst_webrtc_app,
        uinput_mouse_socket_path="",
        js_socket_path_prefix="/tmp", 
        enable_clipboard="",
        enable_cursors=True,
        cursor_size=16, 
        cursor_scale=1.0,
        cursor_debug=False,
    ):
        self.gst_webrtc_app = gst_webrtc_app
        self.loop = asyncio.get_event_loop()
        self.js_socket_path_prefix = js_socket_path_prefix
        self.num_gamepads = 4 
        self.gamepad_instances = {} 

        self.clipboard_running = False
        self.uinput_mouse_socket_path = uinput_mouse_socket_path
        self.uinput_mouse_socket = None
        self.enable_clipboard = enable_clipboard
        self.enable_cursors = enable_cursors
        self.cursors_running = False
        self.cursor_cache = {}
        self.cursor_scale = cursor_scale
        self.cursor_size = cursor_size
        self.cursor_debug = cursor_debug
        self.keyboard = None
        self.mouse = None
        self.xdisplay = None
        self.button_mask = 0
        self.ping_start = None
        self.on_video_encoder_bit_rate = lambda bitrate: logger_webrtc_input.warning("unhandled on_video_encoder_bit_rate")
        self.on_audio_encoder_bit_rate = lambda bitrate: logger_webrtc_input.warning("unhandled on_audio_encoder_bit_rate")
        self.on_mouse_pointer_visible = lambda visible: logger_webrtc_input.warning("unhandled on_mouse_pointer_visible")
        self.on_clipboard_read = self._on_clipboard_read
        self.on_set_fps = lambda fps: logger_webrtc_input.warning("unhandled on_set_fps")
        self.on_set_enable_resize = lambda enable_resize, res: logger_webrtc_input.warning("unhandled on_set_enable_resize")
        self.on_client_fps = lambda fps: logger_webrtc_input.warning("unhandled on_client_fps")
        self.on_client_latency = lambda latency: logger_webrtc_input.warning("unhandled on_client_latency")
        self.on_resize = lambda res: logger_webrtc_input.warning("unhandled on_resize")
        self.on_scaling_ratio = lambda res: logger_webrtc_input.warning("unhandled on_scaling_ratio")
        self.on_ping_response = lambda latency: logger_webrtc_input.warning("unhandled on_ping_response")
        self.on_cursor_change = self._on_cursor_change
        self.on_client_webrtc_stats = lambda webrtc_stat_type, webrtc_stats: logger_webrtc_input.warning("unhandled on_client_webrtc_stats")


    def _on_clipboard_read(self, data): self.send_clipboard_data(data)
    def _on_cursor_change(self, data): self.send_cursor_data(data)
    def send_clipboard_data(self, data):
        if self.gst_webrtc_app.mode == "websockets": self.gst_webrtc_app.send_ws_clipboard_data(data)
        else: self.gst_webrtc_app.send_clipboard_data(data)
    def send_cursor_data(self, data):
        if self.gst_webrtc_app.mode == "websockets": self.gst_webrtc_app.send_ws_cursor_data(data)
        else: self.gst_webrtc_app.send_cursor_data(data)

    def __keyboard_connect(self): self.keyboard = pynput.keyboard.Controller()
    def __mouse_connect(self):
        if self.uinput_mouse_socket_path:
            logger_webrtc_input.info(f"Connecting to uinput mouse socket: {self.uinput_mouse_socket_path}")
            self.uinput_mouse_socket = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        self.mouse = pynput.mouse.Controller()
    def __mouse_disconnect(self):
        if self.mouse: del self.mouse; self.mouse = None
    def __mouse_emit(self, *args, **kwargs):
        if self.uinput_mouse_socket_path:
            cmd = {"args": args, "kwargs": kwargs}
            data = msgpack.packb(cmd, use_bin_type=True)
            self.uinput_mouse_socket.sendto(data, self.uinput_mouse_socket_path)

    async def __gamepad_connect(self, gamepad_idx, client_name, client_num_btns, client_num_axes):
        if not (0 <= gamepad_idx < self.num_gamepads):
            logger_webrtc_input.error(f"Gamepad index {gamepad_idx} out of range (0-{self.num_gamepads-1}).")
            return
        if gamepad_idx in self.gamepad_instances:
            logger_webrtc_input.warning(f"Gamepad {gamepad_idx} already connected. Reconnecting.")
            await self.__gamepad_disconnect(gamepad_idx)

        js_ip_sock_path = os.path.join(self.js_socket_path_prefix, f"selkies_js{gamepad_idx}.sock")
        evdev_ip_sock_path = os.path.join(self.js_socket_path_prefix, f"selkies_event{1000+gamepad_idx}.sock")
        
        logger_webrtc_input.info(
            f"Creating SelkiesGamepad for index {gamepad_idx}: "
            f"JS_IP_SOCK='{js_ip_sock_path}', EVDEV_IP_SOCK='{evdev_ip_sock_path}' "
            f"from client '{client_name}' ({client_num_btns}b, {client_num_axes}a)"
        )
        
        gamepad = SelkiesGamepad(js_ip_sock_path, evdev_ip_sock_path, self.loop)
        gamepad.set_config(client_name, client_num_btns, client_num_axes)
        asyncio.create_task(gamepad.run_servers()) 
        self.gamepad_instances[gamepad_idx] = gamepad

    async def __gamepad_disconnect(self, gamepad_idx=None):
        async def _disconnect_one(idx):
            gamepad_instance = self.gamepad_instances.pop(idx, None)
            if gamepad_instance:
                logger_webrtc_input.info(f"Stopping gamepad instance for index {idx}.")
                await gamepad_instance.close()
        
        indices_to_disconnect = list(self.gamepad_instances.keys()) if gamepad_idx is None else [gamepad_idx]
        for idx in indices_to_disconnect:
            if idx in self.gamepad_instances: 
                 await _disconnect_one(idx)


    def __gamepad_emit_btn(self, gamepad_idx, client_btn_num, client_btn_val):
        gamepad = self.gamepad_instances.get(gamepad_idx)
        if gamepad:
            gamepad.send_event(client_btn_num, client_btn_val, is_button_event=True)

    def __gamepad_emit_axis(self, gamepad_idx, client_axis_num, client_axis_val):
        gamepad = self.gamepad_instances.get(gamepad_idx)
        if gamepad:
            gamepad.send_event(client_axis_num, client_axis_val, is_button_event=False)
            
    async def connect(self):
        try: self.xdisplay = display.Display()
        except Exception as e: logger_webrtc_input.error(f"Failed to connect to X display: {e}"); self.xdisplay = None
        self.__keyboard_connect()
        if self.xdisplay: self.reset_keyboard()
        self.__mouse_connect()


    async def disconnect(self):
        await self.__gamepad_disconnect() 
        self.__mouse_disconnect()
        if self.xdisplay: self.xdisplay = None

    def reset_keyboard(self):
        if not self.keyboard or not self.xdisplay : 
            logger_webrtc_input.warning("Cannot reset keyboard, X display or keyboard controller not available.")
            return
        logger_webrtc_input.info("Resetting keyboard modifiers.")
        lctrl, lshift, lalt, rctrl, rshift, ralt = 65507, 65505, 65513, 65508, 65506, 65027
        lmeta, rmeta, keyf, keyF, keym, keyM, escape = 65511, 65512, 102, 70, 109, 77, 65307
        for k in [lctrl, lshift, lalt, rctrl, rshift, ralt, lmeta, rmeta, keyf, keyF, keym, keyM, escape]:
            try: self.send_x11_keypress(k, down=False)
            except Exception as e: logger_webrtc_input.warning(f"Error resetting key {k}: {e}")
    
    def send_mouse(self, action, data):
        if action == MOUSE_POSITION:
            if self.mouse: self.mouse.position = data
        elif action == MOUSE_MOVE:
            x, y = data
            if self.uinput_mouse_socket_path:
                self.__mouse_emit(UINPUT_REL_X, x, syn=False)
                self.__mouse_emit(UINPUT_REL_Y, y)
            elif self.xdisplay:
                xtest.fake_input(self.xdisplay, Xlib.X.MotionNotify, detail=True, root=Xlib.X.NONE, x=x, y=y)
                self.xdisplay.sync()
        elif action == MOUSE_SCROLL_UP:
            if self.uinput_mouse_socket_path: self.__mouse_emit(UINPUT_REL_WHEEL, 1)
            elif self.mouse: self.mouse.scroll(0, -1)
        elif action == MOUSE_SCROLL_DOWN:
            if self.uinput_mouse_socket_path: self.__mouse_emit(UINPUT_REL_WHEEL, -1)
            elif self.mouse: self.mouse.scroll(0, 1)
        elif action == MOUSE_BUTTON: 
            btn_map_key = "uinput" if self.uinput_mouse_socket_path else "pynput"
            btn_uinput_or_pynput = MOUSE_BUTTON_MAP[data[1]][btn_map_key]
            if data[0] == MOUSE_BUTTON_PRESS: 
                if self.uinput_mouse_socket_path: self.__mouse_emit(btn_uinput_or_pynput, 1)
                elif self.mouse: self.mouse.press(btn_uinput_or_pynput)
            else: 
                if self.uinput_mouse_socket_path: self.__mouse_emit(btn_uinput_or_pynput, 0)
                elif self.mouse: self.mouse.release(btn_uinput_or_pynput)

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
            for bit_index in range(5): # Check bits 0 through 4
                current_button_bit_value = (1 << bit_index)
                button_state_changed = ((self.button_mask & current_button_bit_value) != \
                                        (button_mask & current_button_bit_value))

                if button_state_changed:
                    is_pressed_now = (button_mask & current_button_bit_value) != 0
                    
                    action_to_send = None
                    data_to_send = None
                    is_scroll_action = False
                    performed_keyboard_combo = False # Flag to skip mouse event sending

                    if bit_index == 0: # Left button
                        action_to_send = MOUSE_BUTTON
                        data_to_send = (MOUSE_BUTTON_PRESS if is_pressed_now else MOUSE_BUTTON_RELEASE, MOUSE_BUTTON_LEFT_ID)
                    elif bit_index == 1: # Middle button
                        action_to_send = MOUSE_BUTTON
                        data_to_send = (MOUSE_BUTTON_PRESS if is_pressed_now else MOUSE_BUTTON_RELEASE, MOUSE_BUTTON_MIDDLE_ID)
                    elif bit_index == 2: # Right button
                        action_to_send = MOUSE_BUTTON
                        data_to_send = (MOUSE_BUTTON_PRESS if is_pressed_now else MOUSE_BUTTON_RELEASE, MOUSE_BUTTON_RIGHT_ID)
                    
                    elif bit_index == 3: # Client's Back button (mask 8) OR Scroll Up
                        if scroll_magnitude > 0: # It's an actual scroll down event
                            if is_pressed_now:
                                action_to_send = MOUSE_SCROLL_UP
                                is_scroll_action = True
                        else: # scroll_magnitude is 0, so it's a "Back" action via Alt+Left
                            if is_pressed_now: # Trigger on press
                                if self.keyboard:
                                    logger_webrtc_input.debug("Sending Alt+Left Arrow for Back")
                                    self.send_x11_keypress(KEYSYM_ALT_L, down=True)
                                    self.send_x11_keypress(KEYSYM_LEFT_ARROW, down=True)
                                    self.send_x11_keypress(KEYSYM_LEFT_ARROW, down=False)
                                    self.send_x11_keypress(KEYSYM_ALT_L, down=False)
                                    performed_keyboard_combo = True
                                else:
                                    logger_webrtc_input.warning("Keyboard not available for Alt+Left.")
                    elif bit_index == 4: # Client's Forward button (mask 16) OR Scroll Down
                        if scroll_magnitude > 0: # It's an actual scroll up event
                            if is_pressed_now:
                                action_to_send = MOUSE_SCROLL_DOWN
                                is_scroll_action = True
                        else: # scroll_magnitude is 0, so it's a "Forward" action via Alt+Right
                            if is_pressed_now: # Trigger on press
                                if self.keyboard:
                                    logger_webrtc_input.debug("Sending Alt+Right Arrow for Forward")
                                    self.send_x11_keypress(KEYSYM_ALT_L, down=True)
                                    self.send_x11_keypress(KEYSYM_RIGHT_ARROW, down=True)
                                    self.send_x11_keypress(KEYSYM_RIGHT_ARROW, down=False)
                                    self.send_x11_keypress(KEYSYM_ALT_L, down=False)
                                    performed_keyboard_combo = True
                                else:
                                    logger_webrtc_input.warning("Keyboard not available for Alt+Right.")
                    # Send the determined MOUSE action (if any and no keyboard combo was done)
                    if not performed_keyboard_combo and action_to_send is not None:
                        if is_scroll_action:
                            for _ in range(max(1, scroll_magnitude)):
                                self.send_mouse(action_to_send, None)
                        else: # Regular button action
                            self.send_mouse(action_to_send, data_to_send)
                
            self.button_mask = button_mask

        if not relative and self.xdisplay:
            self.xdisplay.sync()
    def read_clipboard(self):
        try:
            result = subprocess.run(("xsel", "--clipboard", "--output"), check=True, text=True, capture_output=True, timeout=1)
            return result.stdout
        except Exception as e: logger_webrtc_input.warning(f"Error capturing clipboard: {e}"); return None
    def write_clipboard(self, data):
        try: subprocess.run(("xsel", "--clipboard", "--input"), input=data.encode(), check=True, timeout=1); return True
        except Exception as e: logger_webrtc_input.warning(f"Error writing to clipboard: {e}"); return False

    async def start_clipboard(self):
        if self.enable_clipboard not in ["true", "out"]:
            logger_webrtc_input.info("Skipping outbound clipboard service."); return
        logger_webrtc_input.info("Starting clipboard monitor")
        self.clipboard_running = True; last_data = ""
        while self.clipboard_running:
            curr_data = await self.loop.run_in_executor(None, self.read_clipboard)
            if curr_data is not None and curr_data != last_data:
                logger_webrtc_input.info(f"Sending clipboard content, length: {len(curr_data)}")
                self.on_clipboard_read(curr_data); last_data = curr_data
            await asyncio.sleep(0.5)
        logger_webrtc_input.info("Clipboard monitor stopped")

    def stop_clipboard(self): self.clipboard_running = False; logger_webrtc_input.info("Stopping clipboard monitor")
    
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

    async def stop_gamepad_servers(self):
        logger_webrtc_input.info("Stopping all gamepad instances.")
        await self.__gamepad_disconnect()

    async def on_message(self, msg):
        toks = msg.split(",")
        msg_type = toks[0]

        if msg_type == "pong":
            if self.ping_start is None: logger_webrtc_input.warning("received pong before ping"); return
            self.on_ping_response(float("%.3f" % ((time.time() - self.ping_start) / 2 * 1000)))
        elif msg_type == "kd": self.send_x11_keypress(int(toks[1]), down=True)
        elif msg_type == "ku": self.send_x11_keypress(int(toks[1]), down=False)
        elif msg_type == "kr": self.reset_keyboard()
        elif msg_type in ["m", "m2"]:
            relative = msg_type == "m2"
            try: x, y, button_mask, scroll_magnitude = [int(i) for i in toks[1:]]
            except: x,y,button_mask,scroll_magnitude = 0,0,self.button_mask,0; relative=False 
            try: self.send_x11_mouse(x, y, button_mask, scroll_magnitude, relative)
            except Exception as e: logger_webrtc_input.warning(f"Failed to set mouse cursor: {e}")
        elif msg_type == "p": self.on_mouse_pointer_visible(bool(int(toks[1])))
        elif msg_type == "vb": self.on_video_encoder_bit_rate(int(toks[1]))
        elif msg_type == "ab": self.on_audio_encoder_bit_rate(int(toks[1]))
        elif msg_type == "js": 
            cmd = toks[1]
            gamepad_idx = int(toks[2])
            if cmd == "c": 
                try: client_name = base64.b64decode(toks[3]).decode('latin-1', 'ignore')[:255]
                except Exception as e: client_name = f"Gamepad{gamepad_idx}"; logger_webrtc_input.warning(f"Error decoding gamepad name: {e}")
                client_num_axes, client_num_btns = int(toks[4]), int(toks[5])
                await self.__gamepad_connect(gamepad_idx, client_name, client_num_btns, client_num_axes)
            elif cmd == "d": 
                await self.__gamepad_disconnect(gamepad_idx)
            elif cmd == "b": 
                self.__gamepad_emit_btn(gamepad_idx, int(toks[3]), float(toks[4]))
            elif cmd == "a": 
                self.__gamepad_emit_axis(gamepad_idx, int(toks[3]), float(toks[4]))
            else: logger_webrtc_input.warning(f"Unhandled joystick command: js {cmd}")
        elif msg_type == "cr": 
            if self.enable_clipboard in ["true", "out"]:
                data = await self.loop.run_in_executor(None, self.read_clipboard)
                if data: self.on_clipboard_read(data)
                else: logger_webrtc_input.warning("No clipboard content to send")
            else: logger_webrtc_input.warning("Rejecting clipboard read: outbound clipboard disabled.")
        elif msg_type == "cw": 
            if self.enable_clipboard in ["true", "in"]:
                try: data = base64.b64decode(toks[1]).decode("utf-8", 'ignore')
                except Exception as e: logger_webrtc_input.error(f"Clipboard decode error: {e}"); return
                if await self.loop.run_in_executor(None, self.write_clipboard, data):
                    logger_webrtc_input.info(f"Set clipboard content, length: {len(data)}")
            else: logger_webrtc_input.warning("Rejecting clipboard write: inbound clipboard disabled.")
        elif msg_type == "r": 
            res = toks[1]
            if re.fullmatch(r"^\d+x\d+$", res):
                w, h = [int(i) + int(i)%2 for i in res.split("x")] 
                self.on_resize(f"{w}x{h}")
            else: logger_webrtc_input.warning(f"Rejecting resolution change, invalid: {res}")
        elif msg_type == "s": 
            scale = toks[1]
            if re.fullmatch(r"^\d+(\.\d+)?$", scale): self.on_scaling_ratio(float(scale))
            else: logger_webrtc_input.warning(f"Rejecting scaling change, invalid: {scale}")
        elif msg_type == "cmd":
            if len(toks) > 1:
                command_to_run = ",".join(toks[1:]) # Reconstruct command string if it contained commas
                logger_webrtc_input.info(f"Attempting to execute command: '{command_to_run}'")
                home_directory = os.path.expanduser("~")
                try:
                    # Use subprocess.Popen for fire-and-forget execution
                    # stdout and stderr are redirected to DEVNULL to ignore output.
                    # start_new_session=True detaches the process from the current one.
                    subprocess.Popen(
                        command_to_run, 
                        shell=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        cwd=home_directory,
                        start_new_session=True 
                    )
                    logger_webrtc_input.info(f"Successfully launched command: '{command_to_run}'")
                except Exception as e:
                    logger_webrtc_input.error(f"Failed to launch command '{command_to_run}': {e}")
            else:
                logger_webrtc_input.warning("Received 'cmd' message without a command string.")
        elif msg_type == "_arg_fps": self.on_set_fps(int(toks[1]))
        elif msg_type == "_arg_resize":
            if len(toks) == 3:
                enabled, res_str = toks[1].lower() == "true", toks[2]
                enable_res = None
                if re.fullmatch(r"^\d+x\d+$", res_str):
                    w,h = [int(i)+int(i)%2 for i in res_str.split("x")]; enable_res = f"{w}x{h}"
                elif res_str: logger_webrtc_input.warning(f"Invalid resolution for enable_resize: {res_str}")
                self.on_set_enable_resize(enabled, enable_res)
            else: logger_webrtc_input.error("Invalid _arg_resize command format")
        elif msg_type == "_f": 
            try: self.on_client_fps(int(toks[1]))
            except: logger_webrtc_input.error(f"Failed to parse client FPS: {toks}")
        elif msg_type == "_l": 
            try: self.on_client_latency(int(toks[1]))
            except: logger_webrtc_input.error(f"Failed to parse client latency: {toks}")
        elif msg_type in ["_stats_video", "_stats_audio"]: 
            try: await self.on_client_webrtc_stats(msg_type, ",".join(toks[1:]))
            except: logger_webrtc_input.error("Failed to parse WebRTC Statistics")
        elif msg_type == "co" and toks[1] == "end" and len(toks) > 2: 
            try: subprocess.run(["xdotool", "type", toks[2]], check=True, timeout=0.5)
            except Exception as e: logger_webrtc_input.warning(f"Error with xdotool type: {e}")
        else:
            logger_webrtc_input.info(f"Unknown data channel message: {msg[:100]}") 


# MOUSE_POSITION etc. constants need to be defined if not already
MOUSE_POSITION = 10
MOUSE_MOVE = 11
MOUSE_SCROLL_UP = 20
MOUSE_SCROLL_DOWN = 21
MOUSE_BUTTON_PRESS = 30
MOUSE_BUTTON_RELEASE = 31
MOUSE_BUTTON = 40
MOUSE_BUTTON_LEFT_ID = 41 
MOUSE_BUTTON_MIDDLE_ID = 42
MOUSE_BUTTON_RIGHT_ID = 43

# UINPUT constants if uinput_mouse_socket_path is used
UINPUT_BTN_LEFT = (EV_KEY, BTN_LEFT) 
UINPUT_BTN_MIDDLE = (EV_KEY, BTN_MIDDLE) 
UINPUT_BTN_RIGHT = (EV_KEY, BTN_RIGHT) 
UINPUT_REL_X = (EV_REL, 0x00) # REL_X
UINPUT_REL_Y = (EV_REL, 0x01) # REL_Y
UINPUT_REL_WHEEL = (EV_REL, 0x08) # REL_WHEEL

MOUSE_BUTTON_MAP = {
    MOUSE_BUTTON_LEFT_ID: {"uinput": UINPUT_BTN_LEFT, "pynput": pynput.mouse.Button.left},
    MOUSE_BUTTON_MIDDLE_ID: {"uinput": UINPUT_BTN_MIDDLE, "pynput": pynput.mouse.Button.middle},
    MOUSE_BUTTON_RIGHT_ID: {"uinput": UINPUT_BTN_RIGHT, "pynput": pynput.mouse.Button.right},
}

if __name__ == '__main__':
    logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    class MockGstWebRTCApp:
        def __init__(self):
            self.mode = "datachannel" 
        def send_clipboard_data(self, data): logger_webrtc_input.info(f"MockGst: Send clipboard data: {data[:30]}...")
        def send_cursor_data(self, data): logger_webrtc_input.info(f"MockGst: Send cursor data: {str(data)[:50]}...")

    async def main_test():
        mock_gst_app = MockGstWebRTCApp()
        webrtc_input_handler = WebRTCInput(
            gst_webrtc_app=mock_gst_app,
            js_socket_path_prefix="/tmp/selkies_test_sockets", 
            enable_clipboard="true", 
            enable_cursors=False 
        )

        await webrtc_input_handler.connect()
        logger_webrtc_input.info("WebRTCInput connected for test.")

        await webrtc_input_handler.on_message("js,c,0,R2FtZXBhZDA=,6,16") 

        await webrtc_input_handler.on_message("js,b,0,0,1.0") 
        await asyncio.sleep(0.1)
        await webrtc_input_handler.on_message("js,b,0,0,0.0") 
        await asyncio.sleep(0.1)

        await webrtc_input_handler.on_message("js,a,0,0,0.5")  
        await asyncio.sleep(0.1)
        await webrtc_input_handler.on_message("js,a,0,0,-1.0") 
        await asyncio.sleep(0.1)
        await webrtc_input_handler.on_message("js,a,0,0,0.0")  
        
        logger_webrtc_input.info("Simulated some gamepad events.")
        logger_webrtc_input.info("You can try running the C interposer with an application now, e.g.:")
        logger_webrtc_input.info("LD_PRELOAD=/path/to/your/interposer.so jstest /dev/input/js0")
        logger_webrtc_input.info("or LD_PRELOAD=/path/to/your/interposer.so evtest /dev/input/event1000")
        logger_webrtc_input.info("Press Ctrl+C to stop test.")

        try:
            while True:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger_webrtc_input.info("Test main task cancelled.")
        finally:
            logger_webrtc_input.info("Disconnecting WebRTCInput...")
            await webrtc_input_handler.disconnect()
            logger_webrtc_input.info("Test finished.")

    try:
        asyncio.run(main_test())
    except KeyboardInterrupt:
        logger_webrtc_input.info("Test interrupted by user.")

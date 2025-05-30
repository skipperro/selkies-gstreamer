# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# This file incorporates work covered by the following copyright and
# permission notice:
#
#   Copyright 2019 Google LLC
#
#   Licensed under the Apache License, Version 2.0 (the "License");
#   you may not use this file except in compliance with the License.
#   You may obtain a copy of the License at
#
#        http://www.apache.org/licenses/LICENSE-2.0
#
#   Unless required by applicable law or agreed to in writing, software
#   distributed under the License is distributed on an "AS IS" BASIS,
#   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#   See the License for the specific language governing permissions and
#   limitations under the License.

# Constants
FPS_DIFFERENCE_THRESHOLD = 5
BITRATE_DECREASE_STEP_KBPS = 2000
BITRATE_INCREASE_STEP_KBPS = 1000
BACKPRESSURE_CHECK_INTERVAL_SECONDS = 2.0
RAMP_UP_STABILITY_SECONDS = 20.0
MIN_VIDEO_BITRATE_KBPS_BACKPRESSURE = 1000
FRAME_DIFFERENCE_THRESHOLD_LOW = 5
FRAME_DIFFERENCE_THRESHOLD_HIGH = 15
FRAME_DIFFERENCE_THRESHOLD_SEVERE = 45
STALLED_CLIENT_TIMEOUT_SECONDS = 4.0
CRF_INCREASE_STEP = 3
CRF_DECREASE_STEP = 2
MAX_X264_CRF_BACKPRESSURE = 45
MIN_JPEG_QUALITY_BACKPRESSURE = 20
JPEG_QUALITY_DECREASE_STEP = 10
DEFAULT_JPEG_QUALITY_SEVERE_LAG = 30
DEFAULT_X264_CRF_SEVERE_LAG = 35
DEFAULT_GSTREAMER_BITRATE_SEVERE_LAG_KBPS = 2000
RTT_SMOOTHING_SAMPLES = 20
SENT_FRAME_TIMESTAMP_HISTORY_SIZE = 1000
SENT_FRAMES_LOG_HISTORY_SECONDS = 5
CONSECUTIVE_LAG_REPORTS_THRESHOLD = 2
MIN_ADJUSTMENT_INTERVAL_SECONDS = 10.0
TARGET_FRAMERATE = 60
TARGET_VIDEO_BITRATE_KBPS = 16000
MIN_VIDEO_BITRATE_KBPS = 500

DATA_WEBSOCKET_PORT = 8082
UINPUT_MOUSE_SOCKET = ""
JS_SOCKET_PATH = "/tmp"
ENABLE_CLIPBOARD = True
ENABLE_CURSORS = True
CURSOR_SIZE = 32
DEBUG_CURSORS = False
ENABLE_RESIZE = True
AUDIO_CHANNELS_DEFAULT = 2
AUDIO_BITRATE_DEFAULT = 128000
GPU_ID_DEFAULT = 0
KEYFRAME_DISTANCE_DEFAULT = -1.0

import logging

LOGLEVEL = logging.INFO
logging.basicConfig(level=LOGLEVEL)
logger_selkies_gamepad = logging.getLogger("selkies_gamepad")
logger_gst_app = logging.getLogger("gst_app")
logger_gst_app_resize = logging.getLogger("gst_app_resize")
logger_input_handler = logging.getLogger("input_handler")
logger = logging.getLogger("main")
data_logger = logging.getLogger("data_websocket")

X11_CAPTURE_AVAILABLE = False
GSTREAMER_AVAILABLE = True

import asyncio
import argparse
import base64
import ctypes
import json
import os
import pathlib
import re
import struct
import subprocess
import sys
import time
import websockets
import websockets.asyncio.server
from collections import OrderedDict, deque
from datetime import datetime
from shutil import which
from signal import SIGINT, signal

try:
    import gi

    gi.require_version("GLib", "2.0")
    gi.require_version("Gst", "1.0")
    from gi.repository import GLib, Gst
except Exception as e:
    GSTREAMER_AVAILABLE = False
    logger.error(f"Failed to import GStreamer Python bindings (gi): {e}")

try:
    import pulsectl
    import pasimple

    PULSEAUDIO_AVAILABLE = True
except ImportError:
    PULSEAUDIO_AVAILABLE = False
    data_logger.warning(
        "pulsectl or pasimple not found. Microphone forwarding will be disabled."
    )

try:
    from pixelflux import CaptureSettings, ScreenCapture, StripeCallback

    X11_CAPTURE_AVAILABLE = True
    data_logger.info("pixelflux library found. Striped encoding modes available.")
except ImportError:
    X11_CAPTURE_AVAILABLE = False
    data_logger.warning(
        "pixelflux library not found. Striped encoding modes unavailable."
    )

from input_handler import WebRTCInput as InputHandler, SelkiesGamepad, GamepadMapper
import psutil
import GPUtil
import traceback

upload_dir_path = os.path.expanduser("~/Desktop")
try:
    os.makedirs(upload_dir_path, exist_ok=True)
    logger.info(f"Upload directory ensured: {upload_dir_path}")
except OSError as e:
    logger.error(f"Could not create upload directory {upload_dir_path}: {e}")
    upload_dir_path = None


class GSTAppError(Exception):
    pass


def perform_initial_gstreamer_check(cli_selected_encoder=None):
    """
    Performs an initial check for essential GStreamer elements.
    Exits the application if critical elements are missing.
    """
    global GSTREAMER_AVAILABLE
    if not GSTREAMER_AVAILABLE:
        logger.critical(
            "GStreamer Python bindings (gi module) are not available. Application cannot continue."
        )
        sys.exit(1)
    try:
        Gst.init(None)  # Initialize GStreamer
    except Exception as e:
        logger.critical(
            f"Failed to initialize GStreamer (Gst.init(None) failed): {e}. Application cannot continue."
        )
        GSTREAMER_AVAILABLE = False
        sys.exit(1)

    base_elements = [
        "appsink",
        "queue",
        "audioconvert",
        "audioresample",
        "pulsesrc",
        "opusenc",
    ]

    if cli_selected_encoder and cli_selected_encoder not in ["jpeg", "x264enc-striped"]:
        base_elements.extend(["ximagesrc", "videoconvert"])
        supported_gst_video_encoders = [
            "x264enc",
            "nvh264enc",
            "vah264enc",
            "openh264enc",
        ]
        if cli_selected_encoder in supported_gst_video_encoders:
            base_elements.append(cli_selected_encoder)
            if cli_selected_encoder == "nvh264enc":
                base_elements.append("cudaupload")
            elif cli_selected_encoder == "vah264enc":
                base_elements.append("vapostproc")
        else:
            logger.warning(
                f"Encoder '{cli_selected_encoder}' is not in the known list of GStreamer encoders. "
                f"Will attempt to check for its factory. Ensure its plugin is installed."
            )
            base_elements.append(cli_selected_encoder)

    missing_elements = []
    for el_name in set(base_elements):
        if Gst.ElementFactory.find(el_name) is None:
            missing_elements.append(el_name)

    if missing_elements:
        logger.critical(
            f"Essential GStreamer element(s) are missing: {', '.join(missing_elements)}. "
            f"Application cannot continue. Please ensure GStreamer and the required plugins "
            f"are correctly installed and accessible in your environment. "
            f"(Checked for elements relevant to encoder: '{cli_selected_encoder or 'N/A'}')"
        )
        sys.exit(1)

    logger.info("Initial GStreamer element check passed successfully.")


class GSTStreamingApp:
    def __init__(
        self,
        async_event_loop,
        framerate,
        encoder,
        video_bitrate,
        data_streaming_server=None,
        mode="websockets",
    ):
        self.server_enable_resize = ENABLE_RESIZE
        self.mode = mode
        self.display_width = 1024
        self.display_height = 768
        self.pipeline_running = False
        self.audio_pipeline_running_ws_flag = False
        self.async_event_loop = async_event_loop
        self.audio_channels = AUDIO_CHANNELS_DEFAULT
        self.gpu_id = GPU_ID_DEFAULT
        self.audio_bitrate = AUDIO_BITRATE_DEFAULT
        self.keyframe_distance = KEYFRAME_DISTANCE_DEFAULT
        self.pipeline = None
        self.audio_ws_pipeline = None
        self.encoder = encoder
        self.framerate = framerate
        self.video_bitrate = video_bitrate
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
        self.vbv_multiplier_sw = 1.5 if self.keyframe_distance == -1.0 else 3

        self.ximagesrc = None
        self.ximagesrc_caps = None
        self.last_cursor_sent = None
        self.data_streaming_server = data_streaming_server
        self._current_server_fps = 0.0
        self._ws_frame_count = 0
        self._ws_fps_last_calc_time = time.monotonic()
        self._fps_interval_sec = 2.0
        self.gstreamer_ws_current_frame_id = 0

    def build_audio_ws_pipeline(self):
        if not GSTREAMER_AVAILABLE:
            logger_gst_app.error(
                "Cannot build audio pipeline: GStreamer not available."
            )
            return None
        logger_gst_app.info("Building WebSocket audio pipeline...")
        audio_pipeline_string = f"""
            pulsesrc name=source device=output.monitor ! queue name=queue1 ! audioconvert name=convert ! audioresample !
            capsfilter name=audioconvert_capsfilter caps=audio/x-raw,channels={self.audio_channels},rate=48000 !
            opusenc name=encoder
                audio-type=restricted-lowdelay bandwidth=fullband
                bitrate-type=vbr
                frame-size=20
                perfect-timestamp=true max-payload-size=4000
                bitrate={self.audio_bitrate}
                dtx=true !
            queue name=queue2 ! appsink name=sink emit-signals=true sync=false
        """
        try:
            self.audio_ws_pipeline = Gst.parse_launch(audio_pipeline_string)
        except Gst.ParseError as e:
            error_message = f"Error parsing audio pipeline string: {e}"
            logger_gst_app.error(error_message)
            raise GSTAppError(error_message) from e

        if not self.audio_ws_pipeline:
            raise GSTAppError("Error: Could not create audio pipeline from string")

        audio_sink = self.audio_ws_pipeline.get_by_name("sink")
        if not audio_sink:
            raise GSTAppError("Error: Could not get audio sink element")

        def on_new_audio_sample(sink):
            sample = sink.emit("pull-sample")
            if sample:
                buffer = sample.get_buffer()
                if buffer:
                    success, map_info = buffer.map(Gst.MapFlags.READ)
                    if success:
                        data_copy = bytes(map_info.data)
                        frame_type_byte = b"\x00"
                        data_type_byte = b"\x01"
                        prefixed_data = data_type_byte + frame_type_byte + data_copy
                        if self.data_streaming_server and \
                           hasattr(self.data_streaming_server, 'clients') and \
                           self.data_streaming_server.clients and \
                           self.async_event_loop and self.async_event_loop.is_running():

                            clients_ref = self.data_streaming_server.clients
                            data_to_broadcast_ref = prefixed_data

                            async def _broadcast_audio_data_helper():
                                websockets.broadcast(clients_ref, data_to_broadcast_ref)

                            asyncio.run_coroutine_threadsafe(
                                _broadcast_audio_data_helper(),
                                self.async_event_loop
                            )
                        else:
                            if not (self.data_streaming_server and hasattr(self.data_streaming_server, 'clients') and self.data_streaming_server.clients):
                                data_logger.warning("Cannot broadcast GStreamer audio: data_streaming_server.clients not available or empty.")
                            elif not (self.async_event_loop and self.async_event_loop.is_running()):
                                data_logger.warning("Cannot broadcast GStreamer audio: async event loop not available or not running.")
                        buffer.unmap(map_info)
                    else:
                        logger_gst_app.error("Error mapping audio buffer")
                return Gst.FlowReturn.OK
            return Gst.FlowReturn.OK

        audio_sink.connect("new-sample", on_new_audio_sample)
        return self.audio_ws_pipeline

    def send_ws_clipboard_data(self, data): # Assumed to be called from a threaded context based on original run_coroutine_threadsafe
        if self.data_streaming_server and \
           hasattr(self.data_streaming_server, 'clients') and \
           self.data_streaming_server.clients and \
           self.async_event_loop and self.async_event_loop.is_running():

            msg_to_broadcast = f"clipboard,{base64.b64encode(data.encode()).decode()}"
            clients_ref = self.data_streaming_server.clients

            async def _broadcast_clipboard_helper():
                websockets.broadcast(clients_ref, msg_to_broadcast)

            asyncio.run_coroutine_threadsafe(
                _broadcast_clipboard_helper(),
                self.async_event_loop
            )
        else:
            data_logger.warning("Cannot broadcast clipboard data: prerequisites not met.")


    def send_ws_cursor_data(self, data): # Assumed to be called from a threaded context
        if self.data_streaming_server and \
           hasattr(self.data_streaming_server, 'clients') and \
           self.data_streaming_server.clients and \
           self.async_event_loop and self.async_event_loop.is_running():

            msg_str = json.dumps(data)
            msg_to_broadcast = f"cursor,{msg_str}"
            clients_ref = self.data_streaming_server.clients

            async def _broadcast_cursor_helper():
                websockets.broadcast(clients_ref, msg_to_broadcast)

            asyncio.run_coroutine_threadsafe(
                _broadcast_cursor_helper(),
                self.async_event_loop
            )
        else:
            data_logger.warning("Cannot broadcast cursor data: prerequisites not met.")


    def start_ws_pipeline(self):
        if not GSTREAMER_AVAILABLE:
            logger_gst_app.error(
                "Cannot start GStreamer video pipeline: GStreamer not available."
            )
            return None
        if self.encoder in ["jpeg", "x264enc-striped"]:
            logger_gst_app.error(
                f"start_ws_pipeline called for non-GStreamer encoder '{self.encoder}'. This should not happen."
            )
            return None

        logger_gst_app.info(
            f"Starting WebSocket GStreamer video pipeline with encoder: {self.encoder}"
        )
        self.pipeline = Gst.Pipeline.new()
        if not self.pipeline:
            raise GSTAppError("Error: Could not create video pipeline")

        self.ximagesrc = Gst.ElementFactory.make("ximagesrc", "source")
        queue1 = Gst.ElementFactory.make("queue", "queue1")
        videoconvert_main = Gst.ElementFactory.make("videoconvert", "convert")
        videoconvert_main_capsfilter = Gst.ElementFactory.make(
            "capsfilter", "videoconvert_capsfilter"
        )
        queue2 = Gst.ElementFactory.make("queue", "queue2")
        appsink = Gst.ElementFactory.make("appsink", "sink")

        common_elements_map = {
            "ximagesrc": self.ximagesrc,
            "queue1": queue1,
            "videoconvert": videoconvert_main,
            "videoconvert_capsfilter": videoconvert_main_capsfilter,
            "queue2": queue2,
            "appsink": appsink,
        }
        missing_common = [name for name, el in common_elements_map.items() if not el]
        if missing_common:
            raise GSTAppError(
                f"Failed to create one or more core GStreamer elements: {missing_common}"
            )

        self.ximagesrc.set_property("show-pointer", 0)
        self.ximagesrc.set_property("remote", 1)
        self.ximagesrc.set_property("use-damage", 0)

        videoconvert_main.set_property("n-threads", os.cpu_count())
        videoconvert_main.set_property("qos", True)

        encoder_chain_elements = []
        videoconvert_output_format = "NV12"

        if self.encoder == "x264enc":
            videoconvert_output_format = "I420"
            encoder = Gst.ElementFactory.make("x264enc", "encoder")
            if not encoder:
                raise GSTAppError("Failed to create x264enc")
            encoder.set_property("threads", os.cpu_count())
            encoder.set_property("aud", False)
            encoder.set_property("b-adapt", False)
            encoder.set_property("bframes", 0)
            encoder.set_property(
                "key-int-max",
                2147483647
                if self.keyframe_distance == -1.0
                else self.keyframe_frame_distance,
            )
            encoder.set_property("mb-tree", False)
            encoder.set_property("rc-lookahead", 0)
            encoder.set_property("sync-lookahead", 0)
            encoder.set_property(
                "vbv-buf-capacity",
                int(
                    (1000 + self.framerate - 1)
                    // self.framerate
                    * self.vbv_multiplier_sw
                ),
            )
            encoder.set_property("sliced-threads", True)
            encoder.set_property("byte-stream", True)
            encoder.set_property("pass", "cbr")
            encoder.set_property("speed-preset", "ultrafast")
            encoder.set_property("tune", "zerolatency")
            encoder.set_property("bitrate", self.video_bitrate)
            encoder_chain_elements = [encoder]

        elif self.encoder == "nvh264enc":
            videoconvert_output_format = "NV12"
            base_name = (
                "nvcudah264enc"
                if Gst.version().major == 1 and 20 < Gst.version().minor <= 24
                else "nvh264enc"
            )
            if self.gpu_id > 0:
                base_name = (
                    "nvcudah264device{}enc"
                    if Gst.version().major == 1 and 20 < Gst.version().minor <= 24
                    else "nvh264device{}enc"
                )
                base_name = base_name.format(self.gpu_id)
            encoder = Gst.ElementFactory.make(base_name, "encoder")
            if not encoder:
                raise GSTAppError(f"Failed to create {base_name}")

            encoder.set_property("bitrate", self.video_bitrate)
            props = [p.name for p in encoder.list_properties()]
            if "rate-control" in props:
                encoder.set_property("rate-control", "cbr")
            elif "rc-mode" in props:
                encoder.set_property("rc-mode", "cbr")
            encoder.set_property(
                "gop-size",
                -1 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance,
            )
            encoder.set_property("preset", "low-latency-hq")

            h264_caps = Gst.caps_from_string(
                "video/x-h264,profile=main,stream-format=byte-stream"
            )
            h264_capsfilter_nv = Gst.ElementFactory.make(
                "capsfilter", "h264enc_capsfilter_nv"
            )
            if not h264_capsfilter_nv:
                raise GSTAppError("Failed to create capsfilter for nvh264enc")
            h264_capsfilter_nv.set_property("caps", h264_caps)
            encoder_chain_elements = [encoder, h264_capsfilter_nv]

        elif self.encoder == "vah264enc":
            videoconvert_output_format = "NV12"
            vapostproc = Gst.ElementFactory.make("vapostproc", "vapostproc_el")
            if not vapostproc:
                raise GSTAppError("Failed to create vapostproc for vah264enc")
            encoder = Gst.ElementFactory.make("vah264enc", "encoder")
            if not encoder:
                raise GSTAppError("Failed to create vah264enc")
            encoder.set_property("bitrate", self.video_bitrate)

            h264_caps = Gst.caps_from_string(
                "video/x-h264,profile=main,stream-format=byte-stream"
            )
            h264_capsfilter_va = Gst.ElementFactory.make(
                "capsfilter", "h264enc_capsfilter_va"
            )
            if not h264_capsfilter_va:
                raise GSTAppError("Failed to create capsfilter for vah264enc")
            h264_capsfilter_va.set_property("caps", h264_caps)
            encoder_chain_elements = [vapostproc, encoder, h264_capsfilter_va]

        elif self.encoder == "openh264enc":
            videoconvert_output_format = "I420"
            encoder = Gst.ElementFactory.make("openh264enc", "encoder")
            if not encoder:
                raise GSTAppError("Failed to create openh264enc")
            encoder.set_property("usage-type", "screen")
            encoder.set_property("rate-control", "bitrate")
            encoder.set_property("bitrate", self.video_bitrate * 1000)
            effective_gop_size = self.keyframe_frame_distance
            if self.keyframe_distance == -1.0:
                effective_gop_size = 2147483647
            encoder.set_property("gop-size", effective_gop_size)

            h264_caps = Gst.caps_from_string("video/x-h264,stream-format=byte-stream")
            h264_capsfilter_openh264 = Gst.ElementFactory.make(
                "capsfilter", "h264enc_capsfilter_openh264"
            )
            if not h264_capsfilter_openh264:
                raise GSTAppError("Failed to create capsfilter for openh264enc")
            h264_capsfilter_openh264.set_property("caps", h264_caps)
            encoder_chain_elements = [encoder, h264_capsfilter_openh264]

        else:
            raise GSTAppError(
                f"Unsupported GStreamer encoder for pipeline construction: {self.encoder}"
            )

        vc_caps_str = f"video/x-raw,format={videoconvert_output_format},framerate={self.framerate}/1,width={self.display_width},height={self.display_height}"
        vc_caps = Gst.caps_from_string(vc_caps_str)
        videoconvert_main_capsfilter.set_property("caps", vc_caps)
        logger_gst_app.debug(f"Set videoconvert output caps to: {vc_caps_str}")

        all_pipeline_elements = (
            [self.ximagesrc, queue1, videoconvert_main, videoconvert_main_capsfilter]
            + encoder_chain_elements
            + [queue2, appsink]
        )

        for el in all_pipeline_elements:
            if not el:
                raise GSTAppError(
                    f"A GStreamer element is None during pipeline assembly. This indicates a problem with earlier element creation or logic."
                )
            self.pipeline.add(el)
            logger_gst_app.debug(f"Added {el.get_name()} to pipeline.")

        for i in range(len(all_pipeline_elements) - 1):
            source_el = all_pipeline_elements[i]
            sink_el = all_pipeline_elements[i + 1]
            logger_gst_app.debug(
                f"Linking {source_el.get_name()} -> {sink_el.get_name()}"
            )
            if not Gst.Element.link(source_el, sink_el):
                raise GSTAppError(
                    f"Failed to link GStreamer elements: {source_el.get_name()} -> {sink_el.get_name()}"
                )

        appsink.set_property("emit-signals", True)
        appsink.set_property("sync", False)
        appsink.set_property("max-buffers", 2)
        appsink.set_property("drop", True)
        appsink.connect("new-sample", self._on_new_video_sample_ws)

        self.pipeline_running = True
        res = self.pipeline.set_state(Gst.State.PLAYING)
        if res == Gst.StateChangeReturn.FAILURE:
            self.pipeline_running = False
            bus = self.pipeline.get_bus()
            err_msg_detail = "Unknown GStreamer error."
            if bus:
                gst_err_msg_obj = bus.timed_pop_filtered(
                    Gst.CLOCK_TIME_NONE, Gst.MessageType.ERROR
                )
                if gst_err_msg_obj:
                    gst_err, debug_info = gst_err_msg_obj.parse_error()
                    err_msg_detail = f"GStreamer error: {gst_err} (Debug: {debug_info})"
            raise GSTAppError(
                f"Failed to set video pipeline to PLAYING. {err_msg_detail}"
            )
        elif res == Gst.StateChangeReturn.ASYNC:
            logger_gst_app.info(
                "Video pipeline state change to PLAYING is ASYNCHRONOUS."
            )
        else:
            logger_gst_app.info(
                "Video pipeline state change to PLAYING was successful or no preroll."
            )
        return self.pipeline

    def _on_new_video_sample_ws(self, sink):
        sample = sink.emit("pull-sample")
        if sample:
            self._ws_frame_count += 1
            now = time.monotonic()
            if (now - self._ws_fps_last_calc_time) >= self._fps_interval_sec:
                self._current_server_fps = self._ws_frame_count / (
                    now - self._ws_fps_last_calc_time
                )
                self._ws_frame_count = 0
                self._ws_fps_last_calc_time = now

            buffer = sample.get_buffer()
            if buffer:
                is_delta = bool(buffer.get_flags() & Gst.BufferFlags.DELTA_UNIT)
                success, map_info = buffer.map(Gst.MapFlags.READ)
                if success:
                    data_copy = bytes(map_info.data)
                    self.gstreamer_ws_current_frame_id = (
                        self.gstreamer_ws_current_frame_id + 1
                    ) % 65536
                    if self.data_streaming_server:
                        self.data_streaming_server.update_last_sent_frame_id(
                            self.gstreamer_ws_current_frame_id
                        )

                    header = (
                        b"\x00"
                        + (b"\x00" if is_delta else b"\x01")
                        + struct.pack("!H", self.gstreamer_ws_current_frame_id)
                    )
                    prefixed_data = header + data_copy

                    if self.data_streaming_server and \
                       hasattr(self.data_streaming_server, 'clients') and \
                       self.data_streaming_server.clients and \
                       self.async_event_loop and self.async_event_loop.is_running():

                        clients_ref = self.data_streaming_server.clients
                        data_to_broadcast_ref = prefixed_data

                        async def _broadcast_gst_video_data_helper():
                            websockets.broadcast(clients_ref, data_to_broadcast_ref)

                        asyncio.run_coroutine_threadsafe(
                            _broadcast_gst_video_data_helper(),
                            self.async_event_loop
                        )
                    else:
                        if not (self.data_streaming_server and hasattr(self.data_streaming_server, 'clients') and self.data_streaming_server.clients):
                            data_logger.warning("Cannot broadcast GStreamer video: data_streaming_server.clients not available or empty.")
                        elif not (self.async_event_loop and self.async_event_loop.is_running()):
                             data_logger.warning("Cannot broadcast GStreamer video: async event loop not available or not running.")
                    buffer.unmap(map_info)
            return Gst.FlowReturn.OK
        return Gst.FlowReturn.OK

    async def stop_pipeline(self):
        logger_gst_app.info("Stopping GStreamer pipeline(s)")
        if self.pipeline:
            logger_gst_app.info("Setting video pipeline to NULL")
            await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
            self.pipeline = None
        if self.audio_ws_pipeline:
            logger_gst_app.info("Setting audio pipeline to NULL")
            await asyncio.to_thread(self.audio_ws_pipeline.set_state, Gst.State.NULL)
            self.audio_ws_pipeline = None
            self.audio_pipeline_running_ws_flag = False
        self.pipeline_running = False
        logger_gst_app.info("Pipeline(s) stopped.")

    stop_ws_pipeline = stop_pipeline

    def get_current_server_fps(self):
        return self._current_server_fps

    async def start_websocket_video_pipeline(self):
        if not GSTREAMER_AVAILABLE:
            logger_gst_app.error(
                "Cannot start GStreamer video: GStreamer not available."
            )
            return
        if self.encoder in ["jpeg", "x264enc-striped"]:
            logger_gst_app.info(
                f"Video encoder '{self.encoder}' is handled by pixelflux, not GStreamer pipeline. Call corresponding start method."
            )
            return
        if self.encoder is None:
            logger_gst_app.warning(
                "No GStreamer encoder specified, cannot start GStreamer video pipeline."
            )
            if self.pipeline:
                await self.stop_websocket_video_pipeline()
            return

        logger_gst_app.info("Starting GStreamer WebSocket video pipeline...")
        try:
            if self.pipeline:
                await self.stop_websocket_video_pipeline()
            self.start_ws_pipeline()
            logger_gst_app.info("GStreamer WebSocket video pipeline started.")
        except Exception as e:
            logger_gst_app.error(
                f"Error starting GStreamer WebSocket video pipeline: {e}", exc_info=True
            )
            if self.pipeline:
                await self.stop_websocket_video_pipeline()
            raise

    async def stop_websocket_video_pipeline(self):
        logger_gst_app.info("Stopping WebSocket video pipeline...")
        if self.pipeline:
            try:
                await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
                self.pipeline = None
                self.pipeline_running = False
                logger_gst_app.info("WebSocket video pipeline stopped.")
            except Exception as e:
                logger_gst_app.error(
                    f"Error stopping WebSocket video pipeline: {e}", exc_info=True
                )
        else:
            self.pipeline_running = False

    async def start_websocket_audio_pipeline(self):
        if not GSTREAMER_AVAILABLE:
            logger_gst_app.error(
                "Cannot start audio pipeline: GStreamer not available."
            )
            return
        logger_gst_app.info("Starting WebSocket audio pipeline...")
        try:
            if self.audio_ws_pipeline:
                await self.stop_websocket_audio_pipeline()
            pipeline = self.build_audio_ws_pipeline()
            if pipeline:
                res = pipeline.set_state(Gst.State.PLAYING)
                if res == Gst.StateChangeReturn.FAILURE:
                    raise GSTAppError("Failed to set audio pipeline to PLAYING")
                elif res == Gst.StateChangeReturn.ASYNC:
                    logger_gst_app.info(
                        "Audio pipeline state change to PLAYING is ASYNC."
                    )
                self.audio_pipeline_running_ws_flag = True
                logger_gst_app.info("WebSocket audio pipeline started.")
        except Exception as e:
            logger_gst_app.error(
                f"Error starting WebSocket audio pipeline: {e}", exc_info=True
            )
            if self.audio_ws_pipeline:
                await self.stop_websocket_audio_pipeline()
            raise

    async def stop_websocket_audio_pipeline(self):
        logger_gst_app.info("Stopping WebSocket audio pipeline...")
        if self.audio_ws_pipeline:
            try:
                await asyncio.to_thread(
                    self.audio_ws_pipeline.set_state, Gst.State.NULL
                )
                self.audio_ws_pipeline = None
                self.audio_pipeline_running_ws_flag = False
                logger_gst_app.info("WebSocket audio pipeline stopped.")
            except Exception as e:
                logger_gst_app.error(
                    f"Error stopping WebSocket audio pipeline: {e}", exc_info=True
                )
        else:
            self.audio_pipeline_running_ws_flag = False

    def set_framerate(self, framerate):
        self.framerate = int(framerate)
        self.keyframe_frame_distance = (
            -1
            if self.keyframe_distance == -1.0
            else max(
                self.min_keyframe_frame_distance,
                int(self.framerate * self.keyframe_distance),
            )
        )
        if (
            self.pipeline
            and self.pipeline_running
            and self.encoder not in ["jpeg", "x264enc-striped"]
        ):
            encoder_el = self.pipeline.get_by_name("encoder")
            if encoder_el:
                if self.encoder.startswith("nv") or self.encoder == "openh264enc":
                    encoder_el.set_property(
                        "gop-size",
                        -1
                        if self.keyframe_distance == -1.0
                        else self.keyframe_frame_distance,
                    )
                elif (
                    self.encoder == "openh264enc"
                ):  # This elif is redundant with the one above, but kept as per original logic flow.
                    effective_gop_size = self.keyframe_frame_distance
                    if self.keyframe_distance == -1.0:
                        effective_gop_size = 2147483647
                    encoder_el.set_property("gop-size", effective_gop_size)
                elif self.encoder.startswith("va") or self.encoder == "x264enc":
                    encoder_el.set_property(
                        "key-int-max",
                        2147483647
                        if self.keyframe_distance == -1.0
                        else self.keyframe_frame_distance,
                    )

            vc_capsfilter = self.pipeline.get_by_name("videoconvert_capsfilter")
            if vc_capsfilter:
                caps_str = vc_capsfilter.get_property("caps").to_string()
                if "video/x-raw" in caps_str:
                    new_caps_str = re.sub(
                        r"framerate=\(fraction\)\d+/\d+",
                        f"framerate=(fraction){self.framerate}/1",
                        caps_str,
                    )
                    try:
                        vc_capsfilter.set_property(
                            "caps", Gst.caps_from_string(new_caps_str)
                        )
                        logger_gst_app.info(
                            f"Videoconvert capsfilter framerate updated to: {self.framerate}"
                        )
                    except Exception as e:
                        logger_gst_app.error(
                            f"Failed to update videoconvert capsfilter framerate: {e}"
                        )
            logger_gst_app.info(
                "GStreamer pipeline framerate set to: %d" % self.framerate
            )
        elif self.encoder in ["jpeg", "x264enc-striped"]:
            logger_gst_app.info(
                f"Framerate for {self.encoder} set to {self.framerate}. Restart pipeline if active."
            )

    def set_video_bitrate(self, bitrate):
        self.video_bitrate = int(bitrate)
        if (
            self.pipeline
            and self.pipeline_running
            and self.encoder not in ["jpeg", "x264enc-striped"]
        ):
            encoder_el = self.pipeline.get_by_name("encoder")
            if encoder_el:
                if self.encoder.startswith("nv"):
                    encoder_el.set_property(
                        "vbv-buffer-size",
                        int(
                            (self.video_bitrate + self.framerate - 1)
                            // self.framerate
                            * self.vbv_multiplier_nv
                        ),
                    )
                    encoder_el.set_property("bitrate", self.video_bitrate)
                elif self.encoder.startswith("va"):
                    encoder_el.set_property(
                        "cpb-size",
                        int(
                            (self.video_bitrate + self.framerate - 1)
                            // self.framerate
                            * self.vbv_multiplier_va
                        ),
                    )
                    encoder_el.set_property("bitrate", self.video_bitrate)
                elif self.encoder == "x264enc":
                    encoder_el.set_property("bitrate", self.video_bitrate)
                elif self.encoder == "openh264enc":
                    encoder_el.set_property("bitrate", self.video_bitrate * 1000)
                logger_gst_app.info(
                    "GStreamer video bitrate set to: %d kbps" % self.video_bitrate
                )
            else:
                logger_gst_app.warning(
                    f"Could not find GStreamer encoder for bitrate update: {self.encoder}"
                )
        elif self.encoder in ["jpeg", "x264enc-striped"]:
            logger_gst_app.info(
                f"Video bitrate for {self.encoder} set to {self.video_bitrate} (quality for JPEG, ignored for striped H264 here)."
            )

    def set_audio_bitrate(self, bitrate):
        self.audio_bitrate = int(bitrate)
        if self.audio_ws_pipeline and self.audio_pipeline_running_ws_flag:
            encoder_el = self.audio_ws_pipeline.get_by_name("encoder")
            if encoder_el:
                encoder_el.set_property("bitrate", self.audio_bitrate)
                logger_gst_app.info("Audio bitrate set to: %d bps" % self.audio_bitrate)
            else:
                logger_gst_app.warning(
                    "Could not find audio encoder for bitrate update."
                )

    def set_pointer_visible(self, visible):
        if (
            self.pipeline
            and self.pipeline_running
            and self.encoder not in ["jpeg", "x264enc-striped"]
        ):
            ximagesrc_el = self.pipeline.get_by_name("source")
            if ximagesrc_el:
                ximagesrc_el.set_property("show-pointer", bool(visible))
                logger_gst_app.info(
                    f"Set GStreamer pipeline pointer visibility to: {visible}"
                )

    def bus_call(self, message):
        t = message.type
        src_name = (
            message.src.get_name() if message and message.src else "UnknownSource"
        )

        if t == Gst.MessageType.EOS:
            logger_gst_app.info(f"End-of-stream from pipeline: {src_name}")
            if message.src == self.pipeline:
                self.pipeline_running = False
            if message.src == self.audio_ws_pipeline:
                self.audio_pipeline_running_ws_flag = False
            return True
        elif t == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            logger_gst_app.error(f"Error from pipeline {src_name}: {err} - {debug}")
            if message.src == self.pipeline:
                self.pipeline_running = False
            if message.src == self.audio_ws_pipeline:
                self.audio_pipeline_running_ws_flag = False
            return False
        elif t == Gst.MessageType.STATE_CHANGED:
            if isinstance(message.src, Gst.Pipeline):
                old, new, pending = message.parse_state_changed()
                logger_gst_app.debug(
                    f"Pipeline '{src_name}' state: {old.value_nick} -> {new.value_nick}"
                )
                if new == Gst.State.NULL or new == Gst.State.READY:
                    if old == Gst.State.PLAYING or old == Gst.State.PAUSED:
                        if message.src == self.pipeline:
                            self.pipeline_running = False
                        elif message.src == self.audio_ws_pipeline:
                            self.audio_pipeline_running_ws_flag = False
        return True

    async def handle_bus_calls(self):
        if not GSTREAMER_AVAILABLE:
            return

        active_buses_map = {}

        def update_buses():
            nonlocal active_buses_map
            current_buses = {}
            if self.pipeline and self.pipeline.get_bus():
                current_buses[self.pipeline.get_bus()] = self.pipeline
            if self.audio_ws_pipeline and self.audio_ws_pipeline.get_bus():
                current_buses[self.audio_ws_pipeline.get_bus()] = self.audio_ws_pipeline
            active_buses_map = current_buses

        update_buses()

        while True:
            update_buses()
            if not active_buses_map:
                if (
                    not self.pipeline_running
                    and not self.audio_pipeline_running_ws_flag
                ):
                    logger_gst_app.debug(
                        "No active GStreamer buses and no pipelines running. Exiting bus handler."
                    )
                    break
                await asyncio.sleep(0.2)
                continue

            processed_message_on_any_bus = False
            for bus, pipeline_obj in list(active_buses_map.items()):
                message = bus.timed_pop_filtered(10 * Gst.MSECOND, Gst.MessageType.ANY)
                if message:
                    processed_message_on_any_bus = True
                    if not self.bus_call(message):
                        logger_gst_app.info(
                            f"Bus call for {pipeline_obj.get_name()} indicated stop. GStreamer pipeline likely ended or errored."
                        )
                        break

            if not processed_message_on_any_bus:
                await asyncio.sleep(0.05)
        logger_gst_app.info("GStreamer bus handling loop finished.")


def fit_res(w, h, max_w, max_h):
    if w <= max_w and h <= max_h:
        return w, h
    aspect = w / h
    if w > max_w:
        w = max_w
        h = int(w / aspect)
    if h > max_h:
        h = max_h
        w = int(h * aspect)
    return w - (w % 2), h - (h % 2)


def get_new_res(res_str):
    screen_name = None
    resolutions = []
    screen_pat = re.compile(r"(\S+) connected")
    current_pat = re.compile(r".*current (\d+\s*x\s*\d+).*")
    res_pat = re.compile(r"^(\d+x\d+)\s+\d+\.\d+.*")
    curr_res = new_res = max_res_str = res_str
    try:
        xrandr_output = subprocess.check_output(
            ["xrandr"], text=True, stderr=subprocess.STDOUT
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        logger_gst_app_resize.error(f"xrandr command failed: {e}")
        return curr_res, new_res, resolutions, max_res_str, screen_name
    current_screen_modes_started = False
    for line in xrandr_output.splitlines():
        screen_match = screen_pat.match(line)
        if screen_match:
            if screen_name is None:
                screen_name = screen_match.group(1)
            current_screen_modes_started = screen_name == screen_match.group(1)
        if current_screen_modes_started:
            current_match = current_pat.match(line)
            if current_match:
                curr_res = current_match.group(1).replace(" ", "")
            res_match = res_pat.match(line.strip())
            if res_match:
                resolutions.append(res_match.group(1))
    if not screen_name:
        logger_gst_app_resize.warning(
            "Could not determine connected screen from xrandr."
        )
        return curr_res, new_res, resolutions, max_res_str, screen_name
    max_w_limit, max_h_limit = 7680, 4320
    max_res_str = f"{max_w_limit}x{max_h_limit}"
    try:
        w, h = map(int, res_str.split("x"))
        new_w, new_h = fit_res(w, h, max_w_limit, max_h_limit)
        new_res = f"{new_w}x{new_h}"
    except ValueError:
        logger_gst_app_resize.error(f"Invalid resolution format for fitting: {res_str}")
    resolutions = sorted(list(set(resolutions)))
    return curr_res, new_res, resolutions, max_res_str, screen_name


def resize_display(res_str):  # e.g., res_str is "2560x1280"
    """
    Resizes the display using xrandr to the specified resolution string.
    Adds a new mode via cvt/gtf if the requested mode doesn't exist,
    using res_str (e.g., "2560x1280") as the mode name for xrandr.
    """
    _, _, available_resolutions, _, screen_name = get_new_res(res_str)

    if not screen_name:
        logger_gst_app_resize.error(
            "Cannot resize display via xrandr, no screen identified."
        )
        return False

    target_mode_to_set = res_str

    if res_str not in available_resolutions:
        logger_gst_app_resize.info(
            f"Mode {res_str} not found in xrandr list. Attempting to add for screen '{screen_name}'."
        )
        try:
            (
                modeline_name_from_cvt_output,
                modeline_params,
            ) = generate_xrandr_gtf_modeline(res_str)
        except Exception as e:
            logger_gst_app_resize.error(
                f"Failed to generate modeline for {res_str}: {e}"
            )
            return False

        cmd_new = ["xrandr", "--newmode", res_str] + modeline_params.split()
        new_mode_proc = subprocess.run(cmd_new, capture_output=True, text=True)
        if new_mode_proc.returncode != 0:
            logger_gst_app_resize.error(
                f"Failed to create new xrandr mode with '{' '.join(cmd_new)}': {new_mode_proc.stderr}"
            )
            return False
        logger_gst_app_resize.info(f"Successfully ran: {' '.join(cmd_new)}")

        # Use res_str (e.g., "2560x1280") as the mode name for --addmode
        cmd_add = ["xrandr", "--addmode", screen_name, res_str]
        add_mode_proc = subprocess.run(cmd_add, capture_output=True, text=True)
        if add_mode_proc.returncode != 0:
            logger_gst_app_resize.error(
                f"Failed to add mode '{res_str}' to screen '{screen_name}': {add_mode_proc.stderr}"
            )
            subprocess.run(
                ["xrandr", "--delmode", screen_name, res_str],
                capture_output=True,
                check=False,
            )
            subprocess.run(
                ["xrandr", "--rmmode", res_str], capture_output=True, check=False
            )
            return False
        logger_gst_app_resize.info(f"Successfully ran: {' '.join(cmd_add)}")

    logger_gst_app_resize.info(
        f"Applying xrandr mode '{target_mode_to_set}' for screen '{screen_name}'."
    )
    cmd_output = ["xrandr", "--output", screen_name, "--mode", target_mode_to_set]
    set_mode_proc = subprocess.run(cmd_output, capture_output=True, text=True)
    if set_mode_proc.returncode != 0:
        logger_gst_app_resize.error(
            f"Failed to set mode '{target_mode_to_set}' on screen '{screen_name}': {set_mode_proc.stderr}"
        )
        return False

    logger_gst_app_resize.info(
        f"Successfully applied xrandr mode '{target_mode_to_set}'."
    )
    return True


def generate_xrandr_gtf_modeline(res_wh_str):
    """Generates an xrandr modeline string using cvt or gtf."""
    try:
        w_str, h_str = res_wh_str.split("x")
        cmd = ["cvt", w_str, h_str, "60"]
        tool_name = "cvt"
        try:
            modeline_output = subprocess.check_output(cmd, text=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            logger_gst_app_resize.warning(
                "cvt command failed or not found, trying gtf."
            )
            cmd = ["gtf", w_str, h_str, "60"]
            tool_name = "gtf"
            modeline_output = subprocess.check_output(cmd, text=True)
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        raise Exception(
            f"Failed to generate modeline using {tool_name} for {res_wh_str}: {e}"
        ) from e
    except ValueError:
        raise Exception(
            f"Invalid resolution format for modeline generation: {res_wh_str}"
        )
    match = re.search(r'Modeline\s+"([^"]+)"\s+(.*)', modeline_output)
    if not match:
        raise Exception(
            f"Could not parse modeline from {tool_name} output: {modeline_output}"
        )
    return match.group(1).strip(), match.group(2)


def set_dpi(dpi):
    if not isinstance(dpi, int) or dpi <= 0:
        logger_gst_app_resize.error(f"Invalid DPI value: {dpi}")
        return False
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
        if subprocess.run(cmd, capture_output=True).returncode == 0:
            return True
        logger_gst_app_resize.warning("Failed to set XFCE DPI.")
    if which("gsettings"):
        try:
            scaling_factor = float(dpi) / 96.0
            cmd_set = [
                "gsettings",
                "set",
                "org.gnome.desktop.interface",
                "text-scaling-factor",
                f"{scaling_factor:.2f}",
            ]
            if subprocess.run(cmd_set, capture_output=True).returncode == 0:
                logger_gst_app_resize.info(
                    f"Set GNOME text-scaling-factor for DPI {dpi}"
                )
                return True
            logger_gst_app_resize.warning("Failed to set GNOME text-scaling-factor.")
        except Exception as e:
            logger_gst_app_resize.warning(
                f"Error trying to set GNOME DPI via gsettings: {e}"
            )
    logger_gst_app_resize.warning("No supported tool found/worked to set DPI.")
    return False


def check_encoder_supported(encoder_name):
    if encoder_name in ["jpeg", "x264enc-striped"]:
        return X11_CAPTURE_AVAILABLE
    if not GSTREAMER_AVAILABLE:
        return False
    return bool(Gst.ElementFactory.find(encoder_name))


def set_cursor_size(size):
    if not isinstance(size, int) or size <= 0:
        logger_gst_app_resize.error(f"Invalid cursor size: {size}")
        return False
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
        if subprocess.run(cmd, capture_output=True).returncode == 0:
            return True
        logger_gst_app_resize.warning("Failed to set XFCE cursor size.")
    if which("gsettings"):
        try:
            cmd_set = [
                "gsettings",
                "set",
                "org.gnome.desktop.interface",
                "cursor-size",
                str(size),
            ]
            if subprocess.run(cmd_set, capture_output=True).returncode == 0:
                logger_gst_app_resize.info(f"Set GNOME cursor-size to {size}")
                return True
            logger_gst_app_resize.warning("Failed to set GNOME cursor-size.")
        except Exception as e:
            logger_gst_app_resize.warning(
                f"Error trying to set GNOME cursor size via gsettings: {e}"
            )
    logger_gst_app_resize.warning("No supported tool found/worked to set cursor size.")
    return False


class DataStreamingServer:
    """Handles the data WebSocket connection for input, stats, and control messages."""

    def __init__(
        self,
        port,
        app,
        uinput_mouse_socket,
        js_socket_path,
        enable_clipboard,
        enable_cursors,
        cursor_size,
        cursor_scale,
        cursor_debug,
        cli_args,
    ):
        self.port = port
        self.mode = "websockets"
        self.server = None
        self.stop_server = None
        self.data_ws = None # Represents the specific connection in a ws_handler context
        self.clients = set() # Set of all active client WebSocket connections
        self.app = app
        self.cli_args = cli_args
        self._latest_client_render_fps = 0.0
        self._last_backpressure_check_time = 0.0
        self._last_bitrate_adjustment_time = 0.0
        self._last_time_client_ok = 0.0
        self._backpressure_task = None
        self._active_pipeline_last_sent_frame_id = 0
        self._client_acknowledged_frame_id = -1
        self._frame_backpressure_task = None
        self._consecutive_lag_reports = 0
        self._last_client_acknowledged_frame_id_update_time = 0.0
        self._previous_ack_id_for_stall_check = -1
        self._previous_sent_id_for_stall_check = -1
        self._last_client_stable_report_time = 0.0
        self._sent_frame_timestamps = OrderedDict()
        self._rtt_samples = deque(maxlen=RTT_SMOOTHING_SAMPLES)
        self._smoothed_rtt_ms = 0.0
        self._sent_frames_log = deque()
        self._initial_x264_crf = self.cli_args.h264_crf
        self.h264_crf = self._initial_x264_crf
        self._initial_jpeg_quality = 75
        self._current_jpeg_quality = 75
        self._initial_jpeg_use_paint_over_quality = True
        self._current_jpeg_use_paint_over_quality = True
        self._jpeg_paint_overs_disabled_this_session = False
        self._system_monitor_task_ws = None
        self._gpu_monitor_task_ws = None
        self._stats_sender_task_ws = None
        self._shared_stats_ws = {}
        self.uinput_mouse_socket = uinput_mouse_socket
        self.js_socket_path = js_socket_path
        self.enable_clipboard = enable_clipboard
        self.enable_cursors = enable_cursors
        self.cursor_size = cursor_size
        self.cursor_scale = cursor_scale
        self.cursor_debug = cursor_debug
        self.input_handler = None
        self._last_adjustment_timestamp = 0.0
        self._low_fps_condition_start_timestamp = None
        self.jpeg_capture_module = None
        self.is_jpeg_capturing = False
        self.jpeg_capture_loop = None
        self.x264_striped_capture_module = None
        self.is_x264_striped_capturing = False
        self.x264_python_stripes_received_this_interval = 0
        self.x264_python_last_stripe_log_time = time.monotonic()
        self.X264_PYTHON_STRIPE_LOG_INTERVAL_SECONDS = 1.0
        self.client_settings_received = None
        self._initial_target_bitrate_kbps = (
            self.app.video_bitrate if self.app else TARGET_VIDEO_BITRATE_KBPS
        )
        self._current_target_bitrate_kbps = self._initial_target_bitrate_kbps
        self._min_bitrate_kbps = max(
            MIN_VIDEO_BITRATE_KBPS_BACKPRESSURE, MIN_VIDEO_BITRATE_KBPS
        )

    async def broadcast_stream_resolution(self):
        if self.app and hasattr(self.app, 'display_width') and hasattr(self.app, 'display_height'):
            # Ensure resolution is valid before broadcasting
            if self.app.display_width > 0 and self.app.display_height > 0:
                message = {
                    "type": "stream_resolution",
                    "width": self.app.display_width,
                    "height": self.app.display_height,
                }
                message_str = json.dumps(message)
                data_logger.info(f"Broadcasting stream resolution: {message_str}")
                if self.clients:
                    websockets.broadcast(self.clients, message_str)
            else:
                data_logger.warning(
                    f"Skipping stream resolution broadcast due to invalid dimensions: "
                    f"{self.app.display_width}x{self.app.display_height}"
                )
        else:
            data_logger.warning(
                "Cannot broadcast stream resolution: GSTStreamingApp instance or its display dimensions not available."
            )

    def _x264_striped_stripe_callback(self, result_ptr, user_data):
        current_async_loop = self.jpeg_capture_loop # This is the loop for DataStreamingServer
        if (
            not self.is_x264_striped_capturing
            or not current_async_loop
            or not self.clients # Check self.clients instead of self.data_ws for broadcast
            or not result_ptr
        ):
            return
        result = result_ptr.contents
        if result.data and result.size > 0:
            try:
                payload_from_cpp = bytes(
                    ctypes.cast(
                        result.data, ctypes.POINTER(ctypes.c_ubyte * result.size)
                    ).contents
                )
                
                clients_ref = self.clients
                data_to_send_ref = payload_from_cpp
                frame_id_ref = result.frame_id

                async def _broadcast_x264_data_and_update_frame_id():
                    if clients_ref:
                        websockets.broadcast(clients_ref, data_to_send_ref)
                    self.update_last_sent_frame_id(frame_id_ref)

                if current_async_loop and current_async_loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        _broadcast_x264_data_and_update_frame_id(), current_async_loop
                    )
            except Exception as e:
                data_logger.error(f"X264-Striped callback error: {e}", exc_info=True)

    async def _start_x264_striped_pipeline(self):
        if not X11_CAPTURE_AVAILABLE:
            await self._send_error_to_client("x264-striped (pixelflux) not available.")
            return False
        if self.is_x264_striped_capturing:
            return True
        if not self.app:
            await self._send_error_to_client("Server misconfig (no app).")
            return False
        self.jpeg_capture_loop = self.jpeg_capture_loop or asyncio.get_running_loop()
        if not self.jpeg_capture_loop:
            await self._send_error_to_client("Server error (no loop).")
            return False

        width = getattr(self.app, "display_width", 1024)
        height = getattr(self.app, "display_height", 768)
        fps = float(getattr(self.app, "framerate", TARGET_FRAMERATE))
        crf = self.h264_crf

        data_logger.info(
            f"Starting x264-striped: {width}x{height} @ {fps}fps, CRF: {crf}"
        )
        try:
            cs = CaptureSettings()
            (
                cs.capture_width,
                cs.capture_height,
                cs.target_fps,
                cs.output_mode,
                cs.h264_crf,
            ) = (width, height, fps, 1, crf)
            cb = StripeCallback(self._x264_striped_stripe_callback)
            self.x264_striped_capture_module = ScreenCapture()
            await self.jpeg_capture_loop.run_in_executor(
                None, self.x264_striped_capture_module.start_capture, cs, cb
            )
            self.is_x264_striped_capturing = True
            return True
        except Exception as e:
            data_logger.error(f"Failed to start x264-striped: {e}", exc_info=True)
            await self._send_error_to_client(
                f"Error starting x264-striped: {str(e)[:50]}"
            )
            self.is_x264_striped_capturing = False
            if self.x264_striped_capture_module:
                del self.x264_striped_capture_module
                self.x264_striped_capture_module = None
            return False

    async def _stop_x264_striped_pipeline(self):
        if not self.is_x264_striped_capturing or not self.x264_striped_capture_module:
            return True
        self.is_x264_striped_capturing = False
        data_logger.info("Stopping X11 x264-striped capture...")
        try:
            if self.jpeg_capture_loop and self.x264_striped_capture_module:
                await self.jpeg_capture_loop.run_in_executor(
                    None, self.x264_striped_capture_module.stop_capture
                )
        finally:
            if self.x264_striped_capture_module:
                del self.x264_striped_capture_module
                self.x264_striped_capture_module = None
        return True

    def _jpeg_stripe_callback(self, result_ptr, user_data):
        current_async_loop = self.jpeg_capture_loop # This is the loop for DataStreamingServer
        if (
            not self.is_jpeg_capturing
            or not current_async_loop
            or not self.clients # Check self.clients for broadcast
            or not result_ptr
        ):
            return
        result = result_ptr.contents
        if result.data and result.size > 0:
            try:
                jpeg_buffer = bytes(
                    ctypes.cast(
                        result.data, ctypes.POINTER(ctypes.c_ubyte * result.size)
                    ).contents
                )
                
                clients_ref = self.clients
                prefixed_jpeg_data = b"\x03\x00" + jpeg_buffer
                frame_id_ref = result.frame_id

                async def _broadcast_jpeg_data_and_update_frame_id():
                    if clients_ref:
                        websockets.broadcast(clients_ref, prefixed_jpeg_data)
                    self.update_last_sent_frame_id(frame_id_ref)

                if current_async_loop and current_async_loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        _broadcast_jpeg_data_and_update_frame_id(), current_async_loop
                    )
            except Exception as e:
                data_logger.error(f"JPEG callback error: {e}", exc_info=True)

    async def _start_jpeg_pipeline(self):
        if not X11_CAPTURE_AVAILABLE:
            await self._send_error_to_client("JPEG (pixelflux) not available.")
            return False
        if self.is_jpeg_capturing:
            return True
        if not self.app:
            await self._send_error_to_client("Server misconfig (no app).")
            return False
        self.jpeg_capture_loop = self.jpeg_capture_loop or asyncio.get_running_loop()
        if not self.jpeg_capture_loop:
            await self._send_error_to_client("Server error (no loop).")
            return False

        width = getattr(self.app, "display_width", 1024)
        height = getattr(self.app, "display_height", 768)
        fps = float(getattr(self.app, "framerate", TARGET_FRAMERATE))
        quality = self._current_jpeg_quality

        data_logger.info(f"Starting JPEG: {width}x{height} @ {fps}fps, Q: {quality}")
        try:
            cs = CaptureSettings()
            cs.capture_width = width
            cs.capture_height = height
            cs.capture_x = 0
            cs.capture_y = 0
            cs.target_fps = fps
            cs.output_mode = 0
            cs.jpeg_quality = quality
            cs.paint_over_jpeg_quality = 95
            cs.use_paint_over_quality = self._current_jpeg_use_paint_over_quality
            cs.paint_over_trigger_frames = 2
            cs.damage_block_threshold = 15
            cs.damage_block_duration = 30

            cb = StripeCallback(self._jpeg_stripe_callback)

            if self.jpeg_capture_module:
                del self.jpeg_capture_module
            self.jpeg_capture_module = ScreenCapture()

            await self.jpeg_capture_loop.run_in_executor(
                None, self.jpeg_capture_module.start_capture, cs, cb
            )
            self.is_jpeg_capturing = True
            data_logger.info("X11 JPEG capture started with detailed settings.")
            return True
        except Exception as e:
            data_logger.error(f"Failed to start JPEG: {e}", exc_info=True)
            await self._send_error_to_client(f"Error starting JPEG: {str(e)[:50]}")
            self.is_jpeg_capturing = False
            if self.jpeg_capture_module:
                del self.jpeg_capture_module
                self.jpeg_capture_module = None
            return False

    async def _stop_jpeg_pipeline(self):
        if not self.is_jpeg_capturing or not self.jpeg_capture_module:
            return True
        self.is_jpeg_capturing = False
        data_logger.info("Stopping X11 JPEG capture...")
        try:
            if self.jpeg_capture_loop and self.jpeg_capture_module:
                await self.jpeg_capture_loop.run_in_executor(
                    None, self.jpeg_capture_module.stop_capture
                )
        finally:
            if self.jpeg_capture_module:
                del self.jpeg_capture_module
                self.jpeg_capture_module = None
        return True

    def update_last_sent_frame_id(self, frame_id: int):
        self._active_pipeline_last_sent_frame_id = frame_id
        now = time.monotonic()
        self._sent_frame_timestamps[frame_id] = now
        if len(self._sent_frame_timestamps) > SENT_FRAME_TIMESTAMP_HISTORY_SIZE:
            self._sent_frame_timestamps.popitem(last=False)
        if hasattr(self, "_sent_frames_log"):
            self._sent_frames_log.append((now, frame_id))

    async def _send_error_to_client(self, websocket_obj, error_message): # Added websocket_obj
        if websocket_obj: # Send error to the specific client this handler is managing
            try:
                await websocket_obj.send(f"ERROR {error_message}")
            except Exception:
                pass # Error sending error, not much to do

    def _parse_settings_payload(self, payload_str: str) -> dict:
        settings_data = json.loads(payload_str)
        parsed = {}

        def get_int(k, d):
            v = settings_data.get(k)
            return int(v) if v is not None else d

        def get_bool(k, d):
            v = settings_data.get(k)
            return str(v).lower() == "true" if v is not None else d

        def get_str(k, d):
            v = settings_data.get(k)
            return str(v) if v is not None else d

        parsed["videoBitRate"] = get_int(
            "webrtc_videoBitRate", self.app.video_bitrate * 1000
        )
        parsed["videoFramerate"] = get_int("webrtc_videoFramerate", self.app.framerate)
        parsed["videoCRF"] = get_int("webrtc_videoCRF", self.h264_crf)
        parsed["encoder"] = get_str("webrtc_encoder", self.app.encoder)
        parsed["resizeRemote"] = get_bool(
            "webrtc_resizeRemote",
            getattr(self.app, "client_preferred_resize_enabled", True),
        )
        parsed["isManualResolutionMode"] = get_bool(
            "webrtc_isManualResolutionMode",
            getattr(self.app, "client_is_manual_resolution_mode", False),
        )
        parsed["manualWidth"] = get_int(
            "webrtc_manualWidth",
            getattr(self.app, "client_manual_width", self.app.display_width),
        )
        parsed["manualHeight"] = get_int(
            "webrtc_manualHeight",
            getattr(self.app, "client_manual_height", self.app.display_height),
        )
        parsed["audioBitRate"] = get_int("webrtc_audioBitRate", self.app.audio_bitrate)
        parsed["videoBufferSize"] = get_int(
            "webrtc_videoBufferSize", getattr(self.app, "video_buffer_size", 0)
        )
        # New keys for initial client dimensions if in auto mode
        parsed["initialClientWidth"] = get_int(
            "webrtc_initialClientWidth", self.app.display_width
        )
        parsed["initialClientHeight"] = get_int(
            "webrtc_initialClientHeight", self.app.display_height
        )
        data_logger.debug(f"Parsed client settings: {parsed}")
        return parsed

    async def _apply_client_settings(self, websocket_obj, settings: dict, is_initial_settings: bool):
        data_logger.info(
            f"Applying client settings (initial={is_initial_settings}): {settings}"
        )

        # Store old values for comparison to see if restart is needed for non-initial changes
        old_encoder = self.app.encoder
        old_video_bitrate_kbps = self.app.video_bitrate
        old_framerate = self.app.framerate
        old_h264_crf = self.h264_crf
        old_audio_bitrate_bps = self.app.audio_bitrate
        old_display_width = self.app.display_width
        old_display_height = self.app.display_height

        # --- Apply Resolution Settings First ---
        # This determines the target self.app.display_width/height before xrandr or pipeline decisions.
        is_manual_res_mode_from_settings = settings.get(
            "isManualResolutionMode",
            getattr(self.app, "client_is_manual_resolution_mode", False),
        )

        target_w_for_app, target_h_for_app = old_display_width, old_display_height

        if is_manual_res_mode_from_settings:
            target_w_for_app = settings.get("manualWidth", old_display_width)
            target_h_for_app = settings.get("manualHeight", old_display_height)
            data_logger.info(
                f"Settings: Manual Resolution Mode. Target: {target_w_for_app}x{target_h_for_app}"
            )
        elif is_initial_settings:  # Auto mode, and it's the first settings message
            target_w_for_app = settings.get("initialClientWidth", old_display_width)
            target_h_for_app = settings.get("initialClientHeight", old_display_height)
            data_logger.info(
                f"Settings: Auto Resolution Mode (initial). Client size: {target_w_for_app}x{target_h_for_app}"
            )

        if target_w_for_app <= 0 or target_h_for_app <= 0:
            data_logger.warning(
                f"Received invalid target dimensions {target_w_for_app}x{target_h_for_app} from client settings. "
                f"Reverting to previous valid dimensions {old_display_width}x{old_display_height}."
            )
            target_w_for_app = old_display_width
            target_h_for_app = old_display_height
        
        if target_w_for_app % 2 != 0:
            data_logger.debug(f"Adjusting odd width {target_w_for_app} to {target_w_for_app - 1}")
            target_w_for_app -= 1
        if target_h_for_app % 2 != 0:
            data_logger.debug(f"Adjusting odd height {target_h_for_app} to {target_h_for_app - 1}")
            target_h_for_app -= 1
        
        if target_w_for_app <= 0 or target_h_for_app <= 0:
            data_logger.warning(
                f"Dimensions became invalid ({target_w_for_app}x{target_h_for_app}) after odd adjustment. "
                f"Reverting to previous valid dimensions {old_display_width}x{old_display_height}."
            )
            target_w_for_app = old_display_width
            target_h_for_app = old_display_height

        dimensions_changed_by_settings = (
            target_w_for_app != old_display_width
            or target_h_for_app != old_display_height
        )

        if dimensions_changed_by_settings:
            self.app.display_width = target_w_for_app
            self.app.display_height = target_h_for_app
            data_logger.info(
                f"App display dimensions updated to {self.app.display_width}x{self.app.display_height} based on settings."
            )

            effective_resize_enabled = ENABLE_RESIZE and settings.get(
                "resizeRemote",
                getattr(self.app, "client_preferred_resize_enabled", True),
            )
            if effective_resize_enabled:
                data_logger.info(
                    f"Effective resize enabled. Calling on_resize_handler for: {self.app.display_width}x{self.app.display_height}"
                )
                on_resize_handler(f"{self.app.display_width}x{self.app.display_height}", self.app, self)
                # on_resize_handler updates self.app.display_width/height based on xrandr's outcome
                # and also sets self.app.last_resize_success
            else:
                data_logger.info(
                    "Xrandr resize skipped as per effective_resize_enabled flag."
                )

        # Persist client preferences from settings
        setattr(
            self.app,
            "client_is_manual_resolution_mode",
            is_manual_res_mode_from_settings,
        )
        if (
            is_manual_res_mode_from_settings
        ):  # Persist manual dimensions if they came from settings
            setattr(
                self.app,
                "client_manual_width",
                settings.get(
                    "manualWidth",
                    getattr(self.app, "client_manual_width", old_display_width),
                ),
            )
            setattr(
                self.app,
                "client_manual_height",
                settings.get(
                    "manualHeight",
                    getattr(self.app, "client_manual_height", old_display_height),
                ),
            )
        setattr(
            self.app,
            "client_preferred_resize_enabled",
            settings.get(
                "resizeRemote",
                getattr(self.app, "client_preferred_resize_enabled", True),
            ),
        )

        requested_new_encoder = settings.get("encoder")
        encoder_actually_changed = (
            False  # Flag to track if encoder was changed by this function call
        )
        if requested_new_encoder and requested_new_encoder != old_encoder:
            if (
                self._frame_backpressure_task
                and not self._frame_backpressure_task.done()
            ):
                self._frame_backpressure_task.cancel()
                self._frame_backpressure_task = None
            self._active_pipeline_last_sent_frame_id = 0
            self._client_acknowledged_frame_id = -1
            if old_encoder not in ["jpeg", "x264enc-striped"] and hasattr(
                self.app, "gstreamer_ws_current_frame_id"
            ):
                self.app.gstreamer_ws_current_frame_id = 0
            data_logger.info(
                f"Frame IDs reset (encoder change): {old_encoder} -> {requested_new_encoder}"
            )
            encoder_actually_changed = True

        new_encoder_from_payload = settings.get("encoder")
        if new_encoder_from_payload:
            if (
                new_encoder_from_payload in ["jpeg", "x264enc-striped"]
                and not X11_CAPTURE_AVAILABLE
            ):
                await self._send_error_to_client(
                    websocket_obj,
                    f"{new_encoder_from_payload} (pixelflux) not available."
                )
            else:
                self.app.encoder = new_encoder_from_payload
        elif (
            encoder_actually_changed
        ):  # If reset due to requested_new_encoder but then no valid new_encoder_from_payload
            self.app.encoder = (
                old_encoder  # Revert to old encoder if the new one was invalid
            )
            encoder_actually_changed = (
                False  # No longer considered an encoder change for restart logic
            )

        if "videoBitRate" in settings:
            self.app.video_bitrate = settings["videoBitRate"] // 1000
            # Update global TARGET_VIDEO_BITRATE_KBPS and initial/current target for backpressure
            global TARGET_VIDEO_BITRATE_KBPS
            TARGET_VIDEO_BITRATE_KBPS = self.app.video_bitrate
            self._initial_target_bitrate_kbps = self.app.video_bitrate
            # For non-striped/jpeg, current target is directly set. For others, it's managed by backpressure.
            if is_initial_settings or self.app.encoder not in [
                "jpeg",
                "x264enc-striped",
            ]:
                self._current_target_bitrate_kbps = self.app.video_bitrate

        if "videoFramerate" in settings:
            self.app.framerate = settings["videoFramerate"]
            global TARGET_FRAMERATE
            TARGET_FRAMERATE = self.app.framerate

        if "videoCRF" in settings and self.app.encoder == "x264enc-striped":
            self.h264_crf = settings["videoCRF"]
            self._initial_x264_crf = self.h264_crf

        if "audioBitRate" in settings:
            self.app.audio_bitrate = settings["audioBitRate"]
        if "videoBufferSize" in settings:
            setattr(self.app, "video_buffer_size", settings["videoBufferSize"])

        if not is_initial_settings:
            # For subsequent SETTINGS messages, determine if a restart is needed
            # Resolution might have been updated by on_resize_handler if dimensions_changed_by_settings was true
            resolution_actually_changed_on_server = (
                self.app.display_width != old_display_width
                or self.app.display_height != old_display_height
            )

            # Check if other parameters changed
            bitrate_param_changed = self.app.video_bitrate != old_video_bitrate_kbps
            framerate_param_changed = self.app.framerate != old_framerate
            crf_param_changed = (
                self.app.encoder == "x264enc-striped" and self.h264_crf != old_h264_crf
            )
            audio_bitrate_param_changed = (
                self.app.audio_bitrate != old_audio_bitrate_bps
            )

            restart_video_pipeline = (
                encoder_actually_changed
                or resolution_actually_changed_on_server
                or bitrate_param_changed
                or framerate_param_changed
                or crf_param_changed
            )
            restart_audio_pipeline = audio_bitrate_param_changed

            video_pipeline_was_active = (
                self.is_jpeg_capturing
                or self.is_x264_striped_capturing
                or (hasattr(self.app, "pipeline_running") and self.app.pipeline_running)
            )
            audio_pipeline_was_active = getattr(
                self.app, "audio_pipeline_running_ws_flag", False
            )

            if restart_video_pipeline and video_pipeline_was_active:
                data_logger.info(
                    "Restarting video pipeline due to client settings update."
                )
                # Stop the pipeline based on the *old* encoder config
                if old_encoder == "jpeg":
                    await self._stop_jpeg_pipeline()
                elif old_encoder == "x264enc-striped":
                    await self._stop_x264_striped_pipeline()
                elif hasattr(self.app, "stop_websocket_video_pipeline"):
                    await self.app.stop_websocket_video_pipeline()

                # If encoder didn't change but other params did, notify client about reset
                if self.app.encoder == old_encoder and not encoder_actually_changed:
                    await self._reset_frame_ids_and_notify(
                        "client_settings_param_change_same_encoder"
                    )

                if self.app.encoder == "jpeg":
                    await self._start_jpeg_pipeline()
                elif self.app.encoder == "x264enc-striped":
                    await self._start_x264_striped_pipeline()
                elif hasattr(self.app, "start_websocket_video_pipeline"):
                    await self.app.start_websocket_video_pipeline()

            if restart_audio_pipeline and audio_pipeline_was_active:
                data_logger.info(
                    "Restarting audio pipeline due to client settings update."
                )
                if hasattr(self.app, "stop_websocket_audio_pipeline"):
                    await self.app.stop_websocket_audio_pipeline()
                if hasattr(self.app, "start_websocket_audio_pipeline"):
                    await self.app.start_websocket_audio_pipeline()

        # If encoder changed (either initially or subsequently)
        if encoder_actually_changed:  # This uses the flag set earlier
            if (
                not self._frame_backpressure_task
                or self._frame_backpressure_task.done()
            ):
                data_logger.info(
                    f"Starting/restarting frame-based backpressure task for new encoder {self.app.encoder}."
                )
                self._frame_backpressure_task = asyncio.create_task(
                    self._run_frame_backpressure_logic()
                )

    async def ws_handler(self, websocket):
        global TARGET_FRAMERATE, TARGET_VIDEO_BITRATE_KBPS
        raddr = websocket.remote_address
        data_logger.info(f"Data WebSocket connected from {raddr}")
        self.clients.add(websocket)
        self.data_ws = websocket # self.data_ws is specific to this handler instance/connection
        self.jpeg_capture_loop = self.jpeg_capture_loop or asyncio.get_running_loop()
        self.client_settings_received = asyncio.Event()
        initial_settings_processed = False
        self._sent_frames_log = deque(
            maxlen=int(TARGET_FRAMERATE * SENT_FRAMES_LOG_HISTORY_SECONDS)
        )
        self._sent_frame_timestamps.clear()
        self._rtt_samples.clear()
        self._smoothed_rtt_ms = 0.0

        try:
            await websocket.send(f"MODE {self.mode}")
            await self.broadcast_stream_resolution()
        except websockets.exceptions.ConnectionClosed:
            self.clients.discard(websocket) # Ensure removal on early exit
            if self.data_ws is websocket:
                self.data_ws = None
            return

        available_encoders = []
        if X11_CAPTURE_AVAILABLE:
            available_encoders.append("x264enc-striped")
            available_encoders.append("jpeg")
        if GSTREAMER_AVAILABLE:
            gst_encoders_to_try = ["x264enc", "nvh264enc", "vah264enc", "openh264enc"]
            for enc_name in gst_encoders_to_try:
                if Gst.ElementFactory.find(enc_name):
                    available_encoders.append(enc_name)

        server_settings_payload = {
            "type": "server_settings",
            "encoders": available_encoders,
        }
        try:
            await websocket.send(json.dumps(server_settings_payload))
        except websockets.exceptions.ConnectionClosed:
            self.clients.discard(websocket) # Ensure removal on early exit
            if self.data_ws is websocket:
                self.data_ws = None
            return

        self._initial_target_bitrate_kbps = self.app.video_bitrate
        self._current_target_bitrate_kbps = self._initial_target_bitrate_kbps
        self._min_bitrate_kbps = max(
            MIN_VIDEO_BITRATE_KBPS_BACKPRESSURE, MIN_VIDEO_BITRATE_KBPS
        )
        self._latest_client_render_fps = 0.0
        self._last_adjustment_time = self._last_time_client_ok = time.monotonic()
        if self._frame_backpressure_task and not self._frame_backpressure_task.done():
            self._frame_backpressure_task.cancel()
        self._frame_backpressure_task = None
        self._active_pipeline_last_sent_frame_id = 0
        self._client_acknowledged_frame_id = -1
        self._last_client_acknowledged_frame_id_update_time = time.monotonic()
        self._previous_ack_id_for_stall_check = -1
        self._previous_sent_id_for_stall_check = -1
        self._last_client_stable_report_time = time.monotonic()
        self._initial_x264_crf = self.cli_args.h264_crf
        self.h264_crf = self._initial_x264_crf

        active_uploads_by_path_conn = {}
        active_upload_target_path_conn = None
        upload_dir_valid = upload_dir_path is not None

        mic_setup_done = False
        pa_module_index = None  # Stores the index of the loaded module-virtual-source
        pa_stream = None  # For pasimple playback
        pulse = None  # pulsectl.Pulse client instance

        # Define virtual source details
        virtual_source_name = "SelkiesVirtualMic"
        master_monitor = (
            "output.monitor"
        )

        if not self.input_handler:
            logger.error(f"Data WS handler for {raddr}: Critical - self.input_handler (global) is not set. Input processing will fail.")

        self._shared_stats_ws = {}
        gpu_id_for_stats = getattr(self.app, "gpu_id", GPU_ID_DEFAULT)
        self._system_monitor_task_ws = asyncio.create_task(
            _collect_system_stats_ws(self._shared_stats_ws)
        )
        if GPUtil.getGPUs():
            self._gpu_monitor_task_ws = asyncio.create_task(
                _collect_gpu_stats_ws(self._shared_stats_ws, gpu_id=gpu_id_for_stats)
            )
        self._stats_sender_task_ws = asyncio.create_task(
            _send_stats_periodically_ws(websocket, self._shared_stats_ws) # Stats are per-client
        )

        try:
            if PULSEAUDIO_AVAILABLE:
                try:
                    data_logger.info("Attempting to establish PulseAudio connection...")
                    pulse = pulsectl.Pulse("selkies-mic-handler")
                    data_logger.info("PulseAudio connection established.")
                except Exception as e_pa_conn:
                    data_logger.error(
                        f"Initial PulseAudio connection failed: {e_pa_conn}",
                        exc_info=True,
                    )
                    pulse = None  # Ensure pulse is None if connection fails

            async for message in websocket:
                if isinstance(message, bytes):
                    msg_type, payload = message[0], message[1:]
                    if msg_type == 0x01:  # File data
                        if (
                            active_upload_target_path_conn
                            and active_upload_target_path_conn
                            in active_uploads_by_path_conn
                        ):
                            try:
                                active_uploads_by_path_conn[
                                    active_upload_target_path_conn
                                ].write(payload)
                            except Exception as e_write:
                                data_logger.error(
                                    f"File write error for {active_upload_target_path_conn}: {e_write}"
                                )
                                try:
                                    active_uploads_by_path_conn[
                                        active_upload_target_path_conn
                                    ].close()
                                    os.remove(active_upload_target_path_conn)
                                except Exception:
                                    pass
                                del active_uploads_by_path_conn[
                                    active_upload_target_path_conn
                                ]
                                active_upload_target_path_conn = None
                    elif msg_type == 0x02:  # Mic data
                        if not PULSEAUDIO_AVAILABLE:
                            if len(payload) > 0:
                                data_logger.warning(
                                    "PulseAudio library not available. Skipping microphone data."
                                )
                            continue
                        if pulse is None:  # Check if PulseAudio client object exists
                            if len(payload) > 0:
                                data_logger.warning(
                                    "PulseAudio client not connected. Skipping microphone data."
                                )
                            continue

                        if not mic_setup_done:
                            data_logger.info(
                                "Performing PulseAudio virtual microphone setup check..."
                            )
                            try:
                                existing_source_info = None
                                source_list = pulse.source_list()
                                for source_obj in source_list:
                                    if source_obj.name == virtual_source_name:
                                        existing_source_info = source_obj
                                        break

                                if existing_source_info:
                                    data_logger.info(
                                        f"Virtual source '{virtual_source_name}' (Index: {existing_source_info.index}) already exists."
                                    )
                                    actual_master = existing_source_info.proplist.get(
                                        "device.master_device"
                                    )
                                    if actual_master == master_monitor:
                                        data_logger.info(
                                            f"Existing source correctly linked to '{master_monitor}'."
                                        )
                                    else:
                                        data_logger.warning(
                                            f"Existing source '{virtual_source_name}' linked to '{actual_master}' not '{master_monitor}'. Manual fix may be needed."
                                        )
                                    pa_module_index = (
                                        existing_source_info.owner_module
                                    )  # Get module index if it exists
                                    mic_setup_done = True
                                else:
                                    data_logger.info(
                                        f"Virtual source '{virtual_source_name}' not found. Attempting to load module..."
                                    )
                                    load_args = f"source_name={virtual_source_name} master={master_monitor}"
                                    pa_module_index = pulse.module_load(
                                        "module-virtual-source", load_args
                                    )
                                    data_logger.info(
                                        f"Loaded module-virtual-source with index {pa_module_index} for '{virtual_source_name}'."
                                    )

                                    # Verify creation
                                    new_source_info = None
                                    source_list_after_load = pulse.source_list()
                                    for source_obj_after in source_list_after_load:
                                        if source_obj_after.name == virtual_source_name:
                                            new_source_info = source_obj_after
                                            break
                                    if new_source_info:
                                        data_logger.info(
                                            f"Successfully verified creation of source '{virtual_source_name}' (Index: {new_source_info.index})."
                                        )
                                        mic_setup_done = True
                                    else:
                                        data_logger.error(
                                            f"Loaded module {pa_module_index} but failed to find source '{virtual_source_name}'."
                                        )
                                        if (
                                            pa_module_index is not None
                                        ):  # Check if it's not None before trying to unload
                                            try:
                                                pulse.module_unload(pa_module_index)
                                            except Exception as unload_err:
                                                data_logger.error(
                                                    f"Failed to unload module {pa_module_index}: {unload_err}"
                                                )
                                            pa_module_index = None  # Reset on failure to unload or if it was problematic

                                if mic_setup_done:
                                    # Set as default source
                                    source_to_set_default = None
                                    current_source_list = (
                                        pulse.source_list()
                                    )  # Re-fetch list
                                    for source_obj_default in current_source_list:
                                        if (
                                            source_obj_default.name
                                            == virtual_source_name
                                        ):
                                            source_to_set_default = source_obj_default
                                            break

                                    if source_to_set_default:
                                        if (
                                            pulse.server_info().default_source_name
                                            != source_to_set_default.name
                                        ):
                                            pulse.default_set(source_to_set_default)
                                            data_logger.info(
                                                f"Set default PulseAudio source to '{virtual_source_name}'."
                                            )
                                        else:
                                            data_logger.info(
                                                f"Default PulseAudio source is already '{virtual_source_name}'."
                                            )
                                    else:
                                        data_logger.error(
                                            f"Could not find source '{virtual_source_name}' to set as default after setup."
                                        )

                            except Exception as e_pa_setup:
                                data_logger.error(
                                    f"PulseAudio mic setup error: {e_pa_setup}",
                                    exc_info=True,
                                )
                                # No need to close pulse here, as it's managed by the outer try/finally
                                # Reset mic_setup_done to false on any error during setup
                                mic_setup_done = False
                                # If pa_module_index was set from a failed load, try to unload it.
                                if pa_module_index is not None:
                                    try:
                                        data_logger.info(
                                            f"Attempting to unload module {pa_module_index} due to setup error."
                                        )
                                        pulse.module_unload(pa_module_index)
                                    except Exception as e_unload_err:
                                        data_logger.error(
                                            f"Error unloading module {pa_module_index} after setup failure: {e_unload_err}"
                                        )
                                    pa_module_index = None  # Reset after attempt
                                continue  # Skip processing this mic packet if setup failed

                        if not mic_setup_done or not payload:
                            if not mic_setup_done and len(payload) > 0:
                                data_logger.warning(
                                    "Mic setup not complete, skipping mic data."
                                )
                            continue

                        try:
                            if pa_stream is None:
                                data_logger.info(
                                    f"Opening new pasimple playback stream to 'input' at 24000 Hz (s16le, mono)."
                                )
                                pa_stream = pasimple.PaSimple(
                                    pasimple.PA_STREAM_PLAYBACK,
                                    pasimple.PA_SAMPLE_S16LE,
                                    1,
                                    24000,
                                    "SelkiesClientMic",
                                    "MicStream",
                                    device_name="input",  # Play to system's default input (which should be our virtual mic)
                                )
                            if pa_stream:
                                pa_stream.write(payload)
                        except Exception as e_pa_write:
                            data_logger.error(
                                f"PulseAudio stream write error: {e_pa_write}",
                                exc_info=False,
                            )
                            if pa_stream:
                                try:
                                    pa_stream.close()
                                except:
                                    pass
                            pa_stream = None  # Force re-open on next packet

                elif isinstance(message, str):
                    if message.startswith("FILE_UPLOAD_START:"):
                        if not upload_dir_valid:
                            data_logger.error("Upload dir invalid, skipping upload.")
                            continue
                        try:
                            _, rel_path, size_str = message.split(":", 2)
                            file_size = int(size_str)
                            clean_basename = re.sub(
                                r"[^\w.\- ]", "_", os.path.basename(rel_path)
                            ).strip()
                            if not clean_basename:
                                clean_basename = f"uploaded_file_{int(time.time())}"
                            final_server_path = os.path.join(
                                upload_dir_path, clean_basename
                            )

                            if (
                                active_upload_target_path_conn
                                and active_upload_target_path_conn
                                in active_uploads_by_path_conn
                            ):
                                active_uploads_by_path_conn[
                                    active_upload_target_path_conn
                                ].close()
                                del active_uploads_by_path_conn[
                                    active_upload_target_path_conn
                                ]

                            active_uploads_by_path_conn[final_server_path] = open(
                                final_server_path, "wb"
                            )
                            active_upload_target_path_conn = final_server_path
                            data_logger.info(
                                f"Upload started: {final_server_path} (size: {file_size})"
                            )
                        except ValueError:
                            data_logger.error(
                                f"Invalid FILE_UPLOAD_START format: {message}"
                            )
                        except Exception as e_fup_start:
                            data_logger.error(
                                f"FILE_UPLOAD_START error: {e_fup_start}", exc_info=True
                            )

                    elif message.startswith("SETTINGS,"):
                        try:
                            _, payload_str = message.split(",", 1)
                            parsed_settings = self._parse_settings_payload(payload_str)
                            await self._apply_client_settings(
                                websocket, # Pass the current connection's websocket
                                parsed_settings,
                                not initial_settings_processed
                            )
                            if not initial_settings_processed:
                                self.client_settings_received.set()
                                initial_settings_processed = True
                                data_logger.info("Initial client settings processed.")
                                if (
                                    not self._frame_backpressure_task
                                    or self._frame_backpressure_task.done()
                                ):
                                    self._frame_backpressure_task = asyncio.create_task(
                                        self._run_frame_backpressure_logic()
                                    )
                                current_encoder = getattr(self.app, "encoder", None)
                                if current_encoder == "jpeg":
                                    await self._start_jpeg_pipeline()
                                elif current_encoder == "x264enc-striped":
                                    await self._start_x264_striped_pipeline()
                                elif GSTREAMER_AVAILABLE and hasattr(
                                    self.app, "start_websocket_video_pipeline"
                                ):
                                    await self.app.start_websocket_video_pipeline()
                                if GSTREAMER_AVAILABLE and hasattr(self.app, "start_websocket_audio_pipeline"):
                                    if not getattr(self.app, "audio_pipeline_running_ws_flag", False):
                                        await self.app.start_websocket_audio_pipeline()
                                else:
                                    data_logger.warning("Initial setup: GStreamer audio pipeline (server-to-client) cannot be started (not available or no start method).")

                        except json.JSONDecodeError:
                            data_logger.error(f"SETTINGS JSON decode error: {message}")
                        except Exception as e_set:
                            data_logger.error(
                                f"Error processing SETTINGS: {e_set}", exc_info=True
                            )

                    elif message.startswith("CLIENT_FRAME_ACK"):
                        try:
                            acked_frame_id = int(message.split(" ", 1)[1])
                            self._client_acknowledged_frame_id = acked_frame_id
                            self._last_client_acknowledged_frame_id_update_time = (
                                time.monotonic()
                            )
                            if acked_frame_id in self._sent_frame_timestamps:
                                send_time = self._sent_frame_timestamps.pop(
                                    acked_frame_id
                                )
                                rtt_sample_ms = (time.monotonic() - send_time) * 1000.0
                                if rtt_sample_ms >= 0:
                                    self._rtt_samples.append(rtt_sample_ms)
                                if self._rtt_samples:
                                    self._smoothed_rtt_ms = sum(
                                        self._rtt_samples
                                    ) / len(self._rtt_samples)
                        except (IndexError, ValueError):
                            data_logger.warning(
                                f"Malformed CLIENT_FRAME_ACK: {message}"
                            )

                    elif message.startswith("FILE_UPLOAD_END:"):
                        if (
                            active_upload_target_path_conn
                            and active_upload_target_path_conn
                            in active_uploads_by_path_conn
                        ):
                            active_uploads_by_path_conn[
                                active_upload_target_path_conn
                            ].close()
                            data_logger.info(
                                f"Upload finished: {active_upload_target_path_conn}"
                            )
                            del active_uploads_by_path_conn[
                                active_upload_target_path_conn
                            ]
                        active_upload_target_path_conn = None

                    elif message.startswith("FILE_UPLOAD_ERROR:"):
                        data_logger.error(f"Client reported upload error: {message}")
                        if (
                            active_upload_target_path_conn
                            and active_upload_target_path_conn
                            in active_uploads_by_path_conn
                        ):
                            active_uploads_by_path_conn[
                                active_upload_target_path_conn
                            ].close()
                            try:
                                os.remove(active_upload_target_path_conn)
                            except OSError:
                                pass
                            del active_uploads_by_path_conn[
                                active_upload_target_path_conn
                            ]
                        active_upload_target_path_conn = None

                    elif message == "START_VIDEO":
                        # Pulled for shared mode and likely too protective
                        #await self.client_settings_received.wait()
                        current_encoder = getattr(self.app, "encoder", None)
                        data_logger.info(
                            f"Received START_VIDEO for encoder: {current_encoder}"
                        )
                        if current_encoder == "jpeg":
                            await self._start_jpeg_pipeline()
                        elif current_encoder == "x264enc-striped":
                            await self._start_x264_striped_pipeline()
                        elif GSTREAMER_AVAILABLE and hasattr(
                            self.app, "start_websocket_video_pipeline"
                        ):
                            await self.app.start_websocket_video_pipeline()

                    elif message == "STOP_VIDEO":
                        data_logger.info("Received STOP_VIDEO")
                        if self.is_jpeg_capturing:
                            await self._stop_jpeg_pipeline()
                        elif self.is_x264_striped_capturing:
                            await self._stop_x264_striped_pipeline()
                        elif (
                            GSTREAMER_AVAILABLE
                            and hasattr(self.app, "pipeline_running")
                            and self.app.pipeline_running
                        ):
                            if hasattr(self.app, "stop_websocket_video_pipeline"):
                                await self.app.stop_websocket_video_pipeline()

                    elif message == "START_AUDIO": # Client requests server-to-client audio start
                        await self.client_settings_received.wait()
                        data_logger.info("Received START_AUDIO command from client for server-to-client audio.")
                        if GSTREAMER_AVAILABLE and hasattr(self.app, "start_websocket_audio_pipeline"):
                            if not getattr(self.app, "audio_pipeline_running_ws_flag", False):
                                data_logger.info("START_AUDIO: Ensuring GStreamer server-to-client audio pipeline is active.")
                                await self.app.start_websocket_audio_pipeline()
                            else:
                                data_logger.info("START_AUDIO: Server-to-client audio pipeline already reported as active.")
                        else:
                            data_logger.warning("START_AUDIO: Cannot start server-to-client audio (GStreamer not available or no start method).")
                    elif message == "STOP_AUDIO":
                        data_logger.info("Received STOP_AUDIO")
                        if GSTREAMER_AVAILABLE and hasattr(
                            self.app, "stop_websocket_audio_pipeline"
                        ):
                            if getattr(
                                self.app, "audio_pipeline_running_ws_flag", False
                            ):
                                await self.app.stop_websocket_audio_pipeline()

                    elif message.startswith("r,"):
                        raddr = websocket.remote_address # Get raddr for logging if not already available in this scope
                        data_logger.info(f"SERVER: Raw resize message '{message}' received from {raddr}")

                        target_res_str = message[2:]
                        data_logger.info(f"Received resize request: {target_res_str} from {raddr}")

                        video_was_running = False
                        current_encoder_on_resize = getattr(self.app, "encoder", None)
                        data_logger.info(f"Resize handler: Current encoder is {current_encoder_on_resize}. Video running states: JPEG={self.is_jpeg_capturing}, X264Striped={self.is_x264_striped_capturing}, GSTreamer={getattr(self.app, 'pipeline_running', False)}")

                        if self.is_jpeg_capturing:
                            data_logger.info("Resize handler: Stopping JPEG pipeline.")
                            await self._stop_jpeg_pipeline()
                            video_was_running = True
                        elif self.is_x264_striped_capturing:
                            data_logger.info("Resize handler: Stopping X264-striped pipeline.")
                            await self._stop_x264_striped_pipeline()
                            video_was_running = True
                        elif GSTREAMER_AVAILABLE and getattr(
                            self.app, "pipeline_running", False
                        ):
                            data_logger.info("Resize handler: Stopping GStreamer video pipeline.")
                            await self.app.stop_websocket_video_pipeline()
                            video_was_running = True

                        data_logger.info(f"Resize handler: Calling on_resize_handler with '{target_res_str}' for {raddr}")
                        on_resize_handler(target_res_str, self.app, self)
                        data_logger.info(f"Resize handler: on_resize_handler call completed for {raddr}. Last resize success: {getattr(self.app, 'last_resize_success', 'Unknown')}")


                        if getattr(self.app, 'last_resize_success', False) and video_was_running:
                            data_logger.info(
                                f"Resize handler: Restarting video ({current_encoder_on_resize}) after successful resize to {self.app.display_width}x{self.app.display_height} for {raddr}"
                            )
                            # Ensure frame IDs are reset since resolution and likely keyframe changed
                            await self._reset_frame_ids_and_notify("resize_event")

                            if current_encoder_on_resize == "jpeg":
                                await self._start_jpeg_pipeline()
                            elif current_encoder_on_resize == "x264enc-striped":
                                await self._start_x264_striped_pipeline()
                            elif GSTREAMER_AVAILABLE and hasattr(
                                self.app, "start_websocket_video_pipeline"
                            ):
                                await self.app.start_websocket_video_pipeline()
                        elif not getattr(self.app, 'last_resize_success', False):
                            data_logger.error(f"Resize handler: Resize failed for {target_res_str}, {raddr}. Video not restarted if it was running.")
                        elif not video_was_running:
                            data_logger.info(f"Resize handler: Video was not running for {raddr}, no restart needed after resize.")

                    elif message.startswith("SET_ENCODER,"):
                        await self.client_settings_received.wait()
                        new_encoder_cmd = message.split(",")[1].strip().lower()
                        data_logger.info(f"Received SET_ENCODER: {new_encoder_cmd}")
                        if new_encoder_cmd != self.app.encoder:
                            if self.is_jpeg_capturing:
                                await self._stop_jpeg_pipeline()
                            elif self.is_x264_striped_capturing:
                                await self._stop_x264_striped_pipeline()
                            elif GSTREAMER_AVAILABLE and getattr(
                                self.app, "pipeline_running", False
                            ):
                                await self.app.stop_websocket_video_pipeline()

                            self.app.encoder = new_encoder_cmd
                            await self._reset_frame_ids_and_notify(
                                "encoder_change_command"
                            )

                            if new_encoder_cmd == "jpeg":
                                await self._start_jpeg_pipeline()
                            elif new_encoder_cmd == "x264enc-striped":
                                await self._start_x264_striped_pipeline()
                            elif GSTREAMER_AVAILABLE and hasattr(
                                self.app, "start_websocket_video_pipeline"
                            ):
                                await self.app.start_websocket_video_pipeline()
                            else:
                                data_logger.warning(
                                    f"No start method for new encoder {new_encoder_cmd}"
                                )

                            if (
                                self._frame_backpressure_task
                                and not self._frame_backpressure_task.done()
                            ):
                                self._frame_backpressure_task.cancel()
                            self._frame_backpressure_task = asyncio.create_task(
                                self._run_frame_backpressure_logic()
                            )

                    elif message.startswith("SET_FRAMERATE,"):
                        await self.client_settings_received.wait()
                        new_fps_cmd = int(message.split(",")[1])
                        data_logger.info(f"Received SET_FRAMERATE: {new_fps_cmd}")
                        self.app.set_framerate(new_fps_cmd)
                        current_enc = getattr(self.app, "encoder", None)
                        if current_enc == "jpeg" and self.is_jpeg_capturing:
                            await self._stop_jpeg_pipeline()
                            await self._start_jpeg_pipeline()
                        elif (
                            current_enc == "x264enc-striped"
                            and self.is_x264_striped_capturing
                        ):
                            await self._stop_x264_striped_pipeline()
                            await self._start_x264_striped_pipeline()
                        elif (
                            GSTREAMER_AVAILABLE
                            and current_enc not in ["jpeg", "x264enc-striped"]
                            and getattr(self.app, "pipeline_running", False)
                        ):
                            data_logger.info(
                                f"Restarting GStreamer pipeline for new framerate {new_fps_cmd}"
                            )
                            await self.app.stop_websocket_video_pipeline()
                            await self.app.start_websocket_video_pipeline()

                    elif message.startswith("SET_VIDEO_BITRATE,"):
                        await self.client_settings_received.wait()
                        new_bitrate_cmd = int(message.split(",")[1])
                        data_logger.info(
                            f"Received SET_VIDEO_BITRATE: {new_bitrate_cmd} kbps"
                        )
                        self.app.set_video_bitrate(new_bitrate_cmd)
                        current_enc = getattr(self.app, "encoder", None)
                        if (
                            GSTREAMER_AVAILABLE
                            and current_enc not in ["jpeg", "x264enc-striped"]
                            and getattr(self.app, "pipeline_running", False)
                        ):
                            data_logger.info(
                                f"Restarting GStreamer pipeline for new bitrate {new_bitrate_cmd} kbps"
                            )
                            await self.app.stop_websocket_video_pipeline()
                            await self.app.start_websocket_video_pipeline()

                    elif message.startswith("SET_CRF,"):
                        await self.client_settings_received.wait()
                        new_crf_cmd = int(message.split(",")[1])
                        data_logger.info(f"Received SET_CRF: {new_crf_cmd}")
                        if self.app.encoder == "x264enc-striped":
                            self.h264_crf = new_crf_cmd
                            if self.is_x264_striped_capturing:
                                await self._stop_x264_striped_pipeline()
                                await self._start_x264_striped_pipeline()
                        else:
                            data_logger.warning(
                                f"SET_CRF received but current encoder '{self.app.encoder}' does not use CRF directly via this command."
                            )
                    elif message.startswith("cfps,"):
                        try:
                            self._latest_client_render_fps = float(
                                message.split(",", 1)[1]
                            )
                        except (IndexError, ValueError):
                            data_logger.warning(f"Malformed cfps message: {message}")
                    else:
                        if self.input_handler and hasattr(
                            self.input_handler, "on_message"
                        ):
                            await self.input_handler.on_message(message)

        except websockets.exceptions.ConnectionClosedOK:
            data_logger.info(f"Data WS disconnected gracefully from {raddr}")
        except websockets.exceptions.ConnectionClosedError as e:
            data_logger.warning(f"Data WS closed with error from {raddr}: {e}")
        except Exception as e_main_loop:
            data_logger.error(
                f"Error in Data WS handler for {raddr}: {e_main_loop}", exc_info=True
            )
        finally:
            data_logger.info(f"Cleaning up Data WS handler for {raddr}...")

            # 1. Remove current client from the central set
            self.clients.discard(websocket)
            if self.data_ws is websocket:
                self.data_ws = None

            # 2. Cancel tasks created specifically for THIS connection's ws_handler instance
            if '_stats_sender_task_ws' in locals():
                _task_to_cancel = locals()['_stats_sender_task_ws']
                if _task_to_cancel and not _task_to_cancel.done():
                    _task_to_cancel.cancel()
                    try: await _task_to_cancel
                    except asyncio.CancelledError: pass
            
            if '_system_monitor_task_ws' in locals():
                _task_to_cancel = locals()['_system_monitor_task_ws']
                if _task_to_cancel and not _task_to_cancel.done():
                    _task_to_cancel.cancel()
                    try: await _task_to_cancel
                    except asyncio.CancelledError: pass

            if '_gpu_monitor_task_ws' in locals():
                _task_to_cancel = locals()['_gpu_monitor_task_ws']
                if _task_to_cancel and not _task_to_cancel.done():
                    _task_to_cancel.cancel()
                    try: await _task_to_cancel
                    except asyncio.CancelledError: pass
            
            # 3. Clean up resources specific to THIS connection's ws_handler instance
            if 'pa_stream' in locals() and locals()['pa_stream']:
                try:
                    locals()['pa_stream'].close()
                    data_logger.debug(f"Closed PulseAudio stream for {raddr}.")
                except Exception as e_pa_close:
                    data_logger.error(f"Error closing PulseAudio stream for {raddr}: {e_pa_close}")
            
            if 'pulse' in locals() and locals()['pulse']:
                _local_pulse = locals()['pulse']
                if 'pa_module_index' in locals() and locals()['pa_module_index'] is not None:
                    _local_pa_module_index = locals()['pa_module_index']
                    try:
                        data_logger.info(f"Unloading PulseAudio module {_local_pa_module_index} for virtual mic (client: {raddr}).")
                        _local_pulse.module_unload(_local_pa_module_index)
                    except Exception as e_unload_final:
                        data_logger.error(f"Error unloading PulseAudio module {_local_pa_module_index} for {raddr}: {e_unload_final}")
                try:
                    _local_pulse.close()
                    data_logger.debug(f"Closed PulseAudio connection for {raddr}.")
                except Exception as e_pulse_close:
                    data_logger.error(f"Error closing PulseAudio connection for {raddr}: {e_pulse_close}")
            
            if ('active_upload_target_path_conn' in locals() and locals()['active_upload_target_path_conn'] and
                'active_uploads_by_path_conn' in locals() and 
                locals()['active_upload_target_path_conn'] in locals()['active_uploads_by_path_conn']):
                _local_active_path = locals()['active_upload_target_path_conn']
                _local_active_uploads = locals()['active_uploads_by_path_conn']
                try:
                    file_handle = _local_active_uploads.pop(_local_active_path, None)
                    if file_handle:
                        file_handle.close()
                    os.remove(_local_active_path) # os is imported globally
                    data_logger.info(f"Cleaned up incomplete file upload: {_local_active_path} for {raddr}")
                except OSError as e_os_remove:
                    data_logger.warning(f"Could not remove incomplete upload file {_local_active_path} for {raddr}: {e_os_remove}")
                except Exception as e_file_cleanup:
                    data_logger.error(f"Error cleaning up file upload {_local_active_path} for {raddr}: {e_file_cleanup}")

            # 4. Decide whether to stop global pipelines based on OTHER clients
            stop_pipelines_flag = False
            if not self.clients: # No other clients were in the set to begin with
                data_logger.info(f"No other clients in set after {raddr} disconnected. Marking pipelines for stop.")
                stop_pipelines_flag = True
            else: # Other clients *appear* to remain in the set, check their responsiveness
                data_logger.info(f"Client from {raddr} disconnected. Checking responsiveness of remaining {len(self.clients)} client(s)...")
                active_clients_found_after_check = False
                clients_to_remove_as_stale = []
                
                current_remaining_clients = list(self.clients) # Snapshot for iteration

                for other_client_ws in current_remaining_clients:
                    try:
                        # Attempt to ping. If this fails, the client is considered unresponsive.
                        pong_waiter = await other_client_ws.ping()
                        await asyncio.wait_for(pong_waiter, timeout=3.0) # Short timeout for this check
                        data_logger.info(f"  Remaining client {other_client_ws.remote_address} is responsive.")
                        active_clients_found_after_check = True
                    except asyncio.TimeoutError:
                        data_logger.warning(f"  Remaining client {other_client_ws.remote_address} timed out on ping. Marking as stale.")
                        clients_to_remove_as_stale.append(other_client_ws)
                    except (websockets.exceptions.ConnectionClosed, websockets.exceptions.ConnectionClosedError, websockets.exceptions.ConnectionClosedOK) as e_conn_closed:
                        data_logger.warning(f"  Remaining client {other_client_ws.remote_address} connection definitively closed during ping: {type(e_conn_closed).__name__}. Marking as stale.")
                        clients_to_remove_as_stale.append(other_client_ws)
                    except Exception as e_ping: # Catch any other error during ping, e.g., OS errors if socket is truly gone
                        data_logger.error(f"  Error pinging remaining client {other_client_ws.remote_address}: {e_ping}. Marking as stale.")
                        clients_to_remove_as_stale.append(other_client_ws)
                
                # Remove all identified stale clients from the central set
                if clients_to_remove_as_stale:
                    for stale_ws in clients_to_remove_as_stale:
                        self.clients.discard(stale_ws)
                        # Attempt to close from server-side; websockets library handles if already closed.
                        try:
                            await stale_ws.close(code=1001, reason="Stale client detected on other client disconnect")
                        except (websockets.exceptions.ConnectionClosed, websockets.exceptions.ConnectionClosedError, websockets.exceptions.ConnectionClosedOK):
                            pass # Already closed or closing
                        except Exception as e_close_stale: 
                            data_logger.debug(f"Minor error closing stale client {stale_ws.remote_address}: {e_close_stale}") # Best effort

                # Now, re-evaluate if any truly active clients are left OR if self.clients is now empty
                if not self.clients: # All "other" clients were stale and removed
                    data_logger.info(f"All other clients were stale or disconnected. Marking pipelines for stop after {raddr} disconnect.")
                    stop_pipelines_flag = True
                elif not active_clients_found_after_check: # No responsive clients were found among the remaining
                    data_logger.info(f"No responsive clients remain after check for {raddr}'s disconnect. Marking pipelines for stop.")
                    stop_pipelines_flag = True
                else:
                    data_logger.info(f"Client from {raddr} disconnected. Responsive clients ({len(self.clients)}) remain. Global pipelines will NOT be stopped by this handler.")

            # 5. Stop global pipelines if the flag is set
            if stop_pipelines_flag:
                data_logger.info(f"Stopping global pipelines due to disconnect logic for {raddr}.")
                if self.is_jpeg_capturing: 
                    await self._stop_jpeg_pipeline()
                if self.is_x264_striped_capturing: 
                    await self._stop_x264_striped_pipeline()
                if GSTREAMER_AVAILABLE: # GSTREAMER_AVAILABLE is a global constant
                    if hasattr(self.app, "pipeline_running") and self.app.pipeline_running:
                        if hasattr(self.app, "stop_websocket_video_pipeline"): 
                            await self.app.stop_websocket_video_pipeline()
                    if hasattr(self.app, "audio_pipeline_running_ws_flag") and self.app.audio_pipeline_running_ws_flag:
                        if hasattr(self.app, "stop_websocket_audio_pipeline"): 
                            await self.app.stop_websocket_audio_pipeline()
            
            data_logger.info(f"Data WS handler for {raddr} finished all cleanup.")

    async def _reset_frame_ids_and_notify(
        self, pipeline_reset_reason="backpressure_adjustment"
    ):
        data_logger.info(f"Resetting frame IDs due to: {pipeline_reset_reason}")
        self._active_pipeline_last_sent_frame_id = 0
        self._client_acknowledged_frame_id = -1
        self._previous_ack_id_for_stall_check = -1
        self._previous_sent_id_for_stall_check = -1
        if self.app.encoder not in ["jpeg", "x264enc-striped"] and hasattr(
            self.app, "gstreamer_ws_current_frame_id"
        ):
            self.app.gstreamer_ws_current_frame_id = 0
        if self.clients: # Check if there are any clients to broadcast to
            websockets.broadcast(self.clients, "PIPELINE_RESETTING 0")


    async def _restart_active_video_pipeline_for_backpressure(self, reason: str):
        data_logger.info(
            f"Restarting video for backpressure: {reason}, Encoder: {self.app.encoder}"
        )
        current_encoder = self.app.encoder
        if current_encoder == "jpeg":
            if self.is_jpeg_capturing:
                await self._stop_jpeg_pipeline()
        elif current_encoder == "x264enc-striped":
            if self.is_x264_striped_capturing:
                await self._stop_x264_striped_pipeline()
        elif (
            GSTREAMER_AVAILABLE
            and hasattr(self.app, "stop_websocket_video_pipeline")
            and getattr(self.app, "pipeline_running", False)
        ):
            await self.app.stop_websocket_video_pipeline()

        await self._reset_frame_ids_and_notify(pipeline_reset_reason=reason)

        if current_encoder == "jpeg":
            await self._start_jpeg_pipeline()
        elif current_encoder == "x264enc-striped":
            await self._start_x264_striped_pipeline()
        elif GSTREAMER_AVAILABLE and hasattr(
            self.app, "start_websocket_video_pipeline"
        ):
            await self.app.start_websocket_video_pipeline()
        data_logger.info(
            f"Video pipeline restarted with new parameters for {current_encoder}."
        )

    async def _run_frame_backpressure_logic(self):
        return  # WIP

    async def run_server(self):
        self.stop_server = asyncio.Future()
        while not self.stop_server.done():
            _current_server_instance = None
            wait_closed_task = None
            try:
                async with websockets.asyncio.server.serve(
                    self.ws_handler,
                    "0.0.0.0",
                    self.port,
                    compression=None,
                    ping_interval=20,
                    ping_timeout=20,
                ) as server_obj:
                    _current_server_instance = server_obj
                    self.server = _current_server_instance
                    data_logger.info(
                        f"Data WebSocket Server listening on port {self.port}"
                    )
                    wait_closed_task = asyncio.create_task(
                        _current_server_instance.wait_closed()
                    )
                    done, pending = await asyncio.wait(
                        [self.stop_server, wait_closed_task],
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if self.stop_server in done:
                        if wait_closed_task in pending:
                            wait_closed_task.cancel()
                        break
                    data_logger.warning(
                        f"Data WS Server on port {self.port} stopped unexpectedly. Restarting."
                    )
            except OSError as e:
                data_logger.error(
                    f"OSError starting Data WS on port {self.port}: {e}. Retrying in 5s..."
                )
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                data_logger.info(
                    f"Data WS run_server task for port {self.port} cancelled."
                )
                break
            except Exception as e:
                data_logger.error(
                    f"Exception in Data WS run_server for port {self.port}: {e}. Retrying in 5s...",
                    exc_info=True,
                )
                await asyncio.sleep(5)
            finally:
                if self.server is _current_server_instance:
                    self.server = None
                if wait_closed_task and not wait_closed_task.done():
                    try:
                        await asyncio.wait_for(wait_closed_task, timeout=0.1)
                    except (asyncio.CancelledError, asyncio.TimeoutError):
                        pass
        data_logger.info(f"Data WS run_server loop for port {self.port} has finished.")

    async def stop(self):
        data_logger.info(f"Stopping Data WebSocket Server on port {self.port}...")
        if self.stop_server and not self.stop_server.done():
            self.stop_server.set_result(True)
        if self.server:
            self.server.close()
            try:
                await asyncio.wait_for(self.server.wait_closed(), timeout=2.0)
            except asyncio.TimeoutError:
                data_logger.warning(
                    f"Timeout closing Data WS listener on port {self.port}."
                )
            except Exception as e_close:
                data_logger.error(f"Error on server.wait_closed(): {e_close}")
        self.server = None
        if self.is_jpeg_capturing:
            await self._stop_jpeg_pipeline()
        if self.is_x264_striped_capturing:
            await self._stop_x264_striped_pipeline()
        data_logger.info(f"Data WS on port {self.port} stop procedure complete.")


async def _collect_system_stats_ws(shared_data, interval_seconds=1):
    data_logger.debug(
        f"System monitor loop (WS mode) started, interval: {interval_seconds}s"
    )
    try:
        while True:
            cpu = psutil.cpu_percent()
            mem = psutil.virtual_memory()
            shared_data["system"] = {
                "type": "system_stats",
                "timestamp": datetime.now().isoformat(),
                "cpu_percent": cpu,
                "mem_total": mem.total,
                "mem_used": mem.used,
            }
            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        data_logger.info("System monitor (WS) cancelled.")
    except Exception as e:
        data_logger.error(f"System monitor (WS) error: {e}", exc_info=True)


async def _collect_gpu_stats_ws(shared_data, gpu_id=0, interval_seconds=1):
    data_logger.debug(
        f"GPU monitor loop (WS mode) for GPU {gpu_id}, interval: {interval_seconds}s"
    )
    try:
        gpus = GPUtil.getGPUs()
        if not gpus:
            data_logger.warning("No GPUs detected for GPU monitor (WS).")
            return
        if not (0 <= gpu_id < len(gpus)):
            data_logger.error(f"Invalid GPU ID {gpu_id} for GPU monitor (WS).")
            return

        while True:
            try:
                gpus = GPUtil.getGPUs()
                if not gpus or gpu_id >= len(gpus):
                    data_logger.error(f"GPU {gpu_id} no longer available.")
                    break
                gpu = gpus[gpu_id]
                shared_data["gpu"] = {
                    "type": "gpu_stats",
                    "timestamp": datetime.now().isoformat(),
                    "gpu_id": gpu_id,
                    "load": gpu.load,
                    "memory_total": gpu.memoryTotal * 1024 * 1024,
                    "memory_used": gpu.memoryUsed * 1024 * 1024,
                }
            except Exception as e_gpu_stat:
                data_logger.error(
                    f"GPU monitor (WS): Error getting stats for ID {gpu_id}: {e_gpu_stat}"
                )
                await asyncio.sleep(interval_seconds * 2)
            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        data_logger.info("GPU monitor (WS) cancelled.")
    except Exception as e:
        data_logger.error(f"GPU monitor (WS) error: {e}", exc_info=True)


async def _send_stats_periodically_ws(websocket, shared_data, interval_seconds=5):
    try:
        while True:
            await asyncio.sleep(interval_seconds)
            system_stats = shared_data.pop("system", None)
            gpu_stats = shared_data.pop("gpu", None)
            try:
                if not websocket: # Check if websocket is still valid
                    data_logger.info("Stats sender: WS closed or invalid.")
                    break
                if system_stats:
                    await websocket.send(json.dumps(system_stats))
                if gpu_stats:
                    await websocket.send(json.dumps(gpu_stats))
            except websockets.exceptions.ConnectionClosed:
                data_logger.info("Stats sender: WS connection closed.")
                break
            except Exception as e_send:
                data_logger.error(f"Stats sender: Error sending: {e_send}")
    except asyncio.CancelledError:
        data_logger.info("Stats sender (WS) cancelled.")
    except Exception as e:
        data_logger.error(f"Stats sender (WS) error: {e}", exc_info=True)


def on_resize_handler(res_str, current_app_instance, data_server_instance=None):
    """
    Handles client resize request. Updates app state and calls xrandr.
    """
    logger_gst_app_resize.info(f"on_resize_handler attempting resize for: {res_str}")
    try:
        w_str, h_str = res_str.split("x")
        target_w, target_h = int(w_str), int(h_str)

        # Ensure dimensions are positive
        if target_w <= 0 or target_h <= 0:
            logger_gst_app_resize.error(
                f"Invalid target dimensions in resize request: {target_w}x{target_h}. Ignoring."
            )
            if current_app_instance:
                current_app_instance.last_resize_success = False
            return # Do not proceed with invalid dimensions

        # Ensure dimensions are even
        if target_w % 2 != 0:
            logger_gst_app_resize.debug(f"Adjusting odd width {target_w} to {target_w - 1}")
            target_w -= 1
        if target_h % 2 != 0:
            logger_gst_app_resize.debug(f"Adjusting odd height {target_h} to {target_h - 1}")
            target_h -= 1
        
        # Re-check positivity after odd adjustment
        if target_w <= 0 or target_h <= 0:
            logger_gst_app_resize.error(
                f"Dimensions became invalid ({target_w}x{target_h}) after odd adjustment. Ignoring."
            )
            if current_app_instance:
                current_app_instance.last_resize_success = False
            return # Do not proceed

        current_app_instance.display_width = target_w
        current_app_instance.display_height = target_h
        logger_gst_app_resize.info(
            f"App dimensions updated to {target_w}x{target_h} before xrandr call."
        )

        success = resize_display(f"{target_w}x{target_h}")

        if success:
            logger_gst_app_resize.info(
                f"resize_display('{target_w}x{target_h}') reported success."
            )
            current_app_instance.last_resize_success = True
            if data_server_instance:
                asyncio.create_task(data_server_instance.broadcast_stream_resolution())
        else:
            logger_gst_app_resize.error(
                f"resize_display('{target_w}x{target_h}') reported failure."
            )
            current_app_instance.last_resize_success = False

    except ValueError:
        logger_gst_app_resize.error(
            f"Invalid resolution format in resize request: {res_str}"
        )
        current_app_instance.last_resize_success = False
    except Exception as e:
        logger_gst_app_resize.error(
            f"Error during resize handling for '{res_str}': {e}", exc_info=True
        )
        if current_app_instance:
            current_app_instance.last_resize_success = False


def on_scaling_ratio_handler(scale_factor, current_app_instance):
    if not (0.75 <= scale_factor <= 2.5):
        logger.error(f"Scale ratio out of bounds: {scale_factor}")
        return
    dpi = int(96 * scale_factor)
    logger.info(f"Setting DPI to: {dpi}")
    if not set_dpi(dpi):
        logger.error(f"Failed to set DPI to {dpi}")
    cursor_s = int(CURSOR_SIZE * scale_factor)  # Use global CURSOR_SIZE
    logger.info(f"Setting cursor size to: {cursor_s}")
    if not set_cursor_size(cursor_s):
        logger.error(f"Failed to set cursor size to {cursor_s}")


async def main():
    if "DEV_MODE" in os.environ:
        try:
            dev_version_file = pathlib.Path(
                "../../addons/gst-web-core/selkies-version.txt"
            )
            if dev_version_file.parent.exists():
                dev_version_file.touch(exist_ok=True)
        except OSError:
            pass

    parser = argparse.ArgumentParser(description="Selkies GStreamer WebSocket Server")
    parser.add_argument(
        "--encoder",
        default=os.environ.get("SELKIES_ENCODER", "x264enc"),
        help="Video encoder (e.g., x264enc, nvh264enc, jpeg, x264enc-striped)",
    )
    parser.add_argument(
        "--framerate",
        default=os.environ.get("SELKIES_FRAMERATE", "60"),
        type=int,
        help="Target framerate",
    )
    parser.add_argument(
        "--video_bitrate",
        default=os.environ.get("SELKIES_VIDEO_BITRATE", "16000"),
        type=int,
        help="Target video bitrate in kbps",
    )
    parser.add_argument(
        "--h264_crf",
        default=os.environ.get("SELKIES_H264_CRF", "25"),
        type=int,
        help="H.264 CRF for x264enc-striped (0-51)",
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args, unknown = parser.parse_known_args()

    global TARGET_FRAMERATE, TARGET_VIDEO_BITRATE_KBPS
    TARGET_FRAMERATE = args.framerate
    TARGET_VIDEO_BITRATE_KBPS = args.video_bitrate
    initial_encoder = args.encoder.lower()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    else:
        logging.getLogger().setLevel(logging.INFO)
        logging.getLogger("websockets").setLevel(logging.WARNING)
    if not args.debug and PULSEAUDIO_AVAILABLE:
        logging.getLogger("pulsectl").setLevel(logging.WARNING)

    logger.info(f"Starting Selkies GStreamer (WebSocket Mode) with args: {args}")
    logger.info(
        f"Initial Encoder: {initial_encoder}, Framerate: {TARGET_FRAMERATE}, Bitrate: {TARGET_VIDEO_BITRATE_KBPS}kbps"
    )

    perform_initial_gstreamer_check(initial_encoder)

    event_loop = asyncio.get_running_loop()

    app = GSTStreamingApp(
        event_loop,
        framerate=TARGET_FRAMERATE,
        encoder=initial_encoder,
        video_bitrate=TARGET_VIDEO_BITRATE_KBPS,
        mode="websockets",
    )
    app.server_enable_resize = ENABLE_RESIZE
    app.last_resize_success = True
    logger.info(
        f"GSTStreamingApp initialized: encoder={app.encoder}, display={app.display_width}x{app.display_height}"
    )

    data_server = DataStreamingServer(
        port=DATA_WEBSOCKET_PORT,
        app=app,
        uinput_mouse_socket=UINPUT_MOUSE_SOCKET,
        js_socket_path=JS_SOCKET_PATH,
        enable_clipboard=ENABLE_CLIPBOARD,
        enable_cursors=ENABLE_CURSORS,
        cursor_size=CURSOR_SIZE,
        cursor_scale=1.0,
        cursor_debug=DEBUG_CURSORS,
        cli_args=args,
    )
    app.data_streaming_server = data_server

    input_handler = InputHandler(
        app,
        UINPUT_MOUSE_SOCKET,
        JS_SOCKET_PATH,
        str(ENABLE_CLIPBOARD).lower(),
        ENABLE_CURSORS,
        CURSOR_SIZE,
        1.0,
        DEBUG_CURSORS,
    )
    data_server.input_handler = (
        input_handler  # This will be used by ws_handler for its connection
    )

    # Callbacks are set on the input_handler instance that ws_handler will use.
    if hasattr(app, "set_video_bitrate"):
        input_handler.on_video_encoder_bit_rate = app.set_video_bitrate
    if hasattr(app, "set_audio_bitrate"):
        input_handler.on_audio_encoder_bit_rate = app.set_audio_bitrate
    if hasattr(app, "set_pointer_visible"):
        input_handler.on_mouse_pointer_visible = app.set_pointer_visible
    
    # Assuming send_ws_clipboard_data and send_ws_cursor_data in GSTStreamingApp
    # are the intended targets for these callbacks.
    input_handler.on_clipboard_read = app.send_ws_clipboard_data
    # input_handler.on_cursor_data = app.send_ws_cursor_data # Assuming similar setup if cursor data is sourced this way

    input_handler.on_set_fps = app.set_framerate
    if ENABLE_RESIZE:
        input_handler.on_resize = lambda res_str: on_resize_handler(res_str, app, data_server)
        input_handler.on_scaling_ratio = lambda scale_val: on_scaling_ratio_handler(
            scale_val, app
        )
    else:
        input_handler.on_resize = lambda res_str: logger.warning("Resize disabled.")
        input_handler.on_scaling_ratio = lambda scale_val: logger.warning(
            "Scaling disabled."
        )

    # These metrics setters are not defined in the provided code.
    # input_handler.on_client_fps = lambda fps_val: metrics.set_fps(fps_val)
    # input_handler.on_client_latency = lambda lat_val: metrics.set_latency(lat_val)


    tasks_to_run = []
    data_server_task = asyncio.create_task(data_server.run_server(), name="DataServer")
    tasks_to_run.append(data_server_task)

    if hasattr(input_handler, "connect"):  # This refers to the global input_handler
        tasks_to_run.append(
            asyncio.create_task(input_handler.connect(), name="InputConnect")
        )
    if hasattr(input_handler, "start_clipboard"):
        tasks_to_run.append(
            asyncio.create_task(input_handler.start_clipboard(), name="ClipboardMon")
        )
    if hasattr(input_handler, "start_cursor_monitor"):
        tasks_to_run.append(
            asyncio.create_task(input_handler.start_cursor_monitor(), name="CursorMon")
        )

    gst_bus_task = None
    if GSTREAMER_AVAILABLE and hasattr(app, "handle_bus_calls"):
        gst_bus_task = asyncio.create_task(app.handle_bus_calls(), name="GSTBusHandler")
        tasks_to_run.append(gst_bus_task)

    try:
        logger.info("All main components initialized. Running server...")
        if data_server_task:
            await data_server_task
            if data_server_task.exception():
                logger.error(
                    "DataStreamingServer task exited with an exception.",
                    exc_info=data_server_task.exception(),
                )
            else:
                logger.info("DataStreamingServer task completed.")
        else:
            logger.error("DataStreamingServer task was not created. Cannot run.")

    except asyncio.CancelledError:
        logger.info("Main application task was cancelled.")
    except Exception as e_main:
        logger.critical(f"Critical error in main execution: {e_main}", exc_info=True)
    finally:
        logger.info("Main loop ending or interrupted. Performing cleanup...")

        all_tasks_for_cleanup = [
            t for t in tasks_to_run if t and t is not data_server_task and not t.done()
        ]
        if (
            gst_bus_task
            and gst_bus_task is not data_server_task
            and not gst_bus_task.done()
        ):
            if gst_bus_task not in all_tasks_for_cleanup:
                all_tasks_for_cleanup.append(gst_bus_task)

        for task in all_tasks_for_cleanup:
            logger.debug(f"Cancelling task: {task.get_name()}")
            task.cancel()

        if all_tasks_for_cleanup:
            await asyncio.gather(*all_tasks_for_cleanup, return_exceptions=True)
            logger.info("Auxiliary tasks cancellation complete.")

        if app and hasattr(app, "stop_pipeline"):
            logger.info("Stopping GSTStreamingApp pipelines...")
            await app.stop_pipeline()

        if input_handler:  # This is the global input_handler instance
            logger.info("Stopping global InputHandler components...")
            if hasattr(input_handler, "stop_clipboard"):
                input_handler.stop_clipboard()
            if hasattr(input_handler, "stop_cursor_monitor"):
                input_handler.stop_cursor_monitor()
            if hasattr(input_handler, "stop_js_server") and asyncio.iscoroutinefunction(
                input_handler.stop_js_server
            ):
                await input_handler.stop_js_server()
            if hasattr(input_handler, "disconnect") and asyncio.iscoroutinefunction(
                input_handler.disconnect
            ):
                await input_handler.disconnect()

        if (
            data_server
            and hasattr(data_server, "stop")
            and asyncio.iscoroutinefunction(data_server.stop)
        ):
            logger.info("Ensuring DataStreamingServer resources are released...")
            await data_server.stop()

        logger.info("Cleanup complete. Exiting.")


def ws_entrypoint():
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Application stopped by KeyboardInterrupt.")
    except SystemExit as e:
        logger.info(f"Application exited with code {e.code}.")
    except Exception:
        logger.critical("Unhandled exception at entrypoint:", exc_info=True)
    finally:
        logging.shutdown()

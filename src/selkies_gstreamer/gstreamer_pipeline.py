import logging
import os
import re
import subprocess
import sys
import time
import urllib.parse
import base64
import asyncio
import json

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
export GST_PLUGIN_PATH="${GSTREAMER_PATH}/lib/x86_64-linux-gnu/gstreamer-1.0${GST_PLUGIN_PATH:+:${PATH}}"
export GST_PLUGIN_SYSTEM_PATH="${XDG_DATA_HOME:-${HOME:-~}/.local/share}/gstreamer-1.0/plugins:/usr/lib/x86_64-linux-gnu/gstreamer-1.0${GST_PLUGIN_SYSTEM_PATH:+:${PATH}}"
export GI_TYPELIB_PATH="${GSTREAMER_PATH}/lib/x86_64-linux-gnu/girepository-1.0:/usr/lib/x86_64-linux-gnu/girepository-1.0${GI_TYPELIB_PATH:+:${PATH}}"
export PYTHONPATH="${GSTREAMER_PATH}/lib/python3/dist-packages${PYTHONPATH:+:${PATH}}"
Replace "x86_64-linux-gnu" in other architectures manually or use "$(gcc -print-multiarch)" in place.
"""
    logger_gstwebrtc_app = logging.getLogger("gstebrtc_app")
    logger_gstwebrtc_app.error(msg)
    logger_gstwebrtc_app.error(e)
    sys.exit(1)
logger_gstwebrtc_app = logging.getLogger("gstebrtc_app")
logger_gstwebrtc_app.info("GStreamer-Python install looks OK")


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
        data_streaming_server=None,
        mode='webrtc'
    ):
        self.mode= mode
        self.pipeline_running = False
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
        self.data_streaming_server = data_streaming_server

    def ws_pipeline(self, keyframe_distance, keyframe_frame_distance, framerate, vbv_multiplier_sw, fec_video_bitrate):
        pipeline_string = f"""
            ximagesrc name=source ! queue name=queue1 ! videoconvert name=convert !
            capsfilter name=videoconvert_capsfilter caps=video/x-raw,format=NV12 !
            x264enc name=encoder
                threads={min(4, max(1, len(os.sched_getaffinity(0)) - 1))}
                aud=false b-adapt=false bframes=0 dct8x8=false insert-vui=true
                key-int-max={2147483647 if keyframe_distance == -1.0 else keyframe_frame_distance}
                mb-tree=false rc-lookahead=0 sync-lookahead=0
                vbv-buf-capacity={int((1000 + framerate - 1) // framerate * vbv_multiplier_sw)}
                sliced-threads=true byte-stream=true pass=cbr speed-preset=ultrafast tune=zerolatency
                bitrate={fec_video_bitrate} !
            queue name=queue2 ! appsink name=sink emit-signals=true sync=false
        """

        try:
            pipeline = Gst.parse_launch(pipeline_string)
        except Gst.ParseError as e:
            print(f"Error parsing pipeline string: {e}")
            return

        if not pipeline:
            print("Error: Could not create pipeline from string")
            return

        source = pipeline.get_by_name("source")
        if not source:
            print("Error: Could not get source element")
            return
        source.set_property("show-pointer", 0)
        source.set_property("remote", 1)

        sink = pipeline.get_by_name("sink")
        if not sink:
            print("Error: Could not get sink element")
            return
        def on_new_sample(sink):
            sample = sink.emit("pull-sample")
            if sample:
                buffer = sample.get_buffer()
                if buffer:
                    caps = sample.get_caps()
                    if caps:
                        structure = caps.get_structure(0)
                        codec_name = structure.get_name()
                    else:
                        codec_name = "Unknown Codec"
                    is_delta_frame = bool(buffer.get_flags() & Gst.BufferFlags.DELTA_UNIT)
                    frame_type = "Deltaframe" if is_delta_frame else "Keyframe"
                    success, map_info = buffer.map(Gst.MapFlags.READ)
                    if success:
                        data = map_info.data
                        data_copy = bytes(data)
                        frame_type_byte = b'\x00' if is_delta_frame else b'\x01'
                        prefixed_data = frame_type_byte + data_copy
                        if self.data_streaming_server.data_ws:
                            try:
                                import asyncio
                                asyncio.run_coroutine_threadsafe(self.data_streaming_server.data_ws.send(prefixed_data), self.async_event_loop)
                                data_logger = logging.getLogger("data_websocket")
                                data_logger.debug(f"Sent {len(prefixed_data)} bytes (including flag) to data websocket")
                            except Exception as e:
                                data_logger = logging.getLogger("data_websocket")
                                data_logger.error(f"Error sending data over websocket: {e}")
                        buffer.unmap(map_info)
                    else:
                        print("Error mapping buffer")
                return Gst.FlowReturn.OK
            return Gst.FlowReturn.ERROR
        sink.connect("new-sample", on_new_sample)
        pipeline.set_state(Gst.State.PLAYING)
        print("Pipeline is PLAYING... (ws_pipeline function version - check console for byte and metadata output)")
    def send_ws_clipboard_data(self, data):
        if self.data_streaming_server and self.data_streaming_server.data_ws:
            msg = f"clipboard,{base64.b64encode(data.encode()).decode()}" # Example format
            asyncio.create_task(self.data_streaming_server.data_ws.send(msg))
    def send_ws_cursor_data(self, data):
        if self.data_streaming_server and self.data_streaming_server.data_ws:
            msg_str = json.dumps(data) # Or format as needed
            msg = f"cursor,{msg_str}" # Example format
            asyncio.create_task(self.data_streaming_server.data_ws.send(msg))
    def stop_ximagesrc(self):
        self.pipeline_running = False
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
            vah264enc.set_property(
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
            vpenc.set_property(keyframe_distance,
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

    def start_ws_pipeline(self):
        logger_gstwebrtc_app.info("starting websocket pipeline using Gst.parse_launch()")

        pipeline_string = f"""
            ximagesrc name=source ! queue name=queue1 ! videoconvert name=convert !
            capsfilter name=videoconvert_capsfilter caps=video/x-raw,format=NV12 !
            x264enc name=encoder
                threads={min(4, max(1, len(os.sched_getaffinity(0)) - 1))}
                tune=zerolatency speed-preset=ultrafast byte-stream=true bframes=0 b-adapt=false
                rc-lookahead=0 sliced-threads=true sync-lookahead=0 dct8x8=false aud=false
                insert-vui=true pass=cbr bitrate={self.fec_video_bitrate}
                key-int-max={2147483647 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance}
                vbv-buf-capacity={int((1000 + self.framerate - 1) // self.framerate * self.vbv_multiplier_sw)} !
            queue name=queue2 ! appsink name=sink emit-signals=true sync=false
        """

        try:
            self.pipeline = Gst.parse_launch(pipeline_string)
        except Gst.ParseError as e:
            error_message = f"Error parsing pipeline string: {e}"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message) from e

        if not self.pipeline:
            error_message = "Error: Could not create pipeline from string"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)

        self.ximagesrc = self.pipeline.get_by_name("source")
        if not self.ximagesrc:
            error_message = "Error: Could not get source element"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)
        self.ximagesrc.set_property("show-pointer", 0)
        self.ximagesrc.set_property("remote", 1)

        sink = self.pipeline.get_by_name("sink")
        if not sink:
            error_message = "Error: Could not get sink element"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)

        def on_new_sample(sink):
            sample = sink.emit("pull-sample")
            if sample:
                buffer = sample.get_buffer()
                if buffer:
                    caps = sample.get_caps()
                    if caps:
                        structure = caps.get_structure(0)
                        codec_name = structure.get_name()
                    else:
                        codec_name = "Unknown Codec"
                    is_delta_frame = bool(buffer.get_flags() & Gst.BufferFlags.DELTA_UNIT)
                    frame_type = "Deltaframe" if is_delta_frame else "Keyframe"
                    success, map_info = buffer.map(Gst.MapFlags.READ)
                    if success:
                        data = map_info.data
                        data_copy = bytes(data)
                        frame_type_byte = b'\x00' if is_delta_frame else b'\x01'
                        prefixed_data = frame_type_byte + data_copy
                        if self.data_streaming_server and self.data_streaming_server.data_ws:
                            try:
                                import asyncio
                                asyncio.run_coroutine_threadsafe(self.data_streaming_server.data_ws.send(prefixed_data), self.async_event_loop)
                                data_logger = logging.getLogger("data_websocket")
                                data_logger.debug(f"Sent {len(prefixed_data)} bytes (including flag) to data websocket")
                            except Exception as e:
                                data_logger = logging.getLogger("data_websocket")
                                data_logger.error(f"Error sending data over websocket: {e}")
                        buffer.unmap(map_info)
                    else:
                        print("Error mapping buffer")
                return Gst.FlowReturn.OK
            return Gst.FlowReturn.ERROR
        sink.connect("new-sample", on_new_sample)


        res = self.pipeline.set_state(Gst.State.PLAYING)
        if res == Gst.StateChangeReturn.SUCCESS:
            logger_gstwebrtc_app.info("Pipeline state change to PLAYING was successful (synchronous)")
        elif res == Gst.StateChangeReturn.ASYNC:
            logger_gstwebrtc_app.info("Pipeline state change to PLAYING is ASYNCHRONOUS, waiting for completion...")
        else:
            error_message = f"Failed to transition pipeline to PLAYING: {res}"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)

        logger_gstwebrtc_app.info("websocket pipeline started using Gst.parse_launch()")

    async def stop_pipeline(self):
        logger_gstwebrtc_app.info("stopping pipeline")
        if self.data_channel:
            import asyncio
            await asyncio.to_thread(self.data_channel.emit, "close")
            self.data_channel = None
            logger_gstwebrtc_app.info("data channel closed")
        if self.pipeline:
            logger_gstwebrtc_app.info("setting pipeline state to NULL")
            import asyncio
            await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
            self.pipeline = None
            logger_gstwebrtc_app.info("pipeline set to state NULL")
        if self.webrtcbin:
            import asyncio
            await asyncio.to_thread(self.webrtcbin.set_state, Gst.State.NULL)
            self.webrtcbin = None
            logger_gstwebrtc_app.info("webrtcbin set to state NULL")
        logger_gstwebrtc_app.info("pipeline stopped")

    stop_ws_pipeline = stop_pipeline

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
        print(data)
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
        import asyncio
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
        import asyncio
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
        self.pipeline_running = True
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
        if self.pipeline is not None:
            bus = self.pipeline.get_bus()
        while True:
            if bus is not None:
                message = bus.timed_pop(0.1)
                if message:
                    if not self.bus_call(message):
                        break
            else:
                import asyncio
                await asyncio.sleep(0.1)
    async def stop_pipeline(self):
        logger_gstwebrtc_app.info("stopping pipeline")
        if self.data_channel:
            self.pipeline_running = False
            import asyncio
            await asyncio.to_thread(self.data_channel.emit, "close")
            self.data_channel = None
            logger_gstwebrtc_app.info("data channel closed")
        if self.pipeline:
            logger_gstwebrtc_app.info("setting pipeline state to NULL")
            import asyncio
            await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
            self.pipeline = None
            logger_gstwebrtc_app.info("pipeline set to state NULL")
        if self.webrtcbin:
            import asyncio
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
    logger_gstwebrtc_app_resize = logging.getLogger("gstwebrtc_app_resize")
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
        logger_gstwebrtc_app_resize = logging.getLogger("gstwebrtc_app_resize")
        logger_gstwebrtc_app_resize.info(
            "target resolution is the same: %s, skipping resize" % res
        )
        return False
    w, h = new_res.split("x")
    res = mode = new_res
    logger_gstwebrtc_app_resize = logging.getLogger("gstwebrtc_app_resize")
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
    from shutil import which
    logger_gstwebrtc_app_resize = logging.getLogger("gstwebrtc_app_resize")
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
    from shutil import which
    logger_gstwebrtc_app_resize = logging.getLogger("gstwebrtc_app_resize")
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

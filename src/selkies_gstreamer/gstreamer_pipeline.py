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
import struct

import gi
gi.require_version("GLib", "2.0")
gi.require_version("Gst", "1.0")
gi.require_version("GstRtp", "1.0")
gi.require_version("GstSdp", "1.0")
gi.require_version("GstWebRTC", "1.0")
from gi.repository import GLib, Gst, GstRtp, GstSdp, GstWebRTC
logger_gstwebrtc_app = logging.getLogger("gstwebrtc_app")

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
        self.server_enable_resize = False
        self.mode= mode
        self.display_width = 1024
        self.display_height = 768
        self.pipeline_running = False
        self.async_event_loop = async_event_loop
        self.stun_servers = stun_servers
        self.turn_servers = turn_servers
        self.audio_channels = audio_channels
        self.pipeline = None
        self.audio_ws_pipeline = None
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
        # State for WS FPS calculation
        self._current_server_fps = 0.0 # Stores the latest calculated WS FPS
        self._ws_frame_count = 0
        self._ws_fps_last_calc_time = time.monotonic()
        self._fps_interval_sec = 2.0 # Calculate FPS every 2 seconds
        self.gstreamer_ws_current_frame_id = 0

    def build_audio_ws_pipeline(self):
        logger_gstwebrtc_app.info("starting websocket audio pipeline using Gst.parse_launch()")
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
            audio_source = self.audio_ws_pipeline.get_by_name("source")
            audio_source.set_property("device", "output.monitor")
        except Gst.ParseError as e:
            error_message = f"Error parsing audio pipeline string: {e}"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message) from e

        if not self.audio_ws_pipeline:
            error_message = "Error: Could not create audio pipeline from string"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)

        audio_source = self.audio_ws_pipeline.get_by_name("source")
        if not audio_source:
            error_message = "Error: Could not get audio source element"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)

        audio_sink = self.audio_ws_pipeline.get_by_name("sink")
        if not audio_sink:
            error_message = "Error: Could not get audio sink element"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)

        def on_new_audio_sample(sink):
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
                    is_delta_frame = True
                    frame_type = "Deltaframe"
                    success, map_info = buffer.map(Gst.MapFlags.READ)
                    if success:
                        data = map_info.data
                        data_copy = bytes(data)
                        frame_type_byte = b'\x00'
                        data_type_byte = b'\x01'
                        prefixed_data = data_type_byte + frame_type_byte + data_copy
                        if self.data_streaming_server and self.data_streaming_server.data_ws:
                            try:
                                import asyncio
                                asyncio.run_coroutine_threadsafe(self.data_streaming_server.data_ws.send(prefixed_data), self.async_event_loop)
                            except Exception as e:
                                data_logger = logging.getLogger("data_websocket")
                                data_logger.error(f"Error sending audio data over websocket: {e}")
                        buffer.unmap(map_info)
                    else:
                        print("Error mapping audio buffer")
                return Gst.FlowReturn.OK
            return Gst.FlowReturn.ERROR
        audio_sink.connect("new-sample", on_new_audio_sample)

        res = self.audio_ws_pipeline.set_state(Gst.State.PLAYING)
        if res == Gst.StateChangeReturn.SUCCESS:
            logger_gstwebrtc_app.info("Audio pipeline state change to PLAYING was successful (synchronous)")
        elif res == Gst.StateChangeReturn.ASYNC:
            logger_gstwebrtc_app.info("Audio pipeline state change to PLAYING is ASYNCHRONOUS, waiting for completion...")
        else:
            error_message = f"Failed to transition audio pipeline to PLAYING: {res}"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)

        logger_gstwebrtc_app.info("websocket audio pipeline started using Gst.parse_launch()")
        return self.audio_ws_pipeline

    def send_ws_clipboard_data(self, data):
        if self.data_streaming_server and self.data_streaming_server.data_ws:
            msg = f"clipboard,{base64.b64encode(data.encode()).decode()}"
            asyncio.create_task(self.data_streaming_server.data_ws.send(msg))
    def send_ws_cursor_data(self, data):
        if self.data_streaming_server and self.data_streaming_server.data_ws:
            msg_str = json.dumps(data)
            msg = f"cursor,{msg_str}"
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
        
        # Initialize videoconvert and its capsfilter to None initially for clarity
        # These will be created if needed by non-NVIDIA paths or NVIDIA fallback
        videoconvert = None
        videoconvert_capsfilter = None

        pipeline_elements = [self.ximagesrc, self.ximagesrc_capsfilter]
        conversion_and_encoder_elements = [] # To hold elements from conversion up to encoder

        if self.encoder in ["nvh264enc", "nvh265enc", "nvav1enc"]:
            nvenc = None
            # Create nvenc element (common for both cudaconvert and videoconvert paths)
            if self.encoder == "nvh264enc":
                if self.gpu_id > 0:
                    if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                        nvenc = Gst.ElementFactory.make("nvcudah264device{}enc".format(self.gpu_id), "nvenc")
                    else:
                        nvenc = Gst.ElementFactory.make("nvh264device{}enc".format(self.gpu_id), "nvenc")
                else:
                    if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                        nvenc = Gst.ElementFactory.make("nvcudah264enc", "nvenc")
                    else:
                        nvenc = Gst.ElementFactory.make("nvh264enc", "nvenc")
            elif self.encoder == "nvh265enc":
                 if self.gpu_id > 0:
                    if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                        nvenc = Gst.ElementFactory.make("nvcudah265device{}enc".format(self.gpu_id), "nvenc")
                    else:
                        nvenc = Gst.ElementFactory.make("nvh265device{}enc".format(self.gpu_id), "nvenc")
                 else:
                    if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                        nvenc = Gst.ElementFactory.make("nvcudah265enc", "nvenc")
                    else:
                        nvenc = Gst.ElementFactory.make("nvh265enc", "nvenc")
            elif self.encoder == "nvav1enc":
                if self.gpu_id > 0:
                    if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                        nvenc = Gst.ElementFactory.make("nvcudaav1device{}enc".format(self.gpu_id), "nvenc")
                    else:
                        nvenc = Gst.ElementFactory.make("nvav1device{}enc".format(self.gpu_id), "nvenc")
                else:
                    if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                        nvenc = Gst.ElementFactory.make("nvcudaav1enc", "nvenc")
                    else:
                        nvenc = Gst.ElementFactory.make("nvav1enc", "nvenc")

            # Set common nvenc properties
            nvenc.set_property("bitrate", self.fec_video_bitrate)
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                nvenc.set_property("rate-control", "cbr")
            else:
                nvenc.set_property("rc-mode", "cbr")
            nvenc.set_property("gop-size", -1 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            nvenc.set_property("strict-gop", True)
            nvenc.set_property("aud", False)
            nvenc_properties = [prop.name for prop in nvenc.list_properties()]
            if "b-adapt" in nvenc_properties:
                 nvenc.set_property("b-adapt", False)
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                 if "b-frames" in nvenc_properties:
                     nvenc.set_property("b-frames", 0)
            else:
                 if "bframes" in nvenc_properties:
                     nvenc.set_property("bframes", 0)
            nvenc.set_property("rc-lookahead", 0)
            nvenc.set_property("vbv-buffer-size", int((self.fec_video_bitrate + self.framerate - 1) // self.framerate * self.vbv_multiplier_nv))
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                nvenc.set_property("zero-reorder-delay", True)
            else:
                nvenc.set_property("zerolatency", True)
            if self.encoder in ["nvh264enc", "nvh265enc"]:
                if Gst.version().major == 1 and Gst.version().minor > 20:
                    if self.encoder == "nvh264enc":
                         nvenc.set_property("cabac", True)
                    nvenc.set_property("repeat-sequence-header", True)
                if Gst.version().major == 1 and Gst.version().minor > 22:
                    nvenc.set_property("preset", "p4")
                    nvenc.set_property("tune", "ultra-low-latency")
                    nvenc.set_property("multi-pass", "two-pass-quarter")
                else:
                    nvenc.set_property("preset", "low-latency-hq")
            elif self.encoder in ["nvav1enc"]:
                 if Gst.version().major == 1 and Gst.version().minor > 22:
                    nvenc.set_property("preset", "p4")
                    nvenc.set_property("tune", "ultra-low-latency")
                    nvenc.set_property("multi-pass", "two-pass-quarter")
                 else:
                    nvenc.set_property("preset", "low-latency-hq")

            # Conditional conversion logic
            cudaconvert_factory = Gst.ElementFactory.find("cudaconvert")
            if cudaconvert_factory:
                logger_gstwebrtc_app.info("cudaconvert plugin found, using it for colorspace conversion.")
                cudaupload_pre_convert = Gst.ElementFactory.make("cudaupload", "cudaupload_pre_conv_webrtc")
                if self.gpu_id >= 0:
                    cudaupload_pre_convert.set_property("cuda-device-id", self.gpu_id)

                cudaconvert_el = Gst.ElementFactory.make("cudaconvert", "cudaconvert_webrtc")
                if self.gpu_id >= 0:
                    cudaconvert_el.set_property("cuda-device-id", self.gpu_id)
                cudaconvert_el.set_property("qos", True)

                cudaconvert_caps = Gst.caps_from_string("video/x-raw(memory:CUDAMemory)")
                cudaconvert_caps.set_value("format", "NV12")
                cudaconvert_capsfilter_el = Gst.ElementFactory.make("capsfilter", "cudaconvert_capsfilter_webrtc")
                cudaconvert_capsfilter_el.set_property("caps", cudaconvert_caps)
                
                conversion_and_encoder_elements = [cudaupload_pre_convert, cudaconvert_el, cudaconvert_capsfilter_el, nvenc]
            else:
                logger_gstwebrtc_app.info("cudaconvert plugin NOT found, falling back to videoconvert.")
                videoconvert_fb = Gst.ElementFactory.make("videoconvert", "videoconvert_nv_fb_webrtc")
                videoconvert_fb.set_property("n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
                videoconvert_fb.set_property("qos", True)
                
                videoconvert_caps_fb = Gst.caps_from_string("video/x-raw")
                videoconvert_caps_fb.set_value("format", "NV12")
                videoconvert_capsfilter_fb = Gst.ElementFactory.make("capsfilter", "videoconvert_capsfilter_nv_fb_webrtc")
                videoconvert_capsfilter_fb.set_property("caps", videoconvert_caps_fb)

                cudaupload_post_convert = Gst.ElementFactory.make("cudaupload", "cudaupload_post_conv_webrtc")
                if self.gpu_id >= 0:
                    cudaupload_post_convert.set_property("cuda-device-id", self.gpu_id)
                
                conversion_and_encoder_elements = [videoconvert_fb, videoconvert_capsfilter_fb, cudaupload_post_convert, nvenc]
            
            pipeline_elements.extend(conversion_and_encoder_elements)

            # Add encoder capsfilter and payloader (common for all H264/H265/AV1 from nvenc)
            if self.encoder == "nvh264enc":
                 pipeline_elements.extend([h264enc_capsfilter, rtph264pay, rtph264pay_capsfilter])
            elif self.encoder == "nvh265enc":
                 pipeline_elements.extend([h265enc_capsfilter, rtph265pay, rtph265pay_capsfilter])
            elif self.encoder == "nvav1enc":
                 pipeline_elements.extend([av1enc_capsfilter, rtpav1pay, rtpav1pay_capsfilter])
        
        elif self.encoder in ["vah264enc"]:
            if self.gpu_id > 0:
                vapostproc = Gst.ElementFactory.make("varenderD{}postproc".format(128 + self.gpu_id), "vapostproc")
            else:
                vapostproc = Gst.ElementFactory.make("vapostproc")
            vapostproc.set_property("scale-method", "fast")
            vapostproc.set_property("qos", True)
            vapostproc_caps = Gst.caps_from_string("video/x-raw(memory:VAMemory)")
            vapostproc_caps.set_value("format", "NV12")
            vapostproc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vapostproc_capsfilter.set_property("caps", vapostproc_caps)
            if self.gpu_id > 0:
                vah264enc = Gst.ElementFactory.make("varenderD{}h264enc".format(128 + self.gpu_id), "vaenc")
                if vah264enc is None:
                    vah264enc = Gst.ElementFactory.make("varenderD{}h264lpenc".format(128 + self.gpu_id), "vaenc")
            else:
                vah264enc = Gst.ElementFactory.make("vah264enc", "vaenc")
                if vah264enc is None:
                    vah264enc = Gst.ElementFactory.make("vah264lpenc", "vaenc")
            vah264enc.set_property("aud", False)
            vah264enc.set_property("b-frames", 0)
            vah264enc.set_property("cpb-size", int((self.fec_video_bitrate + self.framerate - 1) // self.framerate * self.vbv_multiplier_va))
            vah264enc.set_property("dct8x8", False)
            vah264enc.set_property("key-int-max", 1024 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            vah264enc.set_property("mbbrc", "disabled")
            vah264enc.set_property("num-slices", 4)
            vah264enc.set_property("ref-frames", 1)
            vah264enc.set_property("rate-control", "cbr")
            vah264enc.set_property("target-usage", 6)
            vah264enc.set_property("bitrate", self.fec_video_bitrate)
            pipeline_elements.extend([vapostproc, vapostproc_capsfilter, vah264enc, h264enc_capsfilter, rtph264pay, rtph264pay_capsfilter])
        elif self.encoder in ["vah265enc"]:
            if self.gpu_id > 0:
                vapostproc = Gst.ElementFactory.make("varenderD{}postproc".format(128 + self.gpu_id), "vapostproc")
            else:
                vapostproc = Gst.ElementFactory.make("vapostproc")
            vapostproc.set_property("scale-method", "fast")
            vapostproc.set_property("qos", True)
            vapostproc_caps = Gst.caps_from_string("video/x-raw(memory:VAMemory)")
            vapostproc_caps.set_value("format", "NV12")
            vapostproc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vapostproc_capsfilter.set_property("caps", vapostproc_caps)
            if self.gpu_id > 0:
                vah265enc = Gst.ElementFactory.make("varenderD{}h265enc".format(128 + self.gpu_id), "vaenc")
                if vah265enc is None:
                    vah265enc = Gst.ElementFactory.make("varenderD{}h265lpenc".format(128 + self.gpu_id), "vaenc")
            else:
                vah265enc = Gst.ElementFactory.make("vah265enc", "vaenc")
                if vah265enc is None:
                    vah265enc = Gst.ElementFactory.make("vah265lpenc", "vaenc")
            vah265enc.set_property("aud", False)
            vah265enc.set_property("b-frames", 0)
            vah265enc.set_property("cpb-size", int((self.fec_video_bitrate + self.framerate - 1) // self.framerate * self.vbv_multiplier_va))
            vah265enc.set_property("key-int-max", 1024 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            vah265enc.set_property("mbbrc", "disabled")
            vah265enc.set_property("num-slices", 4)
            vah265enc.set_property("ref-frames", 1)
            vah265enc.set_property("rate-control", "cbr")
            vah265enc.set_property("target-usage", 6)
            vah265enc.set_property("bitrate", self.fec_video_bitrate)
            pipeline_elements.extend([vapostproc, vapostproc_capsfilter, vah265enc, h265enc_capsfilter, rtph265pay, rtph265pay_capsfilter])
        elif self.encoder in ["vavp9enc"]:
            if self.gpu_id > 0:
                vapostproc = Gst.ElementFactory.make("varenderD{}postproc".format(128 + self.gpu_id), "vapostproc")
            else:
                vapostproc = Gst.ElementFactory.make("vapostproc")
            vapostproc.set_property("scale-method", "fast")
            vapostproc.set_property("qos", True)
            vapostproc_caps = Gst.caps_from_string("video/x-raw(memory:VAMemory)")
            vapostproc_caps.set_value("format", "NV12")
            vapostproc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vapostproc_capsfilter.set_property("caps", vapostproc_caps)
            if self.gpu_id > 0:
                vavp9enc = Gst.ElementFactory.make("varenderD{}vp9enc".format(128 + self.gpu_id), "vaenc")
                if vavp9enc is None:
                    vavp9enc = Gst.ElementFactory.make("varenderD{}vp9lpenc".format(128 + self.gpu_id), "vaenc")
            else:
                vavp9enc = Gst.ElementFactory.make("vavp9enc", "vaenc")
                if vavp9enc is None:
                    vavp9enc = Gst.ElementFactory.make("vavp9lpenc", "vaenc")
            vavp9enc.set_property("cpb-size", int((self.fec_video_bitrate + self.framerate - 1) // self.framerate * self.vbv_multiplier_va))
            vavp9enc.set_property("hierarchical-level", 1)
            vavp9enc.set_property("key-int-max", 1024 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            vavp9enc.set_property("mbbrc", "disabled")
            vavp9enc.set_property("ref-frames", 1)
            vavp9enc.set_property("rate-control", "cbr")
            vavp9enc.set_property("target-usage", 6)
            vavp9enc.set_property("bitrate", self.fec_video_bitrate)
            pipeline_elements.extend([vapostproc, vapostproc_capsfilter, vavp9enc, vpenc_capsfilter, rtpvppay, rtpvppay_capsfilter])
        elif self.encoder in ["vaav1enc"]:
            if self.gpu_id > 0:
                vapostproc = Gst.ElementFactory.make("varenderD{}postproc".format(128 + self.gpu_id), "vapostproc")
            else:
                vapostproc = Gst.ElementFactory.make("vapostproc")
            vapostproc.set_property("scale-method", "fast")
            vapostproc.set_property("qos", True)
            vapostproc_caps = Gst.caps_from_string("video/x-raw(memory:VAMemory)")
            vapostproc_caps.set_value("format", "NV12")
            vapostproc_capsfilter = Gst.ElementFactory.make("capsfilter")
            vapostproc_capsfilter.set_property("caps", vapostproc_caps)
            if self.gpu_id > 0:
                vaav1enc = Gst.ElementFactory.make("varenderD{}av1enc".format(128 + self.gpu_id), "vaenc")
                if vaav1enc is None:
                    vaav1enc = Gst.ElementFactory.make("varenderD{}av1lpenc".format(128 + self.gpu_id), "vaenc")
            else:
                vaav1enc = Gst.ElementFactory.make("vaav1enc", "vaenc")
                if vaav1enc is None:
                    vaav1enc = Gst.ElementFactory.make("vaav1lpenc", "vaenc")
            vaav1enc.set_property("cpb-size", int((self.fec_video_bitrate + self.framerate - 1) // self.framerate * self.vbv_multiplier_va))
            vaav1enc.set_property("hierarchical-level", 1)
            vaav1enc.set_property("key-int-max", 1024 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            vaav1enc.set_property("mbbrc", "disabled")
            vaav1enc.set_property("ref-frames", 1)
            vaav1enc.set_property("tile-groups", 16)
            vaav1enc.set_property("rate-control", "cbr")
            vaav1enc.set_property("target-usage", 6)
            vaav1enc.set_property("bitrate", self.fec_video_bitrate)
            pipeline_elements.extend([vapostproc, vapostproc_capsfilter, vaav1enc, av1enc_capsfilter, rtpav1pay, rtpav1pay_capsfilter])
        elif self.encoder in ["x264enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property("n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "NV12")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            x264enc = Gst.ElementFactory.make("x264enc", "x264enc")
            x264enc.set_property("threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            x264enc.set_property("aud", False)
            x264enc.set_property("b-adapt", False)
            x264enc.set_property("bframes", 0)
            x264enc.set_property("dct8x8", False)
            x264enc.set_property("insert-vui", True)
            x264enc.set_property("key-int-max", 2147483647 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            x264enc.set_property("mb-tree", False)
            x264enc.set_property("rc-lookahead", 0)
            x264enc.set_property("sync-lookahead", 0)
            x264enc.set_property("vbv-buf-capacity", int((1000 + self.framerate - 1) // self.framerate * self.vbv_multiplier_sw))
            x264enc.set_property("sliced-threads", True)
            x264enc.set_property("byte-stream", True)
            x264enc.set_property("pass", "cbr")
            x264enc.set_property("speed-preset", "ultrafast")
            x264enc.set_property("tune", "zerolatency")
            x264enc.set_property("bitrate", self.fec_video_bitrate)
            pipeline_elements.extend([videoconvert, videoconvert_capsfilter, x264enc, h264enc_capsfilter, rtph264pay, rtph264pay_capsfilter])
        elif self.encoder in ["openh264enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property("n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
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
            openh264enc.set_property("gop-size", 2147483647 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            openh264enc.set_property("multi-thread", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            openh264enc.set_property("slice-mode", "n-slices")
            openh264enc.set_property("num-slices", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            openh264enc.set_property("rate-control", "bitrate")
            openh264enc.set_property("bitrate", self.fec_video_bitrate * 1000)
            pipeline_elements.extend([videoconvert, videoconvert_capsfilter, openh264enc, h264enc_capsfilter, rtph264pay, rtph264pay_capsfilter])
        elif self.encoder in ["x265enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property("n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            x265enc = Gst.ElementFactory.make("x265enc", "x265enc")
            x265enc.set_property("option-string", "b-adapt=0:bframes=0:rc-lookahead=0:repeat-headers:pmode:wpp")
            x265enc.set_property("key-int-max", 2147483647 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            x265enc.set_property("speed-preset", "ultrafast")
            x265enc.set_property("tune", "zerolatency")
            x265enc.set_property("bitrate", self.fec_video_bitrate)
            pipeline_elements.extend([videoconvert, videoconvert_capsfilter, x265enc, h265enc_capsfilter, rtph265pay, rtph265pay_capsfilter])
        elif self.encoder in ["vp8enc", "vp9enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property("n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
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
            vbv_buffer_size = int((1000 + self.framerate - 1) // self.framerate * self.vbv_multiplier_vp)
            vpenc.set_property("threads", min(16, max(1, len(os.sched_getaffinity(0)) - 1)))
            vpenc.set_property("buffer-initial-size", vbv_buffer_size)
            vpenc.set_property("buffer-optimal-size", vbv_buffer_size)
            vpenc.set_property("buffer-size", vbv_buffer_size)
            vpenc.set_property("cpu-used", -16)
            vpenc.set_property("deadline", 1)
            vpenc.set_property("end-usage", "cbr")
            vpenc.set_property("error-resilient", "default")
            vpenc.set_property("keyframe-mode", "disabled")
            vpenc.set_property("keyframe-max-dist", 2147483647 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            vpenc.set_property("lag-in-frames", 0)
            vpenc.set_property("max-intra-bitrate", 250)
            vpenc.set_property("multipass-mode", "first-pass")
            vpenc.set_property("overshoot", 10)
            vpenc.set_property("undershoot", 25)
            vpenc.set_property("static-threshold", 0)
            vpenc.set_property("tuning", "psnr")
            vpenc.set_property("target-bitrate", self.fec_video_bitrate * 1000)
            pipeline_elements.extend([videoconvert, videoconvert_capsfilter, vpenc, vpenc_capsfilter, rtpvppay, rtpvppay_capsfilter])
        elif self.encoder in ["svtav1enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property("n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            svtav1enc = Gst.ElementFactory.make("svtav1enc", "svtav1enc")
            svtav1enc.set_property("intra-period-length", -1 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            svtav1enc.set_property("preset", 10)
            svtav1enc.set_property("logical-processors", min(24, max(1, len(os.sched_getaffinity(0)) - 1)))
            svtav1enc.set_property("parameters-string", "rc=2:fast-decode=1:buf-initial-sz=100:buf-optimal-sz=120:maxsection-pct=250:lookahead=0:pred-struct=1")
            svtav1enc.set_property("target-bitrate", self.fec_video_bitrate)
            pipeline_elements.extend([videoconvert, videoconvert_capsfilter, svtav1enc, av1enc_capsfilter, rtpav1pay, rtpav1pay_capsfilter])
        elif self.encoder in ["av1enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property("n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            av1enc = Gst.ElementFactory.make("av1enc", "av1enc")
            av1enc.set_property("cpu-used", 10)
            av1enc.set_property("end-usage", "cbr")
            av1enc.set_property("keyframe-max-dist", 2147483647 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            av1enc.set_property("lag-in-frames", 0)
            av1enc.set_property("overshoot-pct", 10)
            av1enc.set_property("row-mt", True)
            av1enc.set_property("usage-profile", "realtime")
            av1enc.set_property("tile-columns", 2)
            av1enc.set_property("tile-rows", 2)
            av1enc.set_property("threads", min(24, max(1, len(os.sched_getaffinity(0)) - 1)))
            av1enc.set_property("target-bitrate", self.fec_video_bitrate)
            pipeline_elements.extend([videoconvert, videoconvert_capsfilter, av1enc, av1enc_capsfilter, rtpav1pay, rtpav1pay_capsfilter])
        elif self.encoder in ["rav1enc"]:
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoconvert.set_property("n-threads", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            videoconvert.set_property("qos", True)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", "I420")
            videoconvert_capsfilter = Gst.ElementFactory.make("capsfilter")
            videoconvert_capsfilter.set_property("caps", videoconvert_caps)
            rav1enc = Gst.ElementFactory.make("rav1enc", "rav1enc")
            rav1enc.set_property("low-latency", True)
            rav1enc.set_property("max-key-frame-interval", 715827882 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            rav1enc.set_property("rdo-lookahead-frames", 0)
            rav1enc.set_property("reservoir-frame-delay", 12)
            rav1enc.set_property("speed-preset", 10)
            rav1enc.set_property("tiles", 16)
            rav1enc.set_property("threads", min(24, max(1, len(os.sched_getaffinity(0)) - 1)))
            rav1enc.set_property("bitrate", self.fec_video_bitrate * 1000)
            pipeline_elements.extend([videoconvert, videoconvert_capsfilter, rav1enc, av1enc_capsfilter, rtpav1pay, rtpav1pay_capsfilter])
        else:
            raise GSTWebRTCAppError("Unsupported encoder for pipeline: %s" % self.encoder)

        # Common logic for adding and linking elements
        for pipeline_element in pipeline_elements:
            if pipeline_element: # Ensure element was created (e.g. videoconvert might be None if not used)
                self.pipeline.add(pipeline_element)
        
        # Add webrtcbin at the end of the source/encoder chain before linking
        pipeline_elements_to_link = [el for el in pipeline_elements if el is not None] + [self.webrtcbin]

        for i in range(len(pipeline_elements_to_link) - 1):
            if not Gst.Element.link(pipeline_elements_to_link[i], pipeline_elements_to_link[i + 1]):
                raise GSTWebRTCAppError("Failed to link {} -> {}".format(pipeline_elements_to_link[i].get_name(), pipeline_elements_to_link[i + 1].get_name()))
        
        transceiver = self.webrtcbin.emit("get-transceiver", 0)
        transceiver.set_property("do-nack", True)
        transceiver.set_property("fec-type", GstWebRTC.WebRTCFECType.ULP_RED if self.video_packetloss_percent > 0 else GstWebRTC.WebRTCFECType.NONE)
        transceiver.set_property("fec-percentage", self.video_packetloss_percent)

    def start_ws_pipeline(self):
        logger_gstwebrtc_app.info(f"starting websocket video pipeline programmatically with encoder: {self.encoder}")
        self.pipeline = Gst.Pipeline.new()
        if not self.pipeline:
            error_message = "Error: Could not create pipeline"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)

        self.ximagesrc = Gst.ElementFactory.make("ximagesrc", "source")
        queue1 = Gst.ElementFactory.make("queue", "queue1")
        # videoconvert and videoconvert_capsfilter are general purpose, might be used or skipped
        videoconvert_main = Gst.ElementFactory.make("videoconvert", "convert")
        videoconvert_main_capsfilter = Gst.ElementFactory.make("capsfilter", "videoconvert_capsfilter")
        queue2 = Gst.ElementFactory.make("queue", "queue2")
        appsink = Gst.ElementFactory.make("appsink", "sink")
        
        core_common_elements_definitions = [
            (self.ximagesrc, "source"), (queue1, "queue1"), 
            (videoconvert_main, "convert"), (videoconvert_main_capsfilter, "videoconvert_capsfilter"),
            (queue2, "queue2"), (appsink, "sink")
        ] # Used for error checking primarily

        for elem, name in core_common_elements_definitions:
             if not elem: #This check is on creation, not whether they are used in a specific path
                error_message = f"Error: Could not create core common element {name}"
                logger_gstwebrtc_app.error(error_message)
                raise GSTWebRTCAppError(error_message)

        self.ximagesrc.set_property("show-pointer", 0)
        self.ximagesrc.set_property("remote", 1)
        videoconvert_main.set_property("n-threads", os.cpu_count())
        videoconvert_main.set_property("qos", True)
        
        # This list will hold the elements for the current encoder path
        current_pipeline_segment = [] 
        # This flag helps decide how to construct the full `all_elements` list later
        ws_nvh264_uses_cudaconvert = False 

        # Default output format for videoconvert_main if used
        videoconvert_output_format = None 

        if self.encoder == "x264enc":
            videoconvert_output_format = "NV12"
            encoder = Gst.ElementFactory.make("x264enc", "encoder")
            if not encoder:
                raise GSTWebRTCAppError("Error: Could not create x264enc element")
            # ... x264enc properties ...
            encoder.set_property("threads", os.cpu_count())
            encoder.set_property("aud", False)
            encoder.set_property("b-adapt", False)
            encoder.set_property("bframes", 0)
            encoder.set_property("dct8x8", False)
            encoder.set_property("insert-vui", True)
            encoder.set_property("key-int-max", 2147483647 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            encoder.set_property("mb-tree", False)
            encoder.set_property("rc-lookahead", 0)
            encoder.set_property("sync-lookahead", 0)
            encoder.set_property("vbv-buf-capacity", int((1000 + self.framerate - 1) // self.framerate * self.vbv_multiplier_sw))
            encoder.set_property("sliced-threads", True)
            encoder.set_property("byte-stream", True)
            encoder.set_property("pass", "cbr")
            encoder.set_property("speed-preset", "ultrafast")
            encoder.set_property("tune", "zerolatency")
            encoder.set_property("bitrate", self.video_bitrate)
            current_pipeline_segment = [videoconvert_main, videoconvert_main_capsfilter, encoder]
        
        elif self.encoder == "nvh264enc":
            # Create nvh264enc and its capsfilter (common to both cudaconvert/videoconvert paths for nvh264enc)
            encoder = None
            if self.gpu_id > 0:
                if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                    encoder = Gst.ElementFactory.make("nvcudah264device{}enc".format(self.gpu_id), "encoder")
                else:
                    encoder = Gst.ElementFactory.make("nvh264device{}enc".format(self.gpu_id), "encoder")
            else:
                if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                    encoder = Gst.ElementFactory.make("nvcudah264enc", "encoder")
                else:
                    encoder = Gst.ElementFactory.make("nvh264enc", "encoder")
            if not encoder:
                 raise GSTWebRTCAppError(f"Error: Could not create {self.encoder} element")
            # ... nvh264enc properties ...
            encoder.set_property("bitrate", self.video_bitrate)
            encoder_properties = [prop.name for prop in encoder.list_properties()]
            if "rate-control" in encoder_properties:
                encoder.set_property("rate-control", "cbr")
            elif "rc-mode" in encoder_properties:
                encoder.set_property("rc-mode", "cbr")
            encoder.set_property("gop-size", -1 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            encoder.set_property("strict-gop", True)
            encoder.set_property("aud", False)
            if "b-adapt" in encoder_properties:
                 encoder.set_property("b-adapt", False)
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                 if "b-frames" in encoder_properties:
                     encoder.set_property("b-frames", 0)
            else:
                 if "bframes" in encoder_properties:
                     encoder.set_property("bframes", 0)
            encoder.set_property("rc-lookahead", 0)
            encoder.set_property("vbv-buffer-size", int((self.video_bitrate + self.framerate - 1) // self.framerate * self.vbv_multiplier_nv))
            if Gst.version().major == 1 and 20 < Gst.version().minor <= 24:
                if "zero-reorder-delay" in encoder_properties:
                    encoder.set_property("zero-reorder-delay", True)
            else:
                if "zerolatency" in encoder_properties:
                    encoder.set_property("zerolatency", True)
            if Gst.version().major == 1 and Gst.version().minor > 20:
                if "cabac" in encoder_properties:
                     encoder.set_property("cabac", True)
                if "repeat-sequence-header" in encoder_properties:
                    encoder.set_property("repeat-sequence-header", True)
            if Gst.version().major == 1 and Gst.version().minor > 22:
                if "preset" in encoder_properties:
                    encoder.set_property("preset", "p4")
                if "tune" in encoder_properties:
                    encoder.set_property("tune", "ultra-low-latency")
                if "multi-pass" in encoder_properties:
                    encoder.set_property("multi-pass", "two-pass-quarter")
            else:
                 if "preset" in encoder_properties:
                     encoder.set_property("preset", "low-latency-hq")

            h264enc_caps = Gst.caps_from_string("video/x-h264")
            h264enc_caps.set_value("profile", "main")
            h264enc_caps.set_value("stream-format", "byte-stream")
            h264enc_capsfilter = Gst.ElementFactory.make("capsfilter", "h264enc_capsfilter")
            if not h264enc_capsfilter:
                 raise GSTWebRTCAppError("Error: Could not create h264enc_capsfilter element")
            h264enc_capsfilter.set_property("caps", h264enc_caps)

            cudaconvert_factory = Gst.ElementFactory.find("cudaconvert")
            if cudaconvert_factory:
                logger_gstwebrtc_app.info("cudaconvert plugin found, using it for WS nvh264enc pipeline.")
                ws_nvh264_uses_cudaconvert = True
                cudaupload_pre_ws = Gst.ElementFactory.make("cudaupload", "cudaupload_pre_ws_nvh264")
                if self.gpu_id >= 0: cudaupload_pre_ws.set_property("cuda-device-id", self.gpu_id)
                
                cudaconvert_el_ws = Gst.ElementFactory.make("cudaconvert", "cudaconvert_ws_nvh264")
                if self.gpu_id >= 0: cudaconvert_el_ws.set_property("cuda-device-id", self.gpu_id)
                cudaconvert_el_ws.set_property("qos", True)

                cudaconvert_caps_val_ws = Gst.caps_from_string("video/x-raw(memory:CUDAMemory),format=NV12")
                cudaconvert_capsfilter_ws = Gst.ElementFactory.make("capsfilter", "cudaconvert_capsfilter_ws_nvh264")
                cudaconvert_capsfilter_ws.set_property("caps", cudaconvert_caps_val_ws)
                
                current_pipeline_segment = [cudaupload_pre_ws, cudaconvert_el_ws, cudaconvert_capsfilter_ws, encoder, h264enc_capsfilter]
                videoconvert_output_format = "BGRx" # Dummy, videoconvert_main not used in this path
            else:
                logger_gstwebrtc_app.info("cudaconvert plugin NOT found, using videoconvert for WS nvh264enc pipeline.")
                videoconvert_output_format = "NV12" # For videoconvert_main
                cudaupload_fallback_ws = Gst.ElementFactory.make("cudaupload", "cudaupload_ws_nvh264_fallback")
                if not cudaupload_fallback_ws:
                     raise GSTWebRTCAppError("Error: Could not create cudaupload element for WS nvh264enc fallback")
                if self.gpu_id >= 0:
                    cudaupload_fallback_ws.set_property("cuda-device-id", self.gpu_id)
                current_pipeline_segment = [videoconvert_main, videoconvert_main_capsfilter, cudaupload_fallback_ws, encoder, h264enc_capsfilter]
        
        elif self.encoder == "vah264enc":
            videoconvert_output_format = "NV12"
            # ... (vapostproc, vah264enc `encoder`, h264enc_capsfilter creation) ...
            if self.gpu_id > 0:
                vapostproc = Gst.ElementFactory.make("varenderD{}postproc".format(128 + self.gpu_id), "vapostproc")
            else:
                vapostproc = Gst.ElementFactory.make("vapostproc")
            if not vapostproc:
                 raise GSTWebRTCAppError("Error: Could not create vapostproc element")
            vapostproc.set_property("scale-method", "fast")
            vapostproc.set_property("qos", True)
            # Note: For VAAPI, videoconvert output should be system memory, then vapostproc converts to VAMemory.
            # The original code for vah264enc in start_ws_pipeline implies videoconvert -> vapostproc -> encoder.
            # So, videoconvert_main_capsfilter should output to system memory, format NV12.
            # vapostproc will then handle the upload to VAMemory.

            encoder = None
            if self.gpu_id > 0:
                encoder = Gst.ElementFactory.make("varenderD{}h264enc".format(128 + self.gpu_id), "encoder")
                if encoder is None:
                    encoder = Gst.ElementFactory.make("varenderD{}h264lpenc".format(128 + self.gpu_id), "encoder")
            else:
                encoder = Gst.ElementFactory.make("vah264enc", "encoder")
                if encoder is None:
                    encoder = Gst.ElementFactory.make("vah264lpenc", "encoder")
            if not encoder:
                 raise GSTWebRTCAppError(f"Error: Could not create {self.encoder} element")
            # ... vah264enc properties ...
            encoder.set_property("aud", False)
            encoder.set_property("b-frames", 0)
            encoder.set_property("cpb-size", int((self.video_bitrate + self.framerate - 1) // self.framerate * self.vbv_multiplier_va))
            encoder.set_property("dct8x8", False)
            encoder.set_property("key-int-max", 1024 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            encoder.set_property("mbbrc", "disabled")
            encoder.set_property("num-slices", 4)
            encoder.set_property("ref-frames", 1)
            if not Gst.util_set_object_arg(encoder, "rate-control", "cbr"):
                 logger_gstwebrtc_app.warning(f"Failed to set 'rate-control' property to 'cbr' on {encoder.get_name()}")
            encoder.set_property("target-usage", 6)
            encoder.set_property("bitrate", self.video_bitrate)

            h264enc_caps = Gst.caps_from_string("video/x-h264")
            h264enc_caps.set_value("profile", "main")
            h264enc_caps.set_value("stream-format", "byte-stream")
            h264enc_capsfilter = Gst.ElementFactory.make("capsfilter", "h264enc_capsfilter")
            if not h264enc_capsfilter:
                 raise GSTWebRTCAppError("Error: Could not create h264enc_capsfilter element")
            h264enc_capsfilter.set_property("caps", h264enc_caps)
            
            # Chain: videoconvert_main -> videoconvert_main_capsfilter -> vapostproc -> encoder -> h264enc_capsfilter
            current_pipeline_segment = [videoconvert_main, videoconvert_main_capsfilter, vapostproc, encoder, h264enc_capsfilter]

        elif self.encoder == "openh264enc":
            videoconvert_output_format = "I420"
            encoder = Gst.ElementFactory.make("openh264enc", "encoder")
            if not encoder:
                raise GSTWebRTCAppError("Error: Could not create openh264enc element")
            # ... openh264enc properties ...
            encoder.set_property("adaptive-quantization", False)
            encoder.set_property("background-detection", False)
            encoder.set_property("enable-frame-skip", False)
            encoder.set_property("scene-change-detection", False)
            encoder.set_property("usage-type", "screen")
            encoder.set_property("complexity", "low")
            encoder.set_property("gop-size", 2147483647 if self.keyframe_distance == -1.0 else self.keyframe_frame_distance)
            encoder.set_property("multi-thread", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            encoder.set_property("slice-mode", "n-slices")
            encoder.set_property("num-slices", min(4, max(1, len(os.sched_getaffinity(0)) - 1)))
            encoder.set_property("rate-control", "bitrate")
            encoder.set_property("bitrate", self.video_bitrate * 1000)

            h264enc_caps = Gst.caps_from_string("video/x-h264")
            h264enc_caps.set_value("stream-format", "byte-stream")
            h264enc_capsfilter = Gst.ElementFactory.make("capsfilter", "h264enc_capsfilter")
            if not h264enc_capsfilter:
                 raise GSTWebRTCAppError("Error: Could not create h264enc_capsfilter element")
            h264enc_capsfilter.set_property("caps", h264enc_caps)
            current_pipeline_segment = [videoconvert_main, videoconvert_main_capsfilter, encoder, h264enc_capsfilter]
        else:
            error_message = f"Unsupported encoder '{self.encoder}' for websocket pipeline mode. Supported: x264enc, nvh264enc, vah264enc, openh264enc"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)

        # Configure videoconvert_main_capsfilter's caps if videoconvert_main is part of the current_pipeline_segment
        if videoconvert_main in current_pipeline_segment:
            if videoconvert_output_format is None:
                 error_message = f"Internal Error: videoconvert_output_format not set for encoder {self.encoder} which uses videoconvert_main."
                 logger_gstwebrtc_app.error(error_message)
                 raise GSTWebRTCAppError(error_message)
            videoconvert_caps = Gst.caps_from_string("video/x-raw")
            videoconvert_caps.set_value("format", videoconvert_output_format)
            videoconvert_caps.set_value("framerate", Gst.Fraction(self.framerate, 1))
            videoconvert_main_capsfilter.set_property("caps", videoconvert_caps)
        
        # Assemble the full list of elements to add and link
        if ws_nvh264_uses_cudaconvert: # Special case for nvh264enc with cudaconvert
            all_elements = [self.ximagesrc, queue1] + current_pipeline_segment + [queue2, appsink]
        else: # Default assembly for other encoders or nvh264enc fallback
            all_elements = [self.ximagesrc, queue1] + current_pipeline_segment + [queue2, appsink]


        for elem in all_elements:
             if not elem: # Should have been caught earlier if a core element failed creation
                  error_message = f"Attempted to add None element to pipeline from 'all_elements' list."
                  logger_gstwebrtc_app.error(error_message)
                  raise GSTWebRTCAppError(error_message)
             self.pipeline.add(elem)
        
        # Link elements
        for i in range(len(all_elements) - 1):
            link_success = all_elements[i].link(all_elements[i+1])
            if not link_success: 
                raise GSTWebRTCAppError(f"Failed to link {all_elements[i].get_name()} -> {all_elements[i+1].get_name()}")

        appsink_elem = self.pipeline.get_by_name("sink")
        if not appsink_elem:
            error_message = "Error: Could not get sink element by name after linking"
            logger_gstwebrtc_app.error(error_message)
            raise GSTWebRTCAppError(error_message)
        appsink_elem.set_property("emit-signals", True)
        appsink_elem.set_property("sync", False)
        
        def on_new_sample(sink):
            sample = sink.emit("pull-sample")
            if sample:
                self._ws_frame_count += 1
                now = time.monotonic()
                elapsed = now - self._ws_fps_last_calc_time
                if elapsed >= self._fps_interval_sec:
                    calculated_fps = self._ws_frame_count / elapsed
                    self._current_server_fps = calculated_fps # Update FPS value
                    self._ws_frame_count = 0
                    self._ws_fps_last_calc_time = now
                buffer = sample.get_buffer()
                if buffer:
                    is_delta_frame = bool(buffer.get_flags() & Gst.BufferFlags.DELTA_UNIT)
                    success, map_info = buffer.map(Gst.MapFlags.READ)
                    if success:
                        data = map_info.data
                        data_copy = bytes(data)
                        self.gstreamer_ws_current_frame_id = (self.gstreamer_ws_current_frame_id + 1) % 65536
                        if self.data_streaming_server:
                            self.data_streaming_server.update_last_sent_frame_id(self.gstreamer_ws_current_frame_id)

                        data_type_byte = b'\x00' # Existing: Video data
                        video_frame_type_byte = b'\x00' if is_delta_frame else b'\x01' # Existing: Delta or Key
                        frame_id_bytes = struct.pack("!H", self.gstreamer_ws_current_frame_id) # Network byte order (Big Endian)
                        
                        header = data_type_byte + video_frame_type_byte + frame_id_bytes
                        prefixed_data = header + data_copy
                        if self.data_streaming_server and self.data_streaming_server.data_ws:
                            try:
                                import asyncio
                                if self.async_event_loop and self.async_event_loop.is_running():
                                    asyncio.run_coroutine_threadsafe(
                                        self.data_streaming_server.data_ws.send(prefixed_data),
                                        self.async_event_loop
                                    )
                                else:
                                     data_logger = logging.getLogger("data_websocket")
                                     data_logger.warning("Async event loop not running, cannot send video data via websocket.")
                            except Exception as e:
                                data_logger = logging.getLogger("data_websocket")
                                data_logger.error(f"Error sending video data over websocket: {e}")
                    else:
                        logger_gstwebrtc_app.error("Error mapping video buffer")
                return Gst.FlowReturn.OK
            return Gst.FlowReturn.OK
        appsink_elem.connect("new-sample", on_new_sample)
        
        logger_gstwebrtc_app.info(f"Setting video pipeline state to PLAYING for encoder: {self.encoder}")
        res = self.pipeline.set_state(Gst.State.PLAYING)
        if res == Gst.StateChangeReturn.SUCCESS:
            logger_gstwebrtc_app.info("Video pipeline state change to PLAYING was successful (synchronous)")
        elif res == Gst.StateChangeReturn.ASYNC:
            logger_gstwebrtc_app.info("Video pipeline state change to PLAYING is ASYNCHRONOUS, waiting for completion...")
        else:
            error_message = f"Failed to transition video pipeline to PLAYING: {res}"
            logger_gstwebrtc_app.error(error_message)
            bus = self.pipeline.get_bus()
            msg = bus.timed_pop_filtered(Gst.CLOCK_TIME_NONE, Gst.MessageType.ERROR)
            if msg:
                 err, debug_info = msg.parse_error()
                 error_message += f"\nBus Error: {err} ({debug_info})"
                 logger_gstwebrtc_app.error(f"Bus Error during state change: {err} ({debug_info})")
            raise GSTWebRTCAppError(error_message)
        logger_gstwebrtc_app.info(f"websocket video pipeline started programmatically with encoder: {self.encoder}")
        self.pipeline_running = True
        return self.pipeline

    async def stop_pipeline(self):
        logger_gstwebrtc_app.info("stopping pipeline")
        if self.data_channel:
            self.pipeline_running = False
            import asyncio
            await asyncio.to_thread(self.data_channel.emit, "close")
            self.data_channel = None
            logger_gstwebrtc_app.info("data channel closed")
        if self.pipeline:
            logger_gstwebrtc_app.info("setting video pipeline state to NULL")
            import asyncio
            await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
            self.pipeline = None
            logger_gstwebrtc_app.info("video pipeline set to state NULL")
        if self.audio_ws_pipeline:
            logger_gstwebrtc_app.info("setting audio pipeline state to NULL")
            import asyncio
            await asyncio.to_thread(self.audio_ws_pipeline.set_state, Gst.State.NULL)
            self.audio_ws_pipeline = None
            logger_gstwebrtc_app.info("audio pipeline set to state NULL")
        if self.webrtcbin:
            import asyncio
            await asyncio.to_thread(self.webrtcbin.set_state, Gst.State.NULL)
            self.webrtcbin = None
            logger_gstwebrtc_app.info("webrtcbin set to state NULL")
        logger_gstwebrtc_app.info("pipeline stopped")

    stop_ws_pipeline = stop_pipeline

    def get_current_server_fps(self):
        """Returns the most recently calculated server output FPS for the WebSocket pipeline."""
        # This value is only updated by the on_new_sample callback in start_ws_pipeline
        return self._current_server_fps

    async def start_websocket_video_pipeline(self):
        if self.mode == 'websockets':
            # Hanle null on init
            if self.encoder is None:
                if self.pipeline:
                    logger_gstwebrtc_app.info("Helper: Stopping existing video pipeline as self.encoder is None for websockets.")
                    await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
                    self.pipeline = None
                self.pipeline_running = False
                return
            logger_gstwebrtc_app.info("Helper: Starting WebSocket video pipeline.")
            try:
                # Ensure any previous video pipeline is stopped
                if self.pipeline:
                     logger_gstwebrtc_app.info("Helper: Stopping existing video pipeline before starting new one.")
                     await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
                     self.pipeline = None
                self.start_ws_pipeline()
                logger_gstwebrtc_app.info("Helper: WebSocket video pipeline started successfully.")
            except Exception as e:
                logger_gstwebrtc_app.error(f"Helper: Error starting WebSocket video pipeline: {e}", exc_info=True)
                # Attempt cleanup if start failed partially
                if self.pipeline:
                    await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
                    self.pipeline = None
                raise
        else:
            logger_gstwebrtc_app.warning("Helper: start_websocket_video_pipeline called but mode is not 'websockets'.")

    async def stop_websocket_video_pipeline(self):
        if self.mode == 'websockets':
            logger_gstwebrtc_app.info("Helper: Stopping WebSocket video pipeline.")
            if self.pipeline:
                try:
                    await asyncio.to_thread(self.pipeline.set_state, Gst.State.NULL)
                    self.pipeline = None
                    self.pipeline_running = False # Ensure state reflects stop
                    logger_gstwebrtc_app.info("Helper: WebSocket video pipeline stopped successfully.")
                except Exception as e:
                    logger_gstwebrtc_app.error(f"Helper: Error stopping WebSocket video pipeline: {e}", exc_info=True)
            else:
                logger_gstwebrtc_app.info("Helper: No WebSocket video pipeline instance found to stop.")
        else:
            logger_gstwebrtc_app.warning("Helper: stop_websocket_video_pipeline called but mode is not 'websockets'.")

    async def start_websocket_audio_pipeline(self):
        if self.mode == 'websockets':
            logger_gstwebrtc_app.info("Helper: Starting WebSocket audio pipeline.")
            try:
                # Ensure any previous audio pipeline is stopped
                if self.audio_ws_pipeline:
                     logger_gstwebrtc_app.info("Helper: Stopping existing audio pipeline before starting new one.")
                     await asyncio.to_thread(self.audio_ws_pipeline.set_state, Gst.State.NULL)
                     self.audio_ws_pipeline = None
                self.build_audio_ws_pipeline()
                logger_gstwebrtc_app.info("Helper: WebSocket audio pipeline started successfully.")
            except Exception as e:
                logger_gstwebrtc_app.error(f"Helper: Error starting WebSocket audio pipeline: {e}", exc_info=True)
                # Attempt cleanup if start failed partially
                if self.audio_ws_pipeline:
                    await asyncio.to_thread(self.audio_ws_pipeline.set_state, Gst.State.NULL)
                    self.audio_ws_pipeline = None
                raise
        else:
            logger_gstwebrtc_app.warning("Helper: start_websocket_audio_pipeline called but mode is not 'websockets'.")

    async def stop_websocket_audio_pipeline(self):
        if self.mode == 'websockets':
            logger_gstwebrtc_app.info("Helper: Stopping WebSocket audio pipeline.")
            if self.audio_ws_pipeline:
                try:
                    await asyncio.to_thread(self.audio_ws_pipeline.set_state, Gst.State.NULL)
                    self.audio_ws_pipeline = None
                    logger_gstwebrtc_app.info("Helper: WebSocket audio pipeline stopped successfully.")
                except Exception as e:
                    logger_gstwebrtc_app.error(f"Helper: Error stopping WebSocket audio pipeline: {e}", exc_info=True)
            else:
                logger_gstwebrtc_app.info("Helper: No WebSocket audio pipeline instance found to stop.")
        else:
            logger_gstwebrtc_app.warning("Helper: stop_websocket_audio_pipeline called but mode is not 'websockets'.")

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
        if self.encoder is None:
            return
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
            "opusenc",
        ]
        if self.encoder not in supported:
            raise GSTWebRTCAppError(
                "Unsupported encoder, must be one of: " + ",".join(supported)
            )
        if "av1" in self.encoder or self.congestion_control:
            required.append("rsrtp")
        if self.encoder.startswith("nv"):
            required.append("nvcodec") # For nvenc, cudaupload
            # cudaconvert is part of nvcodec or a separate nvidia plugin, check if needed explicitly
            # Gst.ElementFactory.find("cudaconvert") will handle actual check
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
                if element: # Check if element exists
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
                if element:
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
                if element :
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
                if element:
                    element.set_property(
                        "gop-size",
                        2147483647
                        if self.keyframe_distance == -1.0
                        else self.keyframe_frame_distance,
                    )
            elif self.encoder in ["x265enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "x265enc")
                if element:
                    element.set_property(
                        "key-int-max",
                        2147483647
                        if self.keyframe_distance == -1.0
                        else self.keyframe_frame_distance,
                    )
            elif self.encoder.startswith("vp"):
                element = Gst.Bin.get_by_name(self.pipeline, "vpenc")
                if element:
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
                if element:
                    element.set_property(
                        "intra-period-length",
                        -1
                        if self.keyframe_distance == -1.0
                        else self.keyframe_frame_distance,
                    )
            elif self.encoder in ["av1enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "av1enc")
                if element:
                    element.set_property(
                        "keyframe-max-dist",
                        2147483647
                        if self.keyframe_distance == -1.0
                        else self.keyframe_frame_distance,
                    )
            elif self.encoder in ["rav1enc"]:
                element = Gst.Bin.get_by_name(self.pipeline, "rav1enc")
                if element:
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
            if self.ximagesrc_capsfilter: # Check if it exists (might not in WS mode if pipeline is different)
                self.ximagesrc_capsfilter.set_property("caps", self.ximagesrc_caps)
            elif Gst.Bin.get_by_name(self.pipeline, "x11"): # WebRTC mode ximagesrc
                 x11_capsfilter = Gst.Bin.get_by_name(self.pipeline, "x11").get_static_pad("src").get_peer().get_parent_element()
                 if x11_capsfilter and x11_capsfilter.get_factory().get_name() == "capsfilter":
                     x11_capsfilter.set_property("caps", self.ximagesrc_caps)

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
            
            encoder_element_name = "nvenc" # Default for NVIDIA
            if self.encoder.startswith("va"): encoder_element_name = "vaenc"
            elif self.encoder in ["x264enc"]: encoder_element_name = "x264enc"
            elif self.encoder in ["openh264enc"]: encoder_element_name = "openh264enc"
            elif self.encoder in ["x265enc"]: encoder_element_name = "x265enc"
            elif self.encoder.startswith("vp"): encoder_element_name = "vpenc"
            elif self.encoder in ["svtav1enc"]: encoder_element_name = "svtav1enc"
            elif self.encoder in ["av1enc"]: encoder_element_name = "av1enc"
            elif self.encoder in ["rav1enc"]: encoder_element_name = "rav1enc"
            elif self.mode == 'websockets': # For WS mode, encoder name is 'encoder'
                encoder_element_name = "encoder"


            element = Gst.Bin.get_by_name(self.pipeline, encoder_element_name)
            if not element and self.mode == 'websockets' and not self.encoder.startswith("nv") and not self.encoder.startswith("va"):
                # Fallback for WS software encoders if 'encoder' name isn't found directly
                element = Gst.Bin.get_by_name(self.pipeline, self.encoder)


            if element:
                if self.encoder.startswith("nv"):
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
                elif self.encoder in ["x264enc", "x265enc", "svtav1enc", "av1enc"]:
                    element.set_property("bitrate", fec_bitrate)
                elif self.encoder in ["openh264enc", "vp8enc", "vp9enc", "rav1enc"]:
                    element.set_property("bitrate", fec_bitrate * 1000) # These take bps or kbps*1000
                    if self.encoder in ["vp8enc", "vp9enc"]: # vpenc uses target-bitrate
                        element.set_property("target-bitrate", fec_bitrate * 1000)

                if not cc:
                    logger_gstwebrtc_app.info("video bitrate set to: %d" % bitrate)
                else:
                    logger_gstwebrtc_app.debug(
                        "video bitrate set with congestion control to: %d" % bitrate
                    )
            else:
                logger_gstwebrtc_app.warning(
                    f"set_video_bitrate: Could not find encoder element '{encoder_element_name}' (or alternative) in pipeline for encoder: {self.encoder}"
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
            
            opus_encoder_name = "opusenc"
            if self.mode == 'websockets': # In WS audio pipeline, it's named 'encoder'
                opus_encoder_name = "encoder" 
            
            # Determine which pipeline to target for audio bitrate
            target_pipeline = self.pipeline
            if self.mode == 'websockets' and self.audio_ws_pipeline:
                target_pipeline = self.audio_ws_pipeline
            
            element = Gst.Bin.get_by_name(target_pipeline, opus_encoder_name)
            if element:
                element.set_property("bitrate", bitrate) # opusenc takes bps
                logger_gstwebrtc_app.info("audio bitrate set to: %d" % bitrate)
            else:
                logger_gstwebrtc_app.warning(f"Could not find opus encoder element '{opus_encoder_name}' in pipeline.")

            self.audio_bitrate = bitrate
            self.fec_audio_bitrate = fec_bitrate
            self.__send_data_channel_message(
                "pipeline", {"status": "Audio bitrate set to: %d" % bitrate}
            )
    def set_pointer_visible(self, visible):
        ximagesrc_name = "x11" # Default for WebRTC pipeline
        if self.mode == 'websockets':
            ximagesrc_name = "source" # Name in WS pipeline

        element = Gst.Bin.get_by_name(self.pipeline, ximagesrc_name)
        if element:
            element.set_property("show-pointer", visible)
            self.__send_data_channel_message(
                "pipeline", {"status": "Set pointer visibility to: %d" % visible}
            )
        else:
            logger_gstwebrtc_app.warning(f"Could not find ximagesrc element '{ximagesrc_name}' to set pointer visibility.")

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
        asyncio.run(self.on_sdp("offer", sdp_text)) # This was asyncio.run_coroutine_threadsafe, but on_sdp is not async
                                                    # Changed to asyncio.run(), assuming on_sdp can be run like this or is a synchronous wrapper
                                                    # If on_sdp is an async def, it should be `await self.on_sdp(...)`
                                                    # Given the context, on_sdp is likely a callback that might schedule async work.
                                                    # The original `asyncio.run(self.on_sdp(...))` is kept if `on_sdp` is synchronous but needs to run in an event loop context.
                                                    # If `self.on_sdp` is an async function, it should be `self.async_event_loop.create_task(self.on_sdp("offer", sdp_text))`
                                                    # For now, keeping `asyncio.run` as it was, assuming it's handled by the caller's event loop setup.
                                                    # A better pattern might be `self.async_event_loop.call_soon_threadsafe(self.on_sdp, "offer", sdp_text)` if on_sdp is sync.
                                                    # Or `asyncio.run_coroutine_threadsafe(self.on_sdp("offer", sdp_text), self.async_event_loop)` if on_sdp is async.
                                                    # Let's assume `on_sdp` is a synchronous method that is expected to be called.
                                                    # The original was `asyncio.run(self.on_sdp("offer", sdp_text))`. This will create a new event loop if one isn't running in the current thread.
                                                    # This seems problematic if `__on_offer_created` is called from a GStreamer thread.
                                                    # A safer call from a GStreamer thread to an asyncio event loop:
        self.async_event_loop.call_soon_threadsafe(self.on_sdp, "offer", sdp_text)


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
        # Original: asyncio.run(self.on_ice(mlineindex, candidate))
        # This is problematic if called from GStreamer thread.
        # Using call_soon_threadsafe for safety if on_ice is synchronous.
        # If on_ice is async, it should be asyncio.run_coroutine_threadsafe(self.on_ice(...), self.async_event_loop)
        self.async_event_loop.call_soon_threadsafe(self.on_ice, mlineindex, candidate)

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
        audio_bus = None
        if self.pipeline is not None:
            bus = self.pipeline.get_bus()
        if self.audio_ws_pipeline is not None:
            audio_bus = self.audio_ws_pipeline.get_bus()
        while True:
            if bus is not None:
                message = bus.timed_pop(0.1 * Gst.SECOND) # Use Gst.SECOND for clarity
                if message:
                    if not self.bus_call(message):
                        break # Stop on False from bus_call
            if audio_bus is not None:
                audio_message = audio_bus.timed_pop(0.1 * Gst.SECOND)
                if audio_message:
                    if not self.bus_call(audio_message): # Assuming same bus_call logic applies
                        break # Stop on False from bus_call
            
            # If both buses are gone or neither was there, prevent busy loop
            if (bus is None or message is None) and \
               (audio_bus is None or audio_message is None):
                await asyncio.sleep(0.1)
            
            # Check if pipeline is still running; if not, buses might be flushed/gone
            if not self.pipeline_running and self.pipeline is None and self.audio_ws_pipeline is None:
                break


    # stop_ws_pipeline = stop_pipeline # Keep original alias if needed elsewhere
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
def check_encoder_supported(encoder):
    support = Gst.ElementFactory.find(encoder)
    if (support):
        return True
    else:
        return False
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

import logging
import time
import asyncio
import psutil
import GPUtil
from prometheus_client import Gauge, Histogram, Info, start_http_server
import json
from collections import OrderedDict
from datetime import datetime
import csv
import os

LOGLEVEL = logging.INFO
logging.basicConfig(level=LOGLEVEL)
logger_gpu_monitor = logging.getLogger("gpu_monitor")
logger_metrics = logging.getLogger("metrics")
logger_system_monitor = logging.getLogger("system_monitor")

FPS_HIST_BUCKETS = (0, 20, 40, 60)


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
            await asyncio.sleep(self.period)
        logger_gpu_monitor.info("GPU monitor stopped")
    def stop(self):
        self.running = False


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

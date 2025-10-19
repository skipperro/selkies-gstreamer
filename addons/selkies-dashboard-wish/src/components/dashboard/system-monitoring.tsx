import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { useEffect, useState } from "react";

// Declare global window properties
declare global {
	interface Window {
		system_stats?: {
			cpu_percent?: number;
			mem_used?: number;
			mem_total?: number;
		};
		gpu_stats?: {
			gpu_percent?: number;
			utilization_gpu?: number;
			mem_used?: number;
			memory_used?: number;
			used_gpu_memory_bytes?: number;
			mem_total?: number;
			memory_total?: number;
			total_gpu_memory_bytes?: number;
		};
		fps?: number;
		currentAudioBufferSize?: number;
		network_stats?: {
			bandwidth_mbps?: number;
			latency_ms?: number;
		};
	}
}

interface RadialGaugeProps {
	metric: {
		name: string;
		current: number;
		max: number;
		fill: string;
	};
	size: number;
}

function RadialGauge({ metric, size }: RadialGaugeProps) {
	const percentage = (metric.current / metric.max) * 100;
	const scaleFactor = size / 100;

	return (
		<div
			className="flex flex-col items-center"
			style={{
				width: size * 0.6,
				height: size * 0.7,
				minHeight: "60px",
			}}
		>
			<div style={{ width: size * 0.8, height: size * 0.7 }}>
				<RadialBarChart
					width={size * 0.8}
					height={size * 0.7}
					cx={(size * 0.8) / 2}
					cy={(size * 0.7) / 2}
					innerRadius={20 * scaleFactor}
					outerRadius={30 * scaleFactor}
					barSize={4 * scaleFactor}
					data={[{ ...metric, percentage }]}
					startAngle={180}
					endAngle={0}
				>
					<PolarAngleAxis
						type="number"
						domain={[0, 100]}
						angleAxisId={0}
						tick={false}
					/>
					<RadialBar
						background
						dataKey="percentage"
						cornerRadius={5 * scaleFactor}
						fill={metric.fill}
						className="stroke-transparent stroke-2"
					/>
					<text
						x={(size * 0.8) / 2}
						y={(size * 0.7) / 2}
						textAnchor="middle"
						dominantBaseline="middle"
						className="fill-foreground font-bold"
						style={{ fontSize: `${0.9 * scaleFactor}rem` }}
					>
						{metric.current}
					</text>
					<text
						x={(size * 0.8) / 2}
						y={(size * 0.7) / 2 + 18 * scaleFactor}
						textAnchor="middle"
						dominantBaseline="middle"
						className="fill-muted-foreground font-medium"
						style={{ fontSize: `${0.65 * scaleFactor}rem` }}
					>
						{metric.name}
					</text>
				</RadialBarChart>
			</div>
		</div>
	);
}

interface SystemMonitoringProps {
	scale?: number;
}

const STATS_READ_INTERVAL_MS = 100;
const MAX_AUDIO_BUFFER = 10;
const MAX_BANDWIDTH_MBPS = 1000;
const MAX_LATENCY_MS = 1000;

export function SystemMonitoring({ scale = 1 }: SystemMonitoringProps) {
	const [clientFps, setClientFps] = useState(0);
	const [audioBuffer, setAudioBuffer] = useState(0);
	const [cpuPercent, setCpuPercent] = useState(0);
	const [gpuPercent, setGpuPercent] = useState(0);
	const [sysMemPercent, setSysMemPercent] = useState(0);
	const [gpuMemPercent, setGpuMemPercent] = useState(0);
	const [sysMemUsed, setSysMemUsed] = useState<number | null>(null);
	const [sysMemTotal, setSysMemTotal] = useState<number | null>(null);
	const [gpuMemUsed, setGpuMemUsed] = useState<number | null>(null);
	const [gpuMemTotal, setGpuMemTotal] = useState<number | null>(null);
	const [bandwidthMbps, setBandwidthMbps] = useState(0);
	const [latencyMs, setLatencyMs] = useState(0);

	// Read stats periodically
	useEffect(() => {
		const readStats = () => {
			const currentSystemStats = window.system_stats;
			const sysMemUsed = currentSystemStats?.mem_used ?? null;
			const sysMemTotal = currentSystemStats?.mem_total ?? null;
			setCpuPercent(currentSystemStats?.cpu_percent ?? 0);
			setSysMemUsed(sysMemUsed);
			setSysMemTotal(sysMemTotal);
			setSysMemPercent((sysMemUsed !== null && sysMemTotal !== null && sysMemTotal > 0) ? (sysMemUsed / sysMemTotal) * 100 : 0);

			const currentGpuStats = window.gpu_stats;
			const gpuPercent = currentGpuStats?.gpu_percent ?? currentGpuStats?.utilization_gpu ?? 0;
			setGpuPercent(gpuPercent);
			const gpuMemUsed = currentGpuStats?.mem_used ?? currentGpuStats?.memory_used ?? currentGpuStats?.used_gpu_memory_bytes ?? null;
			const gpuMemTotal = currentGpuStats?.mem_total ?? currentGpuStats?.memory_total ?? currentGpuStats?.total_gpu_memory_bytes ?? null;
			setGpuMemUsed(gpuMemUsed);
			setGpuMemTotal(gpuMemTotal);
			setGpuMemPercent((gpuMemUsed !== null && gpuMemTotal !== null && gpuMemTotal > 0) ? (gpuMemUsed / gpuMemTotal) * 100 : 0);

			setClientFps(window.fps ?? 0);
			setAudioBuffer(window.currentAudioBufferSize ?? 0);

			const netStats = window.network_stats;
			setBandwidthMbps(netStats?.bandwidth_mbps ?? 0);
			setLatencyMs(netStats?.latency_ms ?? 0);
		};
		const intervalId = setInterval(readStats, STATS_READ_INTERVAL_MS);
		return () => clearInterval(intervalId);
	}, []);

	const metrics = [
		{
			name: "CPU",
			current: Math.round(cpuPercent),
			max: 100,
			fill: "hsl(250, 100%, 70%)"
		},
		{
			name: "GPU Usage",
			current: Math.round(gpuPercent),
			max: 100,
			fill: "hsl(260, 100%, 60%)"
		},
		{
			name: "Sys Mem",
			current: Math.round(sysMemPercent),
			max: 100,
			fill: "hsl(240, 100%, 80%)"
		},
		{
			name: "GPU Mem",
			current: Math.round(gpuMemPercent),
			max: 100,
			fill: "hsl(240, 100%, 80%)"
		},
		{
			name: "FPS",
			current: Math.round(clientFps),
			max: 60,
			fill: "hsl(220, 100%, 60%)"
		},
		{
			name: "Audio",
			current: audioBuffer,
			max: MAX_AUDIO_BUFFER,
			fill: "hsl(230, 100%, 70%)"
		},
		{
			name: "Bandwidth",
			current: Math.round(bandwidthMbps * 100) / 100,
			max: MAX_BANDWIDTH_MBPS,
			fill: "hsl(200, 100%, 60%)"
		},
		{
			name: "Latency",
			current: Math.round(latencyMs * 10) / 10,
			max: MAX_LATENCY_MS,
			fill: "hsl(180, 100%, 60%)"
		}
	];

	return (
		<Card className="w-full bg-background/95 backdrop-blur-sm border shadow-sm">
			<CardContent>
				<div className="grid grid-flow-col auto-cols-max gap-2">
					{metrics.map((metric) => (
						<RadialGauge
							key={metric.name}
							metric={{
								...metric,
								fill: metric.name === "CPU" ? "hsl(250, 100%, 60%)" :
									metric.name === "GPU Usage" ? "hsl(260, 100%, 50%)" :
										metric.name === "Sys Mem" ? "hsl(240, 100%, 60%)" :
											metric.name === "GPU Mem" ? "hsl(240, 100%, 60%)" :
												metric.name === "FPS" ? "hsl(220, 100%, 50%)" :
													metric.name === "Audio" ? "hsl(230, 100%, 60%)" :
														metric.name === "Bandwidth" ? "hsl(200, 100%, 60%)" :
															"hsl(180, 100%, 60%)"
							}}
							size={100}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export default SystemMonitoring;

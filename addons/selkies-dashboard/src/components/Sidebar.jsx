// src/components/Sidebar.jsx
import React, { useState, useEffect } from 'react';

// Define the options for the dropdowns/sliders
const encoderOptions = [
    'x264enc',
    'nvh264enc',
    'vah264enc',
    'openh264enc'
];

const framerateOptions = [
    8, 12, 15, 24, 25, 30, 48, 50, 60, 90, 100, 120, 144
];

const videoBitrateOptions = [
    1000, 2000, 4000, 8000, 10000, 12000, 14000, 16000, 18000, 20000,
    25000, 30000, 35000, 40000, 45000, 50000,
    60000, 70000, 80000, 90000, 100000
];

const audioBitrateOptions = [
    32000, 64000, 96000, 128000, 192000, 256000, 320000, 512000
];

// Video buffer size goes from 0 to 15
const videoBufferOptions = Array.from({ length: 16 }, (_, i) => i);

const STATS_READ_INTERVAL_MS = 100;

const MAX_AUDIO_BUFFER = 10; // Max value for the Audio Buffer gauge

// Helper function to format bytes into a human-readable string (e.g., GB, MB)
function formatBytes(bytes, decimals = 2) {
    if (bytes === null || bytes === undefined || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper function to calculate gauge stroke offset based on percentage
const calculateGaugeOffset = (percentage, radius, circumference) => {
    const clampedPercentage = Math.max(0, Math.min(100, percentage || 0));
    return circumference * (1 - clampedPercentage / 100);
};


function Sidebar({ isOpen }) {
  // Read theme from localStorage, default to 'dark'
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // Initialize settings by reading from localStorage if available, otherwise use defaults
  const [encoder, setEncoder] = useState(localStorage.getItem('encoder') || encoderOptions[0]);
  const [framerate, setFramerate] = useState(parseInt(localStorage.getItem('videoFramerate'), 10) || framerateOptions[0]);
  const [videoBitRate, setVideoBitRate] = useState(parseInt(localStorage.getItem('videoBitRate'), 10) || videoBitrateOptions[0]);
  const [audioBitRate, setAudioBitRate] = useState(parseInt(localStorage.getItem('audioBitRate'), 10) || audioBitrateOptions[0]);
  const [videoBufferSize, setVideoBufferSize] = useState(parseInt(localStorage.getItem('videoBufferSize'), 10) || videoBufferOptions[0]);

  // State variables for specific stats needed for display (Gauges and Text)
  const [clientFps, setClientFps] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState(0);

  // State variables for gauge percentages
  const [cpuPercent, setCpuPercent] = useState(0);
  const [gpuPercent, setGpuPercent] = useState(0);
  const [sysMemPercent, setSysMemPercent] = useState(0);
  const [gpuMemPercent, setGpuMemPercent] = useState(0);

  // State variables for raw memory values (for Tooltips)
  const [sysMemUsed, setSysMemUsed] = useState(null);
  const [sysMemTotal, setSysMemTotal] = useState(null);
  const [gpuMemUsed, setGpuMemUsed] = useState(null);
  const [gpuMemTotal, setGpuMemTotal] = useState(null);

  // Tooltip state
  const [hoveredItem, setHoveredItem] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });


  const handleEncoderChange = (event) => {
    const selectedEncoder = event.target.value;
    setEncoder(selectedEncoder);
    localStorage.setItem('encoder', selectedEncoder); // Save to localStorage
    window.postMessage({ type: 'settings', settings: { encoder: selectedEncoder } }, window.location.origin);
  };

  // Slider handlers: Get index from event, look up value in options, update state with value
  const handleFramerateChange = (event) => {
    const index = parseInt(event.target.value, 10);
    const selectedFramerate = framerateOptions[index]; // Get value from index
    if (selectedFramerate !== undefined) { // Ensure index is valid
      setFramerate(selectedFramerate);
      localStorage.setItem('videoFramerate', selectedFramerate.toString()); // Save to localStorage
      window.postMessage({ type: 'settings', settings: { videoFramerate: selectedFramerate } }, window.location.origin);
    }
  };

  const handleVideoBitrateChange = (event) => {
     const index = parseInt(event.target.value, 10);
     const selectedBitrate = videoBitrateOptions[index]; // Get value from index
     if (selectedBitrate !== undefined) { // Ensure index is valid
       setVideoBitRate(selectedBitrate);
       localStorage.setItem('videoBitRate', selectedBitrate.toString()); // Save to localStorage
       window.postMessage({ type: 'settings', settings: { videoBitRate: selectedBitrate } }, window.location.origin);
     }
  };

  const handleAudioBitrateChange = (event) => {
     const index = parseInt(event.target.value, 10);
     const selectedBitrate = audioBitrateOptions[index]; // Get value from index
     if (selectedBitrate !== undefined) { // Ensure index is valid
       setAudioBitRate(selectedBitrate);
       localStorage.setItem('audioBitRate', selectedBitrate.toString()); // Save to localStorage
       window.postMessage({ type: 'settings', settings: { audioBitRate: selectedBitrate } }, window.location.origin);
     }
  };

  const handleVideoBufferSizeChange = (event) => {
     const index = parseInt(event.target.value, 10);
     const selectedSize = videoBufferOptions[index]; // Get value from index
     if (selectedSize !== undefined) { // Ensure index is valid
       setVideoBufferSize(selectedSize);
       localStorage.setItem('videoBufferSize', selectedSize.toString()); // Save to localStorage
       // Send message for video buffer size
       window.postMessage({ type: 'settings', settings: { videoBufferSize: selectedSize } }, window.location.origin);
     }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme); // Save preference
  };


  // Effect for syncing initial settings from localStorage
  useEffect(() => {
    const savedEncoder = localStorage.getItem('encoder');
    if (savedEncoder && encoderOptions.includes(savedEncoder)) {
        setEncoder(savedEncoder);
    }

    const savedFramerate = parseInt(localStorage.getItem('videoFramerate'), 10);
    // Check if saved value is in options array
    if (!isNaN(savedFramerate) && framerateOptions.includes(savedFramerate)) {
        setFramerate(savedFramerate);
    } else {
        // If not found or invalid, reset to default and save default
        setFramerate(framerateOptions[0]);
        localStorage.setItem('videoFramerate', framerateOptions[0].toString());
    }

    const savedVideoBitRate = parseInt(localStorage.getItem('videoBitRate'), 10);
    // Check if saved value is in options array
     if (!isNaN(savedVideoBitRate) && videoBitrateOptions.includes(savedVideoBitRate)) {
         setVideoBitRate(savedVideoBitRate);
     } else {
        // If not found or invalid, reset to default and save default
        setVideoBitRate(videoBitrateOptions[0]);
        localStorage.setItem('videoBitRate', videoBitrateOptions[0].toString());
     }

    const savedAudioBitRate = parseInt(localStorage.getItem('audioBitRate'), 10);
    // Check if saved value is in options array
     if (!isNaN(savedAudioBitRate) && audioBitrateOptions.includes(savedAudioBitRate)) {
         setAudioBitRate(savedAudioBitRate);
     } else {
        // If not found or invalid, reset to default and save default
        setAudioBitRate(audioBitrateOptions[0]);
        localStorage.setItem('audioBitRate', audioBitrateOptions[0].toString());
     }

    const savedVideoBufferSize = parseInt(localStorage.getItem('videoBufferSize'), 10);
    // Check if saved value is in options array
     if (!isNaN(savedVideoBufferSize) && videoBufferOptions.includes(savedVideoBufferSize)) {
         setVideoBufferSize(savedVideoBufferSize);
     } else {
        // If not found or invalid, reset to default and save default
        setVideoBufferSize(videoBufferOptions[0]);
        localStorage.setItem('videoBufferSize', videoBufferOptions[0].toString());
     }
  }, []); // Runs once on mount


  // Effect for periodically reading stats from window globals
  useEffect(() => {
    const readStats = () => {
        // Read global variables directly from the window object
        // Use optional chaining (?.) and nullish coalescing (??) for safety

        // System Stats
        const currentSystemStats = window.system_stats;
        const sysMemUsed = currentSystemStats?.mem_used ?? null;
        const sysMemTotal = currentSystemStats?.mem_total ?? null;

        setCpuPercent(currentSystemStats?.cpu_percent ?? 0);
        setSysMemUsed(sysMemUsed); // Store raw for tooltip
        setSysMemTotal(sysMemTotal); // Store raw for tooltip

        // Calculate System Memory Percentage
        if (sysMemUsed !== null && sysMemTotal !== null && sysMemTotal > 0) {
            setSysMemPercent((sysMemUsed / sysMemTotal) * 100);
        } else {
            setSysMemPercent(0);
        }

        // GPU Stats
        const currentGpuStats = window.gpu_stats;
        const gpuPercent = currentGpuStats?.gpu_percent ?? currentGpuStats?.utilization_gpu ?? 0;
        setGpuPercent(gpuPercent);

        const gpuMemUsed = currentGpuStats?.mem_used ?? currentGpuStats?.memory_used ?? currentGpuStats?.used_gpu_memory_bytes ?? null;
        const gpuMemTotal = currentGpuStats?.mem_total ?? currentGpuStats?.memory_total ?? currentGpuStats?.total_gpu_memory_bytes ?? null;

        setGpuMemUsed(gpuMemUsed); // Store raw for tooltip
        setGpuMemTotal(gpuMemTotal); // Store raw for tooltip

        // Calculate GPU Memory Percentage
         if (gpuMemUsed !== null && gpuMemTotal !== null && gpuMemTotal > 0) {
             setGpuMemPercent((gpuMemUsed / gpuMemTotal) * 100);
         } else {
             setGpuMemPercent(0);
         }

        // Simple values (Store raw for Gauge text and Tooltips)
        setClientFps(window.fps ?? 0);
        setAudioBuffer(window.currentAudioBufferSize ?? 0);
    };

    const intervalId = setInterval(readStats, STATS_READ_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []); // Runs once on mount and cleans up on unmount


  // Tooltip Handlers
  const handleMouseEnter = (e, itemKey) => {
      setHoveredItem(itemKey);
      // Position tooltip slightly offset from the mouse cursor
      setTooltipPosition({ x: e.clientX + 10, y: e.clientY + 10 });
  };

  const handleMouseLeave = () => {
      setHoveredItem(null);
  };

  // Get Tooltip Content
  const getTooltipContent = (itemKey) => {
      switch (itemKey) {
          case 'cpu':
              return `CPU Usage: ${cpuPercent.toFixed(1)}%`;
          case 'gpu':
              return `GPU Usage: ${gpuPercent.toFixed(1)}%`;
          case 'sysmem':
               return `System Memory: ${sysMemUsed !== null && sysMemTotal !== null ? `${formatBytes(sysMemUsed)} / ${formatBytes(sysMemTotal)}` : 'N/A'}`;
          case 'gpumem':
              return `GPU Memory: ${gpuMemUsed !== null && gpuMemTotal !== null ? `${formatBytes(gpuMemUsed)} / ${formatBytes(gpuMemTotal)}` : 'N/A'}`;
          case 'fps':
              // Tooltip shows raw FPS value
              return `Client FPS: ${clientFps}`;
          case 'audio':
              // Tooltip shows raw Audio Buffer value
              return `Audio Buffers: ${audioBuffer}`;
          default:
              return '';
      }
  };

  // Combine base classes with open state and theme state
  const sidebarClasses = `sidebar ${isOpen ? 'is-open' : ''} theme-${theme}`;

  // Gauge Calculation
  const gaugeSize = 80;
  const gaugeStrokeWidth = 8;
  const gaugeRadius = (gaugeSize / 2) - (gaugeStrokeWidth / 2);
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeCenter = gaugeSize / 2;

  // Calculate offsets for gauges based on percentage 0-100
  const cpuOffset = calculateGaugeOffset(cpuPercent, gaugeRadius, gaugeCircumference);
  const gpuOffset = calculateGaugeOffset(gpuPercent, gaugeRadius, gaugeCircumference);
  const sysMemOffset = calculateGaugeOffset(sysMemPercent, gaugeRadius, gaugeCircumference);
  const gpuMemOffset = calculateGaugeOffset(gpuMemPercent, gaugeRadius, gaugeCircumference);

  // Calculate offsets for gauges based on custom max values
  // FPS Gauge: Percentage relative to current target framerate
  const fpsPercent = Math.min(100, (clientFps / framerate) * 100);
  const fpsOffset = calculateGaugeOffset(fpsPercent, gaugeRadius, gaugeCircumference);

  // Audio Buffer Gauge: Percentage relative to MAX_AUDIO_BUFFER (10)
  const audioBufferPercent = Math.min(100, (audioBuffer / MAX_AUDIO_BUFFER) * 100);
  const audioBufferOffset = calculateGaugeOffset(audioBufferPercent, gaugeRadius, gaugeCircumference);


  return (
    // Use a wrapper div that can contain the sidebar and the tooltip
    <>
      <div className={sidebarClasses}>
        <div className="sidebar-header">
           <h2>Selkies</h2>
           {/* Theme Toggle Button */}
           <div className={`theme-toggle ${theme}`} onClick={toggleTheme}>
             {/* Moon Icon (for Dark Mode) */}
             <svg className="icon moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
             </svg>
             {/* Sun Icon (for Light Mode) */}
             <svg className="icon sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <circle cx="12" cy="12" r="5"></circle>
                 <line x1="12" y1="1" x2="12" y2="3"></line>
                 <line x1="12" y1="21" x2="12" y2="23"></line>
                 <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                 <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                 <line x1="1" y1="12" x2="3" y2="12"></line>
                 <line x1="21" y1="12" x2="23" y2="12"></line>
                 <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                 <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
             </svg>
           </div>
        </div>

        <div className="sidebar-section">
            <h3>Stream Settings</h3>

            {/* Encoder Dropdown */}
            <div className="dev-setting-item">
              <label htmlFor="encoderSelect">Encoder:</label>
              <select id="encoderSelect" value={encoder} onChange={handleEncoderChange}>
                {encoderOptions.map(enc => (
                  <option key={enc} value={enc}>{enc}</option>
                ))}
              </select>
            </div>

            {/* Framerate Slider */}
             <div className="dev-setting-item">
              <label htmlFor="framerateSlider">Frames per second ({framerate} FPS):</label>
                <input
                  type="range"
                  id="framerateSlider"
                  min="0" // Slider value represents index
                  max={framerateOptions.length - 1}
                  step="1"
                  value={framerateOptions.indexOf(framerate)} // Slider value is index of current framerate
                  onChange={handleFramerateChange}
                />
            </div>

            {/* Video Bitrate Slider */}
            <div className="dev-setting-item">
              <label htmlFor="videoBitrateSlider">Video Bitrate ({videoBitRate} kbit/s):</label>
                <input
                  type="range"
                  id="videoBitrateSlider"
                  min="0" // Slider value represents index
                  max={videoBitrateOptions.length - 1}
                  step="1"
                  value={videoBitrateOptions.indexOf(videoBitRate)} // Slider value is index of current bitrate
                  onChange={handleVideoBitrateChange}
                />
            </div>

            {/* Audio Bitrate Slider */}
            <div className="dev-setting-item">
              <label htmlFor="audioBitrateSlider">Audio Bitrate ({audioBitRate} kbit/s):</label>
                <input
                  type="range"
                  id="audioBitrateSlider"
                  min="0" // Slider value represents index
                  max={audioBitrateOptions.length - 1}
                  step="1"
                  value={audioBitrateOptions.indexOf(audioBitRate)} // Slider value is index of current bitrate
                  onChange={handleAudioBitrateChange}
                />
            </div>

            {/* Video Buffer Size Slider */}
             <div className="dev-setting-item">
              <label htmlFor="videoBufferSizeSlider">
                Video Buffer Size ({videoBufferSize === 0 ? '0 (Immediate)' : `${videoBufferSize} frames`}):
              </label>
                <input
                  type="range"
                  id="videoBufferSizeSlider"
                  min="0" // Slider value represents index
                  max={videoBufferOptions.length - 1}
                  step="1"
                  value={videoBufferOptions.indexOf(videoBufferSize)} // Slider value is index of current size
                  onChange={handleVideoBufferSizeChange}
                />
            </div>
        </div>


        {/* Stats Section - Gauges */}
        <div className="sidebar-section">
            <h3>Stats</h3>

            <div className="stats-gauges">
               {/* --- Inline CPU Gauge SVG --- */}
               {/* Add mouse event handlers for tooltip */}
               <div className="gauge-container"
                    onMouseEnter={(e) => handleMouseEnter(e, 'cpu')}
                    onMouseLeave={handleMouseLeave}>
                   <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                       {/* Background circle */}
                       <circle
                           stroke="var(--item-border)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                       />
                       {/* Foreground circle (the "fill") */}
                       <circle
                           stroke="var(--sidebar-header-color)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                           transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
                           style={{
                               strokeDasharray: gaugeCircumference,
                               strokeDashoffset: cpuOffset,
                               transition: 'stroke-dashoffset 0.3s ease-in-out',
                               strokeLinecap: 'round',
                           }}
                       />
                       {/* Text in the center */}
                       <text
                           x={gaugeCenter}
                           y={gaugeCenter}
                           textAnchor="middle"
                           dominantBaseline="central"
                           fontSize={`${gaugeSize / 5}px`}
                           fill="var(--sidebar-text)"
                           fontWeight="bold"
                       >
                           {Math.round(Math.max(0, Math.min(100, cpuPercent || 0)))}%
                       </text>
                   </svg>
                   <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>CPU</div>
               </div>

               {/* --- Inline GPU Usage Gauge SVG --- */}
                {/* Add mouse event handlers for tooltip */}
               <div className="gauge-container"
                    onMouseEnter={(e) => handleMouseEnter(e, 'gpu')}
                    onMouseLeave={handleMouseLeave}>
                   <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                       {/* Background circle */}
                       <circle
                           stroke="var(--item-border)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                       />
                       {/* Foreground circle (the "fill") */}
                       <circle
                           stroke="var(--sidebar-header-color)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                           transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
                           style={{
                               strokeDasharray: gaugeCircumference,
                               strokeDashoffset: gpuOffset,
                               transition: 'stroke-dashoffset 0.3s ease-in-out',
                               strokeLinecap: 'round',
                           }}
                       />
                       {/* Text in the center */}
                       <text
                           x={gaugeCenter}
                           y={gaugeCenter}
                           textAnchor="middle"
                           dominantBaseline="central"
                           fontSize={`${gaugeSize / 5}px`}
                           fill="var(--sidebar-text)"
                           fontWeight="bold"
                       >
                           {Math.round(Math.max(0, Math.min(100, gpuPercent || 0)))}%
                       </text>
                   </svg>
                   <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>GPU Usage</div>
               </div>

               {/* --- Inline System Memory Gauge SVG --- */}
                {/* Add mouse event handlers for tooltip */}
                <div className="gauge-container"
                     onMouseEnter={(e) => handleMouseEnter(e, 'sysmem')}
                     onMouseLeave={handleMouseLeave}>
                   <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                       {/* Background circle */}
                       <circle
                           stroke="var(--item-border)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                       />
                       {/* Foreground circle (the "fill") */}
                       <circle
                           stroke="var(--sidebar-header-color)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                           transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
                           style={{
                               strokeDasharray: gaugeCircumference,
                               strokeDashoffset: sysMemOffset,
                               transition: 'stroke-dashoffset 0.3s ease-in-out',
                               strokeLinecap: 'round',
                           }}
                       />
                       {/* Text in the center */}
                       <text
                           x={gaugeCenter}
                           y={gaugeCenter}
                           textAnchor="middle"
                           dominantBaseline="central"
                           fontSize={`${gaugeSize / 5}px`}
                           fill="var(--sidebar-text)"
                           fontWeight="bold"
                       >
                           {Math.round(Math.max(0, Math.min(100, sysMemPercent || 0)))}%
                       </text>
                   </svg>
                   <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>Sys Mem</div>
               </div>

               {/* --- Inline GPU Memory Gauge SVG --- */}
                {/* Add mouse event handlers for tooltip */}
                <div className="gauge-container"
                     onMouseEnter={(e) => handleMouseEnter(e, 'gpumem')}
                     onMouseLeave={handleMouseLeave}>
                   <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                       {/* Background circle */}
                       <circle
                           stroke="var(--item-border)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                       />
                       {/* Foreground circle (the "fill") */}
                       <circle
                           stroke="var(--sidebar-header-color)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                           transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
                           style={{
                               strokeDasharray: gaugeCircumference,
                               strokeDashoffset: gpuMemOffset,
                               transition: 'stroke-dashoffset 0.3s ease-in-out',
                               strokeLinecap: 'round',
                           }}
                       />
                       {/* Text in the center */}
                       <text
                           x={gaugeCenter}
                           y={gaugeCenter}
                           textAnchor="middle"
                           dominantBaseline="central"
                           fontSize={`${gaugeSize / 5}px`}
                           fill="var(--sidebar-text)"
                           fontWeight="bold"
                       >
                           {Math.round(Math.max(0, Math.min(100, gpuMemPercent || 0)))}%
                       </text>
                   </svg>
                   <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>GPU Mem</div>
               </div>

               {/* --- Inline Client FPS Gauge SVG --- */}
                {/* Add mouse event handlers for tooltip */}
                <div className="gauge-container"
                     onMouseEnter={(e) => handleMouseEnter(e, 'fps')}
                     onMouseLeave={handleMouseLeave}>
                   <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                       {/* Background circle */}
                       <circle
                           stroke="var(--item-border)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                       />
                       {/* Foreground circle (the "fill") */}
                       <circle
                           stroke="var(--sidebar-header-color)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                           transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
                           style={{
                               strokeDasharray: gaugeCircumference,
                               strokeDashoffset: fpsOffset,
                               transition: 'stroke-dashoffset 0.3s ease-in-out',
                               strokeLinecap: 'round',
                           }}
                       />
                       {/* Text in the center */}
                       <text
                           x={gaugeCenter}
                           y={gaugeCenter}
                           textAnchor="middle"
                           dominantBaseline="central"
                           fontSize={`${gaugeSize / 5}px`}
                           fill="var(--sidebar-text)"
                           fontWeight="bold"
                       >
                           {/* Display the raw FPS value */}
                           {clientFps}
                       </text>
                   </svg>
                   <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>FPS</div>
               </div>

               {/* --- Inline Audio Buffer Gauge SVG --- */}
                {/* Add mouse event handlers for tooltip */}
                <div className="gauge-container"
                     onMouseEnter={(e) => handleMouseEnter(e, 'audio')}
                     onMouseLeave={handleMouseLeave}>
                   <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                       {/* Background circle */}
                       <circle
                           stroke="var(--item-border)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                       />
                       {/* Foreground circle (the "fill") */}
                       <circle
                           stroke="var(--sidebar-header-color)"
                           fill="transparent"
                           strokeWidth={gaugeStrokeWidth}
                           r={gaugeRadius}
                           cx={gaugeCenter}
                           cy={gaugeCenter}
                           transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
                           style={{
                               strokeDasharray: gaugeCircumference,
                               strokeDashoffset: audioBufferOffset,
                               transition: 'stroke-dashoffset 0.3s ease-in-out',
                               strokeLinecap: 'round',
                           }}
                       />
                       {/* Text in the center */}
                       <text
                           x={gaugeCenter}
                           y={gaugeCenter}
                           textAnchor="middle"
                           dominantBaseline="central"
                           fontSize={`${gaugeSize / 5}px`}
                           fill="var(--sidebar-text)"
                           fontWeight="bold"
                       >
                           {/* Display the raw Audio Buffer value */}
                           {audioBuffer}
                       </text>
                   </svg>
                   <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>Audio</div>
               </div>
            </div>
        </div>
      </div>

      {/* --- Tooltip Element --- */}
      {/* Render the tooltip only when an item is hovered */}
      {hoveredItem && (
          <div className="gauge-tooltip" style={{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }}>
              {getTooltipContent(hoveredItem)}
          </div>
      )}
    </>
  );
}

export default Sidebar;

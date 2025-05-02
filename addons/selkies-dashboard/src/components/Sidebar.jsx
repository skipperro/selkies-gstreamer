// src/components/Sidebar.jsx
import React, { useState, useEffect, useCallback } from 'react';
import GamepadVisualizer from './GamepadVisualizer';

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

// --- Default Settings Values ---
const DEFAULT_FRAMERATE = 60;
const DEFAULT_VIDEO_BITRATE = 8000;
const DEFAULT_AUDIO_BITRATE = 320000;
const DEFAULT_VIDEO_BUFFER_SIZE = 0;
const DEFAULT_ENCODER = encoderOptions[0];

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

const ScreenIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
    </svg>
);

const SpeakerIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
);

const MicrophoneIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
    </svg>
);

const GamepadIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M15 7.5V2H9v5.5l3 3 3-3zM7.5 9H2v6h5.5l3-3-3-3zM9 16.5V22h6v-5.5l-3-3-3 3zM16.5 9l-3 3 3 3H22V9h-5.5z"/>
    </svg>
);

const FullscreenIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
    </svg>
);

const CaretDownIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style={{ display: 'block' }}>
        <path d="M7 10l5 5 5-5H7z"/>
    </svg>
);

const CaretUpIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style={{ display: 'block' }}>
        <path d="M7 14l5-5 5 5H7z"/>
    </svg>
);

const SpinnerIcon = () => (
    <svg width="18" height="18" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg" stroke="currentColor">
        <g fill="none" fillRule="evenodd">
            <g transform="translate(1 1)" strokeWidth="3">
                <circle strokeOpacity=".3" cx="18" cy="18" r="18"/>
                <path d="M36 18c0-9.94-8.06-18-18-18">
                    <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 18 18"
                        to="360 18 18"
                        dur="0.8s"
                        repeatCount="indefinite"/>
                </path>
            </g>
        </g>
    </svg>
);


function Sidebar({ isOpen }) {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  const [encoder, setEncoder] = useState(localStorage.getItem('encoder') || DEFAULT_ENCODER);
  const [framerate, setFramerate] = useState(parseInt(localStorage.getItem('videoFramerate'), 10) || DEFAULT_FRAMERATE);
  const [videoBitRate, setVideoBitRate] = useState(parseInt(localStorage.getItem('videoBitRate'), 10) || DEFAULT_VIDEO_BITRATE);
  const [audioBitRate, setAudioBitRate] = useState(parseInt(localStorage.getItem('audioBitRate'), 10) || DEFAULT_AUDIO_BITRATE);
  const [videoBufferSize, setVideoBufferSize] = useState(parseInt(localStorage.getItem('videoBufferSize'), 10) || DEFAULT_VIDEO_BUFFER_SIZE);

  const [clientFps, setClientFps] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState(0);

  const [cpuPercent, setCpuPercent] = useState(0);
  const [gpuPercent, setGpuPercent] = useState(0);
  const [sysMemPercent, setSysMemPercent] = useState(0);
  const [gpuMemPercent, setGpuMemPercent] = useState(0);

  const [sysMemUsed, setSysMemUsed] = useState(null);
  const [sysMemTotal, setSysMemTotal] = useState(null);
  const [gpuMemUsed, setGpuMemUsed] = useState(null);
  const [gpuMemTotal, setGpuMemTotal] = useState(null);

  const [hoveredItem, setHoveredItem] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const [isVideoActive, setIsVideoActive] = useState(true);
  const [isAudioActive, setIsAudioActive] = useState(true);
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  const [isGamepadEnabled, setIsGamepadEnabled] = useState(true);

  const [dashboardClipboardContent, setDashboardClipboardContent] = useState('');

  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState('default');
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState('default');
  const [isOutputSelectionSupported, setIsOutputSelectionSupported] = useState(false);
  const [audioDeviceError, setAudioDeviceError] = useState(null);
  const [isLoadingAudioDevices, setIsLoadingAudioDevices] = useState(false);

  const [gamepadStates, setGamepadStates] = useState({}); // Stores state like { 0: { buttons: {}, axes: {} }, 1: ... }
  const [hasReceivedGamepadData, setHasReceivedGamepadData] = useState(false); // Flag to show section header

  const [sectionsOpen, setSectionsOpen] = useState({
    settings: false,
    stats: false,
    clipboard: false,
    audioSettings: false,
    gamepads: false,
  });

  const populateAudioDevices = useCallback(async () => {
    console.log("Dashboard: Attempting to populate audio devices...");
    setIsLoadingAudioDevices(true);
    setAudioDeviceError(null);
    setAudioInputDevices([]);
    setAudioOutputDevices([]);

    const supportsSinkId = 'setSinkId' in HTMLMediaElement.prototype;
    setIsOutputSelectionSupported(supportsSinkId);
    console.log("Dashboard: Output device selection supported:", supportsSinkId);

    try {
      console.log("Dashboard: Requesting temporary microphone permission for device listing...");
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(track => track.stop());
      console.log("Dashboard: Temporary permission granted/available.");

      console.log("Dashboard: Enumerating media devices...");
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log("Dashboard: Devices found:", devices);

      const inputs = [];
      const outputs = [];

      devices.forEach(device => {
        if (!device.deviceId) {
          console.warn("Dashboard: Skipping device with missing deviceId:", device);
          return; // Skip device if ID is missing (e.g., communications device placeholder)
        }
        // Use label only if provided, otherwise generate one
        const label = device.label || (device.kind === 'audioinput' ? `Microphone ${inputs.length}` : `Speaker ${outputs.length}`);

        if (device.kind === 'audioinput') {
          inputs.push({ deviceId: device.deviceId, label: label });
        } else if (device.kind === 'audiooutput' && supportsSinkId) {
          outputs.push({ deviceId: device.deviceId, label: label });
        }
      });

      setAudioInputDevices(inputs);
      setAudioOutputDevices(outputs);

      setSelectedInputDeviceId('default');
      setSelectedOutputDeviceId('default');

      console.log(`Dashboard: Populated ${inputs.length -1} specific inputs, ${outputs.length -1} specific outputs.`);

    } catch (err) {
      console.error('Dashboard: Error getting media devices or permissions:', err);
      let userMessage = `Error listing audio devices: ${err.name || 'Unknown error'}`;
      if (err.name === 'NotAllowedError') {
        userMessage = "Permission denied. Please allow microphone access in browser settings to select devices.";
      } else if (err.name === 'NotFoundError') {
        userMessage = "No audio devices found.";
      }
      setAudioDeviceError(userMessage);
    } finally {
      setIsLoadingAudioDevices(false);
    }
  }, []);

  const toggleSection = useCallback((sectionKey) => {
    const isOpening = !sectionsOpen[sectionKey];

    setSectionsOpen(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));

    if (sectionKey === 'audioSettings' && isOpening) {
      populateAudioDevices();
    }
  }, [sectionsOpen, populateAudioDevices]);


  // --- Event Handlers for Settings ---
  const handleEncoderChange = (event) => {
    const selectedEncoder = event.target.value;
    setEncoder(selectedEncoder);
    localStorage.setItem('encoder', selectedEncoder);
    console.log(`Dashboard: Sending postMessage: { type: 'settings', settings: { encoder: ${selectedEncoder} } }`);
    window.postMessage({ type: 'settings', settings: { encoder: selectedEncoder } }, window.location.origin);
  };

  const handleFramerateChange = (event) => {
    const index = parseInt(event.target.value, 10);
    const selectedFramerate = framerateOptions[index];
    if (selectedFramerate !== undefined) {
      setFramerate(selectedFramerate);
      localStorage.setItem('videoFramerate', selectedFramerate.toString());
      console.log(`Dashboard: Sending postMessage: { type: 'settings', settings: { videoFramerate: ${selectedFramerate} } }`);
      window.postMessage({ type: 'settings', settings: { videoFramerate: selectedFramerate } }, window.location.origin);
    }
  };

  const handleVideoBitrateChange = (event) => {
     const index = parseInt(event.target.value, 10);
     const selectedBitrate = videoBitrateOptions[index];
     if (selectedBitrate !== undefined) {
       setVideoBitRate(selectedBitrate);
       localStorage.setItem('videoBitRate', selectedBitrate.toString());
       console.log(`Dashboard: Sending postMessage: { type: 'settings', settings: { videoBitRate: ${selectedBitrate} } }`);
       window.postMessage({ type: 'settings', settings: { videoBitRate: selectedBitrate } }, window.location.origin);
     }
  };

  const handleAudioBitrateChange = (event) => {
     const index = parseInt(event.target.value, 10);
     const selectedBitrate = audioBitrateOptions[index];
     if (selectedBitrate !== undefined) {
       setAudioBitRate(selectedBitrate);
       localStorage.setItem('audioBitRate', selectedBitrate.toString());
       console.log(`Dashboard: Sending postMessage: { type: 'settings', settings: { audioBitRate: ${selectedBitrate} } }`);
       window.postMessage({ type: 'settings', settings: { audioBitRate: selectedBitrate } }, window.location.origin);
     }
  };

  const handleVideoBufferSizeChange = (event) => {
     const index = parseInt(event.target.value, 10);
     const selectedSize = videoBufferOptions[index];
     if (selectedSize !== undefined) {
       setVideoBufferSize(selectedSize);
       localStorage.setItem('videoBufferSize', selectedSize.toString());
       console.log(`Dashboard: Sending postMessage: { type: 'settings', settings: { videoBufferSize: ${selectedSize} } }`);
       window.postMessage({ type: 'settings', settings: { videoBufferSize: selectedSize } }, window.location.origin);
     }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // --- Event Handlers for Action Buttons ---
  const handleVideoToggle = () => {
      const newState = !isVideoActive;
      console.log(`Dashboard: Sending postMessage: { type: 'pipelineControl', pipeline: 'video', enabled: ${newState} }`);
      window.postMessage({ type: 'pipelineControl', pipeline: 'video', enabled: newState }, window.location.origin);
  };

  const handleAudioToggle = () => {
      const newState = !isAudioActive;
      console.log(`Dashboard: Sending postMessage: { type: 'pipelineControl', pipeline: 'audio', enabled: ${newState} }`);
      window.postMessage({ type: 'pipelineControl', pipeline: 'audio', enabled: newState }, window.location.origin);
  };

  const handleMicrophoneToggle = () => {
      const newState = !isMicrophoneActive;
      console.log(`Dashboard: Sending postMessage: { type: 'pipelineControl', pipeline: 'microphone', enabled: ${newState} }`);
      window.postMessage({ type: 'pipelineControl', pipeline: 'microphone', enabled: newState }, window.location.origin);
  };

  const handleGamepadToggle = () => {
      const newState = !isGamepadEnabled;
      console.log(`Dashboard: Sending postMessage: { type: 'gamepadControl', enabled: ${newState} }`);
      window.postMessage({ type: 'gamepadControl', enabled: newState }, window.location.origin);
  };

  const handleFullscreenRequest = () => {
      console.log("Dashboard: Sending postMessage: { type: 'requestFullscreen' }");
      window.postMessage({ type: 'requestFullscreen' }, window.location.origin);
  };

  // --- Event Handlers for Clipboard ---
  const handleClipboardChange = (event) => {
      setDashboardClipboardContent(event.target.value);
  };

  const handleClipboardBlur = (event) => {
      const currentText = event.target.value;
      console.log(`Dashboard: Sending postMessage: { type: 'clipboardUpdateFromUI', text: ... } (on blur)`);
      window.postMessage({ type: 'clipboardUpdateFromUI', text: currentText }, window.location.origin);
  };

  // --- Event Handlers for Audio Device Dropdowns ---
  const handleAudioInputChange = (event) => {
      const deviceId = event.target.value;
      setSelectedInputDeviceId(deviceId);
      console.log(`Dashboard: Sending postMessage: { type: 'audioDeviceSelected', context: 'input', deviceId: ${deviceId} }`);
      window.postMessage({ type: 'audioDeviceSelected', context: 'input', deviceId: deviceId }, window.location.origin);
  };

  const handleAudioOutputChange = (event) => {
      const deviceId = event.target.value;
      setSelectedOutputDeviceId(deviceId);
      console.log(`Dashboard: Sending postMessage: { type: 'audioDeviceSelected', context: 'output', deviceId: ${deviceId} }`);
      window.postMessage({ type: 'audioDeviceSelected', context: 'output', deviceId: deviceId }, window.location.origin);
  };


  // --- useEffect Hooks ---
  useEffect(() => {
    const savedEncoder = localStorage.getItem('encoder');
    if (savedEncoder && encoderOptions.includes(savedEncoder)) {
      setEncoder(savedEncoder);
    } else {
      setEncoder(DEFAULT_ENCODER); localStorage.setItem('encoder', DEFAULT_ENCODER);
    }
    const savedFramerate = parseInt(localStorage.getItem('videoFramerate'), 10);
    if (!isNaN(savedFramerate) && framerateOptions.includes(savedFramerate)) {
      setFramerate(savedFramerate);
    } else {
      setFramerate(DEFAULT_FRAMERATE); localStorage.setItem('videoFramerate', DEFAULT_FRAMERATE.toString());
    }
    const savedVideoBitRate = parseInt(localStorage.getItem('videoBitRate'), 10);
     if (!isNaN(savedVideoBitRate) && videoBitrateOptions.includes(savedVideoBitRate)) {
       setVideoBitRate(savedVideoBitRate);
     } else {
       setVideoBitRate(DEFAULT_VIDEO_BITRATE); localStorage.setItem('videoBitRate', DEFAULT_VIDEO_BITRATE.toString());
     }
    const savedAudioBitRate = parseInt(localStorage.getItem('audioBitRate'), 10);
     if (!isNaN(savedAudioBitRate) && audioBitrateOptions.includes(savedAudioBitRate)) {
       setAudioBitRate(savedAudioBitRate);
     } else {
       setAudioBitRate(DEFAULT_AUDIO_BITRATE); localStorage.setItem('audioBitRate', DEFAULT_AUDIO_BITRATE.toString());
     }
    const savedVideoBufferSize = parseInt(localStorage.getItem('videoBufferSize'), 10);
     if (!isNaN(savedVideoBufferSize) && videoBufferOptions.includes(savedVideoBufferSize)) {
       setVideoBufferSize(savedVideoBufferSize);
     } else {
       setVideoBufferSize(DEFAULT_VIDEO_BUFFER_SIZE); localStorage.setItem('videoBufferSize', DEFAULT_VIDEO_BUFFER_SIZE.toString());
     }
  }, []);


  useEffect(() => {
    const readStats = () => {
        const currentSystemStats = window.system_stats;
        const sysMemUsed = currentSystemStats?.mem_used ?? null;
        const sysMemTotal = currentSystemStats?.mem_total ?? null;
        setCpuPercent(currentSystemStats?.cpu_percent ?? 0);
        setSysMemUsed(sysMemUsed); setSysMemTotal(sysMemTotal);
        setSysMemPercent((sysMemUsed !== null && sysMemTotal !== null && sysMemTotal > 0) ? (sysMemUsed / sysMemTotal) * 100 : 0);

        const currentGpuStats = window.gpu_stats;
        const gpuPercent = currentGpuStats?.gpu_percent ?? currentGpuStats?.utilization_gpu ?? 0;
        setGpuPercent(gpuPercent);
        const gpuMemUsed = currentGpuStats?.mem_used ?? currentGpuStats?.memory_used ?? currentGpuStats?.used_gpu_memory_bytes ?? null;
        const gpuMemTotal = currentGpuStats?.mem_total ?? currentGpuStats?.memory_total ?? currentGpuStats?.total_gpu_memory_bytes ?? null;
        setGpuMemUsed(gpuMemUsed); setGpuMemTotal(gpuMemTotal);
        setGpuMemPercent((gpuMemUsed !== null && gpuMemTotal !== null && gpuMemTotal > 0) ? (gpuMemUsed / gpuMemTotal) * 100 : 0);

        setClientFps(window.fps ?? 0);
        setAudioBuffer(window.currentAudioBufferSize ?? 0);
    };
    const intervalId = setInterval(readStats, STATS_READ_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);


  useEffect(() => {
    const handleWindowMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (typeof message === 'object' && message !== null) {
        if (message.type === 'pipelineStatusUpdate') {
          console.log('Dashboard: Received pipelineStatusUpdate', message);
          if (message.video !== undefined) setIsVideoActive(message.video);
          if (message.audio !== undefined) setIsAudioActive(message.audio);
          if (message.microphone !== undefined) setIsMicrophoneActive(message.microphone);
        }
        else if (message.type === 'gamepadControl') {
            if (message.enabled !== undefined) {
                console.log('Dashboard: Received gamepadControl status/confirmation', message);
                setIsGamepadEnabled(message.enabled);
            }
        }
        else if (message.type === 'sidebarButtonStatusUpdate') {
          console.log('Dashboard: Received sidebarButtonStatusUpdate', message);
          if (message.video !== undefined) setIsVideoActive(message.video);
          if (message.audio !== undefined) setIsAudioActive(message.audio);
          if (message.microphone !== undefined) setIsMicrophoneActive(message.microphone);
          if (message.gamepad !== undefined) setIsGamepadEnabled(message.gamepad);
        }
        else if (message.type === 'clipboardContentUpdate') {
            console.log('Dashboard: Received clipboardContentUpdate', message);
            if (typeof message.text === 'string') {
                setDashboardClipboardContent(message.text);
            } else {
                console.warn('Dashboard: Received clipboardContentUpdate without valid text property.');
            }
        }
        else if (message.type === 'audioDeviceStatusUpdate') {
             console.log('Dashboard: Received audioDeviceStatusUpdate', message);
             if (message.inputDeviceId !== undefined) {
                 setSelectedInputDeviceId(message.inputDeviceId || 'default');
             }
             if (message.outputDeviceId !== undefined) {
                 setSelectedOutputDeviceId(message.outputDeviceId || 'default');
             }
        }
        else if (message.type === 'gamepadButtonUpdate' || message.type === 'gamepadAxisUpdate') {
            if (!hasReceivedGamepadData) {
                setHasReceivedGamepadData(true); // Show the section header now
                console.log("Dashboard: First gamepad message received, enabling section header.");
            }

            const gpIndex = message.gamepadIndex;
            if (gpIndex === undefined || gpIndex === null) return; // Ignore if no index

            setGamepadStates(prevStates => {
                const newState = { ...prevStates }; // Shallow copy gamepad map

                // Ensure gamepad object exists and deep copy its state
                if (!newState[gpIndex]) {
                    newState[gpIndex] = { buttons: {}, axes: {} };
                } else {
                    newState[gpIndex] = {
                        buttons: { ...(newState[gpIndex].buttons || {}) },
                        axes: { ...(newState[gpIndex].axes || {}) }
                    };
                }

                if (message.type === 'gamepadButtonUpdate') {
                    const buttonIndex = message.buttonIndex;
                    if (buttonIndex !== undefined) {
                        newState[gpIndex].buttons[buttonIndex] = message.value || 0;
                    }
                } else { // gamepadAxisUpdate
                    const axisIndex = message.axisIndex;
                    if (axisIndex !== undefined) {
                        const clampedValue = Math.max(-1, Math.min(1, message.value || 0));
                        newState[gpIndex].axes[axisIndex] = clampedValue;
                    }
                }
                return newState; // Return the updated state object
            });
        }
      }
    };
    window.addEventListener('message', handleWindowMessage);
    console.log("Dashboard: Added window message listener for UI and Gamepad updates.");
    return () => {
      window.removeEventListener('message', handleWindowMessage);
      console.log("Dashboard: Removed window message listener.");
    };
  }, [hasReceivedGamepadData]); // Add hasReceivedGamepadData dependency


  // --- Tooltip Handlers ---
  const handleMouseEnter = (e, itemKey) => {
      setHoveredItem(itemKey);
      setTooltipPosition({ x: e.clientX + 10, y: e.clientY + 10 });
  };

  const handleMouseLeave = () => {
      setHoveredItem(null);
  };

  const getTooltipContent = (itemKey) => {
      switch (itemKey) {
          case 'cpu': return `CPU Usage: ${cpuPercent.toFixed(1)}%`;
          case 'gpu': return `GPU Usage: ${gpuPercent.toFixed(1)}%`;
          case 'sysmem': return `System Memory: ${sysMemUsed !== null && sysMemTotal !== null ? `${formatBytes(sysMemUsed)} / ${formatBytes(sysMemTotal)}` : 'N/A'}`;
          case 'gpumem': return `GPU Memory: ${gpuMemUsed !== null && gpuMemTotal !== null ? `${formatBytes(gpuMemUsed)} / ${formatBytes(gpuMemTotal)}` : 'N/A'}`;
          case 'fps': return `Client FPS: ${clientFps}`;
          case 'audio': return `Audio Buffers: ${audioBuffer}`;
          default: return '';
      }
  };


  // --- Component Rendering ---
  const sidebarClasses = `sidebar ${isOpen ? 'is-open' : ''} theme-${theme}`;
  const gaugeSize = 80;
  const gaugeStrokeWidth = 8;
  const gaugeRadius = (gaugeSize / 2) - (gaugeStrokeWidth / 2);
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeCenter = gaugeSize / 2;

  const cpuOffset = calculateGaugeOffset(cpuPercent, gaugeRadius, gaugeCircumference);
  const gpuOffset = calculateGaugeOffset(gpuPercent, gaugeRadius, gaugeCircumference);
  const sysMemOffset = calculateGaugeOffset(sysMemPercent, gaugeRadius, gaugeCircumference);
  const gpuMemOffset = calculateGaugeOffset(gpuMemPercent, gaugeRadius, gaugeCircumference);
  const fpsPercent = Math.min(100, (clientFps / (framerate || DEFAULT_FRAMERATE)) * 100);
  const fpsOffset = calculateGaugeOffset(fpsPercent, gaugeRadius, gaugeCircumference);
  const audioBufferPercent = Math.min(100, (audioBuffer / MAX_AUDIO_BUFFER) * 100);
  const audioBufferOffset = calculateGaugeOffset(audioBufferPercent, gaugeRadius, gaugeCircumference);


  return (
    <>
      <div className={sidebarClasses}>
        {/* Header */}
        <div className="sidebar-header">
           <h2>Selkies</h2>
           <div className="header-controls">
             <div className={`theme-toggle ${theme}`} onClick={toggleTheme} title="Toggle Theme">
               <svg className="icon moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
               <svg className="icon sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
             </div>
             <button className="header-action-button fullscreen-button" onClick={handleFullscreenRequest} title="Enter Fullscreen">
               <FullscreenIcon />
             </button>
           </div>
        </div>

        {/* Action Buttons Section */}
        <div className="sidebar-action-buttons">
            <button className={`action-button ${isVideoActive ? 'active' : ''}`} onClick={handleVideoToggle} title={isVideoActive ? "Disable Video Stream" : "Enable Video Stream"}> <ScreenIcon /> </button>
            <button className={`action-button ${isAudioActive ? 'active' : ''}`} onClick={handleAudioToggle} title={isAudioActive ? "Disable Audio Stream" : "Enable Audio Stream"}> <SpeakerIcon /> </button>
            <button className={`action-button ${isMicrophoneActive ? 'active' : ''}`} onClick={handleMicrophoneToggle} title={isMicrophoneActive ? "Disable Microphone" : "Enable Microphone"}> <MicrophoneIcon /> </button>
            <button className={`action-button ${isGamepadEnabled ? 'active' : ''}`} onClick={handleGamepadToggle} title={isGamepadEnabled ? "Disable Gamepad Input" : "Enable Gamepad Input"}> <GamepadIcon /> </button>
        </div>

        {/* Video Settings Section */}
        <div className="sidebar-section">
            <div
              className="sidebar-section-header"
              onClick={() => toggleSection('settings')}
              role="button"
              aria-expanded={sectionsOpen.settings}
              aria-controls="settings-content"
              tabIndex="0"
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('settings')}
            >
              <h3>Video Settings</h3>
              <span className="section-toggle-icon" aria-hidden="true">
                {sectionsOpen.settings ? <CaretUpIcon /> : <CaretDownIcon />}
              </span>
            </div>

            {sectionsOpen.settings && (
              <div className="sidebar-section-content" id="settings-content">
                {/* Encoder Dropdown */}
                <div className="dev-setting-item">
                  <label htmlFor="encoderSelect">Encoder:</label>
                  <select id="encoderSelect" value={encoder} onChange={handleEncoderChange}> {encoderOptions.map(enc => (<option key={enc} value={enc}>{enc}</option>))} </select>
                </div>
                {/* Framerate Slider */}
                 <div className="dev-setting-item">
                  <label htmlFor="framerateSlider">Frames per second ({framerate} FPS):</label>
                  <input type="range" id="framerateSlider" min="0" max={framerateOptions.length - 1} step="1" value={framerateOptions.indexOf(framerate)} onChange={handleFramerateChange} />
                </div>
                {/* Video Bitrate Slider */}
                <div className="dev-setting-item">
                  <label htmlFor="videoBitrateSlider">Video Bitrate ({videoBitRate / 1000} Mbps):</label>
                  <input type="range" id="videoBitrateSlider" min="0" max={videoBitrateOptions.length - 1} step="1" value={videoBitrateOptions.indexOf(videoBitRate)} onChange={handleVideoBitrateChange} />
                </div>
                {/* Video Buffer Size Slider */}
                 <div className="dev-setting-item">
                  <label htmlFor="videoBufferSizeSlider"> Video Buffer Size ({videoBufferSize === 0 ? '0 (Immediate)' : `${videoBufferSize} frames`}): </label>
                  <input type="range" id="videoBufferSizeSlider" min="0" max={videoBufferOptions.length - 1} step="1" value={videoBufferOptions.indexOf(videoBufferSize)} onChange={handleVideoBufferSizeChange} />
                </div>
              </div>
            )}
        </div>

        {/* Audio Settings Section */}
        <div className="sidebar-section">
            <div
              className="sidebar-section-header"
              onClick={() => toggleSection('audioSettings')}
              role="button"
              aria-expanded={sectionsOpen.audioSettings}
              aria-controls="audio-settings-content"
              tabIndex="0"
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('audioSettings')}
            >
              <h3>Audio Settings</h3>
              <span className="section-toggle-icon" aria-hidden="true">
                 {isLoadingAudioDevices ? <SpinnerIcon /> : (sectionsOpen.audioSettings ? <CaretUpIcon /> : <CaretDownIcon />)}
              </span>
            </div>

            {sectionsOpen.audioSettings && (
              <div className="sidebar-section-content" id="audio-settings-content">
                {/* Audio Bitrate Slider */}
                <div className="dev-setting-item">
                  <label htmlFor="audioBitrateSlider">Audio Bitrate ({audioBitRate / 1000} kbps):</label>
                  <input type="range" id="audioBitrateSlider" min="0" max={audioBitrateOptions.length - 1} step="1" value={audioBitrateOptions.indexOf(audioBitRate)} onChange={handleAudioBitrateChange} />
                </div>

                {/* Divider */}
                <hr className="section-divider" />

                {/* Error Display */}
                {audioDeviceError && (
                    <div className="error-message" style={{color: 'var(--error-color, red)', marginBottom: '10px', fontSize: '0.9em'}}>
                        {audioDeviceError}
                    </div>
                )}

                {/* Input Device Dropdown */}
                <div className="dev-setting-item">
                  <label htmlFor="audioInputSelect">Input (Microphone):</label>
                  <select
                    id="audioInputSelect"
                    value={selectedInputDeviceId}
                    onChange={handleAudioInputChange}
                    disabled={isLoadingAudioDevices || !!audioDeviceError}
                    className="audio-device-select" /* Add class for specific styling */
                  >
                    {audioInputDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </div>

                {isOutputSelectionSupported && (
                  <div className="dev-setting-item">
                    <label htmlFor="audioOutputSelect">Output (Speaker):</label>
                    <select
                      id="audioOutputSelect"
                      value={selectedOutputDeviceId}
                      onChange={handleAudioOutputChange}
                      disabled={isLoadingAudioDevices || !!audioDeviceError}
                      className="audio-device-select" /* Add class for specific styling */
                    >
                      {audioOutputDevices.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                 {!isOutputSelectionSupported && !isLoadingAudioDevices && !audioDeviceError && (
                    <p style={{ fontSize: '0.8em', color: 'var(--sidebar-text-secondary)', marginTop: '5px' }}>
                        Output device selection not supported by this browser.
                    </p>
                 )}
              </div>
            )}
        </div>
        <div className="sidebar-section">
            <div
              className="sidebar-section-header"
              onClick={() => toggleSection('stats')}
              role="button"
              aria-expanded={sectionsOpen.stats}
              aria-controls="stats-content"
              tabIndex="0"
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('stats')}
            >
              <h3>Stats</h3>
              <span className="section-toggle-icon" aria-hidden="true">
                {sectionsOpen.stats ? <CaretUpIcon /> : <CaretDownIcon />}
              </span>
            </div>

            {sectionsOpen.stats && (
              <div className="sidebar-section-content" id="stats-content">
                <div className="stats-gauges">
                   {/* CPU Gauge */}
                   <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'cpu')} onMouseLeave={handleMouseLeave}>
                       <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                           <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} />
                           <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: cpuOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} />
                           <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {Math.round(Math.max(0, Math.min(100, cpuPercent || 0)))}% </text>
                       </svg>
                       <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>CPU</div>
                   </div>
                   {/* GPU Usage Gauge */}
                   <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'gpu')} onMouseLeave={handleMouseLeave}>
                       <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                           <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} />
                           <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: gpuOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} />
                           <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {Math.round(Math.max(0, Math.min(100, gpuPercent || 0)))}% </text>
                       </svg>
                       <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>GPU Usage</div>
                   </div>
                   {/* System Memory Gauge */}
                    <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'sysmem')} onMouseLeave={handleMouseLeave}>
                       <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                           <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} />
                           <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: sysMemOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} />
                           <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {Math.round(Math.max(0, Math.min(100, sysMemPercent || 0)))}% </text>
                       </svg>
                       <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>Sys Mem</div>
                   </div>
                   {/* GPU Memory Gauge */}
                    <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'gpumem')} onMouseLeave={handleMouseLeave}>
                       <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                           <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} />
                           <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: gpuMemOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} />
                           <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {Math.round(Math.max(0, Math.min(100, gpuMemPercent || 0)))}% </text>
                       </svg>
                       <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>GPU Mem</div>
                   </div>
                   {/* Client FPS Gauge */}
                    <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'fps')} onMouseLeave={handleMouseLeave}>
                       <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                           <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} />
                           <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: fpsOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} />
                           <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {clientFps} </text>
                       </svg>
                       <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>FPS</div>
                   </div>
                   {/* Audio Buffer Gauge */}
                    <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'audio')} onMouseLeave={handleMouseLeave}>
                       <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
                           <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} />
                           <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: audioBufferOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} />
                           <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {audioBuffer} </text>
                       </svg>
                       <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>Audio</div>
                   </div>
                </div>
              </div>
            )}
        </div>

        <div className="sidebar-section">
            <div
              className="sidebar-section-header"
              onClick={() => toggleSection('clipboard')}
              role="button"
              aria-expanded={sectionsOpen.clipboard}
              aria-controls="clipboard-content"
              tabIndex="0"
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('clipboard')}
            >
              <h3>Clipboard</h3>
              <span className="section-toggle-icon" aria-hidden="true">
                {sectionsOpen.clipboard ? <CaretUpIcon /> : <CaretDownIcon />}
              </span>
            </div>

            {sectionsOpen.clipboard && (
              <div className="sidebar-section-content" id="clipboard-content">
                <div className="dashboard-clipboard-item">
                  <label htmlFor="dashboardClipboardTextarea">Server Clipboard:</label>
                  <textarea
                    id="dashboardClipboardTextarea"
                    value={dashboardClipboardContent}
                    onChange={handleClipboardChange}
                    onBlur={handleClipboardBlur}
                    rows="5"
                    placeholder="Clipboard content from server..."
                  />
                </div>
              </div>
            )}
        </div>
        {hasReceivedGamepadData && ( // Only render header if data ever received
          <div className="sidebar-section">
              <div
                className="sidebar-section-header"
                onClick={() => toggleSection('gamepads')}
                role="button"
                aria-expanded={sectionsOpen.gamepads}
                aria-controls="gamepads-content"
                tabIndex="0"
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('gamepads')}
              >
                <h3>Gamepads</h3>
                <span className="section-toggle-icon" aria-hidden="true">
                  {sectionsOpen.gamepads ? <CaretUpIcon /> : <CaretDownIcon />}
                </span>
              </div>

              {sectionsOpen.gamepads && (
                <div className="sidebar-section-content" id="gamepads-content">
                  {Object.keys(gamepadStates).length === 0 ? (
                    <p className="no-gamepads-message">No gamepad activity detected yet...</p>
                  ) : (
                    Object.keys(gamepadStates)
                      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10)) // Sort by index
                      .map(gpIndexStr => {
                        const gpIndex = parseInt(gpIndexStr, 10);
                        return (
                          <GamepadVisualizer
                            key={gpIndex}
                            gamepadIndex={gpIndex}
                            gamepadState={gamepadStates[gpIndex]}
                          />
                        );
                      })
                  )}
                </div>
              )}
          </div>
        )}
      </div>
      {hoveredItem && (
          <div className="gauge-tooltip" style={{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }}>
              {getTooltipContent(hoveredItem)}
          </div>
      )}
    </>
  );
}

export default Sidebar;

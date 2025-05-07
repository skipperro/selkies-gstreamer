// src/components/Sidebar.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import GamepadVisualizer from './GamepadVisualizer';
import { getTranslator } from '../translations';
import yaml from 'js-yaml';

// --- Constants ---
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

const videoBufferOptions = Array.from({ length: 16 }, (_, i) => i);

// --- Resolution Values (Text will be translated) ---
const commonResolutionValues = [
    "", "1920x1080", "1280x720", "1366x768", "1920x1200", "2560x1440",
    "3840x2160", "1024x768", "800x600", "640x480", "320x240"
];

const STATS_READ_INTERVAL_MS = 100;
const MAX_AUDIO_BUFFER = 10;
const DEFAULT_FRAMERATE = 60;
const DEFAULT_VIDEO_BITRATE = 8000;
const DEFAULT_AUDIO_BITRATE = 320000;
const DEFAULT_VIDEO_BUFFER_SIZE = 0;
const DEFAULT_ENCODER = encoderOptions[0];
const DEFAULT_SCALE_LOCALLY = true;
const REPO_BASE_URL = 'https://raw.githubusercontent.com/linuxserver/proot-apps/master/metadata/';
const METADATA_URL = `${REPO_BASE_URL}metadata.yml`;
const IMAGE_BASE_URL = `${REPO_BASE_URL}img/`;

// --- Notification Constants ---
const MAX_NOTIFICATIONS = 3;
const NOTIFICATION_TIMEOUT_SUCCESS = 5000; // 5 seconds
const NOTIFICATION_TIMEOUT_ERROR = 8000; // 8 seconds
const NOTIFICATION_FADE_DURATION = 500; // 0.5 seconds

// --- Helper Functions ---
// Updated formatBytes to use translated units from 'raw' dictionary
function formatBytes(bytes, decimals = 2, rawDict) {
    const zeroBytesText = rawDict?.zeroBytes || '0 Bytes'; // Use translated '0 Bytes'
    if (bytes === null || bytes === undefined || bytes === 0) return zeroBytesText;
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = rawDict?.byteUnits || ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']; // Use translated units
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const unitIndex = Math.min(i, sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[unitIndex];
}

const calculateGaugeOffset = (percentage, radius, circumference) => {
    const clampedPercentage = Math.max(0, Math.min(100, percentage || 0));
    return circumference * (1 - clampedPercentage / 100);
};

const roundDownToEven = (num) => {
    const n = parseInt(num, 10);
    if (isNaN(n)) return 0;
    return Math.floor(n / 2) * 2;
};

// --- Icons ---
const AppsIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
    </svg>
);
const KeyboardIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zm-3 0h2v2H8v-2zm-3 0h2v2H5v-2zm0-3h2v2H5V8zm3 0h2v2H8V8zm9 6H7v-2h10v2zm0-3h2v2h-2v-2zm0-3h2v2h-2V8z"/>
    </svg>
);
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
// --- End Icons ---

// --- Logo Component with translatable aria-label ---
const SelkiesLogo = ({ width = 30, height = 30, className, t, ...props }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={t('selkiesLogoAlt')} // Use translation function
      {...props}
    >
      {/* SVG paths remain the same */}
       <path fill="#61dafb" d="M156.825 120.999H5.273l-.271-1.13 87.336-43.332-7.278 17.696c4 1.628 6.179.541 7.907-2.974l26.873-53.575c1.198-2.319 3.879-4.593 6.358-5.401 9.959-3.249 20.065-6.091 30.229-8.634 1.9-.475 4.981.461 6.368 1.873 4.067 4.142 7.32 9.082 11.379 13.233 1.719 1.758 4.572 2.964 7.058 3.29 4.094.536 8.311.046 12.471.183 5.2.171 6.765 2.967 4.229 7.607-2.154 3.942-4.258 7.97-6.94 11.542-1.264 1.684-3.789 3.274-5.82 3.377-7.701.391-15.434.158-23.409 1.265 2.214 1.33 4.301 2.981 6.67 3.919 4.287 1.698 5.76 4.897 6.346 9.162 1.063 7.741 2.609 15.417 3.623 23.164.22 1.677-.464 3.971-1.579 5.233-3.521 3.987-7.156 7.989-11.332 11.232-2.069 1.607-5.418 1.565-8.664 2.27m-3.804-69.578c5.601.881 6.567-5.024 11.089-6.722l-9.884-7.716-11.299 9.983 10.094 4.455z"/>
      <path fill="#61dafb" d="M86 131.92c7.491 0 14.495.261 21.467-.1 4.011-.208 6.165 1.249 7.532 4.832 1.103 2.889 2.605 5.626 4.397 9.419h-93.41l5.163 24.027-1.01.859c-3.291-2.273-6.357-5.009-9.914-6.733-11.515-5.581-17.057-14.489-16.403-27.286.073-1.423-.287-2.869-.525-5.019H86z"/>
      <path fill="#61dafb" d="M129.004 164.999l1.179-1.424c9.132-10.114 9.127-10.11 2.877-22.425l-4.552-9.232c4.752 0 8.69.546 12.42-.101 11.96-2.075 20.504 1.972 25.74 13.014.826 1.743 2.245 3.205 3.797 5.361-9.923 7.274-19.044 15.174-29.357 20.945-4.365 2.443-11.236.407-17.714.407l5.611-6.545z"/>
      <path fill="#FFFFFF" d="M152.672 51.269l-9.745-4.303 11.299-9.983 9.884 7.716c-4.522 1.698-5.488 7.602-11.439 6.57z"/>
    </svg>
  );


function AppsModal({ isOpen, onClose, t }) {
    const [appData, setAppData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [installedApps, setInstalledApps] = useState([]); // Fake installed apps

    useEffect(() => {
        if (isOpen && !appData && !isLoading) {
            const fetchAppData = async () => {
                setIsLoading(true);
                setError(null);
                try {
                    const response = await fetch(METADATA_URL);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const yamlText = await response.text();
                    const parsedData = yaml.load(yamlText);
                    setAppData(parsedData);
                } catch (e) {
                    console.error("Failed to fetch or parse app data:", e);
                    setError(t('appsModal.errorLoading', 'Failed to load app data. Please try again.'));
                } finally {
                    setIsLoading(false);
                }
            };
            fetchAppData();
        }
    }, [isOpen, appData, isLoading, t]);

    const handleSearchChange = (event) => {
        setSearchTerm(event.target.value.toLowerCase());
    };

    const handleAppClick = (app) => {
        setSelectedApp(app);
    };

    const handleBackToGrid = () => {
        setSelectedApp(null);
    };

    const handleInstall = (appName) => {
        console.log(`Install app: ${appName}`);
        setInstalledApps(prev => [...prev, appName]);
        alert(t('appsModal.installingMessage', `Simulating install for: ${appName}`, { appName }));
    };

    const handleRemove = (appName) => {
        console.log(`Remove app: ${appName}`);
        setInstalledApps(prev => prev.filter(name => name !== appName));
        alert(t('appsModal.removingMessage', `Simulating removal for: ${appName}`, { appName }));
    };

    const handleUpdate = (appName) => {
        console.log(`Update app: ${appName}`);
        alert(t('appsModal.updatingMessage', `Simulating update for: ${appName}`, { appName }));
    };

    const filteredApps = appData?.include?.filter(app =>
        !app.disabled &&
        (app.full_name?.toLowerCase().includes(searchTerm) ||
         app.name?.toLowerCase().includes(searchTerm) ||
         app.description?.toLowerCase().includes(searchTerm))
    ) || [];

    const isAppInstalled = (appName) => installedApps.includes(appName);

    if (!isOpen) return null;

    return (
        <div className="apps-modal">
            <button className="apps-modal-close" onClick={onClose} aria-label={t('appsModal.closeAlt', "Close apps modal")}>&times;</button>
            <div className="apps-modal-content">
                {isLoading && (
                    <div className="apps-modal-loading">
                        <SpinnerIcon />
                        <p>{t('appsModal.loading', 'Loading apps...')}</p>
                    </div>
                )}
                {error && <p className="apps-modal-error">{error}</p>}

                {!isLoading && !error && appData && (
                    <>
                        {selectedApp ? (
                            <div className="app-detail-view">
                                <button onClick={handleBackToGrid} className="app-detail-back-button">
                                    &larr; {t('appsModal.backButton', 'Back to list')}
                                </button>
                                <img
                                    src={`${IMAGE_BASE_URL}${selectedApp.icon}`}
                                    alt={selectedApp.full_name}
                                    className="app-detail-icon"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                                <h2>{selectedApp.full_name}</h2>
                                <p className="app-detail-description">{selectedApp.description}</p>
                                <div className="app-action-buttons">
                                    {isAppInstalled(selectedApp.name) ? (
                                        <>
                                            <button onClick={() => handleUpdate(selectedApp.name)} className="app-action-button update">
                                                {t('appsModal.updateButton', 'Update')} {selectedApp.name}
                                            </button>
                                            <button onClick={() => handleRemove(selectedApp.name)} className="app-action-button remove">
                                                {t('appsModal.removeButton', 'Remove')} {selectedApp.name}
                                            </button>
                                        </>
                                    ) : (
                                        <button onClick={() => handleInstall(selectedApp.name)} className="app-action-button install">
                                            {t('appsModal.installButton', 'Install')} {selectedApp.name}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    className="apps-search-bar allow-native-input"
                                    placeholder={t('appsModal.searchPlaceholder', "Search apps...")}
                                    value={searchTerm}
                                    onChange={handleSearchChange}
                                />
                                <div className="apps-grid">
                                    {filteredApps.length > 0 ? filteredApps.map(app => (
                                        <div key={app.name} className="app-card" onClick={() => handleAppClick(app)}>
                                            <img
                                                src={`${IMAGE_BASE_URL}${app.icon}`}
                                                alt={app.full_name}
                                                className="app-card-icon"
                                                loading="lazy"
                                                onError={(e) => { e.target.style.visibility = 'hidden'; }}
                                            />
                                            <p className="app-card-name">{app.full_name}</p>
                                            {isAppInstalled(app.name) && <div className="app-card-installed-badge">{t('appsModal.installedBadge', 'Installed')}</div>}
                                        </div>
                                    )) : (
                                        <p>{t('appsModal.noAppsFound', 'No apps found matching your search.')}</p>
                                    )}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function Sidebar({ isOpen }) {
  // --- Language State & Setup ---
  const [langCode, setLangCode] = useState('en'); // Default to English
  const [translator, setTranslator] = useState(() => getTranslator('en')); // Initial translator
  const [isMobile, setIsMobile] = useState(false); // Mobile detect

  useEffect(() => {
    // Detect browser language on initial load
    const browserLang = navigator.language || navigator.userLanguage || 'en';
    const primaryLang = browserLang.split('-')[0].toLowerCase();
    console.log(`Dashboard: Detected browser language: ${browserLang}, using primary: ${primaryLang}`);
    // Optional: Check if primaryLang is supported in translations.js, otherwise keep 'en'
    setLangCode(primaryLang);
    setTranslator(getTranslator(primaryLang));
  }, []); // Run only on mount

  // Mobile detection effect
  useEffect(() => {
    const mobileCheck = navigator.userAgentData?.mobile || false;
    setIsMobile(mobileCheck);
    if (navigator.userAgentData) {
        console.log('Dashboard: Mobile detected via userAgentData.mobile:', mobileCheck);
    } else {
        console.warn('Dashboard: navigator.userAgentData not available. Mobile detection might be inaccurate. Consider a fallback if wider support is needed.');
    }
  }, []);

  // Get the translation function 't' and raw dictionary 'raw'
  const { t, raw } = translator;

  // --- Existing State ---
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [encoder, setEncoder] = useState(localStorage.getItem('encoder') || DEFAULT_ENCODER);
  const [dynamicEncoderOptions, setDynamicEncoderOptions] = useState(encoderOptions); // New state for encoder options
  const [framerate, setFramerate] = useState(parseInt(localStorage.getItem('videoFramerate'), 10) || DEFAULT_FRAMERATE);
  const [videoBitRate, setVideoBitRate] = useState(parseInt(localStorage.getItem('videoBitRate'), 10) || DEFAULT_VIDEO_BITRATE);
  const [audioBitRate, setAudioBitRate] = useState(parseInt(localStorage.getItem('audioBitRate'), 10) || DEFAULT_AUDIO_BITRATE);
  const [videoBufferSize, setVideoBufferSize] = useState(parseInt(localStorage.getItem('videoBufferSize'), 10) || DEFAULT_VIDEO_BUFFER_SIZE);
  const [manualWidth, setManualWidth] = useState('');
  const [manualHeight, setManualHeight] = useState('');
  const [scaleLocally, setScaleLocally] = useState(() => {
      const saved = localStorage.getItem('scaleLocallyManual');
      return saved !== null ? saved === 'true' : DEFAULT_SCALE_LOCALLY;
  });
  const [presetValue, setPresetValue] = useState("");
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
  const [audioDeviceError, setAudioDeviceError] = useState(null); // Store the translated error message
  const [isLoadingAudioDevices, setIsLoadingAudioDevices] = useState(false);
  const [gamepadStates, setGamepadStates] = useState({});
  const [hasReceivedGamepadData, setHasReceivedGamepadData] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState({
    settings: false,
    audioSettings: false,
    screenSettings: false,
    stats: false,
    clipboard: false,
    gamepads: false,
    files: false,
    apps: false,
  });
  const [notifications, setNotifications] = useState([]);
  const notificationTimeouts = useRef({});
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [isAppsModalOpen, setIsAppsModalOpen] = useState(false);

  // --- Callbacks and Handlers ---

  const toggleAppsModal = () => {
    setIsAppsModalOpen(!isAppsModalOpen);
  };

  const toggleFilesModal = () => {
    setIsFilesModalOpen(!isFilesModalOpen);
  };

  const handleShowVirtualKeyboard = () => {
    window.postMessage({ type: 'showVirtualKeyboard' }, window.location.origin);
    console.log("Dashboard: Sending postMessage: { type: 'showVirtualKeyboard' }");
  };

  // --- Updated populateAudioDevices with translated error messages ---
  const populateAudioDevices = useCallback(async () => {
    console.log("Dashboard: Attempting to populate audio devices...");
    setIsLoadingAudioDevices(true);
    setAudioDeviceError(null); // Clear previous error text
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
      const inputFallbackLabel = t('sections.audio.defaultInputLabelFallback', { index: 0 }); // Provide a default for the fallback
      const outputFallbackLabel = t('sections.audio.defaultOutputLabelFallback', { index: 0 }); // Provide a default for the fallback


      devices.forEach((device, index) => { // Added index for potential fallback label
        if (!device.deviceId) {
          console.warn("Dashboard: Skipping device with missing deviceId:", device);
          return;
        }
        // Use browser label first, then potentially a translated fallback if needed
        const label = device.label || (device.kind === 'audioinput' ? t('sections.audio.defaultInputLabelFallback', { index: index + 1 }) : t('sections.audio.defaultOutputLabelFallback', { index: index + 1 }));


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
      console.log(`Dashboard: Populated ${inputs.length} inputs, ${outputs.length} outputs.`);

    } catch (err) {
      console.error('Dashboard: Error getting media devices or permissions:', err);
      let userMessageKey = 'sections.audio.deviceErrorDefault';
      let errorVars = { errorName: err.name || 'Unknown error' };

      if (err.name === 'NotAllowedError') {
          userMessageKey = 'sections.audio.deviceErrorPermission';
          errorVars = {};
      } else if (err.name === 'NotFoundError') {
          userMessageKey = 'sections.audio.deviceErrorNotFound';
          errorVars = {};
      }
      // Use the 't' function to get the translated error message
      setAudioDeviceError(t(userMessageKey, errorVars));
    } finally {
      setIsLoadingAudioDevices(false);
    }
  }, [t]); // Add `t` to dependency array


  const toggleSection = useCallback((sectionKey) => {
    const isOpening = !sectionsOpen[sectionKey];
    setSectionsOpen(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
    // Use the latest populateAudioDevices which depends on `t`
    if (sectionKey === 'audioSettings' && isOpening) {
      populateAudioDevices();
    }
  }, [sectionsOpen, populateAudioDevices]); // populateAudioDevices now includes t
  // Video Settings Handlers
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

  // Audio Settings Handlers
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

  // Screen Settings Handlers
  const handlePresetChange = (event) => {
      const selectedValue = event.target.value;
      setPresetValue(selectedValue); // Update dropdown state

      if (!selectedValue) {
          return; // Ignore "-- Select Preset --"
      }

      const parts = selectedValue.split('x');
      if (parts.length === 2) {
          const width = parseInt(parts[0], 10);
          const height = parseInt(parts[1], 10);

          if (!isNaN(width) && width > 0 && !isNaN(height) && height > 0) {
              const evenWidth = roundDownToEven(width);
              const evenHeight = roundDownToEven(height);

              console.log(`Dashboard: Preset selected: ${width}x${height}. Rounded: ${evenWidth}x${evenHeight}. Posting message.`);

              // Update manual input fields visually
              setManualWidth(evenWidth.toString());
              setManualHeight(evenHeight.toString());

              // Post the message
              window.postMessage({ type: 'setManualResolution', width: evenWidth, height: evenHeight }, window.location.origin);

          } else {
              console.error("Dashboard: Error parsing selected resolution preset:", selectedValue);
          }
      }
  };

  const handleManualWidthChange = (event) => {
      setManualWidth(event.target.value);
      setPresetValue(""); // Clear preset selection when manually typing
  };

  const handleManualHeightChange = (event) => {
      setManualHeight(event.target.value);
      setPresetValue(""); // Clear preset selection when manually typing
  };

  const handleScaleLocallyToggle = () => {
      const newState = !scaleLocally;
      setScaleLocally(newState);
      localStorage.setItem('scaleLocallyManual', newState.toString());
      console.log(`Dashboard: Scale Locally button toggled to ${newState}. Posting message.`);
      window.postMessage({ type: 'setScaleLocally', value: newState }, window.location.origin);
  };

  const handleSetManualResolution = () => {
      const widthVal = manualWidth.trim();
      const heightVal = manualHeight.trim();
      const width = parseInt(widthVal, 10);
      const height = parseInt(heightVal, 10);

      if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
          alert(t('alerts.invalidResolution'));
          console.error('Dashboard: Invalid manual resolution input:', { widthVal, heightVal });
          return;
      }
      const evenWidth = roundDownToEven(width);
      const evenHeight = roundDownToEven(height);
      setManualWidth(evenWidth.toString());
      setManualHeight(evenHeight.toString());
      setPresetValue("");
      window.postMessage({ type: 'setManualResolution', width: evenWidth, height: evenHeight }, window.location.origin);
  };

  const handleResetResolution = () => { setManualWidth(''); setManualHeight(''); setPresetValue(""); window.postMessage({ type: 'resetResolutionToWindow' }, window.location.origin); };

  // Action Button Handlers
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

  // Clipboard Handlers
  const handleClipboardChange = (event) => {
      setDashboardClipboardContent(event.target.value);
  };
  const handleClipboardBlur = (event) => {
      const currentText = event.target.value;
      console.log(`Dashboard: Sending postMessage: { type: 'clipboardUpdateFromUI', text: ... } (on blur)`);
      window.postMessage({ type: 'clipboardUpdateFromUI', text: currentText }, window.location.origin);
  };

  // Theme Handler
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Tooltip Handlers
  const handleMouseEnter = (e, itemKey) => {
      setHoveredItem(itemKey);
      setTooltipPosition({ x: e.clientX + 10, y: e.clientY + 10 });
  };
  const handleMouseLeave = () => {
      setHoveredItem(null);
  };

  // --- Updated getTooltipContent ---
  const getTooltipContent = useCallback((itemKey) => {
      const memNA = t('sections.stats.tooltipMemoryNA');
      switch (itemKey) {
          case 'cpu':
              return t('sections.stats.tooltipCpu', { value: cpuPercent.toFixed(1) });
          case 'gpu':
              return t('sections.stats.tooltipGpu', { value: gpuPercent.toFixed(1) });
          case 'sysmem':
              const formattedSysUsed = sysMemUsed !== null ? formatBytes(sysMemUsed, 2, raw) : memNA;
              const formattedSysTotal = sysMemTotal !== null ? formatBytes(sysMemTotal, 2, raw) : memNA;
              return (formattedSysUsed !== memNA && formattedSysTotal !== memNA)
                  ? t('sections.stats.tooltipSysMem', { used: formattedSysUsed, total: formattedSysTotal })
                  : `${t('sections.stats.sysMemLabel')}: ${memNA}`; // Provide context if N/A
          case 'gpumem':
              const formattedGpuUsed = gpuMemUsed !== null ? formatBytes(gpuMemUsed, 2, raw) : memNA;
              const formattedGpuTotal = gpuMemTotal !== null ? formatBytes(gpuMemTotal, 2, raw) : memNA;
              return (formattedGpuUsed !== memNA && formattedGpuTotal !== memNA)
                  ? t('sections.stats.tooltipGpuMem', { used: formattedGpuUsed, total: formattedGpuTotal })
                  : `${t('sections.stats.gpuMemLabel')}: ${memNA}`; // Provide context if N/A
          case 'fps':
              return t('sections.stats.tooltipFps', { value: clientFps });
          case 'audio':
              return t('sections.stats.tooltipAudio', { value: audioBuffer });
          default: return '';
      }
  }, [t, raw, cpuPercent, gpuPercent, sysMemUsed, sysMemTotal, gpuMemUsed, gpuMemTotal, clientFps, audioBuffer]); // Add t and raw dependencies

  // --- Notification Handler ---
  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (notificationTimeouts.current[id]) {
        clearTimeout(notificationTimeouts.current[id].fadeTimer);
        clearTimeout(notificationTimeouts.current[id].removeTimer);
        delete notificationTimeouts.current[id];
    }
  }, []);

  const scheduleNotificationRemoval = useCallback((id, delay) => {
    // Clear existing timers for this ID
    if (notificationTimeouts.current[id]) {
        clearTimeout(notificationTimeouts.current[id].fadeTimer);
        clearTimeout(notificationTimeouts.current[id].removeTimer);
    }

    // Timer to start fading out
    const fadeTimer = setTimeout(() => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, fadingOut: true } : n));
    }, delay - NOTIFICATION_FADE_DURATION);

    // Timer to actually remove from state after fade
    const removeTimer = setTimeout(() => {
        removeNotification(id);
    }, delay);

    notificationTimeouts.current[id] = { fadeTimer, removeTimer };
  }, [removeNotification]);

  const handleUploadClick = () => {
    console.log("Dashboard: Upload Files button clicked. Dispatching 'requestFileUpload' event.");
    // This event should be listened for by the main application script (where the hidden input lives)
    window.dispatchEvent(new CustomEvent('requestFileUpload'));
  };
  // --- useEffect Hooks ---

  // Load initial settings from localStorage
  useEffect(() => {
    const savedEncoder = localStorage.getItem('encoder');
    if (savedEncoder && encoderOptions.includes(savedEncoder)) setEncoder(savedEncoder);
    else { setEncoder(DEFAULT_ENCODER); localStorage.setItem('encoder', DEFAULT_ENCODER); }

    const savedFramerate = parseInt(localStorage.getItem('videoFramerate'), 10);
    if (!isNaN(savedFramerate) && framerateOptions.includes(savedFramerate)) setFramerate(savedFramerate);
    else { setFramerate(DEFAULT_FRAMERATE); localStorage.setItem('videoFramerate', DEFAULT_FRAMERATE.toString()); }

    const savedVideoBitRate = parseInt(localStorage.getItem('videoBitRate'), 10);
     if (!isNaN(savedVideoBitRate) && videoBitrateOptions.includes(savedVideoBitRate)) setVideoBitRate(savedVideoBitRate);
     else { setVideoBitRate(DEFAULT_VIDEO_BITRATE); localStorage.setItem('videoBitRate', DEFAULT_VIDEO_BITRATE.toString()); }

    const savedAudioBitRate = parseInt(localStorage.getItem('audioBitRate'), 10);
     if (!isNaN(savedAudioBitRate) && audioBitrateOptions.includes(savedAudioBitRate)) setAudioBitRate(savedAudioBitRate);
     else { setAudioBitRate(DEFAULT_AUDIO_BITRATE); localStorage.setItem('audioBitRate', DEFAULT_AUDIO_BITRATE.toString()); }

    const savedVideoBufferSize = parseInt(localStorage.getItem('videoBufferSize'), 10);
     if (!isNaN(savedVideoBufferSize) && videoBufferOptions.includes(savedVideoBufferSize)) setVideoBufferSize(savedVideoBufferSize);
     else { setVideoBufferSize(DEFAULT_VIDEO_BUFFER_SIZE); localStorage.setItem('videoBufferSize', DEFAULT_VIDEO_BUFFER_SIZE.toString()); }
  }, []);

  // Read stats periodically
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

  // --- Update message handling useEffect for notifications ---
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
                    setHasReceivedGamepadData(true);
                    console.log("Dashboard: First gamepad message received, enabling section header.");
                }
                const gpIndex = message.gamepadIndex;
                if (gpIndex === undefined || gpIndex === null) return;
                setGamepadStates(prevStates => {
                    const newState = { ...prevStates };
                    if (!newState[gpIndex]) newState[gpIndex] = { buttons: {}, axes: {} };
                    else newState[gpIndex] = { buttons: { ...(newState[gpIndex].buttons || {}) }, axes: { ...(newState[gpIndex].axes || {}) } };
                    if (message.type === 'gamepadButtonUpdate') {
                        const buttonIndex = message.buttonIndex;
                        if (buttonIndex !== undefined) newState[gpIndex].buttons[buttonIndex] = message.value || 0;
                    } else {
                        const axisIndex = message.axisIndex;
                        if (axisIndex !== undefined) newState[gpIndex].axes[axisIndex] = Math.max(-1, Math.min(1, message.value || 0));
                    }
                    return newState;
                });
            }
            else if (message.type === 'fileUpload') {
                const { status, fileName, progress, fileSize, message: errorMessage } = message.payload;
                const id = fileName;

                setNotifications(prevNotifications => {
                    const existingIndex = prevNotifications.findIndex(n => n.id === id);

                    if (status === 'start') {
                        if (prevNotifications.length < MAX_NOTIFICATIONS && existingIndex === -1) {
                            const newNotification = { id, fileName, status: 'progress', progress: 0, fileSize, message: null, timestamp: Date.now(), fadingOut: false };
                            return [...prevNotifications, newNotification];
                        } else { return prevNotifications; }
                    } else if (existingIndex !== -1) {
                        const updatedNotifications = [...prevNotifications];
                        const currentNotification = updatedNotifications[existingIndex];
                        if (notificationTimeouts.current[id]) { clearTimeout(notificationTimeouts.current[id].fadeTimer); clearTimeout(notificationTimeouts.current[id].removeTimer); delete notificationTimeouts.current[id]; }

                        if (status === 'progress') {
                            updatedNotifications[existingIndex] = { ...currentNotification, status: 'progress', progress, timestamp: Date.now(), fadingOut: false };
                        } else if (status === 'end') {
                            updatedNotifications[existingIndex] = { ...currentNotification, status: 'end', progress: 100, message: null, timestamp: Date.now(), fadingOut: false };
                            scheduleNotificationRemoval(id, NOTIFICATION_TIMEOUT_SUCCESS);
                        } else if (status === 'error') {
                            const translatedError = errorMessage ? `${t('notifications.errorPrefix')} ${errorMessage}` : t('notifications.unknownError');
                            updatedNotifications[existingIndex] = { ...currentNotification, status: 'error', progress: 100, message: translatedError, timestamp: Date.now(), fadingOut: false };
                            scheduleNotificationRemoval(id, NOTIFICATION_TIMEOUT_ERROR);
                        }
                        return updatedNotifications;
                    } else { return prevNotifications; }
                });
            }
            else if (message.type === 'serverSettings') {
                if (message.encoders && Array.isArray(message.encoders)) {
                    console.log('Dashboard: Received serverSettings with encoders:', message.encoders);
                    setDynamicEncoderOptions(message.encoders);
                }
            }
        }
    };
    window.addEventListener('message', handleWindowMessage);
    return () => {
        window.removeEventListener('message', handleWindowMessage);
        Object.values(notificationTimeouts.current).forEach(timers => { clearTimeout(timers.fadeTimer); clearTimeout(timers.removeTimer); });
        notificationTimeouts.current = {};
    };
  }, [hasReceivedGamepadData, scheduleNotificationRemoval, removeNotification, t]);


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

  // --- Generate translated commonResolutions ---
  const translatedCommonResolutions = commonResolutionValues.map((value, index) => {
      if (index === 0) {
          return { value: "", text: t('sections.screen.resolutionPresetSelect') };
      }
      // Look up the text using the value as part of the key in the 'raw' dictionary
      const translatedText = raw?.resolutionPresets?.[value] || value; // Fallback to value itself
      return { value: value, text: translatedText };
  });

  return (
    <>
      <div className={sidebarClasses}>
        {/* Header */}
        <div className="sidebar-header">
           <a href="https://github.com/selkies-project/selkies" target="_blank" rel="noopener noreferrer">
             {/* Pass t function to logo */}
             <SelkiesLogo width={30} height={30} t={t} />
           </a>
           <a href="https://github.com/selkies-project/selkies" target="_blank" rel="noopener noreferrer">
             <h2>{t('selkiesTitle')}</h2>
           </a>
           <div className="header-controls">
             <div className={`theme-toggle ${theme}`} onClick={toggleTheme} title={t('toggleThemeTitle')}>
               <svg className="icon moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
               <svg className="icon sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
             </div>
             <button className="header-action-button fullscreen-button" onClick={handleFullscreenRequest} title={t('fullscreenTitle')}>
               <FullscreenIcon />
             </button>
           </div>
        </div>

        {/* Action Buttons Section */}
        <div className="sidebar-action-buttons">
            <button className={`action-button ${isVideoActive ? 'active' : ''}`} onClick={handleVideoToggle} title={t(isVideoActive ? 'buttons.videoStreamDisableTitle' : 'buttons.videoStreamEnableTitle')}> <ScreenIcon /> </button>
            <button className={`action-button ${isAudioActive ? 'active' : ''}`} onClick={handleAudioToggle} title={t(isAudioActive ? 'buttons.audioStreamDisableTitle' : 'buttons.audioStreamEnableTitle')}> <SpeakerIcon /> </button>
            <button className={`action-button ${isMicrophoneActive ? 'active' : ''}`} onClick={handleMicrophoneToggle} title={t(isMicrophoneActive ? 'buttons.microphoneDisableTitle' : 'buttons.microphoneEnableTitle')}> <MicrophoneIcon /> </button>
            <button className={`action-button ${isGamepadEnabled ? 'active' : ''}`} onClick={handleGamepadToggle} title={t(isGamepadEnabled ? 'buttons.gamepadDisableTitle' : 'buttons.gamepadEnableTitle')}> <GamepadIcon /> </button>
        </div>

        {/* Video Settings Section */}
        <div className="sidebar-section">
            <div className="sidebar-section-header" onClick={() => toggleSection('settings')} role="button" aria-expanded={sectionsOpen.settings} aria-controls="settings-content" tabIndex="0" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('settings')}>
              <h3>{t('sections.video.title')}</h3>
              <span className="section-toggle-icon" aria-hidden="true">{sectionsOpen.settings ? <CaretUpIcon /> : <CaretDownIcon />}</span>
            </div>
            {sectionsOpen.settings && (
              <div className="sidebar-section-content" id="settings-content">
                <div className="dev-setting-item"> <label htmlFor="encoderSelect">{t('sections.video.encoderLabel')}</label> <select id="encoderSelect" value={encoder} onChange={handleEncoderChange}> {dynamicEncoderOptions.map(enc => (<option key={enc} value={enc}>{enc}</option>))} </select> </div>
                <div className="dev-setting-item"> <label htmlFor="framerateSlider">{t('sections.video.framerateLabel', { framerate: framerate })}</label> <input type="range" id="framerateSlider" min="0" max={framerateOptions.length - 1} step="1" value={framerateOptions.indexOf(framerate)} onChange={handleFramerateChange} /> </div>
                <div className="dev-setting-item"> <label htmlFor="videoBitrateSlider">{t('sections.video.bitrateLabel', { bitrate: videoBitRate / 1000 })}</label> <input type="range" id="videoBitrateSlider" min="0" max={videoBitrateOptions.length - 1} step="1" value={videoBitrateOptions.indexOf(videoBitRate)} onChange={handleVideoBitrateChange} /> </div>
                <div className="dev-setting-item">
                    <label htmlFor="videoBufferSizeSlider">
                        {videoBufferSize === 0
                            ? t('sections.video.bufferLabelImmediate')
                            : t('sections.video.bufferLabelFrames', { videoBufferSize: videoBufferSize })
                        }
                    </label>
                    <input type="range" id="videoBufferSizeSlider" min="0" max={videoBufferOptions.length - 1} step="1" value={videoBufferOptions.indexOf(videoBufferSize)} onChange={handleVideoBufferSizeChange} />
                </div>
              </div>
            )}
        </div>

        {/* Audio Settings Section */}
        <div className="sidebar-section">
             <div className="sidebar-section-header" onClick={() => toggleSection('audioSettings')} role="button" aria-expanded={sectionsOpen.audioSettings} aria-controls="audio-settings-content" tabIndex="0" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('audioSettings')}>
               <h3>{t('sections.audio.title')}</h3>
               <span className="section-toggle-icon" aria-hidden="true">{isLoadingAudioDevices ? <SpinnerIcon /> : (sectionsOpen.audioSettings ? <CaretUpIcon /> : <CaretDownIcon />)}</span>
             </div>
             {sectionsOpen.audioSettings && (
               <div className="sidebar-section-content" id="audio-settings-content">
                 <div className="dev-setting-item"> <label htmlFor="audioBitrateSlider">{t('sections.audio.bitrateLabel', { bitrate: audioBitRate / 1000 })}</label> <input type="range" id="audioBitrateSlider" min="0" max={audioBitrateOptions.length - 1} step="1" value={audioBitrateOptions.indexOf(audioBitRate)} onChange={handleAudioBitrateChange} /> </div>
                 <hr className="section-divider" />
                 {/* Display translated error */}
                 {audioDeviceError && (<div className="error-message">{audioDeviceError}</div>)}
                 <div className="dev-setting-item"> <label htmlFor="audioInputSelect">{t('sections.audio.inputLabel')}</label> <select id="audioInputSelect" value={selectedInputDeviceId} onChange={handleAudioInputChange} disabled={isLoadingAudioDevices || !!audioDeviceError} className="audio-device-select"> {audioInputDevices.map(device => (<option key={device.deviceId} value={device.deviceId}>{device.label}</option>))} </select> </div>
                 {isOutputSelectionSupported && (<div className="dev-setting-item"> <label htmlFor="audioOutputSelect">{t('sections.audio.outputLabel')}</label> <select id="audioOutputSelect" value={selectedOutputDeviceId} onChange={handleAudioOutputChange} disabled={isLoadingAudioDevices || !!audioDeviceError} className="audio-device-select"> {audioOutputDevices.map(device => (<option key={device.deviceId} value={device.deviceId}>{device.label}</option>))} </select> </div>)}
                 {!isOutputSelectionSupported && !isLoadingAudioDevices && !audioDeviceError && (<p className="device-support-notice">{t('sections.audio.outputNotSupported')}</p>)}
               </div>
             )}
        </div>

        {/* Screen Settings Section */}
        <div className="sidebar-section">
             <div className="sidebar-section-header" onClick={() => toggleSection('screenSettings')} role="button" aria-expanded={sectionsOpen.screenSettings} aria-controls="screen-settings-content" tabIndex="0" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('screenSettings')}>
               <h3>{t('sections.screen.title')}</h3>
               <span className="section-toggle-icon" aria-hidden="true">{sectionsOpen.screenSettings ? <CaretUpIcon /> : <CaretDownIcon />}</span>
             </div>
             {sectionsOpen.screenSettings && (
               <div className="sidebar-section-content" id="screen-settings-content">
                 <div className="dev-setting-item">
                   <label htmlFor="resolutionPresetSelect">{t('sections.screen.presetLabel')}</label>
                   <select id="resolutionPresetSelect" value={presetValue} onChange={handlePresetChange}>
                     {translatedCommonResolutions.map((res, index) => (
                       <option key={index} value={res.value} disabled={index === 0}>
                         {res.text}
                       </option>
                     ))}
                   </select>
                 </div>
                 <div className="resolution-manual-inputs">
                    <div className="dev-setting-item manual-input-item">
                      <label htmlFor="manualWidthInput">{t('sections.screen.widthLabel')}</label>
                      <input class="allow-native-input" type="number" id="manualWidthInput" min="1" step="2" placeholder={t('sections.screen.widthPlaceholder')} value={manualWidth} onChange={handleManualWidthChange} />
                    </div>
                    <div className="dev-setting-item manual-input-item">
                      <label htmlFor="manualHeightInput">{t('sections.screen.heightLabel')}</label>
                      <input class="allow-native-input" type="number" id="manualHeightInput" min="1" step="2" placeholder={t('sections.screen.heightPlaceholder')} value={manualHeight} onChange={handleManualHeightChange} />
                    </div>
                 </div>
                 <div className="resolution-action-buttons">
                     <button className="resolution-button" onClick={handleSetManualResolution}>{t('sections.screen.setManualButton')}</button>
                     <button className="resolution-button reset-button" onClick={handleResetResolution}>{t('sections.screen.resetButton')}</button>
                 </div>
                 <button
                     className={`resolution-button toggle-button ${scaleLocally ? 'active' : ''}`}
                     onClick={handleScaleLocallyToggle}
                     style={{ marginTop: '10px' }}
                     title={t(scaleLocally ? 'sections.screen.scaleLocallyTitleDisable' : 'sections.screen.scaleLocallyTitleEnable')}
                 >
                     {t('sections.screen.scaleLocallyLabel')} {t(scaleLocally ? 'sections.screen.scaleLocallyOn' : 'sections.screen.scaleLocallyOff')}
                 </button>
               </div>
             )}
        </div>

        {/* Stats Section */}
        <div className="sidebar-section">
             <div className="sidebar-section-header" onClick={() => toggleSection('stats')} role="button" aria-expanded={sectionsOpen.stats} aria-controls="stats-content" tabIndex="0" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('stats')}>
               <h3>{t('sections.stats.title')}</h3>
               <span className="section-toggle-icon" aria-hidden="true">{sectionsOpen.stats ? <CaretUpIcon /> : <CaretDownIcon />}</span>
             </div>
             {sectionsOpen.stats && (
               <div className="sidebar-section-content" id="stats-content">
                 <div className="stats-gauges">
                    {/* CPU Gauge */}
                    <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'cpu')} onMouseLeave={handleMouseLeave}>
                        <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}> <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} /> <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: cpuOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} /> <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {Math.round(Math.max(0, Math.min(100, cpuPercent || 0)))}% </text> </svg>
                        <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>{t('sections.stats.cpuLabel')}</div>
                    </div>
                    {/* GPU Gauge */}
                    <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'gpu')} onMouseLeave={handleMouseLeave}>
                         <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}> <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} /> <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: gpuOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} /> <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {Math.round(Math.max(0, Math.min(100, gpuPercent || 0)))}% </text> </svg>
                         <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>{t('sections.stats.gpuLabel')}</div>
                    </div>
                    {/* Sys Mem Gauge */}
                     <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'sysmem')} onMouseLeave={handleMouseLeave}>
                          <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}> <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} /> <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: sysMemOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} /> <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {Math.round(Math.max(0, Math.min(100, sysMemPercent || 0)))}% </text> </svg>
                          <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>{t('sections.stats.sysMemLabel')}</div>
                     </div>
                    {/* GPU Mem Gauge */}
                    <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'gpumem')} onMouseLeave={handleMouseLeave}>
                         <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}> <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} /> <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: gpuMemOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} /> <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {Math.round(Math.max(0, Math.min(100, gpuMemPercent || 0)))}% </text> </svg>
                         <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>{t('sections.stats.gpuMemLabel')}</div>
                    </div>
                    {/* FPS Gauge */}
                    <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'fps')} onMouseLeave={handleMouseLeave}>
                         <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}> <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} /> <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: fpsOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} /> <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {clientFps} </text> </svg>
                         <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>{t('sections.stats.fpsLabel')}</div>
                    </div>
                    {/* Audio Gauge */}
                    <div className="gauge-container" onMouseEnter={(e) => handleMouseEnter(e, 'audio')} onMouseLeave={handleMouseLeave}>
                         <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}> <circle stroke="var(--item-border)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} /> <circle stroke="var(--sidebar-header-color)" fill="transparent" strokeWidth={gaugeStrokeWidth} r={gaugeRadius} cx={gaugeCenter} cy={gaugeCenter} transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`} style={{ strokeDasharray: gaugeCircumference, strokeDashoffset: audioBufferOffset, transition: 'stroke-dashoffset 0.3s ease-in-out', strokeLinecap: 'round' }} /> <text x={gaugeCenter} y={gaugeCenter} textAnchor="middle" dominantBaseline="central" fontSize={`${gaugeSize / 5}px`} fill="var(--sidebar-text)" fontWeight="bold"> {audioBuffer} </text> </svg>
                         <div className="gauge-label" style={{ fontSize: `${gaugeSize / 8}px` }}>{t('sections.stats.audioLabel')}</div>
                    </div>
                 </div>
               </div>
             )}
        </div>

        {/* Clipboard Section */}
        <div className="sidebar-section">
             <div className="sidebar-section-header" onClick={() => toggleSection('clipboard')} role="button" aria-expanded={sectionsOpen.clipboard} aria-controls="clipboard-content" tabIndex="0" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('clipboard')}>
               <h3>{t('sections.clipboard.title')}</h3>
               <span className="section-toggle-icon" aria-hidden="true">{sectionsOpen.clipboard ? <CaretUpIcon /> : <CaretDownIcon />}</span>
             </div>
             {sectionsOpen.clipboard && (
               <div className="sidebar-section-content" id="clipboard-content">
                 <div className="dashboard-clipboard-item">
                    <label htmlFor="dashboardClipboardTextarea">{t('sections.clipboard.label')}</label>
                    <textarea class="allow-native-input" id="dashboardClipboardTextarea" value={dashboardClipboardContent} onChange={handleClipboardChange} onBlur={handleClipboardBlur} rows="5" placeholder={t('sections.clipboard.placeholder')} />
                 </div>
               </div>
             )}
        </div>

        {/* Files Section */}
        <div className="sidebar-section">
             <div className="sidebar-section-header" onClick={() => toggleSection('files')} role="button" aria-expanded={sectionsOpen.files} aria-controls="files-content" tabIndex="0" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('files')}>
               <h3>{t('sections.files.title')}</h3>
               <span className="section-toggle-icon" aria-hidden="true">{sectionsOpen.files ? <CaretUpIcon /> : <CaretDownIcon />}</span>
             </div>
             {sectionsOpen.files && (
               <div className="sidebar-section-content" id="files-content">
                 <button
                     className="resolution-button"
                     onClick={handleUploadClick}
                     style={{ marginTop: '5px', marginBottom: '5px' }}
                     title={t('sections.files.uploadButtonTitle')}
                 >
                     {t('sections.files.uploadButton')}
                 </button>
                 <button
                     className="resolution-button"
                     onClick={toggleFilesModal}
                     style={{ marginTop: '5px', marginBottom: '5px' }}
                     title={t('sections.files.downloadButtonTitle', 'Download Files')}
                 >
                     {t('sections.files.downloadButtonTitle', 'Download Files')}
                 </button>
               </div>
             )}
        </div>

        {/* Apps Section */}
        <div className="sidebar-section">
            <div className="sidebar-section-header" onClick={() => toggleSection('apps')} role="button" aria-expanded={sectionsOpen.apps} aria-controls="apps-content" tabIndex="0" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('apps')}>
              <h3>{t('sections.apps.title', 'Apps')}</h3>
              <span className="section-toggle-icon" aria-hidden="true">{sectionsOpen.apps ? <CaretUpIcon /> : <CaretDownIcon />}</span>
            </div>
            {sectionsOpen.apps && (
              <div className="sidebar-section-content" id="apps-content">
                <button
                    className="resolution-button"
                    onClick={toggleAppsModal}
                    style={{ marginTop: '5px', marginBottom: '5px' }}
                    title={t('sections.apps.openButtonTitle', 'Manage Apps')}
                >
                    <AppsIcon /> <span style={{marginLeft: '8px'}}>{t('sections.apps.openButton', 'Manage Apps')}</span>
                </button>
              </div>
            )}
        </div>

        {/* Gamepads Section */}
        {hasReceivedGamepadData && (
          <div className="sidebar-section">
              <div className="sidebar-section-header" onClick={() => toggleSection('gamepads')} role="button" aria-expanded={sectionsOpen.gamepads} aria-controls="gamepads-content" tabIndex="0" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSection('gamepads')}>
                <h3>{t('sections.gamepads.title')}</h3>
                <span className="section-toggle-icon" aria-hidden="true">{sectionsOpen.gamepads ? <CaretUpIcon /> : <CaretDownIcon />}</span>
              </div>
              {sectionsOpen.gamepads && (
                <div className="sidebar-section-content" id="gamepads-content">
                  {Object.keys(gamepadStates).length === 0 ? (
                    <p className="no-gamepads-message">{t('sections.gamepads.noActivity')}</p>
                  ) : (
                    Object.keys(gamepadStates).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map(gpIndexStr => {
                        const gpIndex = parseInt(gpIndexStr, 10);
                        // Pass t down if GamepadVisualizer needs translated text in the future
                        return (<GamepadVisualizer key={gpIndex} gamepadIndex={gpIndex} gamepadState={gamepadStates[gpIndex]} /* t={t} */ />);
                    })
                  )}
                </div>
              )}
          </div>
        )}
      </div> {/* End of sidebar div */}

      {/* Tooltip Display */}
      {hoveredItem && (
          <div className="gauge-tooltip" style={{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }}>
              {/* getTooltipContent already uses t() */}
              {getTooltipContent(hoveredItem)}
          </div>
      )}

      {/* Notification Container */}
      <div className={`notification-container theme-${theme}`}>
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`notification-item ${notification.status} ${notification.fadingOut ? 'fade-out' : ''}`}
            role="alert" aria-live="polite"
          >
            <div className="notification-header">
                <span className="notification-filename" title={notification.fileName}>
                    {notification.fileName} {/* Filename is usually not translated */}
                </span>
                <button
                    className="notification-close-button"
                    onClick={() => removeNotification(notification.id)}
                    // Use translated aria-label
                    aria-label={t('notifications.closeButtonAlt', { fileName: notification.fileName })}
                >
                    &times;
                </button>
            </div>
            <div className="notification-body">
                {notification.status === 'progress' && (
                    <>
                        <span className="notification-status-text">{t('notifications.uploading', { progress: notification.progress })}</span>
                        <div className="notification-progress-bar-outer"><div className="notification-progress-bar-inner" style={{ width: `${notification.progress}%` }} /></div>
                    </>
                )}
                {notification.status === 'end' && (
                     <>
                        <span className="notification-status-text">{t('notifications.uploadComplete')}</span>
                        <div className="notification-progress-bar-outer"><div className="notification-progress-bar-inner" style={{ width: `100%` }} /></div>
                     </>
                )}
                {notification.status === 'error' && (
                    <>
                        <span className="notification-status-text error-text">{t('notifications.uploadFailed')}</span>
                        <div className="notification-progress-bar-outer"><div className="notification-progress-bar-inner" style={{ width: `100%` }} /></div>
                        {/* Display the potentially translated error message from state */}
                        {notification.message && <p className="notification-error-message">{notification.message}</p>}
                    </>
                )}
            </div>
          </div>
        ))}
      </div>

      {/* Files Modal */}
      {isFilesModalOpen && (
        <div className="files-modal">
            <button className="files-modal-close" onClick={toggleFilesModal} aria-label="Close files modal">&times;</button>
            <iframe src="/files" title="Downloadable Files" />
        </div>
      )}
      {/* Apps Modal */}
      {isAppsModalOpen && (
        <AppsModal
            isOpen={isAppsModalOpen}
            onClose={toggleAppsModal}
            t={t}
        />
      )}
      {/* Keyboard Pop Button */}
      {isMobile && (
        <button
          className={`virtual-keyboard-button theme-${theme}`}
          onClick={handleShowVirtualKeyboard}
          title={t('buttons.virtualKeyboardButtonTitle', 'Pop Keyboard')} 
          aria-label={t('buttons.virtualKeyboardButtonTitle', 'Pop Keyboard')}
        >
          <KeyboardIcon />
        </button>
      )}
    </>
  );
}

export default Sidebar;

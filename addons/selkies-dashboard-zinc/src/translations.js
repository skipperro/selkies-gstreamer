// src/translations.js

// Helper function for simple variable replacement (e.g., {name})
// Handles only one level deep, no complex formatting.
const simpleInterpolate = (str, variables) => {
    if (!variables) return str;
    return str.replace(/\{(\w+)\}/g, (match, key) => {
        return variables.hasOwnProperty(key) ? variables[key] : match;
    });
};

// --- English Translations (Default) ---
const en = {
    selkiesLogoAlt: "Selkies Logo",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "Toggle Theme",
    fullscreenTitle: "Enter Fullscreen",
    buttons: {
        videoStreamEnableTitle: "Enable Video Stream",
        videoStreamDisableTitle: "Disable Video Stream",
        audioStreamEnableTitle: "Enable Audio Stream",
        audioStreamDisableTitle: "Disable Audio Stream",
        microphoneEnableTitle: "Enable Microphone",
        microphoneDisableTitle: "Disable Microphone",
        gamepadEnableTitle: "Enable Gamepad Input",
        gamepadDisableTitle: "Disable Gamepad Input",
        virtualKeyboardButtonTitle: "Pop Keyboard",
    },
    sections: {
        video: {
            title: "Video Settings",
            encoderLabel: "Encoder:",
            framerateLabel: "Frames per second ({framerate} FPS):",
            bitrateLabel: "Video Bitrate ({bitrate} Mbps):",
            bufferLabelImmediate: "Video Buffer Size (0 (Immediate)):",
            bufferLabelFrames: "Video Buffer Size ({videoBufferSize} frames):",
        },
        audio: {
            title: "Audio Settings",
            bitrateLabel: "Audio Bitrate ({bitrate} kbps):",
            inputLabel: "Input (Microphone):",
            outputLabel: "Output (Speaker):",
            outputNotSupported: "Output device selection not supported by this browser.",
            deviceErrorDefault: "Error listing audio devices: {errorName}",
            deviceErrorPermission: "Permission denied. Please allow microphone access in browser settings to select devices.",
            deviceErrorNotFound: "No audio devices found.",
            defaultInputLabelFallback: "Input Device {index}",
            defaultOutputLabelFallback: "Output Device {index}",
        },
        screen: {
            title: "Screen Settings",
            presetLabel: "Preset:",
            resolutionPresetSelect: "-- Select Preset --",
            widthLabel: "Width:",
            heightLabel: "Height:",
            widthPlaceholder: "e.g., 1920",
            heightPlaceholder: "e.g., 1080",
            setManualButton: "Set Manual Resolution",
            resetButton: "Reset to Window",
            scaleLocallyLabel: "Scale Locally:",
            scaleLocallyOn: "ON",
            scaleLocallyOff: "OFF",
            scaleLocallyTitleEnable: "Enable Local Scaling (Maintain Aspect Ratio)",
            scaleLocallyTitleDisable: "Disable Local Scaling (Use Exact Resolution)",
        },
        stats: {
            title: "Stats",
            cpuLabel: "CPU",
            gpuLabel: "GPU Usage",
            sysMemLabel: "Sys Mem",
            gpuMemLabel: "GPU Mem",
            fpsLabel: "FPS",
            audioLabel: "Audio",
            tooltipCpu: "CPU Usage: {value}%",
            tooltipGpu: "GPU Usage: {value}%",
            tooltipSysMem: "System Memory: {used} / {total}",
            tooltipGpuMem: "GPU Memory: {used} / {total}",
            tooltipFps: "Client FPS: {value}",
            tooltipAudio: "Audio Buffers: {value}",
            tooltipMemoryNA: "N/A",
        },
        clipboard: {
            title: "Clipboard",
            label: "Server Clipboard:",
            placeholder: "Clipboard content from server...",
        },
        files: {
            title: "Files",
            uploadButton: "Upload Files",
            uploadButtonTitle: "Upload files to the remote session",
            downloadButtonTitle: "Download Files",
        },
        gamepads: {
            title: "Gamepads",
            noActivity: "No physical gamepad activity detected yet...",
            touchEnableTitle: "Enable Touch Gamepad",
            touchDisableTitle: "Disable Touch Gamepad",
            touchActiveLabel: "Touch Gamepad: ON",
            touchInactiveLabel: "Touch Gamepad: OFF",
            physicalHiddenForTouch: "Physical gamepad display is hidden while touch gamepad is active.",
            noActivityMobileOrEnableTouch: "No physical gamepads. Enable touch gamepad or connect a controller."
        },
        apps: {
          title: "Apps",
          openButtonTitle: "Manage Apps", // Tooltip for the button
          openButton: "Manage Apps"      // Text on the button
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Laptop)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Close apps modal",
        loading: "Loading apps...",
        errorLoading: "Failed to load app data. Please try again.",
        searchPlaceholder: "Search apps...",
        noAppsFound: "No apps found matching your search.",
        backButton: "Back to list",
        installButton: "Install",
        updateButton: "Update",
        removeButton: "Remove",
        installingMessage: "Simulating install for: {{appName}}",
        removingMessage: "Simulating removal for: {{appName}}",
        updatingMessage: "Simulating update for: {{appName}}",
        installedBadge: "Installed"
    },
    notifications: {
        closeButtonAlt: "Close notification for {fileName}",
        uploading: "Uploading... {progress}%",
        uploadComplete: "Upload Complete",
        uploadFailed: "Upload Failed",
        errorPrefix: "Error:",
        unknownError: "An unknown error occurred.",
    },
    alerts: {
        invalidResolution: "Please enter valid positive integers for Width and Height.",
    },
    byteUnits: ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 Bytes",
    filesModal: {
        closeAlt: "Close files modal",
        iframeTitle: "Downloadable Files"
    }
};

// --- Spanish Translations (Complete) ---
const es = {
    selkiesLogoAlt: "Logo de Selkies",
    selkiesTitle: "Selkies", // Proper noun
    toggleThemeTitle: "Cambiar Tema",
    fullscreenTitle: "Entrar en Pantalla Completa",
    buttons: {
        videoStreamEnableTitle: "Activar Stream de Vídeo",
        videoStreamDisableTitle: "Desactivar Stream de Vídeo",
        audioStreamEnableTitle: "Activar Stream de Audio",
        audioStreamDisableTitle: "Desactivar Stream de Audio",
        microphoneEnableTitle: "Activar Micrófono",
        microphoneDisableTitle: "Desactivar Micrófono",
        gamepadEnableTitle: "Activar Entrada de Mando",
        gamepadDisableTitle: "Desactivar Entrada de Mando",
        virtualKeyboardButtonTitle: "Mostrar Teclado",
    },
    sections: {
        video: {
            title: "Configuración de Vídeo",
            encoderLabel: "Codificador:",
            framerateLabel: "Fotogramas por segundo ({framerate} FPS):",
            bitrateLabel: "Tasa de bits de vídeo ({bitrate} Mbps):",
            bufferLabelImmediate: "Tamaño del Búfer de Vídeo (0 (Inmediato)):",
            bufferLabelFrames: "Tamaño del Búfer de Vídeo ({videoBufferSize} fotogramas):",
        },
        audio: {
             title: "Configuración de Audio",
             bitrateLabel: "Tasa de bits de audio ({bitrate} kbps):",
             inputLabel: "Entrada (Micrófono):",
             outputLabel: "Salida (Altavoz):",
             outputNotSupported: "La selección de dispositivo de salida no es compatible con este navegador.",
             deviceErrorDefault: "Error al listar dispositivos de audio: {errorName}",
             deviceErrorPermission: "Permiso denegado. Permita el acceso al micrófono en la configuración del navegador para seleccionar dispositivos.",
             deviceErrorNotFound: "No se encontraron dispositivos de audio.",
             defaultInputLabelFallback: "Dispositivo de Entrada {index}",
             defaultOutputLabelFallback: "Dispositivo de Salida {index}",
        },
        screen: {
             title: "Configuración de Pantalla",
             presetLabel: "Preajuste:",
             resolutionPresetSelect: "-- Seleccionar Preajuste --",
             widthLabel: "Ancho:",
             heightLabel: "Alto:",
             widthPlaceholder: "ej., 1920",
             heightPlaceholder: "ej., 1080",
             setManualButton: "Establecer Resolución Manual",
             resetButton: "Restablecer a Ventana",
             scaleLocallyLabel: "Escalar Localmente:",
             scaleLocallyOn: "SÍ",
             scaleLocallyOff: "NO",
             scaleLocallyTitleEnable: "Activar Escalado Local (Mantener Relación de Aspecto)",
             scaleLocallyTitleDisable: "Desactivar Escalado Local (Usar Resolución Exacta)",
        },
        stats: {
             title: "Estadísticas",
             cpuLabel: "CPU",
             gpuLabel: "Uso de GPU",
             sysMemLabel: "Mem Sistema",
             gpuMemLabel: "Mem GPU",
             fpsLabel: "FPS",
             audioLabel: "Audio",
             tooltipCpu: "Uso de CPU: {value}%",
             tooltipGpu: "Uso de GPU: {value}%",
             tooltipSysMem: "Memoria del Sistema: {used} / {total}",
             tooltipGpuMem: "Memoria GPU: {used} / {total}",
             tooltipFps: "FPS del Cliente: {value}",
             tooltipAudio: "Búferes de Audio: {value}",
             tooltipMemoryNA: "N/D", // N/D = No Disponible
        },
        clipboard: {
             title: "Portapapeles",
             label: "Portapapeles del Servidor:",
             placeholder: "Contenido del portapapeles del servidor...",
        },
        files: {
             title: "Archivos",
             uploadButton: "Subir Archivos",
             uploadButtonTitle: "Subir archivos a la sesión remota",
             downloadButtonTitle: "Descargar Archivos",
        },
        gamepads: {
             title: "Mandos",
             noActivity: "Aún no se ha detectado actividad del mando...",
             touchEnableTitle: "Activar Mando Táctil",
             touchDisableTitle: "Desactivar Mando Táctil",
             touchActiveLabel: "Mando Táctil: ENCENDIDO",
             touchInactiveLabel: "Mando Táctil: APAGADO",
             physicalHiddenForTouch: "La visualización de mandos físicos está oculta mientras el mando táctil está activo.",
             noActivityMobileOrEnableTouch: "No hay mandos físicos. Active el mando táctil o conecte un controlador."
        },
        apps: { 
          title: "Aplicaciones",
          openButtonTitle: "Gestionar Aplicaciones",
          openButton: "Gestionar Aplicaciones"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Portátil)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Cerrar modal de aplicaciones",
        loading: "Cargando aplicaciones...",
        errorLoading: "Error al cargar los datos de las aplicaciones. Por favor, inténtalo de nuevo.",
        searchPlaceholder: "Buscar aplicaciones...",
        noAppsFound: "No se encontraron aplicaciones que coincidan con tu búsqueda.",
        backButton: "Volver a la lista",
        installButton: "Instalar",
        updateButton: "Actualizar",
        removeButton: "Eliminar",
        installingMessage: "Simulando instalación para: {{appName}}",
        removingMessage: "Simulando eliminación para: {{appName}}",
        updatingMessage: "Simulando actualización para: {{appName}}",
        installedBadge: "Instalado"
    },
    notifications: {
        closeButtonAlt: "Cerrar notificación para {fileName}",
        uploading: "Subiendo... {progress}%",
        uploadComplete: "Subida Completa",
        uploadFailed: "Subida Fallida",
        errorPrefix: "Error:",
        unknownError: "Ocurrió un error desconocido.",
    },
    alerts: {
        invalidResolution: "Por favor, introduzca números enteros positivos válidos para Ancho y Alto.",
    },
    byteUnits: ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 Bytes",
    filesModal: {
        closeAlt: "Cerrar modal de archivos",
        iframeTitle: "Archivos Descargables"
    }
};

// --- Chinese (Simplified) Translations ---
const zh = {
    selkiesLogoAlt: "Selkies 徽标",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "切换主题",
    fullscreenTitle: "进入全屏",
    buttons: {
        videoStreamEnableTitle: "启用视频流",
        videoStreamDisableTitle: "禁用视频流",
        audioStreamEnableTitle: "启用音频流",
        audioStreamDisableTitle: "禁用音频流",
        microphoneEnableTitle: "启用麦克风",
        microphoneDisableTitle: "禁用麦克风",
        gamepadEnableTitle: "启用游戏手柄输入",
        gamepadDisableTitle: "禁用游戏手柄输入",
        virtualKeyboardButtonTitle: "弹出键盘",
    },
    sections: {
        video: {
            title: "视频设置",
            encoderLabel: "编码器:",
            framerateLabel: "帧率 ({framerate} FPS):",
            bitrateLabel: "视频比特率 ({bitrate} Mbps):",
            bufferLabelImmediate: "视频缓冲大小 (0 (立即)):",
            bufferLabelFrames: "视频缓冲大小 ({videoBufferSize} 帧):",
        },
        audio: {
            title: "音频设置",
            bitrateLabel: "音频比特率 ({bitrate} kbps):",
            inputLabel: "输入 (麦克风):",
            outputLabel: "输出 (扬声器):",
            outputNotSupported: "此浏览器不支持输出设备选择。",
            deviceErrorDefault: "列出音频设备时出错: {errorName}",
            deviceErrorPermission: "权限被拒绝。请在浏览器设置中允许麦克风访问以选择设备。",
            deviceErrorNotFound: "未找到音频设备。",
            defaultInputLabelFallback: "输入设备 {index}",
            defaultOutputLabelFallback: "输出设备 {index}",
        },
        screen: {
            title: "屏幕设置",
            presetLabel: "预设:",
            resolutionPresetSelect: "-- 选择预设 --",
            widthLabel: "宽度:",
            heightLabel: "高度:",
            widthPlaceholder: "例如 1920",
            heightPlaceholder: "例如 1080",
            setManualButton: "设置手动分辨率",
            resetButton: "重置为窗口大小",
            scaleLocallyLabel: "本地缩放:",
            scaleLocallyOn: "开",
            scaleLocallyOff: "关",
            scaleLocallyTitleEnable: "启用本地缩放 (保持宽高比)",
            scaleLocallyTitleDisable: "禁用本地缩放 (使用精确分辨率)",
        },
        stats: {
            title: "统计信息",
            cpuLabel: "CPU",
            gpuLabel: "GPU 使用率",
            sysMemLabel: "系统内存",
            gpuMemLabel: "GPU 内存",
            fpsLabel: "FPS",
            audioLabel: "音频",
            tooltipCpu: "CPU 使用率: {value}%",
            tooltipGpu: "GPU 使用率: {value}%",
            tooltipSysMem: "系统内存: {used} / {total}",
            tooltipGpuMem: "GPU 内存: {used} / {total}",
            tooltipFps: "客户端 FPS: {value}",
            tooltipAudio: "音频缓冲区: {value}",
            tooltipMemoryNA: "不可用",
        },
        clipboard: {
            title: "剪贴板",
            label: "服务器剪贴板:",
            placeholder: "来自服务器的剪贴板内容...",
        },
        files: {
            title: "文件",
            uploadButton: "上传文件",
            uploadButtonTitle: "上传文件到远程会话",
            downloadButtonTitle: "下载文件",
        },
        gamepads: {
            title: "游戏手柄",
            noActivity: "尚未检测到游戏手柄活动...",
            touchEnableTitle: "启用触摸手柄",
            touchDisableTitle: "禁用触摸手柄",
            touchActiveLabel: "触摸手柄: 开",
            touchInactiveLabel: "触摸手柄: 关",
            physicalHiddenForTouch: "触摸手柄激活时，物理手柄显示将被隐藏。",
            noActivityMobileOrEnableTouch: "没有物理手柄。请启用触摸手柄或连接控制器。"
        },
        apps: { 
          title: "应用程序",
          openButtonTitle: "管理应用程序",
          openButton: "管理应用程序"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (笔记本)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "关闭应用程序模态框",
        loading: "正在加载应用程序...",
        errorLoading: "加载应用程序数据失败。请重试。",
        searchPlaceholder: "搜索应用程序...",
        noAppsFound: "未找到与您的搜索匹配的应用程序。",
        backButton: "返回列表",
        installButton: "安装",
        updateButton: "更新",
        removeButton: "移除",
        installingMessage: "模拟安装: {{appName}}",
        removingMessage: "模拟移除: {{appName}}",
        updatingMessage: "模拟更新: {{appName}}",
        installedBadge: "已安装"
    },
    notifications: {
        closeButtonAlt: "关闭 {fileName} 的通知",
        uploading: "正在上传... {progress}%",
        uploadComplete: "上传完成",
        uploadFailed: "上传失败",
        errorPrefix: "错误:",
        unknownError: "发生未知错误。",
    },
    alerts: {
        invalidResolution: "请输入有效的正整数作为宽度和高度。",
    },
    byteUnits: ['字节', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 字节",
    filesModal: {
        closeAlt: "关闭文件模态框",
        iframeTitle: "可下载文件"
    }
};

// --- Hindi Translations ---
const hi = {
    selkiesLogoAlt: "सेल्कीस लोगो",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "थीम बदलें",
    fullscreenTitle: "फुलस्क्रीन दर्ज करें",
    buttons: {
        videoStreamEnableTitle: "वीडियो स्ट्रीम सक्षम करें",
        videoStreamDisableTitle: "वीडियो स्ट्रीम अक्षम करें",
        audioStreamEnableTitle: "ऑडियो स्ट्रीम सक्षम करें",
        audioStreamDisableTitle: "ऑडियो स्ट्रीम अक्षम करें",
        microphoneEnableTitle: "माइक्रोफ़ोन सक्षम करें",
        microphoneDisableTitle: "माइक्रोफ़ोन अक्षम करें",
        gamepadEnableTitle: "गेमपैड इनपुट सक्षम करें",
        gamepadDisableTitle: "गेमपैड इनपुट अक्षम करें",
        virtualKeyboardButtonTitle: "कीबोर्ड दिखाएँ",
    },
    sections: {
        video: {
            title: "वीडियो सेटिंग्स",
            encoderLabel: "एन्कोडर:",
            framerateLabel: "फ्रेम प्रति सेकंड ({framerate} FPS):",
            bitrateLabel: "वीडियो बिटरेट ({bitrate} Mbps):",
            bufferLabelImmediate: "वीडियो बफर आकार (0 (तत्काल)):",
            bufferLabelFrames: "वीडियो बफर आकार ({videoBufferSize} फ्रेम):",
        },
        audio: {
            title: "ऑडियो सेटिंग्स",
            bitrateLabel: "ऑडियो बिटरेट ({bitrate} kbps):",
            inputLabel: "इनपुट (माइक्रोफ़ोन):",
            outputLabel: "आउटपुट (स्पीकर):",
            outputNotSupported: "इस ब्राउज़र द्वारा आउटपुट डिवाइस चयन समर्थित नहीं है।",
            deviceErrorDefault: "ऑडियो डिवाइस सूचीबद्ध करने में त्रुटि: {errorName}",
            deviceErrorPermission: "अनुमति अस्वीकृत। डिवाइस चुनने के लिए कृपया ब्राउज़र सेटिंग्स में माइक्रोफ़ोन एक्सेस की अनुमति दें।",
            deviceErrorNotFound: "कोई ऑडियो डिवाइस नहीं मिला।",
            defaultInputLabelFallback: "इनपुट डिवाइस {index}",
            defaultOutputLabelFallback: "आउटपुट डिवाइस {index}",
        },
        screen: {
            title: "स्क्रीन सेटिंग्स",
            presetLabel: "प्रीसेट:",
            resolutionPresetSelect: "-- प्रीसेट चुनें --",
            widthLabel: "चौड़ाई:",
            heightLabel: "ऊंचाई:",
            widthPlaceholder: "उदा. 1920",
            heightPlaceholder: "उदा. 1080",
            setManualButton: "मैनुअल रिज़ॉल्यूशन सेट करें",
            resetButton: "विंडो पर रीसेट करें",
            scaleLocallyLabel: "स्थानीय रूप से स्केल करें:",
            scaleLocallyOn: "चालू",
            scaleLocallyOff: "बंद",
            scaleLocallyTitleEnable: "स्थानीय स्केलिंग सक्षम करें (पहलू अनुपात बनाए रखें)",
            scaleLocallyTitleDisable: "स्थानीय स्केलिंग अक्षम करें (सटीक रिज़ॉल्यूशन का उपयोग करें)",
        },
        stats: {
            title: "आँकड़े",
            cpuLabel: "CPU",
            gpuLabel: "GPU उपयोग",
            sysMemLabel: "सिस्टम मेम",
            gpuMemLabel: "GPU मेम",
            fpsLabel: "FPS",
            audioLabel: "ऑडियो",
            tooltipCpu: "CPU उपयोग: {value}%",
            tooltipGpu: "GPU उपयोग: {value}%",
            tooltipSysMem: "सिस्टम मेमोरी: {used} / {total}",
            tooltipGpuMem: "GPU मेमोरी: {used} / {total}",
            tooltipFps: "क्लाइंट FPS: {value}",
            tooltipAudio: "ऑडियो बफ़र्स: {value}",
            tooltipMemoryNA: "लागू नहीं",
        },
        clipboard: {
            title: "क्लिपबोर्ड",
            label: "सर्वर क्लिपबोर्ड:",
            placeholder: "सर्वर से क्लिपबोर्ड सामग्री...",
        },
        files: {
            title: "फ़ाइलें",
            uploadButton: "फ़ाइलें अपलोड करें",
            uploadButtonTitle: "रिमोट सेशन में फ़ाइलें अपलोड करें",
            downloadButtonTitle: "फ़ाइलें डाउनलोड करें",
        },
        gamepads: {
            title: "गेमपैड",
            noActivity: "अभी तक कोई गेमपैड गतिविधि का पता नहीं चला है...",
            touchEnableTitle: "टच गेमपैड सक्षम करें",
            touchDisableTitle: "टच गेमपैड अक्षम करें",
            touchActiveLabel: "टच गेमपैड: चालू",
            touchInactiveLabel: "टच गेमपैड: बंद",
            physicalHiddenForTouch: "टच गेमपैड सक्रिय होने पर भौतिक गेमपैड डिस्प्ले छिपा रहता है।",
            noActivityMobileOrEnableTouch: "कोई भौतिक गेमपैड नहीं। टच गेमपैड सक्षम करें या नियंत्रक कनेक्ट करें।"
        },
        apps: {
          title: "ऐप्स",
          openButtonTitle: "ऐप्स प्रबंधित करें",
          openButton: "ऐप्स प्रबंधित करें"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (लैपटॉप)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "ऐप्स मोडल बंद करें",
        loading: "ऐप्स लोड हो रहे हैं...",
        errorLoading: "ऐप डेटा लोड करने में विफल। कृपया पुनः प्रयास करें।",
        searchPlaceholder: "ऐप्स खोजें...",
        noAppsFound: "आपकी खोज से मेल खाने वाले कोई ऐप्स नहीं मिले।",
        backButton: "सूची पर वापस जाएं",
        installButton: "इंस्टॉल करें",
        updateButton: "अपडेट करें",
        removeButton: "हटाएं",
        installingMessage: "इसके लिए इंस्टॉलेशन का अनुकरण किया जा रहा है: {{appName}}",
        removingMessage: "इसके लिए हटाने का अनुकरण किया जा रहा है: {{appName}}",
        updatingMessage: "इसके लिए अपडेट का अनुकरण किया जा रहा है: {{appName}}",
        installedBadge: "इंस्टॉल किया गया"
    },
    notifications: {
        closeButtonAlt: "{fileName} के लिए अधिसूचना बंद करें",
        uploading: "अपलोड हो रहा है... {progress}%",
        uploadComplete: "अपलोड पूर्ण",
        uploadFailed: "अपलोड विफल",
        errorPrefix: "त्रुटि:",
        unknownError: "एक अज्ञात त्रुटि हुई।",
    },
    alerts: {
        invalidResolution: "कृपया चौड़ाई और ऊंचाई के लिए मान्य धनात्मक पूर्णांक दर्ज करें।",
    },
    byteUnits: ['बाइट्स', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 बाइट्स",
    filesModal: {
        closeAlt: "फ़ाइलें मोडल बंद करें",
        iframeTitle: "डाउनलोड करने योग्य फ़ाइलें"
    }
};

// --- Portuguese Translations ---
const pt = {
    selkiesLogoAlt: "Logo Selkies",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "Alternar Tema",
    fullscreenTitle: "Entrar em Tela Cheia",
    buttons: {
        videoStreamEnableTitle: "Ativar Stream de Vídeo",
        videoStreamDisableTitle: "Desativar Stream de Vídeo",
        audioStreamEnableTitle: "Ativar Stream de Áudio",
        audioStreamDisableTitle: "Desativar Stream de Áudio",
        microphoneEnableTitle: "Ativar Microfone",
        microphoneDisableTitle: "Desativar Microfone",
        gamepadEnableTitle: "Ativar Entrada de Gamepad",
        gamepadDisableTitle: "Desativar Entrada de Gamepad",
        virtualKeyboardButtonTitle: "Exibir Teclado",
    },
    sections: {
        video: {
            title: "Configurações de Vídeo",
            encoderLabel: "Codificador:",
            framerateLabel: "Quadros por segundo ({framerate} FPS):",
            bitrateLabel: "Bitrate de Vídeo ({bitrate} Mbps):",
            bufferLabelImmediate: "Tamanho do Buffer de Vídeo (0 (Imediato)):",
            bufferLabelFrames: "Tamanho do Buffer de Vídeo ({videoBufferSize} quadros):",
        },
        audio: {
            title: "Configurações de Áudio",
            bitrateLabel: "Bitrate de Áudio ({bitrate} kbps):",
            inputLabel: "Entrada (Microfone):",
            outputLabel: "Saída (Alto-falante):",
            outputNotSupported: "A seleção de dispositivo de saída não é suportada por este navegador.",
            deviceErrorDefault: "Erro ao listar dispositivos de áudio: {errorName}",
            deviceErrorPermission: "Permissão negada. Permita o acesso ao microfone nas configurações do navegador para selecionar dispositivos.",
            deviceErrorNotFound: "Nenhum dispositivo de áudio encontrado.",
            defaultInputLabelFallback: "Dispositivo de Entrada {index}",
            defaultOutputLabelFallback: "Dispositivo de Saída {index}",
        },
        screen: {
            title: "Configurações de Tela",
            presetLabel: "Predefinição:",
            resolutionPresetSelect: "-- Selecionar Predefinição --",
            widthLabel: "Largura:",
            heightLabel: "Altura:",
            widthPlaceholder: "ex: 1920",
            heightPlaceholder: "ex: 1080",
            setManualButton: "Definir Resolução Manual",
            resetButton: "Redefinir para Janela",
            scaleLocallyLabel: "Escalar Localmente:",
            scaleLocallyOn: "LIGADO",
            scaleLocallyOff: "DESLIGADO",
            scaleLocallyTitleEnable: "Ativar Escala Local (Manter Proporção)",
            scaleLocallyTitleDisable: "Desativar Escala Local (Usar Resolução Exata)",
        },
        stats: {
            title: "Estatísticas",
            cpuLabel: "CPU",
            gpuLabel: "Uso de GPU",
            sysMemLabel: "Mem Sistema",
            gpuMemLabel: "Mem GPU",
            fpsLabel: "FPS",
            audioLabel: "Áudio",
            tooltipCpu: "Uso de CPU: {value}%",
            tooltipGpu: "Uso de GPU: {value}%",
            tooltipSysMem: "Memória do Sistema: {used} / {total}",
            tooltipGpuMem: "Memória da GPU: {used} / {total}",
            tooltipFps: "FPS do Cliente: {value}",
            tooltipAudio: "Buffers de Áudio: {value}",
            tooltipMemoryNA: "N/D", // Não Disponível
        },
        clipboard: {
            title: "Área de Transferência",
            label: "Área de Transferência do Servidor:",
            placeholder: "Conteúdo da área de transferência do servidor...",
        },
        files: {
            title: "Arquivos",
            uploadButton: "Carregar Arquivos",
            uploadButtonTitle: "Carregar arquivos para a sessão remota",
            downloadButtonTitle: "Baixar Arquivos",
        },
        gamepads: {
            title: "Gamepads",
            noActivity: "Nenhuma atividade de gamepad detectada ainda...",
            touchEnableTitle: "Ativar Gamepad Tátil",
            touchDisableTitle: "Desativar Gamepad Tátil",
            touchActiveLabel: "Gamepad Tátil: LIGADO",
            touchInactiveLabel: "Gamepad Tátil: DESLIGADO",
            physicalHiddenForTouch: "A exibição de gamepads físicos fica oculta enquanto o gamepad tátil está ativo.",
            noActivityMobileOrEnableTouch: "Sem gamepads físicos. Ative o gamepad tátil ou conecte um controle."
        },
        apps: {
          title: "Aplicativos",
          openButtonTitle: "Gerenciar Aplicativos",
          openButton: "Gerenciar Aplicativos"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Laptop)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Fechar modal de aplicativos",
        loading: "Carregando aplicativos...",
        errorLoading: "Falha ao carregar dados dos aplicativos. Por favor, tente novamente.",
        searchPlaceholder: "Buscar aplicativos...",
        noAppsFound: "Nenhum aplicativo encontrado correspondente à sua busca.",
        backButton: "Voltar para a lista",
        installButton: "Instalar",
        updateButton: "Atualizar",
        removeButton: "Remover",
        installingMessage: "Simulando instalação para: {{appName}}",
        removingMessage: "Simulando remoção para: {{appName}}",
        updatingMessage: "Simulando atualização para: {{appName}}",
        installedBadge: "Instalado"
    },
    notifications: {
        closeButtonAlt: "Fechar notificação para {fileName}",
        uploading: "Carregando... {progress}%",
        uploadComplete: "Carregamento Completo",
        uploadFailed: "Falha no Carregamento",
        errorPrefix: "Erro:",
        unknownError: "Ocorreu um erro desconhecido.",
    },
    alerts: {
        invalidResolution: "Por favor, insira inteiros positivos válidos para Largura e Altura.",
    },
    byteUnits: ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 Bytes",
    filesModal: {
        closeAlt: "Fechar modal de arquivos",
        iframeTitle: "Arquivos para Download"
    }
};

// --- French Translations ---
const fr = {
    selkiesLogoAlt: "Logo Selkies",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "Changer de thème",
    fullscreenTitle: "Passer en plein écran",
    buttons: {
        videoStreamEnableTitle: "Activer le flux vidéo",
        videoStreamDisableTitle: "Désactiver le flux vidéo",
        audioStreamEnableTitle: "Activer le flux audio",
        audioStreamDisableTitle: "Désactiver le flux audio",
        microphoneEnableTitle: "Activer le microphone",
        microphoneDisableTitle: "Désactiver le microphone",
        gamepadEnableTitle: "Activer l'entrée manette",
        gamepadDisableTitle: "Désactiver l'entrée manette",
        virtualKeyboardButtonTitle: "Afficher le Clavier",
    },
    sections: {
        video: {
            title: "Paramètres vidéo",
            encoderLabel: "Encodeur :",
            framerateLabel: "Images par seconde ({framerate} FPS) :",
            bitrateLabel: "Débit vidéo ({bitrate} Mbps) :",
            bufferLabelImmediate: "Taille du tampon vidéo (0 (Immédiat)) :",
            bufferLabelFrames: "Taille du tampon vidéo ({videoBufferSize} images) :",
        },
        audio: {
            title: "Paramètres audio",
            bitrateLabel: "Débit audio ({bitrate} kbps) :",
            inputLabel: "Entrée (Microphone) :",
            outputLabel: "Sortie (Haut-parleur) :",
            outputNotSupported: "La sélection du périphérique de sortie n'est pas prise en charge par ce navigateur.",
            deviceErrorDefault: "Erreur lors de l'énumération des périphériques audio : {errorName}",
            deviceErrorPermission: "Autorisation refusée. Veuillez autoriser l'accès au microphone dans les paramètres du navigateur pour sélectionner des périphériques.",
            deviceErrorNotFound: "Aucun périphérique audio trouvé.",
            defaultInputLabelFallback: "Périphérique d'entrée {index}",
            defaultOutputLabelFallback: "Périphérique de sortie {index}",
        },
        screen: {
            title: "Paramètres d'écran",
            presetLabel: "Préréglage :",
            resolutionPresetSelect: "-- Sélectionner un préréglage --",
            widthLabel: "Largeur :",
            heightLabel: "Hauteur :",
            widthPlaceholder: "ex: 1920",
            heightPlaceholder: "ex: 1080",
            setManualButton: "Définir la résolution manuelle",
            resetButton: "Réinitialiser à la fenêtre",
            scaleLocallyLabel: "Mise à l'échelle locale :",
            scaleLocallyOn: "OUI",
            scaleLocallyOff: "NON",
            scaleLocallyTitleEnable: "Activer la mise à l'échelle locale (Conserver les proportions)",
            scaleLocallyTitleDisable: "Désactiver la mise à l'échelle locale (Utiliser la résolution exacte)",
        },
        stats: {
            title: "Statistiques",
            cpuLabel: "CPU",
            gpuLabel: "Utilisation GPU",
            sysMemLabel: "Mém. Système",
            gpuMemLabel: "Mém. GPU",
            fpsLabel: "FPS",
            audioLabel: "Audio",
            tooltipCpu: "Utilisation CPU : {value}%",
            tooltipGpu: "Utilisation GPU : {value}%",
            tooltipSysMem: "Mémoire système : {used} / {total}",
            tooltipGpuMem: "Mémoire GPU : {used} / {total}",
            tooltipFps: "FPS Client : {value}",
            tooltipAudio: "Tampons audio : {value}",
            tooltipMemoryNA: "N/D", // Non Disponible
        },
        clipboard: {
            title: "Presse-papiers",
            label: "Presse-papiers du serveur :",
            placeholder: "Contenu du presse-papiers depuis le serveur...",
        },
        files: {
            title: "Fichiers",
            uploadButton: "Téléverser des fichiers",
            uploadButtonTitle: "Téléverser des fichiers vers la session distante",
            downloadButtonTitle: "Télécharger les Fichiers",
        },
        gamepads: {
            title: "Manettes",
            noActivity: "Aucune activité de manette détectée pour le moment...",
            touchEnableTitle: "Activer la manette tactile",
            touchDisableTitle: "Désactiver la manette tactile",
            touchActiveLabel: "Manette tactile : ACTIVÉE",
            touchInactiveLabel: "Manette tactile : DÉSACTIVÉE",
            physicalHiddenForTouch: "L'affichage des manettes physiques est masqué lorsque la manette tactile est active.",
            noActivityMobileOrEnableTouch: "Aucune manette physique. Activez la manette tactile ou connectez un contrôleur."
        },
        apps: {
          title: "Applications",
          openButtonTitle: "Gérer les applications",
          openButton: "Gérer les applications"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Portable)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Fermer la modale des applications",
        loading: "Chargement des applications...",
        errorLoading: "Échec du chargement des données des applications. Veuillez réessayer.",
        searchPlaceholder: "Rechercher des applications...",
        noAppsFound: "Aucune application trouvée correspondant à votre recherche.",
        backButton: "Retour à la liste",
        installButton: "Installer",
        updateButton: "Mettre à jour",
        removeButton: "Supprimer",
        installingMessage: "Simulation de l'installation pour : {{appName}}",
        removingMessage: "Simulation de la suppression pour : {{appName}}",
        updatingMessage: "Simulation de la mise à jour pour : {{appName}}",
        installedBadge: "Installé"
    },
    notifications: {
        closeButtonAlt: "Fermer la notification pour {fileName}",
        uploading: "Téléversement... {progress}%",
        uploadComplete: "Téléversement terminé",
        uploadFailed: "Échec du téléversement",
        errorPrefix: "Erreur :",
        unknownError: "Une erreur inconnue s'est produite.",
    },
    alerts: {
        invalidResolution: "Veuillez entrer des entiers positifs valides pour la Largeur et la Hauteur.",
    },
    byteUnits: ['Octets', 'Ko', 'Mo', 'Go', 'To', 'Po', 'Eo', 'Zo', 'Yo'], // French often uses 'o' for octet
    zeroBytes: "0 Octets",
    filesModal: {
        closeAlt: "Fermer la modale des fichiers",
        iframeTitle: "Fichiers téléchargeables"
    }
};

// --- Russian Translations ---
const ru = {
    selkiesLogoAlt: "Логотип Selkies",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "Переключить тему",
    fullscreenTitle: "Войти в полноэкранный режим",
    buttons: {
        videoStreamEnableTitle: "Включить видеопоток",
        videoStreamDisableTitle: "Отключить видеопоток",
        audioStreamEnableTitle: "Включить аудиопоток",
        audioStreamDisableTitle: "Отключить аудиопоток",
        microphoneEnableTitle: "Включить микрофон",
        microphoneDisableTitle: "Отключить микрофон",
        gamepadEnableTitle: "Включить ввод с геймпада",
        gamepadDisableTitle: "Отключить ввод с геймпада",
        virtualKeyboardButtonTitle: "Показать Клавиатуру"
    },
    sections: {
        video: {
            title: "Настройки видео",
            encoderLabel: "Кодировщик:",
            framerateLabel: "Кадров в секунду ({framerate} FPS):",
            bitrateLabel: "Битрейт видео ({bitrate} Мбит/с):",
            bufferLabelImmediate: "Размер буфера видео (0 (Немедленно)):",
            bufferLabelFrames: "Размер буфера видео ({videoBufferSize} кадров):",
        },
        audio: {
            title: "Настройки аудио",
            bitrateLabel: "Битрейт аудио ({bitrate} кбит/с):",
            inputLabel: "Вход (Микрофон):",
            outputLabel: "Выход (Динамик):",
            outputNotSupported: "Выбор устройства вывода не поддерживается этим браузером.",
            deviceErrorDefault: "Ошибка при перечислении аудиоустройств: {errorName}",
            deviceErrorPermission: "Доступ запрещен. Пожалуйста, разрешите доступ к микрофону в настройках браузера для выбора устройств.",
            deviceErrorNotFound: "Аудиоустройства не найдены.",
            defaultInputLabelFallback: "Устройство ввода {index}",
            defaultOutputLabelFallback: "Устройство вывода {index}",
        },
        screen: {
            title: "Настройки экрана",
            presetLabel: "Предустановка:",
            resolutionPresetSelect: "-- Выбрать предустановку --",
            widthLabel: "Ширина:",
            heightLabel: "Высота:",
            widthPlaceholder: "напр., 1920",
            heightPlaceholder: "напр., 1080",
            setManualButton: "Установить ручное разрешение",
            resetButton: "Сбросить до окна",
            scaleLocallyLabel: "Масштабировать локально:",
            scaleLocallyOn: "ВКЛ",
            scaleLocallyOff: "ВЫКЛ",
            scaleLocallyTitleEnable: "Включить локальное масштабирование (Сохранять пропорции)",
            scaleLocallyTitleDisable: "Отключить локальное масштабирование (Использовать точное разрешение)",
        },
        stats: {
            title: "Статистика",
            cpuLabel: "ЦП",
            gpuLabel: "Загрузка ГП",
            sysMemLabel: "Память сист.",
            gpuMemLabel: "Память ГП",
            fpsLabel: "FPS",
            audioLabel: "Аудио",
            tooltipCpu: "Загрузка ЦП: {value}%",
            tooltipGpu: "Загрузка ГП: {value}%",
            tooltipSysMem: "Системная память: {used} / {total}",
            tooltipGpuMem: "Память ГП: {used} / {total}",
            tooltipFps: "FPS клиента: {value}",
            tooltipAudio: "Аудиобуферы: {value}",
            tooltipMemoryNA: "Н/Д", // Недоступно
        },
        clipboard: {
            title: "Буфер обмена",
            label: "Буфер обмена сервера:",
            placeholder: "Содержимое буфера обмена с сервера...",
        },
        files: {
            title: "Файлы",
            uploadButton: "Загрузить файлы",
            uploadButtonTitle: "Загрузить файлы в удаленную сессию",
            downloadButtonTitle: "Скачать Файлы",
        },
        gamepads: {
            title: "Геймпады",
            noActivity: "Активность геймпада пока не обнаружена...",
            touchEnableTitle: "Включить сенсорный геймпад",
            touchDisableTitle: "Отключить сенсорный геймпад",
            touchActiveLabel: "Сенсорный геймпад: ВКЛ",
            touchInactiveLabel: "Сенсорный геймпад: ВЫКЛ",
            physicalHiddenForTouch: "Отображение физических геймпадов скрыто, пока активен сенсорный геймпад.",
            noActivityMobileOrEnableTouch: "Физические геймпады отсутствуют. Включите сенсорный геймпад или подключите контроллер."
        },
        apps: {
          title: "Приложения",
          openButtonTitle: "Управление приложениями",
          openButton: "Управление приложениями"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Ноутбук)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Закрыть модальное окно приложений",
        loading: "Загрузка приложений...",
        errorLoading: "Не удалось загрузить данные приложений. Пожалуйста, попробуйте еще раз.",
        searchPlaceholder: "Поиск приложений...",
        noAppsFound: "Приложения, соответствующие вашему поиску, не найдены.",
        backButton: "Назад к списку",
        installButton: "Установить",
        updateButton: "Обновить",
        removeButton: "Удалить",
        installingMessage: "Симуляция установки для: {{appName}}",
        removingMessage: "Симуляция удаления для: {{appName}}",
        updatingMessage: "Симуляция обновления для: {{appName}}",
        installedBadge: "Установлено"
    },
    notifications: {
        closeButtonAlt: "Закрыть уведомление для {fileName}",
        uploading: "Загрузка... {progress}%",
        uploadComplete: "Загрузка завершена",
        uploadFailed: "Ошибка загрузки",
        errorPrefix: "Ошибка:",
        unknownError: "Произошла неизвестная ошибка.",
    },
    alerts: {
        invalidResolution: "Пожалуйста, введите действительные положительные целые числа для Ширины и Высоты.",
    },
    byteUnits: ['Байты', 'КБ', 'МБ', 'ГБ', 'ТБ', 'ПБ', 'ЭБ', 'ЗБ', 'ЙБ'], // Russian uses Cyrillic abbreviations
    zeroBytes: "0 Байт",
    filesModal: {
        closeAlt: "Закрыть модальное окно файлов",
        iframeTitle: "Файлы для скачивания"
    }
};

// --- German Translations ---
const de = {
    selkiesLogoAlt: "Selkies Logo",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "Theme wechseln",
    fullscreenTitle: "Vollbildmodus aktivieren",
    buttons: {
        videoStreamEnableTitle: "Videostream aktivieren",
        videoStreamDisableTitle: "Videostream deaktivieren",
        audioStreamEnableTitle: "Audiostream aktivieren",
        audioStreamDisableTitle: "Audiostream deaktivieren",
        microphoneEnableTitle: "Mikrofon aktivieren",
        microphoneDisableTitle: "Mikrofon deaktivieren",
        gamepadEnableTitle: "Gamepad-Eingabe aktivieren",
        gamepadDisableTitle: "Gamepad-Eingabe deaktivieren",
        virtualKeyboardButtonTitle: "Tastatur einblenden",
    },
    sections: {
        video: {
            title: "Videoeinstellungen",
            encoderLabel: "Encoder:",
            framerateLabel: "Bilder pro Sekunde ({framerate} FPS):",
            bitrateLabel: "Video-Bitrate ({bitrate} Mbps):",
            bufferLabelImmediate: "Video-Puffergröße (0 (Sofort)):",
            bufferLabelFrames: "Video-Puffergröße ({videoBufferSize} Frames):",
        },
        audio: {
            title: "Audioeinstellungen",
            bitrateLabel: "Audio-Bitrate ({bitrate} kbps):",
            inputLabel: "Eingang (Mikrofon):",
            outputLabel: "Ausgang (Lautsprecher):",
            outputNotSupported: "Die Auswahl des Ausgabegeräts wird von diesem Browser nicht unterstützt.",
            deviceErrorDefault: "Fehler beim Auflisten der Audiogeräte: {errorName}",
            deviceErrorPermission: "Berechtigung verweigert. Bitte erlauben Sie den Mikrofonzugriff in den Browsereinstellungen, um Geräte auszuwählen.",
            deviceErrorNotFound: "Keine Audiogeräte gefunden.",
            defaultInputLabelFallback: "Eingabegerät {index}",
            defaultOutputLabelFallback: "Ausgabegerät {index}",
        },
        screen: {
            title: "Bildschirmeinstellungen",
            presetLabel: "Voreinstellung:",
            resolutionPresetSelect: "-- Voreinstellung wählen --",
            widthLabel: "Breite:",
            heightLabel: "Höhe:",
            widthPlaceholder: "z.B. 1920",
            heightPlaceholder: "z.B. 1080",
            setManualButton: "Manuelle Auflösung festlegen",
            resetButton: "Auf Fenster zurücksetzen",
            scaleLocallyLabel: "Lokal skalieren:",
            scaleLocallyOn: "AN",
            scaleLocallyOff: "AUS",
            scaleLocallyTitleEnable: "Lokale Skalierung aktivieren (Seitenverhältnis beibehalten)",
            scaleLocallyTitleDisable: "Lokale Skalierung deaktivieren (Genaue Auflösung verwenden)",
        },
        stats: {
            title: "Statistiken",
            cpuLabel: "CPU",
            gpuLabel: "GPU-Auslastung",
            sysMemLabel: "Sys-Speicher",
            gpuMemLabel: "GPU-Speicher",
            fpsLabel: "FPS",
            audioLabel: "Audio",
            tooltipCpu: "CPU-Auslastung: {value}%",
            tooltipGpu: "GPU-Auslastung: {value}%",
            tooltipSysMem: "Systemspeicher: {used} / {total}",
            tooltipGpuMem: "GPU-Speicher: {used} / {total}",
            tooltipFps: "Client FPS: {value}",
            tooltipAudio: "Audio-Puffer: {value}",
            tooltipMemoryNA: "N/V", // Nicht Verfügbar
        },
        clipboard: {
            title: "Zwischenablage",
            label: "Server-Zwischenablage:",
            placeholder: "Inhalt der Zwischenablage vom Server...",
        },
        files: {
            title: "Dateien",
            uploadButton: "Dateien hochladen",
            uploadButtonTitle: "Dateien zur Remote-Sitzung hochladen",
            downloadButtonTitle: "Dateien herunterladen",
        },
        gamepads: {
            title: "Gamepads",
            noActivity: "Bisher keine Gamepad-Aktivität erkannt...",
            touchEnableTitle: "Touch-Gamepad aktivieren",
            touchDisableTitle: "Touch-Gamepad deaktivieren",
            touchActiveLabel: "Touch-Gamepad: AN",
            touchInactiveLabel: "Touch-Gamepad: AUS",
            physicalHiddenForTouch: "Die Anzeige physischer Gamepads ist ausgeblendet, während das Touch-Gamepad aktiv ist.",
            noActivityMobileOrEnableTouch: "Keine physischen Gamepads. Aktivieren Sie das Touch-Gamepad oder schließen Sie einen Controller an."
        },
        apps: {
          title: "Anwendungen",
          openButtonTitle: "Anwendungen verwalten",
          openButton: "Anwendungen verwalten"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Laptop)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Anwendungsmodal schließen",
        loading: "Anwendungen werden geladen...",
        errorLoading: "Fehler beim Laden der Anwendungsdaten. Bitte versuchen Sie es erneut.",
        searchPlaceholder: "Anwendungen suchen...",
        noAppsFound: "Keine Anwendungen gefunden, die Ihrer Suche entsprechen.",
        backButton: "Zurück zur Liste",
        installButton: "Installieren",
        updateButton: "Aktualisieren",
        removeButton: "Entfernen",
        installingMessage: "Simulation der Installation für: {{appName}}",
        removingMessage: "Simulation der Entfernung für: {{appName}}",
        updatingMessage: "Simulation der Aktualisierung für: {{appName}}",
        installedBadge: "Installiert"
    },
    notifications: {
        closeButtonAlt: "Benachrichtigung für {fileName} schließen",
        uploading: "Hochladen... {progress}%",
        uploadComplete: "Hochladen abgeschlossen",
        uploadFailed: "Hochladen fehlgeschlagen",
        errorPrefix: "Fehler:",
        unknownError: "Ein unbekannter Fehler ist aufgetreten.",
    },
    alerts: {
        invalidResolution: "Bitte geben Sie gültige positive ganze Zahlen für Breite und Höhe ein.",
    },
    byteUnits: ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 Bytes",
    filesModal: {
        closeAlt: "Dateimodal schließen",
        iframeTitle: "Herunterladbare Dateien"
    }
};

// --- Turkish Translations ---
const tr = {
    selkiesLogoAlt: "Selkies Logosu",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "Temayı Değiştir",
    fullscreenTitle: "Tam Ekrana Gir",
    buttons: {
        videoStreamEnableTitle: "Video Akışını Etkinleştir",
        videoStreamDisableTitle: "Video Akışını Devre Dışı Bırak",
        audioStreamEnableTitle: "Ses Akışını Etkinleştir",
        audioStreamDisableTitle: "Ses Akışını Devre Dışı Bırak",
        microphoneEnableTitle: "Mikrofonu Etkinleştir",
        microphoneDisableTitle: "Mikrofonu Devre Dışı Bırak",
        gamepadEnableTitle: "Oyun Kumandası Girişini Etkinleştir",
        gamepadDisableTitle: "Oyun Kumandası Girişini Devre Dışı Bırak",
        virtualKeyboardButtonTitle: "Klavyeyi Göster",
    },
    sections: {
        video: {
            title: "Video Ayarları",
            encoderLabel: "Kodlayıcı:",
            framerateLabel: "Saniyedeki Kare Sayısı ({framerate} FPS):",
            bitrateLabel: "Video Bit Hızı ({bitrate} Mbps):",
            bufferLabelImmediate: "Video Tampon Boyutu (0 (Anında)):",
            bufferLabelFrames: "Video Tampon Boyutu ({videoBufferSize} kare):",
        },
        audio: {
            title: "Ses Ayarları",
            bitrateLabel: "Ses Bit Hızı ({bitrate} kbps):",
            inputLabel: "Giriş (Mikrofon):",
            outputLabel: "Çıkış (Hoparlör):",
            outputNotSupported: "Çıkış aygıtı seçimi bu tarayıcı tarafından desteklenmiyor.",
            deviceErrorDefault: "Ses aygıtları listelenirken hata oluştu: {errorName}",
            deviceErrorPermission: "İzin reddedildi. Aygıtları seçmek için lütfen tarayıcı ayarlarında mikrofon erişimine izin verin.",
            deviceErrorNotFound: "Ses aygıtı bulunamadı.",
            defaultInputLabelFallback: "Giriş Aygıtı {index}",
            defaultOutputLabelFallback: "Çıkış Aygıtı {index}",
        },
        screen: {
            title: "Ekran Ayarları",
            presetLabel: "Ön Ayar:",
            resolutionPresetSelect: "-- Ön Ayar Seç --",
            widthLabel: "Genişlik:",
            heightLabel: "Yükseklik:",
            widthPlaceholder: "örneğin, 1920",
            heightPlaceholder: "örneğin, 1080",
            setManualButton: "Manuel Çözünürlüğü Ayarla",
            resetButton: "Pencereye Sıfırla",
            scaleLocallyLabel: "Yerel Olarak Ölçekle:",
            scaleLocallyOn: "AÇIK",
            scaleLocallyOff: "KAPALI",
            scaleLocallyTitleEnable: "Yerel Ölçeklendirmeyi Etkinleştir (En Boy Oranını Koru)",
            scaleLocallyTitleDisable: "Yerel Ölçeklendirmeyi Devre Dışı Bırak (Tam Çözünürlüğü Kullan)",
        },
        stats: {
            title: "İstatistikler",
            cpuLabel: "CPU",
            gpuLabel: "GPU Kullanımı",
            sysMemLabel: "Sis Belleği",
            gpuMemLabel: "GPU Belleği",
            fpsLabel: "FPS",
            audioLabel: "Ses",
            tooltipCpu: "CPU Kullanımı: {value}%",
            tooltipGpu: "GPU Kullanımı: {value}%",
            tooltipSysMem: "Sistem Belleği: {used} / {total}",
            tooltipGpuMem: "GPU Belleği: {used} / {total}",
            tooltipFps: "İstemci FPS: {value}",
            tooltipAudio: "Ses Tamponları: {value}",
            tooltipMemoryNA: "N/A", // Yok/Uygulanamaz
        },
        clipboard: {
            title: "Pano",
            label: "Sunucu Panosu:",
            placeholder: "Sunucudan pano içeriği...",
        },
        files: {
            title: "Dosyalar",
            uploadButton: "Dosya Yükle",
            uploadButtonTitle: "Uzak oturuma dosya yükle",
            downloadButtonTitle: "Dosyaları İndir",
        },
        gamepads: {
            title: "Oyun Kumandaları",
            noActivity: "Henüz oyun kumandası etkinliği algılanmadı...",
            touchEnableTitle: "Dokunmatik Oyun Kumandasını Etkinleştir",
            touchDisableTitle: "Dokunmatik Oyun Kumandasını Devre Dışı Bırak",
            touchActiveLabel: "Dokunmatik Kumanda: AÇIK",
            touchInactiveLabel: "Dokunmatik Kumanda: KAPALI",
            physicalHiddenForTouch: "Dokunmatik oyun kumandası etkinken fiziksel oyun kumandası ekranı gizlenir.",
            noActivityMobileOrEnableTouch: "Fiziksel oyun kumandası yok. Dokunmatik oyun kumandasını etkinleştirin veya bir denetleyici bağlayın."
        },
        apps: {
          title: "Uygulamalar",
          openButtonTitle: "Uygulamaları Yönet",
          openButton: "Uygulamaları Yönet"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Dizüstü)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Uygulama modalını kapat",
        loading: "Uygulamalar yükleniyor...",
        errorLoading: "Uygulama verileri yüklenemedi. Lütfen tekrar deneyin.",
        searchPlaceholder: "Uygulama ara...",
        noAppsFound: "Aramanızla eşleşen uygulama bulunamadı.",
        backButton: "Listeye geri dön",
        installButton: "Yükle",
        updateButton: "Güncelle",
        removeButton: "Kaldır",
        installingMessage: "Şunun için yükleme simüle ediliyor: {{appName}}",
        removingMessage: "Şunun için kaldırma simüle ediliyor: {{appName}}",
        updatingMessage: "Şunun için güncelleme simüle ediliyor: {{appName}}",
        installedBadge: "Yüklendi"
    },
    notifications: {
        closeButtonAlt: "{fileName} için bildirimi kapat",
        uploading: "Yükleniyor... {progress}%",
        uploadComplete: "Yükleme Tamamlandı",
        uploadFailed: "Yükleme Başarısız Oldu",
        errorPrefix: "Hata:",
        unknownError: "Bilinmeyen bir hata oluştu.",
    },
    alerts: {
        invalidResolution: "Lütfen Genişlik ve Yükseklik için geçerli pozitif tam sayılar girin.",
    },
    byteUnits: ['Bayt', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 Bayt",
    filesModal: {
        closeAlt: "Dosya modalını kapat",
        iframeTitle: "İndirilebilir Dosyalar"
    }
};

// --- Italian Translations ---
const it = {
    selkiesLogoAlt: "Logo Selkies",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "Cambia Tema",
    fullscreenTitle: "Entra in Schermo Intero",
    buttons: {
        videoStreamEnableTitle: "Abilita Stream Video",
        videoStreamDisableTitle: "Disabilita Stream Video",
        audioStreamEnableTitle: "Abilita Stream Audio",
        audioStreamDisableTitle: "Disabilita Stream Audio",
        microphoneEnableTitle: "Abilita Microfono",
        microphoneDisableTitle: "Disabilita Microfono",
        gamepadEnableTitle: "Abilita Input Gamepad",
        gamepadDisableTitle: "Disabilita Input Gamepad",
        virtualKeyboardButtonTitle: "Mostra Tastiera",
    },
    sections: {
        video: {
            title: "Impostazioni Video",
            encoderLabel: "Encoder:",
            framerateLabel: "Frame al secondo ({framerate} FPS):",
            bitrateLabel: "Bitrate Video ({bitrate} Mbps):",
            bufferLabelImmediate: "Dimensione Buffer Video (0 (Immediato)):",
            bufferLabelFrames: "Dimensione Buffer Video ({videoBufferSize} frame):",
        },
        audio: {
            title: "Impostazioni Audio",
            bitrateLabel: "Bitrate Audio ({bitrate} kbps):",
            inputLabel: "Input (Microfono):",
            outputLabel: "Output (Altoparlante):",
            outputNotSupported: "La selezione del dispositivo di output non è supportata da questo browser.",
            deviceErrorDefault: "Errore nell'elencare i dispositivi audio: {errorName}",
            deviceErrorPermission: "Permesso negato. Consenti l'accesso al microfono nelle impostazioni del browser per selezionare i dispositivi.",
            deviceErrorNotFound: "Nessun dispositivo audio trovato.",
            defaultInputLabelFallback: "Dispositivo di Input {index}",
            defaultOutputLabelFallback: "Dispositivo di Output {index}",
        },
        screen: {
            title: "Impostazioni Schermo",
            presetLabel: "Preimpostazione:",
            resolutionPresetSelect: "-- Seleziona Preimpostazione --",
            widthLabel: "Larghezza:",
            heightLabel: "Altezza:",
            widthPlaceholder: "es. 1920",
            heightPlaceholder: "es. 1080",
            setManualButton: "Imposta Risoluzione Manuale",
            resetButton: "Ripristina a Finestra",
            scaleLocallyLabel: "Scala Localmente:",
            scaleLocallyOn: "ON",
            scaleLocallyOff: "OFF",
            scaleLocallyTitleEnable: "Abilita Scala Locale (Mantieni Proporzioni)",
            scaleLocallyTitleDisable: "Disabilita Scala Locale (Usa Risoluzione Esatta)",
        },
        stats: {
            title: "Statistiche",
            cpuLabel: "CPU",
            gpuLabel: "Utilizzo GPU",
            sysMemLabel: "Mem Sistema",
            gpuMemLabel: "Mem GPU",
            fpsLabel: "FPS",
            audioLabel: "Audio",
            tooltipCpu: "Utilizzo CPU: {value}%",
            tooltipGpu: "Utilizzo GPU: {value}%",
            tooltipSysMem: "Memoria di Sistema: {used} / {total}",
            tooltipGpuMem: "Memoria GPU: {used} / {total}",
            tooltipFps: "FPS Client: {value}",
            tooltipAudio: "Buffer Audio: {value}",
            tooltipMemoryNA: "N/D", // Non Disponibile
        },
        clipboard: {
            title: "Appunti",
            label: "Appunti del Server:",
            placeholder: "Contenuto degli appunti dal server...",
        },
        files: {
            title: "File",
            uploadButton: "Carica File",
            uploadButtonTitle: "Carica file nella sessione remota",
            downloadButtonTitle: "Scarica File",
        },
        gamepads: {
            title: "Gamepad",
            noActivity: "Nessuna attività del gamepad ancora rilevata...",
            touchEnableTitle: "Abilita Gamepad Touch",
            touchDisableTitle: "Disabilita Gamepad Touch",
            touchActiveLabel: "Gamepad Touch: ON",
            touchInactiveLabel: "Gamepad Touch: OFF",
            physicalHiddenForTouch: "La visualizzazione dei gamepad fisici è nascosta mentre il gamepad touch è attivo.",
            noActivityMobileOrEnableTouch: "Nessun gamepad fisico. Abilita il gamepad touch o collega un controller."
        },
        apps: {
          title: "Applicazioni",
          openButtonTitle: "Gestisci Applicazioni",
          openButton: "Gestisci Applicazioni"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Laptop)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Chiudi modale applicazioni",
        loading: "Caricamento applicazioni...",
        errorLoading: "Errore nel caricamento dei dati delle applicazioni. Riprova.",
        searchPlaceholder: "Cerca applicazioni...",
        noAppsFound: "Nessuna applicazione trovata corrispondente alla tua ricerca.",
        backButton: "Torna alla lista",
        installButton: "Installa",
        updateButton: "Aggiorna",
        removeButton: "Rimuovi",
        installingMessage: "Simulazione installazione per: {{appName}}",
        removingMessage: "Simulazione rimozione per: {{appName}}",
        updatingMessage: "Simulazione aggiornamento per: {{appName}}",
        installedBadge: "Installato"
    },
    notifications: {
        closeButtonAlt: "Chiudi notifica per {fileName}",
        uploading: "Caricamento... {progress}%",
        uploadComplete: "Caricamento Completato",
        uploadFailed: "Caricamento Fallito",
        errorPrefix: "Errore:",
        unknownError: "Si è verificato un errore sconosciuto.",
    },
    alerts: {
        invalidResolution: "Inserisci numeri interi positivi validi per Larghezza e Altezza.",
    },
    byteUnits: ['Byte', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 Byte",
    filesModal: {
        closeAlt: "Chiudi modale file",
        iframeTitle: "File Scaricabili"
    }
};

// --- Dutch Translations ---
const nl = {
    selkiesLogoAlt: "Selkies Logo",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "Thema wisselen",
    fullscreenTitle: "Volledig scherm openen",
    buttons: {
        videoStreamEnableTitle: "Videostream inschakelen",
        videoStreamDisableTitle: "Videostream uitschakelen",
        audioStreamEnableTitle: "Audiostream inschakelen",
        audioStreamDisableTitle: "Audiostream uitschakelen",
        microphoneEnableTitle: "Microfoon inschakelen",
        microphoneDisableTitle: "Microfoon uitschakelen",
        gamepadEnableTitle: "Gamepad-invoer inschakelen",
        gamepadDisableTitle: "Gamepad-invoer uitschakelen",
        virtualKeyboardButtonTitle: "Toetsenbord Weergeven",
    },
    sections: {
        video: {
            title: "Video-instellingen",
            encoderLabel: "Encoder:",
            framerateLabel: "Frames per seconde ({framerate} FPS):",
            bitrateLabel: "Video Bitrate ({bitrate} Mbps):",
            bufferLabelImmediate: "Video Buffergrootte (0 (Onmiddellijk)):",
            bufferLabelFrames: "Video Buffergrootte ({videoBufferSize} frames):",
        },
        audio: {
            title: "Audio-instellingen",
            bitrateLabel: "Audio Bitrate ({bitrate} kbps):",
            inputLabel: "Invoer (Microfoon):",
            outputLabel: "Uitvoer (Luidspreker):",
            outputNotSupported: "Selectie van uitvoerapparaat wordt niet ondersteund door deze browser.",
            deviceErrorDefault: "Fout bij het ophalen van audioapparaten: {errorName}",
            deviceErrorPermission: "Toestemming geweigerd. Sta microfoontoegang toe in browserinstellingen om apparaten te selecteren.",
            deviceErrorNotFound: "Geen audioapparaten gevonden.",
            defaultInputLabelFallback: "Invoerapparaat {index}",
            defaultOutputLabelFallback: "Uitvoerapparaat {index}",
        },
        screen: {
            title: "Scherminstellingen",
            presetLabel: "Voorinstelling:",
            resolutionPresetSelect: "-- Selecteer Voorinstelling --",
            widthLabel: "Breedte:",
            heightLabel: "Hoogte:",
            widthPlaceholder: "bijv. 1920",
            heightPlaceholder: "bijv. 1080",
            setManualButton: "Handmatige Resolutie Instellen",
            resetButton: "Terugzetten naar Venster",
            scaleLocallyLabel: "Lokaal Schalen:",
            scaleLocallyOn: "AAN",
            scaleLocallyOff: "UIT",
            scaleLocallyTitleEnable: "Lokaal Schalen Inschakelen (Beeldverhouding Behouden)",
            scaleLocallyTitleDisable: "Lokaal Schalen Uitschakelen (Exacte Resolutie Gebruiken)",
        },
        stats: {
            title: "Statistieken",
            cpuLabel: "CPU",
            gpuLabel: "GPU Gebruik",
            sysMemLabel: "Sys Geheugen",
            gpuMemLabel: "GPU Geheugen",
            fpsLabel: "FPS",
            audioLabel: "Audio",
            tooltipCpu: "CPU Gebruik: {value}%",
            tooltipGpu: "GPU Gebruik: {value}%",
            tooltipSysMem: "Systeemgeheugen: {used} / {total}",
            tooltipGpuMem: "GPU Geheugen: {used} / {total}",
            tooltipFps: "Client FPS: {value}",
            tooltipAudio: "Audio Buffers: {value}",
            tooltipMemoryNA: "N.v.t.", // Niet van toepassing
        },
        clipboard: {
            title: "Klembord",
            label: "Server Klembord:",
            placeholder: "Klembord inhoud van server...",
        },
        files: {
            title: "Bestanden",
            uploadButton: "Bestanden Uploaden",
            uploadButtonTitle: "Upload bestanden naar de externe sessie",
            downloadButtonTitle: "Bestanden Downloaden",
        },
        gamepads: {
            title: "Gamepads",
            noActivity: "Nog geen gamepad activiteit gedetecteerd...",
            touchEnableTitle: "Touch Gamepad inschakelen",
            touchDisableTitle: "Touch Gamepad uitschakelen",
            touchActiveLabel: "Touch Gamepad: AAN",
            touchInactiveLabel: "Touch Gamepad: UIT",
            physicalHiddenForTouch: "Weergave van fysieke gamepads is verborgen terwijl de touch gamepad actief is.",
            noActivityMobileOrEnableTouch: "Geen fysieke gamepads. Schakel de touch gamepad in of sluit een controller aan."
        },
        apps: {
          title: "Applicaties",
          openButtonTitle: "Applicaties beheren",
          openButton: "Applicaties beheren"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Laptop)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Applicatiemodal sluiten",
        loading: "Applicaties laden...",
        errorLoading: "Fout bij het laden van applicatiegegevens. Probeer het opnieuw.",
        searchPlaceholder: "Zoek applicaties...",
        noAppsFound: "Geen applicaties gevonden die overeenkomen met uw zoekopdracht.",
        backButton: "Terug naar lijst",
        installButton: "Installeren",
        updateButton: "Bijwerken",
        removeButton: "Verwijderen",
        installingMessage: "Simulatie van installatie voor: {{appName}}",
        removingMessage: "Simulatie van verwijdering voor: {{appName}}",
        updatingMessage: "Simulatie van update voor: {{appName}}",
        installedBadge: "Geïnstalleerd"
    },
    notifications: {
        closeButtonAlt: "Melding sluiten voor {fileName}",
        uploading: "Uploaden... {progress}%",
        uploadComplete: "Upload Voltooid",
        uploadFailed: "Upload Mislukt",
        errorPrefix: "Fout:",
        unknownError: "Er is een onbekende fout opgetreden.",
    },
    alerts: {
        invalidResolution: "Voer geldige positieve gehele getallen in voor Breedte en Hoogte.",
    },
    byteUnits: ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 Bytes",
    filesModal: {
        closeAlt: "Bestandsmodal sluiten",
        iframeTitle: "Downloadbare bestanden"
    }
};

// --- Arabic Translations ---
const ar = {
    selkiesLogoAlt: "شعار Selkies",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "تبديل السمة",
    fullscreenTitle: "الدخول في وضع ملء الشاشة",
    buttons: {
        videoStreamEnableTitle: "تمكين بث الفيديو",
        videoStreamDisableTitle: "تعطيل بث الفيديو",
        audioStreamEnableTitle: "تمكين بث الصوت",
        audioStreamDisableTitle: "تعطيل بث الصوت",
        microphoneEnableTitle: "تمكين الميكروفون",
        microphoneDisableTitle: "تعطيل الميكروفون",
        gamepadEnableTitle: "تمكين إدخال لوحة الألعاب",
        gamepadDisableTitle: "تعطيل إدخال لوحة الألعاب",
        virtualKeyboardButtonTitle: "إظهار لوحة المفاتيح",
    },
    sections: {
        video: {
            title: "إعدادات الفيديو",
            encoderLabel: "المُرمّز:",
            framerateLabel: "إطارات في الثانية ({framerate} FPS):",
            bitrateLabel: "معدل بت الفيديو ({bitrate} Mbps):",
            bufferLabelImmediate: "حجم مخزن الفيديو المؤقت (0 (فوري)):",
            bufferLabelFrames: "حجم مخزن الفيديو المؤقت ({videoBufferSize} إطارات):",
        },
        audio: {
            title: "إعدادات الصوت",
            bitrateLabel: "معدل بت الصوت ({bitrate} kbps):",
            inputLabel: "الإدخال (الميكروفون):",
            outputLabel: "الإخراج (مكبر الصوت):",
            outputNotSupported: "اختيار جهاز الإخراج غير مدعوم بواسطة هذا المتصفح.",
            deviceErrorDefault: "خطأ في سرد أجهزة الصوت: {errorName}",
            deviceErrorPermission: "تم رفض الإذن. يرجى السماح بالوصول إلى الميكروفون في إعدادات المتصفح لتحديد الأجهزة.",
            deviceErrorNotFound: "لم يتم العثور على أجهزة صوت.",
            defaultInputLabelFallback: "جهاز الإدخال {index}",
            defaultOutputLabelFallback: "جهاز الإخراج {index}",
        },
        screen: {
            title: "إعدادات الشاشة",
            presetLabel: "إعداد مسبق:",
            resolutionPresetSelect: "-- تحديد إعداد مسبق --",
            widthLabel: "العرض:",
            heightLabel: "الارتفاع:",
            widthPlaceholder: "مثال، 1920",
            heightPlaceholder: "مثال، 1080",
            setManualButton: "تعيين دقة يدوية",
            resetButton: "إعادة التعيين إلى النافذة",
            scaleLocallyLabel: "تغيير الحجم محليًا:",
            scaleLocallyOn: "تشغيل",
            scaleLocallyOff: "إيقاف",
            scaleLocallyTitleEnable: "تمكين تغيير الحجم المحلي (الحفاظ على نسبة العرض إلى الارتفاع)",
            scaleLocallyTitleDisable: "تعطيل تغيير الحجم المحلي (استخدام الدقة الدقيقة)",
        },
        stats: {
            title: "الإحصائيات",
            cpuLabel: "CPU",
            gpuLabel: "استخدام GPU",
            sysMemLabel: "ذاكرة النظام",
            gpuMemLabel: "ذاكرة GPU",
            fpsLabel: "FPS",
            audioLabel: "الصوت",
            tooltipCpu: "استخدام CPU: {value}%",
            tooltipGpu: "استخدام GPU: {value}%",
            tooltipSysMem: "ذاكرة النظام: {used} / {total}",
            tooltipGpuMem: "ذاكرة GPU: {used} / {total}",
            tooltipFps: "FPS العميل: {value}",
            tooltipAudio: "مخازن الصوت المؤقتة: {value}",
            tooltipMemoryNA: "غير متاح",
        },
        clipboard: {
            title: "الحافظة",
            label: "حافظة الخادم:",
            placeholder: "محتوى الحافظة من الخادم...",
        },
        files: {
            title: "الملفات",
            uploadButton: "تحميل الملفات",
            uploadButtonTitle: "تحميل الملفات إلى الجلسة البعيدة",
            downloadButtonTitle: "تحميل الملفات",
        },
        gamepads: {
            title: "لوحات الألعاب",
            noActivity: "لم يتم اكتشاف أي نشاط للوحة الألعاب بعد...",
            touchEnableTitle: "تمكين لوحة ألعاب اللمس",
            touchDisableTitle: "تعطيل لوحة ألعاب اللمس",
            touchActiveLabel: "لوحة ألعاب اللمس: تشغيل",
            touchInactiveLabel: "لوحة ألعاب اللمس: إيقاف",
            physicalHiddenForTouch: "يتم إخفاء عرض لوحة الألعاب الفعلية أثناء تنشيط لوحة ألعاب اللمس.",
            noActivityMobileOrEnableTouch: "لا توجد لوحات ألعاب فعلية. قم بتمكين لوحة ألعاب اللمس أو قم بتوصيل وحدة تحكم."
        },
        apps: { // New section for "Apps"
          title: "التطبيقات",
          openButtonTitle: "إدارة التطبيقات",
          openButton: "إدارة التطبيقات"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 × 1080 (FHD)",
        "1280x720": "1280 × 720 (HD)",
        "1366x768": "1366 × 768 (لابتوب)",
        "1920x1200": "1920 × 1200 (16:10)",
        "2560x1440": "2560 × 1440 (QHD)",
        "3840x2160": "3840 × 2160 (4K UHD)",
        "1024x768": "1024 × 768 (XGA 4:3)",
        "800x600": "800 × 600 (SVGA 4:3)",
        "640x480": "640 × 480 (VGA 4:3)",
        "320x240": "320 × 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "إغلاق نافذة التطبيقات",
        loading: "جارٍ تحميل التطبيقات...",
        errorLoading: "فشل تحميل بيانات التطبيقات. يرجى المحاولة مرة أخرى.",
        searchPlaceholder: "البحث في التطبيقات...",
        noAppsFound: "لم يتم العثور على تطبيقات تطابق بحثك.",
        backButton: "العودة إلى القائمة",
        installButton: "تثبيت",
        updateButton: "تحديث",
        removeButton: "إزالة",
        installingMessage: "محاكاة التثبيت لـ: {{appName}}",
        removingMessage: "محاكاة الإزالة لـ: {{appName}}",
        updatingMessage: "محاكاة التحديث لـ: {{appName}}",
        installedBadge: "مثبت"
    },
    notifications: {
        closeButtonAlt: "إغلاق الإشعار لـ {fileName}",
        uploading: "جارٍ التحميل... {progress}%",
        uploadComplete: "اكتمل التحميل",
        uploadFailed: "فشل التحميل",
        errorPrefix: "خطأ:",
        unknownError: "حدث خطأ غير معروف.",
    },
    alerts: {
        invalidResolution: "الرجاء إدخال أعداد صحيحة موجبة صالحة للعرض والارتفاع.",
    },
    byteUnits: ['بايت', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 بايت",
    filesModal: {
        closeAlt: "إغلاق نافذة الملفات",
        iframeTitle: "ملفات قابلة للتحميل"
    }
};

// --- Korean Translations ---
const ko = {
    selkiesLogoAlt: "Selkies 로고",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "테마 전환",
    fullscreenTitle: "전체 화면 시작",
    buttons: {
        videoStreamEnableTitle: "비디오 스트림 활성화",
        videoStreamDisableTitle: "비디오 스트림 비활성화",
        audioStreamEnableTitle: "오디오 스트림 활성화",
        audioStreamDisableTitle: "오디오 스트림 비활성화",
        microphoneEnableTitle: "마이크 활성화",
        microphoneDisableTitle: "마이크 비활성화",
        gamepadEnableTitle: "게임패드 입력 활성화",
        gamepadDisableTitle: "게임패드 입력 비활성화",
        virtualKeyboardButtonTitle: "키보드 표시",
    },
    sections: {
        video: {
            title: "비디오 설정",
            encoderLabel: "인코더:",
            framerateLabel: "초당 프레임 ({framerate} FPS):",
            bitrateLabel: "비디오 비트 전송률 ({bitrate} Mbps):",
            bufferLabelImmediate: "비디오 버퍼 크기 (0 (즉시)):",
            bufferLabelFrames: "비디오 버퍼 크기 ({videoBufferSize} 프레임):",
        },
        audio: {
            title: "오디오 설정",
            bitrateLabel: "오디오 비트 전송률 ({bitrate} kbps):",
            inputLabel: "입력 (마이크):",
            outputLabel: "출력 (스피커):",
            outputNotSupported: "이 브라우저에서는 출력 장치 선택을 지원하지 않습니다.",
            deviceErrorDefault: "오디오 장치 목록 오류: {errorName}",
            deviceErrorPermission: "권한이 거부되었습니다. 장치를 선택하려면 브라우저 설정에서 마이크 액세스를 허용하십시오.",
            deviceErrorNotFound: "오디오 장치를 찾을 수 없습니다.",
            defaultInputLabelFallback: "입력 장치 {index}",
            defaultOutputLabelFallback: "출력 장치 {index}",
        },
        screen: {
            title: "화면 설정",
            presetLabel: "프리셋:",
            resolutionPresetSelect: "-- 프리셋 선택 --",
            widthLabel: "너비:",
            heightLabel: "높이:",
            widthPlaceholder: "예: 1920",
            heightPlaceholder: "예: 1080",
            setManualButton: "수동 해상도 설정",
            resetButton: "창으로 재설정",
            scaleLocallyLabel: "로컬 스케일링:",
            scaleLocallyOn: "켜짐",
            scaleLocallyOff: "꺼짐",
            scaleLocallyTitleEnable: "로컬 스케일링 활성화 (종횡비 유지)",
            scaleLocallyTitleDisable: "로컬 스케일링 비활성화 (정확한 해상도 사용)",
        },
        stats: {
            title: "통계",
            cpuLabel: "CPU",
            gpuLabel: "GPU 사용량",
            sysMemLabel: "시스템 메모리",
            gpuMemLabel: "GPU 메모리",
            fpsLabel: "FPS",
            audioLabel: "오디오",
            tooltipCpu: "CPU 사용량: {value}%",
            tooltipGpu: "GPU 사용량: {value}%",
            tooltipSysMem: "시스템 메모리: {used} / {total}",
            tooltipGpuMem: "GPU 메모리: {used} / {total}",
            tooltipFps: "클라이언트 FPS: {value}",
            tooltipAudio: "오디오 버퍼: {value}",
            tooltipMemoryNA: "해당 없음",
        },
        clipboard: {
            title: "클립보드",
            label: "서버 클립보드:",
            placeholder: "서버의 클립보드 내용...",
        },
        files: {
            title: "파일",
            uploadButton: "파일 업로드",
            uploadButtonTitle: "원격 세션에 파일 업로드",
            downloadButtonTitle: "파일 다운로드",
        },
        gamepads: {
            title: "게임패드",
            noActivity: "아직 게임패드 활동이 감지되지 않았습니다...",
            touchEnableTitle: "터치 게임패드 활성화",
            touchDisableTitle: "터치 게임패드 비활성화",
            touchActiveLabel: "터치 게임패드: 켜짐",
            touchInactiveLabel: "터치 게임패드: 꺼짐",
            physicalHiddenForTouch: "터치 게임패드가 활성화되어 있는 동안에는 물리적 게임패드 표시가 숨겨집니다.",
            noActivityMobileOrEnableTouch: "물리적 게임패드가 없습니다. 터치 게임패드를 활성화하거나 컨트롤러를 연결하십시오."
        },
        apps: {
          title: "앱",
          openButtonTitle: "앱 관리",
          openButton: "앱 관리"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (노트북)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "앱 모달 닫기",
        loading: "앱 로드 중...",
        errorLoading: "앱 데이터 로드 실패. 다시 시도하십시오.",
        searchPlaceholder: "앱 검색...",
        noAppsFound: "검색과 일치하는 앱을 찾을 수 없습니다.",
        backButton: "목록으로 돌아가기",
        installButton: "설치",
        updateButton: "업데이트",
        removeButton: "제거",
        installingMessage: "{{appName}} 설치 시뮬레이션 중",
        removingMessage: "{{appName}} 제거 시뮬레이션 중",
        updatingMessage: "{{appName}} 업데이트 시뮬레이션 중",
        installedBadge: "설치됨"
    },
    notifications: {
        closeButtonAlt: "{fileName} 알림 닫기",
        uploading: "업로드 중... {progress}%",
        uploadComplete: "업로드 완료",
        uploadFailed: "업로드 실패",
        errorPrefix: "오류:",
        unknownError: "알 수 없는 오류가 발생했습니다.",
    },
    alerts: {
        invalidResolution: "너비와 높이에 유효한 양의 정수를 입력하십시오.",
    },
    byteUnits: ['바이트', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 바이트",
    filesModal: {
        closeAlt: "파일 모달 닫기",
        iframeTitle: "다운로드 가능한 파일"
    }
};

// --- Japanese Translations ---
const ja = {
    selkiesLogoAlt: "Selkies ロゴ",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "テーマを切り替え",
    fullscreenTitle: "フルスクリーンに入る",
    buttons: {
        videoStreamEnableTitle: "ビデオストリームを有効にする",
        videoStreamDisableTitle: "ビデオストリームを無効にする",
        audioStreamEnableTitle: "オーディオストリームを有効にする",
        audioStreamDisableTitle: "オーディオストリームを無効にする",
        microphoneEnableTitle: "マイクを有効にする",
        microphoneDisableTitle: "マイクを無効にする",
        gamepadEnableTitle: "ゲームパッド入力を有効にする",
        gamepadDisableTitle: "ゲームパッド入力を無効にする",
        virtualKeyboardButtonTitle: "キーボードを表示",
    },
    sections: {
        video: {
            title: "ビデオ設定",
            encoderLabel: "エンコーダー:",
            framerateLabel: "フレーム/秒 ({framerate} FPS):",
            bitrateLabel: "ビデオビットレート ({bitrate} Mbps):",
            bufferLabelImmediate: "ビデオバッファサイズ (0 (即時)):",
            bufferLabelFrames: "ビデオバッファサイズ ({videoBufferSize} フレーム):",
        },
        audio: {
            title: "オーディオ設定",
            bitrateLabel: "オーディオビットレート ({bitrate} kbps):",
            inputLabel: "入力 (マイク):",
            outputLabel: "出力 (スピーカー):",
            outputNotSupported: "このブラウザでは出力デバイスの選択はサポートされていません。",
            deviceErrorDefault: "オーディオデバイスのリスト表示エラー: {errorName}",
            deviceErrorPermission: "権限が拒否されました。デバイスを選択するには、ブラウザ設定でマイクへのアクセスを許可してください。",
            deviceErrorNotFound: "オーディオデバイスが見つかりません。",
            defaultInputLabelFallback: "入力デバイス {index}",
            defaultOutputLabelFallback: "出力デバイス {index}",
        },
        screen: {
            title: "画面設定",
            presetLabel: "プリセット:",
            resolutionPresetSelect: "-- プリセットを選択 --",
            widthLabel: "幅:",
            heightLabel: "高さ:",
            widthPlaceholder: "例: 1920",
            heightPlaceholder: "例: 1080",
            setManualButton: "手動解像度を設定",
            resetButton: "ウィンドウにリセット",
            scaleLocallyLabel: "ローカルでスケーリング:",
            scaleLocallyOn: "オン",
            scaleLocallyOff: "オフ",
            scaleLocallyTitleEnable: "ローカルスケーリングを有効にする (アスペクト比を維持)",
            scaleLocallyTitleDisable: "ローカルスケーリングを無効にする (正確な解像度を使用)",
        },
        stats: {
            title: "統計",
            cpuLabel: "CPU",
            gpuLabel: "GPU 使用率",
            sysMemLabel: "システムメモリ",
            gpuMemLabel: "GPU メモリ",
            fpsLabel: "FPS",
            audioLabel: "オーディオ",
            tooltipCpu: "CPU 使用率: {value}%",
            tooltipGpu: "GPU 使用率: {value}%",
            tooltipSysMem: "システムメモリ: {used} / {total}",
            tooltipGpuMem: "GPU メモリ: {used} / {total}",
            tooltipFps: "クライアント FPS: {value}",
            tooltipAudio: "オーディオバッファ: {value}",
            tooltipMemoryNA: "N/A", // 該当なし
        },
        clipboard: {
            title: "クリップボード",
            label: "サーバークリップボード:",
            placeholder: "サーバーからのクリップボードの内容...",
        },
        files: {
            title: "ファイル",
            uploadButton: "ファイルをアップロード",
            uploadButtonTitle: "リモートセッションにファイルをアップロード",
            downloadButtonTitle: "ファイルをダウンロード",
        },
        gamepads: {
            title: "ゲームパッド",
            noActivity: "まだゲームパッドのアクティビティが検出されていません...",
            touchEnableTitle: "タッチゲームパッドを有効にする",
            touchDisableTitle: "タッチゲームパッドを無効にする",
            touchActiveLabel: "タッチゲームパッド: オン",
            touchInactiveLabel: "タッチゲームパッド: オフ",
            physicalHiddenForTouch: "タッチゲームパッドがアクティブな間、物理ゲームパッドの表示は非表示になります。",
            noActivityMobileOrEnableTouch: "物理ゲームパッドがありません。タッチゲームパッドを有効にするか、コントローラーを接続してください。"
        },
        apps: {
          title: "アプリ",
          openButtonTitle: "アプリを管理",
          openButton: "アプリを管理"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (ラップトップ)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "アプリモーダルを閉じる",
        loading: "アプリを読み込み中...",
        errorLoading: "アプリデータの読み込みに失敗しました。もう一度お試しください。",
        searchPlaceholder: "アプリを検索...",
        noAppsFound: "検索に一致するアプリが見つかりません。",
        backButton: "リストに戻る",
        installButton: "インストール",
        updateButton: "更新",
        removeButton: "削除",
        installingMessage: "{{appName}} のインストールをシミュレートしています",
        removingMessage: "{{appName}} の削除をシミュレートしています",
        updatingMessage: "{{appName}} の更新をシミュレートしています",
        installedBadge: "インストール済み"
    },
    notifications: {
        closeButtonAlt: "{fileName} の通知を閉じる",
        uploading: "アップロード中... {progress}%",
        uploadComplete: "アップロード完了",
        uploadFailed: "アップロード失敗",
        errorPrefix: "エラー:",
        unknownError: "不明なエラーが発生しました。",
    },
    alerts: {
        invalidResolution: "幅と高さに有効な正の整数を入力してください。",
    },
    byteUnits: ['バイト', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 バイト",
    filesModal: {
        closeAlt: "ファイルモーダルを閉じる",
        iframeTitle: "ダウンロード可能なファイル"
    }
};

// --- Vietnamese Translations ---
const vi = {
    selkiesLogoAlt: "Logo Selkies",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "Chuyển đổi Chủ đề",
    fullscreenTitle: "Vào Toàn màn hình",
    buttons: {
        videoStreamEnableTitle: "Bật Luồng Video",
        videoStreamDisableTitle: "Tắt Luồng Video",
        audioStreamEnableTitle: "Bật Luồng Âm thanh",
        audioStreamDisableTitle: "Tắt Luồng Âm thanh",
        microphoneEnableTitle: "Bật Micro",
        microphoneDisableTitle: "Tắt Micro",
        gamepadEnableTitle: "Bật Đầu vào Tay cầm chơi game",
        gamepadDisableTitle: "Tắt Đầu vào Tay cầm chơi game",
        virtualKeyboardButtonTitle: "Hiển thị Bàn phím",
    },
    sections: {
        video: {
            title: "Cài đặt Video",
            encoderLabel: "Bộ mã hóa:",
            framerateLabel: "Khung hình mỗi giây ({framerate} FPS):",
            bitrateLabel: "Tốc độ bit Video ({bitrate} Mbps):",
            bufferLabelImmediate: "Kích thước Bộ đệm Video (0 (Ngay lập tức)):",
            bufferLabelFrames: "Kích thước Bộ đệm Video ({videoBufferSize} khung hình):",
        },
        audio: {
            title: "Cài đặt Âm thanh",
            bitrateLabel: "Tốc độ bit Âm thanh ({bitrate} kbps):",
            inputLabel: "Đầu vào (Micro):",
            outputLabel: "Đầu ra (Loa):",
            outputNotSupported: "Trình duyệt này không hỗ trợ chọn thiết bị đầu ra.",
            deviceErrorDefault: "Lỗi liệt kê thiết bị âm thanh: {errorName}",
            deviceErrorPermission: "Quyền bị từ chối. Vui lòng cho phép truy cập micro trong cài đặt trình duyệt để chọn thiết bị.",
            deviceErrorNotFound: "Không tìm thấy thiết bị âm thanh nào.",
            defaultInputLabelFallback: "Thiết bị Đầu vào {index}",
            defaultOutputLabelFallback: "Thiết bị Đầu ra {index}",
        },
        screen: {
            title: "Cài đặt Màn hình",
            presetLabel: "Cài đặt sẵn:",
            resolutionPresetSelect: "-- Chọn Cài đặt sẵn --",
            widthLabel: "Chiều rộng:",
            heightLabel: "Chiều cao:",
            widthPlaceholder: "ví dụ: 1920",
            heightPlaceholder: "ví dụ: 1080",
            setManualButton: "Đặt Độ phân giải Thủ công",
            resetButton: "Đặt lại về Cửa sổ",
            scaleLocallyLabel: "Co giãn Cục bộ:",
            scaleLocallyOn: "BẬT",
            scaleLocallyOff: "TẮT",
            scaleLocallyTitleEnable: "Bật Co giãn Cục bộ (Giữ Tỷ lệ khung hình)",
            scaleLocallyTitleDisable: "Tắt Co giãn Cục bộ (Sử dụng Độ phân giải Chính xác)",
        },
        stats: {
            title: "Thống kê",
            cpuLabel: "CPU",
            gpuLabel: "Sử dụng GPU",
            sysMemLabel: "Bộ nhớ Hệ thống",
            gpuMemLabel: "Bộ nhớ GPU",
            fpsLabel: "FPS",
            audioLabel: "Âm thanh",
            tooltipCpu: "Sử dụng CPU: {value}%",
            tooltipGpu: "Sử dụng GPU: {value}%",
            tooltipSysMem: "Bộ nhớ Hệ thống: {used} / {total}",
            tooltipGpuMem: "Bộ nhớ GPU: {used} / {total}",
            tooltipFps: "FPS Máy khách: {value}",
            tooltipAudio: "Bộ đệm Âm thanh: {value}",
            tooltipMemoryNA: "Không có",
        },
        clipboard: {
            title: "Bộ nhớ tạm",
            label: "Bộ nhớ tạm Máy chủ:",
            placeholder: "Nội dung bộ nhớ tạm từ máy chủ...",
        },
        files: {
            title: "Tệp",
            uploadButton: "Tải lên Tệp",
            uploadButtonTitle: "Tải tệp lên phiên làm việc từ xa",
            downloadButtonTitle: "Tải xuống Tệp",
        },
        gamepads: {
            title: "Tay cầm chơi game",
            noActivity: "Chưa phát hiện hoạt động nào của tay cầm chơi game...",
            touchEnableTitle: "Bật Tay cầm cảm ứng",
            touchDisableTitle: "Tắt Tay cầm cảm ứng",
            touchActiveLabel: "Tay cầm cảm ứng: BẬT",
            touchInactiveLabel: "Tay cầm cảm ứng: TẮT",
            physicalHiddenForTouch: "Màn hình tay cầm vật lý bị ẩn khi tay cầm cảm ứng đang hoạt động.",
            noActivityMobileOrEnableTouch: "Không có tay cầm vật lý. Bật tay cầm cảm ứng hoặc kết nối bộ điều khiển."
        },
        apps: {
          title: "Ứng dụng",
          openButtonTitle: "Quản lý Ứng dụng",
          openButton: "Quản lý Ứng dụng"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Máy tính xách tay)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "Đóng modal ứng dụng",
        loading: "Đang tải ứng dụng...",
        errorLoading: "Tải dữ liệu ứng dụng thất bại. Vui lòng thử lại.",
        searchPlaceholder: "Tìm kiếm ứng dụng...",
        noAppsFound: "Không tìm thấy ứng dụng nào khớp với tìm kiếm của bạn.",
        backButton: "Quay lại danh sách",
        installButton: "Cài đặt",
        updateButton: "Cập nhật",
        removeButton: "Gỡ bỏ",
        installingMessage: "Mô phỏng cài đặt cho: {{appName}}",
        removingMessage: "Mô phỏng gỡ bỏ cho: {{appName}}",
        updatingMessage: "Mô phỏng cập nhật cho: {{appName}}",
        installedBadge: "Đã cài đặt"
    },
    notifications: {
        closeButtonAlt: "Đóng thông báo cho {fileName}",
        uploading: "Đang tải lên... {progress}%",
        uploadComplete: "Tải lên Hoàn tất",
        uploadFailed: "Tải lên Thất bại",
        errorPrefix: "Lỗi:",
        unknownError: "Đã xảy ra lỗi không xác định.",
    },
    alerts: {
        invalidResolution: "Vui lòng nhập số nguyên dương hợp lệ cho Chiều rộng và Chiều cao.",
    },
    byteUnits: ['Byte', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 Byte",
    filesModal: {
        closeAlt: "Đóng modal tệp",
        iframeTitle: "Tệp có thể tải xuống"
    }
};

// --- Thai Translations ---
const th = {
    selkiesLogoAlt: "โลโก้ Selkies",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "สลับธีม",
    fullscreenTitle: "เข้าสู่โหมดเต็มหน้าจอ",
    buttons: {
        videoStreamEnableTitle: "เปิดใช้งานสตรีมวิดีโอ",
        videoStreamDisableTitle: "ปิดใช้งานสตรีมวิดีโอ",
        audioStreamEnableTitle: "เปิดใช้งานสตรีมเสียง",
        audioStreamDisableTitle: "ปิดใช้งานสตรีมเสียง",
        microphoneEnableTitle: "เปิดใช้งานไมโครโฟน",
        microphoneDisableTitle: "ปิดใช้งานไมโครโฟน",
        gamepadEnableTitle: "เปิดใช้งานอินพุตเกมแพด",
        gamepadDisableTitle: "ปิดใช้งานอินพุตเกมแพด",
        virtualKeyboardButtonTitle: "แสดงแป้นพิมพ์",
    },
    sections: {
        video: {
            title: "การตั้งค่าวิดีโอ",
            encoderLabel: "ตัวเข้ารหัส:",
            framerateLabel: "เฟรมต่อวินาที ({framerate} FPS):",
            bitrateLabel: "บิตเรตวิดีโอ ({bitrate} Mbps):",
            bufferLabelImmediate: "ขนาดบัฟเฟอร์วิดีโอ (0 (ทันที)):",
            bufferLabelFrames: "ขนาดบัฟเฟอร์วิดีโอ ({videoBufferSize} เฟรม):",
        },
        audio: {
            title: "การตั้งค่าเสียง",
            bitrateLabel: "บิตเรตเสียง ({bitrate} kbps):",
            inputLabel: "อินพุต (ไมโครโฟน):",
            outputLabel: "เอาต์พุต (ลำโพง):",
            outputNotSupported: "เบราว์เซอร์นี้ไม่รองรับการเลือกอุปกรณ์เอาต์พุต",
            deviceErrorDefault: "ข้อผิดพลาดในการแสดงรายการอุปกรณ์เสียง: {errorName}",
            deviceErrorPermission: "การอนุญาตถูกปฏิเสธ โปรดอนุญาตการเข้าถึงไมโครโฟนในการตั้งค่าเบราว์เซอร์เพื่อเลือกอุปกรณ์",
            deviceErrorNotFound: "ไม่พบอุปกรณ์เสียง",
            defaultInputLabelFallback: "อุปกรณ์อินพุต {index}",
            defaultOutputLabelFallback: "อุปกรณ์เอาต์พุต {index}",
        },
        screen: {
            title: "การตั้งค่าหน้าจอ",
            presetLabel: "ค่าที่ตั้งไว้ล่วงหน้า:",
            resolutionPresetSelect: "-- เลือกค่าที่ตั้งไว้ --",
            widthLabel: "ความกว้าง:",
            heightLabel: "ความสูง:",
            widthPlaceholder: "เช่น 1920",
            heightPlaceholder: "เช่น 1080",
            setManualButton: "ตั้งค่าความละเอียดด้วยตนเอง",
            resetButton: "รีเซ็ตเป็นหน้าต่าง",
            scaleLocallyLabel: "ปรับขนาดในเครื่อง:",
            scaleLocallyOn: "เปิด",
            scaleLocallyOff: "ปิด",
            scaleLocallyTitleEnable: "เปิดใช้งานการปรับขนาดในเครื่อง (รักษาสัดส่วนภาพ)",
            scaleLocallyTitleDisable: "ปิดใช้งานการปรับขนาดในเครื่อง (ใช้ความละเอียดที่แน่นอน)",
        },
        stats: {
            title: "สถิติ",
            cpuLabel: "CPU",
            gpuLabel: "การใช้งาน GPU",
            sysMemLabel: "หน่วยความจำระบบ",
            gpuMemLabel: "หน่วยความจำ GPU",
            fpsLabel: "FPS",
            audioLabel: "เสียง",
            tooltipCpu: "การใช้งาน CPU: {value}%",
            tooltipGpu: "การใช้งาน GPU: {value}%",
            tooltipSysMem: "หน่วยความจำระบบ: {used} / {total}",
            tooltipGpuMem: "หน่วยความจำ GPU: {used} / {total}",
            tooltipFps: "FPS ไคลเอ็นต์: {value}",
            tooltipAudio: "บัฟเฟอร์เสียง: {value}",
            tooltipMemoryNA: "ไม่มีข้อมูล",
        },
        clipboard: {
            title: "คลิปบอร์ด",
            label: "คลิปบอร์ดเซิร์ฟเวอร์:",
            placeholder: "เนื้อหาคลิปบอร์ดจากเซิร์ฟเวอร์...",
        },
        files: {
            title: "ไฟล์",
            uploadButton: "อัปโหลดไฟล์",
            uploadButtonTitle: "อัปโหลดไฟล์ไปยังเซสชันระยะไกล",
            downloadButtonTitle: "ดาวน์โหลดไฟล์",
        },
        gamepads: {
            title: "เกมแพด",
            noActivity: "ยังไม่พบกิจกรรมของเกมแพด...",
            touchEnableTitle: "เปิดใช้งานทัชเกมแพด",
            touchDisableTitle: "ปิดใช้งานทัชเกมแพด",
            touchActiveLabel: "ทัชเกมแพด: เปิด",
            touchInactiveLabel: "ทัชเกมแพด: ปิด",
            physicalHiddenForTouch: "การแสดงผลเกมแพดจริงจะถูกซ่อนขณะที่ทัชเกมแพดทำงานอยู่",
            noActivityMobileOrEnableTouch: "ไม่มีเกมแพดจริง เปิดใช้งานทัชเกมแพดหรือเชื่อมต่อคอนโทรลเลอร์"
        },
        apps: {
          title: "แอป",
          openButtonTitle: "จัดการแอป",
          openButton: "จัดการแอป"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (แล็ปท็อป)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: { // New section for "AppsModal"
        closeAlt: "ปิดหน้าต่างแอป",
        loading: "กำลังโหลดแอป...",
        errorLoading: "โหลดข้อมูลแอปไม่สำเร็จ โปรดลองอีกครั้ง",
        searchPlaceholder: "ค้นหาแอป...",
        noAppsFound: "ไม่พบแอปที่ตรงกับการค้นหาของคุณ",
        backButton: "กลับไปที่รายการ",
        installButton: "ติดตั้ง",
        updateButton: "อัปเดต",
        removeButton: "ลบ",
        installingMessage: "กำลังจำลองการติดตั้งสำหรับ: {{appName}}",
        removingMessage: "กำลังจำลองการลบสำหรับ: {{appName}}",
        updatingMessage: "กำลังจำลองการอัปเดตสำหรับ: {{appName}}",
        installedBadge: "ติดตั้งแล้ว"
    },
    notifications: {
        closeButtonAlt: "ปิดการแจ้งเตือนสำหรับ {fileName}",
        uploading: "กำลังอัปโหลด... {progress}%",
        uploadComplete: "อัปโหลดเสร็จสมบูรณ์",
        uploadFailed: "การอัปโหลดล้มเหลว",
        errorPrefix: "ข้อผิดพลาด:",
        unknownError: "เกิดข้อผิดพลาดที่ไม่รู้จัก",
    },
    alerts: {
        invalidResolution: "โปรดป้อนจำนวนเต็มบวกที่ถูกต้องสำหรับความกว้างและความสูง",
    },
    byteUnits: ['ไบต์', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 ไบต์",
    filesModal: {
        closeAlt: "ปิดหน้าต่างไฟล์",
        iframeTitle: "ไฟล์ที่สามารถดาวน์โหลดได้"
    }
};

// --- Filipino Translations ---
const fil = {
    selkiesLogoAlt: "Logo ng Selkies",
    selkiesTitle: "Selkies",
    toggleThemeTitle: "I-toggle ang Tema",
    fullscreenTitle: "Pumasok sa Fullscreen",
    buttons: {
        videoStreamEnableTitle: "Paganahin ang Video Stream",
        videoStreamDisableTitle: "Huwag paganahin ang Video Stream",
        audioStreamEnableTitle: "Paganahin ang Audio Stream",
        audioStreamDisableTitle: "Huwag paganahin ang Audio Stream",
        microphoneEnableTitle: "Paganahin ang Mikropono",
        microphoneDisableTitle: "Huwag paganahin ang Mikropono",
        gamepadEnableTitle: "Paganahin ang Gamepad Input",
        gamepadDisableTitle: "Huwag paganahin ang Gamepad Input",
        virtualKeyboardButtonTitle: "Ipakita ang Keyboard",
    },
    sections: {
        video: {
            title: "Mga Setting ng Video",
            encoderLabel: "Encoder:",
            framerateLabel: "Mga frame bawat segundo ({framerate} FPS):",
            bitrateLabel: "Video Bitrate ({bitrate} Mbps):",
            bufferLabelImmediate: "Laki ng Video Buffer (0 (Agad)):",
            bufferLabelFrames: "Laki ng Video Buffer ({videoBufferSize} frames):",
        },
        audio: {
            title: "Mga Setting ng Audio",
            bitrateLabel: "Audio Bitrate ({bitrate} kbps):",
            inputLabel: "Input (Mikropono):",
            outputLabel: "Output (Speaker):",
            outputNotSupported: "Hindi suportado ng browser na ito ang pagpili ng output device.",
            deviceErrorDefault: "Error sa paglista ng mga audio device: {errorName}",
            deviceErrorPermission: "Tinanggihan ang pahintulot. Mangyaring payagan ang access sa mikropono sa mga setting ng browser upang pumili ng mga device.",
            deviceErrorNotFound: "Walang nahanap na mga audio device.",
            defaultInputLabelFallback: "Input Device {index}",
            defaultOutputLabelFallback: "Output Device {index}",
        },
        screen: {
            title: "Mga Setting ng Screen",
            presetLabel: "Preset:",
            resolutionPresetSelect: "-- Pumili ng Preset --",
            widthLabel: "Lapad:",
            heightLabel: "Taas:",
            widthPlaceholder: "hal., 1920",
            heightPlaceholder: "hal., 1080",
            setManualButton: "Itakda ang Manual na Resolusyon",
            resetButton: "I-reset sa Window",
            scaleLocallyLabel: "I-scale Lokal:",
            scaleLocallyOn: "ON",
            scaleLocallyOff: "OFF",
            scaleLocallyTitleEnable: "Paganahin ang Lokal na Pag-scale (Panatilihin ang Aspect Ratio)",
            scaleLocallyTitleDisable: "Huwag paganahin ang Lokal na Pag-scale (Gamitin ang Eksaktong Resolusyon)",
        },
        stats: {
            title: "Stats",
            cpuLabel: "CPU",
            gpuLabel: "Paggamit ng GPU",
            sysMemLabel: "Sys Mem",
            gpuMemLabel: "GPU Mem",
            fpsLabel: "FPS",
            audioLabel: "Audio",
            tooltipCpu: "Paggamit ng CPU: {value}%",
            tooltipGpu: "Paggamit ng GPU: {value}%",
            tooltipSysMem: "Memorya ng System: {used} / {total}",
            tooltipGpuMem: "Memorya ng GPU: {used} / {total}",
            tooltipFps: "Client FPS: {value}",
            tooltipAudio: "Mga Audio Buffer: {value}",
            tooltipMemoryNA: "N/A", // Hindi Applicable
        },
        clipboard: {
            title: "Clipboard",
            label: "Server Clipboard:",
            placeholder: "Nilalaman ng clipboard mula sa server...",
        },
        files: {
            title: "Mga File",
            uploadButton: "Mag-upload ng mga File",
            uploadButtonTitle: "Mag-upload ng mga file sa remote session",
            downloadButtonTitle: "I-download ang mga File",
        },
        gamepads: {
            title: "Mga Gamepad",
            noActivity: "Wala pang aktibidad ng gamepad na natukoy...",
            touchEnableTitle: "Paganahin ang Touch Gamepad",
            touchDisableTitle: "Huwag paganahin ang Touch Gamepad",
            touchActiveLabel: "Touch Gamepad: ON",
            touchInactiveLabel: "Touch Gamepad: OFF",
            physicalHiddenForTouch: "Nakatago ang display ng pisikal na gamepad habang aktibo ang touch gamepad.",
            noActivityMobileOrEnableTouch: "Walang pisikal na gamepad. Paganahin ang touch gamepad o kumonekta ng controller."
        },
        apps: {
          title: "Mga App",
          openButtonTitle: "Pamahalaan ang mga App",
          openButton: "Pamahalaan ang mga App"
        }
    },
    resolutionPresets: {
        "1920x1080": "1920 x 1080 (FHD)",
        "1280x720": "1280 x 720 (HD)",
        "1366x768": "1366 x 768 (Laptop)",
        "1920x1200": "1920 x 1200 (16:10)",
        "2560x1440": "2560 x 1440 (QHD)",
        "3840x2160": "3840 x 2160 (4K UHD)",
        "1024x768": "1024 x 768 (XGA 4:3)",
        "800x600": "800 x 600 (SVGA 4:3)",
        "640x480": "640 x 480 (VGA 4:3)",
        "320x240": "320 x 240 (QVGA 4:3)",
    },
    appsModal: {
        closeAlt: "Isara ang modal ng mga app",
        loading: "Nilo-load ang mga app...",
        errorLoading: "Nabigo ang pag-load ng data ng app. Pakisubukang muli.",
        searchPlaceholder: "Maghanap ng mga app...",
        noAppsFound: "Walang nahanap na app na tumutugma sa iyong paghahanap.",
        backButton: "Bumalik sa listahan",
        installButton: "I-install",
        updateButton: "I-update",
        removeButton: "Alisin",
        installingMessage: "Sinusubukan ang pag-install para sa: {{appName}}",
        removingMessage: "Sinusubukan ang pag-alis para sa: {{appName}}",
        updatingMessage: "Sinusubukan ang pag-update para sa: {{appName}}",
        installedBadge: "Naka-install"
    },
    notifications: {
        closeButtonAlt: "Isara ang notification para sa {fileName}",
        uploading: "Nag-a-upload... {progress}%",
        uploadComplete: "Kumpleto ang Pag-upload",
        uploadFailed: "Nabigo ang Pag-upload",
        errorPrefix: "Error:",
        unknownError: "May naganap na hindi kilalang error.",
    },
    alerts: {
        invalidResolution: "Mangyaring maglagay ng mga wastong positibong integer para sa Lapad at Taas.",
    },
    byteUnits: ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    zeroBytes: "0 Bytes",
    filesModal: {
        closeAlt: "Isara ang modal ng mga file",
        iframeTitle: "Mga Nada-download na File"
    }
};


// --- Combined Translations Object ---
const translations = {
    en,
    es,
    zh,
    hi,
    pt,
    fr,
    ru,
    de,
    tr,
    it,
    nl,
    ar,
    ko,
    ja,
    vi,
    th,
    fil,
};

// Function to get translations based on language code
// Falls back to 'en' if the language or specific key is missing
export const getTranslator = (langCode = 'en') => {
    const baseLang = langCode.split('-')[0].toLowerCase(); // Get 'en' from 'en-US'
    // Use the specific language dictionary if available, otherwise default to English
    const langDict = translations[baseLang] || translations.en;
    // Always use English as the ultimate fallback if a key is missing even in the selected language
    const fallbackDict = translations.en;

    // The actual translation function
    const t = (key, variables) => {
        const keys = key.split('.');
        let text = langDict;
        let fallbackText = fallbackDict;
        let keyFoundInLang = true; // Check if found in the selected language

        // Traverse the nested objects for the selected language
        for (const k of keys) {
            if (text && typeof text === 'object' && text.hasOwnProperty(k)) {
                text = text[k];
            } else {
                text = null; // Key not found in selected language
                keyFoundInLang = false;
                break;
            }
        }

        // If not found in the selected language (or value is null), try the English fallback
        if (!keyFoundInLang || text === null) {
            let keyFoundInFallback = true;
             for (const k of keys) {
                if (fallbackText && typeof fallbackText === 'object' && fallbackText.hasOwnProperty(k)) {
                    fallbackText = fallbackText[k];
                } else {
                    fallbackText = null; // Key also not found in fallback
                    keyFoundInFallback = false;
                    break;
                }
            }
            // Use fallback text only if it was actually found
            if (keyFoundInFallback && fallbackText !== null) {
                text = fallbackText;
            } else {
                // If not found in either, keep text as null to return the key below
                text = null;
            }
        }

        // If we found a string value in either language or fallback
        if (typeof text === 'string') {
            return simpleInterpolate(text, variables);
        }

        // If key wasn't found anywhere or isn't a string, return the key itself as an indicator
        console.warn(`Translation key not found or invalid: ${key}`);
        return key;
    };

    // Also return the raw dictionary of the selected language (or fallback)
    const raw = langDict;

    return { t, raw };
};

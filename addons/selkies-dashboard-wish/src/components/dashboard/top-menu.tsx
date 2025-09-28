import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ui/ModeToggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
  MenubarSeparator,
  MenubarLabel,
} from "@/components/ui/menubar";
import {
  Volume2,
  Gamepad2,
  Monitor,
  Maximize,
  Mic,
  Settings2,
  Gauge,
  Share2,
  Clipboard as ClipboardIcon,
  FileText,
  LayoutGrid,
  Hand,
  LayoutPanelLeft
} from "lucide-react";

import { Clipboard } from "@/components/dashboard/clipboard";
import { Files } from "@/components/dashboard/files";
import { Apps } from "@/components/dashboard/apps";
import { Settings } from "@/components/dashboard/settings";
import { SystemMonitoring } from "@/components/dashboard/system-monitoring";
import { Sharing } from "@/components/dashboard/sharing";
import { SelkiesLogo } from "@/components/logo";

interface TopMenuProps {
  isVideoActive: boolean;
  isAudioActive: boolean;
  isMicrophoneActive: boolean;
  isGamepadEnabled: boolean;
  onVideoToggle: () => void;
  onAudioToggle: () => void;
  onMicrophoneToggle: () => void;
  onGamepadToggle: () => void;
  toggleStats: () => void;
}

export function TopMenu({
  isVideoActive,
  isAudioActive,
  isMicrophoneActive,
  isGamepadEnabled,
  onVideoToggle,
  onAudioToggle,
  onMicrophoneToggle,
  onGamepadToggle }: TopMenuProps) {
  const [activePanel, setActivePanel] = React.useState<string | null>(null);
  const [showAppsModal, setShowAppsModal] = React.useState(false);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [position, setPosition] = React.useState(() => {
    // Start with a rough center estimate, will be adjusted after mount
    const x = window.innerWidth / 2 - 200; // Reduced from 300 to better estimate actual menu width
    return { x, y: 0 };
  });

  const dragRef = React.useRef<HTMLDivElement>(null);
  const ellipsisRef = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const startPosRef = React.useRef({ x: 0, y: 0 });

  // Center the menu properly after mount
  React.useEffect(() => {
    if (dragRef.current) {
      const menuWidth = dragRef.current.offsetWidth;
      const centerX = (window.innerWidth - menuWidth) / 2;
      setPosition(prev => ({ ...prev, x: centerX }));
    }
  }, []);

  // Dragging functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startPosRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - startPosRef.current.x;
      const newY = e.clientY - startPosRef.current.y;

      // Get the actual dimensions of the menu element
      const menuElement = dragRef.current;
      const menuWidth = menuElement ? menuElement.offsetWidth : 600; // fallback to 600
      const menuHeight = menuElement ? menuElement.offsetHeight : 100; // fallback to 100

      const maxX = window.innerWidth - menuWidth;
      const maxY = window.innerHeight - menuHeight;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Click outside to close panels and dropdown
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Close dropdown if clicking outside dropdown and ellipsis button
      if (showDropdown) {
        const isOutsideEllipsisMenu = ellipsisRef.current && !ellipsisRef.current.contains(target);
        const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target);

        if (isOutsideEllipsisMenu && isOutsideDropdown) {
          setShowDropdown(false);
        }
      }

      // Close panels if clicking outside panel and main menu
      if (activePanel) {
        const isOutsideMainMenu = dragRef.current && !dragRef.current.contains(target);
        const isOutsidePanel = panelRef.current && !panelRef.current.contains(target);

        if (isOutsideMainMenu && isOutsidePanel) {
          setActivePanel(null);
        }
      }
    };

    // Only add listener if there's something to close
    if (activePanel || showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activePanel, showDropdown]);

  const handlePanelToggle = (panelName: string) => {
    // Close dropdown when opening any panel or modal
    setShowDropdown(false);

    if (panelName === 'apps') {
      setShowAppsModal(true);
      return;
    }

    // Implement mutual exclusion - close other panels when opening a new one
    const newPanel = activePanel === panelName ? null : panelName;
    setActivePanel(newPanel);
  };

  const renderPanel = () => {
    switch (activePanel) {
      case 'clipboard':
        return <Clipboard />;
      case 'files':
        return <Files />;
      case 'settings':
        return <Settings />;
      case 'monitoring':
        return <SystemMonitoring />;
      case 'sharing':
        return <Sharing show={true} onClose={() => setActivePanel(null)} />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Ellipsis Control Bar */}
      <motion.div
        ref={ellipsisRef}
        className="fixed top-0 left-0 z-50 w-fit rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg opacity-30 hover:opacity-100 transition-opacity duration-300"
        style={{
          transform: `translate(${position.x - 42}px, ${position.y}px)`,
        }}
      >
        <div className="flex items-center px-2 py-2">
          <Menubar className="h-6 border-0 bg-transparent p-0">
            <MenubarMenu>
              <MenubarTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-6 w-6"
                >
                  <LayoutPanelLeft className="h-4 w-4" />
                </Button>
              </MenubarTrigger>
              <MenubarContent align="start" className="min-w-[200px]">

                <MenubarLabel>Stream Controls</MenubarLabel>

                <MenubarItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onVideoToggle();
                  }}
                >
                  <Monitor className="h-4 w-4 mr-2" />
                  <span className="flex-1">Video Stream</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {isVideoActive ? 'On' : 'Off'}
                  </span>
                </MenubarItem>

                <MenubarItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAudioToggle();
                  }}
                >
                  <Volume2 className="h-4 w-4 mr-2" />
                  <span className="flex-1">Audio Stream</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {isAudioActive ? 'On' : 'Off'}
                  </span>
                </MenubarItem>

                <MenubarItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMicrophoneToggle();
                  }}
                >
                  <Mic className="h-4 w-4 mr-2" />
                  <span className="flex-1">Microphone</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {isMicrophoneActive ? 'On' : 'Off'}
                  </span>
                </MenubarItem>

                <MenubarItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onGamepadToggle();
                  }}
                >
                  <Gamepad2 className="h-4 w-4 mr-2" />
                  <span className="flex-1">Gamepad Input</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {isGamepadEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </MenubarItem>

                <MenubarSeparator />
                <MenubarLabel>Tools & Panels</MenubarLabel>

                <MenubarItem onClick={() => handlePanelToggle('clipboard')}>
                  <ClipboardIcon className="h-4 w-4 mr-2" />
                  <span className="flex-1">Clipboard</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Sync clipboard content
                  </span>
                </MenubarItem>

                <MenubarItem onClick={() => handlePanelToggle('files')}>
                  <FileText className="h-4 w-4 mr-2" />
                  <span className="flex-1">Files</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    File browser
                  </span>
                </MenubarItem>

                <MenubarItem onClick={() => handlePanelToggle('sharing')}>
                  <Share2 className="h-4 w-4 mr-2" />
                  <span className="flex-1">Sharing</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Share session
                  </span>
                </MenubarItem>

                <MenubarSeparator />

                <div className="flex items-center justify-between w-full px-2 py-1">
                  <a
                    href="https://github.com/selkies-project/selkies"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <SelkiesLogo width={20} height={20} />
                    <span className="text-sm font-medium">
                      Selkies
                    </span>
                  </a>
                  <ModeToggle />
                </div>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>
      </motion.div>

      {/* Main Top Menu Bar */}
      <motion.div
        ref={dragRef}
        className="fixed top-0 left-0 z-50 w-fit rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg opacity-30 hover:opacity-100 transition-opacity duration-300"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      >
        <div className="flex items-center space-x-4 px-2 py-2">
          {/* Control Buttons */}
          <div className="flex items-center space-x-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handlePanelToggle('apps')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Apps</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={activePanel === 'settings' ? "default" : "secondary"}
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handlePanelToggle('settings')}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={activePanel === 'monitoring' ? "default" : "secondary"}
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handlePanelToggle('monitoring')}
                >
                  <Gauge className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>System Monitoring</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    if (document.fullscreenElement) {
                      document.exitFullscreen();
                    } else {
                      document.documentElement.requestFullscreen();
                    }
                  }}
                >
                  <Maximize className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle Fullscreen</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-6 w-6 cursor-grab active:cursor-grabbing select-none"
                  onMouseDown={handleMouseDown}
                >
                  <Hand className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Drag Handle</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </motion.div>

      {/* Active Panel */}
      <AnimatePresence>
        {activePanel && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute z-20 w-fit"
            style={{
              left: position.x,
              top: position.y + 48,
            }}
          >
            {renderPanel()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Apps Modal - Separate from panels */}
      {showAppsModal && (
        <Apps isOpen={showAppsModal} onClose={() => setShowAppsModal(false)} />
      )}
    </>
  );
}
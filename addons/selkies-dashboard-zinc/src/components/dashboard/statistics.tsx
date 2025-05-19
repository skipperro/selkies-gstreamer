import { motion, AnimatePresence } from "framer-motion";
import { Settings2, X, Gauge, Hand } from "lucide-react"; 
import { Button } from "@/components/ui/button";
import * as React from "react";
import { SystemMonitoring } from "./system-monitoring";
import { Settings } from "./settings";

interface StatsTopBarProps {
    toggleStats: () => void;
}

export function StatsTopBar({ toggleStats }: StatsTopBarProps) {
    const [showDetails, setShowDetails] = React.useState(false);
    const [showSystemMonitoring, setShowSystemMonitoring] = React.useState(false);
    const [isDragging, setIsDragging] = React.useState(false);
    const [position, setPosition] = React.useState(() => {
        // Calculate center position on mount
        const x = window.innerWidth / 2 - 150;
        return { x, y: 0 };
    });
    const dragRef = React.useRef<HTMLDivElement>(null);
    const startPosRef = React.useRef({ x: 0, y: 0 });

    const toggleDetails = () => {
        setShowDetails((prev) => !prev);
        if (!showDetails) {
            setShowSystemMonitoring(false);
        }
    };

    const toggleSystemMonitoring = () => {
        setShowSystemMonitoring((prev) => !prev);
        if (!showSystemMonitoring) {
            setShowDetails(false);
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        startPosRef.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            
            const newX = e.clientX - startPosRef.current.x;
            const newY = e.clientY - startPosRef.current.y;
            setPosition({ x: newX, y: newY });
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

    return (
        <>
            <motion.div
                ref={dragRef}
                initial={{ y: "-100%" }}
                animate={{ y: 0 }}
                exit={{ y: "-100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute z-50 w-fit rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg"
                style={{
                    left: position.x,
                    top: position.y,
                }}
            >
                <div className="flex items-center space-x-4 px-4 py-2">
                    <div className="flex items-center space-x-1">
                        <Button
                            variant={showDetails ? "default" : "secondary"}
                            size="icon"
                            className="h-6 w-6"
                            onClick={toggleDetails}
                        >
                            <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={showSystemMonitoring ? "default" : "secondary"}
                            size="icon"
                            className="h-6 w-6"
                            onClick={toggleSystemMonitoring}
                        >
                            <Gauge className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="secondary"
                            size="icon"
                            className="h-6 w-6"
                            onClick={toggleStats}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="secondary"
                            size="icon"
                            className="h-6 w-6 cursor-grab active:cursor-grabbing select-none"
                            onMouseDown={handleMouseDown}
                        >
                            <Hand className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </motion.div>

            <AnimatePresence>
                {showDetails && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute z-20 w-fit"
                        style={{
                            left: position.x,
                            top: position.y + 48,
                        }}
                    >
                        <Settings scale={0.8} />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showSystemMonitoring && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute z-20 w-fit"
                        style={{
                            left: position.x,
                            top: position.y + 48,
                        }}
                    >
                        <SystemMonitoring scale={0.8} />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
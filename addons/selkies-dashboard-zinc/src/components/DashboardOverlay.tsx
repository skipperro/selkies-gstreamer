import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { MenuComponent } from './dashboard/side-menu';
import '../styles/Overlay.css';

interface DashboardOverlayProps {
  container: Element | null;
}

function DashboardOverlay({ container }: DashboardOverlayProps): React.ReactElement | null {
  const [isGamepadEnabled, setIsGamepadEnabled] = useState<boolean>(false);

  if (!container) {
    return null;
  }

  return ReactDOM.createPortal(
    <div>
      <MenuComponent isGamepadEnabled={isGamepadEnabled} onGamepadToggle={setIsGamepadEnabled} />
    </div>,
    container
  );
}

export default DashboardOverlay; 


// src/components/DashboardOverlay.jsx
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import Sidebar from './Sidebar';
import ToggleHandle from './ToggleHandle';
import '../styles/Overlay.css';

function DashboardOverlay({ container }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  if (!container) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className="dashboard-overlay-container">
      {/* Render the Sidebar and ToggleHandle components */}
      <Sidebar isOpen={isOpen} />
      <ToggleHandle isOpen={isOpen} onToggle={toggleSidebar} />
    </div>,
    container
  );
}

export default DashboardOverlay;

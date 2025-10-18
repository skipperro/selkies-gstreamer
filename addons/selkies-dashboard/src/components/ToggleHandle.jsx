// src/components/ToggleHandle.jsx
import React from 'react';

function ToggleHandle({ isOpen, onToggle }) {
  const handleClasses = 'toggle-handle';

  return (
    <div
      className={handleClasses}
      onClick={onToggle}
      title={`${isOpen ? 'Close' : 'Open'} Dashboard`} 
    >
      <div className="toggle-indicator"></div>
    </div>
  );
}

export default ToggleHandle;

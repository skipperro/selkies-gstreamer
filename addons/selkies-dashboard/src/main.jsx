// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const dashboardRoot = document.createElement('div');
dashboardRoot.id = 'dashboard-root';
document.body.appendChild(dashboardRoot);
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App dashboardRoot={dashboardRoot} />
  </React.StrictMode>,
);

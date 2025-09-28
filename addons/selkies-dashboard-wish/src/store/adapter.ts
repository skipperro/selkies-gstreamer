// src/store/adapter.ts
// Adapter to use the main dashboard's state management in the Wish dashboard

// Copy the store files from the main dashboard or import them
// For now, we'll create a simple interface that matches what the Wish dashboard needs

export interface StreamState {
  videoEnabled: boolean;
  audioEnabled: boolean;
  microphoneEnabled: boolean;
  gamepadEnabled: boolean;
}

export interface StreamActions {
  toggleVideo: () => void;
  toggleAudio: () => void;
  toggleMicrophone: () => void;
  toggleGamepad: () => void;
}

// Mock implementation - in real usage, this would use the actual SelkiesStore
class WishDashboardAdapter {
  private state: StreamState = {
    videoEnabled: true,
    audioEnabled: true,
    microphoneEnabled: false,
    gamepadEnabled: true,
  };

  private listeners = new Set<(state: StreamState) => void>();

  getState(): StreamState {
    return { ...this.state };
  }

  subscribe(listener: (state: StreamState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  toggleVideo = () => {
    this.state.videoEnabled = !this.state.videoEnabled;
    this.notify();
    // Send message to Selkies core
    window.postMessage({
      type: 'setting',
      key: 'video_enabled',
      value: this.state.videoEnabled
    }, window.location.origin);
  };

  toggleAudio = () => {
    this.state.audioEnabled = !this.state.audioEnabled;
    this.notify();
    window.postMessage({
      type: 'setting',
      key: 'audio_enabled',
      value: this.state.audioEnabled
    }, window.location.origin);
  };

  toggleMicrophone = () => {
    this.state.microphoneEnabled = !this.state.microphoneEnabled;
    this.notify();
    window.postMessage({
      type: 'setting',
      key: 'microphone_enabled',
      value: this.state.microphoneEnabled
    }, window.location.origin);
  };

  toggleGamepad = () => {
    this.state.gamepadEnabled = !this.state.gamepadEnabled;
    this.notify();
    window.postMessage({
      type: 'setting',
      key: 'gamepad_enabled',
      value: this.state.gamepadEnabled
    }, window.location.origin);
  };
}

// Singleton instance
let adapterInstance: WishDashboardAdapter | null = null;

export const getWishAdapter = () => {
  if (!adapterInstance) {
    adapterInstance = new WishDashboardAdapter();
  }
  return adapterInstance;
};

// React hook for the Wish dashboard
import { useState, useEffect } from 'react';

export const useWishStreamControls = (): [StreamState, StreamActions] => {
  const adapter = getWishAdapter();
  const [state, setState] = useState(adapter.getState());

  useEffect(() => {
    const unsubscribe = adapter.subscribe(setState);
    return unsubscribe;
  }, [adapter]);

  const actions: StreamActions = {
    toggleVideo: adapter.toggleVideo,
    toggleAudio: adapter.toggleAudio,
    toggleMicrophone: adapter.toggleMicrophone,
    toggleGamepad: adapter.toggleGamepad,
  };

  return [state, actions];
};

// In a real implementation, you would:
// 1. Copy the entire store system from the main dashboard
// 2. Use the actual SelkiesStore instead of this mock
// 3. Import the hooks directly: import { useStreamControls } from '../../../selkies-dashboard/src/store';
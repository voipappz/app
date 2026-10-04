import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// testing-library gives each findBy*/waitFor 1000ms, a budget separate from
// (and nested inside) vitest's testTimeout. The DataGrid specs exceed it on a
// loaded machine: PortalCalls' "full filtered count" test clicks to page two
// and waits for the new row, which needs a mock to resolve, state to settle
// and a 25-row grid to re-render. It passed on some runs and not others, and
// raising only vitest's timeout just moved the failure from the test's own
// deadline to this one.
//
// Timing, not logic -- vitest's summary attributes ~30% of total runtime to
// building jsdom 48 times. Raised together so the outer budget still exceeds
// the sum of the inner ones; a query for something genuinely absent still
// fails, 5s later instead of 1s.
configure({ asyncUtilTimeout: 5000 });

// Add DOM environment globals
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000'
  },
  writable: true
});

// Add document.createElement mock if needed
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ style: {} }),
    body: { appendChild: () => {}, removeChild: () => {} }
  };
}

// Mock WebRTC APIs
globalThis.MediaStream = class MockMediaStream {
  constructor() {
    this.id = 'mock-stream-id';
    this.active = true;
    this.getTracks = () => [];
    this.getAudioTracks = () => [];
    this.getVideoTracks = () => [];
  }
};

globalThis.RTCPeerConnection = class MockRTCPeerConnection {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.signalingState = 'stable';
    this.connectionState = 'new';
  }
  
  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'mock-offer-sdp' });
  }
  
  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'mock-answer-sdp' });
  }
  
  setLocalDescription(description) {
    this.localDescription = description;
    return Promise.resolve();
  }
  
  setRemoteDescription(description) {
    this.remoteDescription = description;
    return Promise.resolve();
  }
  
  addIceCandidate() {
    return Promise.resolve();
  }
  
  close() {}
  
  addEventListener() {}
  removeEventListener() {}
};

// Mock WebSocket
globalThis.WebSocket = class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1; // OPEN
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }
  
  send() {}
  close() {
    this.readyState = 3; // CLOSED
  }
};

// Mock getUserMedia — augment the existing navigator (do NOT replace it; a spread
// drops navigator.userAgent, which React DOM reads at init → undefined.indexOf).
if (globalThis.navigator && !globalThis.navigator.mediaDevices) {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia: () => Promise.resolve(new MediaStream()) },
    configurable: true,
  });
}
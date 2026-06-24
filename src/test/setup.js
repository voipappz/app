import '@testing-library/jest-dom';

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

// Mock getUserMedia
globalThis.navigator = {
  ...globalThis.navigator,
  mediaDevices: {
    getUserMedia: () => Promise.resolve(new MediaStream())
  }
};
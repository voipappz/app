# WebRTC Phone Call Test Instructions

## 📞 Test Call to Mobile: 97245234585

### Prerequisites
1. ✅ Dev server running at: http://localhost:4200
2. ✅ Chrome/Firefox browser (WebRTC support required)
3. ✅ Microphone permissions (will be requested)
4. ✅ Internet connection for SIP server

### Step-by-Step Test Process

#### 1. Open Application
- Navigate to: `http://localhost:4200`
- Login with any test credentials

#### 2. Locate WebRTC Phone
- Look for phone icon in top-right corner of the interface
- Click to open the WebRTC phone widget

#### 3. Check Connection Status
- Verify connection indicator shows "Connected" or "Registered"
- Extension should show "1004" 
- Status should show "Available"

#### 4. Make the Call
```javascript
// The call will be made to:
Target Number: 97245234585
SIP URI: sip:97245234585@mtn-portal.voipappz.io
Server: wss://mtn-portal.voipappz.io:8443
```

**Steps:**
1. Click "DIALPAD" tab in phone widget
2. Enter number: `97245234585`
3. Click green "Call" button
4. Grant microphone permission if prompted
5. Wait for connection (should ring your mobile)

#### 5. Expected Call Flow
```
Browser WebRTC → SIP.js → WSS Connection → mtn-portal.voipappz.io → PSTN → Your Mobile (97245234585)
```

#### 6. Troubleshooting

**If Call Fails:**
- Check browser console (F12) for SIP errors
- Verify microphone permissions granted
- Check network connectivity
- Ensure SIP server credentials are correct

**Console Logs to Look For:**
- `🚀 Initializing SIP service...`
- `✅ SIP registration successful`
- `📞 Making call to: sip:97245234585@mtn-portal.voipappz.io`
- `📤 Sending INVITE...`

**If SIP Registration Fails:**
- Server might be down or credentials changed
- Network firewall might be blocking WSS
- Check if server `mtn-portal.voipappz.io:8443` is accessible

### Current Configuration
```javascript
SIP Configuration:
- Username: 1004
- Password: YnTrDmEoniG8ag  
- Server: wss://mtn-portal.voipappz.io:8443
- Domain: mtn-portal.voipappz.io
```

### Test Results Expected
1. **Your mobile should ring** with incoming call
2. **Browser should show** call timer and controls
3. **Audio should work** bidirectionally when answered
4. **Call controls** (mute, hold, hangup) should function

### Alternative Test Numbers
If your mobile doesn't work, try these test extensions:
- `1000` - Echo test
- `1001` - Test extension  
- `1002` - Another test extension

---

**Note**: This is a REAL WebRTC implementation with actual SIP server integration. The call to 97245234585 should reach your actual mobile phone through the PSTN network.
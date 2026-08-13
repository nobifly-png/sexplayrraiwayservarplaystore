# Mobile App - Views Not Counting Fix

## 🐛 Problem
Videos are playing in the app but views are NOT being counted in the backend because playback tracking APIs are not being called.

## ✅ Solution
Add playback tracking to `PlayerProvider` to call backend APIs during video playback.

---

## 📝 Frontend AI Instructions

### Issue:
The Flutter app has playback API methods defined in `ApiClient` but they are never called from `PlayerProvider`. This means:
- No playback sessions are created
- No playback events are sent
- No view counting happens
- Creator earnings are not tracked

### Location:
File: `D:\novax_player\lib\core\providers\player_provider.dart`

### What to Add:

#### 1. Import device_info_plus package
First, add to `pubspec.yaml`:
```yaml
dependencies:
  device_info_plus: ^10.1.0
```

#### 2. Update PlayerProvider to track playback

Add these fields to PlayerProvider class:
```dart
String? _sessionId;
String? _linkId;
Timer? _heartbeatTimer;
int _lastPositionSeconds = 0;
```

#### 3. Generate device fingerprint
```dart
Future<String> _getDeviceFingerprint() async {
  final deviceInfo = DeviceInfoPlugin();
  if (Platform.isAndroid) {
    final android = await deviceInfo.androidInfo;
    return '${android.id}_${android.model}_${android.androidId}';
  } else if (Platform.isIOS) {
    final ios = await deviceInfo.iosInfo;
    return '${ios.identifierForVendor}_${ios.model}';
  }
  return 'unknown';
}
```

#### 4. Modify loadVideo() method

**Current code:**
```dart
Future<void> loadVideo(VideoModel video) async {
  _currentVideo = video;
  _error = null;
  notifyListeners();

  try {
    final ctrl = VideoPlayerController.network(video.streamUrl);
    await ctrl.initialize();
    _controller?.dispose();
    _controller = ctrl;
    _isInitialized = true;
    notifyListeners();
  } catch (e) {
    _error = 'Failed to load video: $e';
    notifyListeners();
  }
}
```

**NEW code (add playback tracking):**
```dart
Future<void> loadVideo(VideoModel video) async {
  _currentVideo = video;
  _error = null;
  _linkId = video.linkId; // Store linkId from video metadata
  notifyListeners();

  try {
    // 1. Start playback session
    final fingerprint = await _getDeviceFingerprint();
    if (_linkId != null) {
      _sessionId = await _apiClient.startPlaybackSession(
        linkId: _linkId!,
        fingerprint: fingerprint,
      );
      print('📊 Playback session started: $_sessionId');
    }

    // 2. Initialize video player
    final ctrl = VideoPlayerController.network(video.streamUrl);
    await ctrl.initialize();
    _controller?.dispose();
    _controller = ctrl;
    _isInitialized = true;

    // 3. Send PAGE_OPEN event
    if (_sessionId != null) {
      await _apiClient.sendPlaybackEvent(
        sessionId: _sessionId!,
        eventType: 'PAGE_OPEN',
        positionSeconds: 0,
      );
    }

    notifyListeners();
  } catch (e) {
    _error = 'Failed to load video: $e';
    notifyListeners();
  }
}
```

#### 5. Modify play() method

**Add after play:**
```dart
Future<void> play() async {
  await _controller?.play();
  
  // Send PLAY event
  if (_sessionId != null) {
    final pos = _controller?.value.position.inSeconds ?? 0;
    await _apiClient.sendPlaybackEvent(
      sessionId: _sessionId!,
      eventType: 'PLAY',
      positionSeconds: pos,
    );
    _startHeartbeat(); // Start progress tracking
  }
  
  notifyListeners();
}
```

#### 6. Modify pause() method

**Add after pause:**
```dart
Future<void> pause() async {
  await _controller?.pause();
  
  // Send PAUSE event
  if (_sessionId != null) {
    final pos = _controller?.value.position.inSeconds ?? 0;
    await _apiClient.sendPlaybackEvent(
      sessionId: _sessionId!,
      eventType: 'PAUSE',
      positionSeconds: pos,
    );
    _stopHeartbeat();
  }
  
  notifyListeners();
}
```

#### 7. Add heartbeat timer (sends PROGRESS every 10 seconds)

```dart
void _startHeartbeat() {
  _heartbeatTimer?.cancel();
  _heartbeatTimer = Timer.periodic(const Duration(seconds: 10), (_) {
    if (_sessionId != null && _controller != null) {
      final pos = _controller!.value.position.inSeconds;
      
      // Only send if position changed (user is watching)
      if (pos != _lastPositionSeconds) {
        _apiClient.sendPlaybackEvent(
          sessionId: _sessionId!,
          eventType: 'PROGRESS',
          positionSeconds: pos,
        );
        _lastPositionSeconds = pos;
        print('💓 Heartbeat sent: ${pos}s');
      }
    }
  });
}

void _stopHeartbeat() {
  _heartbeatTimer?.cancel();
  _heartbeatTimer = null;
}
```

#### 8. Add dispose cleanup

**Modify dispose() method:**
```dart
@override
void dispose() {
  _stopHeartbeat();
  
  // Finalize playback session
  if (_sessionId != null) {
    _apiClient.finalizePlayback(sessionId: _sessionId!);
    print('✅ Playback session finalized: $_sessionId');
  }
  
  _controller?.dispose();
  super.dispose();
}
```

#### 9. Handle video end

Add listener to controller to detect when video ends:
```dart
_controller!.addListener(() {
  if (_controller!.value.position >= _controller!.value.duration - const Duration(seconds: 1)) {
    // Video ended
    if (_sessionId != null) {
      _apiClient.sendPlaybackEvent(
        sessionId: _sessionId!,
        eventType: 'END',
        positionSeconds: _controller!.value.duration.inSeconds,
      );
    }
  }
});
```

---

## 🔍 How to Verify

After implementing above changes:

### Backend Logs (Railway):
```
📊 Playback session started: 67890abc123
💓 Heartbeat sent: 10s
💓 Heartbeat sent: 20s
💓 Heartbeat sent: 30s
✅ Playback session finalized: 67890abc123
```

### Database Check:
```javascript
// Check PlaybackSession collection
db.playbacksessions.find().sort({createdAt: -1}).limit(1)

// Check ViewLedger collection
db.viewledgers.find().sort({createdAt: -1}).limit(1)
```

### Dashboard:
- Views count should increase
- Earnings should increase by $0.001 per 4 valid views
- Analytics should show view activity

---

## 📋 Testing Checklist

1. ✅ Install `device_info_plus` package
2. ✅ Update PlayerProvider with all changes above
3. ✅ Run app and play a video for 10+ seconds
4. ✅ Check Railway logs for playback events
5. ✅ Check dashboard - views should increment
6. ✅ Check earnings - should show $0.001 per 4 views

---

## ⚠️ Important Notes

### Minimum Watch Time:
Backend requires **minimum 5 seconds watch time** for a valid view. Make sure:
- User watches for at least 5 seconds
- Manual PLAY button is clicked (not autoplay)
- Progress events are sent

### View Counting Formula:
- 4 real views = 1 counted view
- 1 counted view = $0.001 earnings
- Example: 100 real views = 25 counted views = $0.025

### Fraud Prevention:
Backend automatically checks:
- Same IP watching too many videos (max 10/hour)
- Same device watching same video multiple times
- Watch time < 5 seconds (rejected)
- High fraud score (rejected)

---

## 🐛 Common Issues

### Issue: "sessionId is null"
**Solution:** Check that `video.linkId` exists in VideoModel. If not, update the model to include it from API response.

### Issue: No events in Railway logs
**Solution:** Check API_CLIENT baseUrl is correct: `https://sexplayrraiwayservarplaystore-production.up.railway.app/api`

### Issue: Views still not counting
**Solution:** 
1. Check Railway logs for error messages
2. Verify user watched for >5 seconds
3. Check that manual play was clicked
4. Verify fingerprint is being generated correctly

---

## 📞 Need Help?

If views still not counting after implementing this:
1. Share Railway logs (last 100 lines)
2. Share Flutter debug logs
3. Share VideoModel structure (to verify linkId field exists)

---

**This will fix view counting completely!** 🎯

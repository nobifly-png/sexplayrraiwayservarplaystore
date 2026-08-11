# 📱 Mobile App AI Prompt - ClipNova Mobile App

## Overview

ClipNova mobile app mein koi major changes **NAHI** karne hain. Backend changes mostly website (admin dashboard) ke liye hain.

---

## 🔍 Quick Summary

### Feature 1: Password Reset
**Mobile Impact:** ❌ **NO CHANGES NEEDED**

**Reason:** 
- Mobile app normal login karta hai
- Forgot password link user ko **website** pe le jayega
- Password reset **email ke through browser** mein hota hai
- Mobile app sirf login API use karta hai jo unchanged hai

---

### Feature 2: View Counting (4:1 Ratio)
**Mobile Impact:** ❌ **NO CHANGES NEEDED** (mostly)

**Reason:**
- Mobile app sirf video play karta hai
- View counting backend mein hoti hai
- Mobile ko sirf playback APIs call karni hain
- Backend automatically counted views return karti hai

---

## 📱 What Mobile App Does (Unchanged)

### 1. Video Playback Flow
```
User clicks link → App opens video → Video plays → Backend counts view
```

**Mobile APIs (Same as before):**
```http
# Start playback
POST /api/playback/start

# Finalize playback (after watching)
POST /api/playback/finalize
```

**No changes needed in mobile app code!**

---

### 2. Analytics Display (Minor Update)

If your mobile app shows earnings/analytics to creator:

#### Currency Display Update

**OLD:**
```dart
// Flutter example
Text('\$${earnings.toStringAsFixed(2)}')
// Shows: $1.00, $2.00
```

**NEW:**
```dart
// Flutter example
String formatCurrency(double amount) {
  if (amount.abs() < 1) {
    return '\$${amount.toStringAsFixed(3)}';  // 3 decimals
  } else {
    return '\$${amount.toStringAsFixed(2)}';  // 2 decimals
  }
}

// Usage:
Text(formatCurrency(earnings))
// Shows: $0.001, $0.002, $1.00
```

**React Native example:**
```javascript
const formatCurrency = (amount) => {
  if (Math.abs(amount) < 1) {
    return `$${amount.toFixed(3)}`;  // 3 decimals
  } else {
    return `$${amount.toFixed(2)}`;  // 2 decimals
  }
};

// Usage:
<Text>{formatCurrency(earnings)}</Text>
```

---

## ❓ Does Mobile App Need Password Reset?

### Option 1: No In-App Password Reset (Recommended)
```dart
// Just add a link to website
TextButton(
  onPressed: () {
    launchUrl('https://yourwebsite.com/forgot-password');
  },
  child: Text('Forgot Password?'),
)
```

**Pros:**
- ✅ No extra code in mobile
- ✅ Email link works better in browser
- ✅ Easier to maintain

---

### Option 2: Full In-App Flow (If you want)

If you want complete in-app experience:

#### Step 1: Forgot Password Screen
```dart
// Request reset link
Future<void> forgotPassword(String email) async {
  final response = await http.post(
    Uri.parse('$API_URL/api/auth/forgot-password'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email}),
  );
  
  if (response.statusCode == 200) {
    // Show success message
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Email Sent'),
        content: Text('Check your email for reset instructions'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('OK'),
          ),
        ],
      ),
    );
  }
}
```

#### Step 2: Handle Deep Link
User clicks email link → Opens app with token

```dart
// Deep link handler
void handleDeepLink(Uri uri) {
  if (uri.path == '/reset-password') {
    final token = uri.queryParameters['token'];
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ResetPasswordScreen(token: token),
      ),
    );
  }
}
```

#### Step 3: Reset Password Screen
```dart
Future<void> resetPassword(String token, String newPassword) async {
  final response = await http.post(
    Uri.parse('$API_URL/api/auth/reset-password'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'token': token,
      'newPassword': newPassword,
    }),
  );
  
  if (response.statusCode == 200) {
    // Success - navigate to login
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (context) => LoginScreen()),
      (route) => false,
    );
  }
}
```

**Note:** Option 2 requires deep linking setup, which is complex. **Option 1 is better.**

---

## 🎯 Mobile App Changes Summary

### Minimum Changes (Recommended)

1. **Add "Forgot Password?" Link on Login Screen**
   ```dart
   TextButton(
     onPressed: () => launchUrl('https://yourwebsite.com/forgot-password'),
     child: Text('Forgot Password?'),
   )
   ```

2. **Update Currency Formatter (if showing earnings)**
   ```dart
   String formatCurrency(double amount) {
     if (amount.abs() < 1) {
       return '\$${amount.toStringAsFixed(3)}';
     } else {
       return '\$${amount.toStringAsFixed(2)}';
     }
   }
   ```

**That's it!** Bas 2 choti changes. 🎉

---

## API Endpoints (Unchanged for Mobile)

### Authentication
```http
POST /api/auth/login           # Login (unchanged)
POST /api/auth/register        # Register (unchanged)
POST /api/auth/refresh         # Refresh token (unchanged)
POST /api/auth/logout          # Logout (unchanged)
```

### Playback
```http
POST /api/playback/start       # Start video (unchanged)
POST /api/playback/finalize    # Finalize view (unchanged)
```

### Analytics (Optional in mobile)
```http
GET /api/analytics/overview    # Get stats (view counts now counted views)
GET /api/wallet                # Get earnings (amounts now with 3 decimals)
```

---

## Testing Checklist

### If Adding Website Link (Option 1)
- [ ] "Forgot Password?" link opens browser
- [ ] Website URL is correct
- [ ] Link works on Android
- [ ] Link works on iOS

### If Adding Currency Format Update
- [ ] Small amounts show 3 decimals ($0.001)
- [ ] Large amounts show 2 decimals ($1.00)
- [ ] Negative amounts handled correctly
- [ ] Zero shows as $0.00

### If Building Full Flow (Option 2) - Not Recommended
- [ ] Deep links configured
- [ ] Email link opens app
- [ ] Token passed correctly
- [ ] Reset password works
- [ ] Success navigation works

---

## Platform-Specific Notes

### Android (Flutter)
```yaml
# pubspec.yaml - for launching URLs
dependencies:
  url_launcher: ^6.1.11
```

```dart
import 'package:url_launcher/url_launcher.dart';

// Launch website
await launchUrl(
  Uri.parse('https://yourwebsite.com/forgot-password'),
  mode: LaunchMode.externalApplication,
);
```

### iOS (Flutter)
```xml
<!-- ios/Runner/Info.plist - for launching URLs -->
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>https</string>
  <string>http</string>
</array>
```

### React Native
```bash
npm install react-native-url-open
```

```javascript
import { openURL } from 'react-native-url-open';

// Launch website
openURL('https://yourwebsite.com/forgot-password');
```

---

## View Counting Impact on Mobile

### What Changed in Backend
```
OLD: 1000 real views → 1000 shown → $130 earnings
NEW: 1000 real views → 250 counted → $1 earnings
```

### Mobile App Impact
**None!** Mobile just plays videos. Backend counts everything.

### If Mobile Shows Analytics

Backend API responses now return:
```json
{
  "totalViews": 250.75,          // Counted views (not real)
  "totalEarnings": 1.003,        // New earnings rate
  "totalEarningsFormatted": "$1.00"
}
```

Just display these numbers as-is. Backend handles conversion.

---

## Example Login Screen Update

### Before
```dart
class LoginScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          TextField(decoration: InputDecoration(labelText: 'Email')),
          TextField(decoration: InputDecoration(labelText: 'Password')),
          ElevatedButton(
            onPressed: () => login(),
            child: Text('Login'),
          ),
        ],
      ),
    );
  }
}
```

### After (with Forgot Password link)
```dart
class LoginScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          TextField(decoration: InputDecoration(labelText: 'Email')),
          TextField(decoration: InputDecoration(labelText: 'Password')),
          ElevatedButton(
            onPressed: () => login(),
            child: Text('Login'),
          ),
          
          // NEW: Add this link
          TextButton(
            onPressed: () async {
              final url = 'https://yourwebsite.com/forgot-password';
              if (await canLaunchUrl(Uri.parse(url))) {
                await launchUrl(Uri.parse(url));
              }
            },
            child: Text('Forgot Password?'),
          ),
        ],
      ),
    );
  }
}
```

---

## Currency Formatter Example

### Flutter
```dart
class CurrencyUtils {
  static String format(double amount) {
    if (amount.abs() < 1) {
      return '\$${amount.toStringAsFixed(3)}';
    } else {
      return '\$${amount.toStringAsFixed(2)}';
    }
  }
}

// Usage in widget:
Text(
  'Earnings: ${CurrencyUtils.format(wallet.totalEarnings)}',
  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
)
```

### React Native
```javascript
export const formatCurrency = (amount) => {
  if (Math.abs(amount) < 1) {
    return `$${amount.toFixed(3)}`;
  } else {
    return `$${amount.toFixed(2)}`;
  }
};

// Usage in component:
<Text style={styles.earnings}>
  Earnings: {formatCurrency(wallet.totalEarnings)}
</Text>
```

---

## Do You Need Analytics in Mobile?

### Most Video Apps Don't Show Analytics

Mobile apps usually just play videos. Analytics are shown on **website dashboard**.

**If your app doesn't show earnings/analytics:**
- ✅ No changes needed at all!
- ✅ Just add "Forgot Password?" link
- ✅ That's it!

**If your app shows analytics:**
- ✅ Add currency formatter (3 decimals)
- ✅ Display view counts as received from API
- ✅ No other changes needed

---

## Summary for Mobile App AI

### ✅ Changes Needed (Minimum):

1. **Add Forgot Password Link** (1 line of code)
   ```dart
   TextButton(
     onPressed: () => launchUrl('https://website.com/forgot-password'),
     child: Text('Forgot Password?'),
   )
   ```

2. **Update Currency Display** (Optional - only if showing earnings)
   ```dart
   String formatCurrency(double amount) {
     return amount.abs() < 1 
       ? '\$${amount.toStringAsFixed(3)}'
       : '\$${amount.toStringAsFixed(2)}';
   }
   ```

### ❌ Changes NOT Needed:

- ❌ Video playback code
- ❌ API endpoints
- ❌ Authentication flow
- ❌ View counting logic
- ❌ Most analytics code

---

## Final Answer

### Mere Hisaab Se (My Opinion):

**App mein almost kuch nahi karna hai!** 🎉

1. **Agar app sirf video play karta hai:** Kuch bhi change nahi
2. **Agar app login screen hai:** Sirf "Forgot Password?" link add karo
3. **Agar app earnings dikhata hai:** Currency formatter update karo (3 decimals)

**Backend changes mostly website admin panel ke liye hain.**

Mobile app ke liye bahut simple changes hain - optional bhi ho sakte hain!

---

## Configuration

Replace with your actual URLs:

```dart
// Flutter
const String API_BASE_URL = 'https://your-backend.com';
const String WEBSITE_URL = 'https://your-website.com';

// Usage:
final forgotPasswordUrl = '$WEBSITE_URL/forgot-password';
```

```javascript
// React Native
export const API_BASE_URL = 'https://your-backend.com';
export const WEBSITE_URL = 'https://your-website.com';

// Usage:
const forgotPasswordUrl = `${WEBSITE_URL}/forgot-password`;
```

---

**That's it for mobile app!** Simple aur minimal changes. 🚀

**Mobile Impact: VERY LOW** ✅

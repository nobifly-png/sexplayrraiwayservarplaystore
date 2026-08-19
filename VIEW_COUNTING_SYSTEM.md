# 📊 View Counting System - Documentation

## Overview

Zexgram uses a **4:1 view counting ratio** where 4 real views equal 1 counted view that's displayed to admins.

---

## 💰 Earnings Formula

### Basic Formula
```
Counted Views = Real Views / 4
Earnings = Real Views × $0.001
```

### Earnings Rate
- **Per Real View:** $0.001
- **Per 1000 Counted Views:** $4.00
- **4 Real Views = 1 Counted View**

---

## 📈 Examples

| Real Views | Counted Views | Earnings | Display Format |
|-----------|---------------|----------|----------------|
| 1 | 0.25 | $0.001 | $0.001 |
| 2 | 0.50 | $0.002 | $0.002 |
| 3 | 0.75 | $0.003 | $0.003 |
| 4 | 1.00 | $0.004 | $0.004 |
| 10 | 2.50 | $0.010 | $0.01 |
| 40 | 10 | $0.040 | $0.04 |
| 100 | 25 | $0.100 | $0.10 |
| 400 | 100 | $0.400 | $0.40 |
| 1000 | 250 | $1.000 | $1.00 |
| 4000 | 1000 | $4.000 | $4.00 |
| 10000 | 2500 | $10.00 | $10.00 |

---

## 🎯 Key Features

### 1. Real-Time Fractional Counting
- Every view counts immediately
- Fractional counted views: 0.25, 0.50, 0.75, 1.00...
- Smooth progressive earnings display
- No waiting for batch of 4 views

### 2. Transparent Earnings Display
- First view shows: $0.001
- Second view shows: $0.002
- Third view shows: $0.003
- Fourth view shows: $0.004
- Continuous progression builds trust

### 3. Admin Dashboard
- **Shows:** Counted views only
- **Hides:** Real views (no confusion)
- **Format:** 3 decimals for < $1, 2 decimals for ≥ $1
- **Progressive:** $0.001 → $0.002 → $0.003...

---

## 💡 Why This System?

### Benefits

✅ **Transparent:** Admin sees earnings from first view  
✅ **Belief:** Progressive display ($0.001, $0.002...) builds confidence  
✅ **Simple:** Only counted views shown (no confusion)  
✅ **Fair:** 4:1 ratio is clear and consistent  
✅ **Real-time:** Immediate feedback on every view  

### Business Logic

**Problem with Old System:**
- 1 view = $0.13 immediate payment
- Too expensive for platform
- Not sustainable

**Solution:**
- Reduce per-view cost: $0.13 → $0.001
- Show counted views to admin
- Keep earnings transparent with decimals
- 4:1 ratio makes costs manageable

---

## 🔧 Technical Implementation

### Constants
```javascript
// src/common/constants/index.js
const DEFAULT_EARNINGS_PER_VIEW = 0.001; // $0.001 per real view
const VIEW_TO_COUNTED_RATIO = 4; // 4 real views = 1 counted view
```

### Currency Formatter
```javascript
// src/common/utils/currency.js
const formatCurrency = (amount) => {
  // Use 3 decimals for < $1, otherwise 2 decimals
  const decimals = Math.abs(amount) < 1 ? 3 : 2;
  return `$${Number(amount).toFixed(decimals)}`;
};
```

### Analytics Conversion
```javascript
// src/modules/analytics/analytics.service.js
const calculateCountedViews = (realViews) => {
  return realViews / VIEW_TO_COUNTED_RATIO;
};

// All analytics endpoints use this function
totalViews: calculateCountedViews(totalRealViews)
```

---

## 📊 Dashboard Display

### Creator Dashboard
```json
{
  "totalViews": 250.75,        // Counted views (1003 real / 4)
  "validViews": 212.50,         // Counted valid (850 real / 4)
  "rejectedViews": 38.25,       // Counted rejected (153 real / 4)
  "totalEarnings": 1.003,       // Real earnings
  "totalEarningsFormatted": "$1.00"
}
```

### Admin Dashboard
```json
{
  "totalViews": 12500,          // Platform counted views
  "validViews": 10625,          // Platform valid counted
  "rejectedViews": 1875,        // Platform rejected counted
  "totalEarnings": 42500.00,    // Platform earnings
  "topCreators": [
    {
      "validViews": 625,        // Creator's counted views
      "earnings": 2500.00,      // Creator's earnings
      "earningsFormatted": "$2500.00"
    }
  ]
}
```

---

## 🧪 Testing Examples

### Test Case 1: Single View
```bash
# 1 real view recorded
POST /api/playback/finalize

# Expected Response:
{
  "analytics": {
    "totalViews": 0.25,          # Counted
    "totalEarnings": 0.001,
    "totalEarningsFormatted": "$0.001"
  }
}
```

### Test Case 2: Four Views
```bash
# After 4 real views

# Expected Response:
{
  "analytics": {
    "totalViews": 1.00,          # Counted
    "totalEarnings": 0.004,
    "totalEarningsFormatted": "$0.004"
  }
}
```

### Test Case 3: Thousand Views
```bash
# After 4000 real views

# Expected Response:
{
  "analytics": {
    "totalViews": 1000.00,       # Counted
    "totalEarnings": 4.000,
    "totalEarningsFormatted": "$4.00"
  }
}
```

---

## 📝 API Documentation

### Analytics Overview
```http
GET /api/analytics/overview

Response:
{
  "totalViews": 250.75,          # Counted views (real / 4)
  "validViews": 212.50,          # Valid counted views
  "totalEarnings": 1.003,        # Real earnings ($0.001/view)
  "totalEarningsFormatted": "$1.00"
}
```

### Wallet Balance
```http
GET /api/wallet

Response:
{
  "totalEarnings": 1.256,        # 1256 real views × $0.001
  "totalEarningsFormatted": "$1.26",
  "availableBalance": 1.200,
  "availableBalanceFormatted": "$1.20"
}
```

---

## 🔒 Security & Fraud

### View Validation (Unchanged)
A view is valid only if:
1. ✅ Manual play initiated (no autoplay)
2. ✅ Watch time ≥ 5 seconds
3. ✅ Video type = DIRECT_UPLOAD
4. ✅ Fraud score < 50
5. ✅ IP abuse limits not exceeded

### Fraud Detection (Unchanged)
- IP-based rate limiting
- Bot pattern detection
- Manual play requirement
- Watch time validation
- Fraud scoring system

**Note:** Fraud checks happen on **real views**, not counted views.

---

## 💵 Withdrawal System

### Minimum Withdrawal
- **Minimum:** $100 (unchanged)
- **Example:** Need 100,000 real views (25,000 counted) to withdraw

### Withdrawal Flow
```
Creator has $100 in available balance
→ Requests withdrawal
→ Admin approves
→ Payment processed
→ Balance deducted
```

**Note:** Withdrawals work on actual dollar amounts, not view counts.

---

## 📊 Reporting

### What Admins See
- ✅ Counted views (real / 4)
- ✅ Earnings with 3 decimals
- ✅ Progressive earnings ($0.001, $0.002...)
- ❌ Real views (hidden)

### What Creators See
- ✅ Counted views (real / 4)
- ✅ Earnings breakdown
- ✅ Wallet balance
- ✅ Transaction history
- ❌ Real views (hidden)

### What Platform Sees (Internal Logs)
- ✅ Real views (in database)
- ✅ Counted views (calculated)
- ✅ Earnings
- ✅ Fraud flags
- ✅ All metrics

---

## 🚀 Migration

### Existing Data
- Old views recorded at $0.13/view remain unchanged
- New views use $0.001/view system
- Analytics automatically convert to counted views
- No database migration needed

### Settings Update
```env
# Old
DEFAULT_EARNINGS_PER_VIEW=0.13

# New
DEFAULT_EARNINGS_PER_VIEW=0.001
```

---

## 🎯 Summary

### Formula
```
4 Real Views = 1 Counted View
$4 per 1000 Counted Views
$0.001 per Real View
```

### Display
```
Amount < $1:  $0.001, $0.002, $0.003 (3 decimals)
Amount ≥ $1:  $1.00, $2.50, $10.00  (2 decimals)
```

### Benefits
- ✅ Real-time earnings display
- ✅ Transparent from first view
- ✅ Progressive confidence building
- ✅ Sustainable cost structure
- ✅ Clear admin dashboard

---

**That's the complete view counting system! 🎉**

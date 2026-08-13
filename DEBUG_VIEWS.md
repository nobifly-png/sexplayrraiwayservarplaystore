# Debug Views Mismatch

## Current Dashboard Display:
- Total Views: 5.5
- Total Earnings: $0.390

## Expected Display:
- Total Views: 97.5 (390 ÷ 4)
- Total Earnings: $0.390

## Backend Logic Check:

### Wallet Service:
- Credits $0.001 per VALID session
- $0.390 = 390 valid sessions ✅

### Analytics Service:
```javascript
// Counts ViewLedger entries (real sessions)
const totalRealViews = await PlaybackSession.countDocuments();

// Converts to counted views
return calculateCountedViews(totalRealViews); // ÷ 4
```

### Expected Result:
```
390 real sessions
↓ calculateCountedViews()
97.5 counted views
```

## Problem:
Dashboard shows 5.5 instead of 97.5!

## Possible Causes:

1. **Database has only 22 real sessions:**
   - 22 ÷ 4 = 5.5 counted views ✅
   - But then earnings should be $0.022 (not $0.390!)

2. **Frontend dividing again:**
   - Backend sends 97.5
   - Frontend divides by ~18: 97.5 ÷ 18 ≈ 5.4
   - Unlikely!

3. **Earnings calculation wrong:**
   - Maybe old test data with wrong rate?
   - Some sessions credited at higher rate?

## Debug Commands:

Run in MongoDB:
```javascript
// Count real sessions
db.playbacksessions.countDocuments({
  creatorId: ObjectId("USER_ID")
})

// Count valid views in ledger
db.viewledgers.countDocuments({
  creatorId: ObjectId("USER_ID"),
  viewType: "VALID"
})

// Sum actual earnings
db.viewledgers.aggregate([
  { $match: { creatorId: ObjectId("USER_ID"), viewType: "VALID" } },
  { $group: { _id: null, total: { $sum: "$earningsAmount" } } }
])

// Check wallet
db.wallets.findOne({ creatorId: ObjectId("USER_ID") })
```

## Most Likely Issue:

**Mixed Data:** Some old sessions with different earning rate ($0.001 vs $0.004)

If 390 sessions exist but only 22 are recent:
- Old: 368 sessions × $0.001 = $0.368
- New: 22 sessions × $0.001 = $0.022
- Total: $0.390 ✅
- Display: 22 ÷ 4 = 5.5 views ✅

## Solution:

Either fix the query to count ALL sessions, or clarify which sessions to count!

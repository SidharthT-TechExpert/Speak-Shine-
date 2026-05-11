# Performance Optimization Plan

## 🐌 Current Performance Issues

### Admin Dashboard
**Problem:** Loads 6 API calls on initial page load:
1. `/dashboard` - Overview data
2. `/users` - All users list
3. `/questions?limit=200` - 200 questions
4. `/dashboard/report/weekly` - Weekly report
5. `/dashboard/report/monthly` - Monthly report
6. `/dashboard/settings` - Settings

**Impact:**
- ~2-5 seconds initial load time
- Loads data for tabs user might never visit
- 200 questions loaded even if user doesn't go to Questions tab

### Trainer Dashboard
**Problem:** Similar issues
- Loads dashboard + users on every page load
- Loads all user scores when switching to Compare/Improvement tabs

### User Dashboard
**Problem:**
- Loads profile data
- Renders large charts even if not visible

## ✅ Optimization Strategy

### 1. **Lazy Load Tab Data**
Only load data when user switches to that tab

### 2. **Reduce Initial Payload**
Only load essential data on first render

### 3. **Add Loading States**
Show skeleton loaders for better perceived performance

### 4. **Implement Data Persistence**
Cache loaded data in component state (don't reload on tab switch)

### 5. **Optimize API Responses**
Return only necessary fields

## 🚀 Implementation Plan

### Phase 1: Lazy Loading (Immediate - 50-70% improvement)
- Load only overview data initially
- Load tab-specific data when tab is clicked
- Cache loaded data to avoid re-fetching

### Phase 2: API Optimization (30-40% improvement)
- Add pagination to users list
- Reduce question limit from 200 to 50
- Add field selection to API responses

### Phase 3: Frontend Optimization (10-20% improvement)
- Code splitting for heavy components (charts)
- Virtualize long lists
- Debounce search inputs

### Phase 4: Caching (Already Done! ✅)
- 18h cache on backend
- Reduces DB queries by 80-90%

## 📊 Expected Results

### Before Optimization:
- Initial load: 2-5 seconds
- 6 API calls on page load
- ~500KB-1MB data transfer

### After Optimization:
- Initial load: 0.5-1 second (80% faster)
- 1-2 API calls on page load
- ~50-100KB initial data transfer
- Subsequent tab switches: <200ms

## 🎯 Priority Order

1. **HIGH:** Lazy load tab data (biggest impact)
2. **HIGH:** Reduce initial API calls
3. **MEDIUM:** Add loading skeletons
4. **MEDIUM:** Optimize API responses
5. **LOW:** Code splitting
6. **LOW:** Virtualization

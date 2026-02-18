# 🔧 Troubleshooting Guide

Complete guide to fixing common issues with your Trading Workstation deployment.

## 📋 Quick Diagnostic Checklist

Run through this checklist first:

- [ ] Application is deployed and shows "running" status
- [ ] Database (PostgreSQL) is running
- [ ] Redis cache is running (if configured)
- [ ] All environment variables are set
- [ ] URL opens in browser
- [ ] No errors in logs

## 🚨 Common Issues and Solutions

### Issue 1: "Application Error" or 500 Internal Server Error

**Symptoms:**
- Blank page with "Application Error"
- HTTP 500 errors
- Can't access dashboard

**Causes:**
1. Database not connected
2. Missing environment variables
3. Code error during startup

**Solutions:**

**Step 1: Check Logs**
```
# Railway: Click "Logs" in dashboard
# Render: Click "Logs" tab
# Docker: docker-compose logs app
```

**Step 2: Verify Database Connection**
```bash
# Check DATABASE_URL is set correctly
# Format: postgresql://user:password@host:5432/dbname
```

**Step 3: Check Required Environment Variables**
Ensure these are set:
- `DATABASE_URL` ✓
- `ENVIRONMENT=production` ✓
- `LOG_LEVEL=INFO` ✓

**Step 4: Check Database is Running**
- Railway: PostgreSQL should show "Active"
- Render: Database status should be "Available"
- Docker: `docker-compose ps` should show postgres as "Up"

**Step 5: Restart Application**
- Railway: Click "Restart" button
- Render: Go to Settings → Manual Deploy → "Clear build cache & deploy"
- Docker: `docker-compose restart app`

---

### Issue 2: "This site can't be reached" or Connection Refused

**Symptoms:**
- Browser can't connect to URL
- "Connection refused" error
- Page doesn't load at all

**Causes:**
1. Application not running
2. Wrong URL
3. Port not exposed

**Solutions:**

**Step 1: Check Deployment Status**
- Look for "Running" or "Active" status in platform dashboard
- If "Deploying", wait for it to finish (5-10 minutes)
- If "Failed", check logs for errors

**Step 2: Verify URL**
Railway:
```
https://your-app-name.up.railway.app
```

Render:
```
https://your-service-name.onrender.com
```

**Step 3: Check Port Configuration**
Application should listen on port defined by `PORT` environment variable:
```bash
PORT=8000  # Usually set automatically by platform
```

**Step 4: Check Health Endpoint**
Try accessing:
```
https://your-url.com/health
```

Should return:
```json
{
  "status": "healthy",
  "version": "2.0.0"
}
```

---

### Issue 3: Slow Performance or Timeouts

**Symptoms:**
- Dashboard takes >5 seconds to load
- Requests timeout
- Spinning loading indicators

**Causes:**
1. Insufficient resources
2. Database not optimized
3. Redis cache not working
4. Too many concurrent users

**Solutions:**

**Step 1: Check Current Resources**
Look at metrics dashboard:
- CPU usage should be <70%
- Memory usage should be <80%
- If consistently high, upgrade plan

**Step 2: Verify Redis is Connected**
Check logs for:
```
INFO: Redis cache initialized successfully
```

If you see:
```
WARNING: Redis connection failed, using in-memory cache
```

Then Redis is not connected. Check `REDIS_URL` environment variable.

**Step 3: Check Database Connections**
Look for these errors in logs:
```
too many connections
connection pool exhausted
```

Solution: Upgrade database plan or reduce connection pool size.

**Step 4: Review Response Times**
Platform dashboards show request durations:
- <500ms: Good ✓
- 500ms-2s: Acceptable for complex queries
- >2s: Problem - investigate slow queries

**Step 5: Clear Cache**
Sometimes old cached data causes issues:

```python
# Add admin endpoint to clear cache
# Access: POST /api/admin/cache/clear
```

---

### Issue 4: Database Connection Errors

**Symptoms:**
- "Connection refused" in logs
- "database does not exist"
- "password authentication failed"

**Causes:**
1. Wrong DATABASE_URL
2. Database not created
3. Network connectivity issue

**Solutions:**

**Step 1: Verify DATABASE_URL Format**
```bash
# Correct format:
postgresql://username:password@host:5432/database_name

# Common mistakes:
# ❌ Missing postgresql:// prefix
# ❌ Wrong port (should be 5432)
# ❌ Spaces in the URL
# ❌ Special characters not URL-encoded
```

**Step 2: Test Database Connection**
Railway/Render provide database connection strings. Copy the "Internal" URL, not "External".

**Step 3: Check Database Exists**
Platform should show:
- Database name
- Status: "Available" or "Active"
- Size: >0 MB

**Step 4: Manual Connection Test**
Try connecting with psql:
```bash
psql "postgresql://user:password@host:5432/dbname"
```

---

### Issue 5: CORS Errors (Browser Console)

**Symptoms:**
- Red errors in browser console
- "CORS policy" error message
- Frontend can't reach API

**Causes:**
1. Wrong ALLOWED_ORIGINS
2. Missing CORS headers
3. HTTP instead of HTTPS

**Solutions:**

**Step 1: Check ALLOWED_ORIGINS**
Should include your full URL:
```bash
ALLOWED_ORIGINS=https://your-app-name.up.railway.app
```

**Step 2: Check Protocol**
Make sure both are HTTPS or both HTTP:
- ✓ https://app.com → https://app.com/api
- ❌ http://app.com → https://app.com/api

**Step 3: Check in Browser Console**
Open browser developer tools (F12):
1. Go to "Console" tab
2. Look for CORS errors in red
3. Note the origin that's being blocked

**Step 4: Add Missing Origin**
```bash
# Multiple origins separated by commas
ALLOWED_ORIGINS=https://app.com,https://www.app.com
```

---

### Issue 6: Users Can't See Data

**Symptoms:**
- Dashboard loads but shows empty
- "No data" messages
- 404 errors for API calls

**Causes:**
1. Database not initialized
2. No data created yet
3. Wrong API endpoint

**Solutions:**

**Step 1: Initialize Database**
```bash
# SSH into your deployment or run locally
cd backend
python init_db.py
```

Answer "y" when asked to create demo data.

**Step 2: Check API Endpoints**
Open browser console (F12) and look at Network tab:
- API calls should return 200 status
- Response should have data, not empty arrays

**Step 3: Verify Data Exists**
Check database directly:
```sql
-- Connect to database
SELECT COUNT(*) FROM positions;  -- Should return >0
SELECT COUNT(*) FROM accounts;   -- Should return >0
```

**Step 4: Check API Prefix**
Frontend should call:
```
/api/portfolio  ✓
/portfolio      ❌ (missing /api prefix)
```

---

### Issue 7: Build Failures

**Symptoms:**
- Deployment fails during build
- "Build failed" message
- No running application

**Causes:**
1. Missing dependencies
2. Dockerfile errors
3. Build timeout

**Solutions:**

**Step 1: Check Build Logs**
Look for:
- `npm install` errors (frontend)
- `pip install` errors (backend)
- Docker build errors

**Step 2: Common Build Errors**

**Python dependency errors:**
```bash
# Check requirements.txt has all dependencies
# No missing versions or typos
```

**Node.js errors:**
```bash
# Check package.json is valid JSON
# All dependencies are available
```

**Docker errors:**
```bash
# Verify Dockerfile syntax
# Check COPY paths are correct
```

**Step 3: Build Locally First**
```bash
docker build -t trading-workstation .
docker run -p 8000:8000 trading-workstation
```

If local build works, deployment should work.

**Step 4: Clear Build Cache**
- Railway: Automatic on restart
- Render: Settings → "Clear build cache & deploy"

---

### Issue 8: Memory/Resource Issues

**Symptoms:**
- "Out of memory" errors
- Application crashes randomly
- Slow performance under load

**Causes:**
1. Plan too small for usage
2. Memory leaks
3. Too many concurrent operations

**Solutions:**

**Step 1: Check Current Usage**
Platform dashboard shows:
- Memory: Should be <80% of limit
- CPU: Should be <70% average

**Step 2: Upgrade Plan If Needed**

**Current usage:**
- >80% memory → Upgrade
- >70% CPU sustained → Upgrade
- Frequent crashes → Upgrade

**Recommended plans for 30 users:**
- Starter: 512MB RAM (OK for light use)
- Pro: 1GB RAM (recommended)
- Business: 2GB+ RAM (heavy use)

**Step 3: Optimize Application**
```bash
# Reduce cache TTL to free memory
CACHE_TTL=180  # 3 minutes instead of 5

# Reduce worker intervals
PRICE_UPDATE_INTERVAL=120  # 2 minutes instead of 1
```

---

### Issue 9: SSL/HTTPS Issues

**Symptoms:**
- "Not Secure" warning in browser
- Mixed content errors
- Certificate errors

**Causes:**
1. Platform not providing SSL
2. HTTP links in HTTPS page
3. Certificate not configured

**Solutions:**

**Step 1: Platform SSL**
All recommended platforms provide automatic SSL:
- Railway: Automatic HTTPS
- Render: Automatic HTTPS
- Need to enable: Check platform settings

**Step 2: Force HTTPS**
```bash
# In environment variables
FORCE_HTTPS=true
```

**Step 3: Update Frontend API Calls**
Check frontend makes HTTPS calls:
```javascript
// ✓ Correct
const API_URL = 'https://api.myapp.com'

// ❌ Wrong
const API_URL = 'http://api.myapp.com'
```

---

## 🔍 Debugging Tips

### View Live Logs

**Railway:**
```
Dashboard → Deployments → View Logs
```

**Render:**
```
Dashboard → Logs tab → View Live
```

**Docker:**
```bash
docker-compose logs -f app
```

### Check Health Endpoints

```bash
# Application health
curl https://your-app.com/health

# Should return:
{
  "status": "healthy",
  "version": "2.0.0",
  "cache": {...}
}
```

### Test Database Connection

```bash
# Inside application container
python -c "from app.db import connect; conn = connect(); print('Connected!')"
```

### Check Environment Variables

**Railway/Render:**
- Go to Settings → Environment Variables
- Verify all required variables are set

**Docker:**
```bash
docker-compose exec app env
```

---

## 🆘 When Nothing Works

If you've tried everything:

1. **Start Fresh**
   - Delete deployment
   - Create new one from scratch
   - Copy environment variables carefully

2. **Check Platform Status**
   - Railway: status.railway.app
   - Render: status.render.com
   - Service might be experiencing issues

3. **Simplify**
   - Start with minimal configuration
   - Add features one by one
   - Test after each addition

4. **Get Help**
   - Railway: Discord community
   - Render: Community forum
   - Check documentation

---

## 📊 Performance Monitoring Checklist

Weekly checks:

- [ ] Response times <1 second
- [ ] Error rate <1%
- [ ] Memory usage <80%
- [ ] CPU usage <70%
- [ ] Database size growing normally
- [ ] Logs show no errors
- [ ] All users can access

Monthly checks:

- [ ] Review and optimize slow queries
- [ ] Check for memory leaks
- [ ] Update dependencies
- [ ] Review and adjust resources
- [ ] Test disaster recovery

---

## 🎯 Prevention Tips

1. **Monitor Proactively**
   - Set up uptime monitoring
   - Configure error alerts
   - Review logs weekly

2. **Test Before Deploying**
   - Test locally with docker-compose
   - Verify all features work
   - Check performance

3. **Document Changes**
   - Keep track of environment variables
   - Note any configuration changes
   - Document troubleshooting steps

4. **Keep Backups**
   - Database backups enabled
   - Export important data regularly
   - Test restore process

5. **Stay Updated**
   - Update dependencies monthly
   - Follow platform announcements
   - Apply security patches

---

Need more help? Check the platform-specific documentation or community forums!

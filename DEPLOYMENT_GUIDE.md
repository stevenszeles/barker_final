# 🚀 Trading Workstation - Complete Deployment Guide

This guide will help you deploy your Trading Workstation so 30+ people can use it at the same time. No coding experience needed!

## 📋 What You're Deploying

A professional trading dashboard that:
- Shows real-time portfolio data
- Tracks trades and positions
- Displays market information
- Works for multiple users simultaneously
- All users see the same shared dashboard

## 🎯 Quick Overview

You have 3 deployment options:
1. **Railway** (Recommended - Easiest) ⭐
2. **Render** (Alternative - Also Easy)
3. **DigitalOcean/AWS** (For Advanced Users)

---

## Option 1: Deploy to Railway (RECOMMENDED) ⭐

Railway is the easiest option and costs about $5-20/month depending on usage.

### Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Sign up with GitHub (it's free to start)

### Step 2: Prepare Your Project

1. Create a new folder on your computer called `trading-workstation`
2. Copy all the files from the production-dashboard folder into it
3. You should have:
   - `backend/` folder
   - `frontend/` folder
   - `Dockerfile`
   - `requirements.txt`
   - `.env.template`

### Step 3: Upload to GitHub

If you don't have GitHub:
1. Go to [github.com](https://github.com) and create a free account
2. Click "New Repository" 
3. Name it: `trading-workstation`
4. Make it **Private** (important for security)
5. Click "Create Repository"

Upload your files:
1. Click "uploading an existing file"
2. Drag all your project files
3. Click "Commit changes"

### Step 4: Deploy on Railway

1. Go back to Railway
2. Click "Deploy from GitHub Repo"
3. Select your `trading-workstation` repository
4. Railway will automatically detect it's a Docker project

### Step 5: Add Database

In Railway:
1. Click "New" → "Database" → "Add PostgreSQL"
2. Railway automatically creates a database
3. The DATABASE_URL is automatically set

### Step 6: Add Redis Cache

In Railway:
1. Click "New" → "Database" → "Add Redis"
2. Railway automatically creates Redis
3. The REDIS_URL is automatically set

### Step 7: Configure Environment Variables

In Railway, click on your app → "Variables" tab:

```
ENVIRONMENT=production
LOG_LEVEL=INFO
WS_LIVE_QUOTES=1
ALLOWED_ORIGINS=https://your-app-name.up.railway.app
```

Replace `your-app-name` with your actual Railway app URL (you'll see this after deployment).

### Step 8: Add API Keys (Optional)

If you have Schwab or Polygon.io accounts, add these variables:

```
SCHWAB_CLIENT_ID=your_client_id
SCHWAB_CLIENT_SECRET=your_client_secret
SCHWAB_REDIRECT_URI=https://your-app-name.up.railway.app/api/auth/schwab/callback
POLYGON_API_KEY=your_polygon_key
```

### Step 9: Deploy!

1. Railway automatically deploys when you push to GitHub
2. Wait 3-5 minutes for first deployment
3. You'll get a URL like: `https://your-app-name.up.railway.app`
4. Share this URL with your 30 users!

### Step 10: Monitor and Manage

Railway Dashboard shows:
- **Deployment status**: Green = running
- **Metrics**: CPU, memory, requests
- **Logs**: Click "Logs" to see what's happening
- **Cost**: Check your usage under "Usage"

**Cost Estimate:**
- Starter plan: $5/month (includes $5 credit)
- With PostgreSQL + Redis: $10-20/month for 30 users

---

## Option 2: Deploy to Render

Render is another easy option with a generous free tier to start.

### Step 1: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. It's free to start!

### Step 2: Create PostgreSQL Database

1. In Render dashboard, click "New +"
2. Select "PostgreSQL"
3. Name: `workstation-db`
4. Choose "Free" tier to start (can upgrade later)
5. Click "Create Database"
6. **Copy the "Internal Database URL"** - you'll need this!

### Step 3: Create Redis Cache

1. Click "New +"
2. Select "Redis"
3. Name: `workstation-cache`
4. Choose free tier
5. Click "Create Redis"
6. **Copy the "Internal Redis URL"**

### Step 4: Deploy Web Service

1. Click "New +"
2. Select "Web Service"
3. Connect your GitHub repository (same as Railway steps above)
4. Configure:
   - **Name**: `trading-workstation`
   - **Runtime**: Docker
   - **Plan**: Starter ($7/month) or Standard ($25/month) for 30 users
   - **Build Command**: (leave empty - Docker handles it)
   - **Start Command**: (leave empty - Docker handles it)

### Step 5: Add Environment Variables

In the Environment section, add:

```
ENVIRONMENT=production
DATABASE_URL=[paste your Internal Database URL here]
REDIS_URL=[paste your Internal Redis URL here]
LOG_LEVEL=INFO
WS_LIVE_QUOTES=1
ALLOWED_ORIGINS=https://trading-workstation.onrender.com
```

Add optional API keys if you have them.

### Step 6: Deploy

1. Click "Create Web Service"
2. Wait 5-10 minutes for first deployment
3. Your URL will be: `https://trading-workstation.onrender.com`
4. Share with your users!

**Cost Estimate:**
- Free tier: PostgreSQL + Redis free, but Web Service sleeps after inactivity
- Starter plan: $7/month (always on)
- Standard plan: $25/month (recommended for 30 users)

---

## Option 3: DigitalOcean/AWS (Advanced)

For advanced users comfortable with servers. Costs $10-50/month depending on resources.

### DigitalOcean App Platform (Easiest Cloud Option)

1. Create account at [digitalocean.com](https://digitalocean.com)
2. Click "Create" → "Apps"
3. Connect GitHub repository
4. Add PostgreSQL database ($7/month)
5. Add Redis ($15/month)
6. Deploy app ($5-12/month)
7. Total: ~$27-34/month

### AWS Lightsail (Most Scalable)

1. Create account at [aws.amazon.com](https://aws.amazon.com)
2. Go to Lightsail
3. Create container service ($10-40/month depending on size)
4. Create RDS PostgreSQL ($15-50/month)
5. Create ElastiCache Redis ($15-50/month)
6. Configure environment variables
7. Total: ~$40-140/month (but handles any number of users)

---

## 🔧 After Deployment: Testing & Setup

### 1. Test Your Deployment

Open your URL in a browser. You should see the dashboard.

**If you see an error:**
- Check the logs (Railway/Render dashboard)
- Verify all environment variables are set
- Make sure DATABASE_URL and REDIS_URL are correct

### 2. Initialize Sample Data (Optional)

To add demo data for testing:
1. Go to your app URL
2. Navigate to `/api/docs` (only in development mode)
3. Or use the admin API endpoints to add data

### 3. Share with Your Users

Give your users:
- The URL: `https://your-app-name.up.railway.app`
- Any login credentials (if you add authentication)
- Instructions on how to use the dashboard

### 4. Monitor Performance

Check your platform's dashboard regularly:
- **Response times**: Should be under 1 second
- **Error rates**: Should be near 0%
- **Database size**: Watch it doesn't grow too large
- **Cache hit rate**: Higher is better (60%+)

---

## 💰 Cost Breakdown for 30 Users

### Railway (Recommended)
- Web Service: $5-10/month
- PostgreSQL: $5/month
- Redis: $5/month
- **Total: $15-20/month**

### Render
- Web Service: $7-25/month
- PostgreSQL: Free-$7/month
- Redis: Free-$10/month
- **Total: $7-42/month**

### DigitalOcean
- App: $12/month
- PostgreSQL: $15/month
- Redis: $15/month
- **Total: ~$42/month**

---

## 🔒 Security Best Practices

1. **Never share your .env file** - It contains secrets!
2. **Use HTTPS only** - All platforms provide this automatically
3. **Strong passwords** - For database and any admin accounts
4. **Keep repository private** - Don't make it public on GitHub
5. **Regular updates** - Redeploy when you update code

---

## 🐛 Troubleshooting Common Issues

### Issue: "Application Error" or 500 Error

**Fix:**
1. Check logs in your platform dashboard
2. Verify DATABASE_URL is correct
3. Ensure all required environment variables are set
4. Check that the database is running

### Issue: "This site can't be reached"

**Fix:**
1. Verify deployment is complete (not still building)
2. Check platform status page
3. Ensure PORT is set correctly (usually 8000)

### Issue: Dashboard is slow

**Fix:**
1. Upgrade to a larger plan
2. Check if database needs optimization
3. Verify Redis cache is connected
4. Review logs for slow queries

### Issue: Users can't access

**Fix:**
1. Check ALLOWED_ORIGINS includes your domain
2. Verify CORS settings in environment variables
3. Make sure deployment is "running" (not sleeping)

---

## 📊 Monitoring Your Dashboard

### What to Watch

1. **Uptime**: Should be 99.9%+
2. **Response Time**: Under 1 second for most requests
3. **Memory Usage**: Should stay under 80% of allocated
4. **Database Size**: Monitor growth over time

### How to Check

- **Railway**: Dashboard → Metrics tab
- **Render**: Dashboard → Metrics section
- **DigitalOcean**: App Platform → Insights

### When to Upgrade

Upgrade your plan if you see:
- Frequent "out of memory" errors
- Response times over 2-3 seconds consistently
- High CPU usage (>80%) for extended periods
- Database approaching storage limits

---

## 🚀 Scaling for Growth

### From 30 to 100 users:
- Upgrade web service to next tier
- Increase database connections
- Add more Redis memory
- Cost: +$20-50/month

### From 100 to 500 users:
- Move to dedicated hosting (AWS/GCP)
- Use managed database services
- Implement load balancing
- Cost: $100-200/month

---

## 📝 Maintenance Checklist

### Daily
- [ ] Check application is accessible
- [ ] Review error logs for any issues

### Weekly
- [ ] Check database size
- [ ] Review performance metrics
- [ ] Verify backups are running (automatic on most platforms)

### Monthly
- [ ] Review costs and usage
- [ ] Check for updates to dependencies
- [ ] Test disaster recovery process

---

## 🆘 Getting Help

### Platform-Specific Support
- Railway: [Discord](https://discord.gg/railway) or [Docs](https://docs.railway.app)
- Render: [Support](https://render.com/support) or [Community](https://community.render.com)
- DigitalOcean: [Docs](https://docs.digitalocean.com) or [Support](https://www.digitalocean.com/support)

### Application Issues
1. Check logs first (they usually tell you what's wrong)
2. Review environment variables
3. Verify database connection
4. Test with sample data

---

## ✅ Deployment Checklist

Before going live:
- [ ] Application builds successfully
- [ ] Database is connected and initialized
- [ ] Redis cache is working
- [ ] Environment variables are all set
- [ ] URL is accessible from browser
- [ ] Dashboard loads without errors
- [ ] Can see sample data or connect to broker
- [ ] Multiple users can access simultaneously
- [ ] HTTPS is working
- [ ] Monitoring is set up

Congratulations! Your trading workstation is now live and ready for 30+ users! 🎉

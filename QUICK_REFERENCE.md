# 📋 Quick Reference Card

## 🚀 Deployment URLs

### Railway
```
Dashboard: https://railway.app/dashboard
App URL: https://[your-app].up.railway.app
Docs: https://docs.railway.app
Support: https://discord.gg/railway
```

### Render
```
Dashboard: https://dashboard.render.com
App URL: https://[your-service].onrender.com
Docs: https://render.com/docs
Support: https://community.render.com
```

## 🔑 Essential Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
ENVIRONMENT=production
LOG_LEVEL=INFO

# Recommended
REDIS_URL=redis://host:6379
ALLOWED_ORIGINS=https://yourdomain.com
WS_LIVE_QUOTES=1

# Optional - Market Data
SCHWAB_CLIENT_ID=...
SCHWAB_CLIENT_SECRET=...
POLYGON_API_KEY=...
```

## 🔧 Common Commands

### Docker
```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Restart
docker-compose restart

# Stop
docker-compose down

# Rebuild
docker-compose up --build
```

### Backend
```bash
# Activate venv
source backend/.venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn app.main:app --reload

# Initialize database
python backend/init_db.py
```

### Frontend
```bash
# Install
npm install

# Development
npm run dev

# Build
npm run build

# Preview
npm run preview
```

## 🏥 Health Checks

```bash
# Application health
curl https://your-app.com/health

# Database test
psql $DATABASE_URL -c "SELECT 1"

# Redis test
redis-cli -u $REDIS_URL ping
```

## 📊 Important Endpoints

```
GET  /health                    # Health check
GET  /api/portfolio             # Portfolio summary
GET  /api/positions             # Current positions
GET  /api/trades                # Trade history
GET  /api/market/quotes         # Market quotes
GET  /api/status                # System status
POST /api/admin/cache/clear     # Clear cache
```

## 🐛 Quick Troubleshooting

### Issue: 500 Error
```bash
1. Check logs
2. Verify DATABASE_URL
3. Restart application
```

### Issue: Can't Connect
```bash
1. Check deployment status
2. Verify URL is correct
3. Check ALLOWED_ORIGINS
```

### Issue: Slow Performance
```bash
1. Check resource usage
2. Verify Redis connected
3. Upgrade plan if needed
```

### Issue: No Data Showing
```bash
1. Initialize database
2. Check API calls in browser console
3. Verify data exists in database
```

## 💰 Cost Estimates (Monthly)

### Railway
```
Starter:  $15-20  (30-50 users)
Pro:      $30-40  (50-100 users)
```

### Render
```
Free:     $0      (Dev/Testing, sleeps)
Starter:  $7      (Always on, 512MB)
Standard: $25     (30+ users, 2GB)
```

### DigitalOcean
```
App:      $12     (Basic plan)
Database: $15     (1GB)
Redis:    $15     (1GB)
Total:    ~$42
```

## 📈 Performance Targets

```
Response Time:     <500ms
Concurrent Users:  30+
Uptime:           99.9%
Error Rate:       <1%
Cache Hit Rate:   >60%
```

## 🔐 Security Checklist

- [ ] HTTPS enabled
- [ ] .env not in git
- [ ] Strong database password
- [ ] CORS configured
- [ ] Repository private
- [ ] Regular backups enabled
- [ ] Monitoring alerts set up

## 📞 Support Links

### Platform Status Pages
```
Railway:  https://status.railway.app
Render:   https://status.render.com
```

### Documentation
```
Railway:  https://docs.railway.app
Render:   https://render.com/docs
FastAPI:  https://fastapi.tiangolo.com
React:    https://react.dev
```

### Community Help
```
Railway:  https://discord.gg/railway
Render:   https://community.render.com
Stack:    https://stackoverflow.com
```

## 🎯 Deployment Checklist

Pre-deployment:
- [ ] Code pushed to GitHub
- [ ] .env.template filled out
- [ ] Docker builds locally
- [ ] Tests pass

During deployment:
- [ ] Database created
- [ ] Redis created  
- [ ] Environment variables set
- [ ] Deployment successful

Post-deployment:
- [ ] URL accessible
- [ ] Health check passes
- [ ] Data visible
- [ ] Multiple users tested
- [ ] Monitoring configured

## 📝 File Locations

```
production-dashboard/
├── .env                    # Your secrets (DON'T COMMIT!)
├── .env.template          # Template for .env
├── README.md              # Main documentation
├── DEPLOYMENT_GUIDE.md    # Detailed deployment steps
├── TROUBLESHOOTING.md     # Problem solving
├── Dockerfile             # Container configuration
├── docker-compose.yml     # Local development
├── requirements.txt       # Python dependencies
├── backend/
│   ├── app/
│   │   ├── main.py       # Application entry
│   │   ├── config.py     # Configuration
│   │   └── db.py         # Database
│   └── init_db.py        # Database initialization
└── frontend/
    ├── package.json      # Node dependencies
    └── src/              # React source
```

## 🚀 Quick Start Commands

New deployment:
```bash
1. git clone your-repo
2. cp .env.template .env
3. # Edit .env with your values
4. ./start.sh              # Local testing
```

Update deployment:
```bash
git pull
git add .
git commit -m "Update"
git push                   # Auto-deploys on Railway/Render
```

---

**Keep this card handy for quick reference!**

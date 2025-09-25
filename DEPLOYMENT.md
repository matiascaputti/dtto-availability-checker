# Deployment Guide

## VM Setup Instructions

### 1. Prerequisites
```bash
# Install Node.js (recommended: v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Project Setup
```bash
# Clone and navigate to project
git clone <your-repo-url>
cd dtto

# Install dependencies
npm install

# Create environment file
cp env.example .env
# Edit .env with your actual values
nano .env
```

### 3. Running with PM2

#### Start in background (daemon mode)
```bash
npm run start:daemon
```

#### Start in foreground (no-daemon mode) - useful for debugging
```bash
npm start
```

#### Other useful commands
```bash
# View status
npm run status

# View logs
npm run logs

# Stop the application
npm run stop

# Restart the application
npm run restart

# Remove from PM2
npm run delete
```

### 4. Environment Variables
Make sure your `.env` file contains:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
START_TIME=16:30
END_TIME=20:00
INTERVAL_MINUTES=1
```

### 5. PM2 Features
- **Auto-restart**: Application restarts automatically if it crashes
- **Log management**: Logs are saved to `./logs/` directory
- **Memory monitoring**: Restarts if memory usage exceeds 1GB
- **Startup script**: Can be configured to start on system boot

### 6. System Boot Auto-start (Optional)
```bash
# Generate PM2 startup script
pm2 startup

# Save current PM2 process list
pm2 save
```

### 7. Monitoring
```bash
# Real-time monitoring
pm2 monit

# Check logs
pm2 logs dtto-court-monitor

# Check specific log files
tail -f logs/combined.log
```

## Troubleshooting

- **Application not starting**: Check logs with `npm run logs`
- **Telegram not working**: Verify bot token and chat ID in .env
- **Wrong timezone**: Application uses Argentina timezone (GMT-3)
- **Memory issues**: PM2 will restart if memory exceeds 1GB

## Log Files
- `logs/out.log` - Standard output
- `logs/err.log` - Error output  
- `logs/combined.log` - Combined logs with timestamps

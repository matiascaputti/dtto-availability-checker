# Court Availability Checker

A Node.js application that continuously monitors court availability on AlquilaTuCancha and sends Telegram notifications for available slots within your specified time range.

## Features

- 🎾 Continuously monitors court availability for the current day
- 🌅 Automatically transitions to new day when date changes
- ⏰ Filters slots between 16:30 and 20:00 (configurable)
- 📱 Sends Telegram notifications for each available slot
- 🔄 Checks every minute (configurable interval)
- 🚫 Prevents duplicate notifications for same slots
- 🛡️ Robust error handling and logging
- ⚙️ Configurable time ranges and check intervals
- 🛑 Graceful shutdown handling

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Use `/newbot` command to create a new bot
3. Save the bot token provided

### 3. Get Chat ID

To send messages to yourself:
1. Message your bot once
2. Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Look for the `chat.id` in the response

To send messages to a group:
1. Add your bot to the group
2. Send a message in the group
3. Use the same URL to get the group chat ID (it will be negative)

### 4. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp env.example .env
```

Edit `.env` file:
```bash
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Optional (defaults to 16:30-20:00)
START_TIME=16:30
END_TIME=20:00

# Optional (defaults to 1 minute)
INTERVAL_MINUTES=1
```

## Usage

### Start Continuous Monitoring

```bash
npm start
```

### Run with Node

```bash
node index.js
```

### Development with Auto-Restart

```bash
npm run dev
```

### Stop the Application

Press `Ctrl+C` to stop monitoring gracefully. The application will send a stop notification via Telegram.

## Output Format

### Startup Message
```
🚀 Court availability monitoring started!
⏰ Checking every 1 minute(s) between 16:30 and 20:00
```

### Initial Check
```
Turno disponible a las 17:00hs en cancha Cancha 1
Turno disponible a las 18:30hs en cancha Cancha 2
🎾 Resumen: 2 turnos disponibles en 2 canchas entre 16:30 y 20:00
```

### New Slots Found
```
Turno disponible a las 19:00hs en cancha Cancha 3
🆕 1 nuevos turnos disponibles (Total: 3 en 3 canchas)
```

### No Slots Available (initial check only)
```
No hay turnos disponibles entre 16:30 y 20:00 para hoy.
```

### Shutdown Message
```
🛑 Court availability monitoring stopped.
```

## Process Management

Since the application runs continuously, you may want to use a process manager to ensure it stays running:

### PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application with PM2
pm2 start index.js --name "court-checker"

# Save PM2 configuration
pm2 save

# Set up PM2 to start on system boot
pm2 startup

# View logs
pm2 logs court-checker

# Stop the application
pm2 stop court-checker

# Restart the application
pm2 restart court-checker
```

### systemd (Linux)

Create a service file `/etc/systemd/system/court-checker.service`:

```ini
[Unit]
Description=Court Availability Checker
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/path/to/your/project
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable court-checker
sudo systemctl start court-checker
sudo systemctl status court-checker
```

## API Response Handling

The application handles various API response formats:
- `data.courts`
- `data.data.courts`
- Direct array of courts
- `data.availability`

It also handles different slot availability indicators:
- `available: true`
- `status: 'available'`
- `state: 'available'`
- `!occupied`
- `!booked`

## Error Handling

- Network errors are logged and reported via Telegram
- Missing environment variables cause the app to exit with an error
- API response parsing errors are handled gracefully
- Telegram sending errors are logged but don't crash the app

## Dependencies

- `axios`: HTTP client for API requests
- `dotenv`: Environment variable management
- `node-telegram-bot-api`: Telegram bot integration

## Development

The application is structured as a class with separate methods for:
- API data fetching
- Time range filtering
- Telegram messaging
- Error handling

You can easily extend it to:
- Support multiple sport clubs
- Add different notification channels
- Customize message formats
- Add filtering by court type

## Troubleshooting

### Bot Not Sending Messages
- Verify your bot token is correct
- Make sure you've messaged the bot at least once
- Check that the chat ID is correct (positive for direct messages, negative for groups)

### No Available Slots Found
- The API might return a different response format
- Check the console logs for the raw API response
- Verify the time range configuration

### API Errors
- The API might be temporarily unavailable
- Check your internet connection
- Verify the API endpoint is still valid

#!/bin/bash

echo "🚀 Deploying Court Availability Checker to Vercel..."

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Deploy to Vercel
echo "📦 Starting deployment..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Go to your Vercel dashboard"
echo "2. Navigate to Settings > Environment Variables"
echo "3. Add your Telegram bot configuration:"
echo "   - TELEGRAM_BOT_TOKEN (required)"
echo "   - TELEGRAM_CHAT_ID (required)"
echo "   - START_TIME (optional, default: 16:30)"
echo "   - END_TIME (optional, default: 20:00)"
echo ""
echo "🔧 Test your deployment:"
echo "   Visit: https://your-app.vercel.app/api/manual-check"
echo ""
echo "⏰ The cron job will automatically run every minute once environment variables are set!"

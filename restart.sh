#!/bin/bash
echo "🔄 Restarting Crypto Trading Bot..."
./stop.sh
sleep 2
./start-pm2.sh

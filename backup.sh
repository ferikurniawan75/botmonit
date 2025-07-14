#!/bin/bash
echo "💾 Creating backup..."
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup configuration
cp .env "$BACKUP_DIR/" 2>/dev/null
cp package.json "$BACKUP_DIR/" 2>/dev/null

# Backup logs
tar -czf "$BACKUP_DIR/logs.tar.gz" logs/ 2>/dev/null

echo "✅ Backup created in $BACKUP_DIR"

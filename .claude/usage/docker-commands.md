# Docker Commands Reference

## Development
```bash
./setup.sh              # Start entire stack
./run.sh                # Interactive management
cd app && npm run dev   # Development mode
cd app && npm start     # Production mode
```

## Container Management
```bash
docker-compose ps                    # Service status
docker-compose logs -f               # All logs
docker-compose logs -f app           # Specific service
docker-compose restart app           # Restart service
docker-compose down                  # Stop all
docker-compose down -v               # Reset with data
```

## Rebuild
```bash
docker-compose build --no-cache app && docker-compose up -d app
```

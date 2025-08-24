#!/bin/bash

# Download Jambonz database schema
echo "Downloading Jambonz database schema..."

# Create SQL files if they don't exist
if [ ! -f "01-jambones-sql.sql" ]; then
    echo "Downloading schema..."
    curl -s https://raw.githubusercontent.com/jambonz/jambonz-api-server/main/db/jambones-sql.sql > 01-jambones-sql.sql
fi

if [ ! -f "02-seed-data.sql" ]; then
    echo "Downloading seed data..."
    curl -s https://raw.githubusercontent.com/jambonz/jambonz-api-server/main/db/seed-production-database-open-source.sql > 02-seed-data.sql
fi

if [ ! -f "03-create-admin.sql" ]; then
    echo "Downloading admin user creation..."
    curl -s https://raw.githubusercontent.com/jambonz/jambonz-api-server/main/db/create-admin-user.sql > 03-create-admin.sql
fi

echo "Database initialization scripts downloaded successfully!"
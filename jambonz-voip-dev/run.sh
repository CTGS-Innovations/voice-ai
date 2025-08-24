#!/bin/bash

# Jambonz Development Environment Run Script
# Quick commands for managing the Jambonz stack

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    echo -e "${2}${1}${NC}"
}

# Function to show menu
show_menu() {
    echo "================================================"
    echo "🎯 Jambonz Development Environment Manager"
    echo "================================================"
    echo ""
    echo "1) Start all services"
    echo "2) Stop all services"
    echo "3) Restart all services"
    echo "4) View logs (all services)"
    echo "5) View logs (specific service)"
    echo "6) Check service status"
    echo "7) Open web portal"
    echo "8) Configure VoIP.ms"
    echo "9) Start ngrok tunnel"
    echo "10) Initialize/Reset database"
    echo "11) Shell into a container"
    echo "12) Clean up (remove containers and volumes)"
    echo "0) Exit"
    echo ""
    echo -n "Select an option: "
}

# Function to check if services are running
check_status() {
    echo ""
    print_color "📊 Service Status:" "$GREEN"
    echo "------------------------"
    
    services=("mysql" "redis" "drachtio" "rtpengine" "freeswitch" "api-server" "feature-server" "sbc-inbound" "sbc-outbound" "webapp" "app")
    
    for service in "${services[@]}"; do
        container_name="jambonz-$service"
        if [ "$service" == "app" ]; then
            container_name="jambonz-app"
        fi
        
        if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
            print_color "  ✅ $service is running" "$GREEN"
        else
            print_color "  ❌ $service is stopped" "$RED"
        fi
    done
    echo ""
}

# Function to view logs for specific service
view_service_logs() {
    echo ""
    echo "Available services:"
    echo "  mysql, redis, drachtio, rtpengine, freeswitch,"
    echo "  api-server, feature-server, sbc-inbound, sbc-outbound,"
    echo "  webapp, app"
    echo ""
    read -p "Enter service name: " service
    
    if [ -z "$service" ]; then
        print_color "No service specified" "$RED"
        return
    fi
    
    container_name="jambonz-$service"
    if [ "$service" == "app" ]; then
        container_name="jambonz-app"
    fi
    
    print_color "📜 Showing logs for $service (Ctrl+C to exit)..." "$GREEN"
    docker logs -f "$container_name"
}

# Function to shell into container
shell_into_container() {
    echo ""
    echo "Available services:"
    echo "  mysql, redis, drachtio, rtpengine, freeswitch,"
    echo "  api-server, feature-server, sbc-inbound, sbc-outbound,"
    echo "  webapp, app"
    echo ""
    read -p "Enter service name: " service
    
    if [ -z "$service" ]; then
        print_color "No service specified" "$RED"
        return
    fi
    
    container_name="jambonz-$service"
    if [ "$service" == "app" ]; then
        container_name="jambonz-app"
    fi
    
    # Determine shell type based on container
    shell_cmd="/bin/bash"
    if [ "$service" == "redis" ]; then
        shell_cmd="/bin/sh"
    fi
    
    print_color "🐚 Opening shell in $service container..." "$GREEN"
    docker exec -it "$container_name" $shell_cmd
}

# Function to initialize/reset database
init_database() {
    echo ""
    print_color "⚠️  Warning: This will reset the database!" "$YELLOW"
    read -p "Are you sure you want to continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        return
    fi
    
    print_color "🗄️  Initializing database..." "$GREEN"
    
    # Stop services first
    docker compose stop
    
    # Remove MySQL volume
    docker compose rm -f mysql
    docker volume rm jambonz-voip-dev_mysql_data 2>/dev/null || true
    
    # Download fresh database scripts
    cd database
    rm -f *.sql
    ./init-db.sh
    cd ..
    
    # Start MySQL only
    docker compose up -d mysql
    sleep 10
    
    # Start all services
    docker compose up -d
    
    print_color "✅ Database initialized successfully!" "$GREEN"
}

# Main menu loop
while true; do
    show_menu
    read option
    
    case $option in
        1)
            print_color "🚀 Starting all services..." "$GREEN"
            docker compose up -d
            sleep 3
            check_status
            ;;
        2)
            print_color "🛑 Stopping all services..." "$YELLOW"
            docker compose stop
            print_color "✅ All services stopped" "$GREEN"
            ;;
        3)
            print_color "🔄 Restarting all services..." "$YELLOW"
            docker compose restart
            sleep 3
            check_status
            ;;
        4)
            print_color "📜 Showing logs (Ctrl+C to exit)..." "$GREEN"
            docker compose logs -f
            ;;
        5)
            view_service_logs
            ;;
        6)
            check_status
            ;;
        7)
            print_color "🌐 Opening web portal..." "$GREEN"
            if command -v xdg-open &> /dev/null; then
                xdg-open http://localhost:3002
            elif command -v open &> /dev/null; then
                open http://localhost:3002
            else
                print_color "Please open http://localhost:3002 in your browser" "$YELLOW"
            fi
            ;;
        8)
            print_color "🔧 Configuring VoIP.ms..." "$GREEN"
            cd scripts
            node configure-voipms.js
            cd ..
            ;;
        9)
            print_color "🌐 Starting ngrok tunnel..." "$GREEN"
            ./scripts/setup-ngrok.sh
            ;;
        10)
            init_database
            ;;
        11)
            shell_into_container
            ;;
        12)
            print_color "⚠️  Warning: This will remove all containers and volumes!" "$YELLOW"
            read -p "Are you sure? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                docker compose down -v
                print_color "✅ Cleanup complete" "$GREEN"
            fi
            ;;
        0)
            print_color "👋 Goodbye!" "$GREEN"
            exit 0
            ;;
        *)
            print_color "Invalid option. Please try again." "$RED"
            ;;
    esac
    
    if [ "$option" != "0" ]; then
        echo ""
        read -p "Press Enter to continue..."
    fi
done
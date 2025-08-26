#!/bin/bash

# ============================================================================
# Outbound Call Test Runner
# ============================================================================
#
# This script provides a convenient way to test outbound calls with your
# Jambonz webhook application.
#
# Usage:
#   ./test/run-test.sh [options]
#
# Options:
#   --to <number>       Destination phone number
#   --from <number>     Caller ID to display
#   --duration <sec>    Maximum call duration (default: 120)
#   --check             Check configuration only
#   --help              Show help message
#
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
ENV_FILE="$PROJECT_ROOT/.env"

# Function to print colored output
print_color() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Function to check if .env file exists
check_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        print_color $RED "❌ .env file not found!"
        print_color $YELLOW "\nPlease create a .env file:"
        echo "  cp .env.example .env"
        echo "  # Then edit .env with your configuration"
        exit 1
    fi
}

# Function to check required environment variables
check_configuration() {
    print_color $BLUE "🔍 Checking configuration...\n"
    
    local missing_vars=()
    
    # Source the .env file
    export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
    
    # Check required variables
    if [ -z "$JAMBONZ_ACCOUNT_SID" ] || [ "$JAMBONZ_ACCOUNT_SID" = "your-account-sid-here" ]; then
        missing_vars+=("JAMBONZ_ACCOUNT_SID")
    fi
    
    if [ -z "$JAMBONZ_API_KEY" ] || [ "$JAMBONZ_API_KEY" = "your-api-key-here" ]; then
        missing_vars+=("JAMBONZ_API_KEY")
    fi
    
    if [ -z "$WEBHOOK_BASE_URL" ] || [ "$WEBHOOK_BASE_URL" = "https://talk.example.com" ]; then
        missing_vars+=("WEBHOOK_BASE_URL")
    fi
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        print_color $RED "❌ Missing or unconfigured environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        echo ""
        print_color $YELLOW "Please edit your .env file and configure these variables."
        return 1
    fi
    
    print_color $GREEN "✅ Required configuration found:"
    echo "  JAMBONZ_ACCOUNT_SID: ${JAMBONZ_ACCOUNT_SID:0:8}..."
    echo "  JAMBONZ_API_KEY: ${JAMBONZ_API_KEY:0:8}..."
    echo "  WEBHOOK_BASE_URL: $WEBHOOK_BASE_URL"
    
    # Check optional variables
    if [ -n "$TEST_PHONE_NUMBER" ] && [ "$TEST_PHONE_NUMBER" != "+15551234567" ]; then
        echo "  TEST_PHONE_NUMBER: $TEST_PHONE_NUMBER"
    fi
    
    if [ -n "$OUTBOUND_CALLER_ID" ] && [ "$OUTBOUND_CALLER_ID" != "+15559876543" ]; then
        echo "  OUTBOUND_CALLER_ID: $OUTBOUND_CALLER_ID"
    fi
    
    return 0
}

# Function to check if services are running
check_services() {
    print_color $BLUE "\n🐳 Checking Docker services...\n"
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
        print_color $RED "❌ Docker not found!"
        echo "Please install Docker and Docker Compose."
        return 1
    fi
    
    # Check if the voice app container is running
    local app_status=$(docker ps --filter "name=voice-ai-app" --format "{{.Status}}" 2>/dev/null || echo "")
    
    if [ -z "$app_status" ]; then
        print_color $YELLOW "⚠️  Voice app container is not running."
        echo ""
        read -p "Would you like to start it now? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_color $BLUE "Starting services..."
            cd "$PROJECT_ROOT"
            docker-compose up -d
            sleep 5
        else
            return 1
        fi
    else
        print_color $GREEN "✅ Voice app container is running"
        echo "  Status: $app_status"
    fi
    
    # Check webhook endpoint
    print_color $BLUE "\n🌐 Testing webhook endpoint...\n"
    
    local webhook_url="http://localhost:3003/health"
    if curl -f -s "$webhook_url" > /dev/null; then
        print_color $GREEN "✅ Webhook server is responding"
    else
        print_color $RED "❌ Webhook server is not responding at $webhook_url"
        echo "Please check that the application is running correctly."
        return 1
    fi
    
    return 0
}

# Function to show help
show_help() {
    cat << EOF
Outbound Call Test Runner
=========================

This script helps you test outbound calls with your Jambonz integration.

Usage:
  $0 [options]

Options:
  --to <number>       Destination phone number (E.164 format)
  --from <number>     Caller ID to display (E.164 format)
  --duration <sec>    Maximum call duration in seconds (default: 120)
  --check             Check configuration only (don't make call)
  --skip-checks       Skip pre-flight checks
  --help              Show this help message

Examples:
  # Basic test with defaults from .env
  $0

  # Specify destination number
  $0 --to +15551234567

  # Full configuration
  $0 --to +15551234567 --from +15559876543 --duration 60

  # Check configuration only
  $0 --check

Environment Variables:
  The script uses these variables from your .env file:
  - JAMBONZ_ACCOUNT_SID  (required)
  - JAMBONZ_API_KEY      (required)
  - WEBHOOK_BASE_URL     (required)
  - TEST_PHONE_NUMBER    (optional default)
  - OUTBOUND_CALLER_ID   (optional default)

Setup:
  1. Copy .env.example to .env
  2. Configure your Jambonz credentials
  3. Ensure Docker services are running
  4. Run this script

EOF
}

# Parse command line arguments
ARGS=""
CHECK_ONLY=false
SKIP_CHECKS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_help
            exit 0
            ;;
        --check)
            CHECK_ONLY=true
            shift
            ;;
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        *)
            ARGS="$ARGS $1"
            shift
            ;;
    esac
done

# Main execution
print_color $BLUE "🚀 Outbound Call Test Runner"
print_color $BLUE "==========================\n"

# Check environment file
check_env_file

# Check configuration
if ! check_configuration; then
    exit 1
fi

# If check only mode, exit here
if [ "$CHECK_ONLY" = true ]; then
    print_color $GREEN "\n✅ Configuration check complete!"
    exit 0
fi

# Check services unless skipped
if [ "$SKIP_CHECKS" = false ]; then
    if ! check_services; then
        print_color $RED "\n❌ Pre-flight checks failed!"
        echo "Use --skip-checks to bypass service checks."
        exit 1
    fi
fi

# Run the test
print_color $BLUE "\n📞 Starting outbound call test...\n"
print_color $YELLOW "Note: You will be prompted to confirm before the call is made.\n"

cd "$PROJECT_ROOT"
node test/test-outbound-call.js $ARGS

# Check exit code
if [ $? -eq 0 ]; then
    print_color $GREEN "\n✅ Test completed successfully!"
else
    print_color $RED "\n❌ Test failed!"
    exit 1
fi
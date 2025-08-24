#!/bin/bash

# Environment Variable Discovery Script for Jambonz Source Code
# Searches through all Jambonz source repositories for environment variables

SOURCE_DIR="/home/corey/voice-ai/jambonz-source"
OUTPUT_FILE="/home/corey/voice-ai/jambonz-voip-dev/ENVIRONMENT_VARIABLES.md"

echo "🔍 Jambonz Environment Variable Discovery" > "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Function to search for environment variables in a directory
search_env_vars() {
    local dir="$1"
    local service_name="$2"
    
    echo "" >> "$OUTPUT_FILE"
    echo "## 📦 $service_name" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    
    # Find all JavaScript files and search for process.env patterns
    local env_vars=$(find "$dir" -name "*.js" -type f -exec grep -h "process\.env\." {} \; | \
        grep -oE "process\.env\.[A-Z_][A-Z0-9_]*" | \
        sed 's/process\.env\.//' | \
        sort | uniq)
    
    if [ -z "$env_vars" ]; then
        echo "❌ **No environment variables found**" >> "$OUTPUT_FILE"
    else
        echo "### Environment Variables Found:" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        while IFS= read -r var; do
            echo "- \`$var\`" >> "$OUTPUT_FILE"
            
            # Try to find usage context
            local usage=$(find "$dir" -name "*.js" -type f -exec grep -l "process\.env\.$var" {} \; | head -3)
            if [ ! -z "$usage" ]; then
                echo "  - **Files:** $(echo $usage | sed 's|'$dir'/||g')" >> "$OUTPUT_FILE"
                
                # Try to find default values or usage patterns
                local context=$(find "$dir" -name "*.js" -type f -exec grep -H "process\.env\.$var" {} \; | head -2 | sed 's|'$dir'/||g')
                if [ ! -z "$context" ]; then
                    echo "  - **Usage:**" >> "$OUTPUT_FILE"
                    echo '    ```javascript' >> "$OUTPUT_FILE"
                    echo "$context" | sed 's/^/    /' >> "$OUTPUT_FILE"
                    echo '    ```' >> "$OUTPUT_FILE"
                fi
            fi
            echo "" >> "$OUTPUT_FILE"
        done
    fi
    
    # Also search for any config files or documentation that might mention env vars
    local config_files=$(find "$dir" -name "*.json" -o -name "*.md" -o -name "*.yml" -o -name "*.yaml" | head -5)
    if [ ! -z "$config_files" ]; then
        echo "### Configuration Files:" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        while IFS= read -r file; do
            echo "- \`$(echo $file | sed 's|'$dir'/||g')\`" >> "$OUTPUT_FILE"
        done <<< "$config_files"
        echo "" >> "$OUTPUT_FILE"
    fi
}

# Function to search for Docker environment variables
search_docker_env() {
    local dir="$1"
    local service_name="$2"
    
    # Look for Dockerfile ENV statements
    local dockerfile_envs=$(find "$dir" -name "Dockerfile*" -type f -exec grep -h "^ENV\|^ARG" {} \; 2>/dev/null | \
        grep -v "^#" | sort | uniq)
    
    if [ ! -z "$dockerfile_envs" ]; then
        echo "### Docker Environment Variables:" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo '```dockerfile' >> "$OUTPUT_FILE"
        echo "$dockerfile_envs" >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    fi
    
    # Look for docker-compose files
    local compose_files=$(find "$dir" -name "docker-compose*.yml" -o -name "docker-compose*.yaml" 2>/dev/null)
    if [ ! -z "$compose_files" ]; then
        echo "### Docker Compose References:" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        while IFS= read -r file; do
            echo "**File:** \`$(echo $file | sed 's|'$dir'/||g')\`" >> "$OUTPUT_FILE"
            echo '```yaml' >> "$OUTPUT_FILE"
            grep -A 10 -B 2 "environment:" "$file" 2>/dev/null | head -20 >> "$OUTPUT_FILE"
            echo '```' >> "$OUTPUT_FILE"
            echo "" >> "$OUTPUT_FILE"
        done <<< "$compose_files"
    fi
}

# Function to search for account-related environment variables specifically
search_account_vars() {
    local dir="$1"
    local service_name="$2"
    
    echo "### Account-Related Variables:" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    
    # Search for account, header, or auth related environment usage
    local account_patterns=$(find "$dir" -name "*.js" -type f -exec grep -i "account\|header\|auth\|sid" {} \; | \
        grep "process\.env" | head -5)
    
    if [ ! -z "$account_patterns" ]; then
        echo '```javascript' >> "$OUTPUT_FILE"
        echo "$account_patterns" | sed 's/^/    /' >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
    else
        echo "❌ No account-related environment variables found" >> "$OUTPUT_FILE"
    fi
    echo "" >> "$OUTPUT_FILE"
}

echo "🚀 **Starting Environment Variable Discovery**"
echo ""

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Source directory not found: $SOURCE_DIR"
    echo "❌ **Error: Source directory not found: $SOURCE_DIR**" >> "$OUTPUT_FILE"
    exit 1
fi

# Array of Jambonz services to analyze
services=(
    "jambonz-api-server:API Server"
    "jambonz-feature-server:Feature Server" 
    "jambonz-webapp:Web Application"
    "sbc-inbound:SBC Inbound"
    "sbc-outbound:SBC Outbound"
)

echo "## 🎯 **Analysis Summary**" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "This document contains all environment variables discovered in the Jambonz source code repositories." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "**Purpose:** Stop guessing environment variables and understand exactly what configuration options are available." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"

# Process each service
for service in "${services[@]}"; do
    IFS=':' read -r dir_name display_name <<< "$service"
    full_path="$SOURCE_DIR/$dir_name"
    
    if [ -d "$full_path" ]; then
        echo "🔍 Analyzing $display_name..."
        search_env_vars "$full_path" "$display_name"
        search_docker_env "$full_path" "$display_name" 
        search_account_vars "$full_path" "$display_name"
        echo "   ✅ Completed $display_name"
    else
        echo "   ⚠️  Directory not found: $full_path"
        echo "⚠️ **Directory not found: $dir_name**" >> "$OUTPUT_FILE"
    fi
done

# Add summary section
echo "" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "## 📊 **Discovery Complete**" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "**Generated:** $(date)" >> "$OUTPUT_FILE"
echo "**Source Directory:** \`$SOURCE_DIR\`" >> "$OUTPUT_FILE"
echo "**Total Services Analyzed:** ${#services[@]}" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "### 🔍 **Search Patterns Used:**" >> "$OUTPUT_FILE"
echo "- \`process.env.*\` - JavaScript environment variable access" >> "$OUTPUT_FILE"
echo "- \`ENV\` and \`ARG\` statements in Dockerfiles" >> "$OUTPUT_FILE"
echo "- \`environment:\` sections in docker-compose files" >> "$OUTPUT_FILE"
echo "- Account/header/auth related patterns" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "### 🎯 **Usage:**" >> "$OUTPUT_FILE"
echo "Use this reference to:" >> "$OUTPUT_FILE"
echo "1. Find legitimate environment variables for configuration" >> "$OUTPUT_FILE"
echo "2. Understand what configuration options exist" >> "$OUTPUT_FILE"
echo "3. Stop guessing and use documented variables only" >> "$OUTPUT_FILE"

echo ""
echo "✅ **Environment Variable Discovery Complete!**"
echo "📄 **Output saved to:** $OUTPUT_FILE"
echo ""
echo "🔍 **Summary:**"
echo "   - Analyzed ${#services[@]} Jambonz services"
echo "   - Searched for process.env.* patterns"
echo "   - Included Docker and configuration file references"
echo "   - Focused on account/header/auth related variables"
echo ""
echo "📖 **Next Steps:**"
echo "   1. Review the generated markdown file"
echo "   2. Look for legitimate environment variables for X-Account-Sid handling"
echo "   3. Use only documented variables in docker-compose.yml"
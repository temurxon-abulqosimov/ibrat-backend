#!/bin/bash

# Ibrat Lead Calling System - AWS Deployment Script
# Run this script on your EC2 instance after connecting via SSH

set -e

echo " Starting Ibrat Lead Calling System deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "[INFO] "
}

print_warning() {
    echo -e "[WARNING] "
}

print_error() {
    echo -e "[ERROR] "
}

print_header() {
    echo -e "================================"
    echo -e ""
    echo -e "================================"
}

# Check if running as root
if [ "" -eq 0 ]; then
    print_error "Please do not run this script as root. Use a regular user with sudo privileges."
    exit 1
fi

print_header "System Update"
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

print_header "Installing Node.js"
print_status "Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
node_version=v23.9.0
npm_version=10.9.2
print_status "Node.js version: "
print_status "NPM version: "

print_header "Installing PM2"
print_status "Installing PM2 globally..."
sudo npm install -g pm2

print_header "Installing Nginx"
print_status "Installing Nginx..."
sudo apt install nginx -y

print_header "Installing MongoDB (Optional - if not using Atlas)"
read -p "Do you want to install MongoDB locally? (y/n): " install_mongo
if [ "" = "y" ] || [ "" = "Y" ]; then
    print_status "Installing MongoDB..."
    sudo apt install mongodb -y
    sudo systemctl start mongodb
    sudo systemctl enable mongodb
    print_status "MongoDB installed and started"
else
    print_warning "Skipping MongoDB installation. Make sure to use MongoDB Atlas or external MongoDB instance."
fi

print_header "Setting up Application Directory"
APP_DIR="/home/desktop-ush5dhg\admin/ibrat-lead-calling-backend"
print_status "Application will be installed in: "

# Check if directory exists
if [ -d "" ]; then
    print_warning "Directory  already exists. Updating..."
    cd ""
    git pull origin main
else
    print_status "Cloning repository..."
    # Note: Replace with your actual repository URL
    print_warning "Please update the repository URL in this script before running!"
    # git clone https://github.com/yourusername/ibrat-lead-calling-backend.git ""
    print_error "Please manually clone your repository to "
    exit 1
fi

print_header "Installing Application Dependencies"
cd ""
print_status "Installing npm dependencies..."
npm install --production

print_header "Environment Configuration"
if [ ! -f ".env" ]; then
    print_status "Creating environment file..."
    cp env.example .env
    print_warning "Please edit .env file with your production values:"
    print_warning "nano .env"
    print_warning "Required variables:"
    print_warning "- NODE_ENV=production"
    print_warning "- MONGODB_URI (your MongoDB connection string)"
    print_warning "- JWT_SECRET (strong secret key)"
    print_warning "- TWILIO credentials (if using Twilio)"
    read -p "Press Enter after you have configured the .env file..."
else
    print_status ".env file already exists"
fi

print_header "Configuring Nginx"
print_status "Creating Nginx configuration..."
sudo cp nginx-config.conf /etc/nginx/sites-available/ibrat-api
sudo ln -sf /etc/nginx/sites-available/ibrat-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
print_status "Testing Nginx configuration..."
sudo nginx -t

print_header "Starting Services"
print_status "Starting Nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

print_status "Starting application with PM2..."
pm2 start src/server.js --name "ibrat-api"

print_status "Saving PM2 configuration..."
pm2 save
pm2 startup

print_header "Firewall Configuration"
print_status "Configuring UFW firewall..."
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

print_header "SSL Certificate (Optional)"
read -p "Do you want to set up SSL certificate with Let's Encrypt? (y/n): " setup_ssl
if [ "" = "y" ] || [ "" = "Y" ]; then
    print_status "Installing Certbot..."
    sudo apt install certbot python3-certbot-nginx -y
    
    read -p "Enter your domain name: " domain_name
    if [ ! -z "" ]; then
        print_status "Getting SSL certificate for ..."
        sudo certbot --nginx -d "" -d "www."
    else
        print_warning "Domain name not provided. Skipping SSL setup."
    fi
fi

print_header "Deployment Complete!"
print_status "Application is running with PM2"
print_status "Nginx is configured and running"
print_status "Check application status:"
echo "  pm2 status"
echo "  pm2 logs ibrat-api"
echo "  sudo systemctl status nginx"

print_status "Your API should be accessible at:"
echo "  http://your-server-ip/api-docs (Swagger documentation)"
echo "  http://your-server-ip/health (Health check)"
echo "  http://your-server-ip/api/ (API endpoints)"

if [ "" = "y" ] && [ ! -z "" ]; then
    print_status "HTTPS endpoints:"
    echo "  https:///api-docs"
    echo "  https:///health"
    echo "  https:///api/"
fi

print_status "Deployment completed successfully! "

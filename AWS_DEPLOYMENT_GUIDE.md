# AWS Deployment Configuration for Ibrat Lead Calling System

## Prerequisites
- AWS Account with EC2 access
- MongoDB Atlas account (recommended) or MongoDB on EC2
- Domain name (optional but recommended)

## Deployment Steps

### 1. Launch EC2 Instance
- Instance Type: t3.medium or t3.large (recommended)
- OS: Ubuntu 22.04 LTS
- Storage: 20GB minimum
- Security Groups: 
  - SSH (22) - Your IP only
  - HTTP (80) - 0.0.0.0/0
  - HTTPS (443) - 0.0.0.0/0
  - Custom (5000) - 0.0.0.0/0 (for direct API access)

### 2. Connect to EC2 Instance
`ash
ssh -i your-key.pem ubuntu@your-ec2-ip
`

### 3. Install Dependencies
`ash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install MongoDB (if not using Atlas)
sudo apt install mongodb -y
`

### 4. Deploy Application
`ash
# Clone your repository
git clone https://github.com/yourusername/ibrat-lead-calling-backend.git
cd ibrat-lead-calling-backend

# Install dependencies
npm install --production

# Create environment file
cp env.example .env
# Edit .env with your production values
nano .env
`

### 5. Configure Environment Variables
`ash
# Production .env file
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ibrat-leads
JWT_SECRET=your-super-secure-jwt-secret-key
JWT_EXPIRES_IN=24h
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+998901234567
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
CALL_TIMEOUT=30000
CALL_RETRY_ATTEMPTS=3
`

### 6. Start Application with PM2
`ash
# Start application
pm2 start src/server.js --name "ibrat-api"

# Save PM2 configuration
pm2 save
pm2 startup

# Check status
pm2 status
pm2 logs ibrat-api
`

### 7. Configure Nginx Reverse Proxy
`ash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/ibrat-api
`

### 8. SSL Certificate (Optional but Recommended)
`ash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com
`

### 9. Firewall Configuration
`ash
# Configure UFW
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
`

## Monitoring and Maintenance

### PM2 Commands
`ash
pm2 restart ibrat-api    # Restart application
pm2 stop ibrat-api       # Stop application
pm2 delete ibrat-api     # Delete application
pm2 logs ibrat-api       # View logs
pm2 monit               # Monitor resources
`

### Nginx Commands
`ash
sudo systemctl restart nginx    # Restart Nginx
sudo systemctl status nginx     # Check Nginx status
sudo nginx -t                   # Test Nginx configuration
`

## Backup Strategy
- Database: MongoDB Atlas automatic backups
- Application: Git repository
- Files: Regular backup of uploads directory

## Security Considerations
- Use strong JWT secrets
- Keep dependencies updated
- Regular security updates
- Monitor logs for suspicious activity
- Use HTTPS in production
- Implement rate limiting
- Regular backups

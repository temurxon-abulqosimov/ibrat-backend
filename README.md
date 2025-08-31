# Ibrat Lead Calling System - Backend MVP

An AI-powered automated lead calling system that automatically calls leads and connects them to salespeople when they answer.

## 🚀 Features

- **Automated Lead Calling**: System automatically calls leads from a queue
- **Smart Call Routing**: Automatically transfers answered calls to available salespeople
- **CSV Lead Upload**: Bulk upload leads via CSV files
- **Real-time Updates**: Live call status updates via WebSocket
- **Call Management**: Comprehensive call logging and statistics
- **User Management**: Role-based access control (Admin/Salesperson)
- **Twilio Integration**: Professional telephony with webhook handling

## 🏗️ Architecture

- **Backend**: Node.js + Express.js
- **Database**: MongoDB with Mongoose ODM
- **Real-time**: Socket.io for live updates
- **Telephony**: Twilio for call handling
- **Authentication**: JWT-based auth system
- **File Processing**: CSV parsing and validation

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- Twilio account with phone number
- npm or yarn package manager

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ibrat-lead-calling-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   
   # MongoDB Configuration
   MONGODB_URI=mongodb://localhost:27017/ibrat-leads
   
   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=24h
   
   # Twilio Configuration
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   
   # File Upload Configuration
   MAX_FILE_SIZE=10485760
   UPLOAD_PATH=./uploads
   
   # Call Configuration
   CALL_TIMEOUT=30000
   CALL_RETRY_ATTEMPTS=3
   ```

4. **Database Setup**
   - Ensure MongoDB is running
   - Create database: `ibrat-leads`
   - Or use MongoDB Atlas connection string

5. **Twilio Setup**
   - Create Twilio account
   - Get Account SID and Auth Token
   - Purchase phone number
   - Configure webhook URLs in Twilio console

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Running Tests
```bash
npm test
npm run test:watch
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token

### Users
- `GET /api/users` - Get all users (Admin only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user profile
- `PUT /api/users/:id/availability` - Update availability
- `PUT /api/users/:id/activate` - Activate/deactivate user (Admin only)
- `DELETE /api/users/:id` - Delete user (Admin only)
- `GET /api/users/stats/summary` - User statistics (Admin only)

### Leads
- `POST /api/leads/upload-csv` - Upload leads from CSV (Admin only)
- `POST /api/leads` - Create new lead
- `GET /api/leads` - Get all leads with pagination
- `GET /api/leads/:id` - Get lead by ID
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead (Admin only)
- `GET /api/leads/stats/summary` - Lead statistics

### Calls
- `POST /api/calls/initiate` - Initiate call to lead
- `GET /api/calls` - Get call history
- `GET /api/calls/:id` - Get call details
- `PUT /api/calls/:id/status` - Update call status
- `GET /api/calls/stats/summary` - Call statistics

### Twilio Webhooks
- `POST /api/calls/webhook/status` - Call status updates
- `POST /api/calls/webhook/answer` - Call answered webhook

## 🔌 WebSocket Events

### Client to Server
- `authenticate` - Authenticate user with JWT token
- `join_room` - Join specific room
- `leave_room` - Leave specific room
- `update_availability` - Update user availability
- `initiate_call` - Manually initiate call
- `update_call_notes` - Update call notes

### Server to Client
- `authenticated` - Authentication successful
- `auth_error` - Authentication error
- `call_initiated` - New call started
- `call_answered` - Call was answered
- `call_status_updated` - Call status changed
- `user_online` - User came online
- `user_offline` - User went offline
- `user_availability_changed` - User availability changed

## 📊 Database Models

### User
- Authentication fields (name, email, phone, password)
- Role-based access (admin, salesperson)
- Availability status
- Call statistics

### Lead
- Contact information (phone, name, email)
- Status tracking (pending, calling, answered, etc.)
- Priority levels (low, medium, high, urgent)
- Call history and retry logic

### CallLog
- Call details (Twilio SID, duration, status)
- Lead and salesperson references
- Call flow tracking
- Error logging

## 🔄 Call Flow

1. **Lead Upload**: Admin uploads CSV with phone numbers
2. **Queue Processing**: System automatically processes lead queue
3. **Call Initiation**: System calls lead using Twilio
4. **Answer Detection**: Twilio detects when lead answers
5. **Call Transfer**: System transfers call to available salesperson
6. **Status Updates**: Real-time updates via WebSocket
7. **Call Logging**: Complete call history and statistics

## 🧪 Testing

The project includes comprehensive tests for:
- Authentication system
- API endpoints
- Database models
- Business logic

Run tests with:
```bash
npm test
```

## 📁 Project Structure

```
├── models/           # Database models
├── routes/           # API route handlers
├── middleware/       # Authentication and validation
├── services/         # Business logic services
├── tests/            # Test files
├── uploads/          # File upload directory
├── server.js         # Main server file
├── package.json      # Dependencies and scripts
└── README.md         # This file
```

## 🔧 Configuration

### Environment Variables
- `PORT`: Server port (default: 5000)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: JWT signing secret
- `TWILIO_ACCOUNT_SID`: Twilio account identifier
- `TWILIO_AUTH_TOKEN`: Twilio authentication token
- `TWILIO_PHONE_NUMBER`: Twilio phone number for outbound calls

### Call Settings
- `CALL_TIMEOUT`: Timeout for unanswered calls (default: 30s)
- `CALL_RETRY_ATTEMPTS`: Maximum retry attempts (default: 3)
- `MAX_FILE_SIZE`: Maximum CSV file size (default: 10MB)

## 🚨 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control
- Input validation and sanitization
- Rate limiting
- CORS configuration
- Helmet security headers

## 📈 Monitoring & Logging

- Request logging with Morgan
- Error handling middleware
- Call statistics and analytics
- Real-time system status
- WebSocket connection monitoring

## 🚀 Deployment

### Production Considerations
1. Set `NODE_ENV=production`
2. Use strong JWT secret
3. Configure MongoDB Atlas
4. Set up proper CORS origins
5. Configure Twilio webhook URLs
6. Set up SSL/TLS certificates
7. Configure reverse proxy (nginx)

### Docker (Optional)
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation
- Review the test files for usage examples

## 🔮 Future Enhancements

- Advanced call analytics
- Call recording management
- Integration with CRM systems
- Multi-language support
- Advanced call routing algorithms
- Performance optimization
- Load balancing support 
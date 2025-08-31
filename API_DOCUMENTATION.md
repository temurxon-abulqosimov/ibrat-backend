# Ibrat Lead Calling System - API Documentation

## 🎯 **Overview**

This document provides comprehensive API documentation for the **Admin Panel** and **Operator Panel** of the Ibrat Lead Calling System. These APIs enable frontend developers to build powerful admin and operator interfaces without needing to understand the complex backend logic.

## 🔐 **Authentication**

All API endpoints require authentication using JWT tokens.

**Header Format:**
```
Authorization: Bearer <your_jwt_token>
```

**Get Token:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password123"
}
```

## 👑 **ADMIN PANEL APIs**

### **Dashboard & Overview**

#### **1. Admin Dashboard**
```http
GET /api/admin/dashboard
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "dashboard": {
    "userStats": {
      "totalUsers": 15,
      "activeUsers": 12,
      "availableSalespeople": 8,
      "totalAdmins": 2
    },
    "leadStats": {
      "totalLeads": 1500,
      "pendingLeads": 450,
      "callingLeads": 25,
      "answeredLeads": 800,
      "transferredLeads": 200,
      "failedLeads": 25
    },
    "callStats": {
      "totalCalls": 2500,
      "todayCalls": 150,
      "answeredCalls": 1200,
      "completedCalls": 800,
      "totalDuration": 45000,
      "averageDuration": 56
    },
    "priorityBreakdown": [
      { "_id": "urgent", "count": 50 },
      { "_id": "high", "count": 200 },
      { "_id": "medium", "count": 800 },
      { "_id": "low", "count": 450 }
    ],
    "salespersonPerformance": [
      {
        "name": "John Doe",
        "email": "john@example.com",
        "totalCalls": 150,
        "successfulCalls": 120,
        "totalDuration": 7200
      }
    ],
    "recentActivity": [
      {
        "lead": { "phone": "+1234567890", "name": "Lead Name" },
        "salesperson": { "name": "John Doe" },
        "status": "completed",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

#### **2. System Status**
```http
GET /api/admin/system-status
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "systemStatus": {
    "database": "connected",
    "callQueue": {
      "isRunning": true,
      "activeCalls": 3,
      "maxConcurrentCalls": 5
    },
    "activeConnections": 12,
    "uptime": 86400,
    "memory": {
      "rss": 52428800,
      "heapTotal": 20971520,
      "heapUsed": 10485760
    },
    "environment": "production"
  }
}
```

### **Lead Management**

#### **3. Bulk Lead Actions**
```http
POST /api/admin/leads/bulk-action
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "action": "update_priority",
  "leadIds": ["lead_id_1", "lead_id_2"],
  "data": {
    "priority": "high"
  }
}
```

**Available Actions:**
- `update_priority` - Change lead priority
- `update_status` - Change lead status
- `add_tags` - Add tags to leads
- `delete` - Soft delete leads

#### **4. CSV Lead Upload**
```http
POST /api/leads/upload-csv
Authorization: Bearer <admin_token>
Content-Type: multipart/form-data

csvFile: <file>
```

**Response:**
```json
{
  "message": "CSV upload completed",
  "summary": {
    "totalProcessed": 1000,
    "successCount": 950,
    "duplicateCount": 30,
    "errorCount": 20
  }
}
```

### **Performance Reports**

#### **5. Performance Analytics**
```http
GET /api/admin/reports/performance?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "performance": {
    "salespersonStats": [
      {
        "name": "John Doe",
        "totalCalls": 150,
        "answeredCalls": 120,
        "completedCalls": 100,
        "totalDuration": 7200,
        "successRate": 0.8
      }
    ],
    "leadConversion": [
      { "_id": "pending", "count": 450 },
      { "_id": "answered", "count": 800 },
      { "_id": "transferred", "count": 200 }
    ],
    "dailyCalls": [
      {
        "_id": { "year": 2024, "month": 1, "day": 15 },
        "totalCalls": 150,
        "answeredCalls": 120
      }
    ]
  }
}
```

### **System Control**

#### **6. System Operations**
```http
POST /api/admin/system/control
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "action": "pause_queue"
}
```

**Available Actions:**
- `pause_queue` - Pause call queue processing
- `resume_queue` - Resume call queue processing
- `reset_stuck_leads` - Reset leads stuck in calling status
- `get_queue_status` - Get current queue status

## 📞 **OPERATOR PANEL APIs**

### **Dashboard & Overview**

#### **1. Operator Dashboard**
```http
GET /api/operator/dashboard
Authorization: Bearer <operator_token>
```

**Response:**
```json
{
  "dashboard": {
    "personalStats": {
      "totalCalls": 150,
      "todayCalls": 25,
      "answeredCalls": 120,
      "completedCalls": 100,
      "totalDuration": 7200,
      "averageDuration": 72
    },
    "assignedLeads": [
      {
        "phone": "+1234567890",
        "name": "Lead Name",
        "priority": "high",
        "status": "claimed"
      }
    ],
    "recentCalls": [
      {
        "lead": { "phone": "+1234567890", "name": "Lead Name" },
        "status": "completed",
        "duration": 180,
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "availableLeads": [
      {
        "phone": "+1234567891",
        "name": "Available Lead",
        "priority": "urgent"
      }
    ],
    "performanceRanking": [
      {
        "name": "John Doe",
        "totalCalls": 150,
        "successRate": 0.8
      }
    ],
    "operatorRank": 3
  }
}
```

### **Lead Management**

#### **2. Available Leads**
```http
GET /api/operator/leads/available?page=1&limit=20&priority=high
Authorization: Bearer <operator_token>
```

**Response:**
```json
{
  "leads": [
    {
      "phone": "+1234567890",
      "name": "Lead Name",
      "email": "lead@example.com",
      "priority": "high",
      "tags": ["hot", "interested"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

#### **3. Claim Lead**
```http
POST /api/operator/leads/claim
Authorization: Bearer <operator_token>
Content-Type: application/json

{
  "leadId": "lead_id_123"
}
```

**Response:**
```json
{
  "message": "Lead claimed successfully",
  "lead": {
    "id": "lead_id_123",
    "phone": "+1234567890",
    "name": "Lead Name",
    "priority": "high",
    "status": "claimed"
  }
}
```

### **Call Management**

#### **4. Start Call**
```http
POST /api/operator/calls/start
Authorization: Bearer <operator_token>
Content-Type: application/json

{
  "leadId": "lead_id_123"
}
```

**Response:**
```json
{
  "message": "Call started successfully",
  "call": {
    "id": "call_id_456",
    "lead": "+1234567890",
    "status": "initiated",
    "twilioCallSid": "CA1234567890"
  }
}
```

#### **5. Update Call Status**
```http
PUT /api/operator/calls/call_id_456/update
Authorization: Bearer <operator_token>
Content-Type: application/json

{
  "status": "completed",
  "notes": "Customer interested in premium package",
  "duration": 180
}
```

**Available Statuses:**
- `initiated` - Call started
- `ringing` - Phone ringing
- `answered` - Call answered
- `completed` - Call completed successfully
- `busy` - Line busy
- `no-answer` - No answer
- `failed` - Call failed

#### **6. Call History**
```http
GET /api/operator/calls/history?page=1&limit=20&status=completed
Authorization: Bearer <operator_token>
```

**Response:**
```json
{
  "calls": [
    {
      "lead": {
        "phone": "+1234567890",
        "name": "Lead Name",
        "priority": "high"
      },
      "status": "completed",
      "duration": 180,
      "notes": "Customer interested",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### **Profile Management**

#### **7. Update Availability**
```http
PUT /api/operator/profile/availability
Authorization: Bearer <operator_token>
Content-Type: application/json

{
  "isAvailable": false
}
```

**Response:**
```json
{
  "message": "Availability updated successfully",
  "isAvailable": false
}
```

#### **8. Performance Metrics**
```http
GET /api/operator/profile/performance?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <operator_token>
```

**Response:**
```json
{
  "performance": {
    "totalCalls": 150,
    "answeredCalls": 120,
    "completedCalls": 100,
    "totalDuration": 7200,
    "averageDuration": 72
  },
  "dailyPerformance": [
    {
      "_id": { "year": 2024, "month": 1, "day": 15 },
      "calls": 25,
      "answered": 20,
      "completed": 18,
      "duration": 1200
    }
  ],
  "leadConversion": [
    {
      "_id": "high",
      "totalCalls": 50,
      "answeredCalls": 45,
      "completedCalls": 40
    }
  ]
}
```

## 🔌 **WebSocket Events**

### **Real-time Updates**

#### **Connection**
```javascript
const socket = io('http://localhost:5000');

// Authenticate
socket.emit('authenticate', { token: 'your_jwt_token' });

// Listen for authentication
socket.on('authenticated', (data) => {
  console.log('Connected as:', data.name);
});
```

#### **Admin Events**
```javascript
// Call updates
socket.on('call_initiated', (data) => {
  console.log('New call:', data);
});

socket.on('call_answered', (data) => {
  console.log('Call answered:', data);
});

// User presence
socket.on('user_online', (data) => {
  console.log('User online:', data.name);
});

socket.on('user_offline', (data) => {
  console.log('User offline:', data.name);
});
```

#### **Operator Events**
```javascript
// Personal call updates
socket.on('call_status_updated', (data) => {
  console.log('Call status changed:', data);
});

// Lead assignments
socket.on('lead_assigned', (data) => {
  console.log('New lead assigned:', data);
});
```

## 📊 **Data Models**

### **Lead Priority Levels**
- `urgent` - Highest priority, called immediately
- `high` - High priority, called within 2 minutes
- `medium` - Normal priority, called within 10 minutes
- `low` - Low priority, called when queue is empty

### **Lead Status Flow**
```
pending → claimed → calling → answered → transferred
    ↓
  failed (after max retries)
```

### **Call Status Flow**
```
initiated → ringing → answered → completed
    ↓
  busy/no-answer/failed
```

## 🚀 **Usage Examples**

### **Admin Workflow**
1. **Upload leads** via CSV
2. **Monitor system** via dashboard
3. **Control call queue** (pause/resume)
4. **Generate reports** for performance analysis
5. **Manage users** and their permissions

### **Operator Workflow**
1. **View dashboard** for personal stats
2. **Browse available leads** by priority
3. **Claim leads** for calling
4. **Start calls** to leads
5. **Update call status** and add notes
6. **Track performance** and ranking

## 🔧 **Error Handling**

All APIs return consistent error responses:

```json
{
  "error": "Error message",
  "message": "Detailed error description"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## 📝 **Notes**

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **File Upload**: Maximum 10MB for CSV files
- **Pagination**: Default 20 items per page, maximum 100
- **Real-time**: WebSocket connections require authentication
- **Simulation Mode**: System works without Twilio credentials for development

This API provides everything needed to build powerful admin and operator interfaces for the lead calling system! 🎉 
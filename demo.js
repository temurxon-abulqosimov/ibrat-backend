#!/usr/bin/env node

/**
 * Demo Script for Ibrat Lead Calling System
 * This script demonstrates the core functionality
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const Lead = require('./models/Lead');
const CallLog = require('./models/CallLog');

// Demo configuration
const DEMO_CONFIG = {
  mongodbUri: 'mongodb://localhost:27017/ibrat-demo',
  demoData: {
    users: [
      {
        name: 'Admin User',
        email: 'admin@ibrat.com',
        phone: '+1234567890',
        password: 'admin123',
        role: 'admin'
      },
      {
        name: 'Sales Person 1',
        email: 'sales1@ibrat.com',
        phone: '+1234567891',
        password: 'sales123',
        role: 'salesperson'
      },
      {
        name: 'Sales Person 2',
        email: 'sales2@ibrat.com',
        phone: '+1234567892',
        password: 'sales123',
        role: 'salesperson'
      }
    ],
    leads: [
      {
        phone: '+1987654321',
        name: 'John Doe',
        email: 'john@example.com',
        priority: 'high'
      },
      {
        phone: '+1987654322',
        name: 'Jane Smith',
        email: 'jane@example.com',
        priority: 'medium'
      },
      {
        phone: '+1987654323',
        name: 'Bob Johnson',
        email: 'bob@example.com',
        priority: 'urgent'
      },
      {
        phone: '+1987654324',
        name: 'Alice Brown',
        email: 'alice@example.com',
        priority: 'low'
      }
    ]
  }
};

// Utility functions
const log = (message, type = 'info') => {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m', // Yellow
    reset: '\x1b[0m'     // Reset
  };
  
  console.log(`${colors[type]}${message}${colors.reset}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Demo functions
const setupDatabase = async () => {
  log('🔧 Setting up demo database...', 'info');
  
  try {
    await mongoose.connect(DEMO_CONFIG.mongodbUri);
    log('✅ Connected to MongoDB', 'success');
    
    // Clear existing data
    await User.deleteMany({});
    await Lead.deleteMany({});
    await CallLog.deleteMany({});
    log('🧹 Cleared existing data', 'info');
    
  } catch (error) {
    log(`❌ Database connection failed: ${error.message}`, 'error');
    throw error;
  }
};

const createDemoUsers = async () => {
  log('👥 Creating demo users...', 'info');
  
  const users = [];
  for (const userData of DEMO_CONFIG.demoData.users) {
    const user = new User(userData);
    await user.save();
    users.push(user);
    log(`   ✅ Created ${user.role}: ${user.name}`, 'success');
  }
  
  return users;
};

const createDemoLeads = async () => {
  log('📋 Creating demo leads...', 'info');
  
  const leads = [];
  for (const leadData of DEMO_CONFIG.demoData.leads) {
    const lead = new Lead(leadData);
    await lead.save();
    leads.push(lead);
    log(`   ✅ Created lead: ${lead.name} (${lead.phone}) - Priority: ${lead.priority}`, 'success');
  }
  
  return leads;
};

const demonstrateLeadManagement = async (leads) => {
  log('\n📊 Demonstrating Lead Management...', 'info');
  
  // Show lead statistics
  const stats = await Lead.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        highPriority: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
        urgentPriority: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } }
      }
    }
  ]);
  
  if (stats[0]) {
    log(`   📈 Total Leads: ${stats[0].total}`, 'info');
    log(`   ⏳ Pending: ${stats[0].pending}`, 'info');
    log(`   🔴 High Priority: ${stats[0].highPriority}`, 'info');
    log(`   🚨 Urgent Priority: ${stats[0].urgentPriority}`, 'info');
  }
  
  // Demonstrate priority-based lead selection
  const nextLead = await Lead.getNextLeadToCall();
  if (nextLead) {
    log(`   🎯 Next lead to call: ${nextLead.name} (${nextLead.phone}) - Priority: ${nextLead.priority}`, 'success');
  }
};

const demonstrateCallFlow = async (users, leads) => {
  log('\n📞 Demonstrating Call Flow...', 'info');
  
  const salesperson = users.find(u => u.role === 'salesperson');
  const lead = leads[0];
  
  if (!salesperson || !lead) {
    log('   ⚠️ Cannot demonstrate call flow - missing users or leads', 'warning');
    return;
  }
  
  // Simulate call initiation
  log(`   📞 Simulating call to ${lead.name} (${lead.phone})`, 'info');
  
  // Update lead status
  lead.status = 'calling';
  lead.assignedTo = salesperson._id;
  await lead.save();
  
  // Create call log
  const callLog = new CallLog({
    lead: lead._id,
    salesperson: salesperson._id,
    from: '+1234567890',
    to: lead.phone,
    status: 'initiated'
  });
  await callLog.save();
  
  log(`   ✅ Call initiated by ${salesperson.name}`, 'success');
  
  // Simulate call progression
  await sleep(1000);
  await callLog.updateStatus('ringing');
  log(`   🔔 Call is ringing...`, 'info');
  
  await sleep(2000);
  await callLog.updateStatus('answered');
  lead.status = 'answered';
  await lead.save();
  log(`   📱 Call answered by ${lead.name}`, 'success');
  
  await sleep(1000);
  await callLog.updateStatus('completed', { duration: 180 });
  lead.status = 'transferred';
  await lead.save();
  log(`   ✅ Call completed - Duration: 3 minutes`, 'success');
  
  // Update salesperson stats
  salesperson.callStats.totalCalls += 1;
  salesperson.callStats.successfulCalls += 1;
  salesperson.callStats.totalDuration += 180;
  await salesperson.save();
  
  log(`   📊 Updated ${salesperson.name}'s call stats`, 'info');
};

const demonstrateUserManagement = async (users) => {
  log('\n👤 Demonstrating User Management...', 'info');
  
  const salespeople = users.filter(u => u.role === 'salesperson');
  const admins = users.filter(u => u.role === 'admin');
  
  log(`   👥 Total Users: ${users.length}`, 'info');
  log(`   🎯 Admins: ${admins.length}`, 'info');
  log(`   📞 Salespeople: ${salespeople.length}`, 'info');
  
  // Show available salespeople
  const availableSalespeople = salespeople.filter(s => s.isAvailable);
  log(`   ✅ Available Salespeople: ${availableSalespeople.length}`, 'success');
  
  // Demonstrate availability toggle
  if (salespeople.length > 0) {
    const salesperson = salespeople[0];
    salesperson.isAvailable = false;
    await salesperson.save();
    log(`   🔴 Set ${salesperson.name} as unavailable`, 'warning');
    
    // Check available count again
    const newAvailableCount = (await User.find({ role: 'salesperson', isAvailable: true })).length;
    log(`   📊 Available Salespeople: ${newAvailableCount}`, 'info');
  }
};

const demonstrateCSVUpload = async () => {
  log('\n📁 Demonstrating CSV Upload Simulation...', 'info');
  
  // Simulate CSV data processing
  const csvData = [
    { phone: '+1555123456', name: 'New Lead 1', priority: 'medium' },
    { phone: '+1555123457', name: 'New Lead 2', priority: 'high' },
    { phone: '+1555123458', name: 'New Lead 3', priority: 'low' }
  ];
  
  let successCount = 0;
  let duplicateCount = 0;
  
  for (const row of csvData) {
    try {
      // Check for duplicates
      const existingLead = await Lead.findOne({ phone: row.phone });
      if (existingLead) {
        duplicateCount++;
        continue;
      }
      
      // Create new lead
      const lead = new Lead(row);
      await lead.save();
      successCount++;
      log(`   ✅ Created lead: ${row.name} (${row.phone})`, 'success');
      
    } catch (error) {
      log(`   ❌ Error creating lead ${row.phone}: ${error.message}`, 'error');
    }
  }
  
  log(`   📊 CSV Processing Results:`, 'info');
  log(`      ✅ Success: ${successCount}`, 'success');
  log(`      ⚠️ Duplicates: ${duplicateCount}`, 'warning');
};

const showSystemStatus = async () => {
  log('\n📊 System Status Summary...', 'info');
  
  const userCount = await User.countDocuments();
  const leadCount = await Lead.countDocuments();
  const callCount = await CallLog.countDocuments();
  
  const leadStats = await Lead.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const callStats = await CallLog.aggregate([
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        completedCalls: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        totalDuration: { $sum: '$duration' }
      }
    }
  ]);
  
  log(`   👥 Users: ${userCount}`, 'info');
  log(`   📋 Leads: ${leadCount}`, 'info');
  log(`   📞 Calls: ${callCount}`, 'info');
  
  if (leadStats.length > 0) {
    log(`   📊 Lead Status Breakdown:`, 'info');
    leadStats.forEach(stat => {
      log(`      ${stat._id}: ${stat.count}`, 'info');
    });
  }
  
  if (callStats[0]) {
    log(`   📈 Call Statistics:`, 'info');
    log(`      Total Calls: ${callStats[0].totalCalls}`, 'info');
    log(`      Completed: ${callStats[0].completedCalls}`, 'info');
    log(`      Total Duration: ${Math.round(callStats[0].totalDuration / 60)} minutes`, 'info');
  }
};

const cleanup = async () => {
  log('\n🧹 Cleaning up demo data...', 'info');
  
  try {
    await User.deleteMany({});
    await Lead.deleteMany({});
    await CallLog.deleteMany({});
    await mongoose.connection.close();
    
    log('✅ Demo cleanup completed', 'success');
    log('✅ Database connection closed', 'success');
    
  } catch (error) {
    log(`❌ Cleanup error: ${error.message}`, 'error');
  }
};

// Main demo runner
const runDemo = async () => {
  log('🚀 Starting Ibrat Lead Calling System Demo', 'info');
  log('==========================================', 'info');
  
  try {
    await setupDatabase();
    await sleep(1000);
    
    const users = await createDemoUsers();
    await sleep(1000);
    
    const leads = await createDemoLeads();
    await sleep(1000);
    
    await demonstrateLeadManagement(leads);
    await sleep(1000);
    
    await demonstrateCallFlow(users, leads);
    await sleep(1000);
    
    await demonstrateUserManagement(users);
    await sleep(1000);
    
    await demonstrateCSVUpload();
    await sleep(1000);
    
    await showSystemStatus();
    await sleep(1000);
    
    log('\n🎉 Demo completed successfully!', 'success');
    log('==========================================', 'info');
    log('The system demonstrates:', 'info');
    log('✅ User management and authentication', 'success');
    log('✅ Lead management with priority system', 'success');
    log('✅ Automated call queue processing', 'success');
    log('✅ Call flow simulation', 'success');
    log('✅ CSV upload processing', 'success');
    log('✅ Real-time status tracking', 'success');
    log('✅ Statistics and reporting', 'success');
    
  } catch (error) {
    log(`❌ Demo failed: ${error.message}`, 'error');
  } finally {
    await cleanup();
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  log('\n🛑 Demo interrupted by user', 'warning');
  await cleanup();
  process.exit(0);
});

// Run demo if this file is executed directly
if (require.main === module) {
  runDemo();
}

module.exports = { runDemo }; 
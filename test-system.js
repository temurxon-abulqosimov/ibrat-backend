#!/usr/bin/env node

/**
 * Simple System Test Script
 * This script tests the basic functionality without requiring external services
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const Lead = require('./models/Lead');
const CallLog = require('./models/CallLog');

// Test configuration
const TEST_CONFIG = {
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ibrat-leads',
  testTimeout: 10000
};

// Test results
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Utility functions
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m', // Yellow
    reset: '\x1b[0m'     // Reset
  };
  
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
};

const assert = (condition, message) => {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    log(`✅ PASS: ${message}`, 'success');
  } else {
    testResults.failed++;
    log(`❌ FAIL: ${message}`, 'error');
  }
};

const runTest = async (testName, testFunction) => {
  try {
    log(`🧪 Running test: ${testName}`, 'info');
    await testFunction();
    log(`✅ Test completed: ${testName}`, 'success');
  } catch (error) {
    log(`❌ Test failed: ${testName} - ${error.message}`, 'error');
    testResults.failed++;
    testResults.total++;
  }
};

// Test functions
const testDatabaseConnection = async () => {
  const connection = await mongoose.connect(TEST_CONFIG.mongodbUri);
  assert(connection.connection.readyState === 1, 'Database connection successful');
};

const testUserModel = async () => {
  // Test user creation
  const userData = {
    name: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890',
    password: 'password123',
    role: 'salesperson'
  };
  
  const user = new User(userData);
  await user.save();
  
  assert(user._id, 'User created with ID');
  assert(user.name === userData.name, 'User name saved correctly');
  assert(user.email === userData.email, 'User email saved correctly');
  assert(user.role === userData.role, 'User role saved correctly');
  assert(user.isActive === true, 'User is active by default');
  assert(user.isAvailable === true, 'User is available by default');
  
  // Test password hashing
  const isPasswordValid = await user.comparePassword('password123');
  assert(isPasswordValid, 'Password hashing and comparison works');
  
  // Test duplicate email prevention
  try {
    const duplicateUser = new User(userData);
    await duplicateUser.save();
    assert(false, 'Should not allow duplicate email');
  } catch (error) {
    assert(error.code === 11000, 'Duplicate email properly prevented');
  }
  
  // Cleanup
  await User.deleteMany({ email: userData.email });
};

const testLeadModel = async () => {
  // Test lead creation
  const leadData = {
    phone: '+0987654321',
    name: 'Test Lead',
    email: 'lead@example.com',
    priority: 'high'
  };
  
  const lead = new Lead(leadData);
  await lead.save();
  
  assert(lead._id, 'Lead created with ID');
  assert(lead.phone === leadData.phone, 'Lead phone saved correctly');
  assert(lead.status === 'pending', 'Lead status is pending by default');
  assert(lead.priority === 'high', 'Lead priority saved correctly');
  
  // Test status update method
  await lead.updateCallStatus('no_answer', 30);
  assert(lead.status === 'no_answer', 'Lead status updated correctly');
  assert(lead.callAttempts === 1, 'Call attempts incremented');
  assert(lead.callHistory.length === 1, 'Call history recorded');
  
  // Test duplicate phone prevention
  try {
    const duplicateLead = new Lead(leadData);
    await duplicateLead.save();
    assert(false, 'Should not allow duplicate phone');
  } catch (error) {
    assert(error.code === 11000, 'Duplicate phone properly prevented');
  }
  
  // Cleanup
  await Lead.deleteMany({ phone: leadData.phone });
};

const testCallLogModel = async () => {
  // Create test user and lead first
  const user = new User({
    name: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890',
    password: 'password123'
  });
  await user.save();
  
  const lead = new Lead({
    phone: '+0987654321',
    name: 'Test Lead'
  });
  await lead.save();
  
  // Test call log creation
  const callLogData = {
    lead: lead._id,
    salesperson: user._id,
    twilioCallSid: 'test_call_sid_123',
    from: '+1234567890',
    to: '+0987654321',
    status: 'initiated'
  };
  
  const callLog = new CallLog(callLogData);
  await callLog.save();
  
  assert(callLog._id, 'Call log created with ID');
  assert(callLog.lead.toString() === lead._id.toString(), 'Lead reference saved correctly');
  assert(callLog.salesperson.toString() === user._id.toString(), 'Salesperson reference saved correctly');
  
  // Test status update method
  await callLog.updateStatus('answered');
  assert(callLog.status === 'answered', 'Call status updated correctly');
  assert(callLog.answerTime, 'Answer time recorded');
  
  await callLog.updateStatus('completed', { duration: 120 });
  assert(callLog.status === 'completed', 'Call status updated to completed');
  assert(callLog.duration === 120, 'Call duration recorded');
  
  // Cleanup
  await CallLog.deleteMany({ _id: callLog._id });
  await User.deleteMany({ _id: user._id });
  await Lead.deleteMany({ _id: lead._id });
};

const testModelRelationships = async () => {
  // Create test data
  const user = new User({
    name: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890',
    password: 'password123'
  });
  await user.save();
  
  const lead = new Lead({
    phone: '+0987654321',
    name: 'Test Lead'
  });
  await lead.save();
  
  // Test population
  const populatedLead = await Lead.findById(lead._id).populate('assignedTo');
  assert(populatedLead, 'Lead found with population');
  
  // Test call log with relationships
  const callLog = new CallLog({
    lead: lead._id,
    salesperson: user._id,
    from: '+1234567890',
    to: '+0987654321',
    status: 'initiated'
  });
  await callLog.save();
  
  const populatedCallLog = await CallLog.findById(callLog._id)
    .populate('lead', 'phone name')
    .populate('salesperson', 'name email');
  
  assert(populatedCallLog.lead.phone === lead.phone, 'Lead populated correctly');
  assert(populatedCallLog.salesperson.name === user.name, 'Salesperson populated correctly');
  
  // Cleanup
  await CallLog.deleteMany({ _id: callLog._id });
  await User.deleteMany({ _id: user._id });
  await Lead.deleteMany({ _id: lead._id });
};

const testValidation = async () => {
  // Test invalid email
  try {
    const invalidUser = new User({
      name: 'Test User',
      email: 'invalid-email',
      phone: '+1234567890',
      password: 'password123'
    });
    await invalidUser.save();
    assert(false, 'Should not allow invalid email');
  } catch (error) {
    assert(error.errors.email, 'Email validation working');
  }
  
  // Test invalid phone
  try {
    const invalidUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      phone: 'invalid-phone',
      password: 'password123'
    });
    await invalidUser.save();
    assert(false, 'Should not allow invalid phone');
  } catch (error) {
    assert(error.errors.phone, 'Phone validation working');
  }
  
  // Test short password
  try {
    const invalidUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      phone: '+1234567890',
      password: '123'
    });
    await invalidUser.save();
    assert(false, 'Should not allow short password');
  } catch (error) {
    assert(error.errors.password, 'Password validation working');
  }
};

const testBusinessLogic = async () => {
  // Test lead priority sorting
  const leads = [
    { phone: '+1111111111', priority: 'low' },
    { phone: '+2222222222', priority: 'high' },
    { phone: '+3333333333', priority: 'urgent' },
    { phone: '+4444444444', priority: 'medium' }
  ];
  
  for (const leadData of leads) {
    const lead = new Lead(leadData);
    await lead.save();
  }
  
  // Test getNextLeadToCall method
  const nextLead = await Lead.getNextLeadToCall();
  assert(nextLead, 'Next lead to call found');
  assert(nextLead.priority === 'urgent', 'High priority lead selected first');
  
  // Cleanup
  await Lead.deleteMany({ phone: { $in: leads.map(l => l.phone) } });
};

// Main test runner
const runAllTests = async () => {
  log('🚀 Starting Ibrat Lead Calling System Tests', 'info');
  log('==========================================', 'info');
  
  try {
    await runTest('Database Connection', testDatabaseConnection);
    await runTest('User Model', testUserModel);
    await runTest('Lead Model', testLeadModel);
    await runTest('Call Log Model', testCallLogModel);
    await runTest('Model Relationships', testModelRelationships);
    await runTest('Validation Rules', testValidation);
    await runTest('Business Logic', testBusinessLogic);
    
  } catch (error) {
    log(`❌ Test suite error: ${error.message}`, 'error');
  }
  
  // Print results
  log('==========================================', 'info');
  log(`📊 Test Results:`, 'info');
  log(`   Total: ${testResults.total}`, 'info');
  log(`   Passed: ${testResults.passed}`, 'success');
  log(`   Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'success');
  
  if (testResults.failed === 0) {
    log('🎉 All tests passed! System is working correctly.', 'success');
  } else {
    log('⚠️ Some tests failed. Please check the errors above.', 'warning');
  }
  
  // Cleanup and exit
  await mongoose.connection.close();
  process.exit(testResults.failed > 0 ? 1 : 0);
};

// Handle process termination
process.on('SIGINT', async () => {
  log('\n🛑 Test interrupted by user', 'warning');
  await mongoose.connection.close();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
});

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testResults
}; 
const Lead = require('../models/Lead');
const User = require('../models/User');
const { initiateCall } = require('./twilioService');
const { emitCallUpdate } = require('./socketHandler');

class CallQueue {
  constructor() {
    this.isRunning = false;
    this.callInterval = null;
    this.callTimeout = parseInt(process.env.CALL_TIMEOUT) || 30000; // 30 seconds
    this.maxConcurrentCalls = 5; // Maximum concurrent calls
    this.activeCalls = new Map(); // Track active calls
    this.callDelay = 5000; // 5 seconds between calls
  }

  // Initialize the call queue
  async initialize() {
    try {
      console.log('🚀 Initializing call queue...');
      
      // Reset any stuck leads
      await this.resetStuckLeads();
      
      // Start the queue processor
      this.start();
      
      console.log('✅ Call queue initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing call queue:', error);
    }
  }

  // Start the call queue processor
  start() {
    if (this.isRunning) {
      console.log('⚠️ Call queue is already running');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Starting call queue processor...');

    // Process calls every 5 seconds
    this.callInterval = setInterval(async () => {
      await this.processQueue();
    }, this.callDelay);

    console.log('✅ Call queue processor started');
  }

  // Stop the call queue processor
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Call queue is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.callInterval) {
      clearInterval(this.callInterval);
      this.callInterval = null;
    }

    console.log('⏹️ Call queue processor stopped');
  }

  // Process the call queue
  async processQueue() {
    try {
      // Check if we can make more calls
      if (this.activeCalls.size >= this.maxConcurrentCalls) {
        return; // Max concurrent calls reached
      }

      // Get next lead to call
      const lead = await Lead.getNextLeadToCall();
      if (!lead) {
        return; // No leads to call
      }

      // Check if lead is already being called
      if (this.activeCalls.has(lead._id.toString())) {
        return; // Lead is already being processed
      }

      // Find available salesperson
      const salesperson = await this.findAvailableSalesperson();
      if (!salesperson) {
        console.log('⚠️ No available salesperson found, skipping lead:', lead.phone);
        return;
      }

      // Add to active calls
      this.activeCalls.set(lead._id.toString(), {
        leadId: lead._id,
        salespersonId: salesperson._id,
        startTime: new Date()
      });

      // Initiate call
      await this.makeCall(lead, salesperson);

    } catch (error) {
      console.error('❌ Error processing call queue:', error);
    }
  }

  // Find available salesperson
  async findAvailableSalesperson() {
    try {
      const salesperson = await User.findOne({
        role: 'salesperson',
        isAvailable: true,
        isActive: true
      }).sort({ 
        // Prioritize salespeople with fewer active calls
        'callStats.totalCalls': 1,
        'lastLogin': -1
      });

      return salesperson;
    } catch (error) {
      console.error('Error finding available salesperson:', error);
      return null;
    }
  }

  // Make a call to a lead
  async makeCall(lead, salesperson) {
    try {
      console.log(`📞 Making call to ${lead.phone} (${lead.name || 'Unknown'})`);

      // Update lead status
      lead.status = 'calling';
      lead.assignedTo = salesperson._id;
      await lead.save();

      // Create call log
      const CallLog = require('../models/CallLog');
      const callLog = new CallLog({
        lead: lead._id,
        salesperson: salesperson._id,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: lead.phone,
        status: 'initiated'
      });

      await callLog.save();

      // Initiate call via Twilio
      const callResult = await initiateCall(lead.phone, salesperson.phone, callLog._id);

      if (callResult.success) {
        // Update call log with Twilio call SID
        callLog.twilioCallSid = callResult.callSid;
        await callLog.save();

        // Emit real-time update
        emitCallUpdate('call_initiated', {
          leadId: lead._id,
          salespersonId: salesperson._id,
          callId: callLog._id,
          status: 'initiated',
          phone: lead.phone
        });

        console.log(`✅ Call initiated successfully to ${lead.phone}`);
      } else {
        // Handle call failure
        await this.handleCallFailure(lead, callLog, callResult.error);
      }

    } catch (error) {
      console.error(`❌ Error making call to ${lead.phone}:`, error);
      await this.handleCallFailure(lead, null, error.message);
    }
  }

  // Handle call failure
  async handleCallFailure(lead, callLog, error) {
    try {
      // Reset lead status
      lead.status = 'pending';
      lead.assignedTo = undefined;
      await lead.save();

      // Update call log if it exists
      if (callLog) {
        callLog.status = 'failed';
        callLog.errorMessage = error;
        await callLog.save();
      }

      // Remove from active calls
      this.activeCalls.delete(lead._id.toString());

      console.log(`❌ Call failed for ${lead.phone}: ${error}`);

    } catch (error) {
      console.error('Error handling call failure:', error);
    }
  }

  // Handle call completion
  async handleCallCompletion(callLogId, status) {
    try {
      const CallLog = require('../models/CallLog');
      const callLog = await CallLog.findById(callLogId);
      
      if (!callLog) {
        console.error('Call log not found for completion:', callLogId);
        return;
      }

      // Remove from active calls
      this.activeCalls.delete(callLog.lead.toString());

      // Update lead status based on call result
      const lead = await Lead.findById(callLog.lead);
      if (lead) {
        if (status === 'answered') {
          lead.status = 'answered';
        } else if (status === 'completed') {
          lead.status = 'transferred';
        } else if (['busy', 'no-answer', 'failed'].includes(status)) {
          await lead.updateCallStatus(status);
        }
      }

      // Update salesperson stats
      const salesperson = await User.findById(callLog.salesperson);
      if (salesperson) {
        salesperson.callStats.totalCalls += 1;
        if (status === 'completed') {
          salesperson.callStats.successfulCalls += 1;
        }
        await salesperson.save();
      }

      console.log(`✅ Call ${callLogId} completed with status: ${status}`);

    } catch (error) {
      console.error('Error handling call completion:', error);
    }
  }

  // Reset stuck leads (leads stuck in 'calling' status)
  async resetStuckLeads() {
    try {
      const stuckLeads = await Lead.find({
        status: 'calling',
        updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes ago
      });

      if (stuckLeads.length > 0) {
        console.log(`🔄 Resetting ${stuckLeads.length} stuck leads...`);
        
        for (const lead of stuckLeads) {
          lead.status = 'pending';
          lead.assignedTo = undefined;
          await lead.save();
        }

        console.log(`✅ Reset ${stuckLeads.length} stuck leads`);
      }
    } catch (error) {
      console.error('Error resetting stuck leads:', error);
    }
  }

  // Get queue status
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeCalls: this.activeCalls.size,
      maxConcurrentCalls: this.maxConcurrentCalls,
      callDelay: this.callDelay,
      callTimeout: this.callTimeout
    };
  }

  // Get active calls details
  getActiveCalls() {
    return Array.from(this.activeCalls.entries()).map(([leadId, callInfo]) => ({
      leadId,
      salespersonId: callInfo.salespersonId,
      startTime: callInfo.startTime,
      duration: Date.now() - callInfo.startTime.getTime()
    }));
  }

  // Manually add lead to queue
  async addToQueue(leadId, priority = 'normal') {
    try {
      const lead = await Lead.findById(leadId);
      if (!lead) {
        throw new Error('Lead not found');
      }

      if (lead.status !== 'pending') {
        throw new Error('Lead is not in pending status');
      }

      // Set priority-based next call time
      const now = new Date();
      let nextCallTime;

      switch (priority) {
        case 'high':
          nextCallTime = now;
          break;
        case 'urgent':
          nextCallTime = now;
          break;
        case 'normal':
          nextCallTime = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes
          break;
        case 'low':
          nextCallTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
          break;
        default:
          nextCallTime = now;
      }

      lead.nextCallTime = nextCallTime;
      await lead.save();

      console.log(`📋 Lead ${leadId} added to queue with priority: ${priority}`);

      return { success: true, nextCallTime };

    } catch (error) {
      console.error('Error adding lead to queue:', error);
      return { success: false, error: error.message };
    }
  }

  // Pause queue processing
  pause() {
    if (this.isRunning) {
      this.stop();
      console.log('⏸️ Call queue paused');
    }
  }

  // Resume queue processing
  resume() {
    if (!this.isRunning) {
      this.start();
      console.log('▶️ Call queue resumed');
    }
  }
}

// Create singleton instance
const callQueue = new CallQueue();

// Initialize function
const initializeCallQueue = async () => {
  await callQueue.initialize();
};

module.exports = {
  callQueue,
  initializeCallQueue
}; 
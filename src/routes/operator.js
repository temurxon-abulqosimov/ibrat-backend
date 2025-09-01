const express = require('express');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const User = require('../models/User');
const { authenticateToken, requireSalesperson } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validation');

const router = express.Router();

// All routes require salesperson authentication
router.use(authenticateToken, requireSalesperson);

// @route   GET /api/operator/dashboard
// @desc    Get operator dashboard overview
// @access  Private (Salesperson only)
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user._id;

    // Get operator's personal statistics
    const personalStats = await CallLog.aggregate([
      { $match: { salesperson: userId } },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          todayCalls: { $sum: { $cond: [{ $gte: ['$createdAt', new Date(new Date().setHours(0, 0, 0, 0))] }, 1, 0] } },
          answeredCalls: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
          completedCalls: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          totalDuration: { $sum: '$duration' },
          averageDuration: { $avg: '$duration' }
        }
      }
    ]);

    // Get operator's assigned leads
    const assignedLeads = await Lead.find({
      assignedTo: userId,
      isActive: true
    }).sort({ priority: 1, createdAt: 1 }).limit(10);

    // Get operator's recent calls
    const recentCalls = await CallLog.find({ salesperson: userId })
      .populate('lead', 'phone name priority')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get available leads for calling
    const availableLeads = await Lead.find({
      status: 'pending',
      isActive: true,
      $or: [
        { assignedTo: { $exists: false } },
        { assignedTo: null }
      ]
    }).sort({ priority: 1, createdAt: 1 }).limit(5);

    // Get operator's performance ranking
    const performanceRanking = await CallLog.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'salesperson',
          foreignField: '_id',
          as: 'salesperson'
        }
      },
      { $unwind: '$salesperson' },
      { $match: { 'salesperson.role': 'salesperson', 'salesperson.isActive': true } },
      {
        $group: {
          _id: '$salesperson._id',
          name: { $first: '$salesperson.name' },
          totalCalls: { $sum: 1 },
          completedCalls: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          totalDuration: { $sum: '$duration' }
        }
      },
      {
        $addFields: {
          successRate: { $divide: ['$completedCalls', '$totalCalls'] }
        }
      },
      { $sort: { successRate: -1, totalCalls: -1 } }
    ]);

    // Find operator's position in ranking
    const operatorRank = performanceRanking.findIndex(rank => rank._id.toString() === userId.toString()) + 1;

    res.json({
      dashboard: {
        personalStats: personalStats[0] || {
          totalCalls: 0,
          todayCalls: 0,
          answeredCalls: 0,
          completedCalls: 0,
          totalDuration: 0,
          averageDuration: 0
        },
        assignedLeads,
        recentCalls,
        availableLeads,
        performanceRanking: performanceRanking.slice(0, 10), // Top 10
        operatorRank: operatorRank || 'Not ranked'
      }
    });

  } catch (error) {
    console.error('Operator dashboard error:', error);
    res.status(500).json({
      error: 'Error fetching operator dashboard',
      message: error.message
    });
  }
});

// @route   GET /api/operator/leads/available
// @desc    Get leads available for calling
// @access  Private (Salesperson only)
router.get('/leads/available', validateQuery('pagination'), async (req, res) => {
  try {
    const { page = 1, limit = 20, priority, search } = req.query;
    
    const query = {
      status: 'pending',
      isActive: true,
      $or: [
        { assignedTo: { $exists: false } },
        { assignedTo: null }
      ]
    };
    
    // Add filters
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { phone: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { priority: 1, createdAt: 1 }; // Priority first, then creation date

    const leads = await Lead.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Lead.countDocuments(query);

    res.json({
      leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get available leads error:', error);
    res.status(500).json({
      error: 'Error fetching available leads',
      message: error.message
    });
  }
});

// @route   POST /api/operator/leads/claim
// @desc    Claim a lead for calling
// @access  Private (Salesperson only)
router.post('/leads/claim', async (req, res) => {
  try {
    const { leadId } = req.body;
    const userId = req.user._id;

    if (!leadId) {
      return res.status(400).json({
        error: 'Lead ID is required'
      });
    }

    // Find the lead
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({
        error: 'Lead not found'
      });
    }

    if (!lead.isActive) {
      return res.status(400).json({
        error: 'Lead is not active'
      });
    }

    if (lead.status !== 'pending') {
      return res.status(400).json({
        error: 'Lead is not available for claiming'
      });
    }

    if (lead.assignedTo) {
      return res.status(400).json({
        error: 'Lead is already assigned to another operator'
      });
    }

    // Claim the lead
    lead.assignedTo = userId;
    lead.status = 'claimed';
    await lead.save();

    res.json({
      message: 'Lead claimed successfully',
      lead: {
        id: lead._id,
        phone: lead.phone,
        name: lead.name,
        priority: lead.priority,
        status: lead.status
      }
    });

  } catch (error) {
    console.error('Claim lead error:', error);
    res.status(500).json({
      error: 'Error claiming lead',
      message: error.message
    });
  }
});

// @route   POST /api/operator/calls/start
// @desc    Start a call to a lead
// @access  Private (Salesperson only)
router.post('/calls/start', validate('initiateCall'), async (req, res) => {
  try {
    const { leadId } = req.body;
    const userId = req.user._id;

    // Find the lead
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({
        error: 'Lead not found'
      });
    }

    if (!lead.isActive) {
      return res.status(400).json({
        error: 'Lead is not active'
      });
    }

    if (lead.assignedTo && lead.assignedTo.toString() !== userId.toString()) {
      return res.status(400).json({
        error: 'Lead is assigned to another operator'
      });
    }

    if (lead.status === 'calling') {
      return res.status(400).json({
        error: 'Call already in progress for this lead'
      });
    }

    // Update lead status
    lead.status = 'calling';
    lead.assignedTo = userId;
    await lead.save();

    // Create call log
    const CallLog = require('../models/CallLog');
    const callLog = new CallLog({
      lead: lead._id,
      salesperson: userId,
      from: process.env.TWILIO_PHONE_NUMBER || '+1234567890',
      to: lead.phone,
      status: 'initiated'
    });

    await callLog.save();

    // Initiate call via Twilio service
    const { initiateCall } = require('../src/services/twilioService');
    const callResult = await initiateCall(lead.phone, req.user.phone, callLog._id);

    if (callResult.success) {
      // Update call log with Twilio call SID
      callLog.twilioCallSid = callResult.callSid;
      await callLog.save();

      // Emit real-time update
      const { emitCallUpdate } = require('../src/services/socketHandler');
      emitCallUpdate('call_initiated', {
        leadId: lead._id,
        salespersonId: userId,
        callId: callLog._id,
        status: 'initiated'
      });

      res.json({
        message: 'Call started successfully',
        call: {
          id: callLog._id,
          lead: lead.phone,
          status: 'initiated',
          twilioCallSid: callResult.callSid
        }
      });
    } else {
      // Revert lead status on failure
      lead.status = 'pending';
      lead.assignedTo = undefined;
      await lead.save();

      // Update call log
      callLog.status = 'failed';
      callLog.errorMessage = callResult.error;
      await callLog.save();

      res.status(500).json({
        error: 'Failed to start call',
        details: callResult.error
      });
    }

  } catch (error) {
    console.error('Start call error:', error);
    res.status(500).json({
      error: 'Error starting call',
      message: error.message
    });
  }
});

// @route   PUT /api/operator/calls/:id/update
// @desc    Update call status and notes
// @access  Private (Salesperson only)
router.put('/calls/:id/update', async (req, res) => {
  try {
    const { status, notes, duration } = req.body;
    const callId = req.params.id;
    const userId = req.user._id;

    // Find the call log
    const callLog = await CallLog.findById(callId);
    if (!callLog) {
      return res.status(404).json({
        error: 'Call log not found'
      });
    }

    // Verify the call belongs to this operator
    if (callLog.salesperson.toString() !== userId.toString()) {
      return res.status(403).json({
        error: 'Access denied. This call does not belong to you.'
      });
    }

    // Update call status
    await callLog.updateStatus(status, { duration, notes });

    // Update lead status if needed
    const lead = await Lead.findById(callLog.lead);
    if (lead) {
      if (status === 'answered') {
        lead.status = 'answered';
      } else if (status === 'completed') {
        lead.status = 'transferred';
      } else if (['busy', 'no-answer', 'failed'].includes(status)) {
        await lead.updateCallStatus(status, duration);
      }
    }

    // Emit real-time update
    const { emitCallUpdate } = require('../src/services/socketHandler');
    emitCallUpdate('call_status_updated', {
      callId: callLog._id,
      status: status,
      leadId: callLog.lead,
      salespersonId: userId
    });

    res.json({
      message: 'Call updated successfully',
      call: callLog
    });

  } catch (error) {
    console.error('Update call error:', error);
    res.status(500).json({
      error: 'Error updating call',
      message: error.message
    });
  }
});

// @route   GET /api/operator/calls/history
// @desc    Get operator's call history
// @access  Private (Salesperson only)
router.get('/calls/history', validateQuery('pagination'), async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;
    
    const query = { salesperson: userId };
    
    // Add filters
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const sort = { createdAt: -1 };

    const calls = await CallLog.find(query)
      .populate('lead', 'phone name priority')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await CallLog.countDocuments(query);

    res.json({
      calls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({
      error: 'Error fetching call history',
      message: error.message
    });
  }
});

// @route   PUT /api/operator/profile/availability
// @desc    Update operator availability status
// @access  Private (Salesperson only)
router.put('/profile/availability', async (req, res) => {
  try {
    const { isAvailable } = req.body;
    const userId = req.user._id;

    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({
        error: 'isAvailable must be a boolean value'
      });
    }

    // Update user availability
    await User.findByIdAndUpdate(userId, { isAvailable });

    // Emit real-time update
    const { emitCallUpdate } = require('../src/services/socketHandler');
    emitCallUpdate('user_availability_changed', {
      userId: userId,
      isAvailable: isAvailable,
      name: req.user.name
    });

    res.json({
      message: 'Availability updated successfully',
      isAvailable: isAvailable
    });

  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({
      error: 'Error updating availability',
      message: error.message
    });
  }
});

// @route   GET /api/operator/profile/performance
// @desc    Get operator's performance metrics
// @access  Private (Salesperson only)
router.get('/profile/performance', validateQuery('dateRange'), async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;
    
    const matchStage = { salesperson: userId };
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    // Performance metrics
    const performance = await CallLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          answeredCalls: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
          completedCalls: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          totalDuration: { $sum: '$duration' },
          averageDuration: { $avg: '$duration' }
        }
      }
    ]);

    // Daily performance breakdown
    const dailyPerformance = await CallLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          calls: { $sum: 1 },
          answered: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          duration: { $sum: '$duration' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    // Lead conversion by priority
    const leadConversion = await CallLog.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'leads',
          localField: 'lead',
          foreignField: '_id',
          as: 'lead'
        }
      },
      { $unwind: '$lead' },
      {
        $group: {
          _id: '$lead.priority',
          totalCalls: { $sum: 1 },
          answeredCalls: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
          completedCalls: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      performance: performance[0] || {
        totalCalls: 0,
        answeredCalls: 0,
        completedCalls: 0,
        totalDuration: 0,
        averageDuration: 0
      },
      dailyPerformance,
      leadConversion
    });

  } catch (error) {
    console.error('Performance metrics error:', error);
    res.status(500).json({
      error: 'Error fetching performance metrics',
      message: error.message
    });
  }
});

module.exports = router; 
const express = require('express');
const CallLog = require('../models/CallLog');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { authenticateToken, requireSalesperson } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validation');
const { initiateCall, handleCallStatusUpdate } = require('../services/twilioService');
const { emitCallUpdate } = require('../services/socketHandler');

const router = express.Router();

// @route   POST /api/calls/initiate
// @desc    Initiate a call to a lead
// @access  Private (Salesperson/Admin)
router.post('/initiate', 
  authenticateToken, 
  requireSalesperson,
  validate('initiateCall'),
  async (req, res) => {
    try {
      const { leadId, salespersonId } = req.body;
      
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

      if (lead.status === 'calling') {
        return res.status(400).json({
          error: 'Call already in progress for this lead'
        });
      }

      // Find available salesperson
      let salesperson;
      if (salespersonId) {
        salesperson = await User.findById(salespersonId);
        if (!salesperson || !salesperson.isAvailable || salesperson.role !== 'salesperson') {
          return res.status(400).json({
            error: 'Specified salesperson is not available'
          });
        }
      } else {
        // Find first available salesperson
        salesperson = await User.findOne({
          role: 'salesperson',
          isAvailable: true,
          isActive: true
        });

        if (!salesperson) {
          return res.status(400).json({
            error: 'No available salesperson found'
          });
        }
      }

      // Update lead status
      lead.status = 'calling';
      lead.assignedTo = salesperson._id;
      await lead.save();

      // Create call log
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
          status: 'initiated'
        });

        res.json({
          message: 'Call initiated successfully',
          call: {
            id: callLog._id,
            lead: lead.phone,
            salesperson: salesperson.name,
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
          error: 'Failed to initiate call',
          details: callResult.error
        });
      }

    } catch (error) {
      console.error('Initiate call error:', error);
      res.status(500).json({
        error: 'Error initiating call',
        message: error.message
      });
    }
  }
);

// @route   POST /api/calls/webhook/status
// @desc    Twilio webhook for call status updates
// @access  Public (Twilio webhook)
router.post('/webhook/status', async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, From, To } = req.body;

    // Find call log by Twilio call SID
    const callLog = await CallLog.findOne({ twilioCallSid: CallSid });
    if (!callLog) {
      console.error('Call log not found for Twilio SID:', CallSid);
      return res.status(404).send('Call log not found');
    }

    // Update call status
    await handleCallStatusUpdate(callLog, CallStatus, CallDuration);

    // Send Twilio response
    res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook status update error:', error);
    res.status(500).send('Internal server error');
  }
});

// @route   POST /api/calls/webhook/answer
// @desc    Twilio webhook for when call is answered
// @access  Public (Twilio webhook)
router.post('/webhook/answer', async (req, res) => {
  try {
    const { CallSid, From, To } = req.body;

    // Find call log by Twilio call SID
    const callLog = await CallLog.findOne({ twilioCallSid: CallSid });
    if (!callLog) {
      console.error('Call log not found for Twilio SID:', CallSid);
      return res.status(404).send('Call log not found');
    }

    // Update call status to answered
    await callLog.updateStatus('answered');

    // Update lead status
    const lead = await Lead.findById(callLog.lead);
    if (lead) {
      lead.status = 'answered';
      await lead.save();
    }

    // Emit real-time update
    emitCallUpdate('call_answered', {
      leadId: callLog.lead,
      salespersonId: callLog.salesperson,
      callId: callLog._id,
      status: 'answered'
    });

    // Return TwiML to transfer call to salesperson
    const salesperson = await User.findById(callLog.salesperson);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you to our sales representative.</Say>
  <Dial>${salesperson.phone}</Dial>
</Response>`;

    res.type('text/xml');
    res.send(twiml);

  } catch (error) {
    console.error('Webhook answer error:', error);
    res.status(500).send('Internal server error');
  }
});

// @route   GET /api/calls
// @desc    Get call history with pagination
// @access  Private (Salesperson/Admin)
router.get('/', 
  authenticateToken, 
  requireSalesperson,
  validateQuery('pagination'),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, status, salespersonId, leadId } = req.query;
      
      const query = {};
      
      // Add filters
      if (status) query.status = status;
      if (salespersonId) query.salesperson = salespersonId;
      if (leadId) query.lead = leadId;

      const skip = (page - 1) * limit;
      const sort = { createdAt: -1 };

      const calls = await CallLog.find(query)
        .populate('lead', 'phone name')
        .populate('salesperson', 'name email')
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
      console.error('Get calls error:', error);
      res.status(500).json({
        error: 'Error fetching calls',
        message: error.message
      });
    }
  }
);

// @route   GET /api/calls/:id
// @desc    Get call details by ID
// @access  Private (Salesperson/Admin)
router.get('/:id', 
  authenticateToken, 
  requireSalesperson,
  async (req, res) => {
    try {
      const call = await CallLog.findById(req.params.id)
        .populate('lead', 'phone name email priority')
        .populate('salesperson', 'name email phone');

      if (!call) {
        return res.status(404).json({
          error: 'Call not found'
        });
      }

      res.json({ call });

    } catch (error) {
      console.error('Get call error:', error);
      res.status(500).json({
        error: 'Error fetching call',
        message: error.message
      });
    }
  }
);

// @route   PUT /api/calls/:id/status
// @desc    Update call status manually
// @access  Private (Salesperson/Admin)
router.put('/:id/status', 
  authenticateToken, 
  requireSalesperson,
  validate('updateCallStatus'),
  async (req, res) => {
    try {
      const { status, duration, notes, errorCode, errorMessage } = req.body;
      
      const call = await CallLog.findById(req.params.id);
      if (!call) {
        return res.status(404).json({
          error: 'Call not found'
        });
      }

      // Update call status
      await call.updateStatus(status, { duration, notes, errorCode, errorMessage });

      // Update lead status if needed
      if (status === 'answered' || status === 'completed') {
        const lead = await Lead.findById(call.lead);
        if (lead) {
          if (status === 'answered') {
            lead.status = 'answered';
          } else if (status === 'completed') {
            lead.status = 'transferred';
          }
          await lead.save();
        }
      }

      // Emit real-time update
      emitCallUpdate('call_status_updated', {
        callId: call._id,
        status: status,
        leadId: call.lead,
        salespersonId: call.salesperson
      });

      res.json({
        message: 'Call status updated successfully',
        call
      });

    } catch (error) {
      console.error('Update call status error:', error);
      res.status(500).json({
        error: 'Error updating call status',
        message: error.message
      });
    }
  }
);

// @route   GET /api/calls/stats/summary
// @desc    Get call statistics summary
// @access  Private (Salesperson/Admin)
router.get('/stats/summary', 
  authenticateToken, 
  requireSalesperson,
  async (req, res) => {
    try {
      const { startDate, endDate, salespersonId } = req.query;
      
      const filters = {};
      if (startDate || endDate) {
        filters.createdAt = {};
        if (startDate) filters.createdAt.$gte = new Date(startDate);
        if (endDate) filters.createdAt.$lte = new Date(endDate);
      }
      if (salespersonId) filters.salesperson = salespersonId;

      const stats = await CallLog.getCallStats(filters);
      const recentCalls = await CallLog.getRecentCalls(10);

      res.json({
        summary: stats[0] || {
          totalCalls: 0,
          answeredCalls: 0,
          completedCalls: 0,
          totalDuration: 0,
          averageDuration: 0,
          totalCost: 0
        },
        recentCalls
      });

    } catch (error) {
      console.error('Get call stats error:', error);
      res.status(500).json({
        error: 'Error fetching call statistics',
        message: error.message
      });
    }
  }
);

module.exports = router; 
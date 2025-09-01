const express = require('express');
const User = require('../models/User');
const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validation');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateToken, requireAdmin);

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard overview
// @access  Private (Admin only)
router.get('/dashboard', async (req, res) => {
  try {
    // Get real-time system statistics
    const [
      userStats,
      leadStats,
      callStats,
      recentActivity
    ] = await Promise.all([
      // User statistics
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
            availableSalespeople: { $sum: { $cond: [{ $and: ['$isActive', '$isAvailable', { $eq: ['$role', 'salesperson'] }] }, 1, 0] } },
            totalAdmins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } }
          }
        }
      ]),
      
      // Lead statistics
      Lead.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalLeads: { $sum: 1 },
            pendingLeads: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            callingLeads: { $sum: { $cond: [{ $eq: ['$status', 'calling'] }, 1, 0] } },
            answeredLeads: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
            transferredLeads: { $sum: { $cond: [{ $eq: ['$status', 'transferred'] }, 1, 0] } },
            failedLeads: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
          }
        }
      ]),
      
      // Call statistics
      CallLog.aggregate([
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
      ]),
      
      // Recent activity (last 10 actions)
      CallLog.find()
        .populate('lead', 'phone name')
        .populate('salesperson', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
    ]);

    // Get priority breakdown
    const priorityStats = await Lead.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get salesperson performance
    const salespersonPerformance = await User.aggregate([
      { $match: { role: 'salesperson', isActive: true } },
      {
        $project: {
          name: 1,
          email: 1,
          isAvailable: 1,
          lastLogin: 1,
          callStats: 1,
          totalCalls: '$callStats.totalCalls',
          successfulCalls: '$callStats.successfulCalls',
          totalDuration: '$callStats.totalDuration'
        }
      },
      { $sort: { totalCalls: -1 } }
    ]);

    res.json({
      dashboard: {
        userStats: userStats[0] || {
          totalUsers: 0,
          activeUsers: 0,
          availableSalespeople: 0,
          totalAdmins: 0
        },
        leadStats: leadStats[0] || {
          totalLeads: 0,
          pendingLeads: 0,
          callingLeads: 0,
          answeredLeads: 0,
          transferredLeads: 0,
          failedLeads: 0
        },
        callStats: callStats[0] || {
          totalCalls: 0,
          todayCalls: 0,
          answeredCalls: 0,
          completedCalls: 0,
          totalDuration: 0,
          averageDuration: 0
        },
        priorityBreakdown: priorityStats,
        salespersonPerformance,
        recentActivity
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      error: 'Error fetching dashboard data',
      message: error.message
    });
  }
});

// @route   GET /api/admin/system-status
// @desc    Get real-time system status
// @access  Private (Admin only)
router.get('/system-status', async (req, res) => {
  try {
    const { callQueue } = require('../src/services/callQueue');
    
    const systemStatus = {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      callQueue: callQueue.getStatus(),
      activeConnections: require('../src/services/socketHandler').getConnectedUsersCount(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({ systemStatus });

  } catch (error) {
    console.error('System status error:', error);
    res.status(500).json({
      error: 'Error fetching system status',
      message: error.message
    });
  }
});

// @route   POST /api/admin/leads/bulk-action
// @desc    Perform bulk actions on leads
// @access  Private (Admin only)
router.post('/leads/bulk-action', async (req, res) => {
  try {
    const { action, leadIds, data } = req.body;

    if (!action || !leadIds || !Array.isArray(leadIds)) {
      return res.status(400).json({
        error: 'Invalid request: action and leadIds array required'
      });
    }

    let result;
    switch (action) {
      case 'update_priority':
        result = await Lead.updateMany(
          { _id: { $in: leadIds } },
          { priority: data.priority }
        );
        break;
        
      case 'update_status':
        result = await Lead.updateMany(
          { _id: { $in: leadIds } },
          { status: data.status }
        );
        break;
        
      case 'add_tags':
        result = await Lead.updateMany(
          { _id: { $in: leadIds } },
          { $addToSet: { tags: { $each: data.tags } } }
        );
        break;
        
      case 'delete':
        result = await Lead.updateMany(
          { _id: { $in: leadIds } },
          { isActive: false }
        );
        break;
        
      default:
        return res.status(400).json({
          error: 'Invalid action specified'
        });
    }

    res.json({
      message: `Bulk action '${action}' completed successfully`,
      modifiedCount: result.modifiedCount,
      leadIds
    });

  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({
      error: 'Error performing bulk action',
      message: error.message
    });
  }
});

// @route   GET /api/admin/reports/performance
// @desc    Get performance reports
// @access  Private (Admin only)
router.get('/reports/performance', validateQuery('dateRange'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    // Salesperson performance
    const salespersonStats = await CallLog.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'salesperson',
          foreignField: '_id',
          as: 'salesperson'
        }
      },
      { $unwind: '$salesperson' },
      {
        $group: {
          _id: '$salesperson._id',
          name: { $first: '$salesperson.name' },
          email: { $first: '$salesperson.email' },
          totalCalls: { $sum: 1 },
          answeredCalls: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
          completedCalls: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          totalDuration: { $sum: '$duration' },
          averageDuration: { $avg: '$duration' }
        }
      },
      { $sort: { totalCalls: -1 } }
    ]);

    // Lead conversion rates
    const leadConversion = await Lead.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Daily call volume
    const dailyCalls = await CallLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          totalCalls: { $sum: 1 },
          answeredCalls: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    res.json({
      performance: {
        salespersonStats,
        leadConversion,
        dailyCalls
      }
    });

  } catch (error) {
    console.error('Performance report error:', error);
    res.status(500).json({
      error: 'Error generating performance report',
      message: error.message
    });
  }
});

// @route   POST /api/admin/system/control
// @desc    Control system operations
// @access  Private (Admin only)
router.post('/system/control', async (req, res) => {
  try {
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({
        error: 'Action parameter required'
      });
    }

    const { callQueue } = require('../src/services/callQueue');
    let result;

    switch (action) {
      case 'pause_queue':
        callQueue.pause();
        result = { message: 'Call queue paused', status: 'paused' };
        break;
        
      case 'resume_queue':
        callQueue.resume();
        result = { message: 'Call queue resumed', status: 'running' };
        break;
        
      case 'reset_stuck_leads':
        await callQueue.resetStuckLeads();
        result = { message: 'Stuck leads reset completed' };
        break;
        
      case 'get_queue_status':
        result = { 
          message: 'Queue status retrieved',
          status: callQueue.getStatus(),
          activeCalls: callQueue.getActiveCalls()
        };
        break;
        
      default:
        return res.status(400).json({
          error: 'Invalid action specified'
        });
    }

    res.json(result);

  } catch (error) {
    console.error('System control error:', error);
    res.status(500).json({
      error: 'Error performing system action',
      message: error.message
    });
  }
});

module.exports = router; 
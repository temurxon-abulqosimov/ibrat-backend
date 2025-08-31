const express = require('express');
const User = require('../models/User');
const { authenticateToken, requireAdmin, requireSalesperson } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users with pagination
// @access  Private (Admin only)
router.get('/', 
  authenticateToken, 
  requireAdmin,
  async (req, res) => {
    try {
      const { page = 1, limit = 20, role, isActive, search } = req.query;
      
      const query = {};

      
      
      // Add filters
      if (role) query.role = role;
      if (isActive !== undefined) query.isActive = isActive === 'true';
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;
      const sort = { createdAt: -1 };

      const users = await User.find(query)
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      const total = await User.countDocuments(query);

      res.json({
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        error: 'Error fetching users',
        message: error.message
      });
    }
  }
);

// @route   GET /api/users/available-salespeople
// @desc    Get all available salespeople
// @access  Private (Salesperson/Admin)
router.get('/available-salespeople', 
  authenticateToken, 
  requireSalesperson,
  async (req, res) => {
    try {
      const salespeople = await User.find({
        role: 'salesperson',
        isAvailable: true,
        isActive: true
      }).select('name email phone isAvailable');

      res.json({ salespeople });

    } catch (error) {
      console.error('Get available salespeople error:', error);
      res.status(500).json({
        error: 'Error fetching available salespeople',
        message: error.message
      });
    }
  }
);

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private (Admin or own profile)
router.get('/:id', 
  authenticateToken, 
  async (req, res) => {
    try {
      // Users can only view their own profile unless they're admin
      if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
        return res.status(403).json({
          error: 'Access denied. You can only view your own profile.'
        });
      }

      const user = await User.findById(req.params.id).select('-password');
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      res.json({ user });

    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        error: 'Error fetching user',
        message: error.message
      });
    }
  }
);

// @route   PUT /api/users/:id
// @desc    Update user profile
// @access  Private (Admin or own profile)
router.put('/:id', 
  authenticateToken, 
  validate('updateUser'),
  async (req, res) => {
    try {
      // Users can only update their own profile unless they're admin
      if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
        return res.status(403).json({
          error: 'Access denied. You can only update your own profile.'
        });
      }

      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Update fields
      Object.keys(req.body).forEach(key => {
        if (user.schema.paths[key] && key !== 'role') { // Prevent role change
          user[key] = req.body[key];
        }
      });

      await user.save();

      // Return updated user without password
      const updatedUser = user.toObject();
      delete updatedUser.password;

      res.json({
        message: 'User updated successfully',
        user: updatedUser
      });

    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        error: 'Error updating user',
        message: error.message
      });
    }
  }
);

// @route   PUT /api/users/:id/availability
// @desc    Update user availability status
// @access  Private (Admin or own profile)
router.put('/:id/availability', 
  authenticateToken, 
  async (req, res) => {
    try {
      const { isAvailable } = req.body;

      // Users can only update their own availability unless they're admin
      if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
        return res.status(403).json({
          error: 'Access denied. You can only update your own availability.'
        });
      }

      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      user.isAvailable = isAvailable;
      await user.save();

      res.json({
        message: 'Availability updated successfully',
        isAvailable: user.isAvailable
      });

    } catch (error) {
      console.error('Update availability error:', error);
      res.status(500).json({
        error: 'Error updating availability',
        message: error.message
      });
    }
  }
);

// @route   PUT /api/users/:id/activate
// @desc    Activate/deactivate user
// @access  Private (Admin only)
router.put('/:id/activate', 
  authenticateToken, 
  requireAdmin,
  async (req, res) => {
    try {
      const { isActive } = req.body;

      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Prevent deactivating the last admin
      if (user.role === 'admin' && !isActive) {
        const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
        if (adminCount <= 1) {
          return res.status(400).json({
            error: 'Cannot deactivate the last admin user'
          });
        }
      }

      user.isActive = isActive;
      if (!isActive) {
        user.isAvailable = false; // Deactivated users are not available
      }
      
      await user.save();

      res.json({
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        isActive: user.isActive
      });

    } catch (error) {
      console.error('Update user activation error:', error);
      res.status(500).json({
        error: 'Error updating user activation',
        message: error.message
      });
    }
  }
);

// @route   DELETE /api/users/:id
// @desc    Delete user (soft delete)
// @access  Private (Admin only)
router.delete('/:id', 
  authenticateToken, 
  requireAdmin,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Prevent deleting the last admin
      if (user.role === 'admin') {
        const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
        if (adminCount <= 1) {
          return res.status(400).json({
            error: 'Cannot delete the last admin user'
          });
        }
      }

      // Soft delete
      user.isActive = false;
      user.isAvailable = false;
      await user.save();

      res.json({
        message: 'User deleted successfully'
      });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        error: 'Error deleting user',
        message: error.message
      });
    }
  }
);

// @route   GET /api/users/stats/summary
// @desc    Get user statistics summary
// @access  Private (Admin only)
router.get('/stats/summary', 
  authenticateToken, 
  requireAdmin,
  async (req, res) => {
    try {
      const stats = await User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
            availableSalespeople: { $sum: { $cond: [{ $and: ['$isActive', '$isAvailable', { $eq: ['$role', 'salesperson'] }] }, 1, 0] } },
            totalAdmins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
            totalSalespeople: { $sum: { $cond: [{ $eq: ['$role', 'salesperson'] }, 1, 0] } }
          }
        }
      ]);

      const recentUsers = await User.find()
        .select('name email role isActive isAvailable lastLogin')
        .sort({ createdAt: -1 })
        .limit(10);

      res.json({
        summary: stats[0] || {
          totalUsers: 0,
          activeUsers: 0,
          availableSalespeople: 0,
          totalAdmins: 0,
          totalSalespeople: 0
        },
        recentUsers
      });

    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({
        error: 'Error fetching user statistics',
        message: error.message
      });
    }
  }
);

module.exports = router; 
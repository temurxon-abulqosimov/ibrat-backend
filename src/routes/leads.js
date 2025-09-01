const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Lead = require('../models/Lead');
const { authenticateToken, requireAdmin, requireSalesperson } = require('../middleware/auth');
const { validate, validateQuery, validateFileUpload } = require('../middleware/validation');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'leads-' + uniqueSuffix + '.csv');
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  }
});

// @route   POST /api/leads/upload-csv
// @desc    Upload leads from CSV file
// @access  Private (Admin only)
router.post('/upload-csv', 
  authenticateToken, 
  requireAdmin, 
  upload.single('csvFile'), 
  validateFileUpload,
  async (req, res) => {
    try {
      const filePath = req.file.path;
      const results = [];
      const errors = [];
      let successCount = 0;
      let duplicateCount = 0;

      // Read and parse CSV file
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          // Validate phone number
          const phone = data.phone || data.Phone || data.PHONE || data.telephone || data.Telephone;
          if (phone && /^\+?[\d\s\-\(\)]+$/.test(phone)) {
            results.push({
              phone: phone.trim(),
              name: data.name || data.Name || data.NAME || data.fullname || data.Fullname || '',
              email: data.email || data.Email || data.EMAIL || '',
              priority: data.priority || data.Priority || data.PRIORITY || 'medium',
              notes: data.notes || data.Notes || data.NOTES || data.comment || data.Comment || '',
              tags: data.tags || data.Tags || data.TAGS ? data.tags.split(',').map(tag => tag.trim()) : []
            });
          } else {
            errors.push(`Invalid phone number: ${phone}`);
          }
        })
        .on('end', async () => {
          try {
            // Process leads in batches
            const batchSize = 100;
            for (let i = 0; i < results.length; i += batchSize) {
              const batch = results.slice(i, i + batchSize);
              
              for (const leadData of batch) {
                try {
                  // Check for duplicates
                  const existingLead = await Lead.findOne({ phone: leadData.phone });
                  if (existingLead) {
                    duplicateCount++;
                    continue;
                  }

                  // Create new lead
                  const lead = new Lead(leadData);
                  await lead.save();
                  successCount++;
                } catch (error) {
                  errors.push(`Error saving lead ${leadData.phone}: ${error.message}`);
                }
              }
            }

            // Clean up uploaded file
            fs.unlinkSync(filePath);

            res.json({
              message: 'CSV upload completed',
              summary: {
                totalProcessed: results.length,
                successCount,
                duplicateCount,
                errorCount: errors.length
              },
              errors: errors.length > 0 ? errors : undefined
            });

          } catch (error) {
            console.error('CSV processing error:', error);
            res.status(500).json({
              error: 'Error processing CSV file',
              message: error.message
            });
          }
        })
        .on('error', (error) => {
          console.error('CSV reading error:', error);
          res.status(500).json({
            error: 'Error reading CSV file',
            message: error.message
          });
        });

    } catch (error) {
      console.error('CSV upload error:', error);
      res.status(500).json({
        error: 'Error uploading CSV file',
        message: error.message
      });
    }
  }
);

// @route   POST /api/leads
// @desc    Create a new lead
// @access  Private (Admin/Salesperson)
router.post('/', 
  authenticateToken, 
  requireSalesperson, 
  validate('createLead'),
  async (req, res) => {
    try {
      const { phone, name, email, priority, notes, tags } = req.body;

      // Check for duplicate phone number
      const existingLead = await Lead.findOne({ phone });
      if (existingLead) {
        return res.status(400).json({
          error: 'Lead with this phone number already exists'
        });
      }

      const lead = new Lead({
        phone,
        name,
        email,
        priority,
        notes,
        tags
      });

      await lead.save();

      res.status(201).json({
        message: 'Lead created successfully',
        lead
      });

    } catch (error) {
      console.error('Create lead error:', error);
      res.status(500).json({
        error: 'Error creating lead',
        message: error.message
      });
    }
  }
);

// @route   GET /api/leads
// @desc    Get all leads with pagination and filtering
// @access  Private (Admin/Salesperson)
router.get('/', 
  authenticateToken, 
  requireSalesperson,
  validateQuery('pagination'),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', status, priority, search } = req.query;
      
      const query = { isActive: true };
      
      // Add filters
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (search) {
        query.$or = [
          { phone: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const leads = await Lead.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedTo', 'name email');

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
      console.error('Get leads error:', error);
      res.status(500).json({
        error: 'Error fetching leads',
        message: error.message
      });
    }
  }
);

// @route   GET /api/leads/:id
// @desc    Get lead by ID
// @access  Private (Admin/Salesperson)
router.get('/:id', 
  authenticateToken, 
  requireSalesperson,
  async (req, res) => {
    try {
      const lead = await Lead.findById(req.params.id)
        .populate('assignedTo', 'name email phone');

      if (!lead) {
        return res.status(404).json({
          error: 'Lead not found'
        });
      }

      res.json({ lead });

    } catch (error) {
      console.error('Get lead error:', error);
      res.status(500).json({
        error: 'Error fetching lead',
        message: error.message
      });
    }
  }
);

// @route   PUT /api/leads/:id
// @desc    Update lead
// @access  Private (Admin/Salesperson)
router.put('/:id', 
  authenticateToken, 
  requireSalesperson,
  validate('updateLead'),
  async (req, res) => {
    try {
      const lead = await Lead.findById(req.params.id);

      if (!lead) {
        return res.status(404).json({
          error: 'Lead not found'
        });
      }

      // Update fields
      Object.keys(req.body).forEach(key => {
        if (lead.schema.paths[key]) {
          lead[key] = req.body[key];
        }
      });

      await lead.save();

      res.json({
        message: 'Lead updated successfully',
        lead
      });

    } catch (error) {
      console.error('Update lead error:', error);
      res.status(500).json({
        error: 'Error updating lead',
        message: error.message
      });
    }
  }
);

// @route   DELETE /api/leads/:id
// @desc    Delete lead (soft delete)
// @access  Private (Admin only)
router.delete('/:id', 
  authenticateToken, 
  requireAdmin,
  async (req, res) => {
    try {
      const lead = await Lead.findById(req.params.id);

      if (!lead) {
        return res.status(404).json({
          error: 'Lead not found'
        });
      }

      // Soft delete
      lead.isActive = false;
      await lead.save();

      res.json({
        message: 'Lead deleted successfully'
      });

    } catch (error) {
      console.error('Delete lead error:', error);
      res.status(500).json({
        error: 'Error deleting lead',
        message: error.message
      });
    }
  }
);

// @route   GET /api/leads/stats/summary
// @desc    Get lead statistics summary
// @access  Private (Admin/Salesperson)
router.get('/stats/summary', 
  authenticateToken, 
  requireSalesperson,
  async (req, res) => {
    try {
      const stats = await Lead.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            calling: { $sum: { $cond: [{ $eq: ['$status', 'calling'] }, 1, 0] } },
            answered: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
            transferred: { $sum: { $cond: [{ $eq: ['$status', 'transferred'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
          }
        }
      ]);

      const priorityStats = await Lead.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 }
          }
        }
      ]);

      res.json({
        summary: stats[0] || {
          total: 0,
          pending: 0,
          calling: 0,
          answered: 0,
          transferred: 0,
          failed: 0
        },
        priorityBreakdown: priorityStats
      });

    } catch (error) {
      console.error('Get lead stats error:', error);
      res.status(500).json({
        error: 'Error fetching lead statistics',
        message: error.message
      });
    }
  }
);

module.exports = router; 
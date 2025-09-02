const Joi = require('joi');

// Validation schemas
const schemas = {
  // User registration
  registerUser: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\+998[0-9]{9}$/).required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('admin', 'salesperson').default('salesperson')
  }),

  // User login
  loginUser: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  // Lead creation
  createLead: Joi.object({
    phone: Joi.string().pattern(/^\+998[0-9]{9}$/).required(),
    name: Joi.string().max(100).optional(),
    email: Joi.string().email().optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    notes: Joi.string().max(500).optional(),
    tags: Joi.array().items(Joi.string()).optional()
  }),

  // Lead update
  updateLead: Joi.object({
    name: Joi.string().max(100).optional(),
    email: Joi.string().email().optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
    status: Joi.string().valid('pending', 'calling', 'answered', 'no_answer', 'busy', 'failed', 'completed', 'transferred').optional(),
    notes: Joi.string().max(500).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    isActive: Joi.boolean().optional()
  }),

  // Call initiation
  initiateCall: Joi.object({
    leadId: Joi.string().required(),
    salespersonId: Joi.string().optional()
  }),

  // Call status update
  updateCallStatus: Joi.object({
    status: Joi.string().valid('initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed', 'canceled').required(),
    duration: Joi.number().min(0).optional(),
    notes: Joi.string().max(1000).optional(),
    errorCode: Joi.string().optional(),
    errorMessage: Joi.string().optional()
  }),

  // User update
  updateUser: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    phone: Joi.string().pattern(/^\+998[0-9]{9}$/).optional(),
    isAvailable: Joi.boolean().optional(),
    isActive: Joi.boolean().optional()
  }),

  // Pagination and filtering
  pagination: Joi.object({
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(100).default(20),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'phone', 'priority', 'status').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Date range filter
  dateRange: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
  })
};

// Validation middleware factory
const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      return res.status(500).json({ error: 'Validation schema not found' });
    }

    const { error } = schema.validate(req.body);
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errorMessage 
      });
    }

    next();
  };
};

// Query validation middleware
const validateQuery = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      return res.status(500).json({ error: 'Validation schema not found' });
    }

    const { error } = schema.validate(req.query);
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({ 
        error: 'Query validation failed', 
        details: errorMessage 
      });
    }

    next();
  };
};

// File upload validation
const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const allowedTypes = ['text/csv'];
  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({ 
      error: 'Invalid file type. Only CSV files are allowed.' 
    });
  }

  const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default
  if (req.file.size > maxSize) {
    return res.status(400).json({ 
      error: File size too large. Maximum size is MB. 
    });
  }

  next();
};

module.exports = {
  validate,
  validateQuery,
  validateFileUpload,
  schemas
};

const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^\+?[\d\s\-\(\)]+$/, 'Please enter a valid phone number']
  },
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  status: {
    type: String,
    enum: ['pending', 'calling', 'answered', 'no_answer', 'busy', 'failed', 'completed', 'transferred'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  callAttempts: {
    type: Number,
    default: 0,
    max: [5, 'Maximum call attempts exceeded']
  },
  lastCallAttempt: {
    type: Date
  },
  nextCallTime: {
    type: Date
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  callHistory: [{
    attempt: Number,
    timestamp: Date,
    status: String,
    duration: Number,
    notes: String
  }],
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  tags: [{
    type: String,
    trim: true
  }],
  source: {
    type: String,
    default: 'csv_upload'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
leadSchema.index({ status: 1, priority: 1, nextCallTime: 1 });
leadSchema.index({ phone: 1 }, { unique: true });
leadSchema.index({ assignedTo: 1, status: 1 });

// Method to update call status
leadSchema.methods.updateCallStatus = function(status, duration = 0, notes = '') {
  this.status = status;
  this.lastCallAttempt = new Date();
  
  if (status === 'answered' || status === 'no_answer' || status === 'busy' || status === 'failed') {
    this.callAttempts += 1;
    
    // Add to call history
    this.callHistory.push({
      attempt: this.callAttempts,
      timestamp: new Date(),
      status: status,
      duration: duration,
      notes: notes
    });
    
    // Set next call time based on status and attempts
    if (status === 'no_answer' && this.callAttempts < 3) {
      this.nextCallTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes later
    } else if (status === 'busy' && this.callAttempts < 3) {
      this.nextCallTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes later
    } else if (this.callAttempts >= 3) {
      this.status = 'failed';
      this.isActive = false;
    }
  }
  
  return this.save();
};

// Method to assign to salesperson
leadSchema.methods.assignToSalesperson = function(userId) {
  this.assignedTo = userId;
  this.status = 'transferred';
  return this.save();
};

// Static method to get next lead to call
leadSchema.statics.getNextLeadToCall = function() {
  return this.findOne({
    status: 'pending',
    isActive: true,
    $or: [
      { nextCallTime: { $exists: false } },
      { nextCallTime: { $lte: new Date() } }
    ]
  }).sort({ priority: 1, createdAt: 1 });
};

module.exports = mongoose.model('Lead', leadSchema); 
const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true
  },
  salesperson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  twilioCallSid: {
    type: String,
    unique: true,
    sparse: true
  },
  direction: {
    type: String,
    enum: ['outbound', 'inbound'],
    default: 'outbound'
  },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed', 'canceled'],
    default: 'initiated'
  },
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 0,
    min: 0
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  answerTime: {
    type: Date
  },
  transferTime: {
    type: Date
  },
  transferTo: {
    type: String
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  recordingUrl: {
    type: String
  },
  cost: {
    type: Number,
    default: 0
  },
  errorCode: {
    type: String
  },
  errorMessage: {
    type: String
  },
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
callLogSchema.index({ lead: 1, createdAt: -1 });
callLogSchema.index({ salesperson: 1, createdAt: -1 });
callLogSchema.index({ status: 1, createdAt: -1 });
callLogSchema.index({ twilioCallSid: 1 });

// Method to update call status
callLogSchema.methods.updateStatus = function(status, additionalData = {}) {
  this.status = status;
  
  if (status === 'answered') {
    this.answerTime = new Date();
  } else if (status === 'completed') {
    this.endTime = new Date();
    if (this.answerTime) {
      this.duration = Math.floor((this.endTime - this.answerTime) / 1000);
    }
  } else if (status === 'failed' || status === 'busy' || status === 'no-answer') {
    this.endTime = new Date();
  }
  
  // Update additional fields if provided
  Object.keys(additionalData).forEach(key => {
    if (this.schema.paths[key]) {
      this[key] = additionalData[key];
    }
  });
  
  return this.save();
};

// Method to transfer call
callLogSchema.methods.transferCall = function(transferTo) {
  this.transferTo = transferTo;
  this.transferTime = new Date();
  return this.save();
};

// Static method to get call statistics
callLogSchema.statics.getCallStats = async function(filters = {}) {
  const matchStage = {};
  
  if (filters.startDate) {
    matchStage.createdAt = { $gte: new Date(filters.startDate) };
  }
  if (filters.endDate) {
    matchStage.createdAt = { ...matchStage.createdAt, $lte: new Date(filters.endDate) };
  }
  if (filters.salesperson) {
    matchStage.salesperson = filters.salesperson;
  }
  if (filters.status) {
    matchStage.status = filters.status;
  }
  
  return await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        answeredCalls: { $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] } },
        completedCalls: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        totalDuration: { $sum: '$duration' },
        averageDuration: { $avg: '$duration' },
        totalCost: { $sum: '$cost' }
      }
    }
  ]);
};

// Static method to get recent calls
callLogSchema.statics.getRecentCalls = function(limit = 50) {
  return this.find()
    .populate('lead', 'phone name')
    .populate('salesperson', 'name')
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('CallLog', callLogSchema); 
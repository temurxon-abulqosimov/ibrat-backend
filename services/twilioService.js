const twilio = require('twilio');

// Initialize Twilio client (only if credentials are provided)
let client = null;

try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log('✅ Twilio client initialized successfully');
  } else {
    console.log('⚠️ Twilio credentials not provided - telephony features will be simulated');
  }
} catch (error) {
  console.log('⚠️ Twilio initialization failed - telephony features will be simulated');
  console.log(`   Error: ${error.message}`);
}

// TwiML for call flow
const generateTwiML = (action, targetPhone = null) => {
  let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';
  
  switch (action) {
    case 'greeting':
      twiml += '<Say>Hello, this is an automated call from our company. Please stay on the line to speak with a representative.</Say>';
      twiml += '<Pause length="2"/>';
      break;
      
    case 'transfer':
      if (targetPhone) {
        twiml += '<Say>Connecting you to our sales representative now.</Say>';
        twiml += `<Dial>${targetPhone}</Dial>`;
      } else {
        twiml += '<Say>We are unable to connect you at this time. Please try again later.</Say>';
      }
      break;
      
    case 'voicemail':
      twiml += '<Say>We are unable to reach you at this time. Please call us back or leave a message.</Say>';
      twiml += '<Record maxLength="30" action="/api/calls/webhook/voicemail" />';
      break;
      
    default:
      twiml += '<Say>Thank you for your time.</Say>';
  }
  
  twiml += '</Response>';
  return twiml;
};

// Initiate outbound call
const initiateCall = async (leadPhone, salespersonPhone, callLogId) => {
  try {
    // Validate phone numbers
    if (!leadPhone || !salespersonPhone) {
      throw new Error('Phone numbers are required');
    }

    // Check if Twilio client is available
    if (!client) {
      console.log('📞 Simulating call (Twilio not available)');
      // Return success for simulation mode
      return {
        success: true,
        callSid: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'initiated'
      };
    }

    // Format phone numbers (ensure they start with +)
    const formattedLeadPhone = leadPhone.startsWith('+') ? leadPhone : `+${leadPhone}`;
    const formattedSalespersonPhone = salespersonPhone.startsWith('+') ? salespersonPhone : `+${salespersonPhone}`;

    // Create call with TwiML that will handle the flow
    const call = await client.calls.create({
      url: `${process.env.BASE_URL || 'http://localhost:5000'}/api/calls/webhook/answer`,
      to: formattedLeadPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      statusCallback: `${process.env.BASE_URL || 'http://localhost:5000'}/api/calls/webhook/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed'],
      statusCallbackMethod: 'POST',
      timeout: parseInt(process.env.CALL_TIMEOUT) || 30, // 30 seconds timeout
      record: true, // Record calls for quality assurance
      recordingStatusCallback: `${process.env.BASE_URL || 'http://localhost:5000'}/api/calls/webhook/recording`,
      recordingStatusCallbackMethod: 'POST'
    });

    console.log(`Call initiated to ${formattedLeadPhone} with SID: ${call.sid}`);

    return {
      success: true,
      callSid: call.sid,
      status: call.status
    };

  } catch (error) {
    console.error('Error initiating call:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Handle call status updates from Twilio webhooks
const handleCallStatusUpdate = async (callLog, twilioStatus, duration = 0) => {
  try {
    let status = twilioStatus;
    let additionalData = {};

    // Map Twilio status to our internal status
    switch (twilioStatus) {
      case 'initiated':
        status = 'initiated';
        break;
      case 'ringing':
        status = 'ringing';
        break;
      case 'answered':
        status = 'answered';
        break;
      case 'completed':
        status = 'completed';
        additionalData.duration = duration;
        break;
      case 'busy':
        status = 'busy';
        break;
      case 'no-answer':
        status = 'no-answer';
        break;
      case 'failed':
        status = 'failed';
        break;
      case 'canceled':
        status = 'canceled';
        break;
      default:
        status = 'failed';
        additionalData.errorMessage = `Unknown Twilio status: ${twilioStatus}`;
    }

    // Update call log
    await callLog.updateStatus(status, additionalData);

    // Update lead status based on call result
    const Lead = require('../models/Lead');
    const lead = await Lead.findById(callLog.lead);
    
    if (lead) {
      if (status === 'answered') {
        lead.status = 'answered';
      } else if (status === 'completed') {
        lead.status = 'transferred';
      } else if (['busy', 'no-answer', 'failed'].includes(status)) {
        // Update lead status based on call result
        await lead.updateCallStatus(status, duration);
      }
    }

    console.log(`Call ${callLog._id} status updated to: ${status}`);

  } catch (error) {
    console.error('Error handling call status update:', error);
    throw error;
  }
};

// Get call details from Twilio
const getCallDetails = async (callSid) => {
  try {
    if (!client) {
      return {
        success: false,
        error: 'Twilio client not available'
      };
    }

    const call = await client.calls(callSid).fetch();
    return {
      success: true,
      call: {
        sid: call.sid,
        status: call.status,
        duration: call.duration,
        price: call.price,
        priceUnit: call.priceUnit,
        startTime: call.startTime,
        endTime: call.endTime,
        from: call.from,
        to: call.to
      }
    };
  } catch (error) {
    console.error('Error fetching call details:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Cancel ongoing call
const cancelCall = async (callSid) => {
  try {
    if (!client) {
      return {
        success: false,
        error: 'Twilio client not available'
      };
    }

    const call = await client.calls(callSid).update({ status: 'canceled' });
    
    console.log(`Call ${callSid} canceled successfully`);
    
    return {
      success: true,
      status: call.status
    };
  } catch (error) {
    console.error('Error canceling call:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get available phone numbers
const getAvailablePhoneNumbers = async (countryCode = 'US') => {
  try {
    if (!client) {
      return {
        success: false,
        error: 'Twilio client not available'
      };
    }

    const numbers = await client.availablePhoneNumbers(countryCode).local.list({
      limit: 20
    });

    return {
      success: true,
      numbers: numbers.map(num => ({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        locality: num.locality,
        region: num.region,
        country: num.country
      }))
    };
  } catch (error) {
    console.error('Error fetching available phone numbers:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Validate phone number format
const validatePhoneNumber = (phoneNumber) => {
  try {
    // Basic validation - can be enhanced with Twilio's lookup API
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    return phoneRegex.test(phoneNumber);
  } catch (error) {
    return false;
  }
};

// Get call analytics
const getCallAnalytics = async (startDate, endDate) => {
  try {
    if (!client) {
      return {
        success: false,
        error: 'Twilio client not available'
      };
    }

    const calls = await client.calls.list({
      startTime: { gte: startDate },
      endTime: { lte: endDate }
    });

    const analytics = {
      totalCalls: calls.length,
      answeredCalls: calls.filter(call => call.status === 'completed').length,
      failedCalls: calls.filter(call => ['failed', 'busy', 'no-answer'].includes(call.status)).length,
      totalDuration: calls.reduce((sum, call) => sum + (call.duration || 0), 0),
      averageDuration: 0
    };

    if (analytics.answeredCalls > 0) {
      analytics.averageDuration = Math.round(analytics.totalDuration / analytics.answeredCalls);
    }

    return {
      success: true,
      analytics
    };
  } catch (error) {
    console.error('Error fetching call analytics:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  initiateCall,
  handleCallStatusUpdate,
  getCallDetails,
  cancelCall,
  getAvailablePhoneNumbers,
  validatePhoneNumber,
  getCallAnalytics,
  generateTwiML
}; 
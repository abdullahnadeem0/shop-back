import mongoose from 'mongoose';

const repairSchema = new mongoose.Schema({
  // Device Information
  deviceName: {
    type: String,
    required: true
  },
  deviceModel: {
    type: String,
    default: ''
  },
  deviceBrand: {
    type: String,
    default: ''
  },
  serialNumber: {
    type: String,
    default: ''
  },
  
  // Issue Details
  issueType: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  diagnosedBy: {
    type: String,
    default: 'Self'
  },
  diagnosisDate: {
    type: Date,
    default: Date.now
  },
  
  // Customer Information
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    default: ''
  },
  customerAddress: {
    type: String,
    default: ''
  },
  
  // Financial Details - Flattened structure for easier access
  estimatedCost: {
    type: Number,
    default: 0
  },
  finalCost: {
    type: Number,
    default: 0
  },
  advancePayment: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  
  // Payment Information
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Partial', 'Completed', 'Refunded'],
    default: 'Pending'
  },
  totalPaid: {
    type: Number,
    default: 0
  },
  
  // Repair Status
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Cancelled', 'Referred'],
    default: 'Pending'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  
  // Referral Information
  isReferred: {
    type: Boolean,
    default: false
  },
  referredTo: {
    name: String,
    shopName: String,
    city: String,
    address: String,
    phone: String,
    email: String
  },
  referralDate: Date,
  referralCost: Number,
  referralFee: Number,
  referralStatus: {
    type: String,
    enum: ['Pending', 'Accepted', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  referralNotes: String,
  
  // Parts Used
  partsUsed: [{
    partName: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number,
    supplier: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Technician Information
  technicianInfo: {
    name: String,
    employeeId: String,
    assignedDate: Date,
    completedDate: Date
  },
  
  // Attachments
  attachments: [{
    filename: String,
    url: String,
    fileType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Notes
  notes: [{
    content: String,
    createdBy: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata
  repairId: {
    type: String,
    unique: true,
    sparse: true  // This allows multiple null values but ensures uniqueness for non-null values
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Function to generate unique repair ID
async function generateUniqueRepairId() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `RPR-${year}${month}`;
  
  const Repair = mongoose.model('Repair');
  
  // Find the latest repair ID with the current month prefix
  const latestRepair = await Repair.findOne({
    repairId: { $regex: `^${prefix}` }
  }).sort({ repairId: -1 });
  
  let sequence = 1;
  if (latestRepair && latestRepair.repairId) {
    const lastSequence = parseInt(latestRepair.repairId.split('-')[2]);
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }
  
  const sequenceStr = String(sequence).padStart(5, '0');
  return `${prefix}-${sequenceStr}`;
}

// Generate repair ID before saving
repairSchema.pre('save', async function(next) {
  try {
    // Only generate if repairId doesn't exist
    if (!this.repairId) {
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 5;
      
      while (!isUnique && attempts < maxAttempts) {
        const newRepairId = await generateUniqueRepairId();
        const existingRepair = await mongoose.model('Repair').findOne({ repairId: newRepairId });
        
        if (!existingRepair) {
          this.repairId = newRepairId;
          isUnique = true;
        }
        attempts++;
      }
      
      if (!isUnique) {
        // Fallback to timestamp-based ID if sequence fails
        this.repairId = `RPR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Create indexes
repairSchema.index({ createdAt: -1 });
repairSchema.index({ status: 1 });
repairSchema.index({ customerPhone: 1 });
repairSchema.index({ repairId: 1 }, { unique: true, sparse: true });

const Repair = mongoose.model('Repair', repairSchema);
export default Repair;
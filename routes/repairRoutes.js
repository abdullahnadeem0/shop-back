import express from 'express';
import Repair from '../models/Repair.js';
import Payment from '../models/Payment.js';
import Referral from '../models/Referral.js';
import Bank from '../models/Bank.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Get all repairs with filters
router.get('/', async (req, res) => {
  try {
    const { status, search, startDate, endDate } = req.query;
    let query = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { repairId: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { deviceName: { $regex: search, $options: 'i' } }
      ];
    }
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const repairs = await Repair.find(query)
      .sort({ createdAt: -1 });
    
    res.json({ success: true, data: repairs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single repair
router.get('/:id', async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new repair
router.post('/',
  [
    body('deviceName').notEmpty().withMessage('Device name is required'),
    body('customerName').notEmpty().withMessage('Customer name is required'),
    body('customerPhone').notEmpty().withMessage('Customer phone is required'),
    body('issueType').notEmpty().withMessage('Issue type is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const repair = new Repair(req.body);
      await repair.save();
      res.status(201).json({ success: true, data: repair });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Update repair
router.put('/:id', async (req, res) => {
  try {
    const repair = await Repair.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete repair
router.delete('/:id', async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }

    // Delete associated payments
    await Payment.deleteMany({ repairId: req.params.id });
    
    // Delete associated referral
    await Referral.deleteMany({ repairId: req.params.id });
    
    // Delete the repair
    await Repair.findByIdAndDelete(req.params.id);
    
    res.json({ success: true, message: 'Repair deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add payment to repair
router.post('/:id/payments',
  [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('paymentMethod').isIn(['Cash', 'Bank Transfer', 'Credit Card', 'Cheque']).withMessage('Invalid payment method')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { amount, paymentMethod, bankId, transactionId, remarks } = req.body;
      const repair = await Repair.findById(req.params.id);
      
      if (!repair) {
        return res.status(404).json({ success: false, message: 'Repair not found' });
      }

      // Create payment record
      const paymentRecord = new Payment({
        repairId: repair._id,
        amount,
        paymentMethod,
        bankId: paymentMethod === 'Bank Transfer' ? bankId : null,
        transactionId,
        remarks,
        status: 'Completed'
      });
      await paymentRecord.save();

      // Update repair payment info
      repair.totalPaid = (repair.totalPaid || 0) + amount;
      
      // Update payment status
      if (repair.totalPaid >= repair.estimatedCost) {
        repair.paymentStatus = 'Completed';
      } else if (repair.totalPaid > 0) {
        repair.paymentStatus = 'Partial';
      }

      // Update remaining amount
      repair.remainingAmount = repair.estimatedCost - repair.totalPaid;

      await repair.save();

      // Update bank balance if bank transfer
      if (paymentMethod === 'Bank Transfer' && bankId) {
        const bank = await Bank.findById(bankId);
        if (bank) {
          bank.currentBalance = (bank.currentBalance || 0) + amount;
          await bank.save();
        }
      }

      const updatedRepair = await Repair.findById(repair._id);
      res.json({ success: true, data: updatedRepair });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Refer repair to external shop
router.post('/:id/refer',
  [
    body('referredTo.shopName').notEmpty().withMessage('Shop name is required'),
    body('referredTo.ownerName').notEmpty().withMessage('Owner name is required'),
    body('referredTo.phone').notEmpty().withMessage('Phone number is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const repair = await Repair.findById(req.params.id);
      if (!repair) {
        return res.status(404).json({ success: false, message: 'Repair not found' });
      }

      // Create referral record
      const referral = new Referral({
        repairId: repair._id,
        referredTo: req.body.referredTo,
        estimatedCost: req.body.estimatedCost || 0,
        commission: req.body.commission || 0,
        commissionType: req.body.commissionType || 'Percentage',
        commissionValue: req.body.commissionValue || 0,
        notes: req.body.notes,
        status: 'Pending'
      });
      await referral.save();

      // Update repair with referral info
      repair.isReferred = true;
      repair.referredTo = req.body.referredTo;
      repair.referralDate = new Date();
      repair.referralCost = req.body.estimatedCost || 0;
      repair.referralFee = req.body.commission || 0;
      repair.referralStatus = 'Pending';
      repair.referralNotes = req.body.notes;
      repair.status = 'Referred';

      await repair.save();

      const updatedRepair = await Repair.findById(repair._id);
      res.json({ success: true, data: updatedRepair });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Update referral status
router.patch('/:id/referral/status', async (req, res) => {
  try {
    const { status, externalRepairId, finalCost } = req.body;
    const repair = await Repair.findById(req.params.id);
    
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }

    repair.referralStatus = status;
    if (externalRepairId) repair.externalRepairId = externalRepairId;
    if (finalCost) repair.referralCost = finalCost;

    if (status === 'Completed') {
      repair.status = 'Completed';
      repair.referralStatus = 'Completed';
    }

    await repair.save();

    // Update referral record
    await Referral.findOneAndUpdate(
      { repairId: repair._id },
      { status, externalRepairId, finalCost }
    );

    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Add parts to repair
router.post('/:id/parts',
  [
    body('parts').isArray().withMessage('Parts must be an array')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const repair = await Repair.findById(req.params.id);
      if (!repair) {
        return res.status(404).json({ success: false, message: 'Repair not found' });
      }

      repair.partsUsed.push(...req.body.parts);
      
      // Update total cost
      const partsTotal = repair.partsUsed.reduce((sum, part) => sum + (part.totalPrice || 0), 0);
      repair.finalCost = partsTotal + (repair.estimatedCost || 0);
      repair.remainingAmount = repair.finalCost - (repair.totalPaid || 0);

      await repair.save();
      res.json({ success: true, data: repair });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Add notes to repair
router.post('/:id/notes',
  [
    body('content').notEmpty().withMessage('Note content is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const repair = await Repair.findById(req.params.id);
      if (!repair) {
        return res.status(404).json({ success: false, message: 'Repair not found' });
      }

      repair.notes.push({
        content: req.body.content,
        createdBy: req.body.createdBy || 'System',
        createdAt: new Date()
      });

      await repair.save();
      res.json({ success: true, data: repair });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// Get repair statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const totalRepairs = await Repair.countDocuments();
    const completedRepairs = await Repair.countDocuments({ status: 'Completed' });
    const pendingRepairs = await Repair.countDocuments({ status: 'Pending' });
    const inProgressRepairs = await Repair.countDocuments({ status: 'In Progress' });
    const referredRepairs = await Repair.countDocuments({ isReferred: true });
    const cancelledRepairs = await Repair.countDocuments({ status: 'Cancelled' });
    
    const totalRevenue = await Repair.aggregate([
      { $match: { status: 'Completed' } },
      { $group: { _id: null, total: { $sum: '$finalCost' } } }
    ]);
    
    const totalPayments = await Repair.aggregate([
      { $group: { _id: null, total: { $sum: '$totalPaid' } } }
    ]);

    const repairsByPriority = await Repair.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        totalRepairs,
        completedRepairs,
        pendingRepairs,
        inProgressRepairs,
        referredRepairs,
        cancelledRepairs,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalPayments: totalPayments[0]?.total || 0,
        repairsByPriority
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get repairs by date range
router.get('/stats/date-range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    const repairs = await Repair.find({
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }).sort({ createdAt: 1 });

    const totalAmount = repairs.reduce((sum, repair) => sum + (repair.finalCost || 0), 0);
    const totalPaid = repairs.reduce((sum, repair) => sum + (repair.totalPaid || 0), 0);

    res.json({
      success: true,
      data: {
        repairs,
        summary: {
          count: repairs.length,
          totalAmount,
          totalPaid,
          pendingAmount: totalAmount - totalPaid
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
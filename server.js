import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import {
  sequelize,
  User,
  Property,
  RentalApplication,
  VisitRequest,
  LeaseAgreement,
  RentPayment,
  Notification,
} from './db.js';
import { generateToken, authenticateToken, authorizeRoles } from './auth.js';

const app = express();
app.use(cors());
app.use(express.json());

const createNotification = async (userId, type, title, message) => {
  try {
    await Notification.create({ userId, type, title, message });
  } catch (err) {
    console.error('Notification error:', err.message);
  }
};

// Health Check
app.get('/', (req, res) => {
  res.json({ status: 'Online Property Rental & Management API is running', timestamp: new Date() });
});

// ================= AUTHENTICATION =================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const validRoles = ['Admin', 'Property Owner', 'Tenant'];
    const assignedRole = validRoles.includes(role) ? role : 'Tenant';

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: assignedRole,
    });

    const token = generateToken(user);
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid credentials or account deactivated' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= PROPERTY MANAGEMENT & SEARCH =================
app.get('/api/properties', async (req, res) => {
  try {
    const {
      search,
      location,
      minRent,
      maxRent,
      propertyType,
      bedrooms,
      availability,
      sortBy = 'createdAt',
      order = 'DESC',
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};
    if (search) {
      filter[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { location: { [Op.like]: `%${search}%` } },
      ];
    }
    if (location) filter.location = { [Op.like]: `%${location}%` };
    if (propertyType) filter.propertyType = propertyType;
    if (bedrooms) filter.bedrooms = parseInt(bedrooms, 10);
    if (availability) filter.availabilityStatus = availability;

    if (minRent || maxRent) {
      filter.rent = {};
      if (minRent) filter.rent[Op.gte] = parseFloat(minRent);
      if (maxRent) filter.rent[Op.lte] = parseFloat(maxRent);
    }

    const allowedSorts = ['rent', 'createdAt', 'bedrooms'];
    const sortField = allowedSorts.includes(sortBy) ? sortBy : 'createdAt';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Property.findAndCountAll({
      where: filter,
      include: [{ model: User, as: 'owner', attributes: ['id', 'name', 'email'] }],
      order: [[sortField, sortOrder]],
      limit: limitNum,
      offset,
    });

    res.json({
      totalItems: count,
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      properties: rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/properties/:id', async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id, {
      include: [{ model: User, as: 'owner', attributes: ['id', 'name', 'email'] }],
    });
    if (!property) return res.status(404).json({ message: 'Property not found' });
    res.json(property);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/properties', authenticateToken, authorizeRoles('Property Owner', 'Admin'), async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      rent,
      propertyType,
      bedrooms,
      bathrooms,
      images,
      availabilityStatus,
    } = req.body;

    if (!title || !description || !location || rent === undefined || !propertyType) {
      return res.status(400).json({ message: 'Title, description, location, rent, and propertyType are required' });
    }

    const property = await Property.create({
      ownerId: req.user.id,
      title,
      description,
      location,
      rent: parseFloat(rent),
      propertyType,
      bedrooms: parseInt(bedrooms, 10) || 1,
      bathrooms: parseInt(bathrooms, 10) || 1,
      images: Array.isArray(images) ? images : images ? [images] : [],
      availabilityStatus: availabilityStatus || 'Available',
    });

    res.status(201).json({ message: 'Property listed successfully', property });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/properties/:id', authenticateToken, authorizeRoles('Property Owner', 'Admin'), async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    if (req.user.role === 'Property Owner' && property.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to update this property' });
    }

    const fields = [
      'title',
      'description',
      'location',
      'rent',
      'propertyType',
      'bedrooms',
      'bathrooms',
      'images',
      'availabilityStatus',
    ];
    for (const f of fields) {
      if (req.body[f] !== undefined) property[f] = req.body[f];
    }

    await property.save();
    res.json({ message: 'Property updated successfully', property });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/properties/:id', authenticateToken, authorizeRoles('Property Owner', 'Admin'), async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    if (req.user.role === 'Property Owner' && property.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to delete this property' });
    }

    await property.destroy();
    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Report a property listing
app.post('/api/properties/:id/report', authenticateToken, async (req, res) => {
  try {
    const property = await Property.findByPk(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    property.isReported = true;
    property.reportReason = req.body.reason || 'Reported by user for policy review';
    await property.save();

    res.json({ message: 'Property listing reported to Admin' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= RENTAL APPLICATIONS =================
app.post('/api/applications', authenticateToken, authorizeRoles('Tenant'), async (req, res) => {
  try {
    const { propertyId, message, moveInDate } = req.body;
    if (!propertyId || !moveInDate) {
      return res.status(400).json({ message: 'propertyId and moveInDate are required' });
    }

    const property = await Property.findByPk(propertyId);
    if (!property) return res.status(404).json({ message: 'Property not found' });
    if (property.availabilityStatus !== 'Available') {
      return res.status(400).json({ message: 'Property is currently not available for rent' });
    }

    // Prevent duplicate active applications (Pending or Approved)
    const existingActive = await RentalApplication.findOne({
      where: {
        propertyId,
        tenantId: req.user.id,
        status: { [Op.in]: ['Pending', 'Approved'] },
      },
    });

    if (existingActive) {
      return res.status(400).json({
        message: 'You already have an active (Pending or Approved) application for this property.',
      });
    }

    const application = await RentalApplication.create({
      propertyId,
      tenantId: req.user.id,
      message: message || '',
      moveInDate,
      status: 'Pending',
    });

    await createNotification(
      property.ownerId,
      'NEW_APPLICATION',
      'New Rental Application',
      `A tenant submitted a rental application for "${property.title}".`
    );

    res.status(201).json({ message: 'Rental application submitted', application });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/applications', authenticateToken, async (req, res) => {
  try {
    let whereClause = {};
    let propertyWhere = {};

    if (req.user.role === 'Tenant') {
      whereClause.tenantId = req.user.id;
    } else if (req.user.role === 'Property Owner') {
      propertyWhere.ownerId = req.user.id;
    }

    const applications = await RentalApplication.findAll({
      where: whereClause,
      include: [
        {
          model: Property,
          as: 'property',
          where: Object.keys(propertyWhere).length ? propertyWhere : undefined,
        },
        { model: User, as: 'tenant', attributes: ['id', 'name', 'email'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/applications/:id/status', authenticateToken, authorizeRoles('Property Owner', 'Admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be Approved or Rejected' });
    }

    const application = await RentalApplication.findByPk(req.params.id, {
      include: [{ model: Property, as: 'property' }],
    });
    if (!application) return res.status(404).json({ message: 'Application not found' });

    if (req.user.role === 'Property Owner' && application.property.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to manage this application' });
    }

    application.status = status;
    await application.save();

    await createNotification(
      application.tenantId,
      'APPLICATION_UPDATE',
      `Application ${status}`,
      `Your rental application for "${application.property.title}" has been ${status.toLowerCase()}.`
    );

    res.json({ message: `Application ${status.toLowerCase()}`, application });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= PROPERTY VISITS =================
app.post('/api/visits', authenticateToken, authorizeRoles('Tenant'), async (req, res) => {
  try {
    const { propertyId, visitDate, visitTime, notes } = req.body;
    if (!propertyId || !visitDate || !visitTime) {
      return res.status(400).json({ message: 'propertyId, visitDate, and visitTime are required' });
    }

    const property = await Property.findByPk(propertyId);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    const visit = await VisitRequest.create({
      propertyId,
      tenantId: req.user.id,
      visitDate,
      visitTime,
      notes: notes || '',
      status: 'Pending',
    });

    await createNotification(
      property.ownerId,
      'VISIT_REQUEST',
      'New Property Visit Request',
      `A tenant requested a visit for "${property.title}" on ${visitDate} at ${visitTime}.`
    );

    res.status(201).json({ message: 'Visit request submitted', visit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/visits', authenticateToken, async (req, res) => {
  try {
    let whereClause = {};
    let propertyWhere = {};

    if (req.user.role === 'Tenant') {
      whereClause.tenantId = req.user.id;
    } else if (req.user.role === 'Property Owner') {
      propertyWhere.ownerId = req.user.id;
    }

    const visits = await VisitRequest.findAll({
      where: whereClause,
      include: [
        {
          model: Property,
          as: 'property',
          where: Object.keys(propertyWhere).length ? propertyWhere : undefined,
        },
        { model: User, as: 'tenant', attributes: ['id', 'name', 'email'] },
      ],
      order: [['visitDate', 'DESC']],
    });

    res.json(visits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/visits/:id/status', authenticateToken, authorizeRoles('Property Owner', 'Admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Accepted', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be Accepted or Rejected' });
    }

    const visit = await VisitRequest.findByPk(req.params.id, {
      include: [{ model: Property, as: 'property' }],
    });
    if (!visit) return res.status(404).json({ message: 'Visit request not found' });

    if (req.user.role === 'Property Owner' && visit.property.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to manage this visit' });
    }

    visit.status = status;
    await visit.save();

    await createNotification(
      visit.tenantId,
      'VISIT_UPDATE',
      `Property Visit ${status}`,
      `Your visit request for "${visit.property.title}" on ${visit.visitDate} was ${status.toLowerCase()}.`
    );

    res.json({ message: `Visit request ${status.toLowerCase()}`, visit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= LEASE AGREEMENTS =================
app.post('/api/leases', authenticateToken, authorizeRoles('Property Owner', 'Admin'), async (req, res) => {
  try {
    const { propertyId, tenantId, startDate, endDate, terms } = req.body;
    if (!propertyId || !tenantId || !startDate || !endDate) {
      return res.status(400).json({ message: 'propertyId, tenantId, startDate, and endDate are required' });
    }

    const property = await Property.findByPk(propertyId);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    if (req.user.role === 'Property Owner' && property.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized for this property' });
    }

    const tenant = await User.findByPk(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const agreementNumber = `LEASE-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const defaultTerms =
      terms ||
      `Standard Residential Rental Agreement between Owner and ${tenant.name} for ${property.title} (${property.location}) at PKR ${property.rent}/month from ${startDate} to ${endDate}.`;

    const lease = await LeaseAgreement.create({
      agreementNumber,
      propertyId,
      ownerId: property.ownerId,
      tenantId,
      startDate,
      endDate,
      monthlyRent: property.rent,
      terms: defaultTerms,
      status: 'Active',
    });

    // Mark property as Rented
    property.availabilityStatus = 'Rented';
    await property.save();

    // Generate initial monthly rent record
    const billingMonth = startDate.slice(0, 7);
    const receiptNumber = `RCPT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    await RentPayment.create({
      receiptNumber,
      leaseId: lease.id,
      tenantId,
      propertyId,
      amount: property.rent,
      billingMonth,
      dueDate: startDate,
      status: 'Pending',
    });

    await createNotification(
      tenantId,
      'RENT_DUE',
      'Lease Created & Rent Due',
      `Your lease (${agreementNumber}) for "${property.title}" is active. First rent payment of ${property.rent} is due on ${startDate}.`
    );

    res.status(201).json({ message: 'Rental agreement generated successfully', lease });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leases', authenticateToken, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'Tenant') filter.tenantId = req.user.id;
    else if (req.user.role === 'Property Owner') filter.ownerId = req.user.id;

    const leases = await LeaseAgreement.findAll({
      where: filter,
      include: [
        { model: Property, as: 'property' },
        { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'tenant', attributes: ['id', 'name', 'email'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json(leases);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= RENT PAYMENTS =================
app.get('/api/payments', authenticateToken, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'Tenant') filter.tenantId = req.user.id;

    const payments = await RentPayment.findAll({
      where: filter,
      include: [
        { model: Property, as: 'property', attributes: ['id', 'title', 'location', 'ownerId'] },
        { model: User, as: 'tenant', attributes: ['id', 'name', 'email'] },
        { model: LeaseAgreement, as: 'lease', attributes: ['id', 'agreementNumber'] },
      ],
      order: [['dueDate', 'DESC']],
    });

    const filtered =
      req.user.role === 'Property Owner'
        ? payments.filter((p) => p.property && p.property.ownerId === req.user.id)
        : payments;

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create monthly payment invoice (Owner or Admin)
app.post('/api/payments', authenticateToken, authorizeRoles('Property Owner', 'Admin'), async (req, res) => {
  try {
    const { leaseId, billingMonth, dueDate, status } = req.body;
    const lease = await LeaseAgreement.findByPk(leaseId, { include: [{ model: Property, as: 'property' }] });
    if (!lease) return res.status(404).json({ message: 'Lease not found' });

    const receiptNumber = `RCPT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const payment = await RentPayment.create({
      receiptNumber,
      leaseId: lease.id,
      tenantId: lease.tenantId,
      propertyId: lease.propertyId,
      amount: lease.monthlyRent,
      billingMonth: billingMonth || new Date().toISOString().slice(0, 7),
      dueDate: dueDate || new Date().toISOString().split('T')[0],
      status: ['Paid', 'Pending', 'Overdue'].includes(status) ? status : 'Pending',
    });

    await createNotification(
      lease.tenantId,
      'RENT_DUE',
      'Upcoming Rent Due',
      `Rent of ${lease.monthlyRent} for "${lease.property.title}" (${payment.billingMonth}) is due on ${payment.dueDate}.`
    );

    res.status(201).json({ message: 'Rent payment record created', payment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simulated Rent Payment Processing (Tenant)
app.post('/api/payments/:id/pay', authenticateToken, authorizeRoles('Tenant'), async (req, res) => {
  try {
    const payment = await RentPayment.findByPk(req.params.id, {
      include: [{ model: Property, as: 'property' }],
    });
    if (!payment) return res.status(404).json({ message: 'Payment record not found' });
    if (payment.tenantId !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });
    if (payment.status === 'Paid') return res.status(400).json({ message: 'Rent already paid' });

    payment.status = 'Paid';
    payment.paidAt = new Date();
    payment.paymentMethod = req.body.paymentMethod || 'Simulated Online Transfer';
    await payment.save();

    res.json({
      message: 'Payment processed successfully',
      receipt: {
        receiptNumber: payment.receiptNumber,
        property: payment.property.title,
        amount: payment.amount,
        billingMonth: payment.billingMonth,
        paidAt: payment.paidAt,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= NOTIFICATIONS =================
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification || notification.userId !== req.user.id) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    notification.isRead = true;
    await notification.save();
    res.json({ message: 'Notification marked as read', notification });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= ADMIN DASHBOARD & MANAGEMENT =================
app.get('/api/admin/analytics', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const totalUsers = await User.count();
    const totalProperties = await Property.count();
    const availableProperties = await Property.count({ where: { availabilityStatus: 'Available' } });
    const rentedProperties = await Property.count({ where: { availabilityStatus: 'Rented' } });
    const totalApplications = await RentalApplication.count();
    const pendingApplications = await RentalApplication.count({ where: { status: 'Pending' } });

    const paidPayments = await RentPayment.findAll({ where: { status: 'Paid' } });
    const totalRecordedRentPayments = paidPayments.reduce((sum, p) => sum + p.amount, 0);

    // Monthly rental activity breakdown
    const monthlyActivity = {};
    for (const p of paidPayments) {
      monthlyActivity[p.billingMonth] = (monthlyActivity[p.billingMonth] || 0) + p.amount;
    }

    res.json({
      totalUsers,
      totalProperties,
      availableProperties,
      rentedProperties,
      totalApplications,
      pendingApplications,
      totalRecordedRentPayments: parseFloat(totalRecordedRentPayments.toFixed(2)),
      monthlyRentalActivity: monthlyActivity,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/users', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'isActive', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/users/:id/status', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isActive = req.body.isActive !== undefined ? req.body.isActive : !user.isActive;
    await user.save();
    res.json({ message: 'User status updated', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/reported-properties', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
  try {
    const reported = await Property.findAll({
      where: { isReported: true },
      include: [{ model: User, as: 'owner', attributes: ['id', 'name', 'email'] }],
    });
    res.json(reported);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= SEED SAMPLE DATA & START SERVER =================
const PORT = process.env.PORT || 5000;

sequelize.sync({ alter: true }).then(async () => {
  console.log('Database connected & synced successfully.');

  const adminExists = await User.findOne({ where: { role: 'Admin' } });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await User.create({
      name: 'System Admin',
      email: 'admin@rental.com',
      password: hashedPassword,
      role: 'Admin',
    });

    const owner = await User.create({
      name: 'Ali Raza (Owner)',
      email: 'owner@rental.com',
      password: await bcrypt.hash('owner123', 10),
      role: 'Property Owner',
    });

    await User.create({
      name: 'Usman Tariq (Tenant)',
      email: 'tenant@rental.com',
      password: await bcrypt.hash('tenant123', 10),
      role: 'Tenant',
    });

    await Property.bulkCreate([
      {
        ownerId: owner.id,
        title: 'Modern 3-Bedroom Apartment in DHA Phase 6',
        description: 'Spacious luxury apartment with balcony, dedicated parking, and 24/7 security.',
        location: 'DHA Phase 6, Lahore',
        rent: 95000,
        propertyType: 'Apartment',
        bedrooms: 3,
        bathrooms: 3,
        images: [
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267',
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688',
        ],
        availabilityStatus: 'Available',
      },
      {
        ownerId: owner.id,
        title: 'Cozy 1-Bedroom Studio Near Gulberg Main Boulevard',
        description: 'Ideal for students and working professionals with high-speed internet.',
        location: 'Gulberg III, Lahore',
        rent: 42000,
        propertyType: 'Studio',
        bedrooms: 1,
        bathrooms: 1,
        images: ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2'],
        availabilityStatus: 'Available',
      },
    ]);

    console.log('Seeded Admin, Owner, Tenant, and Sample Properties.');
  }

  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}).catch((err) => {
  console.error('Database Sync Error:', err);
});

import { Sequelize, DataTypes } from 'sequelize';

const databaseUrl = process.env.DATABASE_URL;

export const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      logging: false,
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: './property_rental.sqlite',
      logging: false,
    });

// User Model (Admin, Property Owner, Tenant)
export const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: {
    type: DataTypes.ENUM('Admin', 'Property Owner', 'Tenant'),
    defaultValue: 'Tenant',
  },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
});

// Property Model
export const Property = sequelize.define('Property', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  ownerId: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  location: { type: DataTypes.STRING, allowNull: false },
  rent: { type: DataTypes.FLOAT, allowNull: false },
  propertyType: { type: DataTypes.STRING, allowNull: false }, // Apartment, House, Studio, Commercial
  bedrooms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  bathrooms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  images: { type: DataTypes.JSON, defaultValue: [] }, // Array of image URLs
  availabilityStatus: {
    type: DataTypes.ENUM('Available', 'Rented', 'Maintenance'),
    defaultValue: 'Available',
  },
  isReported: { type: DataTypes.BOOLEAN, defaultValue: false },
  reportReason: { type: DataTypes.STRING, allowNull: true },
});

// RentalApplication Model
export const RentalApplication = sequelize.define('RentalApplication', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  propertyId: { type: DataTypes.INTEGER, allowNull: false },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: true },
  moveInDate: { type: DataTypes.STRING, allowNull: false },
  status: {
    type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
    defaultValue: 'Pending',
  },
});

// VisitRequest Model
export const VisitRequest = sequelize.define('VisitRequest', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  propertyId: { type: DataTypes.INTEGER, allowNull: false },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  visitDate: { type: DataTypes.STRING, allowNull: false },
  visitTime: { type: DataTypes.STRING, allowNull: false },
  notes: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM('Pending', 'Accepted', 'Rejected'),
    defaultValue: 'Pending',
  },
});

// LeaseAgreement Model
export const LeaseAgreement = sequelize.define('LeaseAgreement', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  agreementNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  propertyId: { type: DataTypes.INTEGER, allowNull: false },
  ownerId: { type: DataTypes.INTEGER, allowNull: false },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  startDate: { type: DataTypes.STRING, allowNull: false },
  endDate: { type: DataTypes.STRING, allowNull: false },
  monthlyRent: { type: DataTypes.FLOAT, allowNull: false },
  terms: { type: DataTypes.TEXT, allowNull: false },
  status: {
    type: DataTypes.ENUM('Active', 'Expired', 'Terminated'),
    defaultValue: 'Active',
  },
});

// RentPayment Model
export const RentPayment = sequelize.define('RentPayment', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  receiptNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  leaseId: { type: DataTypes.INTEGER, allowNull: false },
  tenantId: { type: DataTypes.INTEGER, allowNull: false },
  propertyId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.FLOAT, allowNull: false },
  billingMonth: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM
  dueDate: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM-DD
  paidAt: { type: DataTypes.DATE, allowNull: true },
  paymentMethod: { type: DataTypes.STRING, defaultValue: 'Card Simulation' },
  status: {
    type: DataTypes.ENUM('Paid', 'Pending', 'Overdue'),
    defaultValue: 'Pending',
  },
});

// Notification Model
export const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  type: { type: DataTypes.STRING, allowNull: false }, // APPLICATION_UPDATE, RENT_DUE, NEW_APPLICATION, VISIT_UPDATE
  title: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
});

// Relationships
User.hasMany(Property, { foreignKey: 'ownerId', as: 'ownedProperties' });
Property.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

Property.hasMany(RentalApplication, { foreignKey: 'propertyId', onDelete: 'CASCADE' });
RentalApplication.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });
User.hasMany(RentalApplication, { foreignKey: 'tenantId', as: 'applications' });
RentalApplication.belongsTo(User, { foreignKey: 'tenantId', as: 'tenant' });

Property.hasMany(VisitRequest, { foreignKey: 'propertyId', onDelete: 'CASCADE' });
VisitRequest.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });
User.hasMany(VisitRequest, { foreignKey: 'tenantId', as: 'visits' });
VisitRequest.belongsTo(User, { foreignKey: 'tenantId', as: 'tenant' });

Property.hasMany(LeaseAgreement, { foreignKey: 'propertyId' });
LeaseAgreement.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });
User.hasMany(LeaseAgreement, { foreignKey: 'ownerId', as: 'ownerLeases' });
LeaseAgreement.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
User.hasMany(LeaseAgreement, { foreignKey: 'tenantId', as: 'tenantLeases' });
LeaseAgreement.belongsTo(User, { foreignKey: 'tenantId', as: 'tenant' });

LeaseAgreement.hasMany(RentPayment, { foreignKey: 'leaseId', onDelete: 'CASCADE' });
RentPayment.belongsTo(LeaseAgreement, { foreignKey: 'leaseId', as: 'lease' });
Property.hasMany(RentPayment, { foreignKey: 'propertyId' });
RentPayment.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' });
User.hasMany(RentPayment, { foreignKey: 'tenantId' });
RentPayment.belongsTo(User, { foreignKey: 'tenantId', as: 'tenant' });

User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

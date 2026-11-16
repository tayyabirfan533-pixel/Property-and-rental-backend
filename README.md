# Online Property Rental & Management Platform (Backend)

## Overview
Complete flat-root Node.js + Express backend for the Online Property Rental & Management Platform. Supports JWT authentication, three roles (`Admin`, `Property Owner`, `Tenant`), property search/filtering/pagination, duplicate-safe rental applications, property visit scheduling, lease generation, rent payment simulation & receipts, in-app notifications, and admin analytics.

## Deployment on Render
1. Upload all root files directly to your GitHub repository (no nested directories needed).
2. Create a **New Web Service** on Render connected to your repository.
3. **Build Command:** `npm install`
4. **Start Command:** `node server.js`
5. *(Optional)* Add `JWT_SECRET` in Render Environment Variables.

## Test Credentials (Pre-Seeded)
- **Admin:** `admin@rental.com` / `admin123`
- **Property Owner:** `owner@rental.com` / `owner123`
- **Tenant:** `tenant@rental.com` / `tenant123`

## Key API Endpoints
- **Auth:** `POST /api/auth/register`, `POST /api/auth/login`
- **Properties:** `GET /api/properties` (`?search=`, `?location=`, `?minRent=`, `?maxRent=`, `?propertyType=`, `?bedrooms=`, `?availability=`, `?sortBy=`, `?order=`, `?page=`, `?limit=`), `GET /api/properties/:id`, `POST /api/properties`, `PUT /api/properties/:id`, `DELETE /api/properties/:id`, `POST /api/properties/:id/report`
- **Applications:** `POST /api/applications`, `GET /api/applications`, `PUT /api/applications/:id/status`
- **Visits:** `POST /api/visits`, `GET /api/visits`, `PUT /api/visits/:id/status`
- **Leases:** `POST /api/leases`, `GET /api/leases`
- **Payments:** `GET /api/payments`, `POST /api/payments`, `POST /api/payments/:id/pay`
- **Notifications:** `GET /api/notifications`, `PUT /api/notifications/:id/read`
- **Admin Analytics:** `GET /api/admin/analytics`, `GET /api/admin/users`, `PUT /api/admin/users/:id/status`, `GET /api/admin/reported-properties`

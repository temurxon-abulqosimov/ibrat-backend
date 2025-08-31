const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../server');
const User = require('../models/User');

describe('Authentication API', () => {
  let testUser;
  let authToken;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/ibrat-test');
    
    // Clear test data
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567890',
        password: 'password123',
        role: 'salesperson'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.name).toBe(userData.name);
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.role).toBe(userData.role);
      expect(response.body.token).toBeDefined();

      // Verify user was saved to database
      const savedUser = await User.findById(response.body.user.id);
      expect(savedUser).toBeTruthy();
      expect(savedUser.name).toBe(userData.name);
    });

    it('should not register user with duplicate email', async () => {
      // Create first user
      const user1 = new User({
        name: 'User 1',
        email: 'duplicate@example.com',
        phone: '+1234567890',
        password: 'password123'
      });
      await user1.save();

      // Try to register second user with same email
      const userData = {
        name: 'User 2',
        email: 'duplicate@example.com',
        phone: '+0987654321',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBe('User with this email or phone number already exists');
    });

    it('should not register user with duplicate phone', async () => {
      // Create first user
      const user1 = new User({
        name: 'User 1',
        email: 'user1@example.com',
        phone: '+1234567890',
        password: 'password123'
      });
      await user1.save();

      // Try to register second user with same phone
      const userData = {
        name: 'User 2',
        email: 'user2@example.com',
        phone: '+1234567890',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBe('User with this email or phone number already exists');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate email format', async () => {
      const userData = {
        name: 'Test User',
        email: 'invalid-email',
        phone: '+1234567890',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate phone format', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        phone: 'invalid-phone',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate password length', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567890',
        password: '123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create test user
      testUser = new User({
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567890',
        password: 'password123',
        role: 'salesperson'
      });
      await testUser.save();
    });

    it('should login user with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(loginData.email);
      expect(response.body.token).toBeDefined();

      authToken = response.body.token;
    });

    it('should not login with invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should not login with invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should not login deactivated user', async () => {
      // Deactivate user
      testUser.isActive = false;
      await testUser.save();

      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toBe('Account is deactivated');
    });
  });

  describe('GET /api/auth/me', () => {
    beforeEach(async () => {
      // Create and login test user
      testUser = new User({
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567890',
        password: 'password123',
        role: 'salesperson'
      });
      await testUser.save();

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      authToken = loginResponse.body.token;
    });

    it('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.name).toBe(testUser.name);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.role).toBe(testUser.role);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should not get profile without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.error).toBe('Access denied. No token provided.');
    });

    it('should not get profile with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBe('Invalid token.');
    });
  });

  describe('POST /api/auth/refresh', () => {
    beforeEach(async () => {
      // Create and login test user
      testUser = new User({
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567890',
        password: 'password123',
        role: 'salesperson'
      });
      await testUser.save();

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      authToken = loginResponse.body.token;
    });

    it('should refresh token successfully', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Token refreshed successfully');
      expect(response.body.token).toBeDefined();
      expect(response.body.token).not.toBe(authToken); // New token should be different
    });

    it('should not refresh token for deactivated user', async () => {
      // Deactivate user
      testUser.isActive = false;
      await testUser.save();

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);

      expect(response.body.error).toBe('User not found or inactive');
    });
  });

  describe('POST /api/auth/logout', () => {
    beforeEach(async () => {
      // Create and login test user
      testUser = new User({
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567890',
        password: 'password123',
        role: 'salesperson'
      });
      await testUser.save();

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      authToken = loginResponse.body.token;
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Logout successful');
    });
  });
}); 
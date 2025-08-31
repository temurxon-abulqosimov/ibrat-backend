# 🚀 Quick Setup Guide

## **Option 1: Use Local MongoDB (Recommended for Development)**

### **Step 1: Install MongoDB Locally**
- **Windows**: Download from [MongoDB Download Center](https://www.mongodb.com/try/download/community)
- **Mac**: `brew install mongodb-community`
- **Linux**: `sudo apt install mongodb`

### **Step 2: Start MongoDB Service**
- **Windows**: MongoDB runs as a service automatically
- **Mac**: `brew services start mongodb-community`
- **Linux**: `sudo systemctl start mongodb`

### **Step 3: Start Your Server**
```bash
npm run dev
```

---

## **Option 2: Use MongoDB Atlas (Cloud Database)**

### **Step 1: Create MongoDB Atlas Account**
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create free account
3. Create new cluster
4. Get connection string

### **Step 2: Create .env File**
Create a `.env` file in your project root:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ibrat-leads
JWT_SECRET=your-super-secret-key
PORT=5000
```

### **Step 3: Start Your Server**
```bash
npm run dev
```

---

## **Option 3: Quick Test (No Database)**

If you just want to test the API structure without database:

1. **Comment out MongoDB connection** in `server.js`
2. **Start server** with `npm run dev`
3. **Access Swagger docs** at `http://localhost:5000/api-docs`

---

## **✅ What You'll Get**

Once running, you'll have:

- **🚀 Server**: Running on port 5000
- **📚 Swagger Docs**: `http://localhost:5000/api-docs`
- **🔌 WebSocket**: Real-time communication
- **📱 Health Check**: `http://localhost:5000/health`
- **🔐 Auth APIs**: Login, register, JWT tokens
- **👑 Admin APIs**: System management
- **📞 Operator APIs**: Lead calling interface

---

## **🐛 Troubleshooting**

### **MongoDB Connection Failed**
- Check if MongoDB is running
- Verify connection string
- Check firewall/network settings

### **Twilio Errors**
- **Expected** - system works in simulation mode
- Add Twilio credentials to `.env` for real calls

### **Port Already in Use**
- Change `PORT` in `.env`
- Or kill process using port 5000

---

## **🎯 Next Steps**

1. **Get MongoDB running** (local or cloud)
2. **Start server** with `npm run dev`
3. **Open Swagger docs** to test APIs
4. **Create test users** via `/api/auth/register`
5. **Upload test leads** via `/api/leads/upload-csv`
6. **Test call flow** via operator APIs

---

## **📞 Need Help?**

- Check MongoDB installation
- Verify environment variables
- Look at server console output
- Test with Swagger documentation

**Your backend is ready - just need MongoDB running!** 🎉 
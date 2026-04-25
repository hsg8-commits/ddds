import { config } from 'dotenv';
config();
import mongoose from 'mongoose';

// ─── Connection State ──────────────────────────────────────────────
let isConnected = false;
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RETRY_DELAY_MS = 1000; // 1 second, then exponential backoff

// ─── Exponential Backoff Calculator ────────────────────────────────
const getRetryDelay = (attempt) => {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  // Cap at 30 seconds
  return Math.min(delay, 30_000);
};

// ─── Connect to MongoDB with Connection Pool + Exponential Backoff ─
const connectToDB = async () => {
  if (isConnected) {
    console.log('✅ Already connected to MongoDB');
    return;
  }

  try {
    console.log(`🔗 Connecting to MongoDB (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);

    await mongoose.connect(process.env.MONGODB_URI, {
      // ─── Connection Pool Configuration ───────────────────────
      maxPoolSize: 20,          // Maximum number of connections in the pool
      minPoolSize: 5,           // Minimum number of connections to keep open
      maxIdleTimeMS: 30_000,    // Close idle connections after 30s
      waitQueueTimeoutMS: 5_000, // Timeout waiting for available connection
      serverSelectionTimeoutMS: 5_000, // Server selection timeout

      // ─── Socket Settings ─────────────────────────────────────
      socketTimeoutMS: 45_000,  // Socket inactivity timeout
      family: 4,                // Force IPv4 (skip IPv6 resolution delay)
      keepAlive: true,
      keepAliveInitialDelay: 300_000,

      // ─── Retry & Performance ─────────────────────────────────
      retryWrites: true,
      retryReads: true,
      readPreference: 'secondaryPreferred', // Distribute read load
      compressors: 'zlib',                  // Enable wire compression
    });

    isConnected = true;
    isReconnecting = false;
    reconnectAttempts = 0;
    console.log('✅ Connected to MongoDB successfully');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);

    if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      isReconnecting = true;
      reconnectAttempts++;
      const delay = getRetryDelay(reconnectAttempts);
      console.log(`🔄 Retrying connection in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      setTimeout(connectToDB, delay);
    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('❌ Max reconnection attempts reached. Giving up.');
    }
  }
};

// ─── Connection Event Handlers ─────────────────────────────────────
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected. Attempting to reconnect...');
  isConnected = false;
  if (!isReconnecting) {
    isReconnecting = true;
    connectToDB();
  }
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected successfully');
  isConnected = true;
  isReconnecting = false;
  reconnectAttempts = 0;
});

export default connectToDB;

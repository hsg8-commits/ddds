// Enhanced Standalone Socket.IO Server for Telegram Clone
// مع جميع المميزات المفقودة ومحسن للأداء

import { Server } from 'socket.io';
import { createServer } from 'http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB Schemas
const { Schema, model } = mongoose;

// User Schema مع جميع الحقول المطلوبة
const UserSchema = new Schema({
  name: { type: String, required: true, minLength: 3, maxLength: 20 },
  lastName: { type: String, default: "", maxLength: 20 },
  username: {
    type: String,
    required: true,
    minLength: 3,
    maxLength: 20,
    unique: true,
  },
  phone: { type: String, required: true, unique: true },
  avatar: { type: String, required: false },
  biography: { type: String, default: "", maxLength: 70 },
  type: { type: String, enum: ["private"], default: "private" },
  status: { type: String, enum: ["online", "offline"], default: "offline" },
  password: { type: String, required: true },
  roomMessageTrack: {
    type: [{ roomId: String, scrollPos: Number }],
    default: [],
  },
}, { timestamps: true });

// Message Schema مع دعم الملفات
const MessageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: 'User' },
  message: String,
  roomID: { type: Schema.Types.ObjectId, ref: 'Room' },
  seen: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  voiceData: {
    src: String,
    duration: Number,
    playedBy: [String],
  },
  fileData: Schema.Types.Mixed, 
  createdAt: { type: Date, default: Date.now },
  tempId: String,
  status: String,
  isEdited: Boolean,
  hideFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  replays: [{ type: Schema.Types.ObjectId, ref: 'Message' }],
  replayedTo: Schema.Types.Mixed,
  pinnedAt: Date,
  readTime: Date,
});

// Room Schema مع دعم القنوات والمجموعات
const RoomSchema = new Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ["group", "private", "channel"],
    required: true,
  },
  avatar: String,
  description: String,
  biography: String,
  link: String,
  creator: { type: Schema.Types.ObjectId, ref: 'User' },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  admins: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  messages: [{ type: Schema.Types.ObjectId, ref: 'Message', required: true }],
  medias: [Schema.Types.Mixed],
  locations: [Schema.Types.Mixed],
}, { timestamps: true });

// Location Schema للمواقع
const LocationSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  roomID: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  address: String,
}, { timestamps: true });

// Media Schema للملفات
const MediaSchema = new Schema({
  file: { type: Buffer, required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  roomID: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  filename: String,
  mimetype: String,
  size: Number,
}, { timestamps: true });

// Namespace Schema للتنظيم
const NamespaceSchema = new Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  rooms: [{ type: Schema.Types.ObjectId, ref: 'Room' }],
  creator: { type: Schema.Types.ObjectId, ref: 'User' },
  admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

// Call Schema لتخزين سجل المكالمات
const CallSchema = new Schema({
  caller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  roomID: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  type: { type: String, enum: ['voice', 'video'], required: true },
  status: { 
    type: String, 
    enum: ['initiated', 'ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed'], 
    default: 'initiated' 
  },
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  duration: { type: Number, default: 0 }, // بالثواني
  direction: { 
    type: String, 
    enum: ['outgoing', 'incoming'], 
    required: true 
  },
}, { timestamps: true });

// Create models
const User = mongoose.models.User || model('User', UserSchema);
const Message = mongoose.models.Message || model('Message', MessageSchema);
const Room = mongoose.models.Room || model('Room', RoomSchema);
const Location = mongoose.models.Location || model('Location', LocationSchema);
const Media = mongoose.models.Media || model('Media', MediaSchema);
const Namespace = mongoose.models.Namespace || model('Namespace', NamespaceSchema);
const Call = mongoose.models.Call || model('Call', CallSchema);

// Connect to MongoDB with improved error handling
const connectDB = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log('✅ Connected to MongoDB successfully');
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initialize HTTP Server
const PORT = process.env.PORT || 3001;
const httpServer = createServer();

// Initialize Socket.IO with optimized settings
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
  allowEIO3: true,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

// Global state
let typings = [];
let onlineUsers = [];
let activeRooms = new Map(); // لتتبع الغرف النشطة

// Utility functions
const formatTime = (timestamp, use24Hour = false) => {
  const date = new Date(timestamp);
  if (use24Hour) {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
  return date.toLocaleTimeString('en-US', { 
    hour12: true, 
    hour: 'numeric', 
    minute: '2-digit' 
  });
};

const updateUserOnlineStatus = async (userID, status) => {
  try {
    await User.findByIdAndUpdate(userID, { status });
  } catch (error) {
    console.error('Error updating user status:', error);
  }
};

// Helper function للعثور على المستخدم عبر Socket ID أو User ID
const findUserSocket = (identifier, bySocketId = false) => {
  if (bySocketId) {
    return onlineUsers.find(u => u.socketID === identifier);
  }
  return onlineUsers.find(u => u.userID === identifier.toString());
};

// Connect to DB before starting server
await connectDB();

console.log('🚀 Socket.IO server initializing...');

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  // ==========================================
  // 🔥 User Data Management
  // ==========================================
  socket.on('updateUserData', async (data) => {
    try {
      const { userID, avatar, name, lastName, biography, username, phone } = data;
      
      console.log('📝 Updating user data:', { userID, name, lastName, username });

      if (!userID) {
        socket.emit('updateUserData', { 
          success: false, 
          error: 'User ID is required' 
        });
        return;
      }

      const updateFields = {};
      if (avatar !== undefined) updateFields.avatar = avatar;
      if (name !== undefined) updateFields.name = name;
      if (lastName !== undefined) updateFields.lastName = lastName;
      if (biography !== undefined) updateFields.biography = biography;
      if (username !== undefined) updateFields.username = username;
      if (phone !== undefined) updateFields.phone = phone;

      const updatedUser = await User.findByIdAndUpdate(
        userID,
        { $set: updateFields },
        { new: true, runValidators: true }
      ).select('name lastName username avatar biography phone _id');

      if (!updatedUser) {
        socket.emit('updateUserData', { 
          success: false, 
          error: 'User not found' 
        });
        return;
      }

      console.log('✅ User updated successfully:', updatedUser.username);

      socket.emit('updateUserData', { 
        success: true,
        user: updatedUser
      });

      // Update user data in all active sessions
      const userSockets = onlineUsers.filter(u => u.userID === userID.toString());
      userSockets.forEach(({ socketID }) => {
        const targetSocket = io.sockets.sockets.get(socketID);
        if (targetSocket) {
          targetSocket.emit('userDataUpdated', {
            avatar: updatedUser.avatar,
            name: updatedUser.name,
            lastName: updatedUser.lastName,
            biography: updatedUser.biography,
            username: updatedUser.username,
          });
        }
      });

      // Update participant data in rooms
      if (avatar !== undefined || name !== undefined || lastName !== undefined) {
        const userRooms = await Room.find({
          participants: userID,
          type: 'private'
        }).select('_id participants');

        userRooms.forEach(room => {
          socket.to(room._id.toString()).emit('participantAvatarUpdate', {
            userID,
            avatar: updatedUser.avatar,
            name: updatedUser.name,
            lastName: updatedUser.lastName,
          });
        });
      }

    } catch (updateError) {
      console.error('❌ Error updating user data:', updateError);
      socket.emit('updateUserData', { 
        success: false, 
        error: updateError.message || 'Failed to update user data' 
      });
    }
  });

  socket.on('getUserData', async (userID) => {
    try {
      console.log('📥 Fetching user data for:', userID);

      const user = await User.findById(userID)
        .select('name lastName username avatar biography phone _id status');

      if (!user) {
        socket.emit('getUserData', { 
          success: false, 
          error: 'User not found' 
        });
        return;
      }

      socket.emit('getUserData', { 
        success: true,
        user: user
      });

    } catch (fetchError) {
      console.error('❌ Error fetching user data:', fetchError);
      socket.emit('getUserData', { 
        success: false, 
        error: 'Failed to fetch user data' 
      });
    }
  });

  // ==========================================
  // 🔥 Enhanced Message Handling
  // ==========================================
  socket.on('newMessage', async (data, callback) => {
    try {
      const { roomID, sender, message, replayData, voiceData = null, tempId, fileData = null } = data;
      
      const msgData = {
        sender,
        message,
        roomID,
        seen: [],
        voiceData,
        fileData,
        createdAt: Date.now(),
        tempId,
        status: 'sent',
      };

      let newMsg = await Message.findOne({ tempId }).lean();

      if (newMsg) {
        // Message already exists
        const populatedMsg = await Message.findById(newMsg._id)
          .populate('sender', 'name lastName username avatar _id')
          .lean();

        socket.to(roomID).emit('newMessage', {
          ...populatedMsg,
          replayedTo: replayData ? replayData.replayedTo : null,
        });

        socket.emit('newMessageIdUpdate', { tempId, _id: newMsg._id });
        io.to(roomID).emit('lastMsgUpdate', populatedMsg);
        io.to(roomID).emit('updateLastMsgData', { msgData: populatedMsg, roomID });
        
        if (callback) callback({ success: true, _id: newMsg._id });
      } else {
        // Create new message
        newMsg = await Message.create(msgData);
        const populatedMsg = await Message.findById(newMsg._id)
          .populate('sender', 'name lastName username avatar _id')
          .lean();

        socket.to(roomID).emit('newMessage', {
          ...populatedMsg,
          replayedTo: replayData ? replayData.replayedTo : null,
        });

        socket.emit('newMessageIdUpdate', { tempId, _id: populatedMsg._id });
        io.to(roomID).emit('lastMsgUpdate', populatedMsg);
        io.to(roomID).emit('updateLastMsgData', { msgData: populatedMsg, roomID });

        // Handle reply
        if (replayData) {
          await Message.findOneAndUpdate(
            { _id: replayData.targetID },
            { $push: { replays: newMsg._id } }
          );
          newMsg.replayedTo = replayData.replayedTo;
          await newMsg.save();
        }

        await Room.findOneAndUpdate(
          { _id: roomID },
          { $push: { messages: newMsg._id } }
        );

        if (callback) callback({ success: true, _id: newMsg._id });
      }
    } catch (messageError) {
      console.error('❌ Error in newMessage:', messageError);
      if (callback) callback({ success: false, error: 'Failed to send message' });
    }
  });

  // ==========================================
  // 🔥 Enhanced Room Management
  // ==========================================
  socket.on('createRoom', async ({ newRoomData, message = null }) => {
    try {
      let isRoomExist = false;

      if (newRoomData.type === 'private') {
        isRoomExist = await Room.findOne({ name: newRoomData.name });
      } else {
        isRoomExist = await Room.findOne({ _id: newRoomData._id });
      }

      if (!isRoomExist) {
        let msgData = message;

        if (newRoomData.type === 'private') {
          newRoomData.participants = newRoomData.participants.map((data) => data?._id);
        }

        const newRoom = await Room.create(newRoomData);

        if (msgData) {
          const newMsg = await Message.create({
            ...msgData,
            roomID: newRoom._id,
          });
          msgData = newMsg;
          newRoom.messages = [newMsg._id];
          await newRoom.save();
        }

        socket.join(newRoom._id.toString());

        const otherRoomMembersSocket = onlineUsers.filter((data) =>
          newRoom.participants.some((pID) => data.userID === pID.toString())
        );

        otherRoomMembersSocket.forEach(({ socketID: userSocketID }) => {
          const targetSocket = io.sockets.sockets.get(userSocketID);
          if (targetSocket) targetSocket.join(newRoom._id.toString());
        });

        io.to(newRoom._id.toString()).emit('createRoom', newRoom);
      }
    } catch (createRoomError) {
      console.error('❌ Error in createRoom:', createRoomError);
    }
  });

  socket.on('joinRoom', async ({ roomID, userID }) => {
    try {
      const roomTarget = await Room.findOne({ _id: roomID });

      if (roomTarget && !roomTarget?.participants.includes(userID)) {
        roomTarget.participants = [...roomTarget.participants, userID];
        socket.join(roomID);
        await roomTarget.save();

        io.to(roomID).emit('joinRoom', { userID, roomID });
      }
    } catch (joinError) {
      console.error('❌ Error in joinRoom:', joinError);
    }
  });

  socket.on('deleteRoom', async (roomID) => {
    try {
      io.to(roomID).emit('deleteRoom', roomID);
      io.to(roomID).emit('updateLastMsgData', { msgData: null, roomID });
      await Room.findOneAndDelete({ _id: roomID });
      await Message.deleteMany({ roomID });
    } catch (deleteRoomError) {
      console.error('❌ Error in deleteRoom:', deleteRoomError);
    }
  });

  // ==========================================
  // 🔥 Enhanced Voice Message Handling
  // ==========================================
  socket.on('listenToVoice', async ({ userID, voiceID, roomID }) => {
    try {
      io.to(roomID).emit('listenToVoice', { userID, voiceID, roomID });

      const targetMessage = await Message.findOne({ _id: voiceID }).exec();
      const voiceMessagePlayedByList = targetMessage?.voiceData?.playedBy || [];

      if (!voiceMessagePlayedByList?.includes(userID)) {
        const userIdWithSeenTime = `${userID}_${new Date().toISOString()}`;
        targetMessage.voiceData.playedBy = [
          ...voiceMessagePlayedByList,
          userIdWithSeenTime,
        ];
        await targetMessage.save();
      }
    } catch (voiceError) {
      console.error('❌ Error in listenToVoice:', voiceError);
    }
  });

  socket.on('getVoiceMessageListeners', async (msgID) => {
    try {
      const message = await Message.findOne({ _id: msgID });
      const playedByIds = message?.voiceData?.playedBy || [];

      const playedByIdsWithoutSeenTime = playedByIds.map((id) =>
        id?.includes('_') ? id.split('_')[0] : id
      );

      const playedByUsersData = await User.find({
        _id: { $in: playedByIdsWithoutSeenTime },
      }).lean();

      const findUserSeenTimeWithID = (id) => {
        let seenTime = null;
        playedByIds.some((str) => {
          const extractedID = str?.includes('_') ? str.split('_')[0] : str;
          if (extractedID === id.toString()) {
            seenTime = str?.includes('_') ? str.split('_')[1] : null;
            return true;
          }
        });
        return seenTime;
      };

      const userDataWithSeenDate = playedByUsersData.map((data) => ({
        ...data,
        seenTime: findUserSeenTimeWithID(data._id.toString()),
      }));

      socket.emit('getVoiceMessageListeners', userDataWithSeenDate);
    } catch (listenersError) {
      console.error('❌ Error in getVoiceMessageListeners:', listenersError);
    }
  });

  // ==========================================
  // 🔥 Enhanced Message Operations
  // ==========================================
  socket.on('pinMessage', async (id, roomID, isLastMessage) => {
    try {
      io.to(roomID).emit('pinMessage', id);

      const messageToPin = await Message.findOne({ _id: id });

      messageToPin.pinnedAt = messageToPin?.pinnedAt ? null : Date.now();
      await messageToPin.save();

      if (isLastMessage) {
        io.to(roomID).emit('updateLastMsgData', {
          msgData: messageToPin,
          roomID,
        });
      }
    } catch (pinError) {
      console.error('❌ Error in pinMessage:', pinError);
    }
  });

  socket.on('updateLastMsgPos', async ({ roomID, scrollPos, userID, shouldEmitBack = true }) => {
    try {
      const userTarget = await User.findOne({ _id: userID });

      if (!userTarget) {
        console.log(`User not found: ${userID}`);
        return;
      }

      if (!userTarget.roomMessageTrack) {
        userTarget.roomMessageTrack = [];
      }

      const isRoomExist = userTarget.roomMessageTrack.some((room) => {
        if (room.roomId === roomID) {
          room.scrollPos = scrollPos;
          return true;
        }
      });

      if (!isRoomExist) {
        userTarget.roomMessageTrack.push({ roomId: roomID, scrollPos });
      }

      if (shouldEmitBack) {
        socket.emit('updateLastMsgPos', userTarget.roomMessageTrack);
      }

      await userTarget.save();
    } catch (posError) {
      console.error('❌ Error updating user data:', posError);
    }
  });

  // ==========================================
  // 🔥 Get Rooms with Enhanced Performance
  // ==========================================
  socket.on('getRooms', async (userID) => {
    try {
      const userRooms = await Room.find({
        participants: { $in: userID },
      }).lean();

      const userPvs = await Room.find({
        $and: [{ participants: { $in: userID } }, { type: 'private' }],
      })
        .lean()
        .populate('participants');

      for (const room of userRooms) {
        room.participants =
          userPvs.find((data) => data._id.toString() === room._id.toString())?.participants ||
          room.participants;
        socket.join(room._id.toString());
        
        // تتبع الغرف النشطة
        if (!activeRooms.has(room._id.toString())) {
          activeRooms.set(room._id.toString(), new Set());
        }
        activeRooms.get(room._id.toString()).add(socket.id);
      }

      const existingUser = onlineUsers.find((user) => user.socketID === socket.id);
      if (!existingUser) {
        onlineUsers.push({ socketID: socket.id, userID: userID.toString() });
        await updateUserOnlineStatus(userID, 'online');
      }

      io.to([...socket.rooms]).emit('updateOnlineUsers', onlineUsers);

      const getRoomsData = async () => {
        const promises = userRooms.map(async (room) => {
          const lastMsgData = room?.messages?.length
            ? await Message.findOne({ _id: room.messages.at(-1)?._id })
                .populate('sender', 'name lastName username avatar _id')
            : null;

          const notSeenCount = await Message.find({
            $and: [
              { roomID: room?._id },
              { sender: { $ne: userID } },
              { seen: { $nin: [userID] } },
            ],
          });

          return {
            ...room,
            lastMsgData,
            notSeenCount: notSeenCount?.length,
          };
        });

        return Promise.all(promises);
      };

      const rooms = await getRoomsData();
      socket.emit('getRooms', rooms);
    } catch (roomsError) {
      console.error('❌ Error in getRooms:', roomsError);
    }
  });

  // ==========================================
  // 🔥 Enhanced Joining Room
  // ==========================================
  socket.on('joining', async (query, defaultRoomData = null) => {
    try {
      let roomData = await Room.findOne({
        $or: [{ _id: query }, { name: query }],
      })
        .populate('messages')
        .populate('medias')
        .populate('locations')
        .populate({
          path: 'messages',
          populate: { 
            path: 'sender', 
            model: User,
            select: 'name lastName username avatar _id'
          },
        })
        .populate({
          path: 'messages',
          populate: {
            path: 'replays',
            model: Message,
          },
        });

      if (roomData && roomData?.type === 'private') {
        await roomData.populate('participants');
      }

      if (!roomData?._id) {
        roomData = defaultRoomData;
      }

      socket.emit('joining', roomData);
    } catch (joiningError) {
      console.error('❌ Error in joining:', joiningError);
    }
  });

  // ==========================================
  // 🔥 Message Operations (Delete, Edit, Seen)
  // ==========================================
  socket.on('deleteMsg', async ({ forAll, msgID, roomID }) => {
    try {
      if (forAll) {
        io.to(roomID).emit('deleteMsg', msgID);
        const userID = findUserSocket(socket.id, true)?.userID;

        await Message.findOneAndDelete({ _id: msgID });

        const lastMsg = await Message.findOne({
          roomID: roomID,
          hideFor: { $nin: [userID] },
        })
        .sort({ createdAt: -1 })
        .populate('sender', 'name lastName username avatar _id');

        if (lastMsg) {
          io.to(roomID).emit('updateLastMsgData', { msgData: lastMsg, roomID });
        }

        await Room.findOneAndUpdate({ _id: roomID }, { $pull: { messages: msgID } });
      } else {
        socket.emit('deleteMsg', msgID);

        const userID = findUserSocket(socket.id, true)?.userID;

        if (userID) {
          await Message.findOneAndUpdate(
            { _id: msgID },
            { $push: { hideFor: userID } }
          );
        }

        const lastMsg = await Message.findOne({
          roomID: roomID,
          hideFor: { $nin: [userID] },
        })
        .sort({ createdAt: -1 })
        .populate('sender', 'name lastName username avatar _id');

        if (lastMsg) {
          socket.emit('updateLastMsgData', { msgData: lastMsg, roomID });
        }
      }
    } catch (deleteError) {
      console.error('❌ Error in deleteMsg:', deleteError);
    }
  });

  socket.on('editMessage', async ({ msgID, editedMsg, roomID }) => {
    try {
      io.to(roomID).emit('editMessage', { msgID, editedMsg, roomID });
      const updatedMsgData = await Message.findOneAndUpdate(
        { _id: msgID },
        { message: editedMsg, isEdited: true }
      ).lean();

      if (!updatedMsgData) return;

      const lastMsg = await Message.findOne({ roomID })
        .sort({ createdAt: -1 })
        .lean()
        .populate('sender', 'name lastName username avatar _id');

      if (lastMsg && lastMsg._id.toString() === msgID) {
        io.to(roomID).emit('updateLastMsgData', {
          roomID,
          msgData: { ...updatedMsgData, message: editedMsg },
        });
      }
    } catch (editError) {
      console.error('❌ Error in editMessage:', editError);
    }
  });

  socket.on('seenMsg', async (seenData) => {
    try {
      io.to(seenData.roomID).emit('seenMsg', seenData);
      await Message.findOneAndUpdate(
        { _id: seenData.msgID },
        {
          $addToSet: { seen: seenData.seenBy }, // استخدام addToSet لتجنب التكرار
          $set: { readTime: new Date(seenData.readTime) },
        }
      );
    } catch (seenError) {
      console.error('❌ Error in seenMsg:', seenError);
    }
  });

  // ==========================================
  // 🔥 Room Member Management
  // ==========================================
  socket.on('getRoomMembers', async ({ roomID }) => {
    try {
      const roomMembers = await Room.findOne({ _id: roomID }).populate(
        'participants'
      );
      socket.emit('getRoomMembers', roomMembers.participants);
    } catch (err) {
      console.log(err);
      socket.emit('error', { message: 'Unknown error, try later.' });
    }
  });

  socket.on('updateRoomData', async (updatedFields) => {
    try {
      const { roomID, ...fieldsToUpdate } = updatedFields;

      const updatedRoom = await Room.findOneAndUpdate(
        { _id: roomID },
        { $set: fieldsToUpdate },
        { new: true }
      );

      if (!updatedRoom) {
        throw new Error('Room not found');
      }

      io.to(updatedFields.roomID).emit('updateRoomData', updatedRoom);

      const otherRoomMembersSocket = onlineUsers.filter((data) =>
        updatedRoom.participants.some((pID) => {
          if (data.userID === pID.toString()) return true;
        })
      );

      otherRoomMembersSocket.forEach(({ socketID: userSocketID }) => {
        const targetSocket = io.sockets.sockets.get(userSocketID);
        if (targetSocket) {
          targetSocket.emit('updateRoomData', updatedRoom);
        }
      });
    } catch (updateRoomError) {
      console.error('❌ Error updating room:', updateRoomError);
      socket.emit('updateRoomDataError', { message: updateRoomError.message });
    }
  });

  // ==========================================
  // 🔥 Typing Indicators
  // ==========================================
  socket.on('typing', (data) => {
    if (!typings.includes(data.sender.name)) {
      io.to(data.roomID).emit('typing', data);
      typings.push(data.sender.name);
    }
  });

  socket.on('stop-typing', (data) => {
    typings = typings.filter((tl) => tl !== data.sender.name);
    io.to(data.roomID).emit('stop-typing', data);
  });

  // ==========================================
  // 🔥 WebRTC Call Signaling with Call History
  // ==========================================
  
  // Helper function to find user socket
  const findUserSocket = (userId) => {
    return onlineUsers.find(u => u.userID === userId);
  };
  
  // بدء المكالمة
  socket.on('call:initiate', async ({ to, from, signal, type, roomID }) => {
    try {
      console.log(`📞 Call initiate - from:`, from, `to:`, to, `type: ${type}`);
      
      // التحقق من صحة البيانات
      if (!to?._id || !from?._id || !roomID || !signal || !type) {
        console.error('❌ Missing required call data:', { to, from, roomID, type });
        socket.emit('call:error', { message: 'بيانات المكالمة غير مكتملة' });
        return;
      }

      // البحث عن المستخدم المستهدف
      const targetUser = findUserSocket(to._id);
      
      console.log(`🔍 Looking for user ${to._id}, found: ${!!targetUser}`);
      console.log('📊 Online users:', onlineUsers.map(u => ({ userID: u.userID, socketID: u.socketID })));

      // إنشاء سجل المكالمة للمتصل (outgoing)
      const callerCall = await Call.create({
        caller: from._id,
        receiver: to._id,
        roomID,
        type,
        status: 'initiated',
        direction: 'outgoing',
        startTime: new Date(),
      });

      if (targetUser && targetUser.socketID) {
        const targetSocket = io.sockets.sockets.get(targetUser.socketID);
        
        if (targetSocket) {
          // إنشاء سجل المكالمة للمستقبل (incoming)
          const receiverCall = await Call.create({
            caller: from._id,
            receiver: to._id,
            roomID,
            type,
            status: 'ringing',
            direction: 'incoming',
            startTime: new Date(),
          });

          console.log(`📲 Sending call to user ${to._id} on socket ${targetUser.socketID}`);
          
          // إرسال المكالمة للمستقبل
          targetSocket.emit('call:incoming', {
            from,
            signal,
            type,
            roomID,
            callId: receiverCall._id.toString(),
          });
          
          // تحديث حالة المكالمة للمتصل
          await Call.findByIdAndUpdate(callerCall._id, { status: 'ringing' });
          
          // إرسال تأكيد للمتصل
          socket.emit('call:initiated', { 
            callId: callerCall._id.toString(),
            status: 'ringing'
          });

          console.log(`✅ Call sent successfully to ${to._id}`);
        } else {
          console.error(`❌ Target socket not found for user ${to._id}`);
          await Call.findByIdAndUpdate(callerCall._id, { 
            status: 'failed',
            endTime: new Date()
          });
          socket.emit('call:user-offline', { userId: to._id });
        }
      } else {
        console.log(`📴 User ${to._id} is offline`);
        
        // المستخدم غير متصل
        await Call.findByIdAndUpdate(callerCall._id, { 
          status: 'missed',
          endTime: new Date()
        });

        // إنشاء رسالة مكالمة فائتة
        try {
          const missedCallMessage = await Message.create({
            sender: from._id,
            roomID,
            message: `مكالمة ${type === 'video' ? 'فيديو' : 'صوتية'} فائتة`,
            status: 'sent',
            fileData: {
              type: 'call',
              callType: type,
              callStatus: 'missed',
              callId: callerCall._id.toString(),
            }
          });

          await Room.findByIdAndUpdate(roomID, {
            $push: { messages: missedCallMessage._id }
          });

          const populatedMsg = await Message.findById(missedCallMessage._id)
            .populate('sender', 'name lastName avatar username _id');

          io.to(roomID).emit('newMessage', populatedMsg);
          console.log(`📝 Missed call message created for room ${roomID}`);
        } catch (msgError) {
          console.error('❌ Error creating missed call message:', msgError);
        }
        
        socket.emit('call:user-offline', { userId: to._id });
      }
    } catch (error) {
      console.error('❌ Error in call:initiate:', error);
      socket.emit('call:error', { message: 'فشل في بدء المكالمة' });
    }
  });

  // قبول المكالمة
  socket.on('call:accept', async ({ to, signal, roomID, callId }) => {
    try {
      console.log(`✅ Call accepted in room: ${roomID}, callId: ${callId}`);
      
      // تحديث حالة المكالمة
      if (callId) {
        await Call.findByIdAndUpdate(callId, { 
          status: 'accepted',
          endTime: null
        });
      }

      // البحث عن مكالمة المتصل وتحديثها
      const callerCalls = await Call.find({
        roomID,
        caller: to,
        status: { $in: ['initiated', 'ringing'] }
      }).sort({ startTime: -1 }).limit(1);

      if (callerCalls.length > 0) {
        await Call.findByIdAndUpdate(callerCalls[0]._id, { status: 'accepted' });
      }
      
      const targetUser = findUserSocket(to);
      
      if (targetUser && targetUser.socketID) {
        const targetSocket = io.sockets.sockets.get(targetUser.socketID);
        if (targetSocket) {
          targetSocket.emit('call:accepted', { signal, roomID });
          console.log(`✅ Call acceptance sent to ${to}`);
        }
      } else {
        console.error(`❌ Could not find target user ${to} for call acceptance`);
      }
    } catch (error) {
      console.error('❌ Error in call:accept:', error);
      socket.emit('call:error', { message: 'فشل في قبول المكالمة' });
    }
  });

  // إلغاء المكالمة من المتصل (قبل الرد)
  socket.on('call:cancel', async ({ to, roomID, callId, from }) => {
    try {
      console.log(`🚫 Call cancelled by caller in room: ${roomID}`);
      
      const endTime = new Date();
      
      // تحديث حالة المكالمة إلى cancelled/missed
      if (callId) {
        await Call.findByIdAndUpdate(callId, { 
          status: 'missed',
          endTime 
        });
      }

      // تحديث جميع المكالمات المرتبطة
      await Call.updateMany(
        {
          roomID,
          status: { $in: ['initiated', 'ringing'] }
        },
        { 
          status: 'missed',
          endTime 
        }
      );

      // إرسال إشعار للمستقبل لإيقاف الرنين
      const targetUser = findUserSocket(to);
      if (targetUser && targetUser.socketID) {
        const targetSocket = io.sockets.sockets.get(targetUser.socketID);
        if (targetSocket) {
          targetSocket.emit('call:cancelled', { roomID });
          console.log(`🚫 Call cancellation sent to ${to}`);
        }
      }

      // إنشاء رسالة مكالمة ملغاة للمتصل
      if (from && roomID) {
        try {
          const call = await Call.findById(callId);
          if (call) {
            const cancelledCallMessage = await Message.create({
              sender: from,
              roomID,
              message: `مكالمة ${call.type === 'video' ? 'فيديو' : 'صوتية'} ملغاة`,
              status: 'sent',
              fileData: {
                type: 'call',
                callType: call.type,
                callStatus: 'cancelled',
                callId: callId,
              }
            });

            await Room.findByIdAndUpdate(roomID, {
              $push: { messages: cancelledCallMessage._id }
            });

            const populatedMsg = await Message.findById(cancelledCallMessage._id)
              .populate('sender', 'name lastName avatar username _id');

            io.to(roomID).emit('newMessage', populatedMsg);
          }
        } catch (msgError) {
          console.error('❌ Error creating cancelled call message:', msgError);
        }
      }
    } catch (error) {
      console.error('❌ Error in call:cancel:', error);
    }
  });

  // رفض المكالمة
  socket.on('call:reject', async ({ to, roomID, callId, from }) => {
    try {
      console.log(`❌ Call rejected in room: ${roomID}, callId: ${callId}`);
      
      const endTime = new Date();
      
      // تحديث حالة المكالمة المرفوضة
      if (callId) {
        await Call.findByIdAndUpdate(callId, { 
          status: 'rejected',
          endTime 
        });
      }

      // تحديث مكالمات المتصل
      await Call.updateMany(
        {
          roomID,
          caller: to,
          status: { $in: ['initiated', 'ringing'] }
        },
        { 
          status: 'rejected',
          endTime 
        }
      );

      // إنشاء رسالة مكالمة مرفوضة
      if (from && to && callId) {
        try {
          const call = await Call.findById(callId);
          if (call) {
            const rejectedCallMessage = await Message.create({
              sender: to,
              roomID,
              message: `مكالمة ${call.type === 'video' ? 'فيديو' : 'صوتية'} مرفوضة`,
              status: 'sent',
              fileData: {
                type: 'call',
                callType: call.type,
                callStatus: 'rejected',
                callId: callId,
              }
            });

            await Room.findByIdAndUpdate(roomID, {
              $push: { messages: rejectedCallMessage._id }
            });

            const populatedMsg = await Message.findById(rejectedCallMessage._id)
              .populate('sender', 'name lastName avatar username _id');

            io.to(roomID).emit('newMessage', populatedMsg);
            console.log(`📝 Rejected call message created`);
          }
        } catch (msgError) {
          console.error('❌ Error creating rejected call message:', msgError);
        }
      }
      
      const targetUser = findUserSocket(to);
      
      if (targetUser && targetUser.socketID) {
        const targetSocket = io.sockets.sockets.get(targetUser.socketID);
        if (targetSocket) {
          targetSocket.emit('call:rejected', { roomID });
          console.log(`❌ Call rejection sent to ${to}`);
        }
      }
    } catch (error) {
      console.error('❌ Error in call:reject:', error);
    }
  });

  // إنهاء المكالمة
  socket.on('call:end', async ({ to, roomID, callId, from, duration }) => {
    try {
      console.log(`📴 Call ended in room: ${roomID}, duration: ${duration}s, callId: ${callId}`);
      
      const endTime = new Date();
      
      // تحديث المكالمة المحددة
      if (callId) {
        await Call.findByIdAndUpdate(callId, { 
          status: 'ended',
          endTime,
          duration: duration || 0
        });
      }

      // تحديث جميع المكالمات النشطة في هذه الغرفة
      await Call.updateMany(
        {
          roomID,
          status: { $in: ['accepted', 'ringing', 'initiated'] },
          $or: [
            { endTime: null },
            { endTime: { $exists: false } }
          ]
        },
        { 
          status: 'ended',
          endTime,
          duration: duration || 0
        }
      );

      // إنشاء رسالة إنهاء المكالمة
      if (from && roomID && duration !== undefined && callId) {
        try {
          const call = await Call.findById(callId);
          if (call) {
            const formatDuration = (seconds) => {
              if (seconds < 60) return `${seconds} ثانية`;
              const minutes = Math.floor(seconds / 60);
              const secs = seconds % 60;
              return secs > 0 ? `${minutes} دقيقة و ${secs} ثانية` : `${minutes} دقيقة`;
            };

            const endedCallMessage = await Message.create({
              sender: from,
              roomID,
              message: `مكالمة ${call.type === 'video' ? 'فيديو' : 'صوتية'} - المدة: ${formatDuration(duration)}`,
              status: 'sent',
              fileData: {
                type: 'call',
                callType: call.type,
                callStatus: 'ended',
                callId: callId,
                duration: duration
              }
            });

            await Room.findByIdAndUpdate(roomID, {
              $push: { messages: endedCallMessage._id }
            });

            const populatedMsg = await Message.findById(endedCallMessage._id)
              .populate('sender', 'name lastName avatar username _id');

            io.to(roomID).emit('newMessage', populatedMsg);
            console.log(`📝 Call ended message created`);
          }
        } catch (msgError) {
          console.error('❌ Error creating call ended message:', msgError);
        }
      }
      
      // إرسال إنهاء المكالمة للطرف الآخر
      if (to) {
        const targetUser = findUserSocket(to);
        
        if (targetUser && targetUser.socketID) {
          const targetSocket = io.sockets.sockets.get(targetUser.socketID);
          if (targetSocket) {
            targetSocket.emit('call:ended', { roomID });
          }
        }
      }
      
      // إرسال لجميع أعضاء الغرفة
      io.to(roomID).emit('call:ended', { roomID });
      console.log(`📴 Call end broadcast completed`);
    } catch (error) {
      console.error('❌ Error in call:end:', error);
    }
  });

  // تبادل ICE candidates للاتصال
  socket.on('call:ice-candidate', ({ to, candidate, roomID }) => {
    try {
      const targetUser = findUserSocket(to);
      
      if (targetUser && targetUser.socketID) {
        const targetSocket = io.sockets.sockets.get(targetUser.socketID);
        if (targetSocket) {
          targetSocket.emit('call:ice-candidate', { candidate, roomID });
        }
      }
    } catch (error) {
      console.error('❌ Error in call:ice-candidate:', error);
    }
  });

  // جلب سجل المكالمات للمستخدم
  socket.on('getCallHistory', async ({ userID, limit = 50, skip = 0 }) => {
    try {
      console.log(`📋 Fetching call history for user: ${userID}`);
      
      const calls = await Call.find({
        $or: [
          { caller: userID },
          { receiver: userID }
        ]
      })
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit)
      .populate('caller', 'name lastName avatar username _id')
      .populate('receiver', 'name lastName avatar username _id')
      .populate('roomID', '_id name type')
      .lean();

      socket.emit('callHistory', { 
        success: true,
        calls: calls.map(call => ({
          ...call,
          direction: call.caller._id.toString() === userID ? 'outgoing' : 'incoming'
        }))
      });
    } catch (error) {
      console.error('❌ Error fetching call history:', error);
      socket.emit('callHistory', { 
        success: false,
        error: 'Failed to fetch call history' 
      });
    }
  });

  // جلب سجل المكالمات لغرفة محددة
  socket.on('getRoomCallHistory', async ({ roomID, limit = 20 }) => {
    try {
      console.log(`📋 Fetching call history for room: ${roomID}`);
      
      const calls = await Call.find({ roomID })
        .sort({ startTime: -1 })
        .limit(limit)
        .populate('caller', 'name lastName avatar username _id')
        .populate('receiver', 'name lastName avatar username _id')
        .lean();

      socket.emit('roomCallHistory', { 
        success: true,
        calls 
      });
    } catch (error) {
      console.error('❌ Error fetching room call history:', error);
      socket.emit('roomCallHistory', { 
        success: false,
        error: 'Failed to fetch room call history' 
      });
    }
  });

  // ==========================================
  // 🔥 Connection Handling
  // ==========================================
  socket.on('disconnect', async () => {
    console.log('❌ Client disconnected:', socket.id);
    
    const disconnectedUser = findUserSocket(socket.id, true);
    
    // إزالة من قائمة المستخدمين المتصلين
    onlineUsers = onlineUsers.filter((data) => data.socketID !== socket.id);
    
    // إزالة من الغرف النشطة
    activeRooms.forEach((roomSockets, roomId) => {
      roomSockets.delete(socket.id);
      if (roomSockets.size === 0) {
        activeRooms.delete(roomId);
      }
    });
    
    if (disconnectedUser) {
      await updateUserOnlineStatus(disconnectedUser.userID, 'offline');
      console.log(`👋 User ${disconnectedUser.userID} went offline`);
    }
    
    // تحديث المستخدمين المتصلين للجميع
    io.emit('updateOnlineUsers', onlineUsers);
  });

  // معالجة الأخطاء في الـ socket
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Enhanced Socket.IO server is running on port ${PORT}`);
  console.log(`📡 CORS enabled for all origins`);
  console.log(`⚡ Performance optimizations enabled`);
  console.log(`🔥 All features from routes server integrated`);
  console.log(`📞 Call system with history enabled`);
});

// Enhanced error handling
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // لا نخرج من العملية مباشرة في الإنتاج
  console.error('Stack trace:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // لا نخرج من العملية مباشرة في الإنتاج
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Process terminated');
  });
});

export default io;

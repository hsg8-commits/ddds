// AI Message Handler for Medical Assistant
// معالج رسائل الذكاء الصناعي الطبي

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AI_USERNAME = "medical_ai_assistant";

// System message للذكاء الصناعي الطبي
const SYSTEM_MESSAGE = {
  role: "system",
  content: `أنت مساعد طبي ذكي ومحترف. مهمتك هي تقديم نصائح طبية عامة ومساعدة المستخدمين في فهم أعراضهم بشكل أفضل. 

تذكر دائماً:
1. أنت لست بديلاً عن الطبيب الحقيقي
2. في الحالات الطارئة، انصح المستخدم بالذهاب للطبيب فوراً
3. قدم معلومات طبية دقيقة وموثوقة
4. استخدم لغة بسيطة وواضحة
5. كن لطيفاً ومتعاطفاً مع مخاوف المرضى
6. إذا كنت غير متأكد من شيء، اذكر ذلك بوضوح
7. شجع المستخدم على زيارة الطبيب للتشخيص الدقيق

الرد يجب أن يكون بالعربية وبأسلوب ودود ومحترف.`,
};

/**
 * معالج رسائل AI
 * @param {Object} params - معاملات الرسالة
 * @param {Object} params.Message - نموذج الرسالة
 * @param {Object} params.Room - نموذج الغرفة
 * @param {Object} params.User - نموذج المستخدم
 * @param {Object} params.io - Socket.io instance
 * @param {string} params.roomID - معرف الغرفة
 * @param {string} params.userMessage - رسالة المستخدم
 * @param {string} params.senderID - معرف المرسل
 */
export async function handleAIMessage({ Message, Room, User, io, roomID, userMessage, senderID }) {
  try {
    // 1. الحصول على حساب AI
    const aiUser = await User.findOne({ username: AI_USERNAME });
    if (!aiUser) {
      console.error('❌ AI user not found');
      return;
    }

    // 2. التحقق من أن المرسل ليس AI نفسه (لتجنب التكرار)
    if (senderID === aiUser._id.toString()) {
      return;
    }

    // 3. جلب آخر 10 رسائل من المحادثة للسياق
    const room = await Room.findById(roomID).populate({
      path: 'messages',
      options: { sort: { createdAt: -1 }, limit: 10 },
      populate: { path: 'sender', select: 'name _id' }
    });

    if (!room) {
      console.error('❌ Room not found');
      return;
    }

    // 4. بناء تاريخ المحادثة
    const conversationHistory = room.messages
      .reverse()
      .map(msg => ({
        role: msg.sender._id.toString() === aiUser._id.toString() ? 'assistant' : 'user',
        content: msg.message || 'رسالة صوتية أو ملف',
      }))
      .slice(-10); // آخر 10 رسائل فقط

    // 5. استدعاء OpenAI API
    let aiResponse;
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          SYSTEM_MESSAGE,
          ...conversationHistory,
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      aiResponse = response.choices[0]?.message?.content || "عذراً، لم أتمكن من الرد في الوقت الحالي.";
    } catch (openaiError) {
      console.error('❌ OpenAI API Error:', openaiError);
      aiResponse = "عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.";
    }

    // 6. إنشاء رسالة رد من AI
    const aiMessageData = {
      sender: aiUser._id,
      message: aiResponse,
      roomID: roomID,
      seen: [],
      voiceData: null,
      fileData: null,
      createdAt: new Date(),
      tempId: `ai_${Date.now()}`,
      status: 'sent',
    };

    const aiMessage = await Message.create(aiMessageData);
    const populatedAiMessage = await Message.findById(aiMessage._id)
      .populate('sender', 'name lastName username avatar _id')
      .lean();

    // 7. إضافة الرسالة للغرفة
    await Room.findOneAndUpdate(
      { _id: roomID },
      { $push: { messages: aiMessage._id } }
    );

    // 8. إرسال الرسالة عبر Socket.io
    io.to(roomID).emit('newMessage', populatedAiMessage);
    io.to(roomID).emit('lastMsgUpdate', populatedAiMessage);
    io.to(roomID).emit('updateLastMsgData', { msgData: populatedAiMessage, roomID });

    console.log('✅ AI responded to message in room:', roomID);

  } catch (error) {
    console.error('❌ Error in AI message handler:', error);
  }
}

/**
 * التحقق من أن الغرفة تحتوي على AI
 * @param {Object} Room - نموذج الغرفة
 * @param {Object} User - نموذج المستخدم  
 * @param {string} roomID - معرف الغرفة
 * @returns {Promise<boolean>}
 */
export async function isAIRoom(Room, User, roomID) {
  try {
    const aiUser = await User.findOne({ username: AI_USERNAME });
    if (!aiUser) return false;

    const room = await Room.findById(roomID);
    if (!room) return false;

    return room.participants.some(p => p.toString() === aiUser._id.toString());
  } catch (error) {
    console.error('❌ Error checking AI room:', error);
    return false;
  }
}

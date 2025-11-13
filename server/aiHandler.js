// AI Message Handler for Medical Assistant with Typing Status
// معالج رسائل الذكاء الصناعي الطبي مع حالة الكتابة

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AI_USERNAME = "medical_ai";
const AI_TYPING_DELAY = 2000; // مدة إظهار حالة الكتابة بالميلي ثانية

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
8. عند تحليل الصور الطبية (فحوصات، أشعة، نتائج تحاليل)، قدم شرحاً تفصيلياً وواضحاً
9. عند استلام ملفات، تحقق من نوعها وقدم المساعدة المناسبة

الرد يجب أن يكون بالعربية وبأسلوب ودود ومحترف.`,
};

/**
 * دالة إظهار حالة الكتابة للذكاء الاصطناعي
 */
async function showAITypingStatus(io, roomID, aiUser, isTyping = true) {
  try {
    const typingData = {
      userId: aiUser._id,
      userName: aiUser.name,
      userAvatar: aiUser.avatar,
      isTyping: isTyping,
      isAI: true,
      timestamp: new Date()
    };

    // إرسال حالة الكتابة لجميع المستخدمين في الغرفة
    io.to(roomID).emit('userTyping', typingData);
    
    console.log(`🤖 AI typing status: ${isTyping ? 'يكتب...' : 'توقف عن الكتابة'}`);
  } catch (error) {
    console.error('❌ Error showing AI typing status:', error);
  }
}

/**
 * دالة محاكاة كتابة تدريجية (كتابة الرد حرف بحرف)
 */
async function simulateTypingEffect(io, roomID, aiUser, message) {
  try {
    const words = message.split(' ');
    let currentMessage = '';
    
    for (let i = 0; i < words.length; i++) {
      currentMessage += (i > 0 ? ' ' : '') + words[i];
      
      // إرسال الجزء المكتوب حتى الآن
      io.to(roomID).emit('aiTypingProgress', {
        aiId: aiUser._id,
        partialMessage: currentMessage,
        isComplete: i === words.length - 1
      });
      
      // تأخير قصير بين الكلمات لمحاكاة الكتابة الطبيعية
      await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 100));
    }
  } catch (error) {
    console.error('❌ Error in typing simulation:', error);
  }
}

/**
 * معالج رسائل AI مع دعم الصور والملفات وحالة الكتابة
 */
export async function handleAIMessage({ Message, Room, User, io, roomID, userMessage, senderID, fileData = null }) {
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

    // 3. إظهار أن AI بدأ في الكتابة فوراً
    await showAITypingStatus(io, roomID, aiUser, true);

    // 4. جلب آخر 10 رسائل من المحادثة للسياق
    const room = await Room.findById(roomID).populate({
      path: 'messages',
      options: { sort: { createdAt: -1 }, limit: 10 },
      populate: { path: 'sender', select: 'name _id' }
    });

    if (!room) {
      console.error('❌ Room not found');
      await showAITypingStatus(io, roomID, aiUser, false);
      return;
    }

    // 5. بناء تاريخ المحادثة
    const conversationHistory = room.messages
      .reverse()
      .map(msg => ({
        role: msg.sender._id.toString() === aiUser._id.toString() ? 'assistant' : 'user',
        content: msg.message || 'رسالة صوتية أو ملف',
      }))
      .slice(-10);

    // 6. استدعاء OpenAI API مع دعم الصور
    let aiResponse;
    try {
      const messages = [SYSTEM_MESSAGE, ...conversationHistory];
      
      // التحقق من وجود صورة أو ملف
      if (fileData && fileData.url) {
        const fileType = fileData.type?.toLowerCase() || '';
        
        if (fileType.includes('image') || fileData.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          console.log('📸 Analyzing image with AI...');
          
          messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: userMessage || "يرجى تحليل هذه الصورة الطبية وإعطاء تفاصيل عما تراه"
              },
              {
                type: "image_url",
                image_url: {
                  url: fileData.url,
                  detail: "high"
                }
              }
            ]
          });
        } else {
          messages.push({
            role: "user",
            content: `تم إرسال ملف: ${fileData.name || 'ملف'} (${fileType}). ${userMessage || ''}`
          });
        }
      } else {
        messages.push({ role: "user", content: userMessage });
      }

      // محاكاة وقت المعالجة (1-3 ثواني)
      const processingDelay = 1000 + Math.random() * 2000;
      await new Promise(resolve => setTimeout(resolve, processingDelay));

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 800,
      });

      aiResponse = response.choices[0]?.message?.content || "عذراً، لم أتمكن من الرد في الوقت الحالي.";
    } catch (openaiError) {
      console.error('❌ OpenAI API Error:', openaiError);
      aiResponse = "عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.";
    }

    // 7. محاكاة الكتابة التدريجية (اختياري)
    await simulateTypingEffect(io, roomID, aiUser, aiResponse);

    // 8. تأخير قصير قبل إرسال الرد النهائي
    await new Promise(resolve => setTimeout(resolve, 500));

    // 9. إخفاء حالة الكتابة
    await showAITypingStatus(io, roomID, aiUser, false);

    // 10. إنشاء رسالة رد من AI
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

    // 11. إضافة الرسالة للغرفة
    await Room.findOneAndUpdate(
      { _id: roomID },
      { $push: { messages: aiMessage._id } }
    );

    // 12. إرسال الرسالة النهائية عبر Socket.io
    io.to(roomID).emit('newMessage', populatedAiMessage);
    io.to(roomID).emit('lastMsgUpdate', populatedAiMessage);
    io.to(roomID).emit('updateLastMsgData', { msgData: populatedAiMessage, roomID });

    console.log('✅ AI responded to message in room:', roomID);

  } catch (error) {
    console.error('❌ Error in AI message handler:', error);
    
    // في حالة الخطأ، تأكد من إخفاء حالة الكتابة
    const aiUser = await User.findOne({ username: AI_USERNAME });
    if (aiUser) {
      await showAITypingStatus(io, roomID, aiUser, false);
    }
  }
}

/**
 * التحقق من أن الغرفة تحتوي على AI
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

/**
 * دالة تحديث حالة AI إلى متصل
 */
export async function setAIOnlineStatus(User, io) {
  try {
    const aiUser = await User.findOneAndUpdate(
      { username: AI_USERNAME },
      { 
        status: 'online',
        lastSeen: new Date()
      },
      { new: true }
    );

    if (aiUser) {
      // إرسال حالة الاتصال لجميع المستخدمين
      io.emit('userStatusUpdate', {
        userId: aiUser._id,
        status: 'online',
        isAI: true,
        timestamp: new Date()
      });
      
      console.log('🤖 AI status updated to ONLINE');
    }
  } catch (error) {
    console.error('❌ Error updating AI status:', error);
  }
}

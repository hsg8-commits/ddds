import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/db";
import User from "@/schemas/userSchema";
import Room from "@/schemas/roomSchema";
import { verifyToken } from "@/utils/auth";

// GET - جلب جميع المستخدمين (للأدمن فقط)
export async function GET(request: NextRequest) {
  try {
    // التحقق من صلاحية الأدمن
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const currentUser = await User.findById(decoded.userId);

    if (!currentUser || currentUser.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
    }

    await connectDB();

    // جلب جميع المستخدمين مع ترتيب حسب التاريخ
    const users = await User.find({})
      .select("name lastName username phone role isPaid status avatar createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

// PUT - تحديث مستخدم (تغيير الدور أو حالة الدفع)
export async function PUT(request: NextRequest) {
  try {
    // التحقق من صلاحية الأدمن
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const currentUser = await User.findById(decoded.userId);

    if (!currentUser || currentUser.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
    }

    await connectDB();

    const { userId, role, isPaid } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const updateFields: any = {};
    if (role !== undefined) updateFields.role = role;
    if (isPaid !== undefined) updateFields.isPaid = isPaid;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true }
    ).select("name lastName username phone role isPaid status avatar");

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // إذا تم تغيير الدور إلى طبيب أو من طبيب، قد نحتاج لتحديث المحادثات
    // لكن في تصميمنا، الأطباء يظهرون تلقائياً حسب role=doctor

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update user" },
      { status: 500 }
    );
  }
}

// DELETE - حذف مستخدم
export async function DELETE(request: NextRequest) {
  try {
    // التحقق من صلاحية الأدمن
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const currentUser = await User.findById(decoded.userId);

    if (!currentUser || currentUser.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
    }

    await connectDB();

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // التحقق من أن المستخدم المراد حذفه ليس أدمن
    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (userToDelete.role === "admin") {
      return NextResponse.json({ error: "Cannot delete admin users" }, { status: 403 });
    }

    // حذف المستخدم
    await User.findByIdAndDelete(userId);

    // حذف أو تحديث الغرف المرتبطة (اختياري)
    // يمكن إزالة المستخدم من participants في جميع الغرف
    await Room.updateMany(
      { participants: userId },
      { $pull: { participants: userId } }
    );

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete user" },
      { status: 500 }
    );
  }
}

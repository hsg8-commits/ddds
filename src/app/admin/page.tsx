"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  _id: string;
  name: string;
  lastName: string;
  username: string;
  phone: string;
  role: "user" | "doctor" | "admin";
  isPaid: boolean;
  status: "online" | "offline";
  avatar?: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "user" | "doctor" | "admin">("all");
  
  // Login form states
  const [showLoginForm, setShowLoginForm] = useState(true);
  const [loginData, setLoginData] = useState({ phone: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/currentuser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      const data = await response.json();

      if (data && data.role === "admin") {
        setIsAuthenticated(true);
        setCurrentUser(data);
        setShowLoginForm(false);
        fetchUsers();
      } else {
        setShowLoginForm(true);
      }
    } catch (err) {
      console.error("Auth error:", err);
      setShowLoginForm(true);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });

      const data = await response.json();

      if (response.ok && data.role === "admin") {
        setIsAuthenticated(true);
        setCurrentUser(data);
        setShowLoginForm(false);
        fetchUsers();
      } else if (data.role !== "admin") {
        setLoginError("هذا الحساب ليس حساب أدمن!");
      } else {
        setLoginError(data.message || "خطأ في تسجيل الدخول");
      }
    } catch (err) {
      console.error(err);
      setLoginError("حدث خطأ أثناء تسجيل الدخول");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    setIsAuthenticated(false);
    setCurrentUser(null);
    setShowLoginForm(true);
    setUsers([]);
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/users");
      const data = await response.json();

      if (data.success) {
        setUsers(data.users);
      } else {
        setError(data.error || "Failed to fetch users");
      }
    } catch (err) {
      setError("Error fetching users");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: "user" | "doctor" | "admin") => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });

      const data = await response.json();

      if (data.success) {
        setUsers(users.map(u => u._id === userId ? { ...u, role: newRole } : u));
      } else {
        alert(data.error || "Failed to update user role");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating user role");
    }
  };

  const toggleUserPaid = async (userId: string, isPaid: boolean) => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isPaid: !isPaid }),
      });

      const data = await response.json();

      if (data.success) {
        setUsers(users.map(u => u._id === userId ? { ...u, isPaid: !isPaid } : u));
      } else {
        alert(data.error || "Failed to update user payment status");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating user payment status");
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستخدم؟")) return;

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (data.success) {
        setUsers(users.filter(u => u._id !== userId));
      } else {
        alert(data.error || "Failed to delete user");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting user");
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.phone.includes(searchQuery);
    
    const matchesRole = filterRole === "all" || user.role === filterRole;
    
    return matchesSearch && matchesRole;
  });

  const doctorsCount = users.filter(u => u.role === "doctor").length;
  const regularUsersCount = users.filter(u => u.role === "user").length;
  const paidUsersCount = users.filter(u => u.isPaid).length;

  // Login Form
  if (showLoginForm) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900" dir="rtl">
        <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">🛡️ لوحة تحكم الأدمن</h1>
            <p className="text-gray-400">دوائك الطبي والذكي</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {loginError && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-gray-300 text-sm font-bold mb-2">
                رقم الهاتف
              </label>
              <input
                type="text"
                value={loginData.phone}
                onChange={(e) => setLoginData({ ...loginData, phone: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
                placeholder="مثال: 777777777"
                required
                disabled={loginLoading}
              />
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-bold mb-2">
                كلمة السر
              </label>
              <input
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
                placeholder="********"
                required
                disabled={loginLoading}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loginLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="text-gray-400 hover:text-white text-sm transition"
              >
                ← العودة للصفحة الرئيسية
              </button>
            </div>
          </form>

          <div className="mt-8 p-4 bg-gray-700/50 rounded-lg">
            <p className="text-xs text-gray-400 text-center">
              💡 للدخول كأدمن، استخدم حساب الأدمن الخاص بك
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Admin Dashboard
  return (
    <div className="min-h-screen bg-gray-900 text-white" dir="rtl">
      {/* Header */}
      <div className="bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">لوحة تحكم الأدمن</h1>
              <p className="text-gray-400 mt-1">إدارة المستخدمين والأطباء</p>
              {currentUser && (
                <p className="text-sm text-blue-400 mt-1">
                  مرحباً، {currentUser.name} {currentUser.lastName}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/")}
                className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg transition"
              >
                الصفحة الرئيسية
              </button>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg transition"
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800 p-6 rounded-lg">
            <h3 className="text-gray-400 text-sm">إجمالي المستخدمين</h3>
            <p className="text-3xl font-bold mt-2">{users.length}</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg">
            <h3 className="text-gray-400 text-sm">الأطباء</h3>
            <p className="text-3xl font-bold mt-2 text-green-400">{doctorsCount}</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg">
            <h3 className="text-gray-400 text-sm">المستخدمون العاديون</h3>
            <p className="text-3xl font-bold mt-2 text-blue-400">{regularUsersCount}</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg">
            <h3 className="text-gray-400 text-sm">المستخدمون المدفوعون</h3>
            <p className="text-3xl font-bold mt-2 text-yellow-400">{paidUsersCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="البحث بالاسم أو اسم المستخدم أو رقم الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as any)}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
              >
                <option value="all">جميع المستخدمين</option>
                <option value="user">مستخدمون عاديون</option>
                <option value="doctor">أطباء</option>
                <option value="admin">مدراء</option>
              </select>
            </div>
            <button
              onClick={fetchUsers}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition"
            >
              تحديث
            </button>
          </div>
        </div>

        {/* Users Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-xl">جاري التحميل...</div>
          </div>
        ) : error ? (
          <div className="bg-red-900/50 text-red-200 p-4 rounded-lg">
            خطأ: {error}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-right text-sm font-semibold">الاسم</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">اسم المستخدم</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">رقم الهاتف</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">الدور</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">الحالة</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">مدفوع</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredUsers.map((user) => (
                    <tr key={user._id} className="hover:bg-gray-700/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {user.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user.name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                              {user.name.charAt(0)}
                            </div>
                          )}
                          <span>{user.name} {user.lastName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">@{user.username}</td>
                      <td className="px-6 py-4">{user.phone}</td>
                      <td className="px-6 py-4">
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user._id, e.target.value as any)}
                          className={`px-3 py-1 rounded-lg text-sm ${
                            user.role === "doctor"
                              ? "bg-green-600 text-white"
                              : user.role === "admin"
                              ? "bg-red-600 text-white"
                              : "bg-blue-600 text-white"
                          }`}
                        >
                          <option value="user">مستخدم</option>
                          <option value="doctor">طبيب</option>
                          <option value="admin">أدمن</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs ${
                            user.status === "online"
                              ? "bg-green-600 text-white"
                              : "bg-gray-600 text-gray-300"
                          }`}
                        >
                          {user.status === "online" ? "متصل" : "غير متصل"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleUserPaid(user._id, user.isPaid)}
                          className={`px-3 py-1 rounded-lg text-sm ${
                            user.isPaid
                              ? "bg-yellow-600 text-white"
                              : "bg-gray-600 text-gray-300"
                          }`}
                        >
                          {user.isPaid ? "مدفوع ✓" : "غير مدفوع"}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => deleteUser(user._id)}
                          className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg text-sm transition"
                          disabled={user.role === "admin"}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                لا توجد نتائج مطابقة للبحث
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

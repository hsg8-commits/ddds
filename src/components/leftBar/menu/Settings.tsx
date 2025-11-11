import { MdDeleteOutline, MdOutlineLockClock, MdCall } from "react-icons/md";
import LeftBarContainer from "./LeftBarContainer";
import { BsThreeDotsVertical } from "react-icons/bs";
import { GoBell, GoPencil } from "react-icons/go";
import {
  IoChatbubbleEllipsesOutline,
  IoLogOutOutline,
  IoSettingsOutline,
} from "react-icons/io5";

import { TbCameraPlus } from "react-icons/tb";
import { GoShieldCheck } from "react-icons/go";
import { AiOutlineQuestionCircle } from "react-icons/ai";
import { MdLanguage } from "react-icons/md";
import Image from "next/image";
import MenuItem from "@/components/leftBar/menu/MenuItem";
import { useCallback, useEffect, useState, useRef } from "react";
import { deleteFile, logout, toaster } from "@/utils";
import useUserStore from "@/stores/userStore";
import useSockets from "@/stores/useSockets";
import DropDown from "@/components/modules/ui/DropDown";
import LineSeparator from "@/components/modules/LineSeparator";
import Loading from "@/components/modules/ui/Loading";
import Modal from "@/components/modules/ui/Modal";
import { CgLock } from "react-icons/cg";
import { FaRegFolderClosed } from "react-icons/fa6";
import useModalStore from "@/stores/modalStore";
import ProfileImageViewer from "@/components/modules/ProfileImageViewer";
import useGlobalStore from "@/stores/globalStore";
import { uploadToCloudinary } from "@/utils/file/CloudinaryUpload";

// تعريف أنواع البيانات
interface SocketResponse {
  success?: boolean;
  error?: string;
  message?: string;
  user?: {
    _id: string;
    name: string;
    lastName: string;
    username: string;
    avatar: string;
    biography: string;
    phone: string;
  };
}

interface DropDownItem {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
}

interface Props {
  getBack: () => void;
  updateRoute: (route: string) => void;
}

const Settings = ({ getBack, updateRoute }: Props) => {
  const {
    _id,
    avatar,
    name,
    lastName,
    username,
    biography,
    phone,
    setter: userStateUpdater,
  } = useUserStore((state) => state);

  const { setter: modalSetter } = useModalStore((state) => state);
  const { setter: globalSetter } = useGlobalStore((state) => state);
  
  // حالات المكون
  const [isDropDownOpen, setIsDropDownOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const socketTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // تنظيف المؤقتات عند إلغاء تحميل المكون
  useEffect(() => {
    return () => {
      if (socketTimeoutRef.current) {
        clearTimeout(socketTimeoutRef.current);
      }
    };
  }, []);

  // إعادة تعيين خطأ تحميل الصورة عند تغيير الرابط
  useEffect(() => {
    setImageLoadError(false);
  }, [avatar]);

  // 🔥 تحميل بيانات المستخدم عند الدخول والاستماع للتحديثات
  useEffect(() => {
    const socket = useSockets.getState().rooms;
    
    if (socket && _id) {
      // طلب تحميل بيانات المستخدم من الخادم
      socket.emit('getUserData', _id);
      
      // الاستماع لاستجابة جلب البيانات
      const handleGetUserData = (response: SocketResponse) => {
        if (response.success && response.user) {
          userStateUpdater((prev) => ({
            ...prev,
            _id: response.user!._id,
            name: response.user!.name,
            lastName: response.user!.lastName,
            username: response.user!.username,
            phone: response.user!.phone,
            biography: response.user!.biography,
            avatar: response.user!.avatar,
          }));
        }
      };
      
      // الاستماع للتحديثات العامة لبيانات المستخدم من أماكن أخرى
      const handleUserDataUpdate = (data: { 
        avatar?: string; 
        name?: string; 
        lastName?: string; 
        biography?: string; 
        username?: string 
      }) => {
        userStateUpdater((prev) => ({
          ...prev,
          ...(data.avatar !== undefined && { avatar: data.avatar }),
          ...(data.name !== undefined && { name: data.name }),
          ...(data.lastName !== undefined && { lastName: data.lastName }),
          ...(data.biography !== undefined && { biography: data.biography }),
          ...(data.username !== undefined && { username: data.username }),
        }));
        setImageLoadError(false);
      };

      socket.on('getUserData', handleGetUserData);
      socket.on('userDataUpdated', handleUserDataUpdate);

      // تنظيف عند إلغاء المكون
      return () => {
        socket.off('getUserData', handleGetUserData);
        socket.off('userDataUpdated', handleUserDataUpdate);
      };
    }
  }, [_id, userStateUpdater]);

  // دالة معالجة تغيير الصورة ورفعها
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // التحقق من نوع وحجم الملف
    if (!file.type.startsWith('image/')) {
      toaster("error", "الرجاء اختيار صورة فقط");
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toaster("error", "حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت");
      return;
    }

    const previousAvatar = avatar;

    try {
      setIsUploadingAvatar(true);
      setUploadProgress(0);
      setImageLoadError(false);
      
      // رفع الصورة إلى Cloudinary
      const uploadResult = await uploadToCloudinary(
        file,
        (progress) => {
          setUploadProgress(Math.round(progress));
        }
      );

      if (uploadResult.success && uploadResult.url) {
        const socket = useSockets.getState().rooms;
        const newAvatarUrl = uploadResult.url;

        if (!socket) {
          throw new Error("لا يوجد اتصال بالخادم");
        }

        // تحديث الحالة محلياً أولاً للاستجابة السريعة
        userStateUpdater((prev) => ({
          ...prev,
          avatar: `${newAvatarUrl}?t=${Date.now()}`,
        }));

        // إرسال التحديث للخادم
        socket.emit("updateUserData", {
          userID: _id,
          avatar: newAvatarUrl,
        });

        // معالجة استجابة الخادم
        const handleServerResponse = (data: SocketResponse) => {
          if (data && data.success !== false) {
            toaster("success", "تم تحديث صورة الملف الشخصي بنجاح");
          } else {
            // استرجاع الصورة السابقة في حالة فشل الخادم
            userStateUpdater((prev) => ({
              ...prev,
              avatar: previousAvatar,
            }));
            toaster("error", "فشل في حفظ التغييرات على الخادم");
          }
          
          // تنظيف المستمعين والمؤقتات
          socket.off("updateUserData", handleServerResponse);
          if (socketTimeoutRef.current) {
            clearTimeout(socketTimeoutRef.current);
            socketTimeoutRef.current = null;
          }
        };

        socket.on("updateUserData", handleServerResponse);

        // مهلة زمنية للاستجابة من الخادم
        socketTimeoutRef.current = setTimeout(() => {
          socket.off("updateUserData", handleServerResponse);
          socketTimeoutRef.current = null;
          console.warn("Socket response timeout for avatar update");
        }, 15000);

      } else {
        throw new Error(uploadResult.error || "فشل رفع الصورة");
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      const errorMessage = error instanceof Error ? error.message : "حدث خطأ أثناء رفع الصورة";
      toaster("error", errorMessage);
      
      // استرجاع الصورة السابقة
      userStateUpdater((prev) => ({
        ...prev,
        avatar: previousAvatar,
      }));
    } finally {
      setIsUploadingAvatar(false);
      setUploadProgress(0);
      
      // إعادة تعيين قيمة input file
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // دالة فتح محدد الملفات
  const openFileSelector = useCallback(() => {
    if (!isUploadingAvatar) {
      fileInputRef.current?.click();
    }
  }, [isUploadingAvatar]);

  // دالة حذف صورة الملف الشخصي
  const handleDeleteAvatar = useCallback(async () => {
    const previousAvatar = avatar;
    
    try {
      // تحديث الحالة محلياً أولاً
      userStateUpdater((prev) => ({
        ...prev,
        avatar: "",
      }));
      setImageLoadError(false);

      const socket = useSockets.getState().rooms;
      
      if (socket) {
        // إرسال طلب الحذف للخادم
        socket.emit("updateUserData", { 
          userID: _id, 
          avatar: "" 
        });

        // معالجة استجابة الخادم
        const handleDeleteResponse = async (data: SocketResponse) => {
          try {
            if (data && data.success !== false) {
              // حذف الملف من الخادم/Cloudinary
              if (previousAvatar) {
                await deleteFile(previousAvatar);
              }
              toaster("success", "تم حذف الصورة بنجاح");
            } else {
              // استرجاع الصورة في حالة فشل الخادم
              userStateUpdater((prev) => ({
                ...prev,
                avatar: previousAvatar,
              }));
              toaster("error", "فشل في حذف الصورة من الخادم");
            }
          } catch (deleteError) {
            console.error("Error deleting file:", deleteError);
            toaster("warning", "تم حذف الصورة من التطبيق ولكن قد تبقى على الخادم");
          }
          
          socket.off("updateUserData", handleDeleteResponse);
        };

        socket.on("updateUserData", handleDeleteResponse);

        // مهلة زمنية
        setTimeout(() => {
          socket.off("updateUserData", handleDeleteResponse);
        }, 10000);
      } else {
        toaster("warning", "لا يوجد اتصال بالخادم. تم الحذف محلياً فقط");
      }
    } catch (error) {
      console.error("Delete avatar error:", error);
      toaster("error", "حدث خطأ أثناء حذف الصورة");
      
      // استرجاع الصورة السابقة
      userStateUpdater((prev) => ({
        ...prev,
        avatar: previousAvatar,
      }));
    }
  }, [avatar, _id, userStateUpdater]);

  // معالج أخطاء تحميل الصورة
  const handleImageError = useCallback(() => {
    console.error("Image load error for avatar:", avatar);
    setImageLoadError(true);
  }, [avatar]);

  // معالج نجاح تحميل الصورة
  const handleImageLoad = useCallback(() => {
    setImageLoadError(false);
  }, []);

  // عناصر القائمة المنسدلة
  const dropDownItems: DropDownItem[] = [
    {
      title: "تعديل المعلومات",
      onClick: () => {
        updateRoute("edit-info");
        setIsDropDownOpen(false);
      },
      icon: <GoPencil className="size-5 text-gray-400" />,
    },
    {
      title: "تحديث صورة الملف الشخصي",
      onClick: () => {
        openFileSelector();
        setIsDropDownOpen(false);
      },
      icon: <TbCameraPlus className="size-5 text-gray-400" />,
    },
    ...(avatar ? [{
      title: "حذف صورة الملف الشخصي",
      onClick: () => {
        modalSetter({
          isOpen: true,
          title: "حذف الصورة",
          bodyText: "هل أنت متأكد من رغبتك في حذف صورة ملفك الشخصي؟",
          okText: "حذف",
          onSubmit: handleDeleteAvatar,
        });
        setIsDropDownOpen(false);
      },
      icon: <MdDeleteOutline className="size-5 text-gray-400" />,
    }] : []),
    {
      title: "تسجيل الخروج",
      onClick: () => {
        modalSetter({
          isOpen: true,
          title: "تسجيل الخروج",
          bodyText: "هل تريد حقاً تسجيل الخروج؟",
          okText: "نعم",
          onSubmit: logout,
        });
        setIsDropDownOpen(false);
      },
      icon: <IoLogOutOutline className="size-5 pl-0.5 text-gray-400" />,
    },
  ];

  return (
    <div className="w-full">
      <LeftBarContainer
        getBack={() => {
          getBack();
          globalSetter({ showCreateRoomBtn: true });
        }}
        leftHeaderChild={
          <DropDown
            isOpen={isDropDownOpen}
            setIsOpen={setIsDropDownOpen}
            dropDownItems={dropDownItems}
            classNames="top-0 right-0 w-48"
            button={
              <BsThreeDotsVertical className="size-8 cursor-pointer ml-auto p-1.5" />
            }
          />
        }
      >
        <div className="relative text-white min-h-dvh overflow-y-auto">
          <div className="absolute px-4 inset-x-0 w-full">
            <div className="flex items-center gap-3 my-3">
              {/* 🔥 قسم صورة الملف الشخصي - مُصلح */}
              <div
                className={`flex-center relative size-14 ${
                  (!avatar || imageLoadError) ? "bg-darkBlue" : ""
                } overflow-hidden rounded-full`}
              >
                {avatar && !imageLoadError ? (
                  <Image
                    src={avatar}
                    className="cursor-pointer object-cover size-full rounded-full transition-opacity duration-200"
                    width={55}
                    height={55}
                    alt="صورة الملف الشخصي"
                    onClick={() => setIsViewerOpen(true)}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    priority={false}
                    unoptimized={avatar.includes('cloudinary')}
                  />
                ) : (
                  <div 
                    className="flex-center bg-darkBlue shrink-0 text-center font-bold text-xl size-full rounded-full"
                    onClick={() => {
                      if (avatar && !imageLoadError) {
                        setIsViewerOpen(true);
                      }
                    }}
                    title={imageLoadError ? "فشل تحميل الصورة" : "لا توجد صورة"}
                  >
                    {name && name.length > 0 ? name[0].toUpperCase() : "؟"}
                  </div>
                )}

                {/* مؤشر التحميل */}
                {isUploadingAvatar && (
                  <div className="absolute inset-0 bg-black/70 flex-center flex-col gap-1 rounded-full z-10">
                    <Loading size="sm" classNames="text-white" />
                    <span className="text-white text-xs font-bold">
                      {uploadProgress}%
                    </span>
                  </div>
                )}
              </div>

              {/* معلومات المستخدم */}
              <div className="flex justify-center flex-col gap-1">
                <h3 className="font-bold text-lg font-vazirBold line-clamp-1 text-ellipsis">
                  {name && lastName ? `${name} ${lastName}` : name || "بدون اسم"}
                </h3>
                <div className="font-bold text-[14px] text-darkGray font-vazirBold line-clamp-1 whitespace-normal text-nowrap">
                  متصل
                </div>
              </div>
            </div>

            {/* إدخال الملف المخفي */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
              disabled={isUploadingAvatar}
            />

            {/* زر الكاميرا */}
            <button
              type="button"
              className={`absolute right-5 top-12 size-14 rounded-full cursor-pointer bg-darkBlue flex-center transition-opacity duration-200 ${
                isUploadingAvatar ? 'opacity-50 cursor-not-allowed' : 'hover:bg-darkBlue/80'
              }`}
              onClick={openFileSelector}
              disabled={isUploadingAvatar}
              title="تغيير صورة الملف الشخصي"
            >
              <TbCameraPlus className="size-6" />
            </button>
          </div>

          <div className="h-20"></div>

          {/* قسم الحساب */}
          <div className="flex flex-col mt-4">
            <p className="text-darkBlue font-vazirBold py-2 px-4 font-bold text-sm">
              الحساب
            </p>

            <div className="cursor-pointer px-4 py-2 hover:bg-white/5 transition-all duration-200">
              <p className="text-sm">
                +967{" "}
                {phone && phone
                  .toString()
                  .split("")
                  .map((str, index) => {
                    if (index < 7) {
                      return str + ((index + 1) % 3 === 0 ? " " : "");
                    } else {
                      return str;
                    }
                  })}
              </p>
              <p className="text-darkGray text-[13px]">
                اضغط لتغيير رقم الهاتف
              </p>
            </div>

            <LineSeparator />

            <div
              onClick={() => updateRoute("edit-username")}
              className="cursor-pointer px-4 py-2 hover:bg-white/5 transition-all duration-200"
            >
              <p className="text-sm">@{username || "لم يتم تعيين اسم مستخدم"}</p>
              <p className="text-darkGray text-[13px]">اسم المستخدم</p>
            </div>

            <LineSeparator />

            <div
              onClick={() => updateRoute("edit-info")}
              className="cursor-pointer px-4 py-2 hover:bg-white/5 transition-all duration-200"
            >
              <p className="text-sm">{biography || "السيرة الذاتية"}</p>
              <p className="text-darkGray text-[13px]">
                {biography ? "السيرة الذاتية" : "أضف بعض الكلمات عن نفسك"}
              </p>
            </div>
          </div>

          <p className="h-2 w-full bg-black/70 absolute"></p>

          {/* قسم الإعدادات */}
          <div className="flex flex-col pt-1">
            <p className="text-darkBlue font-vazirBold px-4 py-2 mt-2 text-sm">
              الإعدادات
            </p>

            <div className="flex item-center relative">
              <MenuItem
                icon={<IoSettingsOutline />}
                title="الإعدادات العامة"
                onClick={() => {}}
              />
              <span className="flex items-center gap-1 text-xs text-gray-400 absolute right-3 top-4">
                <MdOutlineLockClock fill="teal" size={15} />
                <span>قريباً!</span>
              </span>
            </div>

            <LineSeparator />

            <div className="flex item-center relative">
              <MenuItem
                icon={<GoBell />}
                title="الإشعارات"
                onClick={() => {}}
              />
              <span className="flex items-center gap-1 text-xs text-gray-400 absolute right-3 top-4">
                <MdOutlineLockClock fill="teal" size={15} />
                <span>قريباً!</span>
              </span>
            </div>

            <LineSeparator />

            <MenuItem
              icon={<MdCall />}
              title="المكالمات"
              onClick={() => updateRoute("call-history")}
            />

            <LineSeparator />

            <div className="flex item-center relative">
              <MenuItem
                icon={<CgLock />}
                title="الخصوصية والأمان"
                onClick={() => {}}
              />
              <span className="flex items-center gap-1 text-xs text-gray-400 absolute right-3 top-4">
                <MdOutlineLockClock fill="teal" size={15} />
                <span>قريباً!</span>
              </span>
            </div>

            <LineSeparator />

            <div className="flex item-center relative">
              <MenuItem
                icon={<FaRegFolderClosed />}
                title="مجلدات الدردشة"
                onClick={() => {}}
              />
              <span className="flex items-center gap-1 text-xs text-gray-400 absolute right-3 top-4">
                <MdOutlineLockClock fill="teal" size={15} />
                <span>قريباً!</span>
              </span>
            </div>

            <LineSeparator />

            <span className="relative flex items-center">
              <MenuItem
                icon={<MdLanguage />}
                title="اللغة"
                onClick={() => {}}
              />
              <span className="text-darkBlue absolute right-4 text-sm">
                العربية
              </span>
            </span>
          </div>

          <p className="h-2 w-full bg-black/70 absolute"></p>

          {/* قسم المساعدة */}
          <div className="flex flex-col pt-1">
            <p className="text-darkBlue font-vazirBold px-4 py-2 mt-2 text-sm">
              مساعدة
            </p>

            <MenuItem
              icon={<IoChatbubbleEllipsesOutline />}
              title="طرح سؤال"
              onClick={() => {}}
            />

            <LineSeparator />

            <MenuItem
              icon={<AiOutlineQuestionCircle />}
              title="الأسئلة الشائعة"
              onClick={() =>
                window.open("https://telegram.org/faq?setln=en", "_blank")
              }
            />

            <LineSeparator />

            <MenuItem
              icon={<GoShieldCheck />}
              title="سياسة الخصوصية"
              onClick={() =>
                window.open(
                  "https://telegram.org/privacy/de?setln=en",
                  "_blank"
                )
              }
            />
          </div>

          <div className="w-full py-5 px-4 text-center bg-black/70">
            تواصل خاص وسري - تطبيق مراسلة آمن ومشفر
          </div>
        </div>
      </LeftBarContainer>

      <Modal />
      
      {isViewerOpen && avatar && (
        <ProfileImageViewer
          imageUrl={avatar}
          onClose={() => setIsViewerOpen(false)}
        />
      )}
    </div>
  );
};

export default Settings;

"use client";

import useGlobalStore from "@/stores/globalStore";
import useUserStore from "@/stores/userStore";
import useSockets from "@/stores/useSockets";
import React, {
  lazy,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { BiSearch } from "react-icons/bi";
import { RxHamburgerMenu } from "react-icons/rx";

import ChatCard from "./ChatCard";
import RoomSkeleton from "../modules/ui/RoomSkeleton";
import RoomFolders from "./RoomFolders";
import useConnection from "@/hook/useConnection";
import Message from "@/models/message";
import NotificationPermission from "@/utils/NotificationPermission";
import DoctorCard from "./DoctorCard";

const CreateRoomBtn = lazy(() => import("@/components/leftBar/CreateRoomBtn"));
const LeftBarMenu = lazy(() => import("@/components/leftBar/menu/LeftBarMenu"));
const SearchPage = lazy(() => import("@/components/leftBar/SearchPage"));
const CreateRoom = lazy(() => import("@/components/leftBar/CreateRoom"));

interface Doctor {
  _id: string;
  name: string;
  lastName: string;
  username: string;
  phone: string;
  avatar?: string;
  biography?: string;
  status: "online" | "offline";
}

const LeftBar = () => {
  const [filterBy, setFilterBy] = useState("all");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLeftBarMenuOpen, setIsLeftBarMenuOpen] = useState(false);
  const [leftBarActiveRoute, setLeftBarActiveRoute] = useState("/");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const ringAudioRef = useRef<HTMLAudioElement>(null);

  const userId = useUserStore((state) => state._id);
  const { updater, rooms: roomsSocket } = useSockets((state) => state);
  const { setter: userDataUpdater, rooms: userRooms } = useUserStore(
    (state) => state
  );

  const {
    selectedRoom,
    setter,
    isRoomDetailsShown,
    createRoomType,
    showCreateRoomBtn,
  } = useGlobalStore((state) => state);
  const interactUser = useRef(false);

  useEffect(() => {
    NotificationPermission();
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "TEXTAREA" || target?.tagName === "INPUT") {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  useEffect(() => {
    document.addEventListener("click", () => (interactUser.current = true));

    return () => {
      document.addEventListener("click", () => (interactUser.current = true));
    };
  }, []);

  const playRingSound = useCallback(() => {
    if (ringAudioRef.current && interactUser.current) {
      ringAudioRef.current.currentTime = 0;
      ringAudioRef.current.play();
    }
  }, []);

  useEffect(() => {
    const handleNewMessage = async (newMsg: Message) => {
      if (newMsg.roomID !== selectedRoom?._id || !selectedRoom?._id) {
        if (document.visibilityState !== "visible") {
          if (
            "serviceWorker" in navigator &&
            Notification.permission === "granted"
          ) {
            const registration = await navigator.serviceWorker.ready;
            registration.showNotification(newMsg.sender.name || "", {
              body: newMsg.message || "",
              icon: newMsg.sender.avatar || "/images/favicon.svg",
              data: { url: window.location.href },
              dir: "auto",
              badge: "/images/favicon-96x96.png",
              silent: true,
            });
          }
        }
        playRingSound();
      }
    };

    roomsSocket?.on("newMessage", handleNewMessage);

    return () => {
      roomsSocket?.off("newMessage", handleNewMessage);
    };
  }, [playRingSound, roomsSocket, selectedRoom]);

  const { status, isPageLoaded } = useConnection({
    selectedRoom,
    setter,
    userId,
    userDataUpdater,
    updater,
  });

  // جلب الأطباء عندما يتم اختيار تبويب "الأطباء"
  useEffect(() => {
    if (filterBy === "bot") {
      fetchDoctors();
    }
  }, [filterBy]);

  const fetchDoctors = async () => {
    try {
      setLoadingDoctors(true);
      const response = await fetch("/api/doctors");
      const data = await response.json();
      
      if (data.success) {
        setDoctors(data.doctors);
      }
    } catch (error) {
      console.error("Error fetching doctors:", error);
    } finally {
      setLoadingDoctors(false);
    }
  };

  // دالة مساعدة للحصول على معرف المستخدم
  const getUserId = (participant: any): string => {
    if (typeof participant === 'string') {
      return participant;
    }
    return participant?._id || participant?.id || '';
  };

  const handleDoctorClick = useCallback((doctor: Doctor) => {
    try {
      console.log("🔍 البحث عن محادثة مع الطبيب:", doctor.name);
      console.log("👤 معرف المستخدم الحالي:", userId);
      console.log("👨‍⚕️ معرف الطبيب:", doctor._id);
      
      // البحث عن أي غرفة خاصة تحتوي على الطبيب والمستخدم الحالي
      const existingRoom = userRooms.find((room) => {
        // يجب أن تكون الغرفة خاصة
        if (room.type !== "private") return false;
        
        // الحصول على معرفات المشاركين
        const participantIds = Array.isArray(room.participants) 
          ? room.participants.map(getUserId).filter(Boolean)
          : [];
        
        // التحقق من وجود المستخدم الحالي والطبيب
        const hasCurrentUser = participantIds.includes(userId);
        const hasDoctor = participantIds.includes(doctor._id);
        const isExactlyTwo = participantIds.length === 2;
        
        return hasCurrentUser && hasDoctor && isExactlyTwo;
      });

      if (existingRoom) {
        // وُجدت محادثة موجودة - فتحها مباشرة
        console.log("✅ تم العثور على محادثة موجودة:", existingRoom._id);
        setter({ selectedRoom: existingRoom });
      } else {
        // لا توجد محادثة - إنشاء غرفة جديدة مباشرة عبر Socket
        console.log("❌ لا توجد محادثة موجودة");
        console.log("🆕 إنشاء محادثة جديدة...");
        
        if (roomsSocket) {
          const newRoomData = {
            name: `${doctor.name} ${doctor.lastName || ""}`.trim(),
            type: "private",
            participants: [userId, doctor._id],
            avatar: doctor.avatar || "",
            description: `محادثة مع الطبيب ${doctor.name}`
          };
          
          console.log("📤 إرسال طلب إنشاء غرفة جديدة:", newRoomData);
          roomsSocket.emit("createRoom", { newRoomData });
        } else {
          console.error("❌ Socket غير متصل");
          alert("غير متصل بالخادم. حاول مرة أخرى.");
        }
      }
      
    } catch (error) {
      console.error("❌ خطأ في handleDoctorClick:", error);
      alert("حدث خطأ. حاول مرة أخرى.");
    }
  }, [userId, userRooms, setter, roomsSocket]);

  //Sort rooms by filter and last message time
  const sortedRooms = useMemo(() => {
    const filteredRooms =
      filterBy === "all"
        ? userRooms
        : userRooms.filter((room) => room.type === filterBy);

    return filteredRooms.sort((a, b) => {
      const aTime = a?.lastMsgData?.createdAt
        ? new Date(a.lastMsgData.createdAt).getTime()
        : 0;
      const bTime = b?.lastMsgData?.createdAt
        ? new Date(b.lastMsgData.createdAt).getTime()
        : 0;
      return bTime - aTime;
    });
  }, [userRooms, filterBy]);

  const handleOpenLeftBarMenu = useCallback(() => {
    setIsLeftBarMenuOpen(true);
  }, []);

  const handleCloseLeftBarMenu = useCallback(() => {
    setIsLeftBarMenuOpen(false);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  const containerClassName = useMemo(() => {
    return `size-full h-dvh ${
      selectedRoom ? "hidden" : ""
    } md:block md:w-[40%] lg:w-[35%] ${
      isRoomDetailsShown ? "xl:w-[25%]" : "xl:w-[30%]"
    } relative border-r border-chatBg/[50%]`;
  }, [selectedRoom, isRoomDetailsShown]);

  return (
    <>
      <div className={containerClassName}>
        <LeftBarMenu
          isOpen={isLeftBarMenuOpen}
          closeMenu={handleCloseLeftBarMenu}
          onRouteChanged={setLeftBarActiveRoute}
        />
        {createRoomType && (
          <Suspense>
            <CreateRoom />
          </Suspense>
        )}
        {isPageLoaded && showCreateRoomBtn && <CreateRoomBtn />}
        {isSearchOpen && <SearchPage closeSearch={handleCloseSearch} />}

        {leftBarActiveRoute !== "/settings" && (
          <div
            data-aos-duration="400"
            data-aos="fade-right"
            id="leftBar-container"
            className="flex-1 bg-leftBarBg h-full relative scroll-w-none overflow-y-auto "
          >
            <div
              className="w-full sticky top-0 bg-leftBarBg border-b border-white/5 h-20 overflow-hidden"
              style={{ zIndex: 1 }}
            >
              <div className="flex items-center justify-between gap-6 mx-3">
                <div className="flex items-center flex-1 gap-5 mt-3 w-full text-white">
                  <RxHamburgerMenu
                    size={20}
                    onClick={handleOpenLeftBarMenu}
                    className="cursor-pointer"
                  />
                  <h1 className="font-vazirBold mt-0.5">{status === "Telegram" ? "دوائك الطبي والذكي" : status}</h1>
                </div>
                <BiSearch
                  size={22}
                  onClick={handleOpenSearch}
                  className="cursor-pointer text-white/90 mt-3"
                />
              </div>
              <RoomFolders updateFilterBy={setFilterBy} />
            </div>

            <div
              className="flex flex-col overflow-y-auto overflow-x-hidden scroll-w-none w-full"
              style={{ zIndex: 0 }}
            >
              {filterBy === "bot" ? (
                // عرض الأطباء
                loadingDoctors ? (
                  <RoomSkeleton />
                ) : doctors.length > 0 ? (
                  <div className="flex flex-col">
                    <div className="px-4 py-3 bg-blue-600/20 border-b border-blue-600/30">
                      <h2 className="text-white font-bold text-center">
                        👨‍⚕️ الأطباء المتاحون ({doctors.length})
                      </h2>
                    </div>
                    {doctors.map((doctor) => (
                      <DoctorCard
                        key={doctor._id}
                        doctor={doctor}
                        onClick={() => handleDoctorClick(doctor)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-xl text-white font-bold w-full text-center font-vazirBold pt-20">
                    <div className="flex flex-col items-center gap-4">
                      <span className="text-6xl">👨‍⚕️</span>
                      <p>لا يوجد أطباء متاحون حالياً</p>
                      <p className="text-sm text-gray-400">
                        سيتم إضافة الأطباء قريباً
                      </p>
                    </div>
                  </div>
                )
              ) : (
                // عرض المحادثات العادية
                isPageLoaded ? (
                  sortedRooms.length ? (
                    sortedRooms.map((data) => (
                      <ChatCard {...data} key={data?._id} />
                    ))
                  ) : (
                    <div className="text-xl text-white font-bold w-full text-center font-vazirBold pt-20">
                      لا توجد محادثات
                    </div>
                  )
                ) : (
                  <RoomSkeleton />
                )
              )}
            </div>
          </div>
        )}
        <audio
          ref={ringAudioRef}
          className="hidden invisible opacity-0"
          src="/files/new_msg.mp3"
        ></audio>
      </div>
    </>
  );
};

export default LeftBar;

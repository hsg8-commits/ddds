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

  // دالة للحصول على معرف المستخدم من الكائن
  const getUserId = (participant: any): string => {
    if (typeof participant === 'string') {
      return participant;
    }
    return participant?._id || participant?.id || '';
  };

  const handleDoctorClick = async (doctor: Doctor) => {
    try {
      console.log("🔍 Selecting doctor:", doctor.name, doctor._id);
      console.log("👤 Current user:", userId);
      console.log("📋 All rooms:", userRooms);
      
      // البحث الدقيق عن الغرفة الموجودة
      const existingRoom = userRooms.find((room) => {
        // يجب أن تكون الغرفة خاصة
        if (room.type !== "private") return false;
        
        // الحصول على قائمة المعرفات
        const participantIds = Array.isArray(room.participants) 
          ? room.participants.map(getUserId).filter(Boolean)
          : [];
        
        console.log("🔍 Checking room:", room._id, "participants:", participantIds);
        
        // التحقق من وجود كلا المستخدمين فقط
        const hasCurrentUser = participantIds.includes(userId);
        const hasDoctor = participantIds.includes(doctor._id);
        const isExactlyTwo = participantIds.length === 2;
        
        return hasCurrentUser && hasDoctor && isExactlyTwo;
      });

      if (existingRoom) {
        console.log("✅ Found existing room:", existingRoom._id);
        setter({ selectedRoom: existingRoom });
        return;
      }

      console.log("❌ No existing room found, creating new one...");
      
      // إنشاء غرفة جديدة عبر API بدلاً من Socket مباشرة
      try {
        const response = await fetch("/api/rooms/create-doctor-room", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            doctorId: doctor._id,
            userId: userId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create room");
        }

        const data = await response.json();
        
        if (data.success && data.room) {
          console.log("✅ Room created successfully:", data.room);
          
          // تحديث قائمة الغرف
          const updatedRooms = [...userRooms, data.room];
          userDataUpdater({ rooms: updatedRooms });
          
          // اختيار الغرفة الجديدة
          setter({ selectedRoom: data.room });
        } else {
          console.error("❌ Failed to create room:", data.message);
          alert("فشل في إنشاء المحادثة. حاول مرة أخرى.");
        }
      } catch (apiError) {
        console.error("❌ API Error:", apiError);
        
        // في حالة فشل API، استخدم Socket كخيار احتياطي
        console.log("⚠️ Falling back to Socket method...");
        
        const currentDate = new Date().toISOString();
        const newRoom = {
          _id: `pvt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: `Dr. ${doctor.name} ${doctor.lastName || ''}`.trim(),
          type: "private" as const,
          participants: [userId, doctor._id],
          creator: userId,
          admins: [userId],
          messages: [],
          medias: [],
          locations: [],
          avatar: doctor.avatar || "",
          lastMsgData: null,
          notSeenCount: 0,
          link: "",
          description: `محادثة مع الطبيب ${doctor.name}`,
          isBlocked: false,
          createdAt: currentDate,
          updatedAt: currentDate
        };

        roomsSocket?.emit("createRoom", { newRoomData: newRoom });
        
        // الانتظار قليلاً قبل تحديد الغرفة
        setTimeout(() => {
          const updatedRooms = [...userRooms, newRoom];
          userDataUpdater({ rooms: updatedRooms });
          setter({ selectedRoom: newRoom });
        }, 500);
      }
      
    } catch (error) {
      console.error("❌ Error in handleDoctorClick:", error);
      alert("حدث خطأ. حاول مرة أخرى.");
    }
  };

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

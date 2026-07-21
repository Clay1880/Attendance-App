"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc, onSnapshot, collection, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase";
import toast, { Toaster } from "react-hot-toast";

import { loginUser, logoutUser, saveProfile, fetchAttendanceData, saveAttendanceData, saveGlobalTimetable, getTimetableId } from "../services/api";
import DailyTrack from "../components/DailyTrack";
import Analytics from "../components/Analytics";
import SchedulePanel from "../components/SchedulePanel";
import SuperadminPanel from "../components/SuperadminPanel";
import ContactPanel from "../components/ContactPanel";
import NotificationsPanel from "../components/NotificationsPanel";

// --- Helper for Dynamic Subgroups ---
const getGroupOptions = (branch, batch) => {
  if (branch === "ENTC") {
    return batch === "A" ? ["A1", "A2", "A3"] : ["B1", "B2", "B3"];
  }
  return ["A", "B", "C"]; // Default for CS, IT, Mechanical, ARE
};

const mergeContinuousClasses = (dailySchedule) => {
  if (!dailySchedule || !Array.isArray(dailySchedule)) return [];
  
  const mergedSchedule = [];
  dailySchedule.forEach((currentClass) => {
    const lastClass = mergedSchedule[mergedSchedule.length - 1];

    if (lastClass && lastClass.name === currentClass.name && lastClass.endTime === currentClass.startTime) {
      lastClass.endTime = currentClass.endTime; 
    } else {
      mergedSchedule.push({ ...currentClass });
    }
  });

  return mergedSchedule;
};

export default function AttendanceTracker() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [notifications, setNotifications] = useState([]); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const ADMIN_ROLES = {};
  const superAdminsRaw = process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS || "";
  superAdminsRaw.split(",").forEach(email => {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail) ADMIN_ROLES[cleanEmail] = { role: "superadmin" };
  });

  const coAdminENTC = process.env.NEXT_PUBLIC_COADMIN_ENTC?.toLowerCase();
  if (coAdminENTC) ADMIN_ROLES[coAdminENTC] = { role: "coadmin", allowedBranch: "ENTC" };
  const coAdminCS = process.env.NEXT_PUBLIC_COADMIN_CS?.toLowerCase();
  if (coAdminCS) ADMIN_ROLES[coAdminCS] = { role: "coadmin", allowedBranch: "CS" };
  const coAdminARE = process.env.NEXT_PUBLIC_COADMIN_ARE?.toLowerCase();
  if (coAdminARE) ADMIN_ROLES[coAdminARE] = { role: "coadmin", allowedBranch: "ARE" };

  const currentUserEmail = userProfile?.email?.toLowerCase();
  const adminConfig = currentUserEmail ? ADMIN_ROLES[currentUserEmail] : null;
  const isAdmin = !!adminConfig;
  const isSuperAdmin = adminConfig?.role === "superadmin";

  const [onboardYear, setOnboardYear] = useState("FE");
  const [onboardBranch, setOnboardBranch] = useState("CS");
  const [onboardBatch, setOnboardBatch] = useState("A");
  const [onboardGroup, setOnboardGroup] = useState("A");

  const [activeTab, setActiveTab] = useState("track");
  const [masterTimetable, setMasterTimetable] = useState({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
  const [myTimetableRaw, setMyTimetableRaw] = useState({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
  const [attendance, setAttendance] = useState({});

  const [targetYear, setTargetYear] = useState("SE");
  const [targetBranch, setTargetBranch] = useState("IT");
  const [targetBatch, setTargetBatch] = useState("A");

  const todayDateString = new Date().toISOString().split("T")[0];
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDayName = daysOfWeek[new Date().getDay()];

  useEffect(() => {
    if (adminConfig && adminConfig.role === "coadmin") setTargetBranch(adminConfig.allowedBranch);
  }, [adminConfig]);

  const currentOnboardGroups = getGroupOptions(onboardBranch, onboardBatch);
  useEffect(() => {
    if (!currentOnboardGroups.includes(onboardGroup)) {
      setOnboardGroup(currentOnboardGroups[0]); 
    }
  }, [onboardBranch, onboardBatch, currentOnboardGroups, onboardGroup]);

  const filterTimetable = (timetableData, userGroup) => {
    if (!timetableData) return {};
    const filtered = {};

    Object.keys(timetableData).forEach((day) => {
      const dailyFiltered = timetableData[day].filter((cls) => {
        if (!userGroup) return true; 
        
        const groupMatch = cls.name.match(/[\[\(](.+?)[\]\)]/i);
        if (groupMatch) {
          const tag = groupMatch[1].toUpperCase();
          const uGroup = userGroup.toUpperCase(); 
          
          if (tag.includes(uGroup)) return true;
          if (uGroup.length > 1) { 
            const baseGroup = uGroup.charAt(0);
            const baseRegex = new RegExp(`\\b${baseGroup}\\b|\\b${baseGroup}(?![0-9])`);
            if (baseRegex.test(tag)) return true;
          }
          return false; 
        }
        return true; 
      });

      filtered[day] = mergeContinuousClasses(dailyFiltered);
    });
    
    return filtered;
  };

  const personalTimetable = filterTimetable(myTimetableRaw, userProfile?.group);

  useEffect(() => {
    if (!userProfile) return;
    const myTimetableId = getTimetableId(userProfile.year, userProfile.branch, userProfile.batch);
    const unsubPersonal = onSnapshot(doc(db, "timetables", myTimetableId), (docSnap) => {
      if (docSnap.exists()) setMyTimetableRaw(docSnap.data());
      else setMyTimetableRaw({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
    });

    let unsubAdmin = () => { };
    if (isAdmin) {
      const targetTimetableId = getTimetableId(targetYear, targetBranch, targetBatch);
      unsubAdmin = onSnapshot(doc(db, "timetables", targetTimetableId), (docSnap) => {
        if (docSnap.exists()) setMasterTimetable(docSnap.data());
        else setMasterTimetable({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
      });
    }
    return () => { unsubPersonal(); unsubAdmin(); };
  }, [userProfile, isAdmin, targetYear, targetBranch, targetBatch]);

  useEffect(() => {
    if (!userProfile?.email) return;
    const q = query(collection(db, "notifications"), where("userEmail", "==", userProfile.email));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setNotifications(data);
    });
    return () => unsubscribe();
  }, [userProfile]);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        setUser(currentUser);
        if (currentUser) {
          const profileSnap = await getDoc(doc(db, "users", currentUser.uid));
          if (profileSnap.exists()) {
            setUserProfile(profileSnap.data());
            const data = await fetchAttendanceData(currentUser.uid);
            setAttendance(data);
          } else {
            setUserProfile(null);
          }
        } else {
          setUserProfile(null);
          setAttendance({});
        }
      } catch (error) {
        console.error("Firebase Auth or DB Error:", error);
        toast.error("Failed to connect to database.");
      } finally {
        setLoadingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAuthLogin = async () => {
    try { await loginUser(); toast.success("Signed in successfully"); }
    catch { toast.error("Failed to sign in."); }
  };

  const handleProfileSetup = async (e) => {
    e.preventDefault();
    const data = { email: user.email, name: user.displayName, year: onboardYear, branch: onboardBranch, batch: onboardBatch, group: onboardGroup };
    try {
      await saveProfile(user.uid, data);
      setUserProfile(data);
      toast.success("Profile setup complete.");
    } catch { toast.error("Failed to save profile."); }
  };

  const [isUploading, setIsUploading] = useState(false);
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !isAdmin) return;
    setIsUploading(true);
    const tId = toast.loading("Processing Master Import...");
    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/parse-timetable", { method: "POST", body: formData });
      if (!response.ok) throw new Error();
      const generated = await response.json();
      const newTimetable = { ...masterTimetable, ...generated };
      await saveGlobalTimetable(getTimetableId(targetYear, targetBranch, targetBatch), newTimetable);
      toast.success("Import successful", { id: tId });
    } catch { toast.error("Error processing image.", { id: tId }); }
    finally { setIsUploading(false); }
  };

  const handleMarkAttendance = async (subjectName, timeStr, status) => {
    if (!user) return;
    const dayData = attendance[todayDateString] || { month: todayDateString.substring(0, 7), records: [] };
    const rIndex = dayData.records.findIndex(r => r.subject === subjectName && r.time === timeStr);

    const updatedRecords = [...dayData.records];
    if (rIndex > -1) updatedRecords[rIndex].status = status;
    else updatedRecords.push({ subject: subjectName, time: timeStr, status });

    const newDayData = { ...dayData, records: updatedRecords };
    setAttendance(prev => ({ ...prev, [todayDateString]: newDayData }));
    await saveAttendanceData(user.uid, todayDateString, newDayData);
  };

  const handleManualAdjustment = async (subject, type, operation) => {
    if (!user || !userProfile) return;
    const currentAdjustments = userProfile.manualAdjustments || {};
    const subjectAdj = currentAdjustments[subject] || { present: 0, absent: 0 };
    let newCount = subjectAdj[type] + (operation === 'add' ? 1 : -1);

    const updatedProfile = { ...userProfile, manualAdjustments: { ...currentAdjustments, [subject]: { ...subjectAdj, [type]: newCount } } };
    setUserProfile(updatedProfile);
    await saveProfile(user.uid, updatedProfile);
    toast.success(`${subject} records updated`);
  };

  const handleTabSwitch = (tabName) => {
    setActiveTab(tabName);
    setIsMobileMenuOpen(false); 
  };

  const availableSubjects = Array.from(new Set(Object.values(personalTimetable).flatMap(d => d.map(s => s.name))))
    .filter(n => n !== "" && !n.toUpperCase().includes("LIB"))
    .sort();

  // Loading Screen
  if (loadingAuth) return <div className="min-h-screen bg-[#09090b] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-zinc-200"></div></div>;

  // Login Screen
  if (!user) return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#18181b', color: '#f4f4f5', border: '1px solid #27272a' } }} />
      <div className="max-w-sm w-full bg-[#09090b] border border-zinc-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-xl font-semibold text-zinc-50 tracking-tight text-center mb-1">AIT Hub</h1>
        <p className="text-zinc-500 text-sm text-center mb-6">Sign in to manage your attendance</p>
        <button onClick={handleAuthLogin} className="w-full flex justify-center items-center gap-2 bg-zinc-50 text-zinc-950 hover:bg-zinc-200 font-medium py-2.5 px-4 rounded-lg transition-colors">
          Continue with Google
        </button>
      </div>
    </div>
  );

  // Onboarding Screen
  if (user && !userProfile) return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-4">
      <div className="max-w-sm w-full bg-[#09090b] border border-zinc-800 p-8 rounded-2xl shadow-2xl">
        <h2 className="text-lg font-semibold text-zinc-50 tracking-tight mb-6">Complete your profile</h2>
        <form onSubmit={handleProfileSetup} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-zinc-400 mb-1.5">Year</label><select value={onboardYear} onChange={(e) => setOnboardYear(e.target.value)} className="w-full bg-[#18181b] border border-zinc-800 rounded-md p-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"><option value="FE">FE</option><option value="SE">SE</option><option value="TE">TE</option><option value="BE">BE</option></select></div>
            <div><label className="block text-xs font-medium text-zinc-400 mb-1.5">Branch</label><select value={onboardBranch} onChange={(e) => setOnboardBranch(e.target.value)} className="w-full bg-[#18181b] border border-zinc-800 rounded-md p-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"><option value="CS">CS</option><option value="IT">IT</option><option value="Mechanical">Mechanical</option><option value="ENTC">ENTC</option><option value="ARE">ARE</option></select></div>
            <div><label className="block text-xs font-medium text-zinc-400 mb-1.5">Batch</label><select value={onboardBatch} onChange={(e) => setOnboardBatch(e.target.value)} className="w-full bg-[#18181b] border border-zinc-800 rounded-md p-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"><option value="A">A</option><option value="B">B</option></select></div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Group</label>
              <select value={onboardGroup} onChange={(e) => setOnboardGroup(e.target.value)} className="w-full bg-[#18181b] border border-zinc-800 rounded-md p-2 text-sm text-zinc-200 outline-none focus:border-zinc-500">
                {currentOnboardGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="w-full mt-6 bg-zinc-50 text-zinc-950 hover:bg-zinc-200 py-2.5 rounded-lg font-medium transition-colors">Go to Dashboard</button>
        </form>
      </div>
    </div>
  );

  return (
    // pb-24 ensures the main content clears the bottom fixed nav on mobile devices
    <div className="min-h-screen bg-[#09090b] text-zinc-200 font-sans pb-24 md:pb-12 relative overflow-hidden">
      
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#18181b', color: '#f4f4f5', border: '1px solid #27272a' } }} />
      
      {/* ------------------------------------------------------------- */}
      {/* TOP NAVBAR (Clean, SaaS-style header) */}
      {/* ------------------------------------------------------------- */}
      <nav className="sticky top-0 z-40 bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-800/60 px-4 py-3 sm:px-8 sm:py-3.5">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          
          {/* Logo & Student Info */}
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-zinc-50 tracking-tight">AIT Hub</h1>
            <div className="hidden sm:flex items-center gap-2">
              <span className="bg-zinc-900 text-zinc-400 text-[11px] font-medium px-2 py-0.5 rounded border border-zinc-800">{userProfile.year} • {userProfile.branch} • {userProfile.batch}{userProfile.group}</span>
              {isAdmin && <span className="bg-rose-500/10 text-rose-400 text-[11px] font-medium px-2 py-0.5 rounded border border-rose-500/20">Admin</span>}
            </div>
          </div>

          {/* DESKTOP Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            <button onClick={() => handleTabSwitch("track")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "track" ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"}`}>Track</button>
            <button onClick={() => handleTabSwitch("analytics")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "analytics" ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"}`}>Analytics</button>
            <button onClick={() => handleTabSwitch("schedule")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "schedule" ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"}`}>{isAdmin ? "Admin Controls" : "Schedule"}</button>
            <button onClick={() => handleTabSwitch("contact")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "contact" ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"}`}>Contact</button>
            
            <button onClick={() => handleTabSwitch("notifications")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${activeTab === "notifications" ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"}`}>
              Inbox {unreadCount > 0 && <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">{unreadCount}</span>}
            </button>

            {isSuperAdmin && (
              <button onClick={() => handleTabSwitch("database")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "database" ? "bg-rose-500/20 text-rose-400" : "text-zinc-400 hover:text-rose-400"}`}>Database</button>
            )}

            <div className="w-px h-4 bg-zinc-800 mx-2"></div>
            <button onClick={logoutUser} className="px-3 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors">Sign out</button>
          </div>

          {/* MOBILE Header Actions */}
          <div className="md:hidden flex items-center gap-3">
             {unreadCount > 0 && <span className="w-2 h-2 bg-rose-500 rounded-full"></span>}
             <button onClick={logoutUser} className="text-xs font-medium text-zinc-500 hover:text-zinc-300">Sign out</button>
          </div>
        </div>

        {/* MOBILE Secondary Menu (Drops down for items not in the bottom bar) */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-3 pt-3 border-t border-zinc-800 flex flex-col gap-1 pb-1 animate-fadeIn">
            <div className="flex items-center gap-2 mb-2 px-2">
              <span className="bg-zinc-900 text-zinc-400 text-[11px] font-medium px-2 py-0.5 rounded border border-zinc-800">{userProfile.year} • {userProfile.branch} • {userProfile.batch}{userProfile.group}</span>
              {isAdmin && <span className="bg-rose-500/10 text-rose-400 text-[11px] font-medium px-2 py-0.5 rounded border border-rose-500/20">Admin</span>}
            </div>
            
            <button onClick={() => handleTabSwitch("contact")} className={`text-left px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === "contact" ? "bg-zinc-800 text-zinc-50" : "text-zinc-400"}`}>Contact Support</button>
            <button onClick={() => handleTabSwitch("notifications")} className={`text-left flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === "notifications" ? "bg-zinc-800 text-zinc-50" : "text-zinc-400"}`}>
              Inbox {unreadCount > 0 && <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full">{unreadCount} New</span>}
            </button>
            {isSuperAdmin && (
              <button onClick={() => handleTabSwitch("database")} className={`text-left px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === "database" ? "bg-rose-500/20 text-rose-400" : "text-zinc-400"}`}>System DB</button>
            )}
          </div>
        )}
      </nav>

      {/* ------------------------------------------------------------- */}
      {/* REAL NATIVE-STYLE BOTTOM NAV (Edge-to-edge, flush bottom) */}
      {/* ------------------------------------------------------------- */}
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-[#09090b]/90 backdrop-blur-xl border-t border-zinc-800/80 pt-2.5 pb-6 flex justify-around items-center z-50">
        
        {/* Track */}
        <button onClick={() => { handleTabSwitch("track"); setIsMobileMenuOpen(false); }} className="flex flex-col items-center gap-1 w-16">
          <svg className={`w-[22px] h-[22px] transition-colors ${activeTab === "track" && !isMobileMenuOpen ? "text-zinc-100" : "text-zinc-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          <span className={`text-[10px] font-medium ${activeTab === "track" && !isMobileMenuOpen ? "text-zinc-100" : "text-zinc-500"}`}>Track</span>
        </button>

        {/* Analytics */}
        <button onClick={() => { handleTabSwitch("analytics"); setIsMobileMenuOpen(false); }} className="flex flex-col items-center gap-1 w-16">
          <svg className={`w-[22px] h-[22px] transition-colors ${activeTab === "analytics" && !isMobileMenuOpen ? "text-zinc-100" : "text-zinc-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          <span className={`text-[10px] font-medium ${activeTab === "analytics" && !isMobileMenuOpen ? "text-zinc-100" : "text-zinc-500"}`}>Analytics</span>
        </button>

        {/* Schedule */}
        <button onClick={() => { handleTabSwitch("schedule"); setIsMobileMenuOpen(false); }} className="flex flex-col items-center gap-1 w-16">
          <svg className={`w-[22px] h-[22px] transition-colors ${activeTab === "schedule" && !isMobileMenuOpen ? "text-zinc-100" : "text-zinc-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <span className={`text-[10px] font-medium ${activeTab === "schedule" && !isMobileMenuOpen ? "text-zinc-100" : "text-zinc-500"}`}>Schedule</span>
        </button>

        {/* More/Menu */}
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="flex flex-col items-center gap-1 w-16 relative">
          <div className="relative">
            {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 border border-[#09090b] rounded-full"></span>}
            <svg className={`w-[22px] h-[22px] transition-colors ${isMobileMenuOpen ? "text-zinc-100" : "text-zinc-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </div>
          <span className={`text-[10px] font-medium ${isMobileMenuOpen ? "text-zinc-100" : "text-zinc-500"}`}>More</span>
        </button>
      </div>

      <main className="max-w-5xl mx-auto mt-6 px-4 sm:px-8 space-y-8 z-10 relative">
        {activeTab === "track" && <DailyTrack timetable={personalTimetable} attendance={attendance} todayDayName={todayDayName} todayDateString={todayDateString} handleMarkAttendance={handleMarkAttendance} userProfile={userProfile} handleUpdateProfile={async (data) => { await saveProfile(user.uid, data); setUserProfile(data); }} />}
        {activeTab === "analytics" && <Analytics attendance={attendance} availableSubjects={availableSubjects} todayDateString={todayDateString} userProfile={userProfile} handleManualAdjustment={handleManualAdjustment} />}
        {activeTab === "schedule" && <SchedulePanel isAdmin={isAdmin} adminConfig={adminConfig} timetable={isAdmin ? masterTimetable : personalTimetable} currentTargetId={isAdmin ? getTimetableId(targetYear, targetBranch, targetBatch) : getTimetableId(userProfile.year, userProfile.branch, userProfile.batch)} daysOfWeek={daysOfWeek} targetYear={targetYear} setTargetYear={setTargetYear} targetBranch={targetBranch} setTargetBranch={setTargetBranch} targetBatch={targetBatch} setTargetBatch={setTargetBatch} isUploading={isUploading} handleImageUpload={handleImageUpload} handleClearDaySchedule={(d) => saveGlobalTimetable(getTimetableId(targetYear, targetBranch, targetBatch), { ...masterTimetable, [d]: [] })} />}
        {activeTab === "contact" && <ContactPanel userProfile={userProfile} />}
        {activeTab === "notifications" && <NotificationsPanel notifications={notifications} />}
        {activeTab === "database" && isSuperAdmin && <SuperadminPanel />}
      </main>
    </div>
  );
}
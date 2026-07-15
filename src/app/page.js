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

// --- NEW: Helper for Dynamic Subgroups ---
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

  // --- NEW: Auto-Correct Group Selection During Onboarding ---
  const currentOnboardGroups = getGroupOptions(onboardBranch, onboardBatch);
  useEffect(() => {
    if (!currentOnboardGroups.includes(onboardGroup)) {
      setOnboardGroup(currentOnboardGroups[0]); // Reset to valid option (e.g., A1)
    }
  }, [onboardBranch, onboardBatch, currentOnboardGroups, onboardGroup]);

  // --- UPGRADED: Smarter Subgroup Filtering & Continuous Class Merging ---
  const filterTimetable = (timetableData, userGroup) => {
    if (!timetableData) return {};
    const filtered = {};

    Object.keys(timetableData).forEach((day) => {
      // 1. First, filter out the classes that don't belong to this user's group
      const dailyFiltered = timetableData[day].filter((cls) => {
        if (!userGroup) return true; // If no group, keep all
        
        // Find anything inside brackets (e.g., "A1", "A, B")
        const groupMatch = cls.name.match(/[\[\(](.+?)[\]\)]/i);
        
        if (groupMatch) {
          const tag = groupMatch[1].toUpperCase();
          const uGroup = userGroup.toUpperCase(); // e.g., "A1" or "A"
          
          // Direct match
          if (tag.includes(uGroup)) return true;
          
          // Parent match (If tag is "A" and user is "A1")
          if (uGroup.length > 1) { 
            const baseGroup = uGroup.charAt(0);
            const baseRegex = new RegExp(`\\b${baseGroup}\\b|\\b${baseGroup}(?![0-9])`);
            if (baseRegex.test(tag)) return true;
          }
          
          return false; // Has brackets, but doesn't belong to this user
        }
        return true; // No brackets = theory class for everyone
      });

      // 2. NOW apply the merge logic to stitch labs together for the UI!
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
      setUser(currentUser);
      if (currentUser) {
        const profileSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (profileSnap.exists()) {
          setUserProfile(profileSnap.data());
          const data = await fetchAttendanceData(currentUser.uid);
          setAttendance(data);
        } else setUserProfile(null);
      } else {
        setUserProfile(null);
        setAttendance({});
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAuthLogin = async () => {
    try { await loginUser(); toast.success("Signed in!"); }
    catch { toast.error("Failed to sign in."); }
  };

  const handleProfileSetup = async (e) => {
    e.preventDefault();
    const data = { email: user.email, name: user.displayName, year: onboardYear, branch: onboardBranch, batch: onboardBatch, group: onboardGroup };
    try {
      await saveProfile(user.uid, data);
      setUserProfile(data);
      toast.success("Profile complete!");
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
      toast.success("Import successful!", { id: tId });
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
    toast.success(`${subject} manually updated!`);
  };

  const handleTabSwitch = (tabName) => {
    setActiveTab(tabName);
    setIsMobileMenuOpen(false); 
  };

  const availableSubjects = Array.from(new Set(Object.values(personalTimetable).flatMap(d => d.map(s => s.name))))
    .filter(n => n !== "" && !n.toUpperCase().includes("LIB"))
    .sort();

  if (loadingAuth) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-cyan-500"></div></div>;

  if (!user) return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc' } }} />
      <div className="max-w-md w-full bg-[#111] border border-[#222] p-8 rounded-3xl text-center shadow-2xl">
        <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">AIT Hub</h1>
        <button onClick={handleAuthLogin} className="w-full flex justify-center gap-3 bg-white text-slate-900 font-bold py-3 px-4 rounded-xl mt-6 transition-all duration-200 active:scale-95">Sign in with Google</button>
      </div>
    </div>
  );

  if (user && !userProfile) return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#111] border border-[#222] p-8 rounded-3xl shadow-2xl">
        <h2 className="text-2xl font-bold text-slate-100 mb-6">Complete Profile</h2>
        <form onSubmit={handleProfileSetup} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Year</label><select value={onboardYear} onChange={(e) => setOnboardYear(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="FE">FE</option><option value="SE">SE</option><option value="TE">TE</option><option value="BE">BE</option></select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Branch</label><select value={onboardBranch} onChange={(e) => setOnboardBranch(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="CS">CS</option><option value="IT">IT</option><option value="Mechanical">Mechanical</option><option value="ENTC">ENTC</option><option value="ARE">ARE</option></select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Batch</label><select value={onboardBatch} onChange={(e) => setOnboardBatch(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="A">A</option><option value="B">B</option></select></div>
            
            {/* NEW: Dynamic Group Select for Onboarding */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Group</label>
              <select value={onboardGroup} onChange={(e) => setOnboardGroup(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg p-2.5 text-sm text-slate-200 outline-none">
                {currentOnboardGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

          </div>
          <button type="submit" className="w-full mt-4 bg-cyan-500 text-black py-3 rounded-xl font-bold transition-all duration-200 active:scale-95">Launch Dashboard</button>
        </form>
      </div>
    </div>
  );

  return (
    // Note: pb-28 ensures content is not hidden behind the mobile bottom nav
    <div className="min-h-screen bg-[#0a0a0a] text-slate-100 font-sans selection:bg-cyan-500 selection:text-black pb-28 relative overflow-hidden">
      
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#111', color: '#f8fafc', border: '1px solid #333' } }} />
      
      {/* ------------------------------------------------------------- */}
      {/* TOP NAVBAR (Desktop Primary / Mobile Simple Header) */}
      {/* ------------------------------------------------------------- */}
      <nav className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-[#1f1f22] px-4 py-3 sm:px-8 sm:py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          
          {/* Logo & Info */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-medium bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent tracking-wide">AIT Hub</h1>
            <div className="hidden sm:flex items-center gap-2">
              <span className="bg-[#1a1a1e] text-zinc-400 text-[10px] font-bold px-2 py-1 rounded-md border border-[#2a2a2e]">{userProfile.year} • {userProfile.branch} • {userProfile.batch}{userProfile.group}</span>
              {isAdmin && <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold px-2 py-1 rounded-md">ADMIN</span>}
            </div>
          </div>

          {/* DESKTOP TABS */}
          <div className="hidden md:flex items-center gap-2">
            <button onClick={() => handleTabSwitch("track")} className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${activeTab === "track" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1e]"}`}>Daily Track</button>
            <button onClick={() => handleTabSwitch("analytics")} className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${activeTab === "analytics" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1e]"}`}>Analytics</button>
            <button onClick={() => handleTabSwitch("schedule")} className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${activeTab === "schedule" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1e]"}`}>{isAdmin ? "Admin Controls" : "My Schedule"}</button>
            <button onClick={() => handleTabSwitch("contact")} className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${activeTab === "contact" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1e]"}`}>Contact</button>
            
            <button onClick={() => handleTabSwitch("notifications")} className={`px-4 py-2 text-sm font-medium rounded-xl transition-all flex items-center gap-1.5 ${activeTab === "notifications" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a1e]"}`}>
              Inbox {unreadCount > 0 && <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
            </button>

            {isSuperAdmin && (
              <button onClick={() => handleTabSwitch("database")} className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === "database" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "text-zinc-400 hover:text-rose-400 hover:bg-[#1a1a1e]"}`}>System DB</button>
            )}

            {/* Replaced Black Circle with Clean Sign Out Link for Laptop */}
            <div className="w-px h-5 bg-[#27272a] mx-2"></div>
            <button onClick={logoutUser} className="text-sm font-medium text-zinc-500 hover:text-rose-400 transition-colors">Sign Out</button>
          </div>

          {/* MOBILE TOP RIGHT (Just Notifications, Removed Black Circle) */}
          <div className="md:hidden flex items-center gap-3">
             {unreadCount > 0 && <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>}
          </div>
        </div>

        {/* MOBILE DROPDOWN MENU (Extra options not on bottom nav) */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-[#1f1f22] flex flex-col items-center gap-2 pb-2 animate-fadeIn">
            
            <div className="flex items-center justify-center gap-2 mb-3 w-full">
              <span className="bg-[#1a1a1e] text-zinc-400 text-[10px] font-bold px-2 py-1 rounded-md border border-[#2a2a2e]">{userProfile.year} • {userProfile.branch} • {userProfile.batch}{userProfile.group}</span>
              {isAdmin && <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold px-2 py-1 rounded-md">ADMIN</span>}
            </div>

            {/* These are extra tabs not covered by the 3 main bottom nav icons */}
            <button onClick={() => handleTabSwitch("contact")} className={`w-[90%] max-w-[350px] text-center px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === "contact" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-300 bg-[#111] border border-[#222]"}`}>Contact Support</button>
            
            <button onClick={() => handleTabSwitch("notifications")} className={`w-[90%] max-w-[350px] flex justify-center items-center gap-2 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === "notifications" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-300 bg-[#111] border border-[#222]"}`}>
              Inbox {unreadCount > 0 && <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full">{unreadCount} New</span>}
            </button>

            {isSuperAdmin && (
              <button onClick={() => handleTabSwitch("database")} className={`w-[90%] max-w-[350px] text-center px-4 py-3 rounded-xl font-bold transition-colors ${activeTab === "database" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "text-rose-400 bg-[#111] border border-[#222]"}`}>System DB</button>
            )}
            
            <div className="w-full border-t border-[#1f1f22] mt-3 pt-4 flex justify-center">
              <button onClick={logoutUser} className="w-[90%] max-w-[350px] text-center px-4 py-3 rounded-xl font-bold text-rose-500 border border-rose-500/20 hover:bg-rose-500/10 transition-colors">
                Sign Out
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM NAVBAR (Mobile Fixed Floating Nav - Sleek UI Fix) */}
      {/* ------------------------------------------------------------- */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[320px] bg-[#121214]/95 backdrop-blur-md border border-[#27272a] py-2 px-4 rounded-2xl flex justify-between items-center z-50 shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
        
        {/* Tab 1: Daily Track */}
        <button onClick={() => { handleTabSwitch("track"); setIsMobileMenuOpen(false); }} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${activeTab === "track" && !isMobileMenuOpen ? "bg-cyan-400 text-black shadow-md shadow-cyan-400/20" : "bg-transparent text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1e]"}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
        </button>

        {/* Tab 2: Analytics */}
        <button onClick={() => { handleTabSwitch("analytics"); setIsMobileMenuOpen(false); }} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${activeTab === "analytics" && !isMobileMenuOpen ? "bg-cyan-400 text-black shadow-md shadow-cyan-400/20" : "bg-transparent text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1e]"}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        </button>

        {/* Tab 3: Schedule */}
        <button onClick={() => { handleTabSwitch("schedule"); setIsMobileMenuOpen(false); }} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${activeTab === "schedule" && !isMobileMenuOpen ? "bg-cyan-400 text-black shadow-md shadow-cyan-400/20" : "bg-transparent text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1e]"}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </button>

        {/* Tab 4: More / Menu */}
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 ${isMobileMenuOpen ? "bg-cyan-400 text-black shadow-md shadow-cyan-400/20" : "bg-transparent text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1e]"}`}>
          <div className="relative">
            {unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-2 h-2 bg-rose-500 border border-[#121214] rounded-full"></span>}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
          </div>
        </button>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* MAIN CONTENT AREA */}
      {/* ------------------------------------------------------------- */}
      <main className="max-w-4xl mx-auto mt-8 px-4 sm:px-8 space-y-8 z-10 relative">
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
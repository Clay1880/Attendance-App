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

  // --- UPGRADED: Smarter Subgroup Filtering ---
  const filterTimetable = (timetableData, userGroup) => {
    if (!userGroup) return timetableData;
    const filtered = {};

    Object.keys(timetableData).forEach((day) => {
      filtered[day] = timetableData[day].filter((cls) => {
        // Find anything inside brackets (e.g., "A1", "A, B")
        const groupMatch = cls.name.match(/[\[\(](.+?)[\]\)]/i);
        
        if (groupMatch) {
          const tag = groupMatch[1].toUpperCase();
          const uGroup = userGroup.toUpperCase(); // e.g., "A1" or "A"
          
          // 1. Direct match (If tag is "A1" and user is "A1")
          if (tag.includes(uGroup)) return true;
          
          // 2. Parent match (If tag is "A" and user is "A1")
          if (uGroup.length > 1) { 
            const baseGroup = uGroup.charAt(0); // Extracts "A" from "A1"
            // Ensure the tag contains "A" but NOT followed by a number (prevents "A2" from matching "A1")
            const baseRegex = new RegExp(`\\b${baseGroup}\\b|\\b${baseGroup}(?![0-9])`);
            if (baseRegex.test(tag)) return true;
          }
          
          return false; // Has brackets, but doesn't belong to this user
        }
        return true; // No brackets = theory class for everyone
      });
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

  if (loadingAuth) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-500"></div></div>;

  if (!user) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none -z-10"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none -z-10"></div>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc' } }} />
      <div className="max-w-md w-full bg-slate-900/40 border border-slate-800 border-t-slate-700/50 p-8 rounded-3xl backdrop-blur-xl text-center shadow-2xl shadow-black/50">
        <div className="mx-auto w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-4"><span className="text-3xl">🎓</span></div>
        <h1 className="text-2xl font-extrabold text-slate-100">AIT Hub</h1>
        <button onClick={handleAuthLogin} className="w-full flex justify-center gap-3 bg-white text-slate-900 font-bold py-3 px-4 rounded-xl mt-6 transition-all duration-200 hover:-translate-y-0.5 active:scale-95">Sign in with Google</button>
      </div>
    </div>
  );

  if (user && !userProfile) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none -z-10"></div>
      <div className="max-w-md w-full bg-slate-900/40 border border-slate-800 border-t-slate-700/50 p-8 rounded-3xl backdrop-blur-xl shadow-2xl shadow-black/50">
        <h2 className="text-2xl font-bold text-slate-100 mb-6">Complete Profile</h2>
        <form onSubmit={handleProfileSetup} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Year</label><select value={onboardYear} onChange={(e) => setOnboardYear(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="FE">FE</option><option value="SE">SE</option><option value="TE">TE</option><option value="BE">BE</option></select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Branch</label><select value={onboardBranch} onChange={(e) => setOnboardBranch(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="CS">CS</option><option value="IT">IT</option><option value="Mechanical">Mechanical</option><option value="ENTC">ENTC</option><option value="ARE">ARE</option></select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Batch</label><select value={onboardBatch} onChange={(e) => setOnboardBatch(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="A">A</option><option value="B">B</option></select></div>
            
            {/* NEW: Dynamic Group Select for Onboarding */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Group</label>
              <select value={onboardGroup} onChange={(e) => setOnboardGroup(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-none">
                {currentOnboardGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

          </div>
          <button type="submit" className="w-full mt-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] border border-indigo-500/30 py-3 rounded-xl font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-95">Launch Dashboard</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white pb-12 relative overflow-hidden">
      
      {/* Ambient Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none -z-10"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-purple-600/20 blur-[120px] pointer-events-none -z-10"></div>

      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' } }} />
      
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800 px-4 py-3 sm:px-8 sm:py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">AIT Hub</h1>
            <div className="hidden sm:flex items-center gap-2">
              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-1 rounded-md">{userProfile.year} • {userProfile.branch} • {userProfile.batch}{userProfile.group}</span>
              {isAdmin && <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2 py-1 rounded-md">ADMIN</span>}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <button onClick={() => handleTabSwitch("track")} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "track" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] border border-indigo-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"}`}>Daily Track</button>
            <button onClick={() => handleTabSwitch("analytics")} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "analytics" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] border border-indigo-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"}`}>Analytics</button>
            <button onClick={() => handleTabSwitch("schedule")} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "schedule" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] border border-indigo-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"}`}>{isAdmin ? "Admin Controls" : "My Schedule"}</button>
            <button onClick={() => handleTabSwitch("contact")} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "contact" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] border border-indigo-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"}`}>Contact</button>
            
            <button onClick={() => handleTabSwitch("notifications")} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "notifications" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] border border-indigo-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"}`}>
              Inbox {unreadCount > 0 && <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
            </button>

            {isSuperAdmin && (
              <button onClick={() => handleTabSwitch("database")} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "database" ? "bg-rose-600 text-white shadow-md" : "text-rose-400/70 hover:text-rose-400 hover:bg-rose-950/30"}`}>System DB</button>
            )}

            <div className="w-px h-6 bg-slate-800 mx-2"></div>
            <button onClick={logoutUser} className="text-sm text-rose-400 font-medium hover:underline">Sign Out</button>
          </div>

          <div className="md:hidden flex items-center gap-4">
            {unreadCount > 0 && <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse"></div>}
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-slate-300 hover:text-white p-1">
              {isMobileMenuOpen ? (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              )}
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-slate-800 flex flex-col items-center gap-2 pb-2 animate-fadeIn">
            
            {/* User Info Header */}
            <div className="flex items-center justify-center gap-2 mb-3 w-full">
              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-1 rounded-md">{userProfile.year} • {userProfile.branch} • {userProfile.batch}{userProfile.group}</span>
              {isAdmin && <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2 py-1 rounded-md">ADMIN</span>}
            </div>

            {/* Navigation Buttons */}
            <button onClick={() => handleTabSwitch("track")} className={`w-[90%] max-w-[350px] text-center px-4 py-3 rounded-xl font-semibold transition-colors ${activeTab === "track" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : "text-slate-300 bg-slate-900/50"}`}>Daily Track</button>
            <button onClick={() => handleTabSwitch("analytics")} className={`w-[90%] max-w-[350px] text-center px-4 py-3 rounded-xl font-semibold transition-colors ${activeTab === "analytics" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : "text-slate-300 bg-slate-900/50"}`}>Analytics</button>
            <button onClick={() => handleTabSwitch("schedule")} className={`w-[90%] max-w-[350px] text-center px-4 py-3 rounded-xl font-semibold transition-colors ${activeTab === "schedule" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : "text-slate-300 bg-slate-900/50"}`}>{isAdmin ? "Admin Controls" : "My Schedule"}</button>
            <button onClick={() => handleTabSwitch("contact")} className={`w-[90%] max-w-[350px] text-center px-4 py-3 rounded-xl font-semibold transition-colors ${activeTab === "contact" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : "text-slate-300 bg-slate-900/50"}`}>Contact Support</button>
            
            <button onClick={() => handleTabSwitch("notifications")} className={`w-[90%] max-w-[350px] flex justify-center items-center gap-2 px-4 py-3 rounded-xl font-semibold transition-colors ${activeTab === "notifications" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : "text-slate-300 bg-slate-900/50"}`}>
              Inbox {unreadCount > 0 && <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full">{unreadCount} New</span>}
            </button>

            {isSuperAdmin && (
              <button onClick={() => handleTabSwitch("database")} className={`w-[90%] max-w-[350px] text-center px-4 py-3 rounded-xl font-bold transition-colors ${activeTab === "database" ? "bg-rose-600 text-white" : "text-rose-400 bg-rose-950/20 border border-rose-900/30"}`}>System DB</button>
            )}
            
            {/* Share to WhatsApp (Bottom Positioned) */}
            {/* <a 
              href="https://wa.me/?text=Hey!%20Check%20out%20AIT%20Hub%20-%20it%20automatically%20tracks%20our%20attendance%20and%20manages%20our%20timetables.%20https://attendance-app-iota-teal.vercel.app/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-[90%] max-w-[350px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold transition-all active:scale-95 mt-4 mb-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.591 5.52 0 10.002-4.48 10.002-10.002 0-5.52-4.482-10.002-10.002-10.002-5.521 0-10.002 4.481-10.002 10.002 0 2.158.653 4.148 1.77 5.867l-1.127 4.117 4.166-1.093z" /></svg>
              Share with Classmates
            </a> */}
  
            <div className="w-full border-t border-slate-800 mt-3 pt-4 flex justify-center">
              <button onClick={logoutUser} className="w-[90%] max-w-[350px] text-center px-4 py-3 rounded-xl font-bold text-rose-500 border border-rose-500/40 hover:bg-rose-500/10 hover:border-rose-500 transition-colors">
                Sign Out
              </button>
            </div>
          </div>
        )}
      </nav>

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
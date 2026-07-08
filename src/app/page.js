"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase";
import toast, { Toaster } from "react-hot-toast";

// Import API tools
import { loginUser, logoutUser, saveProfile, fetchAttendanceData, saveAttendanceData, saveGlobalTimetable, getTimetableId } from "../services/api";
import DailyTrack from "../components/DailyTrack";
import Analytics from "../components/Analytics";
import SchedulePanel from "../components/SchedulePanel";
import SuperadminPanel from "../components/SuperadminPanel";
import ContactPanel from "../components/ContactPanel";

export default function AttendanceTracker() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const ADMIN_ROLES = {};

  // 1. Superadmins (You and anyone else you add)
  const superAdminsRaw = process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS || "";
  superAdminsRaw.split(",").forEach(email => {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail) {
      ADMIN_ROLES[cleanEmail] = { role: "superadmin" };
    }
  });

  // 2. Co-Admins (Your friends) - REMOVED allowedYear SO THEY CAN ACCESS ALL YEARS
  const coAdminENTC = process.env.NEXT_PUBLIC_COADMIN_ENTC?.toLowerCase();
  if (coAdminENTC) ADMIN_ROLES[coAdminENTC] = { role: "coadmin", allowedBranch: "ENTC" };

  const coAdminCS = process.env.NEXT_PUBLIC_COADMIN_CS?.toLowerCase();
  if (coAdminCS) ADMIN_ROLES[coAdminCS] = { role: "coadmin", allowedBranch: "CS" };

  const coAdminARE = process.env.NEXT_PUBLIC_COADMIN_ARE?.toLowerCase();
  if (coAdminARE) ADMIN_ROLES[coAdminARE] = { role: "coadmin", allowedBranch: "ARE" };

  // --- Validate the current user ---
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
  // NEW: Store the user's personal profile timetable separately
  const [myTimetableRaw, setMyTimetableRaw] = useState({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
  const [attendance, setAttendance] = useState({});

  const [targetYear, setTargetYear] = useState("SE");
  const [targetBranch, setTargetBranch] = useState("IT");
  const [targetBatch, setTargetBatch] = useState("A");

  const todayDateString = new Date().toISOString().split("T")[0];
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDayName = daysOfWeek[new Date().getDay()];

  // Auto-set the target branch if the user is a restricted co-admin
  useEffect(() => {
    if (adminConfig && adminConfig.role === "coadmin") {
      // ONLY set the branch, leave the year alone so they can select it!
      setTargetBranch(adminConfig.allowedBranch);
    }
  }, [adminConfig]);

  // --- UPGRADED SMART FILTER LOGIC ---
  const filterTimetable = (timetableData, userGroup) => {
    if (!userGroup) return timetableData;
    const filtered = {};

    Object.keys(timetableData).forEach((day) => {
      filtered[day] = timetableData[day].filter((cls) => {
        const groupMatch = cls.name.match(/[\[\(]([A-C](?:[, &|/]+[A-C])*)[\]\)]/i);
        if (groupMatch) {
          return groupMatch[1].toUpperCase().includes(userGroup.toUpperCase());
        }
        return true;
      });
    });
    return filtered;
  };

  // UPDATED: Now filters the raw personal data instead of the admin target data
  const personalTimetable = filterTimetable(myTimetableRaw, userProfile?.group);

  // Live Timetable Connection
  useEffect(() => {
    if (!userProfile) return;

    // 1. ALWAYS download the user's OWN profile timetable for their Daily Track
    const myTimetableId = getTimetableId(userProfile.year, userProfile.branch, userProfile.batch);
    const unsubPersonal = onSnapshot(doc(db, "timetables", myTimetableId), (docSnap) => {
      if (docSnap.exists()) setMyTimetableRaw(docSnap.data());
      else setMyTimetableRaw({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
    });

    // 2. If they are an Admin, ALSO download the Target timetable for their Admin Panel
    let unsubAdmin = () => { };
    if (isAdmin) {
      const targetTimetableId = getTimetableId(targetYear, targetBranch, targetBatch);
      unsubAdmin = onSnapshot(doc(db, "timetables", targetTimetableId), (docSnap) => {
        if (docSnap.exists()) setMasterTimetable(docSnap.data());
        else setMasterTimetable({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
      });
    }

    // Cleanup both listeners when leaving
    return () => {
      unsubPersonal();
      unsubAdmin();
    };
  }, [userProfile, isAdmin, targetYear, targetBranch, targetBatch]);

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

    // SMART FIX: Now we find the specific class by BOTH name and time
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

    // ALLOW NEGATIVES: We removed the zero-limit so users can subtract auto-tracked mistakes!
    let newCount = subjectAdj[type] + (operation === 'add' ? 1 : -1);

    const updatedProfile = {
      ...userProfile,
      manualAdjustments: {
        ...currentAdjustments,
        [subject]: { ...subjectAdj, [type]: newCount }
      }
    };

    setUserProfile(updatedProfile);
    await saveProfile(user.uid, updatedProfile);
    toast.success(`${subject} manually updated!`);
  };

  const availableSubjects = Array.from(new Set(Object.values(personalTimetable).flatMap(d => d.map(s => s.name))))
    .filter(n => n !== "" && !n.toUpperCase().includes("LIB"))
    .sort();

  if (loadingAuth) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-500"></div></div>;

  if (!user) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc' } }} />
      <div className="max-w-md w-full bg-slate-900/40 border border-slate-800 p-8 rounded-3xl backdrop-blur-xl text-center shadow-2xl">
        <div className="mx-auto w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-4"><span className="text-3xl">🎓</span></div>
        <h1 className="text-2xl font-extrabold text-slate-100">AIT Hub</h1>
        <button onClick={handleAuthLogin} className="w-full flex justify-center gap-3 bg-white text-slate-900 font-bold py-3 px-4 rounded-xl mt-6">Sign in with Google</button>
      </div>
    </div>
  );

  if (user && !userProfile) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/40 border border-slate-800 p-8 rounded-3xl">
        <h2 className="text-2xl font-bold text-slate-100 mb-6">Complete Profile</h2>
        <form onSubmit={handleProfileSetup} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Year</label><select value={onboardYear} onChange={(e) => setOnboardYear(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="FE">FE</option><option value="SE">SE</option><option value="TE">TE</option><option value="BE">BE</option></select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Branch</label><select value={onboardBranch} onChange={(e) => setOnboardBranch(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="CS">CS</option><option value="IT">IT</option><option value="Mechanical">Mechanical</option><option value="ENTC">ENTC</option><option value="ARE">ARE</option></select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Batch</label><select value={onboardBatch} onChange={(e) => setOnboardBatch(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="A">A</option><option value="B">B</option></select></div>
            <div><label className="block text-xs text-slate-400 mb-1">Group</label><select value={onboardGroup} onChange={(e) => setOnboardGroup(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-none"><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div>
          </div>
          <button type="submit" className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-xl font-bold">Launch Dashboard</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8 selection:bg-indigo-500 selection:text-white">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' } }} />
      <div className="max-w-4xl mx-auto space-y-8">

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">AIT Hub</h1>
              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-1 rounded-md">{userProfile.year} • {userProfile.branch} • {userProfile.batch}{userProfile.group}</span>
              {isAdmin && <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2 py-1 rounded-md">ADMIN</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 w-full md:w-auto">
            <button onClick={logoutUser} className="text-xs text-rose-400 font-medium">Sign Out</button>
            <nav className="flex space-x-1 bg-slate-900/80 backdrop-blur-md p-1 border border-slate-800 rounded-xl w-full justify-center">
              <button onClick={() => setActiveTab("track")} className={`px-4 py-2 text-sm rounded-lg ${activeTab === "track" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Daily Track</button>
              <button onClick={() => setActiveTab("analytics")} className={`px-4 py-2 text-sm rounded-lg ${activeTab === "analytics" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Analytics</button>
              <button onClick={() => setActiveTab("schedule")} className={`px-4 py-2 text-sm rounded-lg ${activeTab === "schedule" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>{isAdmin ? "Admin Controls" : "My Schedule"}</button>
              <button onClick={() => setActiveTab("contact")} className={`px-4 py-2 text-sm rounded-lg ${activeTab === "contact" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Contact</button>

              {/* NEW: Secret Tab that only renders for Superadmins */}
              {isSuperAdmin && (
                <button onClick={() => setActiveTab("database")} className={`px-4 py-2 text-sm font-bold rounded-lg ${activeTab === "database" ? "bg-rose-600 text-white" : "text-rose-400/70 hover:text-rose-400 transition-colors"}`}>
                  System DB
                </button>
              )}
            </nav>
          </div>
        </header>

        {activeTab === "track" && <DailyTrack timetable={personalTimetable} attendance={attendance} todayDayName={todayDayName} todayDateString={todayDateString} handleMarkAttendance={handleMarkAttendance} userProfile={userProfile} handleUpdateProfile={async (data) => { await saveProfile(user.uid, data); setUserProfile(data); }} />}

        {activeTab === "analytics" && (
          <Analytics
            attendance={attendance}
            availableSubjects={availableSubjects}
            todayDateString={todayDateString}
            userProfile={userProfile}
            handleManualAdjustment={handleManualAdjustment}
          />
        )}

        {activeTab === "schedule" && (
          <SchedulePanel
            isAdmin={isAdmin}
            adminConfig={adminConfig}
            timetable={isAdmin ? masterTimetable : personalTimetable}
            currentTargetId={isAdmin ? getTimetableId(targetYear, targetBranch, targetBatch) : getTimetableId(userProfile.year, userProfile.branch, userProfile.batch)}
            daysOfWeek={daysOfWeek}
            targetYear={targetYear}
            setTargetYear={setTargetYear}
            targetBranch={targetBranch}
            setTargetBranch={setTargetBranch}
            targetBatch={targetBatch}
            setTargetBatch={setTargetBatch}
            isUploading={isUploading}
            handleImageUpload={handleImageUpload}
            handleClearDaySchedule={(d) => saveGlobalTimetable(getTimetableId(targetYear, targetBranch, targetBatch), { ...masterTimetable, [d]: [] })}
          />
        )}

        {/* NEW: System Database component rendered for superadmins */}
        {activeTab === "database" && isSuperAdmin && (
          <SuperadminPanel />
        )}

        {activeTab === "contact" && (
          <ContactPanel userProfile={userProfile} />
        )}

      </div>
    </div>
  );
}
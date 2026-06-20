"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase";
import toast, { Toaster } from "react-hot-toast";

// Import our new modules
import { loginUser, logoutUser, saveProfile, fetchAttendanceData, saveAttendanceData, saveGlobalTimetable, getCohortId } from "../services/api";
import DailyTrack from "../components/DailyTrack";
import Analytics from "../components/Analytics";
import SchedulePanel from "../components/SchedulePanel";

export default function AttendanceTracker() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const isAdmin = userProfile?.email === ADMIN_EMAIL;

  const [onboardYear, setOnboardYear] = useState("FE");
  const [onboardBranch, setOnboardBranch] = useState("CS");
  const [onboardBatch, setOnboardBatch] = useState("A");
  const [onboardGroup, setOnboardGroup] = useState("A");

  const [activeTab, setActiveTab] = useState("track");
  const [timetable, setTimetable] = useState({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
  const [attendance, setAttendance] = useState({});

  const [targetYear, setTargetYear] = useState("SE");
  const [targetBranch, setTargetBranch] = useState("IT");
  const [targetBatch, setTargetBatch] = useState("A");
  const [targetGroup, setTargetGroup] = useState("B");

  const todayDateString = new Date().toISOString().split("T")[0];
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDayName = daysOfWeek[new Date().getDay()];

  // Live Timetable Connection
  useEffect(() => {
    if (!userProfile) return;
    const cohortId = isAdmin ? getCohortId(targetYear, targetBranch, targetBatch, targetGroup) : getCohortId(userProfile.year, userProfile.branch, userProfile.batch, userProfile.group);

    const unsubscribe = onSnapshot(doc(db, "timetables", cohortId), (docSnap) => {
      if (docSnap.exists()) setTimetable(docSnap.data());
      else setTimetable({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] });
    });
    return () => unsubscribe();
  }, [userProfile, isAdmin, targetYear, targetBranch, targetBatch, targetGroup]);

  // Auth Listener
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
    const tId = toast.loading("Processing AI Import...");
    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/parse-timetable", { method: "POST", body: formData });
      if (!response.ok) throw new Error();
      const generated = await response.json();
      const newTimetable = { ...timetable, ...generated };
      await saveGlobalTimetable(getCohortId(targetYear, targetBranch, targetBatch, targetGroup), newTimetable);
      toast.success("Import successful!", { id: tId });
    } catch { toast.error("Error processing image.", { id: tId }); }
    finally { setIsUploading(false); }
  };

  const handleMarkAttendance = async (subjectName, status) => {
    if (!user) return;
    const dayData = attendance[todayDateString] || { month: todayDateString.substring(0, 7), records: [] };
    const rIndex = dayData.records.findIndex(r => r.subject === subjectName);
    const updatedRecords = [...dayData.records];
    if (rIndex > -1) updatedRecords[rIndex].status = status;
    else updatedRecords.push({ subject: subjectName, status });

    const newDayData = { ...dayData, records: updatedRecords };
    setAttendance(prev => ({ ...prev, [todayDateString]: newDayData }));
    await saveAttendanceData(user.uid, todayDateString, newDayData);
  };

  const availableSubjects = Array.from(new Set(Object.values(timetable).flatMap(d => d.map(s => s.name)))).filter(n => n !== "").sort();

  if (loadingAuth) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-500"></div></div>;

  // Unauthenticated UI
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

  // Onboarding UI
  if (user && !userProfile) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/40 border border-slate-800 p-8 rounded-3xl">
        <h2 className="text-2xl font-bold text-slate-100 mb-6">Complete Profile</h2>
        <form onSubmit={handleProfileSetup} className="space-y-4">
          {/* Form omitted for brevity - Keep your existing Onboarding selects here */}
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
              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-1 rounded-md">{userProfile.year} • {userProfile.branch}</span>
              {isAdmin && <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2 py-1 rounded-md">ADMIN</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 w-full md:w-auto">
            <button onClick={logoutUser} className="text-xs text-rose-400 font-medium">Sign Out</button>
            <nav className="flex space-x-1 bg-slate-900/80 backdrop-blur-md p-1 border border-slate-800 rounded-xl w-full justify-center">
              <button onClick={() => setActiveTab("track")} className={`px-4 py-2 text-sm rounded-lg ${activeTab === "track" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Daily Track</button>
              <button onClick={() => setActiveTab("analytics")} className={`px-4 py-2 text-sm rounded-lg ${activeTab === "analytics" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Analytics</button>
              <button onClick={() => setActiveTab("schedule")} className={`px-4 py-2 text-sm rounded-lg ${activeTab === "schedule" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>{isAdmin ? "Admin Controls" : "My Schedule"}</button>
            </nav>
          </div>
        </header>

        {activeTab === "track" && (
          <DailyTrack
            timetable={timetable}
            attendance={attendance}
            todayDayName={todayDayName}
            todayDateString={todayDateString}
            handleMarkAttendance={handleMarkAttendance}
            userProfile={userProfile}
            handleUpdateProfile={async (updatedProfile) => {
              try {
                await saveProfile(user.uid, updatedProfile);
                setUserProfile(updatedProfile);
                toast.success("Profile updated!");
              } catch {
                toast.error("Failed to update profile.");
              }
            }}
          />
        )}
        {activeTab === "analytics" && <Analytics attendance={attendance} availableSubjects={availableSubjects} todayDateString={todayDateString} />}
        {activeTab === "schedule" && <SchedulePanel isAdmin={isAdmin} timetable={timetable} currentTargetId={getCohortId(targetYear, targetBranch, targetBatch, targetGroup)} daysOfWeek={daysOfWeek} targetYear={targetYear} setTargetYear={setTargetYear} targetBranch={targetBranch} setTargetBranch={setTargetBranch} targetBatch={targetBatch} setTargetBatch={setTargetBatch} targetGroup={targetGroup} setTargetGroup={setTargetGroup} isUploading={isUploading} handleImageUpload={handleImageUpload} handleClearDaySchedule={(d) => saveGlobalTimetable(getCohortId(targetYear, targetBranch, targetBatch, targetGroup), { ...timetable, [d]: [] })} />}

      </div>
    </div>
  );
}
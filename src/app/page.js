"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import toast, { Toaster } from "react-hot-toast"; 

export default function AttendanceTracker() {
  const [activeTab, setActiveTab] = useState("track");

  // Analytics scoping states
  const [analyticsFilter, setAnalyticsFilter] = useState("till-date");
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().substring(0, 7));
  
  // NEW: Subject scoping state ("overall" or a specific subject name)
  const [subjectScope, setSubjectScope] = useState("overall");

  const [timetable, setTimetable] = useState({
    Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
  });

  const [attendance, setAttendance] = useState({});

  // Fetch timetable on initial load
  useEffect(() => {
    const fetchTimetable = async () => {
      try {
        const docRef = doc(db, "schedules", "my_weekly_timetable");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setTimetable(docSnap.data());
        }
      } catch (error) {
        console.error("Error fetching timetable:", error);
        toast.error("Failed to load your timetable.");
      }
    };
    fetchTimetable();
  }, []);

  // Fetch historical attendance records on initial load
  useEffect(() => {
    const fetchAttendanceHistory = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "attendance_records"));
        const historicalData = {};
        
        querySnapshot.forEach((doc) => {
          historicalData[doc.id] = doc.data();
        });
        
        setAttendance(historicalData);
      } catch (error) {
        console.error("Error fetching historical attendance:", error);
      }
    };
    fetchAttendanceHistory();
  }, []);

  const saveTimetableToFirebase = async (newTimetable) => {
    try {
      await setDoc(doc(db, "schedules", "my_weekly_timetable"), newTimetable);
    } catch (error) {
      console.error("Error saving to Firebase:", error);
      toast.error("Failed to save schedule to database.");
    }
  };

  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const loadingToast = toast.loading("Processing image with AI...");

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/parse-timetable", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to parse image");

      const generatedTimetable = await response.json();

      setTimetable((prev) => {
        const newTimetable = { ...prev, ...generatedTimetable };
        saveTimetableToFirebase(newTimetable);
        return newTimetable;
      });

      toast.success("Timetable successfully imported!", { id: loadingToast });
    } catch (error) {
      console.error(error);
      toast.error("Error processing the image.", { id: loadingToast });
    } finally {
      setIsUploading(false);
    }
  };

  const [selectedDay, setSelectedDay] = useState("Monday");
  const [newSubject, setNewSubject] = useState("");
  const [newTime, setNewTime] = useState("");

  const todayDateString = new Date().toISOString().split("T")[0]; 
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDayName = daysOfWeek[new Date().getDay()];

  // Dynamically extract all unique subjects directly from your saved timetable
  const availableSubjects = Array.from(new Set(
    Object.values(timetable).flatMap(dayClasses => dayClasses.map(subjectObj => subjectObj.name))
  )).filter(name => name !== "").sort();

  const handleMarkAttendance = async (subjectName, status) => {
    const currentMonth = todayDateString.substring(0, 7); 
    const dayData = attendance[todayDateString] || { month: currentMonth, records: [] };
    const existingRecordIndex = dayData.records.findIndex((r) => r.subject === subjectName);

    let updatedRecords = [...dayData.records];
    if (existingRecordIndex > -1) {
      updatedRecords[existingRecordIndex].status = status; 
    } else {
      updatedRecords.push({ subject: subjectName, status }); 
    }

    const newDayData = { ...dayData, records: updatedRecords };

    setAttendance((prev) => ({
      ...prev,
      [todayDateString]: newDayData,
    }));

    try {
      await setDoc(doc(db, "attendance_records", todayDateString), newDayData);
    } catch (error) {
      console.error("Error saving attendance:", error);
      toast.error("Failed to sync attendance.");
    }
  };

  const handleAddClass = (e) => {
    e.preventDefault();
    if (!newSubject || !newTime) return;

    setTimetable((prev) => {
      const newTimetable = {
        ...prev,
        [selectedDay]: [...(prev[selectedDay] || []), { name: newSubject, time: newTime }],
      };
      saveTimetableToFirebase(newTimetable);
      return newTimetable;
    });

    setNewSubject("");
    setNewTime("");
    toast.success(`Added ${newSubject} to ${selectedDay}`);
  };

  const handleClearDaySchedule = (day) => {
    setTimetable((prev) => {
      const newTimetable = { ...prev, [day]: [] };
      saveTimetableToFirebase(newTimetable);
      return newTimetable;
    });
    toast.success(`Cleared schedule for ${day}`);
  };

  const calculateStats = () => {
    let totalAttended = 0;
    let totalValid = 0;
    const subjectStats = {};
    const fullReportLog = []; 

    const sortedDates = Object.keys(attendance).sort();

    sortedDates.forEach((date) => {
      const day = attendance[date];

      // Time Scope Filters
      if (analyticsFilter === "month" && day.month !== filterMonth) return;
      if (analyticsFilter === "till-date" && date > todayDateString) return;

      // Subject Scope Filter: Only process records that match the selected subject (or all if overall)
      const filteredRecords = day.records.filter(r => subjectScope === "overall" || r.subject === subjectScope);
      
      // If no classes match the filter for this day, skip adding it to the ledger entirely
      if (filteredRecords.length === 0) return;

      // Add the filtered day to the ledger
      fullReportLog.push({ date, ...day, records: filteredRecords });

      // Calculate stats based on the filtered records
      filteredRecords.forEach((record) => {
        if (record.status !== "Cancelled") {
          totalValid++;
          if (record.status === "Attended") totalAttended++;

          if (!subjectStats[record.subject]) {
            subjectStats[record.subject] = { attended: 0, total: 0 };
          }
          subjectStats[record.subject].total++;
          if (record.status === "Attended") {
            subjectStats[record.subject].attended++;
          }
        }
      });
    });

    const overallPercentage = totalValid > 0 ? Math.round((totalAttended / totalValid) * 100) : 0;

    return {
      overallPercentage,
      totalAttended,
      totalValid,
      subjectStats,
      fullReportLog: fullReportLog.reverse() 
    };
  };

  const stats = calculateStats();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8 selection:bg-indigo-500 selection:text-white">
      
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1e293b', 
            color: '#f8fafc',      
            border: '1px solid #334155', 
          },
        }}
      />

      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header Block */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              AIT Attendance Tracker
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Personal Dashboard • {todayDayName}, {todayDateString}
            </p>
          </div>

          {/* Navigation Tab Controls */}
          <nav className="flex space-x-1 bg-slate-900/80 backdrop-blur-md p-1 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab("track")}
              className={`px-4 py-2 text-sm font-medium transition-all rounded-lg ${activeTab === "track"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              Daily Track
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-4 py-2 text-sm font-medium transition-all rounded-lg ${activeTab === "analytics"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-4 py-2 text-sm font-medium transition-all rounded-lg ${activeTab === "upload"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              Manage Schedule
            </button>
          </nav>
        </header>

        {/* TAB 1: DAILY ATTENDANCE TRACKING */}
        {activeTab === "track" && (
          <section className="space-y-6 animate-fadeIn">
            <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-2 text-slate-200">Today's Lectures</h2>
              <p className="text-sm text-slate-400 mb-6">
                Mark classes scheduled for today. Changes auto-save locally.
              </p>

              {timetable[todayDayName] && timetable[todayDayName].length > 0 ? (
                <div className="grid gap-4">
                  {timetable[todayDayName].map((subject, idx) => {
                    const currentStatus = attendance[todayDateString]?.records.find(
                      (r) => r.subject === subject.name
                    )?.status;

                    return (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-xl gap-4 transition-all hover:border-slate-700"
                      >
                        <div>
                          <h3 className="font-semibold text-slate-200 text-lg">{subject.name}</h3>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-400 inline-block mt-1">
                            {subject.time}
                          </span>
                        </div>

                        {/* Attendance Action Button Group */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => handleMarkAttendance(subject.name, "Attended")}
                            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${currentStatus === "Attended"
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                              }`}
                          >
                            Attended
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(subject.name, "Missed")}
                            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${currentStatus === "Missed"
                              ? "bg-rose-500/20 border-rose-500 text-rose-400"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                              }`}
                          >
                            Missed
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(subject.name, "Cancelled")}
                            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${currentStatus === "Cancelled"
                              ? "bg-amber-500/20 border-amber-500 text-amber-400"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                              }`}
                          >
                            N/A
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-500">
                  No classes tracked or scheduled for {todayDayName}.
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 2: ANALYTICS DASHBOARD */}
        {activeTab === "analytics" && (
          <section className="space-y-4 animate-fadeIn">
            
            {/* Control Panel Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Report Scope Selector */}
              <div className="flex flex-col gap-2 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl backdrop-blur-xl">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Time Scope</span>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex space-x-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
                    <button
                      onClick={() => setAnalyticsFilter("till-date")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${analyticsFilter === "till-date" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      Till Date
                    </button>
                    <button
                      onClick={() => setAnalyticsFilter("month")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${analyticsFilter === "month" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setAnalyticsFilter("semester")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${analyticsFilter === "semester" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      Semester
                    </button>
                  </div>

                  {analyticsFilter === "month" && (
                    <select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg text-xs font-medium px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="2026-06">June 2026</option>
                      <option value="2026-07">July 2026</option>
                      <option value="2026-08">August 2026</option>
                      <option value="2026-09">September 2026</option>
                      <option value="2026-10">October 2026</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Subject Scope Selector */}
              <div className="flex flex-col gap-2 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl backdrop-blur-xl">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Subject Scope</span>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex space-x-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
                    <button
                      onClick={() => setSubjectScope("overall")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${subjectScope === "overall" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      Overall
                    </button>
                    <button
                      onClick={() => {
                        if (subjectScope === "overall" && availableSubjects.length > 0) {
                          setSubjectScope(availableSubjects[0]);
                        }
                      }}
                      disabled={availableSubjects.length === 0}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${subjectScope !== "overall" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      Specific
                    </button>
                  </div>

                  {subjectScope !== "overall" && (
                    <select
                      value={subjectScope}
                      onChange={(e) => setSubjectScope(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg text-xs font-medium px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 max-w-[150px] truncate"
                    >
                      {availableSubjects.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

            </div>

            {/* Highlights Card Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
                <span className="text-xs font-medium text-slate-400 block uppercase tracking-wider">
                  Calculated Ratio
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-indigo-400">
                    {stats.overallPercentage}%
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
                <span className="text-xs font-medium text-slate-400 block uppercase tracking-wider">
                  Lectures Counted
                </span>
                <div className="mt-2 flex items-baseline gap-1 text-slate-200">
                  <span className="text-4xl font-extrabold text-emerald-400">
                    {stats.totalAttended}
                  </span>
                  <span className="text-slate-500 font-medium">/ {stats.totalValid}</span>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
                <span className="text-xs font-medium text-slate-400 block uppercase tracking-wider">
                  Target Threshold
                </span>
                <div className="mt-2">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${stats.overallPercentage >= 75
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                  >
                    {stats.overallPercentage >= 75 ? "Safe (≥75%)" : "Critical (<75%)"}
                  </span>
                </div>
              </div>
            </div>

            {/* Subject-wise Progress Bars */}
            <div className="bg-slate-900/40 border border-slate-800 backdrop-blur-xl rounded-2xl p-6">
              <h3 className="text-lg font-bold text-slate-200 mb-6">Subject Breakdown</h3>
              <div className="space-y-5">
                {Object.keys(stats.subjectStats).length > 0 ? (
                  Object.entries(stats.subjectStats).map(([subjectName, data]) => {
                    const percentage = Math.round((data.attended / data.total) * 100);
                    return (
                      <div key={subjectName} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-slate-300">{subjectName}</span>
                          <span className="text-slate-400 font-mono">
                            {percentage}% ({data.attended}/{data.total})
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${percentage >= 75 ? "bg-indigo-500" : "bg-rose-500"
                              }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    No logs found for this specific filter scope.
                  </div>
                )}
              </div>
            </div>

            {/* FULL SEMESTER REPORT EXTENSION VIEW */}
            {analyticsFilter === "semester" && (
              <div className="bg-slate-900/40 border border-slate-800 backdrop-blur-xl rounded-2xl p-6 space-y-4 animate-fadeIn">
                <h3 className="text-lg font-bold text-slate-200">Chronological Sheet Ledger</h3>
                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 bg-slate-950/40">
                  {stats.fullReportLog.length > 0 ? (
                    stats.fullReportLog.map((dayLog) => (
                      <div key={dayLog.date} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/30 transition-all">
                        <span className="text-sm font-mono font-bold text-indigo-400">{dayLog.date}</span>
                        <div className="flex flex-wrap gap-2">
                          {dayLog.records.map((rec, i) => (
                            <span 
                              key={i} 
                              className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                                rec.status === "Attended" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                                rec.status === "Missed" ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
                                "bg-slate-800 border-slate-700 text-slate-400"
                              }`}
                            >
                              {rec.subject}: {rec.status === "Cancelled" ? "N/A" : rec.status}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-sm text-slate-500">No database logs recorded yet for this scope.</div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: TIMETABLE WEEKLY UPLOAD */}
        {activeTab === "upload" && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">

            {/* Left Column: Input Forms (AI + Manual) */}
            <div className="md:col-span-1 space-y-6">

              {/* AI Auto-Upload Card */}
              <div className="bg-slate-900/40 border border-indigo-500/30 backdrop-blur-xl rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-indigo-600 text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                  AI POWERED
                </div>
                <h3 className="text-lg font-bold text-slate-200 mb-2">Auto-Import</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Upload a photo of your schedule. Gemini AI will extract the subjects and times automatically.
                </p>

                <label className={`flex items-center justify-center w-full border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all ${isUploading ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 hover:border-indigo-400 hover:bg-slate-800/50'}`}>
                  <div className="text-center">
                    <span className="text-sm font-semibold text-indigo-400">
                      {isUploading ? "Processing Image..." : "Click to Upload Image"}
                    </span>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                  />
                </label>
              </div>

              {/* Manual Entry Form */}
              <div className="bg-slate-900/40 border border-slate-800 backdrop-blur-xl rounded-2xl p-6 h-fit">
                <h3 className="text-lg font-bold text-slate-200 mb-4">Manual Entry</h3>
                <form onSubmit={handleAddClass} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Day of Week
                    </label>
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      {daysOfWeek.filter((d) => d !== "Sunday").map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Subject Title
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Embedded Systems"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Time Window
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 10:30 AM"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-indigo-600/10"
                  >
                    Add to Route
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Timetable Overview Config */}
            <div className="bg-slate-900/40 border border-slate-800 backdrop-blur-xl rounded-2xl p-6 md:col-span-2 space-y-4">
              <h3 className="text-lg font-bold text-slate-200">Current Saved Layout</h3>

              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                {daysOfWeek
                  .filter((d) => d !== "Sunday")
                  .map((day) => (
                    <div key={day} className="border-b border-slate-800/60 pb-3 last:border-none">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-indigo-400 text-sm">{day}</h4>
                        {timetable[day]?.length > 0 && (
                          <button
                            onClick={() => handleClearDaySchedule(day)}
                            className="text-xs text-rose-400 hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {timetable[day]?.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {timetable[day].map((sub, i) => (
                            <span
                              key={i}
                              className="bg-slate-900 border border-slate-800/80 px-2.5 py-1 rounded-lg text-xs flex items-center gap-2"
                            >
                              <span className="text-slate-300 font-medium">{sub.name}</span>
                              <span className="text-slate-500 font-mono text-[10px]">
                                {sub.time}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600 italic">No lectures configured.</span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
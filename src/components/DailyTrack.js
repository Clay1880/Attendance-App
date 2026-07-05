import React, { useState } from "react";

export default function DailyTrack({ 
  timetable, 
  attendance, 
  todayDayName, 
  todayDateString, 
  handleMarkAttendance,
  userProfile,          
  handleUpdateProfile   
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    year: userProfile?.year || "FE",
    branch: userProfile?.branch || "CS",
    batch: userProfile?.batch || "A",
    group: userProfile?.group || "A"
  });

  const onSave = () => {
    handleUpdateProfile({ ...userProfile, ...editForm });
    setIsEditing(false);
  };

  // Pre-filter today's classes to completely remove any Library (LIB) periods
  const todaysClassesRaw = timetable[todayDayName] || [];
  const todaysClasses = todaysClassesRaw.filter(subject => !subject.name.toUpperCase().includes("LIB"));

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
      
      {/* LEFT SIDE: Today's Lectures */}
      <div className="md:col-span-2 bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 h-fit">
        <h2 className="text-xl font-bold mb-2 text-slate-200">Today's Lectures</h2>
        <p className="text-sm text-slate-400 mb-6">Mark classes scheduled for today.</p>
        
        {todaysClasses.length > 0 ? (
          <div className="grid gap-4">
            {todaysClasses.map((subject, idx) => {
              // Extract short code just in case old data exists
              const subjectCode = subject.name.split(" ")[0]; 
              const currentStatus = attendance[todayDateString]?.records.find(r => r.subject === subjectCode)?.status;
              
              return (
                <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-xl gap-4 hover:border-slate-700">
                  <div>
                    <h3 className="font-semibold text-slate-200 text-lg">{subjectCode}</h3>
                    {/* DISPLAY BOTH START AND END TIME */}
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-400 inline-block mt-1">
                      {subject.startTime || subject.time} {subject.endTime ? `→ ${subject.endTime}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button onClick={() => handleMarkAttendance(subjectCode, "Attended")} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${currentStatus === "Attended" ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-slate-900 border-slate-800 text-slate-400"}`}>Attended</button>
                    <button onClick={() => handleMarkAttendance(subjectCode, "Missed")} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${currentStatus === "Missed" ? "bg-rose-500/20 border-rose-500 text-rose-400" : "bg-slate-900 border-slate-800 text-slate-400"}`}>Missed</button>
                    <button onClick={() => handleMarkAttendance(subjectCode, "Cancelled")} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${currentStatus === "Cancelled" ? "bg-amber-500/20 border-amber-500 text-amber-400" : "bg-slate-900 border-slate-800 text-slate-400"}`}>N/A</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-500 mt-2">
            No classes configured for your batch today.
          </div>
        )}
      </div>

      {/* RIGHT SIDE: Profile & Settings Panel */}
      <div className="md:col-span-1 bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 h-fit">
        <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-3 mb-4">Student Profile</h3>
        
        <div className="mb-4">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Google Account</p>
          <p className="text-sm font-medium text-slate-300 truncate">{userProfile?.email}</p>
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Year</label>
              <select value={editForm.year} onChange={(e) => setEditForm({...editForm, year: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 outline-none">
                <option value="FE">FE</option><option value="SE">SE</option><option value="TE">TE</option><option value="BE">BE</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Branch</label>
              <select value={editForm.branch} onChange={(e) => setEditForm({...editForm, branch: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 outline-none">
                <option value="CS">CS</option><option value="IT">IT</option><option value="Mechanical">Mechanical</option><option value="ENTC">ENTC</option><option value="ARE">ARE</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Batch</label>
                <select value={editForm.batch} onChange={(e) => setEditForm({...editForm, batch: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 outline-none">
                  <option value="A">A</option><option value="B">B</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Group</label>
                <select value={editForm.group} onChange={(e) => setEditForm({...editForm, group: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 outline-none">
                  <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-3 mt-2 border-t border-slate-800">
              <button onClick={onSave} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded-lg font-bold transition-all">Save Changes</button>
              <button onClick={() => setIsEditing(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded-lg font-bold transition-all">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Year</p>
                <p className="text-sm font-bold text-indigo-400">{userProfile?.year}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Branch</p>
                <p className="text-sm font-bold text-indigo-400">{userProfile?.branch}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Batch</p>
                <p className="text-sm font-bold text-slate-300">{userProfile?.batch}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Group</p>
                <p className="text-sm font-bold text-slate-300">{userProfile?.group}</p>
              </div>
            </div>
            <button onClick={() => setIsEditing(true)} className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs py-2.5 rounded-lg font-bold transition-all border border-slate-700">
              Update Academic Info
            </button>
          </div>
        )}
      </div>

    </section>
  );
}
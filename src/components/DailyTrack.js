import React, { useState, useEffect } from "react";

const getGroupOptions = (branch, batch) => {
  if (branch === "ENTC") {
    return batch === "A" ? ["A1", "A2", "A3"] : ["B1", "B2", "B3"];
  }
  return ["A", "B", "C"]; 
};

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

  const [localOverrides, setLocalOverrides] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);
  const [customSubjectName, setCustomSubjectName] = useState("");

  useEffect(() => {
    const savedOverrides = localStorage.getItem(`ait_overrides_${todayDateString}`);
    if (savedOverrides) {
      setLocalOverrides(JSON.parse(savedOverrides));
    }
  }, [todayDateString]);

  const currentEditGroups = getGroupOptions(editForm.branch, editForm.batch);
  
  useEffect(() => {
    if (!currentEditGroups.includes(editForm.group)) {
      setEditForm(prev => ({ ...prev, group: currentEditGroups[0] }));
    }
  }, [editForm.branch, editForm.batch, currentEditGroups, editForm.group]);

  const onSave = () => {
    handleUpdateProfile({ ...userProfile, ...editForm });
    setIsEditing(false);
  };

  const handleSaveLocalOverride = (idx, fallbackName) => {
    if (!customSubjectName.trim()) return setEditingIndex(null);
    
    const updated = {
      ...localOverrides,
      [idx]: customSubjectName.trim()
    };
    setLocalOverrides(updated);
    localStorage.setItem(`ait_overrides_${todayDateString}`, JSON.stringify(updated));
    setEditingIndex(null);
  };

  const todaysClassesRaw = timetable[todayDayName] || [];
  const todaysClasses = todaysClassesRaw.filter(subject => !subject.name.toUpperCase().includes("LIB"));

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
      
      {/* LEFT SIDE: Today's Lectures */}
      <div className="md:col-span-2 bg-slate-900/40 border border-slate-800 border-t-slate-700/50 backdrop-blur-xl rounded-2xl p-6 h-fit shadow-xl shadow-black/40">
        <h2 className="text-xl font-bold mb-2 text-slate-200">Today's Lectures</h2>
        <p className="text-sm text-slate-400 mb-6">Mark classes scheduled for today. Use the pencil icon to modify text locally.</p>
        
        {todaysClasses.length > 0 ? (
          <div className="grid gap-4">
            {todaysClasses.map((subject, idx) => {
              const timeString = subject.startTime || subject.time;
              
              // --- SMART BATCH FORMATTING ---
              // If the class has brackets like (A) or (A1) and isn't already labeled as a Lab/Tut, append "Lab"
              let autoFormattedName = subject.name;
              const upperName = autoFormattedName.toUpperCase();
              if (upperName.includes("(") && !upperName.includes("LAB") && !upperName.includes("TUT")) {
                autoFormattedName = autoFormattedName.replace(/\s*\(/, " Lab (");
              }
              
              // Compute display name based on local changes or auto-formatted default
              const displayName = localOverrides[idx] || autoFormattedName;
              
              // We grab the first word for the database key so tracking doesn't break
              const subjectCode = displayName.split(" ")[0]; 

              const currentStatus = attendance[todayDateString]?.records.find(
                r => r.subject === subjectCode && r.time === timeString
              )?.status;
              
              return (
                <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-xl gap-4 hover:border-slate-700 transition-colors duration-200">
                  
                  {/* Subject details & inline local editor */}
                  <div className="flex-1 w-full">
                    {editingIndex === idx ? (
                      <div className="flex items-center gap-2 w-full max-w-[300px] mt-1">
                        <input
                          type="text"
                          value={customSubjectName}
                          onChange={(e) => setCustomSubjectName(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg text-sm p-1.5 text-slate-200 outline-none w-full focus:border-indigo-500"
                          placeholder="e.g. CG Lecture"
                          autoFocus
                        />
                        <button 
                          onClick={() => handleSaveLocalOverride(idx, subject.name)}
                          className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 rounded-md transition-all active:scale-95"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group flex-wrap">
                        <h3 className="font-semibold text-slate-200 text-lg">{displayName}</h3>
                        
                        {/* Inline Pencil Toggle Button */}
                        <button
                          onClick={() => {
                            setEditingIndex(idx);
                            setCustomSubjectName(displayName);
                          }}
                          className="p-1 text-slate-500 hover:text-indigo-400 transition-colors opacity-60 group-hover:opacity-100"
                          title="Change subject for yourself locally"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                      </div>
                    )}
                    
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-400 inline-block mt-1">
                      {timeString} {subject.endTime ? `→ ${subject.endTime}` : ""}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button 
                      onClick={() => handleMarkAttendance(subjectCode, timeString, "Attended")} 
                      className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 active:scale-95 ${currentStatus === "Attended" ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"}`}
                    >
                      Attended
                    </button>
                    <button 
                      onClick={() => handleMarkAttendance(subjectCode, timeString, "Missed")} 
                      className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 active:scale-95 ${currentStatus === "Missed" ? "bg-rose-500/20 border-rose-500 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"}`}
                    >
                      Missed
                    </button>
                    <button 
                      onClick={() => handleMarkAttendance(subjectCode, timeString, "Cancelled")} 
                      className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 active:scale-95 ${currentStatus === "Cancelled" ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}
                    >
                      N/A
                    </button>
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
      <div className="md:col-span-1 bg-slate-900/40 border border-slate-800 border-t-slate-700/50 backdrop-blur-xl rounded-2xl p-6 h-fit shadow-xl shadow-black/40">
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
                  {currentEditGroups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            
            <div className="flex gap-2 pt-3 mt-2 border-t border-slate-800">
              <button onClick={onSave} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_0_10px_rgba(79,70,229,0.3)] border border-indigo-500/30 text-xs py-2 rounded-lg font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-95">Save</button>
              <button onClick={() => setIsEditing(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded-lg font-bold transition-all duration-200 active:scale-95">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800/50 shadow-inner">
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
            <button onClick={() => setIsEditing(true)} className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs py-2.5 rounded-lg font-bold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 border border-slate-700">
              Update Academic Info
            </button>
          </div>
        )}
      </div>
<div className="mt-8 w-full self-stretch md:col-span-3 bg-neutral-950 border border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
  <div className="flex-1">
    <div className="flex items-center gap-2 mb-2">
      <span className="font-mono text-[11px] tracking-wider text-cyan-400 uppercase">Referral</span>
      <div className="h-px flex-1 bg-zinc-800" />
    </div>
    <h3 className="text-zinc-50 font-semibold text-base mb-1">Enjoying AIT Hub?</h3>
    <p className="text-zinc-400 text-sm m-0">Help your classmates stay on top of their attendance too.</p>
  </div>
  <a
    href="https://wa.me/?text=Hey!%20Check%20out%20AIT%20Hub%20-%20it%20automatically%20tracks%20our%20attendance%20and%20manages%20our%20timetables.%20https://attendance-app-iota-teal.vercel.app/"
    target="_blank"
    rel="noopener noreferrer"
    className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 bg-transparent hover:bg-cyan-400/10 border border-cyan-400 text-cyan-400 px-5 py-3 rounded-xl font-mono font-semibold text-sm transition-colors active:scale-95 whitespace-nowrap"
  >
    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.591 5.52 0 10.002-4.48 10.002-10.002 0-5.52-4.482-10.002-10.002-10.002-5.521 0-10.002 4.481-10.002 10.002 0 2.158.653 4.148 1.77 5.867l-1.127 4.117 4.166-1.093z" /></svg>
    Share with classmates
  </a>
</div>

    </section>
  );
}
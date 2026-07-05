import React from "react";

export default function SchedulePanel({
  isAdmin, timetable, currentTargetId, daysOfWeek, adminConfig,
  targetYear, setTargetYear, targetBranch, setTargetBranch,
  targetBatch, setTargetBatch,
  isUploading, handleImageUpload, handleClearDaySchedule
}) {
  
  // Extract role capabilities from the config
  const isSuperAdmin = adminConfig?.role === "superadmin";
  const isCoAdmin = adminConfig?.role === "coadmin";
  const allowedBranch = adminConfig?.allowedBranch;

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
      {isAdmin && (
        <div className="md:col-span-1 space-y-6">
          <div className="bg-slate-900/40 border border-rose-500/30 p-6 rounded-2xl relative">
            <div className="absolute top-0 right-0 bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">ADMIN UPLOAD</div>
            <h3 className="text-lg font-bold text-slate-200 mb-4">Deploy Global Schedule</h3>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {/* YEAR DROPDOWN: Open for EVERYONE */}
              <select 
                value={targetYear} 
                onChange={(e) => setTargetYear(e.target.value)} 
                className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 cursor-pointer"
              >
                <option value="FE">FE</option>
                <option value="SE">SE</option>
                <option value="TE">TE</option>
                <option value="BE">BE</option>
              </select>

              {/* BRANCH DROPDOWN: Locked to a single option for Co-Admins */}
              <select 
                value={targetBranch} 
                onChange={(e) => setTargetBranch(e.target.value)} 
                disabled={isCoAdmin}
                className={`bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 ${isCoAdmin ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                {isCoAdmin ? (
                  /* Co-Admins ONLY see their assigned branch */
                  <option value={allowedBranch}>{allowedBranch}</option>
                ) : (
                  /* Superadmins see all branches */
                  <>
                    <option value="CS">CS</option>
                    <option value="IT">IT</option>
                    <option value="Mechanical">Mechanical</option>
                    <option value="ENTC">ENTC</option>
                    <option value="ARE">ARE</option>
                  </>
                )}
              </select>

              {/* BATCH DROPDOWN: Open for EVERYONE */}
              <select 
                value={targetBatch} 
                onChange={(e) => setTargetBatch(e.target.value)} 
                className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 cursor-pointer"
              >
                <option value="A">Batch A</option>
                <option value="B">Batch B</option>
              </select>
            </div>
            
            <label className="flex items-center justify-center w-full border-2 border-dashed border-rose-500/50 hover:border-rose-400 bg-rose-500/5 rounded-lg p-4 cursor-pointer">
              <span className="text-sm font-semibold text-rose-400">{isUploading ? "Processing..." : "AI Image Import"}</span>
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleImageUpload} disabled={isUploading} />
            </label>
          </div>
        </div>
      )}

      <div className={`bg-slate-900/40 border border-slate-800 p-6 rounded-2xl ${isAdmin ? "md:col-span-2" : "md:col-span-3 max-w-3xl mx-auto w-full"}`}>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-200">{isAdmin ? `Viewing Master: ${currentTargetId}` : "Your Official Timetable"}</h3>
          <p className="text-sm text-slate-400">{isAdmin ? "You are viewing the unfiltered master schedule for this batch." : "This schedule is automatically filtered for your specific group."}</p>
        </div>
        
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {daysOfWeek.filter(d => d !== "Sunday").map(day => (
            <div key={day} className="border-b border-slate-800 pb-3">
              <div className="flex justify-between mb-2">
                <h4 className="font-bold text-indigo-400 text-sm">{day}</h4>
                {isAdmin && timetable[day]?.length > 0 && <button onClick={() => handleClearDaySchedule(day)} className="text-xs text-rose-400 hover:underline">Clear</button>}
              </div>
              
              {timetable[day]?.length > 0 ? (
                <div className="flex flex-wrap gap-3 mt-1">
                  {timetable[day].map((subject, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-slate-900/60 border border-slate-700/50 px-3 py-1.5 rounded-xl hover:border-indigo-500/50 transition-colors"
                    >
                      <span className="text-sm font-semibold text-slate-200">
                        {subject.name}
                      </span>
                      <span className="text-[10px] font-mono text-indigo-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                        {subject.startTime || subject.time} {subject.endTime ? `- ${subject.endTime}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-600 italic mt-1">No classes.</div>
              )}
              
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
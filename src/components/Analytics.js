import React, { useState } from "react";

export default function Analytics({ attendance, availableSubjects, todayDateString }) {
  const [analyticsFilter, setAnalyticsFilter] = useState("till-date");
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().substring(0, 7));
  const [subjectScope, setSubjectScope] = useState("overall");

  const calculateStats = () => {
    let totalAttended = 0, totalValid = 0;
    const subjectStats = {};
    const sortedDates = Object.keys(attendance).sort();

    sortedDates.forEach((date) => {
      const day = attendance[date];
      if (analyticsFilter === "month" && day.month !== filterMonth) return;
      if (analyticsFilter === "till-date" && date > todayDateString) return;

      const filteredRecords = day.records.filter(r => subjectScope === "overall" || r.subject === subjectScope);
      if (filteredRecords.length === 0) return;

      filteredRecords.forEach((record) => {
        // EXCLUSION FILTER: Completely ignore any Library records in calculations
        if (record.subject.toUpperCase().includes("LIB")) {
          return;
        }

        if (record.status !== "Cancelled") {
          totalValid++;
          if (record.status === "Attended") totalAttended++;
          if (!subjectStats[record.subject]) subjectStats[record.subject] = { attended: 0, total: 0 };
          subjectStats[record.subject].total++;
          if (record.status === "Attended") subjectStats[record.subject].attended++;
        }
      });
    });

    const overallPercentage = totalValid > 0 ? Math.round((totalAttended / totalValid) * 100) : 0;
    return { overallPercentage, totalAttended, totalValid, subjectStats };
  };

  const stats = calculateStats();

  return (
    <section className="space-y-4 animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Time Scope</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex space-x-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
              <button onClick={() => setAnalyticsFilter("till-date")} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${analyticsFilter === "till-date" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Till Date</button>
              <button onClick={() => setAnalyticsFilter("month")} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${analyticsFilter === "month" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Monthly</button>
              <button onClick={() => setAnalyticsFilter("semester")} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${analyticsFilter === "semester" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Semester</button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Subject Scope</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex space-x-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
              <button onClick={() => setSubjectScope("overall")} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${subjectScope === "overall" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Overall</button>
              <button onClick={() => { if (availableSubjects.length > 0) setSubjectScope(availableSubjects[0]); }} disabled={availableSubjects.length === 0} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${subjectScope !== "overall" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Specific</button>
            </div>
            {subjectScope !== "overall" && (
              <select value={subjectScope} onChange={(e) => setSubjectScope(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg text-xs p-1.5 text-slate-200 outline-none max-w-[150px] truncate">
                {availableSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
          <span className="text-xs text-slate-400 block uppercase">Ratio</span>
          <span className="text-4xl font-extrabold text-indigo-400 mt-2 block">{stats.overallPercentage}%</span>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
          <span className="text-xs text-slate-400 block uppercase">Lectures Counted</span>
          <div className="mt-2 text-slate-200"><span className="text-4xl font-extrabold text-emerald-400">{stats.totalAttended}</span> <span className="text-slate-500">/ {stats.totalValid}</span></div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
          <span className="text-xs text-slate-400 block uppercase">Target</span>
          <div className="mt-2"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${stats.overallPercentage >= 75 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>{stats.overallPercentage >= 75 ? "Safe (≥75%)" : "Critical (<75%)"}</span></div>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-slate-200 mb-6">Subject Breakdown</h3>
        <div className="space-y-5">
          {Object.keys(stats.subjectStats).length > 0 ? (
            Object.entries(stats.subjectStats).map(([sub, data]) => {
              const percentage = Math.round((data.attended / data.total) * 100);
              return (
                <div key={sub}>
                  <div className="flex justify-between text-sm mb-2"><span className="font-semibold text-slate-300">{sub}</span><span className="text-slate-400 font-mono">{percentage}% ({data.attended}/{data.total})</span></div>
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden"><div className={`h-full rounded-full ${percentage >= 75 ? "bg-indigo-500" : "bg-rose-500"}`} style={{ width: `${percentage}%` }}/></div>
                </div>
              );
            })
          ) : (<div className="text-center text-slate-500 text-sm">No data recorded.</div>)}
        </div>
      </div>
    </section>
  );
}
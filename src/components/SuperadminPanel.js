import React, { useState, useEffect } from "react";
import { fetchAllSystemUsers } from "../services/api";

export default function SuperadminPanel() {
  const [allUsers, setAllUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const loadData = async () => {
      const usersData = await fetchAllSystemUsers();
      setAllUsers(usersData);
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Simple search filter by name, email, or branch
  const filteredUsers = allUsers.filter(u => 
    (u.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.branch?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return <div className="text-center py-12 text-slate-400 animate-pulse">Loading system database...</div>;
  }

  return (
    <section className="space-y-6 animate-fadeIn">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/40 border border-indigo-500/30 p-6 rounded-2xl relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl"></div>
          <span className="text-xs text-indigo-300 block uppercase font-bold tracking-wider mb-2">Total Registered</span>
          <span className="text-4xl font-extrabold text-white">{allUsers.length}</span>
          <span className="text-xs text-slate-400 ml-2">Students</span>
        </div>
        
        {/* You can add more global stats here later, like "Active Today" or "Total Classes Held" */}
        <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl md:col-span-2 flex items-center">
          <div className="w-full">
            <span className="text-xs text-slate-400 block uppercase font-bold tracking-wider mb-2">Database Search</span>
            <input 
              type="text" 
              placeholder="Search by name, email, or branch..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* User Data Table */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Student Name & Email</th>
                <th className="px-6 py-4">Batch Profile</th>
                <th className="px-6 py-4 text-right">Join Date / Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user, idx) => (
                  <tr key={user.uid || idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-200">{user.name || "Unknown User"}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{user.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block bg-slate-800 text-indigo-300 text-[10px] font-bold px-2.5 py-1 rounded-md">
                        {user.year} • {user.branch} • {user.batch}{user.group}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-xs text-emerald-400 font-semibold bg-emerald-400/10 px-2 py-1 rounded-md border border-emerald-400/20">
                        Active
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="px-6 py-8 text-center text-slate-500 italic">
                    No users found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
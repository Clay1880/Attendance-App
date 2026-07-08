import React, { useState, useEffect } from "react";
import { fetchAllSystemUsers } from "../services/api";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import toast from "react-hot-toast";

export default function SuperadminPanel() {
  // --- SUB-NAVIGATION STATE ---
  const [adminTab, setAdminTab] = useState("users"); // "users" or "feedback"

  // --- USER DIRECTORY STATE ---
  const [allUsers, setAllUsers] = useState([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // --- FEEDBACK STATE ---
  const [feedbackList, setFeedbackList] = useState([]);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(true);
  const [ticketFilter, setTicketFilter] = useState("All");

  // 1. Fetch User Directory Data
  useEffect(() => {
    const loadData = async () => {
      const usersData = await fetchAllSystemUsers();
      setAllUsers(usersData);
      setIsUsersLoading(false);
    };
    loadData();
  }, []);

  // 2. Fetch Feedback Data (Real-time)
  useEffect(() => {
    const q = query(collection(db, "feedback"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFeedbackList(data);
      setIsFeedbackLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // --- FEEDBACK ACTIONS ---
  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, "feedback", id), { status: newStatus });
      toast.success(`Ticket marked as ${newStatus}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update status");
    }
  };

  const handleDeleteTicket = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this ticket?")) return;
    try {
      await deleteDoc(doc(db, "feedback", id));
      toast.success("Ticket deleted");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete ticket");
    }
  };

  // --- FILTERING LOGIC ---
  const filteredUsers = allUsers.filter(u => 
    (u.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.branch?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredFeedback = feedbackList.filter(item => ticketFilter === "All" || item.status === ticketFilter);

  const getStatusColor = (status) => {
    if (status === "Open") return "bg-rose-500/10 border-rose-500/30 text-rose-400";
    if (status === "Under Work") return "bg-amber-500/10 border-amber-500/30 text-amber-400";
    if (status === "Resolved") return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    return "bg-slate-800 border-slate-700 text-slate-300";
  };

  if (isUsersLoading || isFeedbackLoading) {
    return <div className="text-center py-12 text-slate-400 animate-pulse">Loading system database...</div>;
  }

  return (
    <section className="space-y-6 animate-fadeIn">
      
      {/* Superadmin Sub-Navigation - FIXED RESPONSIVENESS */}
      <div className="flex flex-wrap gap-2 bg-slate-900/40 p-1.5 border border-slate-800 rounded-xl w-full sm:w-fit">
        <button 
          onClick={() => setAdminTab("users")} 
          className={`flex-auto sm:flex-initial px-4 py-2.5 text-xs md:text-sm font-bold rounded-lg transition-all ${adminTab === "users" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"}`}
        >
          User Directory
        </button>
        <button 
          onClick={() => setAdminTab("feedback")} 
          className={`flex-auto sm:flex-initial px-4 py-2.5 text-xs md:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${adminTab === "feedback" ? "bg-rose-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"}`}
        >
          Support Tickets
          {feedbackList.filter(f => f.status === "Open").length > 0 && (
            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {feedbackList.filter(f => f.status === "Open").length}
            </span>
          )}
        </button>
      </div>

      {/* =========================================
          VIEW 1: USER DIRECTORY
      ========================================= */}
      {adminTab === "users" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/40 border border-indigo-500/30 p-6 rounded-2xl relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl"></div>
              <span className="text-xs text-indigo-300 block uppercase font-bold tracking-wider mb-2">Total Registered</span>
              <span className="text-4xl font-extrabold text-white">{allUsers.length}</span>
              <span className="text-xs text-slate-400 ml-2">Students</span>
            </div>
            
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
        </div>
      )}

      {/* =========================================
          VIEW 2: SUPPORT TICKETS
      ========================================= */}
      {adminTab === "feedback" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header & Filters */}
          <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-rose-400 mb-1">System Command Center</h2>
              <p className="text-sm text-slate-400">Manage user feedback, bug reports, and timetable mismatches.</p>
            </div>
            
            {/* Filter Buttons - FIXED RESPONSIVENESS */}
            <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1.5 border border-slate-800 rounded-xl w-full md:w-auto mt-2 md:mt-0">
              {["All", "Open", "Under Work", "Resolved"].map(f => (
                <button 
                  key={f} 
                  onClick={() => setTicketFilter(f)}
                  className={`flex-auto sm:flex-initial px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${ticketFilter === f ? "bg-rose-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Grid */}
          <div className="grid grid-cols-1 gap-4">
            {filteredFeedback.length > 0 ? (
              filteredFeedback.map(ticket => (
                <div key={ticket.id} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors">
                  <div className="flex flex-col md:flex-row justify-between gap-4">
                    
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border uppercase tracking-wider ${getStatusColor(ticket.status || "Open")}`}>
                          {ticket.status || "Open"}
                        </span>
                        <span className="text-xs font-bold text-slate-300 bg-slate-800 px-2 py-1 rounded-md">
                          {ticket.issueType}
                        </span>
                        <span className="text-xs text-slate-500">
                          {ticket.timestamp?.toDate ? ticket.timestamp.toDate().toLocaleString() : "Just now"}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-slate-200">{ticket.name} <span className="text-slate-500 font-normal">({ticket.email})</span></h3>
                        <p className="text-[11px] font-mono text-indigo-400 mt-0.5">
                          {ticket.year} • {ticket.branch} • Batch {ticket.batch} • Group {ticket.group}
                        </p>
                      </div>

                      <div className="bg-slate-950/50 border border-slate-800/50 p-4 rounded-xl text-sm text-slate-300 whitespace-pre-wrap">
                        {ticket.message}
                      </div>
                    </div>

                    <div className="flex flex-row md:flex-col justify-end md:justify-start gap-2 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-4">
                      <select 
                        value={ticket.status || "Open"} 
                        onChange={(e) => handleUpdateStatus(ticket.id, e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg text-xs p-2.5 text-slate-200 outline-none focus:border-rose-500 cursor-pointer"
                      >
                        <option value="Open">🔴 Mark as Open</option>
                        <option value="Under Work">🟡 Mark Under Work</option>
                        <option value="Resolved">🟢 Mark Resolved</option>
                      </select>
                      
                      <button 
                        onClick={() => handleDeleteTicket(ticket.id)}
                        className="bg-slate-950 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 text-xs py-2.5 px-4 rounded-lg font-bold transition-all"
                      >
                        Delete Ticket
                      </button>
                    </div>

                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                No tickets found for this filter. You're all caught up! 🎉
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
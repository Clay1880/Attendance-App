import React from "react";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function NotificationsPanel({ notifications }) {
  
  const handleMarkAsRead = async (id) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (error) {
      console.error("Error marking read:", error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (error) {
      console.error("Error deleting:", error);
    }
  };

  const getStyle = (type) => {
    if (type === "success") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    if (type === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    if (type === "error") return "border-rose-500/30 bg-rose-500/10 text-rose-400";
    return "border-indigo-500/30 bg-indigo-500/10 text-indigo-400";
  };

  return (
    <section className="max-w-2xl mx-auto space-y-4 animate-fadeIn">
      <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
        <h2 className="text-2xl font-bold text-slate-100 mb-2">Inbox & Notifications</h2>
        <p className="text-sm text-slate-400 mb-6">Updates regarding your support tickets and account status.</p>

        <div className="space-y-4">
          {notifications.length > 0 ? (
            notifications.map((note) => (
              <div 
                key={note.id} 
                className={`p-5 rounded-2xl border transition-all ${note.read ? "bg-slate-900/40 border-slate-800 opacity-60" : "bg-slate-900/80 border-slate-700 shadow-lg"}`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {!note.read && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>}
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getStyle(note.type)}`}>
                        {note.type}
                      </span>
                      <span className="text-xs text-slate-500">
                        {note.timestamp?.toDate ? note.timestamp.toDate().toLocaleString() : "Just now"}
                      </span>
                    </div>
                    <h3 className={`text-base font-bold ${note.read ? "text-slate-300" : "text-slate-100"}`}>{note.title}</h3>
                    <p className="text-sm text-slate-400 mt-2 whitespace-pre-wrap">{note.message}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-4 border-t border-slate-800/50 flex gap-3">
                  {!note.read && (
                    <button onClick={() => handleMarkAsRead(note.id)} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                      Mark as Read
                    </button>
                  )}
                  <button onClick={() => handleDelete(note.id)} className="text-xs font-bold text-slate-500 hover:text-rose-400 transition-colors">
                    Delete Message
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-500">
              Your inbox is empty. No new notifications! 📭
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
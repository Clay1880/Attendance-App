import React, { useState } from "react";
import toast from "react-hot-toast";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export default function ContactPanel({ userProfile }) {
  const [issueType, setIssueType] = useState("Timetable Mismatch");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      return toast.error("Please enter a message!");
    }

    setIsSubmitting(true);
    const tId = toast.loading("Sending report...");

    try {
      // Save the report directly to a new "feedback" collection in Firebase
      await addDoc(collection(db, "feedback"), {
        email: userProfile.email,
        name: userProfile.name || "Unknown",
        year: userProfile.year,
        branch: userProfile.branch,
        batch: userProfile.batch,
        group: userProfile.group,
        issueType,
        message,
        status: "Open", // You can use this later if you build an admin viewer!
        timestamp: serverTimestamp()
      });

      toast.success("Report sent successfully! We will look into it.", { id: tId });
      setMessage(""); // Clear the box after sending
    } catch (error) {
      console.error(error);
      toast.error("Failed to send report. Please try again.", { id: tId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="max-w-2xl mx-auto animate-fadeIn">
      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 md:p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Contact Support</h2>
          <p className="text-sm text-slate-400">Found a mistake in your timetable or facing a technical issue? Let us know below.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Issue Type Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              What is the issue?
            </label>
            <select 
              value={issueType} 
              onChange={(e) => setIssueType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="Timetable Mismatch">Timetable Mismatch</option>
              <option value="Bug / Glitch">App Bug / Glitch</option>
              <option value="Feature Request">Feature Request</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Message Box */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Details
            </label>
            <textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Explain the issue (e.g., 'Tuesday's morning DSA lecture is missing for SE IT Batch B...')"
              rows="5"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 outline-none focus:border-indigo-500 transition-colors custom-scrollbar resize-none"
            ></textarea>
          </div>

          {/* User Context Preview */}
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Reporting as:</span>
            <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md">
              {userProfile.year} {userProfile.branch} ({userProfile.batch}{userProfile.group})
            </span>
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-bold py-3.5 rounded-xl transition-all"
          >
            {isSubmitting ? "Sending..." : "Submit Report"}
          </button>
        </form>
      </div>
    </section>
  );
}
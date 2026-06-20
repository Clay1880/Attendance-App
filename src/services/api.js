import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { signInWithPopup, signOut } from "firebase/auth";
import { db, auth, googleProvider } from "../firebase";

export const loginUser = () => signInWithPopup(auth, googleProvider);
export const logoutUser = () => signOut(auth);

export const saveProfile = (uid, data) => setDoc(doc(db, "users", uid), data);

export const fetchAttendanceData = async (uid) => {
  const snapshot = await getDocs(collection(db, "users", uid, "attendance"));
  const data = {};
  snapshot.forEach((doc) => { data[doc.id] = doc.data(); });
  return data;
};

export const saveAttendanceData = (uid, date, data) => 
  setDoc(doc(db, "users", uid, "attendance", date), data);

export const saveGlobalTimetable = (cohortId, data) => 
  setDoc(doc(db, "timetables", cohortId), data);

export const getCohortId = (year, branch, batch, group) => 
  `${year}-${branch}-${batch}-${group}`;
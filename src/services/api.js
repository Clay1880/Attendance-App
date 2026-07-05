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

export const getTimetableId = (year, branch, batch) => 
  `${year}-${branch}-${batch}`;

export const fetchAllSystemUsers = async () => {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    const usersList = [];
    usersSnapshot.forEach((doc) => {
      usersList.push({ uid: doc.id, ...doc.data() });
    });
    return usersList;
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
};
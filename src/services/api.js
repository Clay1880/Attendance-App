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
    // 1. Get all the basic user profiles
    const usersSnapshot = await getDocs(collection(db, "users"));
    
    // 2. Map through them and fetch their attendance data concurrently for speed
    const userPromises = usersSnapshot.docs.map(async (userDoc) => {
      const userData = userDoc.data();
      
      // 3. Fetch this specific user's attendance data using your existing function
      // (Assuming you have a fetchAttendanceData function, if not, let me know how you fetch it!)
      const userAttendance = await fetchAttendanceData(userDoc.id); 

      // 4. Merge them together into one big object
      return {
        uid: userDoc.id,
        ...userData,
        attendance: userAttendance || {} // Attach it here so the Admin Panel can see it!
      };
    });

    // 5. Wait for all the data to finish downloading, then return it
    const allUsersWithAttendance = await Promise.all(userPromises);
    return allUsersWithAttendance;

  } catch (error) {
    console.error("Error fetching admin user data:", error);
    return [];
  }
};
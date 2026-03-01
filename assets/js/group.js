import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const GROUPS_COLLECTION = "groups";

export async function createGroup(name) {
  try {
    const currentUser = window.currentUserData;
    if (!currentUser?.uid) {
      throw new Error("No authenticated user found for group creation.");
    }

    const groupRef = await addDoc(collection(db, "groups"), {
      name,
      adminId: currentUser.uid,
      status: "active",
      currentRound: 1,
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, "groups", groupRef.id, "members", currentUser.uid), {
      role: "admin",
      status: "active",
      joinedAt: serverTimestamp(),
    });
    return groupRef.id;
  } catch (error) {
    console.error("[group] Failed to create group:", error);
    throw error;
  }
}
export async function createJoinRequest(groupId, userId) {
  if (!groupId || !userId) {
    throw new Error("createJoinRequest requires groupId and userId.");
  }

  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const requestsRef = collection(groupRef, "joinRequests");

  const joinRequestRef = await addDoc(requestsRef, {
    userId,
    requestedAt: serverTimestamp(),
    status: "pending",
  });

  return joinRequestRef;
}

export async function getGroup(groupId) {
  if (!groupId) {
    throw new Error("getGroup requires groupId.");
  }

  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const snapshot = await getDoc(groupRef);

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
}

export async function getGroupMembers(groupId) {
  if (!groupId) {
    throw new Error("getGroupMembers requires groupId.");
  }

  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const membersRef = collection(groupRef, "members");
  const snapshot = await getDocs(membersRef);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function approveJoinRequest(groupId, requestId) {
  if (!groupId || !requestId) {
    throw new Error("approveJoinRequest requires groupId and requestId.");
  }

  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const requestRef = doc(collection(groupRef, "joinRequests"), requestId);

  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error("Join request does not exist.");
  }

  const { userId } = requestSnap.data();
  if (!userId) {
    throw new Error("Join request is missing userId.");
  }

  await addMember(groupId, userId, "member");
  await updateDoc(requestRef, { status: "approved" });
}

export async function rejectJoinRequest(groupId, requestId) {
  if (!groupId || !requestId) {
    throw new Error("rejectJoinRequest requires groupId and requestId.");
  }

  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const requestRef = doc(collection(groupRef, "joinRequests"), requestId);

  await updateDoc(requestRef, { status: "rejected" });
}

export async function blockMember(groupId, userId) {
  if (!groupId || !userId) {
    throw new Error("blockMember requires groupId and userId.");
  }

  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const memberRef = doc(collection(groupRef, "members"), userId);

  await updateDoc(memberRef, { status: "blocked" });
}

export async function removeMember(groupId, userId) {
  if (!groupId || !userId) {
    throw new Error("removeMember requires groupId and userId.");
  }

  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const memberRef = doc(collection(groupRef, "members"), userId);

  await deleteDoc(memberRef);
}

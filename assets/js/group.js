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
  query,
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const GROUPS_COLLECTION = "groups";

function requireGroupId(groupId, methodName) {
  if (!groupId) {
    throw new Error(`${methodName} requires groupId.`);
  }
}

function requireUserId(userId, methodName) {
  if (!userId) {
    throw new Error(`${methodName} requires userId.`);
  }
}

export async function createGroup(name) {
  try {
    const currentUser = window.currentUserData;
    if (!currentUser?.uid) {
      throw new Error("No authenticated user found for group creation.");
    }

    const groupRef = await addDoc(collection(db, GROUPS_COLLECTION), {
      name,
      adminId: currentUser.uid,
      status: "active",
      currentRound: 1,
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, GROUPS_COLLECTION, groupRef.id, "members", currentUser.uid), {
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
  requireGroupId(groupId, "getGroup");


  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const snapshot = await getDoc(groupRef);

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
}

export async function getGroupMembers(groupId) {
  requireGroupId(groupId, "getGroupMembers");

  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const membersRef = collection(groupRef, "members");
  const snapshot = await getDocs(membersRef);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function getMember(groupId, userId) {
  requireGroupId(groupId, "getMember");
  requireUserId(userId, "getMember");

  const memberRef = doc(db, GROUPS_COLLECTION, groupId, "members", userId);
  const snapshot = await getDoc(memberRef);

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
}

export async function joinGroup(groupId, userId) {
  requireGroupId(groupId, "joinGroup");
  requireUserId(userId, "joinGroup");

  const memberRef = doc(db, GROUPS_COLLECTION, groupId, "members", userId);
  await setDoc(memberRef, {
    role: "member",
    status: "active",
    joinedAt: serverTimestamp(),
  });
}

export async function updateMemberRole(groupId, userId, role) {
  requireGroupId(groupId, "updateMemberRole");
  requireUserId(userId, "updateMemberRole");

  if (!role) {
    throw new Error("updateMemberRole requires role.");
  }

  const memberRef = doc(db, GROUPS_COLLECTION, groupId, "members", userId);
  await updateDoc(memberRef, { role });
}

export async function getActiveGroupMembers(groupId) {
  requireGroupId(groupId, "getActiveGroupMembers");

  const membersRef = collection(db, GROUPS_COLLECTION, groupId, "members");
  const activeMembersQuery = query(membersRef, where("status", "==", "active"));
  const snapshot = await getDocs(activeMembersQuery);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function getGroupRounds(groupId) {
  requireGroupId(groupId, "getGroupRounds");

  const roundsRef = collection(db, GROUPS_COLLECTION, groupId, "rounds");
  const roundsQuery = query(roundsRef, orderBy("roundNumber", "desc"));
  const snapshot = await getDocs(roundsQuery);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function startNextRound(groupId, adminUserId) {
  requireGroupId(groupId, "startNextRound");
  requireUserId(adminUserId, "startNextRound");

  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  const groupSnapshot = await getDoc(groupRef);

  if (!groupSnapshot.exists()) {
    throw new Error("Group not found.");
  }

  const groupData = groupSnapshot.data();
  if (groupData.adminId !== adminUserId) {
    throw new Error("Only the group admin can start the next round.");
  }

  const nextRoundNumber = Number(groupData.currentRound ?? 1);
  const activeMembers = await getActiveGroupMembers(groupId);

  if (!activeMembers.length) {
    throw new Error("No active members available for payout.");
  }

  const payoutMember = activeMembers[Math.floor(Math.random() * activeMembers.length)];
  const roundRef = await addDoc(collection(db, GROUPS_COLLECTION, groupId, "rounds"), {
    roundNumber: nextRoundNumber,
    payoutUserId: payoutMember.id,
    status: "pending",
    createdAt: serverTimestamp(),
    completedAt: null,
  });

  await updateDoc(groupRef, {
    currentRound: nextRoundNumber + 1,
  });

  return {
    roundId: roundRef.id,
    roundNumber: nextRoundNumber,
    payoutUserId: payoutMember.id,
  };
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

export async function addMember(groupId, userId, role = "member") {
  requireGroupId(groupId, "addMember");
  requireUserId(userId, "addMember");

  await setDoc(doc(db, GROUPS_COLLECTION, groupId, "members", userId), {
    role,
    status: "active",
    joinedAt: serverTimestamp(),
  });
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

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
import { encryptCardCode, maskCode } from "./crypto-utils.js";

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

async function getUserProfile(userId) {
  requireUserId(userId, "getUserProfile");

  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    throw new Error("User profile not found.");
  }

  const userData = userSnap.data();
  return {
    uid: userId,
    username: userData.username || userId,
    fullName: userData.fullName || userData.name || "Unknown Member",
  };
}

export async function createGroup(name) {
  try {
    const currentUser = window.currentUserData;
    if (!currentUser?.uid) {
      throw new Error("No authenticated user found for group creation.");
    }

    const adminProfile = await getUserProfile(currentUser.uid);

    const groupRef = await addDoc(collection(db, GROUPS_COLLECTION), {
      name,
      adminId: currentUser.uid,
      adminUsername: adminProfile.username,
      status: "active",
      currentRound: 1,
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, GROUPS_COLLECTION, groupRef.id, "members", currentUser.uid), {
      uid: currentUser.uid,
      username: adminProfile.username,
      fullName: adminProfile.fullName,
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
  const membersQuery = query(membersRef, orderBy("joinedAt", "asc"));
  const snapshot = await getDocs(membersQuery);

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

  const profile = await getUserProfile(userId);
  const memberRef = doc(db, GROUPS_COLLECTION, groupId, "members", userId);
  await setDoc(memberRef, {
    uid: userId,
    username: profile.username,
    fullName: profile.fullName,
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
  const activeMembersQuery = query(
    membersRef,
    where("status", "==", "active"),
    orderBy("joinedAt", "asc"),
  );
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

  const payoutIndex = (nextRoundNumber - 1) % activeMembers.length;
  const payoutMember = activeMembers[payoutIndex];

  const roundRef = await addDoc(collection(db, GROUPS_COLLECTION, groupId, "rounds"), {
    roundNumber: nextRoundNumber,
    payoutUserId: payoutMember.uid || payoutMember.id,
    payoutUsername: payoutMember.username || payoutMember.id,
    payoutFullName: payoutMember.fullName || "Unknown Member",
    status: "pending",
    totalApprovedAmount: 0,
    createdAt: serverTimestamp(),
    completedAt: null,
  });

  await updateDoc(groupRef, {
    currentRound: nextRoundNumber + 1,
  });

  return {
    roundId: roundRef.id,
    roundNumber: nextRoundNumber,
    payoutUserId: payoutMember.uid || payoutMember.id,
    payoutUsername: payoutMember.username || payoutMember.id,
    payoutFullName: payoutMember.fullName || "Unknown Member",
  };
}

export async function getRoundSubmissions(groupId, roundId) {
  requireGroupId(groupId, "getRoundSubmissions");
  if (!roundId) {
    throw new Error("getRoundSubmissions requires roundId.");
  }

  const submissionsRef = collection(db, GROUPS_COLLECTION, groupId, "rounds", roundId, "submissions");
  const submissionsQuery = query(submissionsRef, orderBy("submittedAt", "asc"));
  const snapshot = await getDocs(submissionsQuery);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function submitGiftCard(groupId, roundId, userId, submissionData) {
  requireGroupId(groupId, "submitGiftCard");
  requireUserId(userId, "submitGiftCard");
  if (!roundId) {
    throw new Error("submitGiftCard requires roundId.");
  }

  const member = await getMember(groupId, userId);
  if (!member || member.status !== "active") {
    throw new Error("You are not a group member.");
  }

  const group = await getGroup(groupId);
  const requestedAmount = Number(submissionData.giftCardAmount || 0);
  const contributionAmount = Number(group?.contributionAmount || 0);
  if (contributionAmount > 0 && requestedAmount !== contributionAmount) {
    throw new Error("Amount must equal group contribution amount.");
  }

  const profile = await getUserProfile(userId);
  const submissionRef = doc(db, GROUPS_COLLECTION, groupId, "rounds", roundId, "submissions", userId);
  const existingSnapshot = await getDoc(submissionRef);
  const existingSubmission = existingSnapshot.exists() ? existingSnapshot.data() : null;

  if (existingSubmission?.status === "approved") {
    throw new Error("Approved submissions cannot be modified.");
  }

  if (existingSubmission?.status === "pending") {
    throw new Error("Cannot resubmit while pending.");
  }

  // Encryption enforced before Firestore write; plain code is never persisted.
  const encryptedCode = encryptCardCode(groupId, submissionData.giftCardCode || "");
  const maskedCode = maskCode(submissionData.giftCardCode || "");
  const submissionPath = `groups/${groupId}/rounds/${roundId}/submissions/${userId}`;
  const nextVersion = Number(existingSubmission?.version || 0) + 1;

  await setDoc(submissionRef, {
    uid: userId,
    username: profile.username,
    fullName: profile.fullName,
    encryptedCode,
    maskedCode,
    giftCardAmount: contributionAmount > 0 ? contributionAmount : requestedAmount,
    brand: submissionData.brand,
    status: "pending",
    adminNote: "",
    submittedAt: serverTimestamp(),
    verifiedAt: null,
    version: nextVersion,
  });
  
  await addDoc(collection(db, "cards"), {
    groupId,
    roundId,
    submissionId: submissionPath,
    username: profile.username,
    fullName: profile.fullName,
    maskedCode,
    giftCardAmount: contributionAmount > 0 ? contributionAmount : requestedAmount,
    brand: submissionData.brand,
    status: "pending",
    submittedAt: serverTimestamp(),
    version: nextVersion,
  });

  return {
    status: "pending",
    version: nextVersion,
    maskedCode,
  };
}

async function syncCardIndexStatus({ groupId, roundId, submissionUid, updates }) {
  const submissionPath = `groups/${groupId}/rounds/${roundId}/submissions/${submissionUid}`;
  const cardsRef = collection(db, "cards");
  const cardsQuery = query(cardsRef, where("submissionId", "==", submissionPath));
  const cardsSnap = await getDocs(cardsQuery);

  const tasks = cardsSnap.docs.map((cardDoc) => updateDoc(cardDoc.ref, updates));
  await Promise.all(tasks);
}

export async function reviewSubmission(groupId, roundId, submissionUid, adminUid, status, adminNote = "") {
  requireGroupId(groupId, "reviewSubmission");
  requireUserId(adminUid, "reviewSubmission");
  requireUserId(submissionUid, "reviewSubmission");

  if (!roundId) {
    throw new Error("reviewSubmission requires roundId.");
  }

  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Invalid submission status.");
  }

  const group = await getGroup(groupId);
  if (!group || group.adminId !== adminUid) {
    throw new Error("Only admin can review submissions.");
  }

  const submissionRef = doc(db, GROUPS_COLLECTION, groupId, "rounds", roundId, "submissions", submissionUid);
  const submissionSnap = await getDoc(submissionRef);

  if (!submissionSnap.exists()) {
    throw new Error("Submission not found.");
  }

  const submission = submissionSnap.data();
  if (submission.status !== "pending") {
    throw new Error("This submission has already been reviewed.");
  }

  await updateDoc(submissionRef, {
    status,
    adminNote: status === "rejected" ? (adminNote || "No note provided") : "",
    verifiedAt: serverTimestamp(),
  });
  
  await syncCardIndexStatus({
    groupId,
    roundId,
    submissionUid,
    updates: {
      status,
    },
  });

  const roundRef = doc(db, GROUPS_COLLECTION, groupId, "rounds", roundId);
  const allSubmissions = await getRoundSubmissions(groupId, roundId);
  const approvedSubmissions = allSubmissions.filter((item) => item.status === "approved");
  const totalApprovedAmount = approvedSubmissions.reduce((sum, item) => sum + Number(item.giftCardAmount || 0), 0);
  const activeMembers = await getActiveGroupMembers(groupId);

  if (approvedSubmissions.length === activeMembers.length && activeMembers.length > 0) {
    await updateDoc(roundRef, {
      status: "completed",
      completedAt: serverTimestamp(),
      totalApprovedAmount,
    });
  } else {
    await updateDoc(roundRef, {
      status: "pending",
      totalApprovedAmount,
    });
  }
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

  const profile = await getUserProfile(userId);

  await setDoc(doc(db, GROUPS_COLLECTION, groupId, "members", userId), {
    uid: userId,
    username: profile.username,
    fullName: profile.fullName,
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
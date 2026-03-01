import {
  getGroup,
  getGroupMembers,
  getMember,
  joinGroup,
  removeMember,
  updateMemberRole,
  getGroupRounds,
  startNextRound,
  submitGiftCard,
  getRoundSubmissions,
  reviewSubmission,
} from "./group.js";
import {
  setText,
  setGroupDetailsError,
  setGroupActionMessage,
  setGroupLoadingState,
  setJoinButtonState,
  setStartRoundButtonState,
  renderGroupMembers,
  renderRounds,
  renderSubmissionStatus,
  renderAdminSubmissions,
  renderAdminSummary,
} from "./ui.js";

function getGroupIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function waitForCurrentUserData(timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (window.currentUserData?.uid) {
      return window.currentUserData;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return null;
}

function getCurrentRound(rounds) {
  return rounds.find((round) => round.status === "pending") || rounds[0] || null;
}

function getSummary({ members, submissions, currentRound }) {
  const approved = submissions.filter((item) => item.status === "approved");
  const rejected = submissions.filter((item) => item.status === "rejected");

  return {
    totalMembers: members.length,
    submittedCount: submissions.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    totalExpectedAmount: submissions.reduce((sum, item) => sum + Number(item.giftCardAmount || 0), 0),
    totalApprovedAmount: approved.reduce((sum, item) => sum + Number(item.giftCardAmount || 0), 0),
    currentPayoutUsername: currentRound?.payoutUsername || "-",
  };
}

async function loadGroupPage() {
  const groupId = getGroupIdFromUrl();
  if (!groupId) {
    setGroupDetailsError("Missing group id.");
    return;
  }

  setGroupLoadingState(true);
  setGroupDetailsError("");
  setGroupActionMessage("");

  const currentUser = await waitForCurrentUserData();
  if (!currentUser?.uid) {
    setGroupLoadingState(false);
    setGroupDetailsError("Unable to load current user.");
    return;
  }

  try {
    const group = await getGroup(groupId);
    if (!group) {
      setGroupDetailsError("Group not found.");
      return;
    }

    const isAdmin = currentUser.uid === group.adminId;

    setText("groupDetailsName", group.name || "Unnamed Group");
    setText("groupDetailsStatus", group.status || "-");
    setText("groupDetailsRound", String(group.currentRound ?? "-"));
    setText("groupDetailsAdmin", group.adminUsername || "-");

    const currentMembership = await getMember(groupId, currentUser.uid);
    setJoinButtonState({ show: !currentMembership, loading: false });
    setStartRoundButtonState({ show: isAdmin, loading: false });

    const members = await getGroupMembers(groupId);
    const memberMap = new Map(members.map((member) => [member.id, member.username || member.id]));

    renderGroupMembers({
      members,
      isAdmin,
      currentUserId: currentUser.uid,
      onRemove: async (memberId) => {
        if (!window.confirm("Are you sure you want to remove this member?")) {
          return;
        }

        try {
          await removeMember(groupId, memberId);
          setGroupActionMessage("Member removed successfully.", "success");
          await loadGroupPage();
        } catch (error) {
          console.error("[group-details] Failed to remove member:", error);
          setGroupActionMessage("Failed to remove member.", "error");
        }
      },
      onRoleChange: async (memberId, role) => {
        try {
          await updateMemberRole(groupId, memberId, role);
          setGroupActionMessage("Member role updated successfully.", "success");
          await loadGroupPage();
        } catch (error) {
          console.error("[group-details] Failed to update member role:", error);
          setGroupActionMessage("Failed to update member role.", "error");
        }
      },
    });

    const rounds = await getGroupRounds(groupId);
    const currentRound = getCurrentRound(rounds);
    renderRounds({ rounds, memberMap });
    setText("currentPayoutUsername", currentRound?.payoutUsername || "-");

    const submissions = currentRound ? await getRoundSubmissions(groupId, currentRound.id) : [];
    const currentUserSubmission = submissions.find((item) => (item.uid || item.id) === currentUser.uid) || null;

    renderSubmissionStatus({
      submission: currentUserSubmission,
      roundStatus: currentRound?.status || "pending",
      payoutUsername: currentRound?.payoutUsername || "-",
    });

    const memberPanel = document.getElementById("memberPanel");
    const adminPanel = document.getElementById("adminPanel");
    const submissionForm = document.getElementById("giftCardSubmissionForm");

    if (memberPanel) memberPanel.style.display = currentMembership ? "" : "none";
    if (adminPanel) adminPanel.style.display = isAdmin ? "" : "none";
    if (submissionForm) submissionForm.style.display = currentMembership ? "" : "none";

    if (isAdmin) {
      renderAdminSubmissions({
        submissions,
        onApprove: async (submissionUid) => {
          try {
            await reviewSubmission(groupId, currentRound.id, submissionUid, currentUser.uid, "approved");
            setGroupActionMessage("Submission approved.", "success");
            await loadGroupPage();
          } catch (error) {
            console.error("[group-details] Failed to approve submission:", error);
            setGroupActionMessage(error?.message || "Failed to approve submission.", "error");
          }
        },
        onReject: async (submissionUid) => {
          const note = window.prompt("Enter rejection note:") || "";
          try {
            await reviewSubmission(groupId, currentRound.id, submissionUid, currentUser.uid, "rejected", note);
            setGroupActionMessage("Submission rejected.", "success");
            await loadGroupPage();
          } catch (error) {
            console.error("[group-details] Failed to reject submission:", error);
            setGroupActionMessage(error?.message || "Failed to reject submission.", "error");
          }
        },
      });

      renderAdminSummary(getSummary({ members, submissions, currentRound }));
    }

    attachJoinHandler(groupId);
    attachStartRoundHandler(groupId, currentUser.uid);
    attachSubmissionHandler(groupId, currentRound?.id, currentUser.uid);
  } catch (error) {
    console.error("[group-details] Failed to load group details:", error);
    setGroupDetailsError("Unable to load group details.");
  } finally {
    setGroupLoadingState(false);
  }
}

function attachJoinHandler(groupId) {
  const joinButton = document.getElementById("joinGroupBtn");
  if (!joinButton) return;

  joinButton.onclick = async () => {
    const currentUser = window.currentUserData;
    if (!currentUser?.uid) {
      setGroupActionMessage("You must be signed in to join.", "error");
      return;
    }

    setJoinButtonState({ show: true, loading: true });

    try {
      await joinGroup(groupId, currentUser.uid);
      setGroupActionMessage("You joined this group successfully.", "success");
      await loadGroupPage();
    } catch (error) {
      console.error("[group-details] Failed to join group:", error);
      setGroupActionMessage("Failed to join group.", "error");
      setJoinButtonState({ show: true, loading: false });
    }
  };
}

function attachStartRoundHandler(groupId, currentUserId) {
  const startRoundButton = document.getElementById("startRoundBtn");
  if (!startRoundButton) return;

  startRoundButton.onclick = async () => {
    setStartRoundButtonState({ show: true, loading: true });

    try {
      const result = await startNextRound(groupId, currentUserId);
      setGroupActionMessage(
        `Round ${result.roundNumber} started. Payout user: ${result.payoutUsername}.`,
        "success",
      );
      await loadGroupPage();
    } catch (error) {
      console.error("[group-details] Failed to start next round:", error);
      setGroupActionMessage(error?.message || "Failed to start round.", "error");
      setStartRoundButtonState({ show: true, loading: false });
    }
  };
}

function attachSubmissionHandler(groupId, roundId, userId) {
  const form = document.getElementById("giftCardSubmissionForm");
  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();

    if (!roundId) {
      setGroupActionMessage("No active round available for submission.", "error");
      return;
    }

    const giftCardCode = document.getElementById("giftCardCode")?.value?.trim() || "";
    const giftCardAmount = document.getElementById("giftCardAmount")?.value || "";
    const brand = document.getElementById("giftCardBrand")?.value?.trim() || "";

    if (!giftCardCode || !giftCardAmount || !brand) {
      setGroupActionMessage("Please complete all gift card submission fields.", "error");
      return;
    }

    try {
      await submitGiftCard(groupId, roundId, userId, {
        giftCardCode,
        giftCardAmount,
        brand,
      });
      form.reset();
      setGroupActionMessage("Gift card submitted successfully.", "success");
      await loadGroupPage();
    } catch (error) {
      console.error("[group-details] Failed to submit gift card:", error);
      setGroupActionMessage(error?.message || "Failed to submit gift card.", "error");
    }
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadGroupPage, { once: true });
} else {
  loadGroupPage();
}
import {
  getGroup,
  getGroupMembers,
  getMember,
  joinGroup,
  removeMember,
  updateMemberRole,
  getGroupRounds,
  startNextRound,
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
    setText("groupDetailsAdmin", group.adminId || "-");

    const currentMembership = await getMember(groupId, currentUser.uid);
    setJoinButtonState({ show: !currentMembership, loading: false });
    setStartRoundButtonState({ show: isAdmin, loading: false });

    const members = await getGroupMembers(groupId);
    const memberMap = new Map(members.map((member) => [member.id, member.id]));

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
    renderRounds({ rounds, memberMap });

    attachJoinHandler(groupId);
    attachStartRoundHandler(groupId, currentUser.uid);
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
        `Round ${result.roundNumber} started successfully.`,
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadGroupPage, { once: true });
} else {
  loadGroupPage();
}

const API_BASE = (
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api"
).replace(/\/+$/, "");

// =============================================
// AUTHENTICATION
// =============================================

function getHeaders() {
  const token = sessionStorage.getItem("freshmartToken");

  if (!token) {
    throw new Error("Please log in to continue.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

// =============================================
// RESPONSE HANDLER
// =============================================

async function handleResponse(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Server returned an invalid response (${response.status}). Please check the backend logs.`
    );
  }

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
      `Request failed with status ${response.status}.`
    );
  }

  return data;
}

// =============================================
// 1. GET CONTACTS
// =============================================

export async function getContacts() {
  const response = await fetch(`${API_BASE}/messages/contacts`, {
    method: "GET",
    headers: getHeaders(),
  });

  return handleResponse(response);
}

// =============================================
// 2. OPEN CONVERSATION
// =============================================

export async function openConversation(userId) {
  const response = await fetch(
    `${API_BASE}/messages/conversations/open`,
    {
      method: "POST",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    }
  );

  return handleResponse(response);
}

// =============================================
// 3. GET MESSAGES
// =============================================

export async function getMessages(conversationId) {
  const response = await fetch(
    `${API_BASE}/messages/conversations/${conversationId}/messages`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  return handleResponse(response);
}

// =============================================
// 4. SEND TEXT OR ATTACHMENT
// =============================================

export async function sendMessage(
  conversationId,
  messageText = "",
  attachment = null
) {
  const formData = new FormData();

  if (messageText.trim()) {
    formData.append("messageText", messageText.trim());
  }

  if (attachment) {
    formData.append("attachment", attachment);
  }

  const response = await fetch(
    `${API_BASE}/messages/conversations/${conversationId}/messages`,
    {
      method: "POST",

      // Do not manually set Content-Type.
      // The browser must add the multipart boundary.
      headers: getHeaders(),

      body: formData,
    }
  );

  return handleResponse(response);
}

// =============================================
// 5. EDIT MESSAGE
// =============================================

export async function editMessage(messageId, messageText) {
  const response = await fetch(
    `${API_BASE}/messages/messages/${messageId}`,
    {
      method: "PATCH",
      headers: {
        ...getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageText }),
    }
  );

  return handleResponse(response);
}

// =============================================
// 6. DELETE FOR EVERYONE
// =============================================

export async function deleteForEveryone(messageId) {
  const response = await fetch(
    `${API_BASE}/messages/messages/${messageId}/everyone`,
    {
      method: "DELETE",
      headers: getHeaders(),
    }
  );

  return handleResponse(response);
}

// =============================================
// 7. DELETE ONLY FOR ME
// =============================================

export async function deleteForMe(messageId) {
  const response = await fetch(
    `${API_BASE}/messages/messages/${messageId}/me`,
    {
      method: "DELETE",
      headers: getHeaders(),
    }
  );

  return handleResponse(response);
}

// =============================================
// 8. LOAD PRIVATE ATTACHMENT
// =============================================

export async function loadAttachment(messageId) {
  const response = await fetch(
    `${API_BASE}/messages/messages/${messageId}/attachment`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    let message = "Unable to load this attachment.";

    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // Keep the default message if the response isn't JSON.
    }

    throw new Error(message);
  }

  return URL.createObjectURL(await response.blob());
}

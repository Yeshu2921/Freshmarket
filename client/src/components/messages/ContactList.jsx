
const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://freshmart-backend-70sy.onrender.com/api";

const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

// =============================================
// HELPERS
// =============================================

function getInitials(firstName, lastName) {
  return (
    `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?"
  );
}

function getProfileImage(imagePath) {
  if (!imagePath) return null;

  const image = String(imagePath).trim();

  if (/^(https?:\/\/|data:|blob:)/i.test(image)) {
    return image;
  }

  return `${API_ORIGIN}/${image.replace(/^\/+/, "")}`;
}
function getContactPreview(lastMessage) {
  const message = String(lastMessage || "").trim();

  if (
    message.toLowerCase() === "this message was deleted" ||
    message.toLowerCase() === "this message was deleted." ||
    message.toLowerCase() === "loading attachment..."
  ) {
    return "";
  }

  return message || "Start a conversation";
}
// =============================================
// CONTACT LIST
// =============================================

function ContactList({
  contacts = [],
  selectedContact,
  onSelectContact,
}) {
  return (
    <aside className="fm-contacts-section">

      <div className="fm-contacts-heading">
        <h5>Contacts</h5>
        <span>{contacts.length}</span>
      </div>

      <div className="fm-contacts-list">

        {contacts.length === 0 ? (
          <p className="fm-no-contacts">
            No other active Owner or Worker accounts found.
          </p>
        ) : (
          contacts.map((contact) => (
            <button
              type="button"
              key={contact.id}
              className={`fm-contact-item ${
                String(selectedContact?.id) === String(contact.id)
                  ? "active"
                  : ""
              }`}
              onClick={() => onSelectContact(contact)}
            >

              {/* PROFILE PHOTO */}

              <div className="fm-contact-avatar">

                {contact.profile_image ? (
                  <img
                    src={getProfileImage(contact.profile_image)}
                    alt={`${contact.first_name} ${contact.last_name}`}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement.textContent =
                        getInitials(
                          contact.first_name,
                          contact.last_name
                        );
                    }}
                  />
                ) : (
                  getInitials(
                    contact.first_name,
                    contact.last_name
                  )
                )}

              </div>

              {/* CONTACT INFORMATION */}

              <div className="fm-contact-details">

                <strong>
                  {contact.first_name} {contact.last_name}
                </strong>

                <small>{contact.role}</small>

                <span>
            {getContactPreview(contact.last_message)}
                  </span>

              </div>

              {/* UNREAD MESSAGE COUNT */}

              {Number(contact.unread_count) > 0 && (
                <span className="fm-contact-unread">
                  {contact.unread_count}
                </span>
              )}

            </button>
          ))
        )}

      </div>
    </aside>
  );
}

export default ContactList;

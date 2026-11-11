
function getInitials(firstName, lastName) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";
}

function getProfileImage(path) {
  if (!path) return null;

  if (path.startsWith("http")) return path;

  return `http://localhost:5134${path.startsWith("/") ? "" : "/"}${path}`;
}

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
              <div className="fm-contact-avatar">
                {contact.profile_image ? (
                  <img
                    src={getProfileImage(contact.profile_image)}
                    alt={`${contact.first_name} ${contact.last_name}`}
                  />
                ) : (
                  getInitials(
                    contact.first_name,
                    contact.last_name
                  )
                )}
              </div>

              <div className="fm-contact-details">
                <strong>
                  {contact.first_name} {contact.last_name}
                </strong>

                <small>{contact.role}</small>

                <span>
                  {contact.last_message || "Start a conversation"}
                </span>
              </div>

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


import { useState } from "react";
import { Link } from "react-router-dom";
import "./Contact.css";

const CONTACT = {
  email: "yeshambelbazew529@gmail.com",
  phone: "0991520988",
  telegram: "Yeshugonder",
};

function Contact() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const [error, setError] = useState("");

  const [openFaq, setOpenFaq] = useState(0);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const { name, email, subject, message } = form;

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Please complete your name, email, and message.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    const emailSubject = encodeURIComponent(
      subject.trim() || "FreshMart Customer Inquiry"
    );

    const emailBody = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
    );

    const mailto = `mailto:${CONTACT.email}?subject=${emailSubject}&body=${emailBody}`;

    window.location.href = mailto;
  }

  const faqs = [
    {
      question: "How can I place an order?",
      answer:
        "Visit All Products, select your preferred products, add them to your cart, and complete the checkout form.",
    },
    {
      question: "How can I check my order status?",
      answer:
        "Open Your Orders and enter the same phone number and PIN used when placing your order.",
    },
    {
      question: "What payment methods are available?",
      answer:
        "You can select Cash on Delivery or an electronic payment method currently offered during checkout.",
    },
    {
      question: "What should I do if my payment is not approved?",
      answer:
        "Contact FreshMart and provide your order number so the team can review your payment.",
    },
    {
      question: "How can I contact FreshMart?",
      answer:
        "You can contact us using our email address, phone number, or Telegram account listed on this page.",
    },
  ];

  return (
    <main className="fm-contact-page">

      {/* HERO */}
      <section className="fm-contact-hero">
        <div className="container">
          <div className="fm-contact-hero-content">
            <span className="fm-contact-eyebrow">
              WE ARE HERE TO HELP
            </span>

            <h1>
              Let's Talk About
              <span> Your Shopping Experience.</span>
            </h1>

            <p>
              Have a question about an order, payment, product, or
              FreshMart service? Contact our team. We are happy to
              assist you.
            </p>

            <div className="fm-contact-hero-buttons">
              <a href="#contact-form" className="btn fm-contact-main-btn">
                Send a Message
                <i className="bi bi-arrow-down ms-2" />
              </a>

              <a
                href={`https://t.me/${CONTACT.telegram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn fm-contact-light-btn"
              >
                <i className="bi bi-telegram me-2" />
                Telegram
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT INFORMATION */}
      <section className="fm-contact-info-section">
        <div className="container">
          <div className="row g-4">

            <div className="col-md-4">
              <a
                href={`mailto:${CONTACT.email}`}
                className="fm-contact-info-card"
              >
                <div className="fm-contact-icon">
                  <i className="bi bi-envelope-at" />
                </div>

                <h3>Email Us</h3>
                <p>{CONTACT.email}</p>
                <span>
                  Send us an email
                  <i className="bi bi-arrow-up-right ms-2" />
                </span>
              </a>
            </div>

            <div className="col-md-4">
              <a
                href={`tel:${CONTACT.phone}`}
                className="fm-contact-info-card"
              >
                <div className="fm-contact-icon">
                  <i className="bi bi-telephone" />
                </div>

                <h3>Call Us</h3>
                <p>{CONTACT.phone}</p>
                <span>
                  Call our contact number
                  <i className="bi bi-arrow-up-right ms-2" />
                </span>
              </a>
            </div>

            <div className="col-md-4">
              <a
                href={`https://t.me/${CONTACT.telegram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="fm-contact-info-card"
              >
                <div className="fm-contact-icon">
                  <i className="bi bi-telegram" />
                </div>

                <h3>Telegram</h3>
                <p>@{CONTACT.telegram}</p>
                <span>
                  Chat with us
                  <i className="bi bi-arrow-up-right ms-2" />
                </span>
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* MESSAGE FORM AND IMAGE */}
      <section className="fm-contact-main section-padding">
        <div className="container">
          <div className="row g-5 align-items-start">

            <div className="col-lg-5">
              <span className="fm-contact-label">
                GET IN TOUCH
              </span>

              <h2 className="fm-contact-heading">
                We'd Love to Hear From You
              </h2>

              <p className="fm-contact-description">
                Your questions and feedback help us improve the
                FreshMart shopping experience.
              </p>

              <div className="fm-contact-photo-wrapper">
                <img
                  src="../about/contact2.jfif"
                  alt="Customer receiving assistance"
                  className="fm-contact-photo"
                  loading="lazy"
                />

                <div className="fm-contact-photo-caption">
                  <i className="bi bi-chat-heart" />
                  <div>
                    <strong>Customer Support</strong>
                    <span>We're happy to help</span>
                  </div>
                </div>
              </div>

              <div className="fm-contact-social">
                <strong>Connect with us</strong>

                <a
                  href={`https://t.me/${CONTACT.telegram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Telegram"
                >
                  <i className="bi bi-telegram" />
                </a>

                <a
                  href={`mailto:${CONTACT.email}`}
                  aria-label="Email"
                >
                  <i className="bi bi-envelope" />
                </a>

                <a
                  href={`tel:${CONTACT.phone}`}
                  aria-label="Phone"
                >
                  <i className="bi bi-telephone" />
                </a>
              </div>
            </div>

            <div className="col-lg-7" id="contact-form">
              <div className="fm-contact-form-card">
                <div className="fm-contact-form-heading">
                  <h3>Send Us a Message</h3>
                  <p>Fill in the form below to contact FreshMart.</p>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="row g-3">

                    <div className="col-md-6">
                      <label htmlFor="contact-name">
                        Your Name *
                      </label>

                      <input
                        id="contact-name"
                        type="text"
                        name="name"
                        className="form-control"
                        placeholder="Enter your name"
                        value={form.name}
                        onChange={handleChange}
                        maxLength={100}
                        required
                      />
                    </div>

                    <div className="col-md-6">
                      <label htmlFor="contact-email">
                        Email Address *
                      </label>

                      <input
                        id="contact-email"
                        type="email"
                        name="email"
                        className="form-control"
                        placeholder="example@gmail.com"
                        value={form.email}
                        onChange={handleChange}
                        maxLength={190}
                        required
                      />
                    </div>

                    <div className="col-12">
                      <label htmlFor="contact-subject">
                        Subject
                      </label>

                      <input
                        id="contact-subject"
                        type="text"
                        name="subject"
                        className="form-control"
                        placeholder="What is your message about?"
                        value={form.subject}
                        onChange={handleChange}
                        maxLength={150}
                      />
                    </div>

                    <div className="col-12">
                      <label htmlFor="contact-message">
                        Your Message *
                      </label>

                      <textarea
                        id="contact-message"
                        name="message"
                        className="form-control"
                        rows="6"
                        placeholder="Write your message here..."
                        value={form.message}
                        onChange={handleChange}
                        maxLength={3000}
                        required
                      />
                    </div>

                    {error && (
                      <div className="col-12">
                        <div className="fm-contact-error" role="alert">
                          <i className="bi bi-exclamation-circle me-2" />
                          {error}
                        </div>
                      </div>
                    )}

                    <div className="col-12">
                      <button
                        type="submit"
                        className="btn fm-contact-submit"
                      >
                        Send Message
                        <i className="bi bi-send ms-2" />
                      </button>
                    </div>

                  </div>
                </form>

                <div className="fm-contact-form-note">
                  <i className="bi bi-info-circle me-2" />
                  Your email application will open with your message
                  ready to send.
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* OPENING HOURS */}
      <section className="fm-contact-hours">
        <div className="container">
          <div className="row align-items-center g-4">
            <div className="col-md-7">
              <span className="fm-contact-label">
                CUSTOMER ASSISTANCE
              </span>

              <h2>We're Ready to Help</h2>

              <p>
                Contact us through your preferred communication
                channel for questions and assistance.
              </p>
            </div>

            <div className="col-md-5">
              <div className="fm-contact-hours-card">
                <i className="bi bi-clock-history" />
                <div>
                  <strong>Customer Support Hours</strong>
                  <span>
                    Please contact us to confirm availability.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="fm-contact-faq section-padding">
        <div className="container">
          <div className="text-center fm-contact-faq-heading">
            <span className="fm-contact-label">
              NEED QUICK ANSWERS?
            </span>

            <h2>Frequently Asked Questions</h2>

            <p>
              Find answers to some common FreshMart questions.
            </p>
          </div>

          <div className="fm-contact-faq-list">
            {faqs.map((faq, index) => (
              <div className="fm-contact-faq-item" key={faq.question}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenFaq(openFaq === index ? -1 : index)
                  }
                  aria-expanded={openFaq === index}
                >
                  <span>{faq.question}</span>

                  <i
                    className={`bi ${
                      openFaq === index
                        ? "bi-dash-circle"
                        : "bi-plus-circle"
                    }`}
                  />
                </button>

                {openFaq === index && (
                  <p>{faq.answer}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="fm-contact-cta">
        <div className="container text-center">
          <i className="bi bi-basket2" />
          <h2>Thank You for Choosing FreshMart</h2>

          <p>
            Explore our products and enjoy a convenient shopping experience.
          </p>

          <Link
            to="/market"
            className="btn fm-contact-main-btn"
          >
            Start Shopping
            <i className="bi bi-arrow-right ms-2" />
          </Link>
        </div>
      </section>

    </main>
  );
}

export default Contact;


import { Link } from "react-router-dom";
import { useState } from "react";
import "./About.css";

const features = [
  {
    icon: "bi-basket2",
    title: "Easy Shopping",
    text: "Browse available supermarket products and place orders conveniently from your device.",
  },
  {
    icon: "bi-shield-check",
    title: "Order Review",
    text: "Orders and submitted payment receipts are reviewed by authorized FreshMart staff.",
  },
  {
    icon: "bi-box-seam",
    title: "Stock Management",
    text: "Product availability is managed through the FreshMart inventory system.",
  },
  {
    icon: "bi-headset",
    title: "Customer Communication",
    text: "Customers can contact FreshMart for questions and assistance.",
  },
];

const steps = [
  {
    number: "01",
    icon: "bi-search",
    title: "Explore Products",
    text: "Browse products, categories, prices, and available offers.",
  },
  {
    number: "02",
    icon: "bi-cart-plus",
    title: "Add to Cart",
    text: "Choose your products and quantities, then review your shopping cart.",
  },
  {
    number: "03",
    icon: "bi-clipboard-check",
    title: "Place Your Order",
    text: "Enter your name, phone number, delivery location, and customer PIN.",
  },
  {
    number: "04",
    icon: "bi-credit-card",
    title: "Choose Payment",
    text: "Select Cash on Delivery or an available electronic payment method. Upload a receipt when required.",
  },
  {
    number: "05",
    icon: "bi-truck",
    title: "Track Your Order",
    text: "Use Your Orders with your phone number and PIN to check your order history and status.",
  },
];

function About() {
  const [openPolicy, setOpenPolicy] = useState("orders");

  const policies = [
    {
      id: "orders",
      title: "Order Policy",
      icon: "bi-bag-check",
      content:
        "Every successfully submitted order receives a unique order number. Orders initially have Pending status and are reviewed by FreshMart staff. Product stock is deducted after the order is approved.",
    },
    {
      id: "payments",
      title: "Payment Policy",
      icon: "bi-wallet2",
      content:
        "Customers can choose Cash on Delivery or an available electronic payment method. Electronic payments require a payment receipt during checkout. Payment approval is subject to verification by authorized staff.",
    },
    {
      id: "delivery",
      title: "Delivery Policy",
      icon: "bi-truck",
      content:
        "Customers should provide an accurate delivery location and contact phone number. Delivery arrangements and progress depend on FreshMart's available delivery services.",
    },
    {
      id: "customer",
      title: "Customer Information",
      icon: "bi-person-lock",
      content:
        "A customer uses their phone number and private PIN to access their order history. Keep your PIN confidential and do not share it with other people.",
    },
    {
      id: "returns",
      title: "Order Problems",
      icon: "bi-chat-left-text",
      content:
        "If there is a problem with an order, payment, or delivery, contact FreshMart with your order number and relevant information so the team can review the issue.",
    },
  ];

  return (
    <main className="fm-about-page">

      {/* HERO SECTION */}
      <section className="fm-about-hero">
        <div className="fm-about-hero-overlay">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-lg-7">
                <span className="fm-about-eyebrow">
                  WELCOME TO FRESHMART
                </span>

                <h1>
                  Fresh Choices.
                  <span> Convenient Shopping.</span>
                </h1>

                <p>
                  Discover a simpler way to shop for everyday essentials.
                  FreshMart brings products, online ordering, and customer
                  service together in one convenient supermarket platform.
                </p>

                <div className="fm-about-hero-actions">
                  <Link
                    to="/market"
                    className="btn fm-about-primary-btn"
                  >
                    Explore Products
                    <i className="bi bi-arrow-right ms-2" />
                  </Link>

                  <Link
                    to="/contact"
                    className="btn fm-about-outline-btn"
                  >
                    Contact Us
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT INTRODUCTION */}
      <section className="fm-about-intro section-padding">
        <div className="container">
          <div className="row align-items-center g-5">
            <div className="col-lg-6">
              <div className="fm-about-image-wrapper">
                <img
                  src="../about/about2.jfif"
                  alt="Fresh supermarket vegetables and groceries"
                  className="fm-about-main-image"
                  loading="lazy"
                />

                <div className="fm-about-image-caption">
                  <i className="bi bi-shop" />
                  <div>
                    <strong>Welcome to FreshMart</strong>
                    <span>Your everyday shopping destination</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <span className="fm-section-label">ABOUT OUR BUSINESS</span>

              <h2 className="fm-section-title">
                Making Everyday Shopping More Convenient
              </h2>

              <p>
                FreshMart is a supermarket shopping and management
                platform designed to make product discovery and online
                ordering easier for customers.
              </p>

              <p>
                Customers can explore products, add items to their cart,
                submit orders, choose available payment methods, and
                review their order history.
              </p>

              <p>
                Behind the scenes, FreshMart provides tools for authorized
                staff to manage products, inventory, orders, and customer
                communication.
              </p>

              <Link to="/market" className="fm-text-link">
                Start Shopping
                <i className="bi bi-arrow-up-right ms-2" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* MISSION AND VISION */}
      <section className="fm-about-purpose section-padding">
        <div className="container">
          <div className="text-center fm-section-heading">
            <span className="fm-section-label">OUR PURPOSE</span>
            <h2 className="fm-section-title">
              What Drives FreshMart
            </h2>
          </div>

          <div className="row g-4">
            <div className="col-md-6">
              <div className="fm-purpose-card">
                <div className="fm-purpose-icon">
                  <i className="bi bi-bullseye" />
                </div>
                <h3>Our Mission</h3>
                <p>
                  To make everyday supermarket shopping more convenient
                  through accessible online ordering, organized product
                  management, and reliable customer communication.
                </p>
              </div>
            </div>

            <div className="col-md-6">
              <div className="fm-purpose-card">
                <div className="fm-purpose-icon">
                  <i className="bi bi-eye" />
                </div>
                <h3>Our Vision</h3>
                <p>
                  To develop a trusted and user-friendly supermarket
                  platform that connects customers with convenient
                  shopping experiences and efficient business operations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="fm-about-features section-padding">
        <div className="container">
          <div className="text-center fm-section-heading">
            <span className="fm-section-label">THE FRESHMART EXPERIENCE</span>
            <h2 className="fm-section-title">
              Why Use FreshMart?
            </h2>
            <p>
              Useful shopping features designed around customer convenience.
            </p>
          </div>

          <div className="row g-4">
            {features.map((feature) => (
              <div className="col-sm-6 col-lg-3" key={feature.title}>
                <div className="fm-feature-card">
                  <div className="fm-feature-icon">
                    <i className={`bi ${feature.icon}`} />
                  </div>

                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SHOPPING GUIDE */}
      <section className="fm-about-guide section-padding">
        <div className="container">
          <div className="row align-items-center g-5">
            <div className="col-lg-5">
              <span className="fm-section-label">SIMPLE SHOPPING GUIDE</span>

              <h2 className="fm-section-title">
                How to Use FreshMart
              </h2>

              <p>
                New to FreshMart? Follow these simple steps to place
                your first online order.
              </p>

              <img
                src="../about/about3.jfif"
                alt="Customer shopping in a supermarket"
                className="fm-guide-image"
                loading="lazy"
              />
            </div>

            <div className="col-lg-7">
              <div className="fm-guide-steps">
                {steps.map((step) => (
                  <div className="fm-guide-step" key={step.number}>
                    <div className="fm-step-number">
                      {step.number}
                    </div>

                    <div className="fm-step-icon">
                      <i className={`bi ${step.icon}`} />
                    </div>

                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* POLICIES */}
      <section className="fm-about-policies section-padding">
        <div className="container">
          <div className="text-center fm-section-heading">
            <span className="fm-section-label">CUSTOMER INFORMATION</span>
            <h2 className="fm-section-title">
              Policies & Agreements
            </h2>
            <p>
              Please review these guidelines before placing an order.
            </p>
          </div>

          <div className="fm-policy-list">
            {policies.map((policy) => (
              <div className="fm-policy-item" key={policy.id}>
                <button
                  type="button"
                  className={`fm-policy-button ${
                    openPolicy === policy.id ? "active" : ""
                  }`}
                  onClick={() =>
                    setOpenPolicy(
                      openPolicy === policy.id ? "" : policy.id
                    )
                  }
                  aria-expanded={openPolicy === policy.id}
                >
                  <span>
                    <i className={`bi ${policy.icon}`} />
                    {policy.title}
                  </span>

                  <i
                    className={`bi ${
                      openPolicy === policy.id
                        ? "bi-dash-lg"
                        : "bi-plus-lg"
                    }`}
                  />
                </button>

                {openPolicy === policy.id && (
                  <div className="fm-policy-content">
                    {policy.content}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="fm-policy-note">
            <i className="bi bi-info-circle-fill" />
            <p>
              By submitting an order, you confirm that the information
              you provide is accurate and that you understand the
              applicable ordering and payment guidelines.
            </p>
          </div>
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section className="fm-about-cta">
        <div className="container text-center">
          <span>YOUR SHOPPING STARTS HERE</span>
          <h2>Ready to Explore FreshMart?</h2>
          <p>
            Discover available products and enjoy a convenient
            supermarket shopping experience.
          </p>

          <Link
            to="/all-products"
            className="btn fm-about-primary-btn"
          >
            Browse All Products
            <i className="bi bi-arrow-right ms-2" />
          </Link>
        </div>
      </section>

    </main>
  );
}

export default About;

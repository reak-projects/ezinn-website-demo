import { useState } from "react";
import "./DemoModal.css";

export default function DemoModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    company: "",
    phone: "",
    properties: "",
    message: ""
  });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSubmissionError("");
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) newErrors.fullName = "Full name is required";
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }
    if (!formData.company.trim()) newErrors.company = "Hotel/Company name is required";
    if (!formData.phone.trim()) newErrors.phone = "Phone number is required";
    if (!formData.properties.trim()) newErrors.properties = "Number of properties is required";
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const newErrors = validateForm();
    
    if (Object.keys(newErrors).length === 0) {
      setIsSubmitting(true);
      setSubmissionError("");

      try {
        const response = await fetch("/api/demo-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => null);
          setSubmissionError(
            typeof result?.error === "string"
              ? result.error
              : "We couldn't send your request. Please try again."
          );
          return;
        }

        setSubmitted(true);
        setTimeout(() => {
          setFormData({
            fullName: "",
            email: "",
            company: "",
            phone: "",
            properties: "",
            message: ""
          });
          setSubmitted(false);
          onClose();
        }, 3000);
      } catch {
        setSubmissionError("We couldn't send your request. Please check your connection and try again.");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setErrors(newErrors);
      setSubmissionError("");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="demo-modal-overlay" onClick={onClose}>
      <div className="demo-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="demo-modal-close" onClick={onClose} aria-label="Close modal">×</button>
        
        {!submitted ? (
          <>
            <div className="demo-modal-header">
              <h2>Request a Guided Demo</h2>
              <p>Connect with our hospitality team to explore EZinn self-service kiosks for your property.</p>
            </div>

            <form onSubmit={handleSubmit} className="demo-form" aria-busy={isSubmitting}>
              <div className="form-group">
                <label htmlFor="fullName">Full Name *</label>
                <input
                  id="fullName"
                  type="text"
                  name="fullName"
                  placeholder="Your name"
                  value={formData.fullName}
                  onChange={handleChange}
                  className={errors.fullName ? "error" : ""}
                />
                {errors.fullName && <span className="error-message">{errors.fullName}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="email">Work Email *</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="you@hotel.com"
                  value={formData.email}
                  onChange={handleChange}
                  className={errors.email ? "error" : ""}
                />
                {errors.email && <span className="error-message">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="company">Hotel / Company Name *</label>
                <input
                  id="company"
                  type="text"
                  name="company"
                  placeholder="Your hotel name"
                  value={formData.company}
                  onChange={handleChange}
                  className={errors.company ? "error" : ""}
                />
                {errors.company && <span className="error-message">{errors.company}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">Phone Number *</label>
                  <input
                    id="phone"
                    type="tel"
                    name="phone"
                    placeholder="+1 (555) 000-0000"
                    value={formData.phone}
                    onChange={handleChange}
                    className={errors.phone ? "error" : ""}
                  />
                  {errors.phone && <span className="error-message">{errors.phone}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="properties">Number of Properties *</label>
                  <input
                    id="properties"
                    type="number"
                    name="properties"
                    placeholder="e.g., 5"
                    min="1"
                    value={formData.properties}
                    onChange={handleChange}
                    className={errors.properties ? "error" : ""}
                  />
                  {errors.properties && <span className="error-message">{errors.properties}</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="message">Message (Optional)</label>
                <textarea
                  id="message"
                  name="message"
                  placeholder="Tell us about your property and requirements..."
                  rows="4"
                  value={formData.message}
                  onChange={handleChange}
                ></textarea>
              </div>

              {submissionError && (
                <p className="demo-submit-error" role="alert">{submissionError}</p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "8px" }}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending..." : "Submit Request"}
              </button>
            </form>
          </>
        ) : (
          <div className="demo-success-state">
            <div className="success-icon">✓</div>
            <h3>Thank You!</h3>
            <p>Your demo request has been submitted successfully. Our team will contact you within 24 hours.</p>
            <p className="email-confirmation">We'll use this email to contact you: <strong>{formData.email}</strong></p>
          </div>
        )}
      </div>
    </div>
  );
}

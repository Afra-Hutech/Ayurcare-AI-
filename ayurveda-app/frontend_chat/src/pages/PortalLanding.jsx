import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Stethoscope, LogIn, UserPlus, Leaf } from 'lucide-react';
import './PortalLanding.css';

const DOCTOR_URL = (import.meta.env.VITE_DOCTOR_URL || 'http://localhost:5174').replace(/\/$/, '');

const PATIENT_PHOTO =
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=640&h=800&fit=crop&crop=faces,top';
const DOCTOR_PHOTO =
  'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=640&h=800&fit=crop&crop=faces,top';

function AccessPanel({ role, title, subtitle, photoSrc, photoAlt, loginTo, signupTo }) {
  const isPatient = role === 'patient';
  const LoginWrap = isPatient ? Link : 'a';
  const SignupWrap = isPatient ? Link : 'a';
  const loginProps = isPatient ? { to: loginTo } : { href: loginTo };
  const signupProps = isPatient ? { to: signupTo } : { href: signupTo };

  return (
    <section className={`landing__panel landing__panel--${role}`}>
      <div className="landing__panel-bg" aria-hidden />
      <div className="landing__panel-shade" aria-hidden />

      <div className="landing__panel-inner">
        <div className="landing__photo-ring">
          <img src={photoSrc} alt={photoAlt} className="landing__photo" loading="eager" />
        </div>

        <div className="landing__card">
          <div className={`landing__badge landing__badge--${role}`}>
            {isPatient ? <Heart size={18} /> : <Stethoscope size={18} />}
            <span>{isPatient ? 'AyurCare' : 'DocConnect'}</span>
          </div>

          <h2 className="landing__panel-title">{title}</h2>
          <p className="landing__panel-sub">{subtitle}</p>

          <div className="landing__actions">
            <LoginWrap {...loginProps} className={`landing__btn landing__btn--primary landing__btn--${role}`}>
              <LogIn size={16} />
              Log in
            </LoginWrap>
            <SignupWrap {...signupProps} className={`landing__btn landing__btn--outline landing__btn--${role}`}>
              <UserPlus size={16} />
              Sign up
            </SignupWrap>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Transformed portal-hub (8080) — same visuals, card hub layout instead of 50/50 split */
export default function PortalLanding() {
  return (
    <div className="landing">
      <header className="landing__top">
        <div className="landing__brand">
          <span className="landing__brand-mark">AI</span>
          <div>
            <p className="landing__brand-title">AyurCare AI</p>
            <p className="landing__brand-tag">Self-care to clinical care</p>
          </div>
        </div>
      </header>

      <div className="landing__hero-band">
        <p className="landing__hero-eyebrow">
          <Leaf size={14} aria-hidden />
          Choose your portal
        </p>
        <h1 className="landing__hero-title">One platform. Two dedicated experiences.</h1>
        <p className="landing__hero-lead">
          Patients start with Vaidya AI and wellness. Practitioners run schedule, video visits, and
          clinical registry on DocConnect.
        </p>
      </div>

      <div className="landing__panels">
        <AccessPanel
          role="patient"
          title="Patient"
          subtitle="Vaidya AI, appointments, wellness & your Ayurvedic guide"
          photoSrc={PATIENT_PHOTO}
          photoAlt="Patient"
          loginTo="/login"
          signupTo="/signup"
        />
        <AccessPanel
          role="doctor"
          title="Doctor"
          subtitle="Schedule, video visits, registry & patient messaging"
          photoSrc={DOCTOR_PHOTO}
          photoAlt="Doctor"
          loginTo={`${DOCTOR_URL}/login`}
          signupTo={`${DOCTOR_URL}/signup`}
        />
      </div>

      <footer className="landing__footer">
        <p>© {new Date().getFullYear()} AyurCare AI · Practitioners use DocConnect</p>
      </footer>
    </div>
  );
}

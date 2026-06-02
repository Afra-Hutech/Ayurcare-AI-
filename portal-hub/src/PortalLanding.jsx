import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Stethoscope, LogIn, UserPlus, Leaf, Sparkles, ArrowRight } from 'lucide-react';
import { PatientAvatar, DoctorAvatar } from './components/AnimatedPortalAvatar';
import './PortalLanding.css';

const PATIENT_URL = (import.meta.env.VITE_PATIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
const DOCTOR_URL = (import.meta.env.VITE_DOCTOR_URL || 'http://localhost:5174').replace(/\/$/, '');

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
  }),
};

function PortalCard({ role, title, tagline, features, loginUrl, signupUrl, delay }) {
  const isPatient = role === 'patient';

  return (
    <motion.article
      className={`portal-card portal-card--${role}`}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      custom={delay}
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      <div className="portal-card__glow" aria-hidden />
      <div className="portal-card__visual">
        {isPatient ? <PatientAvatar /> : <DoctorAvatar />}
      </div>

      <div className="portal-card__body">
        <div className={`portal-card__badge portal-card__badge--${role}`}>
          {isPatient ? <Heart size={16} strokeWidth={2.5} /> : <Stethoscope size={16} strokeWidth={2.5} />}
          <span>{isPatient ? 'AyurCare AI' : 'DocConnect'}</span>
        </div>

        <h2 className="portal-card__title">{title}</h2>
        <p className="portal-card__tagline">{tagline}</p>

        <ul className="portal-card__features">
          {features.map((f) => (
            <li key={f}>
              <Sparkles size={12} aria-hidden />
              {f}
            </li>
          ))}
        </ul>

        <div className="portal-card__actions">
          <a href={loginUrl} className={`portal-btn portal-btn--primary portal-btn--${role}`}>
            <LogIn size={17} />
            Log in
            <ArrowRight size={16} className="portal-btn__arrow" />
          </a>
          <a href={signupUrl} className={`portal-btn portal-btn--ghost portal-btn--${role}`}>
            <UserPlus size={17} />
            Create account
          </a>
        </div>
      </div>
    </motion.article>
  );
}

export default function PortalLanding() {
  return (
    <div className="portal">
      <div className="portal__mesh" aria-hidden />
      <div className="portal__grain" aria-hidden />

      <motion.header
        className="portal__header"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="portal__brand">
          <span className="portal__logo">AI</span>
          <div>
            <p className="portal__brand-name">AyurCare AI · DocConnect</p>
            <p className="portal__brand-sub">Self-care to clinical care</p>
          </div>
        </div>
        <div className="portal__status">
          <span className="portal__status-dot" />
          System Online
        </div>
      </motion.header>

      <motion.section
        className="portal__hero"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.08 }}
      >
        <p className="portal__eyebrow">
          <Leaf size={15} aria-hidden />
          Unified health platform
        </p>
        <h1 className="portal__headline">
          One ecosystem.
          <br />
          <span className="portal__headline-accent">Two tailored experiences.</span>
        </h1>
        <p className="portal__lead">
          Patients begin with <strong>Vaidya AI</strong> and holistic wellness. Practitioners manage
          schedule, video visits, and clinical registry on <strong>DocConnect</strong>.
        </p>
      </motion.section>

      <section className="portal__grid">
        <PortalCard
          role="patient"
          title="Patient portal"
          tagline="Your Ayurvedic companion for intake, care plans, and doctor visits."
          features={['Vaidya AI clinical chat', 'Dosha & wellness tracking', 'Appointments & video care']}
          loginUrl={`${PATIENT_URL}/login`}
          signupUrl={`${PATIENT_URL}/signup`}
          delay={0.2}
        />
        <PortalCard
          role="doctor"
          title="Doctor portal"
          tagline="DocConnect — practice operations built for Ayurvedic clinicians."
          features={['Smart schedule & registry', 'Live video consultations', 'Prescriptions & messaging']}
          loginUrl={`${DOCTOR_URL}/login`}
          signupUrl={`${DOCTOR_URL}/signup`}
          delay={0.35}
        />
      </section>

      <footer className="portal__footer">
        <p>© {new Date().getFullYear()} AyurCare AI · Practitioners use DocConnect</p>
      </footer>
    </div>
  );
}

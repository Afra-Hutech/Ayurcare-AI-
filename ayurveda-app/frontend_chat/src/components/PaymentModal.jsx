import React, { useState, useEffect } from 'react';
import { X, CreditCard, Loader2, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { paymentApi } from '../services/paymentApi';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '14px',
      color: '#1e293b',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: '#94a3b8' },
    },
    invalid: { color: '#e11d48', iconColor: '#e11d48' },
  },
};

function CheckoutForm({ appointment, doctorName, clientSecret, onClose, onSuccess }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [step, setStep] = useState('idle');
  const [message, setMsg] = useState('');

  const amountDisplay = appointment.fee ? `₹${appointment.fee}` : 'consultation fee';
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();

  const handlePay = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setStep('loading');
    setMsg('');

    try {
      const card = elements.getElement(CardElement);
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card,
          billing_details: { name: user.name || 'Patient' },
        },
      });

      if (error) throw new Error(error.message);

      const verify = await paymentApi.verifyPayment({
        paymentIntentId: paymentIntent.id,
        appointmentId:   appointment._id,
      });

      if (verify.success) {
        setStep('success');
        onSuccess?.();
      } else {
        throw new Error(verify.message || 'Verification failed');
      }
    } catch (err) {
      setStep('error');
      setMsg(err.message || 'Payment could not be processed');
    }
  };

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <CheckCircle2 size={44} className="text-emerald-500" />
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Payment Successful!</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">Your consultation is confirmed and paid.</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition">Done</button>
      </div>
    );
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">Doctor</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">{doctorName}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">Consultation fee</span>
          <span className="font-bold text-[#28328c] dark:text-indigo-400 text-sm">{amountDisplay}</span>
        </div>
        {appointment.startTime && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Appointment</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {new Date(appointment.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {/* Card input */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Card details</p>
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>

      {/* Refund policy */}
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-start gap-2">
        <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
          <p className="font-bold mb-0.5">Refund Policy</p>
          <p>Full refund if the doctor cancels or if you choose not to rebook after a cancellation.</p>
        </div>
      </div>

      {step === 'error' && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={14} className="text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700 dark:text-rose-300">{message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={step === 'loading' || !stripe}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#28328c] dark:bg-indigo-600 text-white text-sm font-bold hover:bg-[#1f2770] dark:hover:bg-indigo-700 transition disabled:opacity-60"
      >
        {step === 'loading' ? (
          <><Loader2 size={16} className="animate-spin" /> Processing…</>
        ) : step === 'error' ? (
          <><RefreshCw size={16} /> Retry Payment</>
        ) : (
          <><CreditCard size={16} /> Pay {amountDisplay} securely</>
        )}
      </button>
      <p className="text-[10px] text-center text-slate-400 dark:text-slate-500">Secured by Stripe · Visa · Mastercard · UPI</p>
    </form>
  );
}

export default function PaymentModal({ appointment, doctorName, onClose, onSuccess }) {
  const [stripePromise, setStripePromise] = useState(null);
  const [clientSecret,  setClientSecret]  = useState(null);
  const [initError,     setInitError]     = useState(null);

  useEffect(() => {
    paymentApi.createOrder(appointment._id)
      .then(data => {
        if (data.message) throw new Error(data.message);
        setStripePromise(loadStripe(data.publishableKey));
        setClientSecret(data.clientSecret);
      })
      .catch(err => setInitError(err.message || 'Could not initialise payment'));
  }, [appointment._id]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-[#28328c] dark:text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Pay for Consultation</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {initError ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <AlertTriangle size={36} className="text-rose-500" />
              <p className="text-xs text-rose-600 dark:text-rose-400 text-center">{initError}</p>
              <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold">Close</button>
            </div>
          ) : !clientSecret || !stripePromise ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={28} className="animate-spin text-[#28328c] dark:text-indigo-400" />
              <p className="text-xs text-slate-500 dark:text-slate-400">Initialising payment…</p>
            </div>
          ) : (
            <Elements stripe={stripePromise}>
              <CheckoutForm
                appointment={appointment}
                doctorName={doctorName}
                clientSecret={clientSecret}
                onClose={onClose}
                onSuccess={onSuccess}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}

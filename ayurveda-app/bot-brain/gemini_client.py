import os
from datetime import datetime
from google import genai
from dotenv import load_dotenv

# ─────────────────────────────────────────────────────────────────────────────
# AyurCare AI — Clinical Intake Agent System Prompt
# Applied as a system instruction on every Gemini call.
# ─────────────────────────────────────────────────────────────────────────────
AYURCARE_SYSTEM_PROMPT = """You are the AyurCare AI Assistant — a specialized clinical intake agent for an Ayurvedic medical portal.

IDENTITY & TONE
- Name: AyurCare AI Assistant
- Tone: Calm, professional, and sage-like. Warm but never casual.
- Language: Professional English with traditional Ayurvedic terminology used correctly in context.
  Always pair Ayurvedic terms with their common equivalents, e.g. "Metabolism (Agni)", "Body Constitution (Prakriti)".

PHASE 1 — MANDATORY PATIENT INTAKE
Before providing any health insights, collect the following data points ONE AT A TIME to avoid overwhelming the patient:
1. Full Name
2. Age and Gender
3. Height and current Weight (used to calculate BMI and assess physical frame)
4. Medical records / lab reports — ask once. If the patient says they have none, accept that immediately and move on. Do NOT repeat the Health Vault question.
After intake is complete, ask ONCE whether to finalize their Ayurvedic clinical report. When they confirm (e.g. "yes"), proceed to report generation. Never auto-generate without consent.
Do NOT skip mandatory intake fields. Do NOT proceed to full clinical analysis until height, weight, and the records question are addressed.
Do NOT repeat a question the patient already answered (timing, sleep, triggers, relief). If enough detail is collected, offer report finalization instead of asking again.

PHASE 2 — AYURVEDIC KNOWLEDGE & RAG PROTOCOL
- Grounded Responses: Use the provided Ayurvedic knowledge base (RAG) to define terms. Never hallucinate Ayurvedic concepts.
- Terminology: When discussing health, always use both common terms and Ayurvedic equivalents.
- Prakriti Context: Frame every analysis around the three Doshas — Vata, Pitta, and Kapha.

PHASE 3 — CLINICAL CONSTRAINTS & SAFETY
- You are an assistant, NOT a doctor.
- Every response that touches on treatment, remedies, or health recommendations MUST end with:
  "This is an AI-generated assessment based on Ayurvedic principles. Please consult with your AyurCare practitioner before starting any new regimen."
- Incomplete Data: If symptoms are vague, do NOT guess. Ask clarifying questions about the patient's Ahara (diet) and Vihara (lifestyle) before drawing conclusions.
- Emergency Symptoms: If the patient describes chest pain, difficulty breathing, severe bleeding, loss of consciousness, or any life-threatening symptom, immediately advise them to seek emergency medical care.
"""

# Shared trace for telemetry
_llm_trace = []

# Models appended after your GEMINI_MODEL_CHAIN / `model` — tried only if earlier IDs fail (quota, overload, etc.)
_DEFAULT_TAIL_FALLBACKS = [
    "gemma-4-26b-a4b-it",
    "gemma-3-27b-it",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
]


def reset_trace():
    global _llm_trace
    _llm_trace = []


def get_trace_snapshot():
    return list(_llm_trace)


def _log_raw_response(prompt, response_text):
    """Debug helper to see exactly what the AI is returning."""
    try:
        log_dir = os.path.join(os.path.dirname(__file__), "logs")
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        log_file = os.path.join(log_dir, f"ai_response_{timestamp}.log")

        with open(log_file, "w", encoding="utf-8") as f:
            f.write("=== PROMPT ===\n")
            f.write(prompt)
            f.write("\n\n=== RESPONSE ===\n")
            f.write(response_text)
    except Exception as e:
        print(f"Failed to log raw response: {e}")


def _split_model_chain(chain_str):
    if not chain_str or not str(chain_str).strip():
        return []
    return [p.strip() for p in str(chain_str).split(",") if p.strip()]


def _dedupe_preserve(seq):
    seen = set()
    out = []
    for name in seq:
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def get_configured_api_keys():
    """Primary + fallback Gemini keys from GEMINI_API_KEY and GEMINI_API_KEY_FALLBACK (.env)."""
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(dotenv_path=env_path, override=True)
    keys = []
    for var in ("GEMINI_API_KEY", "GEMINI_API_KEY_FALLBACK"):
        val = (os.getenv(var) or "").strip()
        if val:
            for part in val.split(","):
                key = part.strip()
                if key and key not in keys:
                    keys.append(key)
    return keys


def _build_model_order(explicit_model, configured_model, chain_from_env):
    """
    Order: per-call model (if any) → GEMINI_MODEL_CHAIN → legacy `model` env → tail defaults.
    """
    parts = []
    if explicit_model and str(explicit_model).strip():
        parts.append(str(explicit_model).strip())
    parts.extend(_split_model_chain(chain_from_env))
    if configured_model and str(configured_model).strip():
        parts.append(str(configured_model).strip())
    if not parts:
        parts.append("gemini-2.0-flash")
    parts.extend(_DEFAULT_TAIL_FALLBACKS)
    return _dedupe_preserve(parts)


def send(prompt, model=None, max_tokens=1024, system_prompt=None, json_mode=False):
    """
    Calls Google Gemini / Gemma via google-genai.
    Uses GEMINI_MODEL_CHAIN (comma-separated) plus optional per-call `model`, then built-in fallbacks.
    On quota / rate limits / overload / missing model, automatically tries the next model in the chain.
    """
    from time import perf_counter
    start_time = perf_counter()

    _local_fallback = (
        "[AYURCARE_SERVICE_UNAVAILABLE] I am briefly unable to reach the clinical AI service. "
        "Please try your message again in a moment."
    )

    import time

    def _is_fatal_api_key(err_str):
        lowered = err_str.lower()
        if "api key" in lowered and ("invalid" in lowered or "not valid" in lowered):
            return True
        if "permission_denied" in lowered and "api" in lowered:
            return True
        return False

    def _is_rate_or_quota_error(err_str):
        lowered = err_str.lower()
        return (
            "429" in err_str
            or "resource_exhausted" in lowered
            or "quota" in lowered
            or "rate limit" in lowered
            or "exceeded" in lowered
            or "billing" in lowered
            or "resource has been exhausted" in lowered
        )

    def _is_transient_capacity_error(err_str):
        lowered = err_str.lower()
        return _is_rate_or_quota_error(err_str) or (
            "503" in err_str
            or "unavailable" in lowered
            or "overloaded" in lowered
            or "try again" in lowered
            or "deadline exceeded" in lowered
            or "timeout" in lowered
            or "temporarily" in lowered
        )

    def _is_model_or_request_error(err_str):
        lowered = err_str.lower()
        if _is_fatal_api_key(err_str):
            return False
        return (
            "not found" in lowered
            or "unsupported" in lowered
            or "invalid_argument" in lowered
            or "does not exist" in lowered
            or "unknown model" in lowered
            or "is not found" in lowered
        )

    # Ensure .env is loaded from the correct directory
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(dotenv_path=env_path, override=True)

    api_keys = get_configured_api_keys()
    configured_model = (os.getenv("model") or "").strip()
    chain_env = os.getenv("GEMINI_MODEL_CHAIN", "")

    if not api_keys:
        return _local_fallback

    ordered_models = _build_model_order(model, configured_model, chain_env)

    # Explicitly disable safety filters for clinical technical analysis
    safety_settings = [
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    ]

    quota_exhausted_all_models = False

    for key_index, gem_key in enumerate(api_keys):
        client = genai.Client(api_key=gem_key)
        key_label = "primary" if key_index == 0 else f"fallback-{key_index}"
        quota_exhausted_all_models = False

        for model_name in ordered_models:
            retry_delay = 1
            for attempt in range(3):
                try:
                    active_system_prompt = (
                        system_prompt if system_prompt is not None else AYURCARE_SYSTEM_PROMPT
                    )

                    cfg = {
                        "system_instruction": active_system_prompt,
                        "safety_settings": safety_settings,
                        "temperature": 0.1,
                        "max_output_tokens": max_tokens,
                    }
                    if json_mode:
                        cfg["response_mime_type"] = "application/json"

                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=cfg,
                    )

                    if hasattr(response, "text") and response.text:
                        res_text = response.text
                        _log_raw_response(prompt, res_text)

                        _llm_trace.append(
                            {
                                "model": model_name,
                                "api_key": key_label,
                                "latency_ms": round((perf_counter() - start_time) * 1000, 2),
                                "status": "success",
                            }
                        )
                        return res_text

                    print(f"Warning: Gemini returned empty or blocked response. Model: {model_name}")
                    if hasattr(response, "candidates") and response.candidates:
                        print(f"   Finish Reason: {response.candidates[0].finish_reason}")
                    break

                except Exception as e:
                    err_str = str(e)
                    if _is_fatal_api_key(err_str):
                        print(
                            f"Warning: API key auth error ({key_label}) — "
                            f"trying next key if available. {err_str[:160]}"
                        )
                        quota_exhausted_all_models = True
                        break

                    if _is_transient_capacity_error(err_str):
                        if _is_rate_or_quota_error(err_str) and key_index < len(api_keys) - 1:
                            print(
                                f"Quota/rate limit on {key_label} — switching to fallback Gemini API key."
                            )
                            quota_exhausted_all_models = True
                            break

                        if attempt < 2:
                            print(
                                f"Retry: transient capacity on {model_name} ({key_label}). "
                                f"Sleep {retry_delay}s (attempt {attempt + 1}/3)"
                            )
                            time.sleep(retry_delay)
                            retry_delay *= 2
                            continue

                        print(
                            f"Warning: Quota/capacity exhausted for {model_name} ({key_label}), "
                            "trying next model in chain."
                        )
                        quota_exhausted_all_models = True
                        break

                    if _is_model_or_request_error(err_str):
                        print(
                            f"Warning: Model or request issue for {model_name}: {err_str[:180]}. "
                            "Trying next model."
                        )
                        break

                    print(f"Error: Gemini send() {model_name}: {type(e).__name__}: {err_str[:200]}")
                    break

        if quota_exhausted_all_models and key_index < len(api_keys) - 1:
            print(f"Switching to fallback Gemini API key ({key_index + 2}/{len(api_keys)}).")
            continue

    return _local_fallback

"""Text Processing Module.

Provides:
- clean_text(text): normalizes and cleans extracted text
- paragraph_chunks(clean_text): splits text into paragraph chunks with offsets
- sentence_chunks(clean_text): splits text into sentence chunks with offsets
"""
import re
from typing import List, Dict

try:
    import spacy
except Exception:
    spacy = None


def clean_text(text: str) -> str:
    """Normalize and clean extracted text."""
    if not text:
        return text

    # Normalize newlines and spaces
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r"[\u00A0\t]+", " ", text)

    # Collapse repeated short lines (possible headers/footers)
    lines = [ln.rstrip() for ln in text.split('\n')]
    freq = {}
    for ln in lines:
        if 0 < len(ln) <= 80:
            freq[ln] = freq.get(ln, 0) + 1
    common = {ln for ln, c in freq.items() if c > 1}
    cleaned_lines = [ln for ln in lines if ln not in common]

    cleaned = '\n'.join(cleaned_lines)
    cleaned = re.sub(r"\n{3,}", '\n\n', cleaned)
    cleaned = cleaned.strip() + "\n"
    return cleaned


def paragraph_chunks(clean_text: str) -> List[Dict]:
    """Split by double-newline blocks and return list of dicts with offsets."""
    chunks = []
    pos = 0
    for para in [p.strip() for p in clean_text.split('\n\n') if p.strip()]:
        start = clean_text.find(para, pos)
        if start == -1:
            start = pos
        end = start + len(para)
        chunks.append({"text": para, "char_start": start, "char_end": end})
        pos = end
    return chunks


def sentence_chunks(clean_text: str, model: str = "en_core_web_sm") -> List[Dict]:
    """Return sentence chunks with offsets. Falls back to regex if spaCy unavailable."""
    if spacy is not None:
        try:
            nlp = spacy.load(model)
            doc = nlp(clean_text)
            return [
                {"text": sent.text.strip(), "char_start": sent.start_char, "char_end": sent.end_char}
                for sent in doc.sents if sent.text.strip()
            ]
        except Exception:
            pass

    # Fallback regex
    pattern = re.compile(r"(?<=[.!?])\s+")
    parts = [p.strip() for p in pattern.split(clean_text) if p.strip()]
    chunks = []
    pos = 0
    for p in parts:
        start = clean_text.find(p, pos)
        if start == -1:
            start = pos
        end = start + len(p)
        chunks.append({"text": p, "char_start": start, "char_end": end})
        pos = end
    return chunks

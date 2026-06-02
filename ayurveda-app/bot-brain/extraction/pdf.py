"""PDF Extraction Module.

Provides:
- extract_text_from_pdf(pdf_path): extracts text using PyPDF2 with pdfplumber fallback
"""
import os

try:
    import PyPDF2
except Exception:
    PyPDF2 = None

try:
    import pdfplumber
except Exception:
    pdfplumber = None


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF using PyPDF2, falling back to pdfplumber."""
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(pdf_path)

    text_parts = []

    if PyPDF2 is not None:
        try:
            with open(pdf_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    page_text = page.extract_text() or ""
                    text_parts.append(page_text)
            full = "\n".join(text_parts)
            if full.strip():
                return full
        except Exception:
            pass

    if pdfplumber is not None:
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text() or ""
                    text_parts.append(page_text)
            return "\n".join(text_parts)
        except Exception:
            pass

    return ""

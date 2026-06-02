"""PDF Processing Pipeline.

Extracts text from PDF, cleans it, creates chunks, and optionally builds embeddings.

Usage:
    python process_pdf.py input.pdf out_dir
"""
import sys
import os
from pathlib import Path

from extraction import extract_text_from_pdf, clean_text, paragraph_chunks, sentence_chunks
from storage import save_json, save_jsonl


def process_and_save(pdf_path: str, out_dir: str) -> dict:
    """Full PDF processing pipeline."""
    # Extract
    raw = extract_text_from_pdf(pdf_path)
    clean = clean_text(raw)

    # Create chunks
    paras = paragraph_chunks(clean)
    sents = sentence_chunks(clean)

    doc_id = os.path.splitext(os.path.basename(pdf_path))[0]
    Path(out_dir).mkdir(parents=True, exist_ok=True)

    # Save raw and clean
    with open(os.path.join(out_dir, f"{doc_id}_raw.txt"), 'w', encoding='utf-8') as f:
        f.write(raw)
    with open(os.path.join(out_dir, f"{doc_id}_clean.txt"), 'w', encoding='utf-8') as f:
        f.write(clean)

    # Save chunks as JSON
    save_json(paras, os.path.join(out_dir, f"{doc_id}_paragraphs.json"))
    save_json(sents, os.path.join(out_dir, f"{doc_id}_sentences.json"))

    return {
        "doc_id": doc_id,
        "raw_path": os.path.join(out_dir, f"{doc_id}_raw.txt"),
        "clean_path": os.path.join(out_dir, f"{doc_id}_clean.txt"),
        "paragraphs": len(paras),
        "sentences": len(sents)
    }


def main():
    if len(sys.argv) < 3:
        print("Usage: python process_pdf.py input.pdf out_dir")
        sys.exit(1)

    pdf = sys.argv[1]
    out = sys.argv[2]

    meta = process_and_save(pdf, out)
    print(f"Document {meta['doc_id']} -> {meta['paragraphs']} paragraphs, {meta['sentences']} sentences")


if __name__ == "__main__":
    main()

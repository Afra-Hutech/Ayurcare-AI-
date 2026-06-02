"""Vector DB Builder.

Walks through RAW_DATA folder, extracts text from PDFs/TXTs, 
chunks them, generates embeddings, and builds a FAISS index.
"""
import os
import sys
import json
import numpy as np
from pathlib import Path

# Add project root to path if needed (assuming running from bot-brain)
sys.path.append(os.path.dirname(__file__))

from extraction.pdf import extract_text_from_pdf
from extraction.text import clean_text, paragraph_chunks
from nlp.embeddings import encode_paragraphs, build_faiss_index

try:
    import faiss
except ImportError:
    print("FAISS not found. Installing faiss-cpu...")
    os.system("pip install faiss-cpu sentence-transformers")
    import faiss

BASE_DIR = Path(__file__).resolve().parent
RAW_DATA_DIR = BASE_DIR / "RAW_DATA"
VECTOR_STORE_DIR = BASE_DIR / "vector_store"
INDEX_PATH = VECTOR_STORE_DIR / "index.faiss"
METADATA_PATH = VECTOR_STORE_DIR / "metadata.json"

def build_vector_db():
    print(f"--- Starting Vector DB Build from {RAW_DATA_DIR} ---")
    
    if not VECTOR_STORE_DIR.exists():
        VECTOR_STORE_DIR.mkdir(parents=True)

    all_chunks = []
    
    # 1. Walk through RAW_DATA
    for root, _, files in os.walk(RAW_DATA_DIR):
        for file in files:
            file_path = Path(root) / file
            print(f"Processing: {file}")
            
            try:
                if file.lower().endswith('.pdf'):
                    raw_text = extract_text_from_pdf(str(file_path))
                elif file.lower().endswith(('.txt', '.md')):
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        raw_text = f.read()
                else:
                    print(f"Skipping unsupported file type: {file}")
                    continue

                if not raw_text.strip():
                    print(f"Warning: No text extracted from {file}")
                    continue

                # Clean and Chunk
                cleaned = clean_text(raw_text)
                chunks = paragraph_chunks(cleaned)
                
                for chunk in chunks:
                    chunk['source'] = file
                    all_chunks.append(chunk)

            except Exception as e:
                print(f"Error processing {file}: {e}")

    if not all_chunks:
        print("No text chunks found. Please add books to the RAW_DATA folder.")
        return

    print(f"Total chunks extracted: {len(all_chunks)}")

    # 2. Generate Embeddings
    print("Generating embeddings (this may take a moment)...")
    texts = [c['text'] for c in all_chunks]
    embeddings = encode_paragraphs(texts)

    # 3. Build and Save FAISS Index
    print("Building FAISS index...")
    index, _ = build_faiss_index(embeddings)
    faiss.write_index(index, str(INDEX_PATH))

    # 4. Save Metadata (the actual text and source for retrieval)
    with open(METADATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(all_chunks, f, indent=2)

    print(f"--- Success! Vector DB saved to {VECTOR_STORE_DIR} ---")

if __name__ == "__main__":
    build_vector_db()

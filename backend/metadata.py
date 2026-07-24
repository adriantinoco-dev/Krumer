import os
import hashlib
import warnings
from pathlib import Path
from typing import Tuple, Optional
from PIL import Image, ImageDraw, ImageFont
import io

# Suppress ebooklib and third-party warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=FutureWarning)

import ebooklib
from ebooklib import epub
import fitz  # PyMuPDF

from database import COVERS_DIR

def generate_gradient_cover(title: str, output_path: str):
    """Generates a premium looking gradient book cover with the title."""
    width, height = 300, 450
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img)
    
    # Generate deterministic color palette based on title hash
    title_hash = hashlib.sha256(title.encode('utf-8')).hexdigest()
    h_val = int(title_hash[:8], 16)
    
    # Premium gradients
    gradients = [
        ((24, 21, 35), (98, 86, 142)),     # Deep Velvet Purple
        ((12, 74, 96), (33, 172, 126)),    # Emerald Sea/Teal
        ((156, 38, 22), (232, 125, 41)),   # Volcano Orange
        ((41, 12, 94), (170, 52, 198)),    # Cosmic Magenta/Violet
        ((15, 32, 67), (84, 150, 189)),    # Midnight Slate Blue
    ]
    
    c1, c2 = gradients[h_val % len(gradients)]
    
    # Draw vertical linear gradient
    for y in range(height):
        ratio = y / height
        r = int(c1[0] + (c2[0] - c1[0]) * ratio)
        g = int(c1[1] + (c2[1] - c1[1]) * ratio)
        b = int(c1[2] + (c2[2] - c1[2]) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
        
    # Draw inner frame
    draw.rectangle([12, 12, width-12, height-12], outline=(255, 255, 255), width=1)
    
    # Title formatting and drawing
    words = title.split()
    lines = []
    current_line = []
    for word in words:
        if len(" ".join(current_line + [word])) <= 16:
            current_line.append(word)
        else:
            lines.append(" ".join(current_line))
            current_line = [word]
    if current_line:
        lines.append(" ".join(current_line))
    
    wrapped_text = "\n".join(lines[:5])  # Limit to 5 lines
    
    # Try to load a clean font
    font = None
    try:
        font = ImageFont.truetype("arial.ttf", 22)
    except IOError:
        try:
            font = ImageFont.truetype("DejaVuSans.ttf", 22)
        except IOError:
            font = ImageFont.load_default()
            
    # Draw dark content container in the middle
    text_y = 120
    draw.rectangle([25, text_y - 20, width - 25, text_y + 160], fill=(20, 20, 20))
    
    # Draw text
    draw.text((37, text_y + 2), wrapped_text, fill=(0, 0, 0), font=font)  # Shadow
    draw.text((35, text_y), wrapped_text, fill=(249, 115, 22), font=font)  # Accent orange text
    
    # Add badge at the bottom
    try:
        badge_font = ImageFont.truetype("arial.ttf", 12)
    except IOError:
        badge_font = ImageFont.load_default()
    
    draw.text((width // 2 - 38, height - 40), "LIBRARIAN", fill=(255, 255, 255), font=badge_font)
    
    img.save(output_path, format="PNG")

def get_epub_metadata(file_path: str) -> Tuple[Optional[str], Optional[str], Optional[bytes]]:
    """Extracts title, author, and cover bytes from an EPUB file."""
    title = None
    author = None
    cover_bytes = None
    
    try:
        book = epub.read_epub(file_path)
        
        # Extract title
        titles = book.get_metadata('DC', 'title')
        if titles:
            title = titles[0][0]
            if isinstance(title, bytes):
                title = title.decode('utf-8', errors='ignore')
        
        # Extract author
        creators = book.get_metadata('DC', 'creator')
        if creators:
            author = creators[0][0]
            if isinstance(author, bytes):
                author = author.decode('utf-8', errors='ignore')
                
        # Search for cover image
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_IMAGE:
                name = item.get_name().lower()
                if 'cover' in name or (item.id and 'cover' in item.id.lower()):
                    cover_bytes = item.get_content()
                    break
        
        # Fallback: take the first image
        if not cover_bytes:
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_IMAGE:
                    cover_bytes = item.get_content()
                    break
    except Exception as e:
        print(f"Error parsing EPUB {file_path}: {e}")
        
    return title, author, cover_bytes

def get_pdf_metadata(file_path: str) -> Tuple[Optional[str], Optional[str], int, Optional[bytes]]:
    """Extracts title, author, total pages, and cover bytes (page 1) from a PDF file."""
    title = None
    author = None
    total_pages = 0
    cover_bytes = None
    
    doc = None
    try:
        doc = fitz.open(file_path)
        total_pages = len(doc)
        
        metadata = doc.metadata
        if metadata:
            title = metadata.get('title')
            author = metadata.get('author')
            
        # Render first page as cover
        if total_pages > 0:
            page = doc[0]
            pix = page.get_pixmap(dpi=150)
            cover_bytes = pix.tobytes(output="png")
    except Exception as e:
        print(f"Error parsing PDF {file_path}: {e}")
    finally:
        if doc is not None:
            doc.close()
            
    return title, author, total_pages, cover_bytes


def process_file_metadata_and_cover(file_path: str, display_title_setting: str) -> Tuple[str, Optional[str], Optional[str], Optional[int]]:
    """
    Processes the file to extract metadata and saves/caches its cover.
    Returns: (display_title, metadata_title, author, total_pages)
    """
    path_obj = Path(file_path)
    extension = path_obj.suffix.lower()
    filename_title = path_obj.stem
    
    metadata_title = None
    author = None
    total_pages = None
    cover_bytes = None
    
    # 1. Extract metadata and cover bytes based on extension
    if extension == '.epub':
        metadata_title, author, cover_bytes = get_epub_metadata(file_path)
    elif extension == '.pdf':
        metadata_title, author, total_pages, cover_bytes = get_pdf_metadata(file_path)
        
    # Clean up empty strings or whitespace-only metadata
    if metadata_title and not metadata_title.strip():
        metadata_title = None
    if author and not author.strip():
        author = None
        
    # 2. Determine display title based on the active preference
    # Options for display_title_setting: 'filename' or 'metadata'
    if display_title_setting == 'filename':
        display_title = filename_title
    else:
        display_title = metadata_title or filename_title
        
    # 3. Save or generate cover image
    cover_hash = hashlib.sha256(file_path.encode('utf-8')).hexdigest()
    cover_path = COVERS_DIR / f"{cover_hash}.png"
    
    if cover_bytes:
        try:
            image = Image.open(io.BytesIO(cover_bytes))
            # Resize cover if too large, maintaining ratio
            image.thumbnail((300, 450))
            image.save(cover_path, format="PNG")
        except Exception as e:
            print(f"Could not save cover image for {file_path}, generating placeholder. Error: {e}")
            generate_gradient_cover(display_title, str(cover_path))
    else:
        # Generate placeholder cover
        generate_gradient_cover(display_title, str(cover_path))
        
    return display_title, metadata_title, author, total_pages

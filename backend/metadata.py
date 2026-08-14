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
                
        cover_bytes = _find_epub_cover(book)
    except Exception as e:
        print(f"Error parsing EPUB {file_path}: {e}")
        
    return title, author, cover_bytes


def _find_epub_cover(book):
    """
    Selects the best cover image from an EPUB, in order of reliability:
    1. Manifest item with ``properties="cover-image"`` (EPUB3) — ebooklib exposes
       these as EpubCover (ITEM_COVER); the old code only looked at ITEM_IMAGE and
       skipped them, blindly falling back to "first image".
    2. OPF ``<meta name="cover" content="..."/>`` declaration (EPUB2), resolved to
       the manifest item id.
    3. Image whose file name or item id mentions "cover".
    4. Last resort: the largest portrait-oriented image (most likely the real cover
       rather than a decorative/front-matter image such as a publisher logo).
    """
    items = list(book.get_items())

    # 1. EPUB3 — properties="cover-image"
    for item in items:
        if item.get_type() == ebooklib.ITEM_COVER:
            content = item.get_content()
            if content:
                return content

    # 2. EPUB2 — <meta name="cover" content="item-id"/>
    try:
        cover_meta = list(book.get_metadata('OPF', 'cover'))
    except Exception:
        cover_meta = []
    if not cover_meta:
        # Some ebooklib builds store the EPUB2 <meta name="cover"> entry under
        # the generic 'meta' key instead of 'cover'; handle both.
        try:
            for value, others in book.get_metadata('OPF', 'meta'):
                if (others or {}).get('name') == 'cover':
                    cover_meta.append((value, others))
        except Exception:
            pass
    for value, others in cover_meta:
        cover_id = ((others or {}).get('content') or (value if value else None))
        if not cover_id:
            continue
        cover_id = str(cover_id).lower()
        for item in items:
            if item.id and item.id.lower() == cover_id:
                content = item.get_content()
                if content:
                    return content

    # 3. Filename / id heuristic
    for item in items:
        if item.get_type() == ebooklib.ITEM_IMAGE:
            item_name = (item.get_name() or '').lower()
            item_id = (item.id or '').lower()
            if 'cover' in item_name or 'cover' in item_id:
                content = item.get_content()
                if content:
                    return content

    # 4. Heuristic: largest portrait image (most likely the actual cover)
    best_content = None
    best_area = 0
    for item in items:
        if item.get_type() != ebooklib.ITEM_IMAGE:
            continue
        content = item.get_content()
        if not content:
            continue
        try:
            with Image.open(io.BytesIO(content)) as img:
                width, height = img.size
            if width >= height:  # book covers are portrait oriented
                continue
            area = width * height
            if area > best_area:
                best_area = area
                best_content = content
        except Exception:
            continue
    return best_content

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


def process_file_metadata_and_cover(file_path: str, display_title_setting: str) -> Tuple[str, Optional[str], Optional[str], Optional[int], Optional[str]]:
    """
    Processes the file to extract metadata and saves/caches its cover.
    Returns: (display_title, metadata_title, author, total_pages, cover_original_path)
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
    original_path = COVERS_DIR / f"{cover_hash}_original.png"
    cover_original_path_str = None
    
    if cover_bytes:
        written = _process_cover_bytes(cover_bytes, str(cover_path), str(original_path), filename_title)
        if written or os.path.exists(original_path):
            cover_original_path_str = str(original_path)
    if not cover_original_path_str:
        # Generate placeholder cover
        generate_gradient_cover(display_title, str(cover_path))
        
    return display_title, metadata_title, author, total_pages, cover_original_path_str


def _process_cover_bytes(cover_bytes, cover_path, original_path, item_title="item"):
    """
    Crops the cover to 3:4, resizes it to 450x600 and saves both the display and
    the "original" cover files. If the stored original already contains the same
    bytes, nothing is rewritten. Returns True if files were written, False otherwise.
    """
    try:
        image = Image.open(io.BytesIO(cover_bytes))
        target_w, target_h = 450, 600
        img_ratio = image.width / image.height
        target_ratio = target_w / target_h
        if img_ratio > target_ratio:
            new_w = int(image.height * target_ratio)
            left = (image.width - new_w) // 2
            image = image.crop((left, 0, left + new_w, image.height))
        else:
            new_h = int(image.width / target_ratio)
            top = (image.height - new_h) // 2
            image = image.crop((0, top, image.width, top + new_h))
        image = image.resize((target_w, target_h), Image.LANCZOS)

        buf = io.BytesIO()
        image.save(buf, format="PNG")
        processed = buf.getvalue()

        # Skip rewriting when nothing changed (avoids churn on every rescan)
        if original_path and os.path.exists(original_path):
            try:
                with open(original_path, 'rb') as f:
                    if f.read() == processed:
                        return False
            except OSError:
                pass

        Path(cover_path).parent.mkdir(parents=True, exist_ok=True)
        with open(cover_path, 'wb') as f:
            f.write(processed)
        if original_path:
            with open(original_path, 'wb') as f:
                f.write(processed)
        return True
    except Exception as e:
        print(f"Could not save cover image for {item_title}. Error: {e}")
        return False


def refresh_item_cover(file_path, cover_path, cover_original_path, display_title):
    """
    Re-extracts the cover from a file (using the improved detection) and overwrites
    the cached cover files when the freshly extracted image differs from what is
    currently stored. Used during full re-scans to repair covers that were
    originally extracted with a poor algorithm. Returns True if updated.
    """
    extension = Path(file_path).suffix.lower()
    cover_bytes = None
    if extension == '.epub':
        _, _, cover_bytes = get_epub_metadata(file_path)
    elif extension == '.pdf':
        _, _, _, cover_bytes = get_pdf_metadata(file_path)

    if not cover_bytes:
        return False

    cover_hash = hashlib.sha256(file_path.encode('utf-8')).hexdigest()
    display = cover_path or str(COVERS_DIR / f"{cover_hash}.png")
    original = cover_original_path or str(COVERS_DIR / f"{cover_hash}_original.png")
    return _process_cover_bytes(cover_bytes, display, original, display_title)

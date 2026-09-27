import type { Book } from '../models/item';

export function getReadBooksToDisplay(books: Book[]): Book[] {
  const result: Book[] = [];

  function visit(book: Book, inheritedRead = false, inheritedCover: string | null = null) {
    const children = book.children ?? [];
    const hasChildren = children.length > 0;
    const isRead = inheritedRead || (hasChildren ? Boolean(book.isRead) : isBookRead(book));
    const coverPath = book.coverPath ?? inheritedCover;

    if (hasChildren) {
      for (const child of children) {
        visit(child, isRead, coverPath);
      }
      return;
    }

    if (!isRead) return;
    if (book.coverPath || !coverPath) {
      result.push(book);
      return;
    }

    result.push({ ...book, coverPath });
  }

  for (const book of books) {
    visit(book);
  }

  return result;
}

function isBookRead(book: Book): boolean {
  return Boolean(book.isRead || (book.progressPct ?? 0) >= 100);
}

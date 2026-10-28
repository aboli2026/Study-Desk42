import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  X,
  StickyNote,
  FileText,
  ArrowLeft,
  Copy,
  Check,
  BookOpen,
  Calendar,
  Sparkles,
  ChevronDown,
  Plus,
  Edit3,
  Image as ImageIcon,
} from 'lucide-react';
import { StudyFile, StickyNoteItem, NoteItem } from '../types';

export interface FileQuickNotesContextMenuProps {
  file: StudyFile;
  position?: { x: number; y: number } | null;
  onClose: () => void;
  notes: NoteItem[];
  onOpenFile: (file: StudyFile) => void;
  onOpenFileAtPage?: (file: StudyFile, pageNumber: number) => void;
  onSwitchToNotes?: (noteId?: string) => void;
  initialTab?: 'sticky' | 'notebook' | 'all';
  onAddNote?: (note: Omit<NoteItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  currentPage?: number;
}

export const FileQuickNotesContextMenu: React.FC<FileQuickNotesContextMenuProps> = ({
  file,
  onClose,
  notes,
  onOpenFile,
  onOpenFileAtPage,
  onSwitchToNotes,
  initialTab = 'sticky',
  onAddNote,
  currentPage,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'sticky' | 'notebook' | 'all'>(initialTab);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setFilterType(initialTab);
    }
  }, [initialTab]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus search on open for instant finding
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard navigation & Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Clean file title
  const cleanFileName = (name?: string): string => {
    if (!name) return 'فایل مطالعه';
    return name.replace(/\.pdf$/i, '').trim() || name;
  };

  // Sticky notes of this file
  const stickyNotes = useMemo(() => {
    const list = [...(file.stickyNotes || [])];
    // Sort by page number
    return list.sort((a, b) => (a.pageNumber || 1) - (b.pageNumber || 1));
  }, [file.stickyNotes]);

  // Attached notebook notes of this file
  const attachedNotes = useMemo(() => {
    const fileNameClean = (file.name || '').trim().toLowerCase();
    return notes.filter((n) => {
      if (n.attachedFileId && n.attachedFileId === file.id) return true;
      if (n.attachedFileName && n.attachedFileName.trim().toLowerCase() === fileNameClean) return true;
      return false;
    });
  }, [notes, file.id, file.name]);

  // Unified items list
  interface UnifiedNoteItem {
    id: string;
    type: 'sticky' | 'notebook';
    title: string;
    content: string;
    pageNumber?: number;
    color?: string;
    textColor?: string;
    date?: string;
    rawSticky?: StickyNoteItem;
    rawNote?: NoteItem;
    isAttached?: boolean;
    imageUrl?: string;
    images?: string[];
  }

  const allNotesList: UnifiedNoteItem[] = useMemo(() => {
    const items: UnifiedNoteItem[] = [];

    stickyNotes.forEach((s) => {
      items.push({
        id: s.id,
        type: 'sticky',
        title: s.title || `استیکی‌نوت صفحه ${s.pageNumber}`,
        content: s.content || '',
        pageNumber: s.pageNumber,
        color: s.color || '#fef08a',
        textColor: s.textColor || '#713f12',
        date: s.createdAt,
        rawSticky: s,
        imageUrl: s.imageUrl,
        images: s.images && s.images.length > 0 ? s.images : (s.imageUrl ? [s.imageUrl] : []),
      });
    });

    const fileNameClean = (file.name || '').trim().toLowerCase();
    const sortedNotes = [...notes].sort((a, b) => {
      const aAttached = (a.attachedFileId && a.attachedFileId === file.id) || (a.attachedFileName && a.attachedFileName.trim().toLowerCase() === fileNameClean);
      const bAttached = (b.attachedFileId && b.attachedFileId === file.id) || (b.attachedFileName && b.attachedFileName.trim().toLowerCase() === fileNameClean);
      if (aAttached && !bAttached) return -1;
      if (!aAttached && bAttached) return 1;
      return 0;
    });

    sortedNotes.forEach((n) => {
      const isAttached = Boolean(
        (n.attachedFileId && n.attachedFileId === file.id) ||
        (n.attachedFileName && n.attachedFileName.trim().toLowerCase() === fileNameClean)
      );
      const plainText = (n.content || '').replace(/<[^>]*>?/gm, '').trim();
      items.push({
        id: n.id,
        type: 'notebook',
        title: n.title || 'یادداشت بدون عنوان',
        content: plainText,
        date: n.updatedAt || n.createdAt,
        rawNote: n,
        isAttached,
      });
    });

    return items;
  }, [stickyNotes, notes, file.id, file.name]);

  // Filtered by search and category
  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allNotesList.filter((item) => {
      // Type filter
      if (filterType === 'sticky' && item.type !== 'sticky') return false;
      if (filterType === 'notebook' && item.type !== 'notebook') return false;

      // Search query
      if (!q) return true;
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchContent = item.content.toLowerCase().includes(q);
      const matchPage = item.pageNumber ? `صفحه ${item.pageNumber}`.includes(q) || String(item.pageNumber) === q : false;
      return matchTitle || matchContent || matchPage;
    });
  }, [allNotesList, searchQuery, filterType]);

  const handleCopy = (text: string, id: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleJumpToPage = (pageNum: number) => {
    onClose();
    if (onOpenFileAtPage) {
      onOpenFileAtPage(file, pageNum);
    } else {
      onOpenFile(file);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4 sm:p-6 transition-opacity duration-150"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-neutral-200/80 flex flex-col overflow-hidden text-neutral-800 animate-ios-modal transform-gpu will-change-transform"
      >
        {/* Header - Spacious & Clean */}
        <div className="p-5 sm:p-6 border-b border-neutral-100 bg-neutral-50/50 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold">
                  <StickyNote className="w-3.5 h-3.5 text-amber-700" />
                  <span>دسترسی سریع به یادداشت‌ها</span>
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  {allNotesList.length} مورد یافت شد
                </span>
              </div>
              <h2
                className="text-lg sm:text-xl font-bold text-neutral-900 truncate tracking-tight pt-0.5"
                title={file.name}
              >
                {cleanFileName(file.name)}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 cursor-pointer shrink-0 transition-transform ios-spring-btn"
              title="خروج و بستن پنجره (Esc)"
              aria-label="خروج و بستن"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </button>
          </div>

          {/* Quick Search Box - Instant Real-Time Filter */}
          <div className="relative w-full">
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در متن یادداشت‌ها، عنوان، یا شماره صفحه..."
              className="w-full pr-10 pl-10 py-3 bg-white border border-neutral-200/90 rounded-2xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 cursor-pointer ios-spring-tool"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Clean Filter Tabs + Add Note Action Button */}
          <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterType('sticky')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn ${
                  filterType === 'sticky'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-white text-neutral-600 hover:bg-amber-50 border border-neutral-200/70'
                }`}
              >
                <StickyNote className="w-3.5 h-3.5" />
                <span>استیکی‌نوت‌ها ({stickyNotes.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterType('notebook')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn ${
                  filterType === 'notebook'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-neutral-600 hover:bg-blue-50 border border-neutral-200/70'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>یادداشت‌های اصلی ({notes.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ios-spring-btn ${
                  filterType === 'all'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200/70'
                }`}
              >
                همه ({allNotesList.length})
              </button>
            </div>

            {/* دکمه باز کردن در دفترچه کامل (فقط در بخش یادداشت‌ها) */}
            {onSwitchToNotes && filterType !== 'sticky' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToNotes();
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ios-spring-btn shrink-0"
                title="باز کردن در دفترچه یادداشت کامل"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>باز کردن در دفترچه کامل</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area - Spacious, Uncluttered, Readable */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {filteredNotes.length === 0 ? (
            <div className="py-16 px-4 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center mb-3">
                <StickyNote className="w-6 h-6 stroke-1" />
              </div>
              <h3 className="text-base font-bold text-neutral-800">
                {searchQuery ? 'یادداشتی با این عبارت پیدا نشد' : 'هیچ یادداشتی در این فایل ثبت نشده'}
              </h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm leading-relaxed">
                {searchQuery
                  ? 'عبارت دیگری را جستجو کنید یا فیلتر را تغییر دهید.'
                  : 'در حین مطالعه فایل می‌توانید با ابزار استیکی‌نوت نکات مهم را روی صفحات ثبت کنید یا به دفترچه کامل بروید.'}
              </p>
              {onSwitchToNotes && !searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToNotes();
                  }}
                  className="mt-4 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-xs ios-spring-btn"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>باز کردن در دفترچه کامل</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotes.map((item) => {
                const isSticky = item.type === 'sticky';
                const isExpanded = expandedId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                      isExpanded
                        ? isSticky
                          ? 'border-amber-400/90 bg-amber-50/20 shadow-md ring-1 ring-amber-400/30'
                          : 'border-blue-400/90 bg-blue-50/20 shadow-md ring-1 ring-blue-400/30'
                        : 'border-neutral-200/90 hover:border-neutral-300 bg-white shadow-2xs hover:shadow-xs hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Header Row - Compact, List-style & Clickable to Expand with tactile spring */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
                    >
                      {/* Right: Badge + Title + Truncated preview */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {isSticky ? (
                          <span
                            style={{
                              backgroundColor: item.color || '#fef08a',
                              color: item.textColor || '#713f12',
                            }}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono border border-black/10 shrink-0 shadow-2xs ios-spring-tool"
                          >
                            ص {item.pageNumber}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/70 shrink-0 ios-spring-tool">
                            {item.isAttached ? 'متصل به فایل' : 'یادداشت'}
                          </span>
                        )}

                        <h4 className="text-xs sm:text-sm font-bold text-neutral-900 truncate">
                          {item.title}
                        </h4>

                        {item.imageUrl && (
                          <span className="p-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200/60 shrink-0" title="دارای تصویر پیوست">
                            <ImageIcon className="w-3.5 h-3.5" />
                          </span>
                        )}

                        {!isExpanded && item.content && (
                          <span className="text-xs text-neutral-400 truncate hidden md:inline max-w-[220px]">
                            {item.content}
                          </span>
                        )}
                      </div>

                      {/* Left: Date + Chevron Toggle */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.date && (
                          <span className="text-[11px] font-mono text-neutral-400 hidden sm:inline">
                            {item.date}
                          </span>
                        )}
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 ios-spring-tool ${
                            isExpanded
                              ? 'bg-neutral-900 text-white rotate-180'
                              : 'bg-neutral-100 text-neutral-500'
                          }`}
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>

                    {/* Extended Section (نمایش کامل متن، عکس و اکشن‌ها هنگام کلیک با انیمیشن روان و سبک) */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 border-t border-neutral-100/90 space-y-3 animate-ios-card-expand">
                        {/* Attached Images if present */}
                        {((item.images && item.images.length > 0) || item.imageUrl) && (
                          <div
                            className={`grid gap-2 ${
                              (item.images?.length || 1) === 1 ? 'grid-cols-1' : 'grid-cols-2'
                            }`}
                          >
                            {(item.images && item.images.length > 0 ? item.images : [item.imageUrl!]).map(
                              (img, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 max-h-56 flex items-center justify-center shadow-2xs"
                                >
                                  <img
                                    src={img}
                                    alt="تصویر یادداشت چسبان"
                                    className="w-full h-auto max-h-56 object-contain rounded-xl"
                                  />
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {/* Text body */}
                        <div className="p-3 rounded-xl bg-white border border-neutral-200/70 select-text shadow-2xs">
                          <p className="text-xs sm:text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap font-normal">
                            {item.content || 'بدون محتوای متنی'}
                          </p>
                        </div>

                        {/* Action buttons inside extended card */}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="flex items-center gap-2">
                            {isSticky && item.pageNumber && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleJumpToPage(item.pageNumber!);
                                }}
                                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ios-spring-btn"
                              >
                                <span>مشاهده در صفحه {item.pageNumber}</span>
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {!isSticky && onSwitchToNotes && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClose();
                                  onSwitchToNotes(item.id);
                                }}
                                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ios-spring-btn"
                              >
                                <span>ویرایش در دفترچه اصلی</span>
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(item.content, item.id);
                              }}
                              className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ios-spring-btn"
                              title="کپی متن"
                            >
                              {copiedId === item.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-emerald-600 font-bold">کپی شد</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>کپی متن</span>
                                </>
                              )}
                            </button>
                          </div>

                          {item.date && (
                            <span className="text-[11px] font-mono text-neutral-400">
                              {item.date}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer - Subtle Action Bar */}
        <div className="p-4 px-6 bg-neutral-50/80 border-t border-neutral-200/70 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span>کلید Esc برای بستن</span>
            <span>·</span>
            <span>کلیک روی «مشاهده در صفحه» برای رفتن به متن پی‌دی‌اف</span>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFile(file);
            }}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs ios-spring-btn"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>مطالعه فایل</span>
          </button>
        </div>
      </div>
    </div>
  );
};

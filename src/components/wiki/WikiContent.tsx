import type { MouseEvent, RefObject } from 'react';
import { Check, ChevronRight, Copy, Edit2, RefreshCw, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MixedContentRenderer } from '@/components/MixedContentRenderer';
import type { WikiFileNode } from '@/lib/wikiSource';

interface Props {
  readonly currentFile: WikiFileNode | null;
  readonly content: string;
  readonly editContent: string;
  readonly isEditing: boolean;
  readonly loadingPath: string | null;
  readonly isCopied: boolean;
  readonly saving: boolean;
  readonly canWrite: boolean;
  readonly contentRef: RefObject<HTMLDivElement>;
  readonly onContentClick: (e: MouseEvent<HTMLDivElement>) => void;
  readonly onEditContentChange: (value: string) => void;
  readonly onCopy: () => void;
  readonly onEdit: () => void;
  readonly onCancelEdit: () => void;
  readonly onSave: () => void;
}

export function WikiContent({
  currentFile,
  content,
  editContent,
  isEditing,
  loadingPath,
  isCopied,
  saving,
  canWrite,
  contentRef,
  onContentClick,
  onEditContentChange,
  onCopy,
  onEdit,
  onCancelEdit,
  onSave,
}: Props) {
  const breadcrumbs = currentFile ? currentFile.path.split('/') : [];

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-0">
      {currentFile ? (
        <>
          <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground overflow-x-auto min-h-[44px]">
            <div className="flex items-center gap-1">
              {breadcrumbs.map((part, idx) => (
                <span key={idx} className="flex items-center gap-1 whitespace-nowrap">
                  {idx > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                  <span
                    className={
                      idx === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''
                    }
                  >
                    {part}
                  </span>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {isEditing ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
                    onClick={onCancelEdit}
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={onSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}{' '}
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
                    onClick={onCopy}
                  >
                    {isCopied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}{' '}
                    Copy
                  </Button>
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
                      onClick={onEdit}
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <div
            ref={contentRef}
            onClick={onContentClick}
            className="flex-1 min-h-0 overflow-auto flex flex-col"
          >
            {loadingPath !== null ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : isEditing ? (
              <textarea
                className="flex-1 w-full h-full p-8 bg-transparent border-0 resize-none outline-none font-mono text-sm leading-relaxed"
                value={editContent}
                onChange={(e) => onEditContentChange(e.target.value)}
                placeholder="Start typing markdown here..."
                spellCheck={false}
              />
            ) : (
              <div className="p-8 markdown-body">
                <MixedContentRenderer content={content} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground italic">
          Select a file from the sidebar to start reading.
        </div>
      )}
    </section>
  );
}

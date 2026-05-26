import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UnsupportedView() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
      <BookOpen className="h-16 w-16 text-destructive/40" />
      <h2 className="text-xl font-semibold text-foreground">Browser not supported</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        The Markdown Wiki uses the File System Access API to read a folder directly from disk.
        That API is only available in Chromium-based browsers (Chrome, Edge, Brave, Opera).
        Please open this page in one of those browsers.
      </p>
      <Link to="/">
        <Button variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Button>
      </Link>
    </div>
  );
}

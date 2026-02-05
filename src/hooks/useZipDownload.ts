import { useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { ParsedFile } from '@/lib/codeParser';

export function useZipDownload() {
  const downloadAsZip = useCallback(async (files: ParsedFile[], zipName: string = 'project') => {
    if (files.length === 0) return;

    const zip = new JSZip();

    for (const file of files) {
      zip.file(file.path, file.content);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${zipName}.zip`);
  }, []);

  return { downloadAsZip };
}

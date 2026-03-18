import { Link } from 'react-router-dom';
import { FileCode, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UtilCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
}

const utils: UtilCard[] = [
  {
    title: 'Code Exporter',
    description:
      'Paste AI-generated code output (Gemini, ChatGPT, etc.) and automatically parse it into individual files. Preview the file tree, inspect each file, and download everything as a ZIP.',
    icon: <FileCode className="h-6 w-6" />,
    path: '/code-exporter',
    color: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    title: 'Markdown Share',
    description:
      'Paste any Markdown content and instantly get a shareable link. The content is LZ-compressed directly into the URL — no server, no database, fully client-side.',
    icon: <FileText className="h-6 w-6" />,
    path: '/markdown',
    color: 'from-purple-500/20 to-pink-500/20',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
              <img src="/logo_512_512.png" alt="Logo" className="h-8 w-8 object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">AI Utils</h1>
              <p className="text-xs text-muted-foreground">
                A collection of handy developer utilities
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-10">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-2">Choose a Utility</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Pick one of the tools below to get started.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {utils.map((util) => (
              <Link key={util.path} to={util.path} className="group">
                <div className="h-full rounded-xl border border-border bg-card hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 overflow-hidden">
                  {/* Gradient accent bar */}
                  <div className={`h-1.5 bg-gradient-to-r ${util.color}`} />

                  <div className="p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        {util.icon}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-foreground mb-1">{util.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {util.description}
                      </p>
                    </div>

                    <Button variant="outline" size="sm" className="mt-auto w-full gap-1.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      Open
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          AI Utils — All processing happens client-side. No data is sent to any server.
        </div>
      </footer>
    </div>
  );
}


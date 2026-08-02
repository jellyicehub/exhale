import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'EXHALE — Breath Acidity Monitor',
  description:
    'Real-time breath acidity monitoring and health tracking powered by the EXHALE IoT device.',
  viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  // Default is light mode; dark mode is opt-in
                  if (theme === 'dark') {
                    document.documentElement.removeAttribute('data-theme');
                  } else {
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch (e) {}
              })();
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Mario CSS Game",
  description: "Next.js + CSS only visuals Mario-like platformer"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body>{children}</body>
    </html>
  );
}
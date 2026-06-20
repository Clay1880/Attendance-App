import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// NEW: Viewport configuration to set the PWA theme color and mobile scaling
export const viewport = {
  themeColor: "#4f46e5", 
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// UPDATED: Metadata pointing to your manifest file and setting Apple PWA tags
export const metadata = {
  title: "AIT Attendance Tracker",
  description: "Personal AIT College Attendance Dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AIT Tracker",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
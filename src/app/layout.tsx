import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pollen Sales Dashboard",
  description: "Pollen Monthly Sales Tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#efefef]">
        <div className="mx-auto w-full h-[100vh] p-[2vh]">{children}</div>
      </body>
    </html>
  );
}

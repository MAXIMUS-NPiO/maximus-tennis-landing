import "./globals.css";

export const metadata = {
  title: "MAXIMUS GPS — Your Navigation in the World of Tennis",
  description:
    "MAXIMUS GPS — fully carbon tennis racquets, methodology, technology and strategic distribution partnerships.",
  metadataBase: new URL("https://maximus.tennis"),
  openGraph: {
    title: "MAXIMUS GPS",
    description: "Your Navigation in the World of Tennis",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

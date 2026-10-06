import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "造物所 IDEA KIT · 把奇思妙想变成真的",
  description: "从灵感到科技 DIY 作品，浏览、制作与分享你的创意。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

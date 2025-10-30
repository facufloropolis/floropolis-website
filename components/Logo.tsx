import Link from "next/link";
import Image from "next/image";

interface LogoProps {
  variant?: "light" | "dark";
}

export default function Logo({ variant = "light" }: LogoProps) {
  return (
    <Link href="/" className="flex items-center group">
      <div className="relative transition-transform group-hover:scale-105 duration-300">
        <Image
          src="/floropolis-logo-cropped.png"
          alt="Floropolis Logo"
          width={240}
          height={160}
          className="h-20 w-auto object-cover object-center"
          style={{
            filter: variant === "dark" ? "brightness(0) invert(1)" : "none"
          }}
          priority
        />
      </div>
    </Link>
  );
}


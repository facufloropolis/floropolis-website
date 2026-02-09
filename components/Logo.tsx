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
          src="/Floropolis-logo-only.png"
          alt="Floropolis"
          width={180}
          height={50}
          className="h-12 w-auto"
          priority
        />
      </div>
    </Link>
  );
}

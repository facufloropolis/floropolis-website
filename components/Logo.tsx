import Link from "next/link";
import { Flower } from "lucide-react";

interface LogoProps {
  variant?: "light" | "dark";
}

export default function Logo({ variant = "light" }: LogoProps) {
  const textColorClass = variant === "dark" 
    ? "text-white" 
    : "bg-gradient-to-r from-emerald-600 to-emerald-800 bg-clip-text text-transparent";
  
  return (
    <Link href="/" className="flex items-center gap-2 group">
      <div className={`w-10 h-10 bg-gradient-to-br ${variant === "dark" ? "from-emerald-600 to-emerald-800" : "from-emerald-500 to-emerald-700"} rounded-lg flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow`}>
        <Flower className="w-6 h-6 text-white" />
      </div>
      <span className={`text-2xl font-bold ${textColorClass}`}>
        Floropolis
      </span>
    </Link>
  );
}


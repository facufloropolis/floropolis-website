import Link from "next/link";

interface LogoProps {
  variant?: "light" | "dark";
}

export default function Logo({ variant = "light" }: LogoProps) {
  const textColor = variant === "dark" ? "text-white" : "text-slate-900";
  const accentColor = variant === "dark" ? "text-emerald-400" : "text-emerald-600";

  return (
    <Link href="/" className="flex items-center space-x-2 group">
      <div className="relative">
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="transition-transform group-hover:scale-110 duration-300"
        >
          <circle cx="20" cy="12" r="6" className="fill-emerald-500" opacity="0.8" />
          <circle cx="28" cy="20" r="6" className="fill-emerald-500" opacity="0.8" />
          <circle cx="20" cy="28" r="6" className="fill-emerald-500" opacity="0.8" />
          <circle cx="12" cy="20" r="6" className="fill-emerald-500" opacity="0.8" />
          <circle cx="20" cy="20" r="5" className="fill-emerald-600" />
          <circle cx="20" cy="20" r="3" className="fill-yellow-400" />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className={`text-2xl font-bold ${textColor} tracking-tight leading-none`}>
          Floropolis
        </span>
        <span className={`text-xs ${accentColor} tracking-wider font-medium`}>
          FARM DIRECT
        </span>
      </div>
    </Link>
  );
}


import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import {
  LayoutDashboard,
  Settings,
  Globe,
  Activity,
  LogOut,
  Shield,
  Copy,
  Bell,
  Server,
  GitBranch,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/setup", icon: Settings, label: "Wallet Setup" },
  { to: "/services", icon: Globe, label: "Services" },
  { to: "/activity", icon: Activity, label: "Activity" },
  { to: "/settings", icon: Bell, label: "Settings" },
  { to: "/provider", icon: Server, label: "Provider" },
  { to: "/pipelines", icon: GitBranch, label: "Pipelines" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { address, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);

  function copyAddress() {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="flex h-screen bg-bg relative overflow-hidden">
      {/* Background ambient glow matching index.css */}
      <div className="bg-ambient-glow" />

      {/* Floating Sidebar Container */}
      <div className="p-4 md:p-6 pr-0 z-10 hidden md:block">
        <aside className="w-64 h-full rounded-2xl glass border border-border/50 shadow-2xl flex flex-col overflow-hidden relative">

          <div className="p-6 border-b border-border/30 backdrop-blur-md bg-surface/30">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img src="/kova-logo.png" alt="Kova" className="w-10 h-10 rounded-xl shadow-lg ring-1 ring-white/10" />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-success rounded-full ring-2 ring-surface border border-success/30 animate-pulse" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white drop-shadow-sm">Kova</span>
                <p className="text-[10px] text-accent/80 font-medium leading-none mt-0.5 tracking-wide uppercase">
                  Smart Wallet
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all duration-300 relative overflow-hidden ${isActive
                    ? "text-white font-medium"
                    : "text-text-muted hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active Background Glow */}
                    {isActive && (
                      <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-transparent border-l-2 border-accent" />
                    )}

                    {/* Hover effect */}
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-300" />

                    <Icon className={`w-5 h-5 relative z-10 transition-colors duration-300 ${isActive ? "text-accent drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "text-text-muted group-hover:text-accent"}`} />
                    <span className="relative z-10">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-border/30 bg-surface/20">
            <div
              onClick={copyAddress}
              className="flex items-center justify-between px-3 py-2 bg-black/20 rounded-lg text-xs text-text-muted mb-3 font-mono cursor-pointer hover:text-white hover:bg-black/40 border border-white/5 transition-all group"
            >
              <span className="truncate flex-1" title={address || undefined}>{address ? `${address.slice(0, 8)}...${address.slice(-6)}` : "Not connected"}</span>
              <Copy className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
            {copied && (
              <p className="text-[10px] text-success text-center mb-2 font-medium animate-slide-up">Address Copied!</p>
            )}
            <button
              onClick={disconnect}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </aside>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-4 md:px-12 py-8 z-10 relative">
        {children}
      </main>
    </div>
  );
}

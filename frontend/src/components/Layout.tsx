import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import {
  LayoutDashboard,
  Settings,
  Globe,
  Activity,
  LogOut,
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
    <div className="flex h-screen bg-[#030303] text-white relative overflow-hidden font-sans">
      {/* Background ambient glow */}
      <div className="bg-ambient-glow" />

      {/* Floating Sidebar Container */}
      <div className="p-4 md:p-6 pr-0 z-10 hidden md:block">
        <aside className="w-64 h-full rounded-3xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden relative">

          {/* Header / Logo */}
          <div className="p-6 border-b border-white/[0.05]">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img 
                  src="/kova-logo.png" 
                  alt="Kova" 
                  className="w-10 h-10 rounded-xl grayscale contrast-125 brightness-150 shadow-lg border border-white/10" 
                />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full ring-2 ring-[#0A0A0A] border border-emerald-500/50 animate-pulse" />
              </div>
              <div>
                <span className="text-lg font-medium tracking-tight text-white/90">Kova</span>
                <p className="text-[10px] text-white/40 font-mono mt-0.5 tracking-widest uppercase">
                  Agent Node
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-300 relative overflow-hidden border border-transparent ${
                    isActive
                      ? "text-white bg-white/[0.04] border-white/10"
                      : "text-white/40 hover:text-white hover:bg-white/[0.02]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active Left Indicator */}
                    {isActive && (
                      <div className="absolute left-0 top-1/4 bottom-1/4 w-[3px] rounded-r bg-white" />
                    )}

                    <Icon className={`w-4 h-4 transition-colors duration-300 ${isActive ? "text-white" : "text-white/40 group-hover:text-white/80"}`} />
                    <span className="font-light tracking-wide">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Footer / User Controls */}
          <div className="p-4 border-t border-white/[0.05] bg-white/[0.01]">
            <div
              onClick={copyAddress}
              className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-xs text-white/50 mb-3 font-mono cursor-pointer hover:text-white hover:bg-white/[0.05] hover:border-white/10 transition-all group shadow-inner"
            >
              <span className="truncate flex-1" title={address || undefined}>
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}
              </span>
              <Copy className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
            
            {copied && (
              <p className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest text-center mb-3 animate-slide-up">
                Address Copied
              </p>
            )}
            
            <button
              onClick={disconnect}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-mono uppercase tracking-widest text-white/40 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </aside>
      </div>

      {/* Main Content Render Area */}
      <main className="flex-1 overflow-y-auto px-4 md:px-10 py-8 z-10 relative">
        {children}
      </main>
    </div>
  );
}
import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen w-full bg-[#020617] text-[#f8fafc]">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 glass-panel border-r border-white/5 p-6 z-10 flex flex-col">
        <h2 className="text-[#d4af37] text-2xl font-bold mb-8 text-center">Forge Admin</h2>
        <nav className="flex flex-col gap-2">
          <NavLink
            to="/programs"
            className={({ isActive }) =>
              `p-3 rounded-lg font-medium transition-all duration-300 ${
                isActive
                  ? "bg-[#d4af37]/15 text-[#d4af37] border-l-4 border-[#d4af37]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            Programs List
          </NavLink>
          <NavLink
            to="/programs/create"
            className={({ isActive }) =>
              `p-3 rounded-lg font-medium transition-all duration-300 ${
                isActive
                  ? "bg-[#d4af37]/15 text-[#d4af37] border-l-4 border-[#d4af37]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            Onboard Organization
          </NavLink>
          <NavLink
            to="/mappings"
            className={({ isActive }) =>
              `p-3 rounded-lg font-medium transition-all duration-300 ${
                isActive
                  ? "bg-[#d4af37]/15 text-[#d4af37] border-l-4 border-[#d4af37]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            Mappings Simulator
          </NavLink>
          <NavLink
            to="/events"
            className={({ isActive }) =>
              `p-3 rounded-lg font-medium transition-all duration-300 ${
                isActive
                  ? "bg-[#d4af37]/15 text-[#d4af37] border-l-4 border-[#d4af37]"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            Event Dispatcher
          </NavLink>
        </nav>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 overflow-y-auto p-10"
        style={{
          background: "radial-gradient(circle at top right, rgba(212, 175, 55, 0.05) 0%, transparent 40%)",
        }}
      >
        <Outlet />
        {children}
      </div>
    </div>
  );
};

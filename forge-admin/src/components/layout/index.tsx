import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useList } from "@refinedev/core";

const baseSections = [
  {
    title: "Forge",
    links: [
      { to: "/programs", label: "Programs List" },
      { to: "/programs/create", label: "Onboard Organization" },
      { to: "/mappings", label: "Mappings Simulator" },
      { to: "/events", label: "Event Dispatcher" },
      { to: "/setup", label: "Organization Set-up" },
      { to: "/data-portability", label: "Data Portability" },
    ],
  },
  {
    title: "CMS",
    links: [
      { to: "/cms/modules", label: "Modules" },
      { to: "/pos", label: "POS Terminal" },
      { to: "/waiter", label: "Waiter Orders" },
      { to: "/pos/customer", label: "Self-Order" },
      { to: "/pos/display", label: "Display Preview" },
    ],
  },
  {
    title: "Consumer Rights (ADR-0023)",
    links: [
      { to: "/access-requests", label: "Access Requests" },
      { to: "/corrections", label: "Correction Requests" },
      { to: "/consumer-ledger", label: "Consumer Ledger" },
    ],
  },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `p-3 rounded-lg font-medium transition-all duration-300 ${
    isActive
      ? "bg-[#d4af37]/15 text-[#d4af37] border-l-4 border-[#d4af37]"
      : "text-slate-400 hover:bg-white/5 hover:text-white"
  }`;

const NavItem = ({ to, label }: { to: string; label: string }) => (
  <NavLink to={to} className={navClass}>
    {label}
  </NavLink>
);

export const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { result } = useList({
    resource: "cms-modules",
    pagination: { pageSize: 100 },
  });

  const cmsLinks = [
    ...baseSections[1].links,
    ...((result?.data ?? [])
      .filter((module: any) => module.enabled && module.adminUi?.path)
      .map((module: any) => ({ to: module.adminUi.path, label: module.adminUi.navLabel }))
      .filter((link: { to: string }, index: number, links: { to: string }[]) =>
        links.findIndex((candidate) => candidate.to === link.to) === index)),
  ];
  const sections = [
    baseSections[0],
    { ...baseSections[1], links: cmsLinks },
    baseSections[2],
  ];

  return (
    <div className="flex h-screen w-full bg-[#020617] text-[#f8fafc]">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 glass-panel border-r border-white/5 p-6 z-10 flex flex-col">
        <h2 className="text-[#d4af37] text-2xl font-bold mb-8 text-center">Admin</h2>
        <nav className="flex flex-col gap-2 overflow-y-auto pr-1">
          {sections.map((section, index) => (
            <React.Fragment key={section.title}>
              {index > 0 && (
                <div className="mt-6 mb-2 px-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{section.title}</h3>
                </div>
              )}
              {section.links.map((link) => <NavItem key={`${section.title}:${link.to}`} {...link} />)}
            </React.Fragment>
          ))}
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

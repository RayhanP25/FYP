import React from 'react';
import Header from '@/components/header';
import Sidebar from '@/components/sidebar';
import { useGlobalShortcuts } from '@/shortcuts/useGlobalShortcuts';

const AppLayout = (props: { children?: React.ReactNode }) => {
  useGlobalShortcuts();
  return (
    <div className="main h-screen overflow-hidden">
      <Sidebar />
      <div className="ml-64 flex flex-col h-screen">
        <Header />
        <main className="flex-1 min-h-0 p-6 bg-background-main overflow-y-auto no-scrollbar">{props.children}</main>
      </div>
    </div>
  );
};

export default AppLayout;

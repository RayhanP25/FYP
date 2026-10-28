import React from 'react';
import Header from '@/components/header';
import Sidebar from '@/components/sidebar';
import { useGlobalShortcuts } from '@/shortcuts/useGlobalShortcuts';

// fit (default): the page fits the window and its panels scroll inside. page: the whole page scrolls,
// as it used to (the analysis page, where the 3D view uses the mouse wheel for zoom).
const AppLayout = (props: { children?: React.ReactNode; scroll?: 'fit' | 'page' }) => {
  const page = props.scroll === 'page';
  useGlobalShortcuts();
  return (
    <div className={page ? 'main min-h-screen' : 'main h-screen overflow-hidden'}>
      <Sidebar />
      <div className={page ? 'ml-64 flex flex-col min-h-screen' : 'ml-64 flex flex-col h-screen'}>
        <Header />
        <main className={page ? 'flex-1 p-6 bg-background-main overflow-y-auto no-scrollbar' : 'flex-1 min-h-0 p-6 bg-background-main overflow-y-auto no-scrollbar'}>{props.children}</main>
      </div>
    </div>
  );
};

export default AppLayout;

import React from 'react';
import Header from '@/components/header';
import Sidebar from '@/components/sidebar';

const AppLayout = (props: { children?: React.ReactNode }) => {
  return (
    <div className="main min-h-screen">
      <Sidebar />
      <div className="ml-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-6 bg-background-main overflow-y-auto no-scrollbar">{props.children}</main>
      </div>
    </div>
  );
};

export default AppLayout;

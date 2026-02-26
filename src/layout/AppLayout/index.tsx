import React from 'react';
import Header from '@/components/header';
import Modal from '@/components/ui/modal';
import Sidebar from '@/components/sidebar';

const AppLayout = (props: { children?: React.ReactNode }) => {
  return (
    <div className="main bg-gray-50 min-h-screen">
      <Header />
      <div className="flex h-[calc(100vh-64px)]">
        <Sidebar />
        <main className="flex-1 p-6 overflow-y-auto no-scrollbar">{props.children}</main>
      </div>
      <Modal />
    </div>
  );
};

export default AppLayout;

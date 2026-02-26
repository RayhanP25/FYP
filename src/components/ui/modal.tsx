"use client";

import { create } from "zustand";
import { useEffect, useRef } from "react";

interface ModalState {
    isOpen: boolean;
    children: React.ReactNode;
    openModal: ({ children }: { children: React.ReactNode }) => void;
    closeModal: () => void;
}

export const useModalStore = create<ModalState>()((set) => ({
    isOpen: false,
    children: null,
    openModal: ({ children }) => set({ children, isOpen: true }),
    closeModal: () => set({ isOpen: false }),
}));

export default function Modal() {
    const isOpen = useModalStore((state) => state.isOpen);
    const closeModal = useModalStore((state) => state.closeModal);
    const children = useModalStore((state) => state.children);
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        if (isOpen) {
            dialogRef.current?.showModal();
        } else {
            dialogRef.current?.close();
        }
    }, [isOpen]);

    return (
        <dialog
            ref={dialogRef}
            onClose={closeModal}
            className="rounded-lg shadow-xl"
        >
            <div className="fixed inset-0 flex items-center justify-center p-4">
                {children}
            </div>
        </dialog>
    );
}

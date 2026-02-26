import { useModalStore } from '@/components/ui/modal';

export default function TestModal2() {
    const closeModal = useModalStore((state) => state.closeModal);

    const handleAction = () => {
        console.log('Action completed!');
        closeModal();
    };

    return (
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm border-l-4 border-green-500">
            <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div className="ml-3">
                    <h3 className="text-lg font-medium text-gray-900">Success!</h3>
                </div>
            </div>
            <div className="mb-6">
                <p className="text-sm text-gray-600">
                    Your changes have been saved successfully. The operation completed without any errors.
                </p>
            </div>
            <div className="flex gap-3">
                <button
                    onClick={closeModal}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 font-medium transition-colors"
                >
                    Dismiss
                </button>
                <button
                    onClick={handleAction}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium transition-colors"
                >
                    Continue
                </button>
            </div>
        </div>
    );
}

import { useModalStore } from '@/components/ui/modal';

export default function TestModal() {
    const closeModal = useModalStore((state) => state.closeModal);

    const handleDelete = () => {
        console.log('Item deleted!');
        closeModal();
    };

    return (
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
            <h2 className="text-2xl font-bold text-red-600 mb-2">Delete Item?</h2>
            <p className="text-gray-700 mb-6">
                Are you sure you want to delete this item? This action cannot be undone.
            </p>
            <div className="flex gap-4 justify-end">
                <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 font-medium"
                >
                    Cancel
                </button>
                <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium"
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

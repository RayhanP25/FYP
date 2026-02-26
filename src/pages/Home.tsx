import AppLayout from '@/layout/AppLayout';
import TestModal from '@/components/ui/testModal';
import TestModal2 from '@/components/ui/testModal2';
import Button from '@/components/ui/button';
import { useModalStore } from '@/components/ui/modal';

function Home() {
  const openModal = useModalStore((state) => state.openModal);

  const openTestModal = () => openModal({ children: <TestModal /> });
  const openTestModal2 = () => openModal({ children: <TestModal2 /> });

  return (
    <AppLayout>
      <h1 className="text-center">Home Page</h1>
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Button onClick={openTestModal}>
          Open Modal test 1
        </Button>
        <Button variant="success" onClick={openTestModal2}>
          Open Modal test 2
        </Button>
      </div>
    </AppLayout>
  )
}

export default Home

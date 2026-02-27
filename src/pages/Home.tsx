import AppLayout from '@/layout/AppLayout';
import VideoUploadModal from '@/components/Dashboard/videoUploadModal/videoUploadModal';

function Home() {
  return (
    <AppLayout>
      <h1 className="text-center">Home Page</h1>
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <VideoUploadModal />
      </div>
    </AppLayout>
  )
}

export default Home

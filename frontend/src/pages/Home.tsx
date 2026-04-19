import AppLayout from '../layout/AppLayout';
import VideoUploadModal from '../components/Video/videoUploadModal';
import { useState } from 'react';
import Button from '../components/ui/button';

function HomePage() {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const testDatabaseConnection = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/ping`);
      const data = await response.json();

      if (data.success) {
        setMessage('Successfully connected to database!');
      } else {
        setMessage(`Error: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      setMessage(`Connection failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <h1 className="text-center">Home Page</h1>
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <VideoUploadModal />

        <Button
          onClick={testDatabaseConnection}
          disabled={isLoading}
        >
          {isLoading ? 'Testing...' : 'Test Database Connection'}
        </Button>

        {message && (
          <div className="p-4 border rounded bg-background max-w-md">
            <p className="text-sm">{message}</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

export default HomePage

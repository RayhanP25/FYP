// frontend/src/components/StereoCameraView.jsx
import React, { useState } from 'react';
import { api } from '../api/axiosInstance';

const StereoCameraView = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamKey, setStreamKey] = useState(0);

  const backendUrl = api.defaults.baseURL || 'http://localhost:8000';

  const toggleStream = async () => {
    if (isStreaming) {
      await api.post('/api/camera/stop');
      setIsStreaming(false);
      return;
    }
    const { data } = await api.post('/api/camera/start');
    if (data.started) {
      setStreamKey((k) => k + 1);
      setIsStreaming(true);
    }
  };

  const handleStartRecording = async () => {
    try {
      const res = await api.post('/api/obs/start-recording');
      if (!res.data.error) {
        setIsRecording(true);
      }
    } catch (err) {
      console.error('Failed to start OBS recording', err);
    }
  };

  const handleStopRecording = async () => {
    try {
      const res = await api.post('/api/obs/stop-recording');
      if (!res.data.error) {
        setIsRecording(false);
      }
    } catch (err) {
      console.error('Failed to stop OBS recording', err);
    }
  };

  const streamSrc = (side) =>
    `${backendUrl}/api/camera/stream/${side}?t=${streamKey}`;

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col items-center">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">3D Triangulation & Capture View</h2>

      <button
        onClick={toggleStream}
        className="mb-4 px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
      >
        {isStreaming ? 'Stop Webcams' : 'Start Webcams'}
      </button>

      {isStreaming && (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-black rounded-lg shadow-xl overflow-hidden border-4 border-gray-900">
            <p className="text-white text-center py-1 text-sm font-bold">Left</p>
            <img
              src={streamSrc('left')}
              alt="Left webcam"
              className="w-full h-auto object-contain"
            />
          </div>
          <div className="bg-black rounded-lg shadow-xl overflow-hidden border-4 border-gray-900">
            <p className="text-white text-center py-1 text-sm font-bold">Right</p>
            <img
              src={streamSrc('right')}
              alt="Right webcam"
              className="w-full h-auto object-contain"
            />
          </div>
        </div>
      )}

      <div className="flex gap-6">
        <button
          onClick={handleStartRecording}
          disabled={isRecording || !isStreaming}
          className={`px-8 py-4 rounded-lg font-bold text-lg text-white transition-all shadow-md ${
            isRecording || !isStreaming
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 hover:scale-105'
          }`}
        >
          {isRecording ? 'Recording...' : 'Start OBS Record'}
        </button>

        <button
          onClick={handleStopRecording}
          disabled={!isRecording}
          className={`px-8 py-4 rounded-lg font-bold text-lg text-white transition-all shadow-md ${
            !isRecording
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-700 hover:scale-105'
          }`}
        >
          Stop & Upload
        </button>
      </div>
    </div>
  );
};

export default StereoCameraView;

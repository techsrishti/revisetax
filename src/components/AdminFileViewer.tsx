import { useState, useEffect } from 'react';

interface AdminFileViewerProps {
  fileId: string;
  fileName: string;
  mimeType: string;
}

export default function AdminFileViewer({ fileId, fileName, mimeType }: AdminFileViewerProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch signed URL
  const fetchSignedUrl = async () => {
    try {
      const response = await fetch('/api/admin/file-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
      });
      const data = await response.json();
      
      if (data.success && data.url) {
        setFileUrl(data.url);
        setError(null);
      } else {
        console.error('Failed to get file URL:', data.error);
        setError('Failed to access file. Please try refreshing the page.');
      }
    } catch (error) {
      console.error('Error fetching file URL:', error);
      setError('Error accessing file. Please try refreshing the page.');
    }
  };

  // Fetch URL initially
  useEffect(() => {
    fetchSignedUrl();
  }, []);

  // Refresh URL every 11 hours to ensure continuous access
  useEffect(() => {
    const interval = setInterval(fetchSignedUrl, 11 * 60 * 60 * 1000); // 11 hours in milliseconds
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="p-4 text-red-600">
        {error}
        <button 
          onClick={fetchSignedUrl}
          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!fileUrl) {
    return <div>Loading...</div>;
  }

  if (mimeType === 'application/pdf') {
    return (
      <div>
        <iframe
          src={fileUrl}
          title={fileName}
          className="w-full h-screen border-0"
          style={{ minHeight: '800px' }}
          onError={(e) => {
            console.error('PDF loading error:', e);
            setError('Failed to load PDF. Please try refreshing the page.');
          }}
        />
        <button 
          onClick={fetchSignedUrl}
          className="fixed bottom-4 right-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh Access
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <a
        href={fileUrl}
        download={fileName}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Download {fileName}
      </a>
      <button 
        onClick={fetchSignedUrl}
        className="ml-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Refresh Access
      </button>
    </div>
  );
} 
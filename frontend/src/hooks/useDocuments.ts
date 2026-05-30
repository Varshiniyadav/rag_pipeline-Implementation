import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import { useChatStore } from '../stores/chatStore';
import { DocumentListResponse } from '../types';

export const useDocuments = () => {
  const { documents, setDocuments } = useChatStore();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Track dynamic polling timer
  const pollTimerRef = useRef<any>(null);

  const fetchDocuments = async () => {
    try {
      setError(null);
      const response = await apiClient.get<DocumentListResponse>('/documents');
      setDocuments(response.data.documents);
    } catch (err: any) {
      console.error('Error fetching documents:', err);
      setError(err.response?.data?.detail || 'Failed to fetch documents list');
    }
  };

  const uploadDocument = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      await apiClient.post('/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });
      
      // Immediately reload list to show the newly added processing document
      await fetchDocuments();
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError(err.response?.data?.detail || 'Failed to upload document.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const deleteDocument = async (docId: string) => {
    try {
      setError(null);
      await apiClient.delete(`/documents/${docId}`);
      // Reload list
      await fetchDocuments();
      
      // Remove from selected list if it was selected
      const selected = useChatStore.getState().selectedDocumentIds;
      if (selected.includes(docId)) {
        useChatStore.getState().toggleDocumentSelection(docId);
      }
    } catch (err: any) {
      console.error('Error deleting document:', err);
      setError(err.response?.data?.detail || 'Failed to delete document.');
    }
  };

  // Start polling if there are any documents currently processing
  useEffect(() => {
    const hasActiveProcessing = documents.some(
      (doc) => !['indexed', 'failed'].includes(doc.status)
    );

    if (hasActiveProcessing) {
      if (!pollTimerRef.current) {
        loggerPollStart();
        pollTimerRef.current = setInterval(async () => {
          await fetchDocuments();
        }, 3000);
      }
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [documents]);

  const loggerPollStart = () => {
    console.log('🔄 Documents indexing in progress, starting status poll...');
  };

  return {
    documents,
    isUploading,
    uploadProgress,
    error,
    fetchDocuments,
    uploadDocument,
    deleteDocument,
  };
};

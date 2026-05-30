import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, AlertCircle, RefreshCw } from 'lucide-react';
import { useDocuments } from '../hooks/useDocuments';

export const FileUploadZone: React.FC = () => {
  const { uploadDocument, isUploading, uploadProgress, error } = useDocuments();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      uploadDocument(acceptedFiles[0]);
    }
  }, [uploadDocument]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: isUploading,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: false,
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`p-5 rounded-xl border border-dashed text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-950/10 scale-[0.99]'
            : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/70'
        } ${isUploading ? 'opacity-80 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        
        {isUploading ? (
          <div className="flex flex-col items-center justify-center py-2">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
            <h4 className="text-xs font-bold text-slate-200 mb-1">Indexing Document...</h4>
            
            {uploadProgress > 0 && uploadProgress < 100 ? (
              <div className="w-full max-w-[150px] mt-1.5">
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="text-[9px] font-bold text-slate-400 mt-1 block">Uploading: {uploadProgress}%</span>
              </div>
            ) : (
              <p className="text-[10px] text-indigo-400/80 animate-pulse mt-1">Processing document (Parse & Embed)...</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-2">
            <UploadCloud className={`w-8 h-8 mb-2 transition-colors ${isDragActive ? 'text-indigo-400' : 'text-slate-400'}`} />
            <h4 className="text-xs font-bold text-slate-200">Drag & Drop File</h4>
            <p className="text-[10px] text-slate-400 mt-1">PDF, DOCX, or TXT up to 50MB</p>
          </div>
        )}
      </div>

      {/* Error Output */}
      {error && (
        <div className="mt-3 p-3 rounded-lg border border-red-900/50 bg-red-950/20 text-red-300 text-xs flex items-start space-x-2 animate-stream">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
          <span className="leading-normal">{error}</span>
        </div>
      )}
    </div>
  );
};

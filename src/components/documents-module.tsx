'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  FolderPlus, 
  Upload, 
  Folder, 
  FileText, 
  ArrowLeft, 
  Download,
  Trash2,
  Edit2,
  Check,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { interLocal, cabinetGrotesk } from '@/app/fonts';
import styles from './documents-module.module.css';
import { v4 as uuidv4 } from 'uuid';

interface FolderItem {
  name: string;
  id: string;
  created_at: string;
  updated_at: string;
  path: string;
}

interface FileItem {
  name: string;
  id: string;
  created_at: string;
  updated_at: string;
  metadata: {
    size: number;
    mimetype: string;
  };
  path: string;
  storageName?: string; // Add storage name for database integration
}

interface StorageItem {
  name: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  };
  created_at?: string;
  updated_at?: string;
}

// Database types for API responses
interface DbFolder {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface DbFile {
  id: string;
  originalName: string;
  storageName: string;
  size: string; // BigInt comes as string from API
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  folderId: string;
}

export default function Documents() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [currentFolderName, setCurrentFolderName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isPastFilingsView, setIsPastFilingsView] = useState(false);
  const [folderFileCounts, setFolderFileCounts] = useState<{[key: string]: number}>({});
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string, name: string, type: 'file' | 'folder', fileCount?: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const fetchData = async () => {
    try {
      setIsFetchingData(true);

      // Fetch folders from database
      const folderResponse = await fetch('/api/folders');
      if (!folderResponse.ok) {
        if (folderResponse.status === 404) {
           setFolders([]);
          setFiles([]);
          setIsFetchingData(false);
          return;
        }
        console.error('Error fetching folders from database');
        return;
      }
      
      const dbFolders: DbFolder[] = await folderResponse.json();
      
       const fetchedFolders: FolderItem[] = dbFolders.map(folder => ({
        name: folder.name,
        id: folder.id,
        created_at: folder.createdAt,
        updated_at: folder.updatedAt,
        path: ''  
      }));

      // Fetch files from database for current folder
      let fetchedFiles: FileItem[] = [];

      if (currentPath) {
        // Find the current folder by name (for backward compatibility)
        const pathParts = currentPath.split('/').filter(Boolean);
        const currentFolderName = pathParts[pathParts.length - 1];
        const currentFolder = dbFolders.find(f => f.name === currentFolderName);
        
        if (currentFolder) {
          // Fetch files for this folder
          const filesResponse = await fetch(`/api/files?folderId=${currentFolder.id}`);
          if (filesResponse.ok) {
            const dbFiles: DbFile[] = await filesResponse.json();
            
            fetchedFiles = dbFiles.map(file => ({
              name: file.originalName,
              id: file.id,
              created_at: file.createdAt,
              updated_at: file.updatedAt,
              metadata: {
                size: parseInt(file.size),
                mimetype: file.mimeType
              },
              path: currentPath,
              storageName: file.storageName
            }));
          }
        }
      } else {
        // At root level, get file counts for each folder
        const counts: {[key: string]: number} = {};
        for (const folder of dbFolders) {
          const filesResponse = await fetch(`/api/files?folderId=${folder.id}`);
          if (filesResponse.ok) {
            const folderFiles: DbFile[] = await filesResponse.json();
            counts[folder.name] = folderFiles.length;
          } else {
            counts[folder.name] = 0;
          }
        }
        setFolderFileCounts(counts);
      }

      // Update state
      setFolders(fetchedFolders);
      setFiles(fetchedFiles);
      
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsFetchingData(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPath]);

  const getCurrentFolderContents = () => {
 
    if (currentPath === '') {
      return { currentFolders: folders, currentFiles: [] };
    } else {
      return { currentFolders: [], currentFiles: files };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name');
      return;
    }

    try {
      setIsLoading(true);
      
       const response = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newFolderName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to create folder');
        return;
      }

      // Refresh data from database after successful creation
      await fetchData();
      
      toast.success('Folder created successfully', {
        icon: <Check className="w-4 h-4" style={{ color: '#E9420C' }} />
      });
      setNewFolderName('');
      setShowCreateFolderModal(false);
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Failed to create folder. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    try {
      setIsLoading(true);
      
      // Get the current folder's database ID if we're inside a folder
      let currentFolderId: string | null = null;
      if (currentPath) {
        const pathParts = currentPath.split('/').filter(Boolean);
        const currentFolderName = pathParts[pathParts.length - 1];
        
        if (currentFolderName) {
          // Fetch folders from database to get the correct folder ID
          const folderResponse = await fetch('/api/folders');
          if (folderResponse.ok) {
            const dbFolders = await folderResponse.json();
            const dbFolder = dbFolders.find((f: DbFolder) => f.name === currentFolderName);
            if (dbFolder) {
              currentFolderId = dbFolder.id;
            }
          }
        }
      }

      if (!currentFolderId) {
        toast.error('Please select or create a folder first');
        return;
      }

      const successfullyUploadedFiles: FileItem[] = [];

      for (const file of Array.from(uploadedFiles)) {
        try {
          // Create a FormData object to send the file to the new upload endpoint
          const formData = new FormData();
          formData.append('file', file);
          formData.append('folderId', currentFolderId);
          
          // Use the files endpoint for upload
          const uploadResponse = await fetch('/api/files', {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            toast.error(`Failed to upload ${file.name}: ${errorData.error || 'Upload error'}`);
            continue;
          }

          const fileData = await uploadResponse.json();
          successfullyUploadedFiles.push({
            name: fileData.originalName,
            id: fileData.id,
            created_at: fileData.createdAt,
            updated_at: fileData.updatedAt,
            metadata: {
              size: parseInt(fileData.size),
              mimetype: fileData.mimeType
            },
            path: currentPath,
            storageName: fileData.storageName
          });
        } catch (fileError) {
          console.error(`Error processing file ${file.name}:`, fileError);
          toast.error(`Failed to upload ${file.name}`);
        }
      }

      // Refresh data from database and show success message
      if (successfullyUploadedFiles.length > 0) {
        await fetchData();
        
        if (successfullyUploadedFiles.length === uploadedFiles.length) {
          toast.success('All files uploaded successfully', {
            icon: <Check className="w-4 h-4" style={{ color: '#E9420C' }} />
          });
        } else {
          toast.success(`${successfullyUploadedFiles.length} of ${uploadedFiles.length} files uploaded successfully`, {
            icon: <Check className="w-4 h-4" style={{ color: '#E9420C' }} />
          });
        }
      } else {
        toast.error('No files were uploaded successfully');
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error('Failed to upload files. Please try again.');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      // Use the files endpoint with fileId query parameter for download
      const downloadResponse = await fetch(`/api/files?fileId=${encodeURIComponent(file.id)}`);

      if (!downloadResponse.ok) {
        const errorData = await downloadResponse.json();
        toast.error(errorData.error || 'Failed to download file');
        return;
      }

      // Get the file blob from the response
      const blob = await downloadResponse.blob();
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name; // Use display name for download
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('File downloaded successfully', {
        icon: <Check className="w-4 h-4" style={{ color: '#E9420C' }} />
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  const handleDelete = async (id: string, type: 'file' | 'folder') => {
    try {
      setIsDeleting(true);

      if (type === 'file') {
        // Delete file using API route (server handles both DB and storage cleanup)
        const deleteResponse = await fetch(`/api/files?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        
        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json();
          console.error('Failed to delete file:', errorData);
          toast.error('Failed to delete file');
          return;
        }
      } else {
        // Delete folder using API route (server handles both DB and storage cleanup)
        const deleteFolderResponse = await fetch(`/api/folders?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        
        if (!deleteFolderResponse.ok) {
          const errorData = await deleteFolderResponse.json();
          console.error('Failed to delete folder:', errorData);
          toast.error(errorData.error || 'Failed to delete folder');
          return;
        }
      }
      
      // Refresh data from database
      await fetchData();
      
      toast.success(`${type === 'file' ? 'File' : 'Folder'} deleted successfully`, {
        icon: <Check className="w-4 h-4" style={{ color: '#E9420C' }} />
      });
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error(`Failed to delete ${type}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRename = async (id: string, newName: string) => {
    if (!newName.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    try {
      setIsRenaming(true);
      
      // Update file using API route (server handles any necessary storage operations)
      const updateResponse = await fetch('/api/files', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: id,
          originalName: newName,
        }),
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        console.error('Failed to rename file:', errorData);
        toast.error('Failed to rename file');
        return;
      }

      // Refresh data from database
      await fetchData();

      toast.success('File renamed successfully', {
        icon: <Check className="w-4 h-4" style={{ color: '#E9420C' }} />
      });
      setEditingFile(null);
      setEditFileName('');
    } catch (error) {
      console.error('Error renaming:', error);
      toast.error('Failed to rename file');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleFolderClick = (folder: FolderItem) => {
    // Use folder name for path (keeping backward compatibility)
    const newPath = folder.name + '/';
    setCurrentPath(newPath);
    setCurrentFolderName(folder.name);
  };

  const handleBackClick = () => {
    const pathParts = currentPath.split('/').filter(Boolean);
    pathParts.pop();
    const newPath = pathParts.length > 0 ? pathParts.join('/') + '/' : '';
    setCurrentPath(newPath);
    
    if (pathParts.length > 0) {
      setCurrentFolderName(pathParts[pathParts.length - 1]);
    } else {
      setCurrentFolderName('');
    }
  };

  const getFolderFileCount = (folder: FolderItem) => {
    return folderFileCounts[folder.name] || 0;
  };

  const { currentFolders, currentFiles } = getCurrentFolderContents();

  return (
    <>
      <div className={`${styles.container} ${interLocal.variable} ${cabinetGrotesk.variable}`}>
        <div className={styles.mainWrapper}>
          {/* Access Past Filings Section - Only show on root level */}
          {!currentPath && !isPastFilingsView && (
            <div 
              className={`${styles.accessPastFilings} hover:shadow-md`}
              onClick={() => setIsPastFilingsView(true)}
            >
              <div className={styles.accessFilingsContent}>
                <div className={styles.accessFilingsIcon}>
                  <img src="/file-check-02.svg" alt="File Check" />
                </div>
                <div className={styles.accessFilingsInfo}>
                  <h3 className={styles.accessFilingsTitle}>Access Past Filings</h3>
                  <p className={styles.accessFilingsDescription}>
                    This is a default folder for past filings automatically uploaded by ReviseTax.
                  </p>
                </div>
                <img src="/chevron-right.svg" alt="Chevron Right" className={styles.chevronIcon} />
              </div>
            </div>
          )}

          {/* Past Filings View */}
          {isPastFilingsView && (
            <div className={styles.pastFilingsView}>
              <div className={styles.pastFilingsHeader}>
                <div className={styles.pastFilingsHeaderContent}>
                  <div className={styles.headerLeft}>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setIsPastFilingsView(false);
                        setCurrentPath('');
                        setCurrentFolderName('');
                      }}
                      className={styles.backButton}
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <h2 className={styles.pastFilingsTitle}>Past Filings</h2>
                  </div>
                </div>
                <p className={styles.pastFilingsSubtitle}>
                  This is a default folder for past filings automatically uploaded by ReviseTax.
                </p>
              </div>

              <div className="w-full flex-1">
                <div className={styles.filesList}>
                  <div className={styles.emptyState}>
                    <Folder className={styles.emptyIcon} />
                    <p className={styles.emptyTitle}>No past filings yet</p>
                    <p className={styles.emptyDescription}>
                      Past filings will appear here when automatically uploaded by ReviseTax
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Your Documents - Full Page Layout */}
          {!isPastFilingsView && (
            <div className={`${styles.documentsView} ${!currentPath ? styles.withMarginTop : styles.noMarginTop}`}>
              <div className={styles.documentsHeader}>
                <div className={styles.documentsHeaderContent}>
                  <div className={styles.headerLeft}>
                    {currentPath && (
                      <Button
                        variant="ghost"
                        onClick={handleBackClick}
                        className={styles.backButton}
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                    )}
                    <h2 className={styles.documentsTitle}>
                      {currentPath ? currentFolderName : 'Your Documents'}
                    </h2>
                  </div>
                  <div className={styles.headerActions}>
             
                    
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateFolderModal(true)}
                      disabled={isLoading}
                      className={`${styles.newFolderButton} border-gray-300 text-gray-700 hover:bg-gray-50`}
                    >
                      <FolderPlus className="w-4 h-4" />
                      <span className={styles.newFolderButtonText}>New Folder</span>
                    </Button>
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading}
                      className={`${styles.uploadButton} bg-orange-600 hover:bg-orange-700 text-white`}
                    >
                      {isLoading ? (
                        <div className={styles.buttonSpinner} />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      <span className={styles.uploadButtonText}>
                        {isLoading ? 'Uploading...' : 'Upload'}
                      </span>
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      accept="*/*"
                    />
                  </div>
                </div>
              </div>

              <div className={styles.mainContent}>
                {isFetchingData ? (
                  <div className={styles.loadingContainer}>
                    <div className={styles.loadingSpinner} />
                    <p className={styles.loadingText}>Loading documents...</p>
                  </div>
                ) : (
                  <div className={styles.filesList}>
                    {currentFolders.map((folder) => {
                      const itemCount = getFolderFileCount(folder);
                      return (
                        <div
                          key={folder.id}
                          className={`${styles.folderItem} hover:bg-gray-50 transition-colors group`}
                        >
                          <div 
                            className={styles.folderLeft}
                            onClick={() => handleFolderClick(folder)}
                          >
                            <Folder className={styles.folderIcon} />
                            <div className={styles.folderContent}>
                              <span className={styles.folderName}>{folder.name}</span>
                            </div>
                          </div>
                          <div className={styles.folderRight}>
                            <span className={`${styles.folderCount} group-hover:opacity-0 transition-opacity`}>
                              {itemCount === 0 ? 'Empty Folder' : `${itemCount} file${itemCount !== 1 ? 's' : ''}`}
                            </span>
                            
                            <div className={`${styles.folderActions} opacity-0 group-hover:opacity-100 transition-opacity`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm({id: folder.id, name: folder.name, type: 'folder', fileCount: getFolderFileCount(folder)})}
                                className={styles.actionButton}
                              >
                                <Trash2 className="w-4 h-4" style={{ color: '#000000' }} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {currentFiles.map((file) => (
                      <div
                        key={file.id}
                        className={`${styles.fileItem} hover:bg-gray-50 transition-colors group`}
                      >
                        <div className={styles.fileLeft}>
                          <FileText className={styles.fileIcon} />
                          <div className={styles.fileContent}>
                            {editingFile === file.id ? (
                              <div className={styles.renameContainer}>
                                <Input
                                  value={editFileName}
                                  onChange={(e) => setEditFileName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleRename(file.id, editFileName);
                                    } else if (e.key === 'Escape') {
                                      setEditingFile(null);
                                      setEditFileName('');
                                    }
                                  }}
                                  className={styles.renameInput}
                                  autoFocus
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRename(file.id, editFileName)}
                                  disabled={isRenaming || !editFileName.trim()}
                                  className={styles.saveButton}
                                >
                                  {isRenaming ? (
                                    <div className={styles.saveButtonSpinner} />
                                  ) : (
                                    <Check className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingFile(null);
                                    setEditFileName('');
                                  }}
                                  disabled={isRenaming}
                                  className={styles.cancelButton}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <span className={styles.fileName}>{file.name}</span>
                            )}
                          </div>
                        </div>
                        <div className={styles.fileRight}>
                          <span className={`${styles.fileDate} group-hover:opacity-0 transition-opacity`}>
                            Uploaded on {formatDate(file.updated_at)}
                          </span>
                          
                          <div className={`${styles.fileActions} opacity-0 group-hover:opacity-100 transition-opacity`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(file)}
                              className={styles.actionButton}
                            >
                              <Download className="w-4 h-4" style={{ color: '#000000' }} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingFile(file.id);
                                setEditFileName(file.name);
                              }}
                              className={styles.actionButton}
                            >
                              <Edit2 className="w-4 h-4" style={{ color: '#000000' }} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm({id: file.id, name: file.name, type: 'file'})}
                              className={styles.actionButton}
                            >
                              <Trash2 className="w-4 h-4" style={{ color: '#000000' }} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {currentFolders.length === 0 && currentFiles.length === 0 && (
                      <div className="text-center py-12">
                        <Folder className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">
                          {currentPath ? 'This folder is empty' : 'No documents yet'}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {currentPath ? 'Upload files to this folder' : 'Create a folder or upload files to get started'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Create New Folder Modal */}
        <Dialog open={showCreateFolderModal} onOpenChange={setShowCreateFolderModal}>
          <DialogContent className={styles.modalContent}>
            <DialogHeader className={styles.modalHeader}>
              <DialogTitle className={styles.modalTitle}>Create New Folder</DialogTitle>
            </DialogHeader>
            <div className={styles.modalBody}>
              <div className={styles.inputGroup}>
                <label htmlFor="folder-name" className={styles.inputLabel}>Folder Name</label>
                <Input
                  id="folder-name"
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      createFolder();
                    }
                  }}
                  className={styles.modalInput}
                  autoFocus
                />
              </div>
              <div className={styles.modalActions}>
                <Button
                  onClick={createFolder}
                  disabled={isLoading || !newFolderName.trim()}
                  className={styles.primaryButton}
                >
                  {isLoading && <div className={styles.buttonSpinner} />}
                  <span className={styles.primaryButtonText}>
                    {isLoading ? 'Creating...' : 'Create Folder'}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateFolderModal(false);
                    setNewFolderName('');
                  }}
                  className={styles.secondaryButton}
                >
                  <span className={styles.secondaryButtonText}>Cancel</span>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className={styles.modalContent}>
            <DialogHeader className={styles.modalHeader}>
              <DialogTitle className={styles.modalTitle}>
                Delete {deleteConfirm?.type === 'file' ? 'File' : 'Folder'}
              </DialogTitle>
              <p className={styles.deleteDialogDescription}>
                {deleteConfirm?.type === 'folder' && typeof deleteConfirm?.fileCount === 'number' && deleteConfirm.fileCount > 0 ? (
                  <>
                    This folder cannot be deleted since there are files inside this folder. 
                    Empty this folder completely to delete this folder.
                  </>
                ) : (
                  <>
                    Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
                  </>
                )}
              </p>
            </DialogHeader>
            <div className={styles.modalBody}>
              <div className={styles.modalActions}>
                <Button
                  onClick={() => deleteConfirm && handleDelete(deleteConfirm.id, deleteConfirm.type)}
                  disabled={isDeleting || (deleteConfirm?.type === 'folder' && typeof deleteConfirm?.fileCount === 'number' && deleteConfirm.fileCount > 0)}
                  className={styles.primaryButton}
                >
                  {isDeleting && <div className={styles.buttonSpinner} />}
                  <span className={styles.primaryButtonText}>
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                  className={styles.secondaryButton}
                >
                  <span className={styles.secondaryButtonText}>Cancel</span>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Toaster />
    </>
  );
} 
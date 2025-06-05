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
import { inter, grotesk } from '@/lib/fonts';
import styles from './documents.module.css';

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
}

export default function Documents() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [currentFolderName, setCurrentFolderName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isPastFilingsView, setIsPastFilingsView] = useState(false);
  const [folderFileCounts, setFolderFileCounts] = useState<{[key: string]: number}>({});
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string, name: string, type: 'file' | 'folder'} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const fetchData = async () => {
    try {
      setIsFetchingData(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setIsFetchingData(false);
        return;
      }

      const { data: fileList, error: filesError } = await supabase
        .storage
        .from('documents')
        .list(`${user.id}/${currentPath}`, {
          limit: 100,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (filesError) {
        console.error('Error fetching files:', filesError);
        return;
      }

      if (!fileList) return;

      const fetchedFolders: FolderItem[] = [];
      const fetchedFiles: FileItem[] = [];

      for (const item of fileList) {
        if (item.name.endsWith('.folder_marker')) {
          const folderName = item.name.replace('.folder_marker', '');
          if (folderName) {
            fetchedFolders.push({
              name: folderName,
              id: `${user.id}-${currentPath}${folderName}`,
              created_at: item.created_at || new Date().toISOString(),
              updated_at: item.updated_at || new Date().toISOString(),
              path: currentPath
            });
          }
        } else if (!item.name.startsWith('.') && item.metadata) {
          fetchedFiles.push({
            name: item.name,
            id: `${user.id}-${currentPath}${item.name}`,
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.updated_at || new Date().toISOString(),
            metadata: {
              size: item.metadata?.size || 0,
              mimetype: item.metadata?.mimetype || 'application/octet-stream'
            },
            path: currentPath
          });
        }
      }

      // Update folder file counts for root level
      if (currentPath === '') {
        const counts: {[key: string]: number} = {};
        for (const folder of fetchedFolders) {
          const { data: folderFiles } = await supabase
            .storage
            .from('documents')
            .list(`${user.id}/${folder.name}/`, { limit: 1000 });
          
          const fileCount = folderFiles ? folderFiles.filter(item => 
            !item.name.startsWith('.') && 
            !item.name.endsWith('.folder_marker') && 
            item.metadata
          ).length : 0;
          
          counts[folder.name] = fileCount;
        }
        setFolderFileCounts(counts);
      }

      setFolders(prev => [
        ...prev.filter(f => f.path !== currentPath),
        ...fetchedFolders
      ]);

      setFiles(prev => [
        ...prev.filter(f => f.path !== currentPath),
        ...fetchedFiles
      ]);
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
    const currentFolders = folders.filter(folder => folder.path === currentPath);
    const currentFiles = files.filter(file => file.path === currentPath);
    return { currentFolders, currentFiles };
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
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please sign in to create folders');
        return;
      }

      const now = new Date().toISOString();
      const newFolder: FolderItem = {
        name: newFolderName,
        id: `${user.id}-${currentPath}${newFolderName}`,
        created_at: now,
        updated_at: now,
        path: currentPath
      };

      const folderMarkerPath = `${user.id}/${currentPath}${newFolderName}.folder_marker`;
      const { error } = await supabase
        .storage
        .from('documents')
        .upload(folderMarkerPath, new Blob([''], { type: 'text/plain' }), {
          upsert: true
        });

      if (error) {
        console.error('Error creating folder marker:', error);
        toast.error('Failed to create folder');
        return;
      }

      setFolders(prev => [...prev, newFolder]);
      toast.success('Folder created successfully');
      setNewFolderName('');
      setShowCreateFolderModal(false);
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Failed to create folder');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please sign in to upload files');
        return;
      }

      const now = new Date().toISOString();
      const newFiles: FileItem[] = [];

      for (const file of Array.from(uploadedFiles)) {
        const filePath = `${user.id}/${currentPath}${file.name}`;
        
        const { error } = await supabase
          .storage
          .from('documents')
          .upload(filePath, file, { upsert: true });

        if (error) {
          console.error('Error uploading file:', error);
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }

        newFiles.push({
          name: file.name,
          id: `${user.id}-${currentPath}${file.name}`,
          created_at: now,
          updated_at: now,
          metadata: {
            size: file.size,
            mimetype: file.type
          },
          path: currentPath
        });
      }

      setFiles(prev => [...prev, ...newFiles]);
      
      // Update folder file counts
      if (currentPath) {
        const pathParts = currentPath.split('/').filter(Boolean);
        const currentFolderName = pathParts[pathParts.length - 1];
        if (currentFolderName) {
          setFolderFileCounts(prev => ({
            ...prev,
            [currentFolderName]: (prev[currentFolderName] || 0) + newFiles.length
          }));
        }
      }

      toast.success('Files uploaded successfully');
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error('Failed to upload files');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please sign in to download files');
        return;
      }

      const filePath = `${user.id}/${file.path}${file.name}`;
      const { data, error } = await supabase
        .storage
        .from('documents')
        .download(filePath);

      if (error) {
        throw error;
      }

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('File downloaded successfully');
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  const handleDelete = async (id: string, type: 'file' | 'folder') => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Please sign in to delete items');
        return;
      }

      if (type === 'file') {
        const file = files.find(f => f.id === id);
        if (file) {
          const filePath = `${user.id}/${file.path}${file.name}`;
          const { error } = await supabase
            .storage
            .from('documents')
            .remove([filePath]);
          
          if (error) throw error;
        }
        
        setFiles(prev => prev.filter(f => f.id !== id));
        toast.success('File deleted successfully');
      } else {
        const folder = folders.find(f => f.id === id);
        if (folder) {
          const folderPath = `${user.id}/${folder.path}${folder.name}/`;
          
          // List and delete all files in the folder
          const { data: folderContents } = await supabase
            .storage
            .from('documents')
            .list(folderPath, { limit: 1000 });

          if (folderContents && folderContents.length > 0) {
            const filesToDelete = folderContents
              .filter(item => !item.name.endsWith('.folder_marker'))
              .map(item => `${folderPath}${item.name}`);
            
            if (filesToDelete.length > 0) {
              await supabase.storage.from('documents').remove(filesToDelete);
            }
          }

          // Delete the folder marker
          await supabase
            .storage
            .from('documents')
            .remove([`${folderPath}.folder_marker`]);
        }
        
        setFolders(prev => prev.filter(f => f.id !== id));
        
        // Remove files from this folder from local state
        const deletedFolder = folders.find(f => f.id === id);
        if (deletedFolder) {
          const folderPath = deletedFolder.path + deletedFolder.name + '/';
          setFiles(prev => prev.filter(f => !f.path.startsWith(folderPath)));
          setFolderFileCounts(prev => {
            const updated = { ...prev };
            delete updated[deletedFolder.name];
            return updated;
          });
        }
        
        toast.success('Folder deleted successfully');
      }
      
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error(`Failed to delete ${type}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = async (id: string, newName: string) => {
    if (!newName.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please sign in to rename files');
        return;
      }

      const file = files.find(f => f.id === id);
      if (!file) {
        toast.error('File not found');
        return;
      }

      const oldFilePath = `${user.id}/${file.path}${file.name}`;
      const newFilePath = `${user.id}/${file.path}${newName}`;

      // Download the file, upload with new name, then delete old
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('documents')
        .download(oldFilePath);

      if (downloadError) throw downloadError;

      const { error: uploadError } = await supabase
        .storage
        .from('documents')
        .upload(newFilePath, fileData, { upsert: true });

      if (uploadError) throw uploadError;

      await supabase.storage.from('documents').remove([oldFilePath]);

      setFiles(prev => prev.map(file => 
        file.id === id 
          ? { ...file, name: newName, updated_at: new Date().toISOString() }
          : file
      ));

      toast.success('File renamed successfully');
      setEditingFile(null);
      setEditFileName('');
    } catch (error) {
      console.error('Error renaming:', error);
      toast.error('Failed to rename file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFolderClick = (folder: FolderItem) => {
    const newPath = folder.path + folder.name + '/';
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
      <div className={`${styles.container} ${inter.variable} ${grotesk.variable}`}>
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
                                onClick={() => setDeleteConfirm({id: folder.id, name: folder.name, type: 'folder'})}
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
                                  disabled={isLoading || !editFileName.trim()}
                                  className={styles.saveButton}
                                >
                                  {isLoading ? (
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
                                  disabled={isLoading}
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
                Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
              </p>
            </DialogHeader>
            <div className={styles.modalBody}>
              <div className={styles.modalActions}>
                <Button
                  onClick={() => deleteConfirm && handleDelete(deleteConfirm.id, deleteConfirm.type)}
                  disabled={isLoading}
                  className={styles.primaryButton}
                >
                  <span className={styles.primaryButtonText}>Delete</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirm(null)}
                  className={styles.secondaryButton}
                >
                  <span className={styles.secondaryButtonText}>Cancel</span>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
} 
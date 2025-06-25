"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, FileText, Folder, X, Paperclip } from "lucide-react"
import styles from "./chat-module.module.css"
interface FileUpload {
  id: string
  file: File
  uploading: boolean
  progress: number
  error?: string
}

interface Folder {
  id: string
  name: string
  fileCount: number
  createdAt: string
}

interface UserFile {
  id: string
  originalName: string
  size: string
  mimeType: string
  createdAt: string
  folderId: string
}

interface ChatAttachmentsProps {
  selectedChatId: string
  socket: any
  onFilesSent?: () => void
}

export default function ChatAttachments({ selectedChatId, socket, onFilesSent }: ChatAttachmentsProps) {
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false)
  const [fileUploads, setFileUploads] = useState<FileUpload[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [userFiles, setUserFiles] = useState<UserFile[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string>('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isLoadingFolders, setIsLoadingFolders] = useState(false)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [selectedExistingFiles, setSelectedExistingFiles] = useState<string[]>([])
  const [isSendingFiles, setIsSendingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch folders from API
  const fetchFolders = async () => {
    setIsLoadingFolders(true)
    try {
      const response = await fetch('/api/folders')
      if (response.ok) {
        const data = await response.json()
        setFolders(data)
      }
    } catch (error) {
      console.error('Error fetching folders:', error)
    } finally {
      setIsLoadingFolders(false)
    }
  }

  // Fetch user files from API
  const fetchUserFiles = async () => {
    setIsLoadingFiles(true)
    try {
      const response = await fetch('/api/files')
      if (response.ok) {
        const allFiles = await response.json()
        setUserFiles(allFiles)
      } else {
        console.error('Error fetching files:', await response.text())
      }
    } catch (error) {
      console.error('Error fetching files:', error)
    } finally {
      setIsLoadingFiles(false)
    }
  }

  // Load folders and files when dialog opens
  useEffect(() => {
    if (isFileDialogOpen) {
      fetchFolders()
      fetchUserFiles()
    }
  }, [isFileDialogOpen])

  // Handle file selection from input
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const newUploads: FileUpload[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      uploading: false,
      progress: 0
    }))

    setFileUploads(prev => [...prev, ...newUploads])
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setIsFileDialogOpen(true)
      setFileUploads([])
      handleFileSelect(files)
    }
  }

  // Remove file from upload queue
  const removeFileUpload = (id: string) => {
    setFileUploads(prev => prev.filter(upload => upload.id !== id))
  }

  // Create new folder
  const createFolder = async () => {
    if (!newFolderName.trim()) return

    try {
      setIsCreatingFolder(true)
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newFolderName.trim() })
      })

      if (response.ok) {
        const folder = await response.json()
        setFolders(prev => [...prev, folder])
        setSelectedFolderId(folder.id)
        setNewFolderName('')
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to create folder')
      }
    } catch (error) {
      console.error('Error creating folder:', error)
      alert('Failed to create folder')
    } finally {
      setIsCreatingFolder(false)
    }
  }

  // Upload new files
  const uploadFiles = async () => {
    if (fileUploads.length === 0) return
    
    if (!selectedFolderId) {
      alert('Please select or create a folder first')
      return
    }

    setIsSendingFiles(true)
    setFileUploads(prev => prev.map(upload => ({ ...upload, uploading: true, progress: 0 })))

    const uploadedFiles: any[] = []
    let uploadError = false

    try {
      for (const upload of fileUploads) {
        try {
          setFileUploads(prev => prev.map(u => 
            u.id === upload.id ? { ...u, progress: 25 } : u
          ))

          const formData = new FormData()
          formData.append('file', upload.file)
          formData.append('folderId', selectedFolderId)

          setFileUploads(prev => prev.map(u => 
            u.id === upload.id ? { ...u, progress: 50 } : u
          ))

          const response = await fetch('/api/files', {
            method: 'POST',
            body: formData
          })
          
          if (response.ok) {
            const uploadedFile = await response.json()
            uploadedFiles.push({
              id: uploadedFile.id,
              name: upload.file.name,
              size: upload.file.size.toString(),
              mimeType: upload.file.type
            })
            
            setFileUploads(prev => prev.map(u => 
              u.id === upload.id 
                ? { ...u, uploading: false, progress: 100 }
                : u
            ))
          } else {
            const errorData = await response.json()
            setFileUploads(prev => prev.map(u => 
              u.id === upload.id 
                ? { ...u, uploading: false, error: errorData.error || 'Upload failed' }
                : u
            ))
          }
        } catch (error) {
          console.error('Error uploading file:', upload.file.name, error)
          setFileUploads(prev => prev.map(u => 
            u.id === upload.id 
              ? { ...u, uploading: false, error: 'Upload failed' }
              : u
          ))
          uploadError = true
        }
      }

      // Send files to chat if upload successful
      if (uploadedFiles.length > 0 && !uploadError && socket && selectedChatId) {
        // Create a styled message with file names
        const fileNames = uploadedFiles.map(file => file.name).join(', ')
        const fileList = uploadedFiles.map(file => `• ${file.name}`).join('\n')
        
        const content = uploadedFiles.length === 1 
          ? `📎 Shared file: ${fileNames}`
          : `📎 Shared ${uploadedFiles.length} files:\n${fileList}`
        
        const messageData = {
          chatId: selectedChatId,
          content,
          attachments: uploadedFiles
        }
        
        socket.emit("send_message", messageData)
        onFilesSent?.()
      }

      // Refresh data
      await Promise.all([fetchUserFiles(), fetchFolders()])

      // Close dialog on success
      if (!uploadError) {
        setTimeout(() => {
          setIsFileDialogOpen(false)
          setFileUploads([])
          setSelectedFolderId('')
        }, 1000)
      }

    } catch (error) {
      console.error('Error uploading files:', error)
      setFileUploads(prev => prev.map(upload => ({ ...upload, uploading: false, error: 'Upload failed' })))
    } finally {
      setIsSendingFiles(false)
    }
  }

  // Send existing files from documents
  const sendExistingFiles = async () => {
    if (selectedExistingFiles.length === 0 || !selectedChatId || !socket) return
    
    setIsSendingFiles(true)
    try {
      const filesToSend = userFiles.filter(file => selectedExistingFiles.includes(file.id))
      
      const attachments = filesToSend.map(file => ({
        id: file.id,
        name: file.originalName,
        size: file.size,
        mimeType: file.mimeType
      }))

      // Create a styled message with file names
      const fileNames = filesToSend.map(file => file.originalName).join(', ')
      const fileList = filesToSend.map(file => `• ${file.originalName}`).join('\n')
      
      const content = filesToSend.length === 1 
        ? `📎 Shared file: ${fileNames}`
        : `📎 Shared ${filesToSend.length} files:\n${fileList}`

      const messageData = {
        chatId: selectedChatId,
        content,
        attachments
      }

      socket.emit("send_message", messageData)
      onFilesSent?.()
      
      setSelectedExistingFiles([])
      setIsFileDialogOpen(false)
      
    } catch (error) {
      console.error('Error sending existing files:', error)
    } finally {
      setIsSendingFiles(false)
    }
  }

  // Toggle file selection for existing files
  const toggleFileSelection = (fileId: string) => {
    setSelectedExistingFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    )
  }

  // Utility functions
  const formatFileSize = (bytes: number | string) => {
    const numBytes = typeof bytes === 'string' ? parseInt(bytes) : bytes
    if (numBytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(numBytes) / Math.log(k))
    return parseFloat((numBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return (
      <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded text-red-600 text-xs font-bold">
        PDF
      </div>
    )
    if (mimeType.includes('image')) return '🖼️'
    if (mimeType.includes('document') || mimeType.includes('word')) return '📝'
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊'
    return '📎'
  }

  const FilePreview = ({ file, onRemove }: { file: File, onRemove: () => void }) => {
    return (
      <div className={styles.fileAttachmentPreview}>
        <div className={styles.fileIcon}>
          <FileText size={20} />
        </div>
        <div className={styles.fileInfo}>
          <div className={styles.fileName}>{file.name}</div>
          <div className={styles.fileSize}>{formatFileSize(file.size)}</div>
        </div>
        <button onClick={onRemove} className={styles.closeButton}>
          <X size={16} />
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Attach Button */}
      <button 
        className={styles.attachButton}
        onClick={() => setIsFileDialogOpen(true)}
      >
        <Paperclip size={20} />
      </button>

      {/* File Upload Dialog */}
      <Dialog open={isFileDialogOpen} onOpenChange={setIsFileDialogOpen}>
        <DialogContent className={styles.fileDialog}>
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="upload" className={styles.fileTabs}>
            <TabsList className={styles.fileTabsList}>
              <TabsTrigger value="upload" className={styles.fileTabsTrigger}>Upload from computer</TabsTrigger>
              <TabsTrigger value="documents" className={styles.fileTabsTrigger}>Documents in ReviseTax</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className={styles.fileTabsContent}>
              {/* Drag and Drop Area */}
              <div 
                className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {fileUploads.map(upload => (
                  <FilePreview
                    key={upload.id}
                    file={upload.file}
                    onRemove={() => removeFileUpload(upload.id)}
                  />
                ))}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className={styles.hiddenInput}
                />
                <div className={styles.uploadIcon}>
                  <Upload size={24} />
                </div>
                <div className={styles.dropText}>
                  <span>Drop files here or</span>
                  <button
                    className={styles.selectFileButton}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    browse
                  </button>
                </div>
                <div className={styles.supportedFiles}>
                  Supported files: PDF, DOC, DOCX, XLS, XLSX
                </div>
              </div>

              {/* File Previews */}
              {fileUploads.length > 0 && (
                <div className={styles.filePreviewContainer}>
                  {fileUploads.map((upload) => (
                    <div 
                      key={upload.id} 
                      className={`${styles.filePreview} ${
                        upload.uploading ? styles.uploading : 
                        upload.error ? styles.error : 
                        upload.progress === 100 ? styles.success : ''
                      }`}
                    >
                      <div className={styles.fileIcon}>
                        {upload.file.type.includes('pdf') ? (
                          <div className={styles.pdfIcon}>
                            <span>PDF</span>
                          </div>
                        ) : (
                          <FileText size={20} />
                        )}
                      </div>
                      <div className={styles.fileDetails}>
                        <div className={styles.fileName}>{upload.file.name}</div>
                        <div className={styles.fileSize}>{formatFileSize(upload.file.size)}</div>
                        {upload.uploading && (
                          <div className={styles.uploadProgress}>
                            <div className={styles.progressBar}>
                              <div 
                                className={styles.progressFill}
                                style={{ width: `${upload.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {upload.error && (
                          <div className={styles.uploadError}>{upload.error}</div>
                        )}
                      </div>
                      <button
                        className={styles.removeFileButton}
                        onClick={() => removeFileUpload(upload.id)}
                        disabled={upload.uploading}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Folder Selection */}
              {fileUploads.length > 0 && (
                <div className={styles.folderSelection}>
                  <label className={styles.folderLabel}>Select or Create Folder:</label>
                  <div className={styles.folderControls}>
                    <select
                      value={selectedFolderId}
                      onChange={(e) => setSelectedFolderId(e.target.value)}
                      className={styles.folderSelect}
                    >
                      <option value="">Select a folder...</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name} ({folder.fileCount} files)
                        </option>
                      ))}
                    </select>
                    <div className={styles.folderOr}>or</div>
                    <div className={styles.createFolderGroup}>
                      <Input
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="New folder name"
                        className={styles.folderNameInput}
                      />
                      <Button
                        onClick={createFolder}
                        disabled={!newFolderName.trim() || isCreatingFolder}
                        className={`${styles.createFolderButton} ${isCreatingFolder ? styles.creating : ''}`}
                      >
                        {isCreatingFolder ? 'Creating...' : 'Create'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Button */}
              {fileUploads.length > 0 && (
                <Button 
                  className={styles.sendFilesButton}
                  onClick={uploadFiles}
                  disabled={!selectedFolderId || fileUploads.some(f => f.uploading) || isSendingFiles}
                >
                  {isSendingFiles ? 'Sending Files...' : 'Send Files'}
                </Button>
              )}
            </TabsContent>

            <TabsContent value="documents" className={styles.fileTabsContent}>
              <div className={styles.documentsContainer}>
                {isLoadingFolders || isLoadingFiles ? (
                  <div className={styles.loadingContainer}>
                    <div className={styles.loadingSpinner}></div>
                    <p>Loading your documents...</p>
                  </div>
                ) : userFiles.length === 0 ? (
                  <div className={styles.noDocuments}>
                    <Folder className={styles.noDocumentsIcon} size={48} />
                    <p>No documents found. Upload some files first!</p>
                  </div>
                ) : (
                  <>
                    <div className={styles.documentsHeader}>
                      <h3>Select files to send</h3>
                      {selectedExistingFiles.length > 0 && (
                        <span className={styles.selectedCount}>
                          {selectedExistingFiles.length} selected
                        </span>
                      )}
                    </div>
                    
                    <div className={styles.filesList}>
                      {userFiles.map((file) => (
                        <div 
                          key={file.id} 
                          className={`${styles.documentFileItem} ${
                            selectedExistingFiles.includes(file.id) ? styles.selected : ''
                          }`}
                          onClick={() => toggleFileSelection(file.id)}
                        >
                          <div className={styles.fileCheckbox}>
                            <input 
                              type="checkbox" 
                              checked={selectedExistingFiles.includes(file.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleFileSelection(file.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className={styles.fileIcon}>
                            {getFileIcon(file.mimeType)}
                          </div>
                          <div className={styles.fileDetails}>
                            <div className={styles.fileName}>{file.originalName}</div>
                            <div className={styles.fileSize}>{formatFileSize(file.size)}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedExistingFiles.length > 0 && (
                      <Button 
                        className={styles.sendFilesButton}
                        onClick={sendExistingFiles}
                        disabled={isSendingFiles}
                      >
                        {isSendingFiles ? 'Sending Files...' : `Send ${selectedExistingFiles.length} File${selectedExistingFiles.length > 1 ? 's' : ''}`}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}
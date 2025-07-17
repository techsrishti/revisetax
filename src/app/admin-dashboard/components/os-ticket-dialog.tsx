"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, FileText, Paperclip } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface DocumentFile {
  id: string
  originalName: string
  storageName: string
  createdAt: Date
}

interface DocumentFolder {
  id: string
  name: string
  File: DocumentFile[]
}

interface OsTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: {
    name: string | null
    email: string | null
    phoneNumber: string
  }
  userDocs: DocumentFolder[]
  onSubmit: (data: {
    name: string
    email: string
    subject: string
    message: string
    attachments: { [key: string]: string }[]
  }) => Promise<void>
}

export default function OsTicketDialog({
  open,
  onOpenChange,
  user,
  userDocs,
  onSubmit
}: OsTicketDialogProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<{ [fileId: string]: boolean }>({})
  const [fileContents, setFileContents] = useState<{ [fileId: string]: string }>({})
  const [loadingFiles, setLoadingFiles] = useState<{ [fileId: string]: boolean }>({})

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSubject(`Support request from ${user.name || 'User'}`)
      setMessage(`User ${user.name || 'User'} (${user.email || 'No email'}) requires assistance with tax drafting.`)
      setSelectedFiles({})
      setFileContents({})
      setLoadingFiles({})
    }
  }, [open, user])

  const handleFileToggle = async (fileId: string, checked: boolean) => {
    setSelectedFiles(prev => ({ ...prev, [fileId]: checked }))
    
    if (checked && !fileContents[fileId]) {
      setLoadingFiles(prev => ({ ...prev, [fileId]: true }))
      try {
        // Get signed URL and convert to base64
        const response = await fetch(`/api/admin/files?fileId=${fileId}`)
        if (!response.ok) {
          throw new Error('Failed to get file URL')
        }
        
        const data = await response.json()
        if (data.success && data.downloadUrl) {
          // Fetch file content and convert to base64
          const fileResponse = await fetch(data.downloadUrl)
          const blob = await fileResponse.blob()
          const base64 = await blobToBase64(blob)
          setFileContents(prev => ({ ...prev, [fileId]: base64 }))
        }
      } catch (error) {
        console.error('Error processing file:', error)
        toast({
          title: "Error",
          description: "Failed to process file. Please try again.",
          variant: "destructive"
        })
        // Uncheck the file if processing failed
        setSelectedFiles(prev => ({ ...prev, [fileId]: false }))
      } finally {
        setLoadingFiles(prev => ({ ...prev, [fileId]: false }))
      }
    } else if (!checked) {
      // Remove from loading state if unchecked
      setLoadingFiles(prev => ({ ...prev, [fileId]: false }))
    }
  }

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Remove the data URL prefix to get just the base64 content
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Error",
        description: "Subject and message are required.",
        variant: "destructive"
      })
      return
    }

    // Check if any files are still loading
    const hasLoadingFiles = Object.values(loadingFiles).some(Boolean)
    if (hasLoadingFiles) {
      toast({
        title: "Please Wait",
        description: "Some files are still being processed. Please wait for them to complete.",
        variant: "destructive"
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Build attachments array
      const attachments: { [key: string]: string }[] = []
      
      for (const [fileId, isSelected] of Object.entries(selectedFiles)) {
        if (isSelected && fileContents[fileId]) {
          // Find the file to get its original name
          let fileName = ""
          for (const folder of userDocs) {
            const file = folder.File.find(f => f.id === fileId)
            if (file) {
              fileName = file.originalName
              break
            }
          }
          
          if (fileName) {
            attachments.push({
              [fileName]: `data:application/octet-stream;base64,${fileContents[fileId]}`
            })
          }
        }
      }

      await onSubmit({
        name: user.name || "N/A",
        email: user.email || "N/A",
        subject: subject.trim(),
        message: message.trim(),
        attachments
      })

      onOpenChange(false)
    } catch (error) {
      console.error('Error creating osTicket:', error)
      toast({
        title: "Error",
        description: "Failed to create osTicket. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const getAllFiles = () => {
    const files: { file: DocumentFile; folderName: string }[] = []
    userDocs.forEach(folder => {
      folder.File.forEach(file => {
        files.push({ file, folderName: folder.name })
      })
    })
    return files.sort((a, b) => new Date(b.file.createdAt).getTime() - new Date(a.file.createdAt).getTime())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5 flex-shrink-0" />
            Create osTicket
          </DialogTitle>
          <DialogDescription>
            Create a new support ticket for {user.name || 'User'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          {/* User Info (Read-only) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={user.name || "Not provided"}
                disabled
                className="bg-gray-100 w-full"
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={user.email || "Not provided"}
                disabled
                className="bg-gray-100 w-full"
              />
            </div>
          </div>

          {/* Subject */}
          <div className="min-w-0">
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter ticket subject"
              className="w-full"
            />
          </div>

          {/* Message */}
          <div className="min-w-0">
            <Label htmlFor="message">Message *</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter ticket message"
              rows={4}
              className="w-full resize-none"
            />
          </div>

          {/* File Attachments */}
          <div className="min-w-0">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4 flex-shrink-0" />
              Attachments ({Object.values(selectedFiles).filter(Boolean).length} selected)
            </Label>
            <div className="mt-2 max-h-48 overflow-y-auto overflow-x-hidden border rounded-md p-2 space-y-2">
              {getAllFiles().length > 0 ? (
                getAllFiles().map(({ file, folderName }) => (
                  <div key={file.id} className="flex items-center space-x-2 min-w-0">
                    <Checkbox
                      id={file.id}
                      checked={selectedFiles[file.id] || false}
                      onCheckedChange={(checked) => handleFileToggle(file.id, checked as boolean)}
                      className="flex-shrink-0"
                    />
                    <Label
                      htmlFor={file.id}
                      className="flex-1 text-sm cursor-pointer hover:text-primary min-w-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate min-w-0">{file.originalName}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">({folderName})</span>
                      </div>
                    </Label>
                    {selectedFiles[file.id] && fileContents[file.id] && (
                      <span className="text-xs text-green-600 flex-shrink-0">✓ Loaded</span>
                    )}
                    {selectedFiles[file.id] && loadingFiles[file.id] && (
                      <Loader2 className="h-3 w-3 animate-spin text-blue-600 flex-shrink-0" />
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No files available</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !subject.trim() || !message.trim() || Object.values(loadingFiles).some(Boolean)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : Object.values(loadingFiles).some(Boolean) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Files...
              </>
            ) : (
              "Create Ticket"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 
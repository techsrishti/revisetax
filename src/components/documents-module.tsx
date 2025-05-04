import { Button } from "@/components/ui/button"
import { ChevronRight, FileText, FolderIcon, Plus } from "lucide-react"
import styles from "./documents-module.module.css"

export default function DocumentsModule() {
  const folders = [
    { name: "Payslips", status: "Empty Folder" },
    { name: "Form 16s", status: "Empty Folder" },
    { name: "Invoices", status: "Empty Folder" },
  ]

  return (
    <div className={styles.container}>
      <div className={styles.pastFilingsCard}>
        <div className={styles.pastFilingsContent}>
          <div className={styles.pastFilingsIcon}>
            <FileText className={styles.fileIcon} />
          </div>
          <div>
            <h3 className={styles.pastFilingsTitle}>Access Past Filings</h3>
            <p className={styles.pastFilingsDescription}>
              This is a default folder for past filings automatically uploaded by ReviseTax.
            </p>
          </div>
        </div>
        <ChevronRight className={styles.chevronIcon} />
      </div>

      <div className={styles.documentsHeader}>
        <h2 className={styles.documentsTitle}>Your Documents</h2>
        <div className={styles.buttonGroup}>
          <Button variant="outline" className={styles.newFolderButton}>
            <Plus className={styles.buttonIcon} /> New Folder
          </Button>
          <Button className={styles.uploadButton}>Upload</Button>
        </div>
      </div>

      <div className={styles.foldersList}>
        {folders.map((folder, index) => (
          <div key={index} className={styles.folderItem}>
            <div className={styles.folderInfo}>
              <FolderIcon className={styles.folderIcon} />
              <span className={styles.folderName}>{folder.name}</span>
            </div>
            <span className={styles.folderStatus}>{folder.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

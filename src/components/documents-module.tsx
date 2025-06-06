import React from "react";
import styles from "./documents-module.module.css";

export default function DocumentsModule() {
  return (
    <div className={styles.container}>
      <div className={styles.comingSoonCard}>
        <h2 className={styles.title}>Coming Soon</h2>
        <p className={styles.description}>
          The documents module is currently under development and will be available soon.
        </p>
      </div>
    </div>
  );
}

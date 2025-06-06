import React from "react";
import styles from "./plans-module.module.css";

export default function PlansModule() {
  return (
    <div className={styles.container}>
      <div className={styles.comingSoonCard}>
        <h2 className={styles.title}>Coming Soon</h2>
        <p className={styles.description}>
          The plans module is currently under development and will be available soon.
        </p>
      </div>
    </div>
  );
}

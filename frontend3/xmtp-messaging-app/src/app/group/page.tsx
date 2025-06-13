'use client';

import React from 'react';
import { MessagingGroup } from '../components/MessagingGroup';
import { Navbar } from '../components/Navbar';
import styles from './group.module.css';

export default function LearnPage() {
  return (
    <>
      <Navbar />
      <main className={styles.mainBg}>
        <div className={styles.flexRow}>
          <div className={styles.leftColumn}>
            <MessagingGroup />
          </div>
        </div>
      </main>
    </>
  );
} 